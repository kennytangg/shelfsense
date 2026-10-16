# Architecture and API

The browser uses the existing React and TanStack Query UI. Relative `/api` and `/media` requests go directly to Node.js Next.js Route Handlers. Server-only modules in `src/server/` own PostgreSQL, validation, private storage, analysis publication, and staff actions. `shelf-analysis.ts` remains independent of persistence and UI. Pages/layouts are Server Components; interactive workflows are Client Components. Database credentials and image-processing libraries stay out of browser bundles.

The original shelf setup, checks, dashboard, locations, restocking and verification workflows are restored. The earlier photo reduction remains: ordinary checks save only their input image and reuse the reference; historical evidence stays readable. The optional demo has one shelf and one initial Low reading.

## Data and transactions

The six domain tables are `stores`, `shelves`, `image_assets`, `analyses`, `alerts`, and `ingestion_receipts`. The initial SQL migration defines same-shelf composite foreign keys, valid measurement/state checks, unique store/identifier pairs, and partial unique index for one active alert per shelf. The migration journal is infrastructure metadata. Migrations 0001 and 0002 are checksum-verified on repeat execution. Existing schemas without matching migration history are rejected; start with a fresh database. Migration execution is explicit at local startup or release, never inside request processing. Unsupported histories and missing required ownership constraints/indexes abort migration.

Image decoding and processing occur outside database transactions. Analysis reads a calibration snapshot, processes and writes new immutable assets, then locks the shelf and rechecks its version. Asset metadata, analysis, latest reading, alert changes and ingestion receipt commit together. Competing analyses and staff actions serialize on the shelf lock. Concurrent receipt duplicates return the existing analysis and clean up their generated files. Calibration races return 409 and remove new assets. Handled persistence failures roll back rows and remove new files; historical files are never overwritten.

Review/setup outcomes are persisted with null classification and occupancy. They update the last-attempt diagnostic while retaining the previous valid reading and placement findings. Calibration or placement changes preserve history and tasks, clear the current reading, and require fresh evidence.

## Alert state machine

- Valid Low/Empty creates an Open task or updates the existing active episode.
- Acknowledgment changes only workflow state.
- Staff reporting restocked resolves that episode, records the report, and marks Awaiting verification. The measured stock stays unchanged.
- A subsequent Low/Empty creates a new episode and clears the waiting marker.
- Valid Full resolves any active task with `Verified full` and clears the marker.
- Setup, decoding and review failures do not alter stock tasks.
- Historical placement findings remain independent of stock tasks. The simplified Alerts page includes only active stock alerts and waiting-for-verification shelves. New HTTP checks skip placement comparison.

## REST contract

| Method/path                               | Capability                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| GET `/api/health`                         | PostgreSQL readiness; 503 when unavailable                                 |
| GET `/api/store`                          | Single shared store (demo flag is not required)                            |
| GET `/api/dashboard`                      | Stock totals, unavailable count, independent placement count and attention |
| GET/POST `/api/shelves`                   | Store-scoped listing/filtering and creation                                |
| GET `/api/shelves/{id}`                   | Setup, current/last readings, tasks, diagnostics and awaiting verification |
| DELETE `/api/shelves/{id}`                | Permanently delete the shelf, photos, history, receipts and tasks          |
| POST `/api/shelves/{id}/calibration`      | Empty reference and validated ROI/settings                                 |
| POST/DELETE `/api/shelves/{id}/placement` | Expected Full reference/settings, or disable comparison                    |
| GET/POST `/api/shelves/{id}/analyses`     | Newest-first history (limit 1–200), or image analysis                      |
| GET `/api/images/{id}`                    | Owned asset metadata                                                       |
| GET/PATCH `/api/alerts/{id}`              | PATCH staff action; listing is GET `/api/alerts?state=`                    |
| POST `/api/uploads`                       | Shelf/operation-scoped direct-upload ticket, or local storage selection    |
| POST `/api/uploads/blob`                  | Scoped Blob client upload authorization                                    |

Response fields preserve the existing UI contract. Validation/image errors use 422, oversize images 413, missing records 404, uniqueness/closed-task/calibration conflicts 409, and database readiness failures 503. API responses are uncached; successful decoded review/setup analyses still return 201. Mutations retain the existing TanStack Query invalidation behavior.

## Storage and upload trust

Development retains managed PNGs under `media/` by default. Hosted storage uses a private Vercel Blob store. Browser uploads bypass the function payload limit, then send a small JSON processing request. Signed, expiring tickets bind a generated immutable object path to a shelf, operation and calibration version. The server reads only that path from its own Blob store, bounds bytes to 10 MiB, decodes PNG/JPEG with a 20-million-pixel limit, and ignores client MIME/size claims. It never fetches an arbitrary client URL.

