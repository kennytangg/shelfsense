"""Exercise the production UI against isolated browser API fixtures.

Start `npm run start --prefix frontend -- --port 3015` after a build, then run
`PLAYWRIGHT_BROWSERS_PATH=/tmp/shelfsense-browsers .venv/bin/python scripts/ui_smoke.py`.
No application API or database is accessed. Screenshots go to /tmp/shelfsense-ui.
"""

import copy
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.getenv("SHELFSENSE_WEB_URL", "http://127.0.0.1:3015")
OUTPUT = Path("/tmp/shelfsense-ui")
OUTPUT.mkdir(exist_ok=True)
SETTINGS = {
    "difference_threshold": 30,
    "processing_width": 640,
    "morphology_size": 3,
    "min_component_pixels": 30,
    "empty_threshold": 0.15,
    "full_threshold": 0.6,
}


def asset(sample):
    return {
        "id": sample,
        "url": f"/media/{sample}.png",
        "width": 640,
        "height": 400,
        "role": sample,
    }


def analysis(index, status):
    sample = status.lower()
    return {
        "id": f"analysis-{index}",
        "shelf_id": str(index),
        "outcome": "Valid",
        "classification": status,
        "occupancy_ratio": {"Full": 0.84, "Low": 0.34, "Empty": 0.02}[status],
        "warnings": [],
        "algorithm_version": "test-fixture",
        "calibration_version": 1,
        "snapshot": {"roi": None, "settings": SETTINGS, "placement_settings": None},
        "duration_ms": 42,
        "created_at": "2026-10-13T09:00:00Z",
        "input": asset(sample),
        "reference": asset("reference"),
        "overlay": asset(sample),
        "mask": asset("reference"),
        "placement_reference": None,
        "placement_result": None,
    }


