# ShelfSense

ShelfSense is a local supermarket shelf-monitoring prototype. It analyzes shelf
photos, flags low stock, and tracks restocking tasks. A new photo verifies recovery.

Built with Next.js, React, FastAPI, PostgreSQL, and OpenCV.

## Run locally

Install **Node 24 LTS**, **Python 3.12**, and **Docker**. Keep Docker running,
then run this command from the repository root:

```sh
npm run dev
```

The launcher installs missing dependencies, prepares the database, applies
migrations, seeds demo shelves, and starts the frontend and API.

Open the printed URL, normally **http://127.0.0.1:3000**. API documentation is
normally at **http://127.0.0.1:8000/docs**. Available ports are selected automatically.

Press **Ctrl+C** to stop both apps. PostgreSQL stays running, and later runs reuse
saved data. The database uses the `shelfsense-postgres` container, `shelfsense_pg`
volume, and port **5433**.

Keep the generated `.shelfsense-dev.json`, `backend/.env`, and `backend/media`
to preserve credentials and uploaded images. Do not commit these files.

## Try the demo

1. Click **Run a demo**, choose **Low coverage sample**, and click **Run demo sample**.
2. Acknowledge the task, then report restocked. The shelf stays Low and shows **Awaiting verification**.
3. Run **Full coverage sample** to verify recovery. Refresh to see the saved result.

See the [demo guide](docs/demo.md) for the full walkthrough.

Occupied area is an estimate, not a product count. Use matching camera positions
and similar lighting; this prototype is intended for controlled local demos.

## Project layout

```text
frontend/src/             Pages, components, and styling
backend/src/shelfsense/    API, persistence, detector, and demo CLI
backend/migrations/       Database migrations
backend/tests/            Detector and API tests
assets/demo/              Sample images
scripts/                  Development launcher and workflow checks
tests/                    Launcher tests
docs/                     Detailed documentation
```

## Checks

After local setup, run the relevant checks from the repository root:

```sh
npm ci
npm test
.venv/bin/pytest backend/tests/test_detector.py -q
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
npm run typecheck --prefix frontend
npm run format:check --prefix frontend
npm run build --prefix frontend
```

Stop the development frontend before running the production build.

API tests require a **separate test database**. With the Docker database running,
create it once:

```sh
docker exec shelfsense-postgres sh -c 'createdb -U "${POSTGRES_USER:-postgres}" -O shelfsense_prototype shelfsense_test'
```

Replace `YOUR_PASSWORD` with the generated password from `backend/.env`, then run:

```sh
export TEST_DATABASE_URL=postgresql+psycopg://shelfsense_prototype:YOUR_PASSWORD@127.0.0.1:5433/shelfsense_test
.venv/bin/pytest backend/tests -q
```

Never use the application database for tests. API tests skip when
`TEST_DATABASE_URL` is unset and refuse the application database name.

## More information

- [Architecture and API](docs/architecture.md)
- [Detector explanation and limitations](docs/detector.md)
- [Verification results and tested versions](docs/verification.md)
