"""Verify optional features using a disposable schema in TEST_DATABASE_URL.

Requires frontend dependencies and Chromium. Builds into .next-feature-smoke.
Does not seed, reset, or modify the application database.
"""

import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from playwright.sync_api import expect, sync_playwright
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / ".venv/bin/python"
load_dotenv(ROOT / "backend/.env")


def wait_for(predicate, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except (httpx.HTTPError, ConnectionError):
            pass
        time.sleep(0.2)
    raise AssertionError("Timed out waiting for optional-feature verification.")


def available_port(start):
    for port in range(start, start + 20):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
                return port
            except OSError:
                pass
    raise RuntimeError("No free local web port.")


def main():
    target = make_url(os.environ["TEST_DATABASE_URL"])
    application = make_url(os.environ["DATABASE_URL"])
    if (
        target.get_backend_name() != "postgresql"
        or not target.database
        or target.database == application.database
    ):
        raise RuntimeError("A separate PostgreSQL test database is required.")
    api_port = available_port(8000)
    web_port = available_port(3000)
    base = f"http://127.0.0.1:{web_port}"
    schema = "feature_" + uuid4().hex
    admin = create_engine(target)
    processes = []
    next_env_path = ROOT / "frontend/next-env.d.ts"
    next_env_before = next_env_path.read_text()
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        with tempfile.TemporaryDirectory(prefix="shelfsense-features-") as temporary:
            folder = Path(temporary)
            env = {
                **os.environ,
                "DATABASE_URL": target.set(
                    query={**target.query, "options": f"-csearch_path={schema}"}
                ).render_as_string(hide_password=False),
                "MEDIA_DIR": str(folder / "media"),
                "BACKEND_URL": f"http://127.0.0.1:{api_port}",
                "NEXT_DIST_DIR": ".next-feature-smoke",
            }
            log_path = Path("/tmp/shelfsense-feature-smoke.log")
            with log_path.open("w") as log:
                for args in [
                    ["npm", "run", "build", "--prefix", "frontend"],
                    [
                        str(PYTHON),
                        "-m",
                        "alembic",
                        "-c",
                        "backend/alembic.ini",
                        "upgrade",
                        "head",
                    ],
                    [str(ROOT / ".venv/bin/shelfsense"), "seed"],
                ]:
                    subprocess.run(
                        args, cwd=ROOT, env=env, stdout=log, stderr=log, check=True
                    )

                def start(args, cwd=ROOT):
                    proc = subprocess.Popen(
                        args, cwd=cwd, env=env, stdout=log, stderr=log
                    )
                    processes.append(proc)
                    return proc

                def stop(proc):
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)

                start(
                    [
                        str(PYTHON),
                        "-m",
                        "uvicorn",
                        "shelfsense.api:app",
                        "--port",
                        str(api_port),
                    ]
                )
                start(
                    [
                        str(ROOT / "frontend/node_modules/.bin/next"),
                        "start",
                        "--hostname",
                        "127.0.0.1",
                        "--port",
                        str(web_port),
                    ],
                    cwd=ROOT / "frontend",
                )
                wait_for(lambda: httpx.get(base + "/api/health").status_code == 200)
                shelf = next(
                    s
                    for s in httpx.get(base + "/api/shelves").json()
                    if s["identifier"] == "SH-01"
                )
                shelf_id = shelf["id"]
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page(viewport={"width": 1440, "height": 1100})
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(f"{base}/shelves/{shelf_id}")
                    page.get_by_role("button", name="Enable placement review").click()
                    page.get_by_role("button", name="Use correct demo layout").click()
                    expect(page.locator("dialog")).to_have_count(0)
                    expect(page.locator(".reading-panel .badge")).to_have_text(
                        "Not checked"
                    )

                    def sample(value, placement):
                        page.get_by_label("Sample image").select_option(value)
                        page.get_by_role(
                            "button", name="Run demo sample", exact=True
                        ).click()
                        expect(page.locator("#demo [role=status]")).to_contain_text(
                            placement, timeout=30000
                        )
                        expect(page.locator(".placement-panel .badge")).to_have_text(
                            placement
                        )

                    sample("low", "Matches reference")
                    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
                    sample("misplaced", "Placement review")
                    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
                    page.get_by_label("Detection overlay").check()
                    page.get_by_text(
                        "Expected layout for this check", exact=True
                    ).click()
                    expect(
                        page.get_by_alt_text("Expected shelf layout for this analysis")
                    ).to_be_visible()
                    page.screenshot(
                        path=str(ROOT / "docs/placement-desktop.png"), full_page=True
                    )
                    page.reload()
                    expect(page.locator(".placement-panel .badge")).to_have_text(
                        "Placement review"
                    )
                    page.goto(base)
                    page.get_by_role(
                        "button", name="Placement review", exact=False
                    ).first.click()
                    expect(page.locator(".shelf-card")).to_have_count(1)
                    page.screenshot(
                        path=str(ROOT / "docs/placement-dashboard.png"), full_page=True
                    )
                    page.set_viewport_size({"width": 390, "height": 844})
                    page.goto(f"{base}/shelves/{shelf_id}")
                    expect(page.locator(".placement-panel .badge")).to_have_text(
                        "Placement review"
                    )
                    assert page.evaluate(
                        "document.documentElement.scrollWidth <= innerWidth"
                    )
                    page.screenshot(
                        path=str(ROOT / "docs/placement-mobile.png"), full_page=True
                    )
                    # Exercise a genuine upload and disabling the expected layout.
                    page.get_by_role(
                        "button", name="Expected layout", exact=True
                    ).click()
                    page.get_by_label("Shelf photo").set_input_files(
                        ROOT / "assets/demo/zone-01/full.png"
                    )
                    page.get_by_role(
                        "button", name="Save expected layout", exact=True
                    ).click()
                    expect(page.locator("dialog")).to_have_count(0)
                    sample("low", "Matches reference")
                    page.get_by_role(
                        "button", name="Expected layout", exact=True
                    ).click()
                    page.get_by_role(
                        "button", name="Disable placement review", exact=True
                    ).click()
                    expect(page.locator("dialog")).to_have_count(0)
                    expect(
                        page.get_by_role("button", name="Enable placement review")
                    ).to_be_visible()
                    assert not errors, errors
                    browser.close()

                inbox = folder / "inbox"
                zone = inbox / "SH-01"
                zone.mkdir(parents=True)
                history_url = f"{base}/api/shelves/{shelf_id}/analyses"
                before = len(httpx.get(history_url).json())
                source = zone / "capture.png"
                source.write_bytes((ROOT / "assets/demo/zone-01/low.png").read_bytes())
                args = [
                    str(ROOT / ".venv/bin/shelfsense"),
                    "watch",
                    "--folder",
                    str(inbox),
                    "--interval",
                    "1",
                ]
                worker = start(args)
                wait_for(lambda: len(httpx.get(history_url).json()) == before + 1)
                assert (
                    httpx.get(f"{base}/api/shelves/{shelf_id}").json()["status"]
                    == "Low"
                )
                stop(worker)
                worker = start(args)
                time.sleep(3)
                assert worker.poll() is None
                assert len(httpx.get(history_url).json()) == before + 1
                assert source.exists()
                stop(worker)
                print(
                    "PASS: production UI/proxy, placement setup/review, low-stock separation, "
                    "history refresh, dashboard filtering, desktop/mobile screenshots, "
                    "actual folder worker ingestion and restart deduplication."
                )
    finally:
        for proc in reversed(processes):
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
        # Next generates imports for the verification build. Restore the user's
        # existing build reference after the isolated servers have stopped.
        if ".next-feature-smoke/" in next_env_path.read_text():
            next_env_path.write_text(next_env_before)
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


if __name__ == "__main__":
    main()
