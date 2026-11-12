# ShelfSense Product Backlog

Derived from the Project 1 brief in `requirements.pdf` and the current state of the code. Priority: **M** Must, **S** Should, **C** Could. Points are a relative Fibonacci estimate. Status: Done, Partial, To do.

## Epic 1: Image input

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| IN-1 | As a staff member, I upload a shelf photo so its stock can be checked. | PNG/JPEG accepted; oversize or undecodable files rejected with a clear message. | M | 5 | Done |
| IN-2 | As an operator, I feed photos from a folder so checks run without manual upload. | `npm run watch` uploads stable files, retries, and deduplicates by original bytes. | S | 5 | Done |
| IN-3 | As a staff member, I capture a photo from my device camera so I need no file transfer. | Camera capture on mobile and desktop browsers feeds the same check flow. | C | 5 | To do |

## Epic 2: Shelf setup and calibration

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| SU-1 | As a manager, I add a shelf with a name and location. | Required fields validated; shelf appears in the list. | M | 2 | Done |
| SU-2 | As a manager, I set an empty reference photo and monitored area. | Area saved; calibration version increments; history kept. | M | 8 | Done |
| SU-3 | As a manager, I delete a shelf and its data. | Confirmation required; photos, history and tasks removed. | S | 3 | Done |

## Epic 3: Shelf analysis and detection

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| AN-1 | As staff, I see a shelf classified Full, Low or Empty. | OpenCV comparison against the reference; thresholds configurable; occupancy % stored. | M | 13 | Done |
| AN-2 | As staff, a bad photo does not wipe the last valid result. | Failed checks keep the previous reading and tasks. | M | 3 | Done |
| AN-3 | As a manager, I see how a shelf changed over time. | Newest-first list of checks with time, status and coverage on the shelf page. | S | 3 | Done (untested in browser) |
| AN-4 | As a manager, I see misplaced-item findings. | Placement result shown on shelf page and filterable; independent of stock tasks. | C | 8 | Partial (backend only; UI intentionally hidden) |
| AN-5 | As a data scientist, I measure detector accuracy on labelled photos. | A script reports accuracy per class against `tests/fixtures`. | S | 5 | To do |

## Epic 4: Dashboard

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| DB-1 | As a manager, I see every shelf's Full/Low/Empty status. | Status badge on each shelf card. | M | 3 | Done |
| DB-2 | As a manager, I see totals per status at a glance. | Count tiles; clicking one filters the list. | M | 3 | Done (untested in browser) |
| DB-3 | As staff, I find shelves quickly. | Search by name/location, status filter, urgency sort. | S | 3 | Done (untested in browser) |
| DB-4 | As staff, I see current data without refreshing. | List refetches automatically (30 s) and after mutations. | M | 2 | Done |
| DB-5 | As a manager, I see stock trends across the store. | Chart of Low/Empty counts over time. | C | 8 | To do |

## Epic 5: Alerts and restocking workflow

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| AL-1 | As staff, a Low or Empty result creates one restocking task. | One active task per shelf; repeat results update it. | M | 8 | Done |
| AL-2 | As staff, I report a shelf as restocked, and a new photo verifies it. | Reporting leaves measured stock unchanged; a valid Full photo resolves it. | M | 5 | Done |
| AL-3 | As staff, I see how many shelves need attention from any page. | Alerts nav item with count badge. | M | 2 | Done (untested in browser) |
| AL-4 | As a manager, I am notified outside the app when a shelf is Empty. | Email or push on a new Empty task; rate-limited per shelf. | S | 8 | To do |
| AL-5 | As a manager, I see alert history and time-to-restock. | List of resolved tasks with durations. | C | 5 | To do |

## Epic 6: Platform, quality and operations

| ID | User story | Acceptance criteria | Pri | Pts | Status |
|---|---|---|---|---|---|
| PL-1 | As an operator, I run the app locally with one command. | `npm run dev` migrates and starts; data survives restarts. | M | 3 | Done |
| PL-2 | As an operator, I deploy to hosted storage safely. | Private Blob storage, signed upload tickets, explicit migrations. | S | 8 | Done |
| PL-3 | As an operator, I back up database and media together. | `npm run backup` plus verified restore. | S | 3 | Done |
| PL-4 | As a developer, API tests run in CI. | CI provisions `TEST_DATABASE_URL`; 13 currently-skipped API tests run. | M | 5 | To do |
| PL-5 | As a developer, key workflows have browser tests. | `npm run test:browser` covers filters, alerts badge and history. | S | 5 | To do |
| PL-6 | As an operator, only authorised staff can use the app. | Login with roles; operator access fails closed. | S | 13 | To do |
| PL-7 | As a maintainer, docs match behavior. | Restore `docs/` architecture, deployment, detector and verification pages (currently deleted in the working tree). | M | 2 | To do |

## Suggested next sprint (about 23 points)

1. PL-7 restore docs (2)
2. PL-4 API tests in CI (5)
3. PL-5 browser tests for the new dashboard features (5)
4. AL-4 off-app notification (8)
5. AN-5 detector accuracy report (5), if capacity allows
