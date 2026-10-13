"""Real PostgreSQL tests. Never run DDL without an explicit isolated database URL."""

import io
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from shelfsense import db, service
from shelfsense.detector import decode
from shelfsense.fixtures import ROOT, ROI_DATA, generate
from shelfsense.models import Alert, Analysis, ImageAsset, IngestionReceipt, Shelf, Store
from shelfsense.schemas import Calibration


@pytest.fixture
def client(monkeypatch, tmp_path):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    target, app = make_url(url), make_url(db.DATABASE_URL)
    if (
        target.get_backend_name() != "postgresql"
        or not target.database
        or target.database == app.database
    ):
        pytest.fail("TEST_DATABASE_URL must use a separate PostgreSQL database name")
    schema = "test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(db, "Session", sessionmaker(engine, expire_on_commit=False))
    monkeypatch.setattr(db, "MEDIA_ROOT", tmp_path)
    try:
        command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
        with db.Session.begin() as session:
            session.add(Store(name="Test store", demo=True))
        generate()
        from shelfsense.api import app as application

        with TestClient(application) as test_client:
            yield test_client
    finally:
        engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def create(client, identifier="TEST-01"):
    result = client.post(
        "/api/shelves", json={"identifier": identifier, "name": "Test shelf", "location": "Aisle 1"}
    )
    assert result.status_code == 201, result.text
    return result.json()["id"]


def calibration(client, shelf_id):
    response = client.post(
        f"/api/shelves/{shelf_id}/calibration",
        files={
            "file": ("reference.png", (ROOT / "zone-01/reference.png").read_bytes(), "image/png")
        },
        data={"config": Calibration(roi=ROI_DATA).model_dump_json()},
    )
    assert response.status_code == 200, response.text


