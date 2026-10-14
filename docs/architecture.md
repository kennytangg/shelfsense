# Architecture and API

The browser uses the existing React and TanStack Query UI. Relative `/api` and `/media` requests go directly to Node.js Next.js Route Handlers. Server-only modules in `src/server/` own PostgreSQL, validation, private storage, analysis publication, and staff actions. `detector.ts` remains independent of persistence and UI. Pages/layouts are Server Components; interactive workflows are Client Components. Database credentials and image-processing libraries stay out of browser bundles.

## Data and transactions

The six domain tables are `stores`, `shelves`, `image_assets`, `analyses`, `alerts`, and `ingestion_receipts`. The initial SQL migration defines same-shelf composite foreign keys, valid measurement/state checks, unique store/identifier pairs, and partial unique index for one active alert per shelf. The migration journal is infrastructure metadata. The single initial migration is checksum-verified on repeat execution. Existing schemas without matching migration history are rejected; start with a fresh database. Migration execution is explicit at local startup or release, never inside request processing. Unsupported histories and missing required ownership constraints/indexes abort migration.

Image decoding and processing occur outside database transactions. Analysis reads a calibration snapshot, processes and writes new immutable assets, then locks the shelf and rechecks its version. Asset metadata, analysis, latest reading, alert changes and ingestion receipt commit together. Competing analyses and staff actions serialize on the shelf lock. Concurrent receipt duplicates return the existing analysis and clean up their generated files. Calibration races return 409 and remove new assets. Handled persistence failures roll back rows and remove new files; historical files are never overwritten.

Review/setup outcomes are persisted with null classification and occupancy. They update the last-attempt diagnostic while retaining the previous valid reading and placement findings. Calibration or placement changes preserve history and tasks, clear the current reading, and require fresh evidence.

## Alert state machine

- Valid Low/Empty creates an Open task or updates the existing active episode.
- Acknowledgment changes only workflow state.
- Staff reporting restocked resolves that episode, records the report, and marks Awaiting verification. The measured stock stays unchanged.
- A subsequent Low/Empty creates a new episode and clears the waiting marker.
- Valid Full resolves any active task with `Verified full` and clears the marker.
- Setup, decoding and review failures do not alter stock tasks.
- Placement findings add dashboard attention, including Full shelves, independently of stock tasks.

## REST contract

| Method/path | Capability |
| --- | --- |
| GET `/api/health` | PostgreSQL readiness; 503 when unavailable |
| GET `/api/store` | Active seeded store |
| GET `/api/dashboard` | Stock totals, unavailable count, independent placement count and attention |
| GET/POST `/api/shelves` | Store-scoped listing/filtering and creation |
| GET `/api/shelves/{id}` | Setup, current/last readings, tasks, diagnostics and awaiting verification |
| POST `/api/shelves/{id}/calibration` | Empty reference and validated ROI/settings |
| POST/DELETE `/api/shelves/{id}/placement` | Expected Full reference/settings, or disable comparison |
| GET/POST `/api/shelves/{id}/analyses` | Newest-first history (limit 1–200), or image analysis |
| GET `/api/images/{id}` | Owned asset metadata |
| GET/PATCH `/api/alerts/{id}` | PATCH staff action; listing is GET `/api/alerts?state=` |
| POST `/api/shelves/{id}/demo-analysis` | Allowlisted synthetic sample |
| POST `/api/shelves/{id}/demo-placement` | Explicit synthetic expected-layout setup |
| POST `/api/uploads` | Shelf/operation-scoped direct-upload ticket, or local storage selection |
| POST `/api/uploads/blob` | Scoped Blob client upload authorization |

Response fields preserve the existing UI contract. Validation/image errors use 422, oversize images 413, missing records 404, uniqueness/closed-task/calibration conflicts 409, and database readiness failures 503. API responses are uncached; successful decoded review/setup analyses still return 201. Mutations retain the existing TanStack Query invalidation behavior.

## Storage and upload trust

Development retains managed PNGs under `media/` by default. Hosted storage uses a private Vercel Blob store. Browser uploads bypass the function payload limit, then send a small JSON processing request. Signed, expiring tickets bind a generated immutable object path to a shelf, operation and calibration version. The server reads only that path from its own Blob store, bounds bytes to 10 MiB, decodes PNG/JPEG with a 20-million-pixel limit, and ignores client MIME/size claims. It never fetches an arbitrary client URL.

Calibration/placement retries reuse an asset ID from the signed upload ticket, so a repeated operation does not increment calibration twice. Analysis receipts use the digest of bytes actually read by the server. Successful temporary uploads remain available for ticket retries for 15 minutes; `storage:cleanup --apply` removes uploads and other unreferenced new objects older than one hour. Handled processing failures delete the temporary upload and new artifacts. Run cleanup during maintenance; referenced images are always excluded.

Asset URLs use `/media/{asset-id}.png`. Historical local generated filenames also resolve; after durable migration the route recognizes the corresponding `blob:media/{old-filename}` key. Private media responses stream without buffering the entire asset. Trusted normalized references retain pixel limits without reapplying the original upload byte limit. Media migration verifies uploaded SHA-256 hashes before updating each asset row and retains local files for rollback. Database/filesystem/Blob do not share an atomic transaction; interrupted writes may leave orphans for maintenance cleanup.

Hosted requests require operator credentials in `src/proxy.ts` and fail closed if they are missing. Use separate PostgreSQL/Blob stores for preview and production. Configure pooled PostgreSQL URLs and private credentials as server-only environment variables. A Vercel preview remains necessary to verify provider-specific behavior before cutover.
