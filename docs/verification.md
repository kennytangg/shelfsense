# Verification

## Regression coverage

The application uses one initial schema in `migrations/0001.sql`. API tests exercise fresh and repeated migrations, checksum changes, unsupported migration histories, and rejection of schemas without recorded history. Tests use disposable schemas in a separate `TEST_DATABASE_URL` and temporary media.

The detector matches expected stock and placement outputs for all 60 bundled samples in `tests/fixtures/detector-expected.json`. Tests also cover threshold equality, invalid settings, decoding failures, byte/pixel/dimension/format limits, quality rejection, and EXIF orientation. Trusted normalized references retain decoded-pixel checks while allowing PNGs larger than the original JPEG upload limit.

API regressions cover the complete restocking lifecycle, retained findings on failures, independent placement attention, historical references, concurrent publication, receipt deduplication, calibration races, transactional rollback and generated-file cleanup, ownership constraints, upload ticket tampering, retry-safe calibration/placement, seed idempotency, and ownership-aware demo reset. Additional tests verify hosted access, bounded image processing, fixture generation, and the development launcher.

## Required checks

Run `npm run typecheck`, `npm run format:check`, `npm test`, and `npm run build`. Stop development Next.js before building. Run `npm run test:browser` against the production build with a separate test database and Chromium. The browser workflow covers desktop/mobile layout, placement setup/review/disable, restocking, subsequent-photo verification, uploads, history/reload, dashboard filtering, immutable evidence, and folder uploader stable-file/restart deduplication.

## Local verification result

Verified on 2026-10-14: typecheck, formatting, all 18 Node tests and 2 Jest tests (zero skips), production build, production browser workflows, and Git whitespace checks passed. Database and browser checks used the separate local test database with temporary media. Hosted verification remains pending.

## Runtime measurements

Previously measured locally: a 20-million-pixel input and maximum 1024×4096 processing size completed in approximately 9.9 seconds combined, with peak RSS around 854 MiB. The API serializes image work per isolate and limits queued work to eight requests. The traced API/media dependency set was approximately 40.7 MiB uncompressed. Recheck these measurements on the deployment target.

## Hosted verification

No hosted deployment has been verified from this workspace. Actual private Blob uploads/copies, hosted memory and duration, managed database transfer, and authenticated preview workflows require provider configuration. Follow `docs/deployment.md` before production deployment.
