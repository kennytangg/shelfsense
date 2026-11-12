# ShelfSense end-to-end test log

Run date: 2026-11-12. Browser: Chromium, 1280 x 900 window. Result: 24 of 24 checks passed on two consecutive full runs (each including a fresh build and a fresh database schema).

This log describes each user journey the automated suite walks through. Every journey is written as the steps a person would take by hand in the browser, so you can repeat it yourself.

## How to run

You need Node 24, Docker, and the installed dependencies (`npm install`). Stop any running `npm run dev` first, because the suite builds the app.

1. Start a throwaway database (no saved data, nothing shared with your real database):

   ```sh
   docker run -d --name shelfsense-e2e-pg -e POSTGRES_PASSWORD=e2e_throwaway_pw \
     -e POSTGRES_DB=shelfsense_e2e_test -p 127.0.0.1:55432:5432 postgres:16-alpine
   export TEST_DATABASE_URL="postgresql://postgres:e2e_throwaway_pw@127.0.0.1:55432/shelfsense_e2e_test"
   ```

   The database name must differ from the one in `DATABASE_URL`, and the suite refuses to run against any host other than this computer.

2. Run the suite:

   ```sh
   npm run test:e2e
   ```

   It builds the app, creates a temporary schema and a temporary photo folder, starts the app, runs the journeys in order, then deletes everything it created. Nothing in `.shelfsense-dev.json`, `backend/` or `media/` is touched.

3. When finished, remove the database: `docker rm -f shelfsense-e2e-pg`.

Notes:

- If your installed Chromium is a different version from the one this Playwright release expects, point at it with `CHROMIUM_EXECUTABLE=/path/to/chrome` (same variable as `npm run test:browser`).
- `E2E_SKIP_BUILD=1` reuses the existing build to save about a minute.
- The report is written to `e2e/.artifacts/report`, with screenshots and traces for any failure.
- The same database also runs the API tests that are normally skipped: `npm test` with `TEST_DATABASE_URL` set (37 of 37 passed, none skipped; without it, 13 are skipped).

## Photos used

Details and licences are in `e2e/fixtures/photos/SOURCES.md`.

| Role | File | What it is |
| --- | --- | --- |
| Empty reference | `tests/fixtures/shelves/sh-01-reference.png` | Illustration of an empty three-shelf unit (not a photograph) |
| Low stock | `tests/fixtures/shelves/sh-01-low.png` | Same illustrated shelf, a few boxes |
| Full stock | `tests/fixtures/shelves/sh-01-full.png` | Same illustrated shelf, fully stocked |
| Wrong framing (drawing) | `tests/fixtures/shelves/mismatched.png` | Illustration in portrait shape |
| Real photo, empty shelf | `e2e/fixtures/photos/trader-joes-empty-egg-shelf.jpg` | Real photograph, empty egg shelf in a shop (Wikimedia Commons, CC BY-SA 4.0) |
| Real photo, portrait | `e2e/fixtures/photos/jerusalem-empty-egg-shelf-portrait.jpg` | Real photograph, empty egg shelf, portrait shape (Wikimedia Commons, CC0) |

The checker needs an empty photo and later photos of the same shelf from the same spot. No free real-photo series like that exists, so the Full and Low steps use the drawn set. The real photographs are used for the steps that can be judged honestly with them. Journeys 3 and 5 say which is which.

## Results summary

| # | Journey | Checks | Result (2026-11-12) |
| --- | --- | --- | --- |
| 1 | Sign-in gate | 4 | Pass |
| 2 | Shelf setup | 1 | Pass |
| 3 | Stock check | 2 | Pass |
| 4 | Restock workflow | 2 | Pass |
| 5 | Bad input | 6 | Pass |
| 6 | Dashboard | 7 | Pass |
| 7 | Shelf history | 1 | Pass |
| 8 | Delete shelf | 1 | Pass |
| | Total | 24 | 24 Pass, 0 Fail |

---

## 1. Sign-in gate

Purpose: when operator credentials are configured, nobody gets in without them.

Preconditions: the app runs in hosted mode with an operator user name and password. The suite makes up a random pair for each run and never writes it down. (This mode is switched on by the `VERCEL` setting; a normal local run has no gate.)

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open the app address with no user name or password. | Refused with "Operator sign-in required." The browser shows a sign-in challenge and no shelves page. | Pass |
| 2 | Ask for the health check, shelf list and a photo address without credentials. | All three refused. | Pass |
| 3 | Open the app with the right user name and a wrong password. | Refused. | Pass |
| 4 | Open the app with the right user name and password. | The Shelves page and the main menu appear; the health check answers OK. | Pass |

Status: Pass (4 of 4).

## 2. Shelf setup

Purpose: a manager adds a shelf, gives it an empty reference photo and marks the area to watch.

