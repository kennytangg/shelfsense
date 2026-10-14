# ShelfSense

ShelfSense monitors shelf coverage from a fixed camera using an empty reference photo. The dashboard, calibration, history, restocking tasks, and optional placement comparison run in one Next.js application with PostgreSQL. Image processing uses Sharp and OpenCV/WASM in Node.

Use Node 24 LTS and PostgreSQL 16 (Docker is supported).

```sh
npm ci
npm run dev
```

The launcher starts one Next.js process, explicitly migrates PostgreSQL, and seeds missing synthetic demo shelves. It prints the available application URL. Ctrl+C stops the app and keeps saved data. On first setup without `DATABASE_URL`, it provisions the dedicated `shelfsense-postgres` container on port 5433 using the `shelfsense_pg` volume. It also starts that existing container when the configured database uses its local port. Other configured databases must be running before launch.

Configuration lives in root `.env` or process environment variables. Copy `.env.example` to `.env` to configure your own PostgreSQL database; otherwise the launcher provisions the `shelfsense` database and saves its URL in `.env`. Managed images default to `media/`; override with `MEDIA_DIR`. Never commit credentials. Server credentials are never `NEXT_PUBLIC_*` variables.

The UI is in `src/app/` and `src/components/`; the Node API and business logic are in `src/server/`. Route Handlers serve `/api` and owned `/media` images. PostgreSQL access uses parameterized Drizzle SQL and `pg`. The six domain tables use same-shelf ownership and state constraints. The complete initial schema lives in `migrations/0001.sql`; the migration runner records a checksum and safely skips an unchanged applied migration. Use a fresh database for this initial schema; databases created with a different migration history are rejected.

## Commands

```sh
npm run dev                 # database preparation and one Next.js process
npm run dev:next            # Next.js only; prepare the database explicitly first
npm run migrate             # apply the initial schema or verify its recorded checksum
npm run seed                # only missing demo shelves
npm run fixtures            # retain bundled CC0 artwork; generate missing fixture sets in Node
npm run reset-demo -- --yes # preserve user shelves and user-owned images
npm run typecheck
npm run format:check
npm test
npm run build
npm start
npm run test:browser
npm run backup -- /safe/backup-directory
npm run migrate:media       # read-only local media audit
npm run migrate:media -- --apply # copy to private Blob, verify hashes, retain local rollback files
npm run storage:cleanup     # list old unreferenced Blob objects
npm run storage:cleanup -- --apply
npm run watch -- --folder /tmp/shelfsense-inbox --url http://127.0.0.1:3000 --interval 2
```

Stop development Next.js before production builds. Use the launcher’s printed port for browser and uploader commands.

Tests require a **separate PostgreSQL database name**, configured as `TEST_DATABASE_URL`. Create it using your actual database administrator and local port; grant the application test role permission to create schemas. Tests reject the application database name and use disposable schemas and temporary media. Without the variable, API tests explicitly skip; detector and launcher tests still run. Browser verification requires the test database and Chromium (`npx playwright install chromium`, or `CHROMIUM_EXECUTABLE` pointing to a compatible local executable).

The folder uploader watches shelf-identifier subfolders, waits for unchanged size/mtime across scans, rechecks the file after reading, retains source files, and retries service failures. Original-byte SHA-256 receipts deduplicate publication per shelf and calibration version. Atomic rename is recommended. It can upload to the hosted app using `SHELFSENSE_AUTHORIZATION`; it never runs inside Vercel. Use a folder separate from managed media.

Staff reporting restocked changes the task state while preserving measured stock. A subsequent valid photo verifies recovery. Placement review is independent of stock tasks. Unreliable photos and failed setup preserve previous valid findings. See [architecture](docs/architecture.md), [detector](docs/detector.md), [verification](docs/verification.md), and [deployment](docs/deployment.md).
