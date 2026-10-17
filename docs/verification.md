# Verification

## Regression coverage

The application uses `migrations/0001.sql` plus `0002.sql`, which allows valid stock checks without saved masks/overlays. API tests exercise fresh and repeated migrations, checksum changes, unsupported migration histories, and rejection of schemas without recorded history. Tests use disposable schemas in a separate `TEST_DATABASE_URL` and temporary media.

The detector matches expected stock and placement outputs for five frozen cases in `tests/fixtures/detector-expected.json`. Tests also cover threshold equality, invalid settings, decoding failures, byte/pixel/dimension/format limits, quality rejection, and EXIF orientation. Trusted normalized references retain decoded-pixel checks while allowing PNGs larger than the original JPEG upload limit.

API regressions cover the complete restocking lifecycle, retained findings on failures, stock-only HTTP checks and historical placement compatibility, historical references, concurrent publication, receipt deduplication, calibration races, transactional rollback and generated-file cleanup, ownership constraints, upload ticket tampering, retry-safe calibration/placement, seed idempotency, and ownership-aware demo reset. Additional tests verify hosted access, bounded image processing, fixture generation, the development launcher, dependency boundaries, and complete manifest coverage without duplicate image bytes.

## Required checks

Run `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run build`. Stop development Next.js before building. Run `npm run test:browser` against the production build with a separate test database and Chromium. The browser workflow covers empty installation, creation/setup/check/result pages, keyboard area selection, invalid-photo retention, alerts, restocking, subsequent-photo verification, real uploads, reload and Back/Forward, URL filtering, mobile layout, and folder uploader stable-file/restart deduplication.

Breadcrumb checks cover New shelf, shelf → Setup, and shelf → Stock check, with one current-page marker, a link back to shelf details, and updates on Back/Forward. Workflow labels are independent of headings and shelf names.

## Local verification result

On 2026-10-14, `npm run typecheck`, `npm run format:check`, `npm test` (21 Node regressions and 2 Jest launcher tests), `npm run build`, `npm run test:browser`, and Git whitespace checks passed. API/browser verification used `shelfsense_simplification_test`, disposable schemas and temporary media, with `TEST_DATABASE_URL` supplied only to the test process. The existing test database belonged to a different role and was left unchanged. No local checks were skipped. The production API trace includes zero test fixtures.

The browser workflow passed empty installation, add/setup/check/result pages, real uploads, invalid-photo retention, staff reporting and subsequent Full recovery, alerts, URL filtering with refresh and Back/Forward, legacy setup redirects, keyboard area adjustment, Help, mobile photo checks and watcher restart deduplication.

Skipped: hosted preview verification, including real private Blob and managed PostgreSQL provider behavior, because hosted credentials are unavailable. No deployment or application-data migration was performed.

## Runtime measurements

Previously measured locally: a 20-million-pixel input and maximum 1024×4096 processing size completed in approximately 9.9 seconds combined, with peak RSS around 854 MiB. The API serializes image work per isolate and limits queued work to eight requests. The traced API/media dependency set was approximately 40.7 MiB uncompressed. Recheck these measurements on the deployment target.

## Hosted verification

No hosted deployment has been verified from this workspace. Actual private Blob uploads/copies, hosted memory and duration, managed database transfer, and authenticated preview workflows require provider configuration. Follow `docs/deployment.md` before production deployment.

UI cleanup verification: browser checks exercise explicit breadcrumb destinations, informational progress, a single retained-result warning after rejected photos, staff reporting and photo verification, URL stock filters with Back/Forward, the legacy Alerts redirect, modal deletion cancellation, and 1/2/3/4 collection columns through 1920px. Screenshots are written under `/tmp/shelfsense-ui-*`. Use a separate `TEST_DATABASE_URL`; the runner creates a disposable schema and temporary media without touching application shelves.

The browser suite also checks portrait/landscape preview containment, aligned comparison frames before and after selection and file validation, rejected photos before any valid result, retained-result labeling, help-dialog Escape focus restoration, deletion cancellation and 200% CSS content zoom overflow. Native browser-menu zoom is a separate manual check.

## Compact workflow UI (2026-10-16)