Calibration/placement retries reuse an asset ID from the signed upload ticket, so a repeated operation does not increment calibration twice. Analysis receipts use the digest of bytes actually read by the server. Successful temporary uploads remain available for ticket retries for 15 minutes; `storage:cleanup --apply` removes uploads and other unreferenced new objects older than one hour. Handled processing failures delete the temporary upload and new artifacts. Run cleanup during maintenance; referenced images are always excluded.

Asset URLs use `/media/{asset-id}.png`. Historical local generated filenames also resolve; after durable migration the route recognizes the corresponding `blob:media/{old-filename}` key. Private media responses stream without buffering the entire asset. Trusted normalized references retain pixel limits without reapplying the original upload byte limit. Media migration verifies uploaded SHA-256 hashes before updating each asset row and retains local files for rollback. Database/filesystem/Blob do not share an atomic transaction; interrupted writes may leave orphans for maintenance cleanup.

Hosted requests require operator credentials in `src/proxy.ts` and fail closed if they are missing. Use separate PostgreSQL/Blob stores for preview and production. Configure pooled PostgreSQL URLs and private credentials as server-only environment variables. A Vercel preview remains necessary to verify provider-specific behavior before cutover.

## Source layout and dependencies

Keep this prototype as a single application. The PDF's conceptual modules describe responsibilities; they do not require separate services or a folder for every module.

```text
src/app/          Next.js pages, layouts, API and private-media routes
src/components/   Client workflows, shared UI and api-client.ts
src/server/       http.ts → shelves.ts → database.ts / storage.ts
                  shelf-analysis.ts: independent image-processing functions
                  upload-tickets.ts: hosted upload authorization
                  image-queue.ts: bounded processing queue
scripts/          Startup, migrations, demo generation, uploader and maintenance
migrations/       Immutable database schema
tests/fixtures/shelves/      Synthetic demo inputs, manifest and regression evidence
tests/           Node/Jest regressions and detector baseline
docs/            Architecture, detector, verification and deployment guides
```

Routes adapt Next.js requests to `http.ts`; `shelves.ts` owns shelf operations and transactional publication. The analysis module depends on validation and image-processing packages, never on database, HTTP or UI modules. The browser uses `api-client.ts` and never imports server modules. Operational scripts may invoke server modules, but application source must not import scripts or tests. Keep these boundaries without introducing additional package or service layers.

## Requirements and image ownership

`requirements.pdf` describes image input, basic computer vision, full/low/empty shelf status, a simple dashboard, and staff alerts. Placement detection is optional. These responsibilities map to upload controls and Route Handlers, `shelf-analysis.ts`, dashboard/detail components, and the alert workflow in `shelves.ts`. Hosting, backups and the optional folder uploader are operational support for the existing implementation, rather than additional mandatory product features.

The assessment instructions require planning documentation in Jira/Confluence and exclude execution from the assessed deliverables; a later ShelfSense section also describes a prototype. This repository implements that prototype and does not replace the required project charter, scope, WBS/Gantt, activity list, milestones, stakeholder/risk/resource records, success criteria, communication plan, reflections or presentation.

The image folders have different purposes:

- `tests/fixtures/shelves/`: five synthetic CC0 PNGs retained for frozen Full, Low, Empty, invalid-framing and historical placement regressions. One shelf has a reference, full, low and misplaced image plus an invalid-dimension image. Empty samples reuse the reference. The manifest records those relationships. There are no duplicate image bytes. Production does not bundle or read these fixtures; all checks use real upload controls. Frozen cases preserve measured baselines without changing their expected classifications. Additional sample shelves are generated deterministically in temporary directories for tests and explicit developer seeding.
- `media/`: ignored persistent uploads, references and generated analysis evidence. These are application data, not a test fixture directory. Preserve them with the database for history and rollback.
- `backend/media/`: retained legacy local data. There is no Python backend service; the legacy path stays in place to protect existing data and historical ownership.
- Tests use temporary media directories and a separate database; they clean up their own artifacts.

Unused UI screenshots, duplicate demo PNGs, the obsolete Python version file and the duplicate detector verification script were removed. Generated dependency/build/cache directories remain ignored. Do not delete saved media merely to simplify the source tree.

## User pages and initialization

