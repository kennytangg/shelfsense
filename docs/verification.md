# Verification

## Regression coverage

The application uses one initial schema in `migrations/0001.sql`. API tests exercise fresh and repeated migrations, checksum changes, unsupported migration histories, and rejection of schemas without recorded history. Tests use disposable schemas in a separate `TEST_DATABASE_URL` and temporary media.

The detector matches expected stock and placement outputs for five frozen cases in `tests/fixtures/detector-expected.json`. Tests also cover threshold equality, invalid settings, decoding failures, byte/pixel/dimension/format limits, quality rejection, and EXIF orientation. Trusted normalized references retain decoded-pixel checks while allowing PNGs larger than the original JPEG upload limit.

API regressions cover the complete restocking lifecycle, retained findings on failures, stock-only HTTP checks and historical placement compatibility, historical references, concurrent publication, receipt deduplication, calibration races, transactional rollback and generated-file cleanup, ownership constraints, upload ticket tampering, retry-safe calibration/placement, seed idempotency, and ownership-aware demo reset. Additional tests verify hosted access, bounded image processing, fixture generation, the development launcher, dependency boundaries, and complete manifest coverage without duplicate image bytes.

## Required checks

Run `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run build`. Stop development Next.js before building. Run `npm run test:browser` against the production build with a separate test database and Chromium. The browser workflow covers empty installation, creation/setup/check/result pages, keyboard area selection, invalid-photo retention, alerts, restocking, subsequent-photo verification, real uploads, reload and Back/Forward, URL filtering, mobile layout, and folder uploader stable-file/restart deduplication.

## Local verification result

On 2026-10-14, `npm run typecheck`, `npm run format:check`, `npm test` (21 Node regressions and 2 Jest launcher tests), `npm run build`, `npm run test:browser`, and Git whitespace checks passed. API/browser verification used `shelfsense_simplification_test`, disposable schemas and temporary media, with `TEST_DATABASE_URL` supplied only to the test process. The existing test database belonged to a different role and was left unchanged. No local checks were skipped. The production API trace includes zero test fixtures.

The browser workflow passed empty installation, add/setup/check/result pages, real uploads, invalid-photo retention, staff reporting and subsequent Full recovery, alerts, URL filtering with refresh and Back/Forward, legacy setup redirects, keyboard area adjustment, Help, mobile photo checks and watcher restart deduplication.

Skipped: hosted preview verification, including real private Blob and managed PostgreSQL provider behavior, because hosted credentials are unavailable. No deployment or application-data migration was performed.

## Runtime measurements

Previously measured locally: a 20-million-pixel input and maximum 1024×4096 processing size completed in approximately 9.9 seconds combined, with peak RSS around 854 MiB. The API serializes image work per isolate and limits queued work to eight requests. The traced API/media dependency set was approximately 40.7 MiB uncompressed. Recheck these measurements on the deployment target.

## Hosted verification

No hosted deployment has been verified from this workspace. Actual private Blob uploads/copies, hosted memory and duration, managed database transfer, and authenticated preview workflows require provider configuration. Follow `docs/deployment.md` before production deployment.