The UI uses self-hosted Noto Sans for controls, navigation, headings and short copy, with Charter for Help paragraphs/instructions and expanded guidance, regular-weight background-only navigation, compact content-sized shelf cards, immediate measured-stock filtering, separate breadcrumbs/headings, saved-state progress, and shared 4:3 photo viewports. The browser suite covers task/stock intersections, clear-filter navigation, redundant-note suppression without hiding photo failures, verification headings, neutral pre-upload feedback, disabled pending submissions, loaded Noto Sans and Charter fonts, semantic heading sizes, hover/focus behavior, portrait/landscape containment, and ten widths from 320 to 1920px (including 360, 768, 1280 and 1440).

An optional `AXE_CORE_PATH` pointing to a local `axe.min.js` enables WCAG A/AA scans on Shelves, Help, Add shelf, setup and check pages. Control borders were measured against their backgrounds and darkened to exceed 3:1; focus outlines exceed 3:1. Existing screenshot artifacts were copied to `/tmp/shelfsense-baseline/` before editing; this is an inherited baseline, not a new capture of every state. Updated screenshots are under `/tmp/shelfsense-ui-*.png`, including task-filter views at 360/768/1280/1440px.

Manual review still required: native browser-menu 125%/200% zoom, font-loading failure simulation, and the originally reported populated-reference mismatch against real application data. Automated 200% CSS reflow is supplementary. The UI labels existing images “Saved reference” without changing their calibration or claiming their contents are empty. Hosted provider checks remain separate.

During implementation, the first axe scan identified Help links that relied on color alone. Inline prose links now remain underlined; task filters and main navigation retain background-only hover/selection. Initial browser failures came from obsolete breadcrumb assertions and test navigation/request timing; these were corrected. Sandboxed Next.js builds initially failed while parsing TypeScript `--showConfig`; the production build succeeded outside the sandbox.

Final local result: `npm run typecheck`, `npm run format:check`, `npm test` (24 Node regressions, 2 Jest launcher tests, zero skipped), `npm run build`, and `npm run test:browser` passed. The final browser run enabled axe-core 4.14 and reported zero WCAG A/AA violations across the five scanned pages. Test data used `shelfsense_simplification_test`, disposable schemas and temporary media. Desktop collection/check and mobile setup/check screenshots were visually reviewed for hierarchy, content fit, image containment and spacing; restocking/verification filter screenshots were also generated. No commit or push was made.

## Tailwind and shadcn consistency migration (2026-10-16)

This section supersedes the earlier UI results above. Installed official shadcn Radix Nova primitives using CLI 4.21.5; runtime dependencies selected by the CLI are Radix UI 1.8.1, class-variance-authority 0.7.1, cn 0.4.0 and tw-animate-css 1.4.0. CLI configuration and generated source are retained. Theme tokens, available Charter weights and responsive utilities replace the legacy global component CSS (112 lines remain for fonts, theme and layered base). No migrations, detector changes, commits or pushes were made.

Baseline: inspected the running application on its existing port 3000 before edits. The initial read-only state/computed-style capture is `/tmp/shelfsense-ui-baseline/findings.json`; staged/unstaged patches were saved alongside it. The 360/1440px baseline did not reproduce document overflow or stock-select clipping. It did show uneven cards, repeated verification/error notes, 28px markers with inherited 21px line height and competing global rules. Baseline-named screenshots were refreshed during development; use the original findings log for the pre-change measurements and the production screenshots below for final visual evidence.

Live shelf audit: no shelf named Bizkit exists in the inspected collection. Biscuits has a valid Empty measurement dated 2026-10-14 10:01:23 UTC, a restock report dated 2026-10-14 14:48:30 UTC, and a Review required attempt dated 2026-10-15 15:46:16 UTC due to incompatible image framing. Both attempts and the current shelf use calibration version 1. There is no active alert, and awaiting verification is true. These are independent retained evidence and task state, not a contradictory new measurement. The read-only audit is `/tmp/shelfsense-ui-live-audit.json`. The card now shows “Last measured: Empty,” “Verify stock,” and one “Photo needs review” exception. No live shelf data was changed.