Preconditions: no shelf yet. Photo: `tests/fixtures/shelves/sh-01-reference.png`.

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | On Shelves, click **Add shelf**. | The "Add shelf" page opens. | Pass |
| 2 | Type "Cereal aisle shelf" as the name and "Aisle 1, middle" as the location. Click **Add shelf**. | The "Set up shelf" page opens. **Save setup** is greyed out. | Pass |
| 3 | Go back to Shelves. | The new shelf's card is labelled "Needs setup". | Pass |
| 4 | Open the shelf's setup page again and choose the photo `sh-01-reference.png` for **Shelf photo**. | The photo appears with a selection box over it. | Pass |
| 5 | Click **Use entire image**, then shrink and move the box with the arrow keys (Shift plus arrows resizes) until it covers the shelves and leaves a small margin. | **Save setup** is now enabled. | Pass |
| 6 | Click **Save setup**. | The "Check stock" page opens and shows the empty reference photo. | Pass |
| 7 | Open the shelf page, then Shelves. | The result card says "Needs first check", the shelf card says "Not checked", and the "Needs setup" tile shows 0. | Pass |

Status: Pass.

## 3. Stock check

Purpose: staff upload photos and the app reads Full, Low or Empty. A shelf that needs stock gets one restocking task, which is updated rather than duplicated.

Preconditions: a shelf set up with `sh-01-reference.png`. Photos: the drawn set (full, low, empty).

Check A: full, then low, then empty

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open the shelf's Check stock page, choose `sh-01-full.png`, click **Check stock**. | Shelf page shows "Full". No "This shelf needs restocking." No task exists. | Pass |
| 2 | Check stock again with `sh-01-low.png`. | Shows "Low". "This shelf needs restocking." and a **Report restocked** button appear. One task, severity Low. | Pass |
| 3 | Check stock again with `sh-01-reference.png` (the empty shelf, same viewpoint). | Shows "Empty". Still exactly one task, the same one as in step 2, now with severity Empty. | Pass |

Check B: real photograph

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Add a shelf "Egg shelf (real photo)" at "Dairy wall". On the setup page choose `trader-joes-empty-egg-shelf.jpg` and click **Save setup** (whole image). | Check stock page opens. | Pass |
| 2 | Check stock with the same photograph. | Shelf page shows "Empty": nothing new on the shelf. | Pass |

Status: Pass (2 of 2). Limit: the real-photo check only proves that an unchanged empty shelf reads Empty. A real photo of a stocked version of the same shelf is not available, so Full and Low with real photographs are not tested.

## 4. Restock workflow

Purpose: after staff refill a shelf and report it, the stock reading does not change until a new photo confirms it.

Preconditions: a shelf set up and checked with `sh-01-low.png`, so one open task exists.

Check A

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open the shelf page. Click **Report restocked**. | "Restock reported. Check stock with a new photo to update the result." appears. The **Report restocked** button is gone. | Pass |
| 2 | Look at the result card. | Still "Low". The measured stock did not change. | Pass |
| 3 | Open Shelves, then the **Restock reported** tab. | The shelf is listed, badge "Low", with "Restock reported · Confirm the refill with a new photo." | Pass |
| 4 | Click **Verify restock**, choose `sh-01-full.png`, click **Check stock**. | Shelf page shows "Full". "Restock reported" and "needs restocking" messages are gone. | Pass |

Behind the scenes (checked through the API): when staff report, the task is closed with the reason "Staff reported restocked" and the shelf is flagged "awaiting verification". The Full photo clears that flag. There is still only one task.

Check B

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | After reporting restocked, check stock again with `sh-01-low.png` (not actually refilled). | Still "Low". "This shelf needs restocking." and **Report restocked** return. One open task, "awaiting verification" cleared. | Pass |

Status: Pass (2 of 2).

## 5. Bad input

Purpose: unusable uploads are refused with a clear message, and the shelf keeps its last good result and its task.

Preconditions: a shelf set up with `sh-01-reference.png` and checked with `sh-01-low.png` (one Low result, one open task). After each step below, the shelf page still shows "Low", one open task, and one entry in Check history.

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | On Check stock, choose a text file (`notes.txt`). | Message "Choose a PNG or JPEG image." **Check stock** stays disabled. | Pass |
| 2 | Choose an 11 MB file named `huge.png`. | Message "Image must be 10 MB or smaller." | Pass |
| 3 | Choose a file named `broken.png` that is not really an image, click **Check stock**. | Message "Cannot decode this image. Choose a complete PNG or JPEG." The page stays on Check stock. | Pass |
| 4 | Choose a 5000 x 5000 pixel plain grey PNG (25 million pixels, small file). Click **Check stock**. | Message "Image exceeds the 20 million decoded-pixel limit." | Pass |
| 5 | Choose `tests/fixtures/shelves/mismatched.png` (drawn, portrait). Click **Check stock**. | Shelf page: heading "Previous valid result", badge still "Low", notice "Photo check needs attention." | Pass |
| 6 | Same with `jerusalem-empty-egg-shelf-portrait.jpg` (real photograph, portrait). | Same as step 5. | Pass |

