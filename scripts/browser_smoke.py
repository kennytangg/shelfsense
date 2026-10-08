"""Exercise a running local site; adds readings/actions/calibration to SH-01 only.
Run after seed. Uses the production server at SHELFSENSE_WEB_URL or localhost:3000.
"""

import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.getenv("SHELFSENSE_WEB_URL", "http://127.0.0.1:3000")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(
        viewport={"width": 1440, "height": 1100}, device_scale_factor=1
    )
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    assert page.request.get(f"{BASE}/api/health").json()["database"] == "ready"
    shelves = page.request.get(f"{BASE}/api/shelves").json()
    shelf = next(s for s in shelves if s["identifier"] == "SH-01" and s["demo"])
    assert page.request.get(BASE + shelf["reference"]["url"]).status == 200
    page.goto(BASE)
    expect(page.get_by_role("heading", name="Shelf overview")).to_be_visible()
    expect(page.locator(".shelf-card")).to_have_count(len(shelves))
    page.screenshot(path=str(ROOT / "docs/dashboard-desktop.png"), full_page=True)
    page.get_by_role("button", name="Empty", exact=False).first.click()
    empty_count = sum(s["status"] == "Empty" for s in shelves)
    expect(page.locator(".shelf-card")).to_have_count(empty_count)
    page.get_by_role("button", name="Total zones", exact=False).click()
    page.get_by_role("link", name="Run a demo").click()
    expect(page.get_by_role("heading", name="Built-in demonstration")).to_be_visible()

    def sample(value, expected):
        page.get_by_label("Sample image").select_option(value)
        page.get_by_role("button", name="Run demo sample", exact=True).click()
        expect(page.locator("#demo [role=status]")).to_contain_text(
            expected, timeout=30000
        )

    sample("full", "Full")
    sample("low", "Low")
    page.get_by_role("button", name="Acknowledge", exact=True).click()
    expect(page.get_by_role("button", name="Acknowledged", exact=True)).to_be_disabled()
    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
    page.get_by_role("button", name="Report restocked", exact=True).click()
    expect(page.get_by_text("Awaiting verification", exact=True)).to_be_visible()
    expect(page.locator(".reading-panel .badge")).to_have_text("Low")
    # Use file upload for recovery, through the Next production proxy.
    page.get_by_role("button", name="Upload image", exact=True).click()
    page.get_by_label("Shelf photo").set_input_files(
        ROOT / "assets/demo/zone-01/full.png"
    )
    page.get_by_role("button", name="Analyze image", exact=True).click()
    expect(page.locator("dialog [role=status]")).to_contain_text(
        "Reading saved", timeout=30000
    )
    page.get_by_role("button", name="Done", exact=True).click()
    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
    sample("mismatched", "Review required")
    expect(page.locator(".notice[role=alert]")).to_contain_text(
        "Previous valid reading remains visible"
    )
    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
    sample("full", "Full")
    page.get_by_label("Detection overlay").check()
    page.get_by_text("How this was measured", exact=True).click()
    expect(page.get_by_alt_text("Binary foreground mask")).to_be_visible()
    page.screenshot(path=str(ROOT / "docs/shelf-details.png"), full_page=True)
    page.reload()
    expect(page.locator(".reading-panel .badge")).to_have_text("Full")
    # Recalibration must save normalized ROI values and require a fresh reading.
    page.get_by_role("button", name="Calibration", exact=True).click()
    expect(page.locator(".roi-box")).to_be_visible()
    page.get_by_label("Shelf photo").set_input_files(
        ROOT / "assets/demo/zone-01/reference.png"
    )
    page.get_by_role("button", name="Use entire image").click()
    for label, value in [
        ("X (%)", "5"),
        ("Y (%)", "10"),
        ("WIDTH (%)", "90"),
        ("HEIGHT (%)", "80"),
    ]:
        page.get_by_label(label, exact=True).fill(value)
    page.get_by_role("button", name="Save calibration", exact=True).click()
    expect(page.locator("dialog")).to_have_count(0)
    expect(page.locator(".reading-panel .badge")).to_have_text("Not checked")
    sample("full", "Full")
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE)
    expect(page.locator(".shelf-card")).to_have_count(len(shelves))
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=str(ROOT / "docs/dashboard-mobile.png"), full_page=True)
    page.get_by_role("link", name="Run a demo").click()
    expect(page.get_by_role("heading", name="Built-in demonstration")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    sample("low", "Low")
    page.get_by_role("button", name="Acknowledge", exact=True).click()
    page.get_by_role("button", name="Report restocked", exact=True).click()
    expect(page.get_by_text("Awaiting verification", exact=True)).to_be_visible()
    sample("full", "Full")
    assert not errors, errors
    print(
        "PASS: production API/media proxy, dashboard filtering, demo analysis, staff actions, real upload, review preservation, history/debug views, refresh, desktop and 390px mobile; no browser errors."
    )
    browser.close()