Passed: `npm run typecheck`, `npm run format:check`, `npm test` (29 Node regressions and 2 Jest launcher tests; zero skipped), `npm run build`, and `npm run test:browser`. API/browser tests used `shelfsense_simplification_test` with disposable schemas and temporary media. Development Next.js was stopped before builds. One sandboxed build failed reading TypeScript `--showConfig`; the final build passed outside the sandbox. The architecture guard now walks generated component subdirectories. Intermediate browser assertion failures were corrected for Radix roles, portal focus timing and Next.js's route announcer; final verification used the successful production build without rebuilding during the browser run.

The production browser suite verifies retained-result/failed-photo/pending-verification overlap, setup precedence, filter intersection/reload/Back/Forward, Select keyboard typeahead/Escape/focus, readable card widths, 32px centered progress markers with one current step, equal comparison frames, portrait/landscape calibration pointer geometry, keyboard ROI controls, real file selection, pending submission states, dialog focus restoration, deletion cancellation and confirmation, and touch dialog/Select interactions. Responsive checks cover 320, 360, 390, 639, 640, 768, 1024, 1280, 1440 and 1920px. Axe-core 4.14 scans Shelves, Help, Add shelf, setup and check unconditionally and reports zero WCAG A/AA violations in the passing suite.

Final live production screenshots cover all/task-filter views, Add shelf, Help, setup, verification and details at 320, 360, 768, 1024, 1280, 1440 and 1920px: `/tmp/shelfsense-ui-production-{screen}-{width}.png`. The live scan identified no overflowing main-content elements. Browser-suite screenshots remain `/tmp/shelfsense-ui-*.png`. Desktop collection/setup, mobile verification/check and native-zoom setup screenshots were visually inspected for hierarchy, aligned frames, contained images, wrapping and marker centering.

Actual Chromium tab zoom passed at 125% and 200% on Shelves, Add shelf, setup, verification, details and Help. A temporary local extension used the [Chromium tabs zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom); the measured CSS viewport changed from 1440px to 1152/720px, devicePixelRatio changed to 1.25/2, and CSS body zoom stayed 1. There were no overflowing content elements. Evidence: `/tmp/shelfsense-native-zoom.log` and `/tmp/shelfsense-native-zoom-{screen}-{factor}.png`. Viewport screenshots use Chromium's capture API because Playwright full-page captures clipped the native-zoom image. The suite's CSS zoom check remains supplementary.

Skipped separately: hosted provider verification (no hosted credentials), physical-device/screen-reader checks, and browser-menu invocation itself (native tab zoom was exercised through the browser API). These do not change the existing hosted deployment limitations above.

Supplementary popup scan: a full-page axe scan with the Radix Select open flags `aria-hidden-focus` on background controls hidden by Radix. This is not counted as a clean full-page open-popup scan. Tab testing confirms focus stays in the open listbox, and installed Radix source uses a trapped FocusScope plus outside-focus/pointer guards (`node_modules/@radix-ui/react-select/dist/index.mjs`). The popup content is scanned separately; no accessibility rule is disabled in the required browser suite. Dialog-open scans, tooltip collision bounds, badge content fit and popup-focused scans are recorded in `/tmp/shelfsense-popups.log` with screenshots `/tmp/shelfsense-ui-tooltip-{width}.png` and `/tmp/shelfsense-ui-select-{width}.png`. Screen-reader validation of this primitive remains a manual check.

Restoration check (2026-10-16): the broad stateless MVP rewrite was undone. The original shelf/location/setup/check/restocking/verification screens and database-backed startup are restored; only the earlier photo-storage/demo reduction remains. Typecheck, formatting, 29 Node regressions, 2 launcher tests and production build passed. Browser checks were not rerun for this restoration. Application database/media were not changed.

## Stock workflow wording

The ShelfSense section of `requirements.pdf` asks for image input, Full/Low/Empty results, staff alerts and a simple dashboard. Photo uploads consistently use **Check stock**, including after staff report a refill. Setup supplies the current detector's empty-shelf baseline once per camera position. Restock reporting records staff work; a new valid photo updates the measurement. The photo page shows one camera-position instruction and no separate restocking progress or verification prompt. Dashboard filters label reported refills **Restock reported**.