Status: Pass (6 of 6). The grey 25-megapixel image is generated by the test; it is test data for a size limit, not a photo of a shelf.

## 6. Dashboard

Purpose: the Shelves page summarises stock and lets staff find what needs attention.

Preconditions: five shelves, one in each state:

| Shelf | Location | State |
| --- | --- | --- |
| Zebra snacks | Front of store | Empty (checked with the empty photo) |
| Mango drinks | Back wall | Low (checked with `sh-01-low.png`) |
| Oat cereal | Aisle 7 | Full (checked with `sh-01-full.png`) |
| Tea bags | Aisle 9 | Not checked (set up, never checked) |
| Bread rack | Bakery corner | Needs setup |

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open Shelves. | Summary tiles show Empty 1, Low 1, Full 1, Not checked 1, Needs setup 1. Tabs show All (5), Needs attention (2), Needs restocking (2), Restock reported (0). Five cards. | Pass |
| 2 | Read the card order. | Zebra snacks, Mango drinks, Tea bags, Bread rack, Oat cereal (most urgent first). | Pass |
| 3 | Click the **Low** tile. | Only Mango drinks shows; the tile is highlighted. Click it again to show all five. | Pass |
| 4 | Click **Needs restocking**. | Zebra snacks and Mango drinks. Click **Restock reported**: "No shelves match the current filters." Click **All**: five shelves. | Pass |
| 5 | Type "mango" in the search box. Then "aisle". Then "bakery corner". Then "no such shelf". Then clear it. | Mango drinks; Tea bags and Oat cereal (by location); Bread rack; "No shelves match the current filters."; all five again. | Pass |
| 6 | Pick **Full** in the stock status list. Then **Needs setup**. Then **All statuses**. | Oat cereal; Bread rack; all five. | Pass |
| 7 | Look at the **Alerts** menu item. | Red count 2. Click it: Zebra snacks and Mango drinks. | Pass |
| 8 | Open Mango drinks, click **Report restocked**. | The Alerts count stays 2. On Shelves: Needs restocking (1), Restock reported (1). | Pass |
| 9 | Check Mango drinks with `sh-01-full.png`. | Alerts count drops to 1. Needs attention (1), Restock reported (0), Full tile 2, Low tile 0. | Pass |
| 10 | Check Zebra snacks with `sh-01-full.png`. | The Alerts count disappears. | Pass |

Status: Pass (7 of 7 checks; steps 7 to 10 are one check).

## 7. Shelf history

Purpose: staff can see how a shelf changed over time.

Preconditions: a new shelf set up with `sh-01-reference.png`.

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open the shelf page before any check. | No "Check history" card. | Pass |
| 2 | Check stock with `sh-01-full.png`, then `sh-01-low.png`, then `sh-01-reference.png`. | Shelf page has a "Check history" card with three rows. | Pass |
| 3 | Read the rows from the top. | 1) Empty, Coverage 0.0%. 2) Low, Coverage about 30 to 39%. 3) Full, Coverage about 70 to 79%. Each row has a date and time. Newest is first. | Pass |

Status: Pass.

## 8. Delete shelf

Purpose: removing a shelf needs confirmation and removes its tasks too.

Preconditions: a shelf "Doomed shelf" checked with `sh-01-low.png` (one open task).

| Step | Action | Expected | Actual |
| --- | --- | --- | --- |
| 1 | Open the shelf and click **Delete shelf**. | A dialog asks: Delete "Doomed shelf"? | Pass |
| 2 | Click **Cancel**. | Dialog closes; the shelf still exists. | Pass |
| 3 | Click **Delete shelf** again, then **Delete shelf** in the dialog. | You return to Shelves; the shelf is not listed. | Pass |
| 4 | Try to open the shelf's old address. | An error is shown. The shelf and its task are gone. | Pass |

Status: Pass.

---

## Things found while testing

- Report restocked closes the restocking task straight away (reason "Staff reported restocked") and flags the shelf as awaiting verification. The later Full photo clears the flag rather than closing a task. A still-Low photo opens a new task. This matches the product rules, and the tests check it that way.
- The older `npm run test:browser` script no longer passes against the current working tree: it expects one link per shelf card, but the new card has two ("View shelf" plus an action link). It was not changed.
- The first `npm run build` attempt in each run stops with a Next.js 16.4.0 security-advisory message; running the same build again succeeds. The suite retries once. Upgrading Next.js is a separate decision and was not attempted.
