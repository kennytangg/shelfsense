"""Check actual production proxy upload limit; adds two SH-01 readings."""

import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = os.getenv("SHELFSENSE_WEB_URL", "http://127.0.0.1:3000")
with httpx.Client(base_url=BASE, timeout=60) as client:
    if "--verify-restart" in sys.argv:
        before = json.loads(Path("/tmp/shelfsense-before-restart.json").read_text())
        after = {
            "shelves": client.get("/api/shelves").json(),
            "alerts": client.get("/api/alerts").json(),
            "dashboard": client.get("/api/dashboard").json(),
        }
        assert before == after, "Persisted state changed across restart"
        for shelf in after["shelves"]:
            if shelf["current"]:
                assert client.get(shelf["current"]["input"]["url"]).status_code == 200
        print(
            "PASS: shelves, readings, diagnostics, alerts and dashboard are identical after all service restarts; media remains accessible."
        )
        sys.exit(0)
    shelves = client.get("/api/shelves").json()
    shelf = next(s for s in shelves if s["identifier"] == "SH-01" and s["demo"])
    content = (ROOT / "assets/demo/zone-01/full.png").read_bytes()
    # PNG decoders permit trailing bytes; decoded image remains the same.
    padded = content + b"\0" * (10 * 1024 * 1024 - len(content))
    path = f"/api/shelves/{shelf['id']}/analyses"
    accepted = client.post(path, files={"file": ("limit.png", padded, "image/png")})
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["classification"] == "Full"
    rejected = client.post(
        path, files={"file": ("oversize.png", padded + b"x", "image/png")}
    )
    assert rejected.status_code == 413, rejected.text
    detail = client.get(f"/api/shelves/{shelf['id']}").json()
    assert detail["current"]["id"] == accepted.json()["id"] and detail["last_error"]
    final = client.post(
        f"/api/shelves/{shelf['id']}/demo-analysis", json={"sample": "full"}
    )
    assert final.status_code == 201
    for role in ["input", "reference", "overlay", "mask"]:
        response = client.get(final.json()[role]["url"])
        assert response.status_code == 200 and response.headers[
            "content-type"
        ].startswith("image/png")
    assert client.get("/media/../.env").status_code == 404
    snapshot = {
        "shelves": client.get("/api/shelves").json(),
        "alerts": client.get("/api/alerts").json(),
        "dashboard": client.get("/api/dashboard").json(),
    }
    Path("/tmp/shelfsense-before-restart.json").write_text(
        json.dumps(snapshot, sort_keys=True)
    )
    print(
        "PASS: exactly 10 MiB plus multipart accepted; 10 MiB + 1 rejected by FastAPI; valid reading preserved; all media roles forwarded; restart snapshot saved."
    )