Validation for this wording change: typecheck, format check, production build, 16 Node tests and 2 Jest tests passed. The plain test run skipped 13 database tests. Separate attempts with `shelfsense_simplification_test` could not complete API or browser verification because the existing migration runner references missing `migrations/0002.sql`. No migration files or application data were changed for this UI work.

## Near-MVP workflow simplification (2026-10-16)

Removed the measured-stock dropdown and “Last measured” badge prefix. The shelf list has All, Needs restocking and Restock reported; photo classifications remain Full/Low/Empty as required by the PDF. Help covers the complete setup/check/refill/verification workflow and failed-photo recovery. The simple ERD and table-retention rationale are in `docs/data-model.md`.

Verified with Node 24.14.0: typecheck, format:check, production build, and the production browser workflow against `shelfsense_simplification_test` with disposable schemas/media. Browser regressions now check task tabs, plain photo-result badges, absence of the stock selector, keyboard/history navigation and mobile task links. The initial database run exposed the missing `0002.sql`; the added forward migration permits valid results without generated overlays/masks while preserving historical assets and ownership. The application database was not migrated.

Final database-backed `npm test`: 29 Node regressions and 2 Jest launcher tests passed, with no skipped tests. A sandbox-blocked PostgreSQL connection was rerun successfully with approved access to the separate local test database.

## Visible deletion and distinct shelf cards (2026-10-16)

Cards and shelf details now expose a trash icon with a labelled Delete shelf button. Shared confirmation retains pending/error handling and focus restoration. Cancellation on details and confirmed deletion from the list passed in the production browser workflow using disposable test data. Real saved shelves were not deleted.

Full, Low and Empty cards have green, amber and red top borders plus different guidance. Active tasks link to Restock shelf; reported refills link to Verify restock. Browser checks verify each result's border, message and action, alongside mobile layout and accessibility checks. Visually inspected the 390px shelf-list screenshot. Help documents the buttons and states.

Passed: typecheck, format:check, production build, all 29 Node tests and 2 Jest tests against the separate test database, production browser smoke and git diff --check. No skipped checks.

### Follow-up: deletion belongs inside the shelf page

Removed Delete shelf from every dashboard card. Open the shelf name to reach the visible Delete shelf button on the detail page. Help and architecture guidance now reflect this placement. Browser checks assert no delete button appears on cards and exercise cancellation and confirmation inside the shelf page.

## Simplified card hierarchy

Cards use a thin neutral border, modest corners, more internal space and an unfilled footer. Shelf names lead in dark bold text; supporting copy is muted. Low stock, empty shelves and reported restocks receive subtle status tints, while routine cards stay white. Status labels and icons preserve meaning without relying on colour. Primary buttons remain reserved for restocking and verification tasks; routine card actions use a quieter text treatment.

## Optional placement detection (2026-10-17)

Placement detection is now available through the shelf detail page. Staff can save a correctly arranged Full reference, check photos for stock and appearance together, inspect retained results and their expected arrangement, filter the dashboard to Placement review, and disable comparison. Placement findings remain separate from restocking tasks. HTTP checks retain input photos and comparison metadata without saving generated masks/overlays. No schema migration is required.

Passed: typecheck, format:check, 29 Node regressions plus 2 Jest launcher tests (zero skipped), production build, production browser suite and Git whitespace checks. API regressions cover matching/changed arrangements, insufficient evidence, failed-photo retention, reference history and disabling while retaining stock tasks. Browser checks exercise real placement controls/uploads, rejected non-Full references, review-filter reload, failed-photo retention, all three outcomes and disabling; axe scans include expanded placement setup and results with zero WCAG A/AA violations. Screenshots at 390/1440px are `/tmp/shelfsense-placement-{width}.png`. Visual inspection caught a narrow mobile shelf heading; actions now wrap below the heading, and the suite asserts readable heading width.

The existing browser assertions were updated for current card tints. The new axe scan required an explicit browser context; that harness issue is fixed. A concurrent typecheck/build initially raced over generated Next.js types; final checks ran after the completed build. A sandboxed build failed reading TypeScript configuration; the final production build passed with approved access. Tests used disposable schemas in `shelfsense_simplification_test` and temporary media; application shelves/media were not modified.