The header links to `/` (Shelves) and `/help`. Legacy `/alerts` redirects to `/?view=attention`. Creation uses `/shelves/new`; setup and checks use `/shelves/[id]/setup` and `/shelves/[id]/check`. Results use `/shelves/[id]`; legacy `?setup=1` redirects to setup. The dashboard offers only All, Needs restocking and Restock reported (`?view=restocking|verification`); the legacy attention link remains supported. Old stock-filter parameters are ignored. Task membership comes from active alerts and pending verification, independently of measured stock. Mutation invalidation refreshes shelf, dashboard and alert queries.

`npm run initialize` creates a single shared store only, reuses the existing store regardless of its demo flag, and rejects ambiguous multiple-store data. Normal startup never seeds shelves. Existing records remain intact. There are no runtime sample endpoints, placement controls, or detector tuning inputs.

Shelf deletion requires confirmation in the shelf detail screen. It locks the shelf and removes its dependent records in one transaction, then removes its stored images after commit. In-flight processing cannot publish to a deleted shelf. Media cleanup failures are logged; hosted orphan objects can be removed with `npm run storage:cleanup -- --apply`.

Shelf workflows separate compact linked breadcrumbs from the page heading and location. Informational progress uses checkmarks for saved completed steps, a green numbered current step, and outlined upcoming steps. Onboarding follows Add shelf → Set up shelf → Check stock and is omitted for ordinary repeat checks. Restocking follows Needs restocking → Restock reported → Verify restocking; reporting never changes measured stock.

Noto Sans UI typography uses 14px metadata/controls, 16px body/fields, 18px panel headings and 28px page headings (implemented in rem). Collection actions are outlined, filters change background without weight changes, and task filters use shareable URLs. Photo workflows share 4:3 contained viewports with upload controls outside the image area. Setup selection remains tied to the rendered image, excluding letterboxing. Notices explicitly distinguish information, processing, success, warning and error.

Detail pages retain one primary action, previous valid results, a single failure warning and compact staff reporting. Radix Dialog provides task guidance and timestamps, DropdownMenu holds setup actions; a visible trash-labelled Delete shelf button is available inside shelf detail pages, and AlertDialog handles destructive confirmation with pending/error states and focus restoration. Collection columns follow a 20rem minimum usable card width rather than fixed breakpoint counts.

## UI styling and control boundaries

Tailwind v4 provides component layout and typography. `globals.css` contains self-hosted Noto Sans UI and Charter reading font declarations, semantic theme tokens and a minimal layered base; it has no application component selectors. `components.json` configures official shadcn Radix Nova primitives under `src/components/ui/`, installed through the CLI. Generated variants are adapted to regular/bold 400/700 weights and 40px controls (44px for touch). `src/lib/utils.ts` exposes the CLI-selected `cn` class merger. The CLI is a development dependency.

`shelf-ui.tsx` contains domain Badge/Alert wrappers and branding. `shelf-presentation.ts` derives card badge, action and one optional photo-review exception from independent measurement/task/latest-attempt fields. Setup availability controls routing; configured shelves offer Restock shelf for active tasks, Verify restock for reported refills, and Check stock otherwise. Photo failures show a review note. Badges use plain Full/Low/Empty labels; a separate task note explains restocking or a reported refill. Reporting never invents a new measurement. Restock shelf opens the detail task controls. Details retain measurement/report timestamps and photo-review reasons.

`Providers` wraps TanStack Query and the Radix tooltip provider. Interactive controls remain Client Components; pages/layouts remain Server Components. `PhotoFrame` aligns contained preview/reference images in bounded 4:3 viewports, capped at 24rem desktop height. Calibration canvas dimensions follow the actual contained image, excluding letterboxing. Only ROI coordinates use runtime inline styles. Workflow steps use explicit 32px grid-centered markers and stack below the small-screen breakpoint. Task links work with keyboard and touch; there is no separate stock-level selector.

Typography roles: Noto Sans is the default sans/heading family, bundled through Fontsource without browser requests to external font services. Charter is the serif reading family for Help paragraphs and instructions and expanded guidance bodies, with 1.75rem line height. Help headings, navigation and dialog titles/actions retain Noto Sans.


## Near-MVP scope and simple ERD

See [the simple data model](data-model.md). The testing release covers adding a shelf, empty-photo setup, uploading a current photo, Full/Low/Empty results, restocking alerts and staff reporting followed by a verifying photo. Optional misplaced-product detection is excluded from the user workflow. There are no product catalogues, SKU inventories, user-role tables, notification services or live-camera management screens.

The PDF explicitly requires Full/Low/Empty on a simple dashboard. These are photo results; All/Needs restocking/Restock reported are navigation choices. Removing the extra measured-stock selector and “Last measured” prefix simplifies the UI without changing the meaning of stored results.
