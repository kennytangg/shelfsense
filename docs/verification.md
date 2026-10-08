# Verification record

Verified locally on **2026-10-07**. The application was built and exercised against real PostgreSQL, including production Next.js rewrites. No frontend classifier mocks or SQLite substitute were used.

## Tested versions

| Runtime/package | Version |
| --- | --- |
| Python | 3.12.8 |
| Node / npm | 24.14.0 / 11.9.0 |
| PostgreSQL | 18.6 (native local instance) |
| Next.js / React | 16.4.0 / 19.3.0 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.3.3 |
| TanStack Query | 5.104.1 |
| Lucide React | 0.468.0 |
| FastAPI / Uvicorn | 0.121.3 / 0.38.0 |
| Pydantic | 2.12.4 |
| SQLAlchemy / psycopg | 2.0.44 / 3.2.12 |
| Alembic | 1.17.2 |
| OpenCV headless / NumPy / Pillow | 4.12.0.88 / 2.2.6 / 12.0.0 |
| pytest / HTTPX | 9.0.1 / 0.28.1 |
| Playwright / Chromium | 1.56.0 / 141.0.7390.37 |

Exact transitive Python pins are in `backend/requirements.lock`; npm's complete resolved graph is in `frontend/package-lock.json`.

## Checks performed

- Initial Alembic migration applied successfully to a fresh native PostgreSQL 18 database. Each API test also migrates a fresh isolated schema.
- **20 backend tests passed**, including detector boundaries, actual mask-based fixture outputs, a >10 percentage point Full threshold margin, upload rejection/preserved valid state, EXIF, decoded-pixel checks, the alert lifecycle, duplicate prevention under parallel checks, same-shelf foreign keys, stale-calibration races, transaction/file cleanup, and seed/reset ownership behavior.
- Fresh seeding produces **12 zones: 4 Full / 4 Low / 4 Empty**. Refined fixtures measure approximately 77.6–77.8% Full, 34.8–35.0% Low and 0% Empty. All statuses are computed by OpenCV. Existing records remain unchanged by reseeding.
- `npm run typecheck --prefix frontend` passed.
- `npm run build --prefix frontend` passed in Webpack mode. Type checking, compilation, page generation and build traces completed.
- `npm run format:check --prefix frontend`, Ruff lint/format checks and `git diff --check` passed.
- Production `next start` forwards API and all four media roles (input, reference, overlay, mask).
- **Exactly 10 MiB plus multipart overhead** was accepted through Next.js, processed and saved. **10 MiB + 1 byte** received FastAPI's 413 response; the previous valid analysis remained current.
- Chromium smoke passed at 1440px desktop and 390px narrow width with no JavaScript page errors or horizontal overflow. It exercises dashboard filters, built-in samples, acknowledgment, restocking report, genuine multipart image upload, Full verification, mismatched-image preservation, overlay/mask inspection, saved reference/ROI recalibration, renewed analysis, refresh and mobile staff actions.
- Next.js, FastAPI and the native PostgreSQL instance were each stopped/restarted. Complete API snapshots of shelves/readings/diagnostics, alerts and dashboard compared **identically** before and after. Current media files remained accessible.
- Optional Compose configuration passed `docker compose config --quiet`. Its container startup/volume lifecycle was **not exercised**; the end-to-end run used native PostgreSQL instead.

Commands and isolation safeguards are in the root README. `scripts/proxy_check.py` performs the boundary checks and writes `/tmp/shelfsense-before-restart.json`; after manually restarting the three services, `python scripts/proxy_check.py --verify-restart` compares the persisted state. Run it on the disposable demo store; it adds readings to SH-01. The browser smoke similarly adds real history and calibration records rather than resetting the database.

## Environment notes and limits

The sandbox blocked normal network access and local ports, so dependency downloads, database commands and local servers were run with approved permissions. Turbopack's CSS worker port failure persisted on retry; the project therefore explicitly uses supported Next.js Webpack mode for development and builds.

The test suite emits two known non-failing warnings: a Starlette/AnyIO deprecated alias, and Pillow's resource warning during the intentionally over-limit decoded-image test. Oversized input is still rejected before full decode.

Native PostgreSQL verification used an isolated cluster at `/tmp/shelfsense-pg`, port **55432**, database `shelfsense`, with tests in `shelfsense_test`; no pre-existing user database was reset. This verification cluster is not a durable installation across temporary-directory cleanup. The documented normal setup uses the persistent Compose volume or a permanent native data directory. Generated application media is in ignored `backend/media`.

Controlled synthetic examples establish reproducibility, not real-supermarket accuracy. Camera movement and local lighting can still defeat the heuristic. Handled failures clean up generated media, but an abrupt OS/process crash can leave orphan files; no background garbage collector is included. Authentication and deployment are excluded by scope. No application was published.

## Screenshots

[Desktop dashboard](dashboard-desktop.png) · [Shelf details and measurement explanation](shelf-details.png) · [390px mobile dashboard](dashboard-mobile.png)