def fixtures():
    shelves = []
    for index, (name, status, location) in enumerate(
        [
            ("Breakfast cereals", "Low", "01 · Breakfast"),
            ("Oat & nut bars", "Empty", "01 · Breakfast"),
            ("Coffee & tea", "Full", "02 · Beverages"),
            ("Pasta & grains", "Full", "03 · Pantry"),
            ("Everyday essentials", "Needs setup", "04 · Household"),
            ("Granola", "Not checked", "01 · Breakfast"),
        ],
        1,
    ):
        current = (
            analysis(index, status) if status in ("Full", "Low", "Empty") else None
        )
        alert = (
            {
                "id": f"alert-{index}",
                "shelf_id": str(index),
                "severity": status,
                "state": "Open",
                "first_detected_at": "2026-10-13T09:00:00Z",
                "last_detected_at": "2026-10-13T09:00:00Z",
                "resolution_reason": None,
                "resolved_at": None,
                "occupancy_ratio": current["occupancy_ratio"],
                "identifier": f"SH-{index:02d}",
                "location": location,
            }
            if status in ("Low", "Empty")
            else None
        )
        shelves.append(
            {
                "id": str(index),
                "identifier": f"SH-{index:02d}",
                "name": name,
                "location": location,
                "category": "Groceries",
                "demo": True,
                "calibration_version": 0 if status == "Needs setup" else 1,
                "roi": {"x": 0.05, "y": 0.1, "width": 0.9, "height": 0.8},
                "settings": SETTINGS,
                "reference": None if status == "Needs setup" else asset("reference"),
                "placement_reference": None,
                "placement_settings": {
                    "appearance_distance": 30,
                    "mismatch_threshold": 0.2,
                    "min_shared_ratio": 0.1,
                },
                "status": status,
                "current": current,
                "latest_attempt": current,
                "active_alert": alert,
                "awaiting_verification": False,
                "reported_restocked_at": None,
                "last_error": None,
                "last_attempt_at": None,
            }
        )
    shelves[3]["current"]["placement_result"] = {
        "status": "Placement review",
        "mismatch_ratio": 0.3,
        "compared_ratio": 0.8,
        "reason": "Inspect packaging differences.",
        "algorithm_version": "test-fixture",
    }
    return shelves


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1050})
    shelves = fixtures()
    old_reading = analysis(100, "Full")
    calls = []
    mode = {"error": False, "empty": False}
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def api_route(route):
        path = urlparse(route.request.url).path.removeprefix("/api/")
        method = route.request.method
        calls.append((method, path))
        if mode["error"]:
            route.fulfill(
                status=503, json={"detail": "Shelf checks are temporarily unavailable."}
            )
            return
        if path == "store":
            result = {"name": "Neighborhood market", "location": "Jakarta · Store 01"}
        elif path == "dashboard":
            result = {
                "total": len(shelves),
                "full": 2,
                "low": 1,
                "empty": 1,
                "unavailable": 2,
                "placement_review": 1,
                "attention": [shelves[i] for i in (1, 0, 3)],
            }
            if mode["empty"]:
                result = {**{k: 0 for k in result if k != "attention"}, "attention": []}
        elif path == "shelves":
            if method == "POST":
                data = route.request.post_data_json
                result = {**copy.deepcopy(shelves[4]), **data, "id": "7"}
                shelves.append(result)
            else:
                result = [] if mode["empty"] else shelves
        elif path == "alerts":
            result = [s["active_alert"] for s in shelves if s["active_alert"]]
        elif path.startswith("alerts/"):
            target = next(
                s
                for s in shelves
                if s["active_alert"] and s["active_alert"]["id"] == path.split("/")[1]
            )
            result = target["active_alert"]
            if route.request.post_data_json["action"] == "acknowledge":
                result["state"] = "Acknowledged"
            else:
                result["state"] = "Resolved"
                target["active_alert"] = None
                target["awaiting_verification"] = True
                target["reported_restocked_at"] = "2026-10-13T10:00:00Z"
        elif path.startswith("shelves/"):
            parts = path.split("/")
            target = next(s for s in shelves if s["id"] == parts[1])
            if len(parts) == 2:
                result = target
            elif parts[2] == "analyses":
                if method == "POST":
                    assert b"filename=" in route.request.post_data_buffer
                    target.update(
                        status="Full",
                        current=analysis(parts[1], "Full"),
                        awaiting_verification=False,
                    )
                    result = target["current"]
                else:
                    result = ([target["current"]] if target["current"] else []) + [
                        old_reading
                    ]
            elif parts[2] == "calibration":
                assert b'"width":1' in route.request.post_data_buffer
                target.update(
                    reference=asset("reference"),
                    calibration_version=2,
                    current=None,
                    status="Not checked",
                )
                result = target
            else:
                raise AssertionError(f"Unexpected API request: {method} {path}")
        else:
            raise AssertionError(f"Unexpected API request: {method} {path}")
        route.fulfill(json=result)

    page.route("**/api/**", api_route)
    page.route(
        "**/media/**",
        lambda route: route.fulfill(
            path=str(
                ROOT
                / "assets/demo/zone-01"
                / Path(urlparse(route.request.url).path).name
            ),
            content_type="image/png",
        ),
    )
    page.goto(BASE)
    expect(page.locator(".shelf-card")).to_have_count(6)
    expect(page.locator(".shelf-card").first).to_contain_text("Oat & nut bars")
    page.screenshot(path=str(OUTPUT / "dashboard-desktop.png"), full_page=True)
    page.locator(".metric-empty").click()
    expect(page.locator(".shelf-card")).to_have_count(1)
    page.get_by_role("button", name="Clear filters").click()
    page.get_by_role("button", name="Placement review").click()
    expect(page.locator(".shelf-card")).to_have_count(1)
    expect(page.locator(".shelf-card")).to_contain_text("Pasta & grains")
    page.get_by_role("button", name="Clear filters").click()
    page.get_by_role("button", name="No valid reading").click()
    expect(page.locator(".shelf-card")).to_have_count(2)
    expect(page.get_by_text("Ready for first check")).to_be_visible()
    page.get_by_role("button", name="Clear filters").click()
    page.get_by_role("button", name="View queue").click()
    expect(page.locator(".shelf-card")).to_have_count(3)
    page.get_by_role("button", name="Clear filters").click()
    page.get_by_label("Search shelves").fill("beverages")
    expect(page.locator(".shelf-card")).to_have_count(1)
    page.get_by_label("Search shelves").fill("no match")
    expect(page.get_by_role("heading", name="No shelves found.")).to_be_visible()
    page.get_by_role("button", name="Clear filters").first.click()
    page.get_by_label("Filter by aisle").select_option("01 · Breakfast")
    expect(page.locator(".shelf-card")).to_have_count(3)
    page.get_by_role("button", name="Clear filters").click()
    page.get_by_label("Sort shelves").select_option("name")
    expect(page.locator(".shelf-card").first).to_contain_text("Breakfast cereals")
    page.get_by_role("button", name="List view").click()
    expect(page.locator(".shelf-list")).to_be_visible()
    page.screenshot(path=str(OUTPUT / "dashboard-list.png"), full_page=True)
    page.get_by_role("button", name="Add shelf", exact=True).click()
    expect(page.get_by_role("dialog", name="Add a shelf zone")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog")).to_have_count(0)
    expect(page.get_by_role("button", name="Add shelf", exact=True)).to_be_focused()

    page.goto(BASE + "/shelves/1")
    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
    page.screenshot(path=str(OUTPUT / "shelf-desktop.png"), full_page=True)
    page.get_by_label("Detection overlay").check()
    expect(
        page.get_by_alt_text("Detected occupied area and selected ROI")
    ).to_be_visible()
    page.get_by_role("button", name="View check").last.click()
    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
    page.get_by_role("button", name="Return to current reading").click()
    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
    page.get_by_role("button", name="Acknowledge", exact=True).click()
    expect(page.get_by_role("button", name="Acknowledged", exact=True)).to_be_disabled()
    page.get_by_role("button", name="Report restocked", exact=True).click()
    expect(page.get_by_text("Awaiting verification", exact=True)).to_be_visible()
    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
    page.get_by_role("button", name="Upload verification photo").click()
    expect(page.get_by_role("dialog", name="Check SH-01")).to_be_visible()
    page.get_by_label("Shelf photo").set_input_files(
        ROOT / "assets/demo/zone-01/full.png"
    )
    page.screenshot(path=str(OUTPUT / "upload-desktop.png"))
    page.get_by_role("button", name="Analyze image", exact=True).click()
    expect(page.locator("dialog [role=status]")).to_contain_text("Reading saved")
    page.get_by_role("button", name="Done", exact=True).click()
    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
    page.get_by_role("button", name="Calibration", exact=True).click()
    page.get_by_role("button", name="Use entire image").click()
    page.get_by_label("Shelf photo").set_input_files(
        ROOT / "assets/demo/zone-01/reference.png"
    )
    page.screenshot(path=str(OUTPUT / "calibration-desktop.png"))
    page.get_by_role("button", name="Save calibration", exact=True).click()
    expect(page.locator("dialog")).to_have_count(0)
    expect(page.locator(".reading-panel .badge")).to_have_text("Not checked")
    page.get_by_role("button", name="Enable placement review").click()
    expect(page.get_by_role("dialog", name="Set expected shelf layout")).to_be_visible()
    page.keyboard.press("Escape")

    for width in (390, 768, 1024):
        page.set_viewport_size({"width": width, "height": 844})
        page.goto(BASE)
        expect(page.locator(".shelf-card")).to_have_count(6)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            width
        )
        page.screenshot(path=str(OUTPUT / f"dashboard-{width}.png"), full_page=True)
        page.get_by_role("button", name="List view").click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            width
        )
        page.goto(BASE + "/shelves/1")
        expect(page.get_by_role("heading", name="Breakfast cereals")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            width
        )
        page.get_by_role("button", name="Calibration", exact=True).click()
        expect(page.get_by_role("dialog")).to_be_visible()
        assert page.evaluate(
            "document.querySelector('dialog').scrollWidth <= innerWidth"
        ), width
        page.keyboard.press("Escape")
        if width == 390:
            page.screenshot(path=str(OUTPUT / "shelf-mobile.png"), full_page=True)

    page.goto(BASE)
    page.get_by_role("button", name="Add shelf", exact=True).click()
    for label, value in (
        ("Identifier", "SH-07"),
        ("Display name", "New shelf"),
        ("Aisle / location", "05 · New"),
    ):
        page.get_by_label(label, exact=True).fill(value)
    page.get_by_role("button", name="Create & calibrate").click()
    expect(page.get_by_role("dialog", name="Calibrate shelf zone")).to_be_visible()
    page.keyboard.press("Escape")
    mode["empty"] = True
    page.goto(BASE)
    expect(
        page.get_by_role("heading", name="Your first shelf starts here.")
    ).to_be_visible()
    mode["empty"] = False
    mode["error"] = True
    page.reload()
    expect(page.locator(".notice[role=alert]")).to_contain_text(
        "temporarily unavailable"
    )
    mode["error"] = False
    page.get_by_role("button", name="Retry", exact=True).click()
    expect(page.locator(".shelf-card")).to_have_count(7)
    assert not errors, errors
    print(
        "PASS: priority/filter/search/sort, grid/list, empty/error recovery, accessible dialogs, "
        "history, restocking and photo verification, upload, calibration, placement dialog, "
        "new shelf setup, 390/768/1024/1440px layouts; no browser errors. API fixtures only."
    )
    browser.close()