Not run: hosted PostgreSQL/private Blob provider verification, physical-device and screen-reader checks. The placement comparison remains a fixed-camera appearance heuristic, without SKU identification or a claimed real-store accuracy rate.

## Expanded testing seeds (2026-10-17)

Explicit seeding now creates DEMO-01 through DEMO-09 for Low/Full/Empty, placement review, matching placement, insufficient placement evidence, a rejected latest photo with a retained valid reading, a reported refill awaiting verification, and an unconfigured shelf. All cases use the five frozen source images and existing service operations; no detector baselines or migrations changed. See [testing data](testing-data.md) for expected states and manual steps.

Passed: typecheck, format:check, production build, 29 Node regressions and 2 Jest tests (zero skipped), and Git whitespace checks. Database regressions verify all nine states, repeat seeding without row/image changes, and protected demo reset. Fixture checks verify all five source files, unique bytes, stock/placement outcomes and invalid framing. Tests use disposable schemas in the separate test database and temporary media.

The local application was seeded successfully with nine new DEMO examples. Existing SH-01 through SH-12 samples and all other existing shelves were preserved. No application reset or migration was run.

Not rerun for this seed-only change: production browser suite, hosted-provider, physical-device and screen-reader checks. The browser result in the optional placement section above remains the last UI verification.

## Placement UI removal (2026-10-17)

Removed optional placement setup/results from shelf details, the placement notice from stock checks, the dashboard review filter/link and placement Help instructions. Legacy `?view=placement` links display All; attention includes only stock tasks and pending verification. The underlying API, detector, seed cases and stored references/results remain intact. Documentation now distinguishes backend placement cases from the visible stock workflow.

Passed: typecheck, format:check, 29 Node tests plus 2 Jest launcher tests (zero skipped), production build, production browser suite and Git whitespace checks. The simplified browser regression configures placement through the API, creates a real mismatch, then checks that the UI displays only Full with no placement controls/results, that old filter links fall back to All, and that placement alone does not enter the stock attention view. Desktop/mobile detail screenshots are `/tmp/shelfsense-stock-detail-{width}.png`; the 390px view was visually reviewed. Accessibility scans include the detail page and the existing five-page workflow, with zero WCAG A/AA violations. Tests used disposable schemas and temporary media; no application data was modified.

Not run: hosted-provider verification, physical-device and screen-reader checks.

## Card layout refinement (2026-10-17)

Shelf cards use a uniform background, with the measured-status badge aligned to the right of the heading. Titles are plain text; View shelf is the only card button and opens the shelf detail page. Restocking and verification filters remain available, and task actions live inside the shelf page. The shelf detail page has one guide beside the page title, combining check dates, photo warnings and restocking guidance. Setup guidance sits beside its panel heading. Browser regressions cover neutral card backgrounds, badge alignment, button navigation and a single detail guide.

Validation passed: typecheck, format check, 29 Node tests and 2 Jest tests (zero skipped), production build, and the complete production browser suite across ten widths. Desktop cards and mobile shelf details were visually reviewed. The browser suite now checks title/guide alignment instead of requiring the title to fill its row. No database records in the application database were changed.

The single-button card regression checks unconfigured, measured and pending-verification shelves open their detail page through View shelf. Setup, restocking and verification remain available inside that page; collection filter membership is unchanged.

## Transparent card actions and loading placeholders (2026-10-17)

View shelf uses the transparent ghost button style. Shared skeleton primitives now show card placeholders during initial collection loads and a page placeholder while shelf details, setup or check data loads. Existing content stays visible during background refreshes. Loading placeholders have an accessible status label and respect reduced-motion preferences. Demo seed names are Cereals 1 through Cereals 9, with scenario details retained in badges, descriptions and testing-data documentation. Custom names are displayed verbatim. Browser checks hold API responses to verify skeletons appear before data and disappear afterward, and verify transparent buttons and unchanged shelf titles across stock changes.

Validation passed: typecheck, format check, 29 Node tests plus 2 Jest tests (zero skipped), production build, complete browser workflows and responsive/accessibility checks. The nine existing local DEMO names were explicitly renamed only where the demo flag, identifier and original generated name matched; other shelves, images, analyses and tasks were preserved. Repeat seeding still leaves existing records unchanged.