def upload(client, shelf_id, variant):
    response = client.post(
        f"/api/shelves/{shelf_id}/analyses",
        files={"file": ("photo.png", (ROOT / f"zone-01/{variant}.png").read_bytes(), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def detail(client, shelf_id):
    return client.get(f"/api/shelves/{shelf_id}").json()


def test_complete_persisted_alert_lifecycle(client):
    shelf_id = create(client)
    assert detail(client, shelf_id)["status"] == "Needs setup"
    calibration(client, shelf_id)
    assert detail(client, shelf_id)["status"] == "Not checked"
    low = upload(client, shelf_id, "low")
    assert low["classification"] == "Low"
    assert low["input"]["url"].startswith("/media/") and low["mask"] and low["overlay"]
    alert = detail(client, shelf_id)["active_alert"]
    upload(client, shelf_id, "empty")
    assert detail(client, shelf_id)["active_alert"]["id"] == alert["id"]
    assert (
        client.patch(f"/api/alerts/{alert['id']}", json={"action": "acknowledge"}).status_code
        == 200
    )
    assert detail(client, shelf_id)["status"] == "Empty"
    assert detail(client, shelf_id)["active_alert"]["state"] == "Acknowledged"
    client.patch(f"/api/alerts/{alert['id']}", json={"action": "report_restocked"})
    state = detail(client, shelf_id)
    assert (
        state["awaiting_verification"] and state["status"] == "Empty" and not state["active_alert"]
    )
    upload(client, shelf_id, "low")
    next_alert = detail(client, shelf_id)["active_alert"]
    assert next_alert["id"] != alert["id"]
    upload(client, shelf_id, "full")
    db.engine.dispose()  # Fresh connections must return persisted state.
    state = detail(client, shelf_id)
    assert (
        state["status"] == "Full"
        and not state["active_alert"]
        and not state["awaiting_verification"]
    )
    alerts = client.get("/api/alerts").json()
    assert {a["resolution_reason"] for a in alerts} == {"Verified full", "Staff reported restocked"}
    counts = client.get("/api/dashboard").json()
    assert counts["total"] == sum(counts[key] for key in ["full", "low", "empty", "unavailable"])
    assert len(client.get(f"/api/shelves/{shelf_id}/analyses").json()) == 4
    assert client.get(f"/api/images/{low['input']['id']}").json()["url"] == low["input"]["url"]


def test_failed_attempts_preserve_valid_reading_and_alert(client):
    shelf_id = create(client)
    calibration(client, shelf_id)
    valid = upload(client, shelf_id, "low")
    alert_id = detail(client, shelf_id)["active_alert"]["id"]
    for data, expected in [(b"broken image", 422), (b"x" * (10 * 1024 * 1024 + 1), 413)]:
        response = client.post(f"/api/shelves/{shelf_id}/analyses", files={"file": ("x.png", data)})
        assert response.status_code == expected
        current = detail(client, shelf_id)
        assert current["current"]["id"] == valid["id"] and current["last_error"]
    review = upload(client, shelf_id, "mismatched")
    assert review["outcome"] == "Review required" and review["classification"] is None
    current = detail(client, shelf_id)
    assert current["current"]["id"] == valid["id"] and current["active_alert"]["id"] == alert_id


def test_missing_setup_and_recalibration(client):
    shelf_id = create(client)
    result = upload(client, shelf_id, "low")
    assert result["outcome"] == "Needs setup" and result["classification"] is None
    assert not detail(client, shelf_id)["active_alert"]
    calibration(client, shelf_id)
    valid = upload(client, shelf_id, "full")
    calibration(client, shelf_id)
    state = detail(client, shelf_id)
    assert state["status"] == "Not checked" and state["current"] is None
    history = client.get(f"/api/shelves/{shelf_id}/analyses").json()
    assert any(
        a["id"] == valid["id"] and a["reference"]["id"] != state["reference"]["id"] for a in history
    )


def test_postgres_constraints_and_ownership(client):
    shelf_id = create(client)
    second_id = create(client, "TEST-02")
    calibration(client, shelf_id)
    low = upload(client, shelf_id, "low")
    with db.Session.begin() as session:
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(Alert(shelf_id=shelf_id, analysis_id=low["id"], severity="Low"))
                session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(Alert(shelf_id=second_id, analysis_id=low["id"], severity="Low"))
                session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.get(Shelf, second_id).reference_image_id = low["reference"]["id"]
                session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.get(Analysis, low["id"]).occupancy_ratio = 1.5
                session.flush()
    assert (
        client.post(
            "/api/shelves", json={"identifier": "TEST-01", "name": "Duplicate", "location": "A"}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/alerts/{detail(client, shelf_id)['active_alert']['id']}",
            json={"action": "invent_full"},
        ).status_code
        == 422
    )


def test_parallel_low_checks_have_one_active_alert(client):
    shelf_id = create(client)
    calibration(client, shelf_id)
    image = decode((ROOT / "zone-01/low.png").read_bytes())
    with ThreadPoolExecutor(max_workers=3) as executor:
        ids = list(executor.map(lambda _: service.analyze(shelf_id, image), range(3)))
    assert len(set(ids)) == 3
    assert len(client.get("/api/alerts").json()) == 1


def test_calibration_race_and_failed_persistence_clean_up_files(client, monkeypatch):
    shelf_id = create(client)
    calibration(client, shelf_id)
    original = service.detect
    image = decode((ROOT / "zone-01/low.png").read_bytes())
    before = set(db.MEDIA_ROOT.iterdir())

    def race(*args):
        result = original(*args)
        with db.Session.begin() as session:
            session.get(Shelf, shelf_id).calibration_version += 1
        return result

    monkeypatch.setattr(service, "detect", race)
    response = client.post(
        f"/api/shelves/{shelf_id}/analyses",
        files={"file": ("photo.png", (ROOT / "zone-01/low.png").read_bytes())},
    )
    assert response.status_code == 409
    assert set(db.MEDIA_ROOT.iterdir()) == before
    assert detail(client, shelf_id)["current"] is None
    monkeypatch.setattr(service, "detect", original)

    def fail(*args):
        raise RuntimeError("simulated transaction failure")

    monkeypatch.setattr(service, "update_alert", fail)
    with pytest.raises(RuntimeError):
        service.analyze(shelf_id, image)
    assert set(db.MEDIA_ROOT.iterdir()) == before
    assert client.get(f"/api/shelves/{shelf_id}/analyses").json() == []


def test_invalid_roi_reference_and_unknown_routes(client):
    shelf_id = create(client)
    stream = io.BytesIO()
    Image.new("RGB", (200, 200), "black").save(stream, format="PNG")
    response = client.post(
        f"/api/shelves/{shelf_id}/calibration",
        files={"file": ("black.png", stream.getvalue())},
        data={"config": Calibration(roi=ROI_DATA).model_dump_json()},
    )
    assert response.status_code == 422
    response = client.post(
        f"/api/shelves/{shelf_id}/calibration",
        files={"file": ("a.png", b"bad")},
        data={"config": '{"roi":{"x":0.8,"width":0.8}}'},
    )
    assert response.status_code == 422
    assert client.get("/api/shelves/missing").status_code == 404
    assert client.get("/api/images/missing").status_code == 404
    assert (
        client.post(
            f"/api/shelves/{shelf_id}/demo-analysis", json={"sample": "../../etc/passwd"}
        ).status_code
        == 422
    )


def test_seed_idempotence_and_reset_preserves_user_uploads(client):
    from shelfsense.cli import reset, seed

    seed()
    records = client.get("/api/shelves").json()
    assert len(records) == 12
    counts = client.get("/api/dashboard").json()
    assert [counts[k] for k in ["full", "low", "empty"]] == [4, 4, 4]
    shelf_id = next(s["id"] for s in records if s["identifier"] == "SH-01")
    upload(client, shelf_id, "low")
    before = detail(client, shelf_id)
    seed()
    assert detail(client, shelf_id)["current"]["id"] == before["current"]["id"]
    reset()
    assert len(client.get("/api/shelves").json()) == 1
    assert detail(client, shelf_id)["current"]["id"] == before["current"]["id"]
    with db.Session() as session:
        for asset in session.scalars(select(ImageAsset)):
            assert (db.MEDIA_ROOT / asset.storage_key).exists()


def placement_setup(client, shelf_id, variant="full", version=None):
    return client.post(
        f"/api/shelves/{shelf_id}/placement",
        files={"file": ("expected.png", (ROOT / f"zone-01/{variant}.png").read_bytes())},
        data={
            "config": "{}",
            "calibration_version": version or detail(client, shelf_id)["calibration_version"],
        },
    )


def test_placement_is_separate_from_stock_and_retains_historical_reference(client):
    shelf_id = create(client)
    calibration(client, shelf_id)
    original = upload(client, shelf_id, "low")
    alert_id = detail(client, shelf_id)["active_alert"]["id"]
    assert placement_setup(client, shelf_id, "low").status_code == 422
    assert detail(client, shelf_id)["current"]["id"] == original["id"]
    setup = placement_setup(client, shelf_id)
    assert setup.status_code == 200, setup.text
    assert setup.json()["current"] is None
    expected_id = setup.json()["placement_reference"]["id"]
    assert detail(client, shelf_id)["active_alert"]["id"] == alert_id
    low = upload(client, shelf_id, "low")
    assert low["placement_result"]["status"] == "Matches reference"
    assert detail(client, shelf_id)["active_alert"]["id"] == alert_id
    wrong = upload(client, shelf_id, "misplaced")
    assert wrong["classification"] == "Full"
    assert wrong["placement_result"]["status"] == "Placement review"
    assert wrong["placement_reference"]["id"] == expected_id
    assert wrong["snapshot"]["placement_settings"]["mismatch_threshold"] == 0.18
    assert detail(client, shelf_id)["active_alert"] is None
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["full"] == 1 and dashboard["placement_review"] == 1
    assert dashboard["attention"][0]["id"] == shelf_id
    assert len(client.get("/api/shelves?status=Placement%20review").json()) == 1
    review = upload(client, shelf_id, "mismatched")
    assert review["placement_result"]["status"] == "Not enough evidence"
    assert detail(client, shelf_id)["current"]["id"] == wrong["id"]
    calibration(client, shelf_id)
    assert detail(client, shelf_id)["placement_reference"] is None
    history = client.get(f"/api/shelves/{shelf_id}/analyses").json()
    old = next(a for a in history if a["id"] == wrong["id"])
    assert old["placement_reference"]["id"] == expected_id
    assert upload(client, shelf_id, "full")["placement_result"] is None


def test_placement_ownership_disable_and_stale_configuration(client, monkeypatch):
    shelf_id = create(client)
    other_id = create(client, "TEST-02")
    calibration(client, shelf_id)
    before = set(db.MEDIA_ROOT.iterdir())
    assert placement_setup(client, shelf_id, version=999).status_code == 409
    assert set(db.MEDIA_ROOT.iterdir()) == before
    assert placement_setup(client, shelf_id).status_code == 200
    reference_id = detail(client, shelf_id)["placement_reference"]["id"]
    with db.Session.begin() as session:
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.get(Shelf, other_id).placement_reference_image_id = reference_id
                session.flush()
    reading = upload(client, shelf_id, "misplaced")
    calibration(client, other_id)
    other_setup = placement_setup(client, other_id)
    assert other_setup.status_code == 200
    other_reference_id = other_setup.json()["placement_reference"]["id"]
    with db.Session.begin() as session:
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.get(
                    Analysis, reading["id"]
                ).placement_reference_image_id = other_reference_id
                session.flush()
    before = set(db.MEDIA_ROOT.iterdir())
    original = service.detect

    def race(*args):
        result = original(*args)
        with db.Session.begin() as session:
            session.get(Shelf, shelf_id).calibration_version += 1
        return result

    monkeypatch.setattr(service, "detect", race)
    assert placement_setup(client, shelf_id).status_code == 409
    assert set(db.MEDIA_ROOT.iterdir()) == before
    assert detail(client, shelf_id)["placement_reference"]["id"] == reference_id
    monkeypatch.setattr(service, "detect", original)
    response = client.delete(f"/api/shelves/{shelf_id}/placement")
    assert response.status_code == 200 and response.json()["placement_reference"] is None
    history = client.get(f"/api/shelves/{shelf_id}/analyses").json()
    assert history[0]["placement_reference"]["id"] == reference_id


def test_monitored_analysis_deduplicates_concurrent_workers_and_rolls_back(client, monkeypatch):
    import hashlib

    shelf_id = create(client)
    calibration(client, shelf_id)
    data = (ROOT / "zone-01/low.png").read_bytes()
    image, digest = decode(data), hashlib.sha256(data).hexdigest()
    with ThreadPoolExecutor(max_workers=3) as executor:
        ids = list(
            executor.map(
                lambda _: service.analyze(shelf_id, image, ingestion_digest=digest), range(3)
            )
        )
    assert len(set(ids)) == 1
    assert len(list(db.MEDIA_ROOT.iterdir())) == 4  # Reference plus input, overlay, mask.
    assert len(client.get(f"/api/shelves/{shelf_id}/analyses").json()) == 1
    with db.Session() as session:
        receipt = session.get(IngestionReceipt, (shelf_id, 1, digest))
        assert receipt.analysis_id == ids[0]
    calibration(client, shelf_id)
    new_id = service.analyze(shelf_id, image, ingestion_digest=digest)
    assert new_id != ids[0]
    before = set(db.MEDIA_ROOT.iterdir())

    def fail(*args):
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(service, "update_alert", fail)
    with pytest.raises(RuntimeError):
        service.analyze(shelf_id, image, ingestion_digest="a" * 64)
    assert set(db.MEDIA_ROOT.iterdir()) == before
    with db.Session() as session:
        assert session.get(IngestionReceipt, (shelf_id, 2, "a" * 64)) is None


def test_folder_monitor_stability_restart_invalid_bytes_and_recalibration(client, tmp_path):
    from shelfsense.monitor import FolderMonitor

    shelf_id = create(client)
    calibration(client, shelf_id)
    # Use a sibling directory, never the managed media directory.
    folder = tmp_path.parent / f"inbox-{uuid4().hex}"
    zone = folder / "TEST-01"
    zone.mkdir(parents=True)
    source = zone / "capture.png"
    source.write_bytes(b"partially written")
    worker = FolderMonitor(folder)
    assert worker.scan() == []
    source.write_bytes((ROOT / "zone-01/low.png").read_bytes())
    assert worker.scan() == []  # Changed since the previous scan.
    assert len(worker.scan()) == 1
    assert worker.scan() == [] and source.exists()
    restarted = FolderMonitor(folder)
    assert restarted.scan() == [] and restarted.scan() == []
    calibration(client, shelf_id)
    assert len(restarted.scan()) == 1
    bad = zone / "broken.jpg"
    bad.write_bytes(b"bad")
    assert restarted.scan() == [] and restarted.scan() == []
    assert detail(client, shelf_id)["last_error"]
    valid_id = detail(client, shelf_id)["current"]["id"]
    assert restarted.scan() == []
    assert detail(client, shelf_id)["current"]["id"] == valid_id
    bad.write_bytes((ROOT / "zone-01/full.png").read_bytes())
    assert restarted.scan() == []
    assert len(restarted.scan()) == 1
    assert detail(client, shelf_id)["status"] == "Full"
    assert bad.exists() and source.exists()
    with pytest.raises(ValueError):
        FolderMonitor(db.MEDIA_ROOT)
