# Testing data

`npm run seed` adds nine shelves, `DEMO-01` to `DEMO-09`, defined in `scripts/maintenance.ts`. Shelves that already exist are left unchanged. `npm run reset-demo` removes only demo shelves that hold no user-owned images.

All examples use one calibration (reference image and monitored area) from the first shelf in `tests/fixtures/manifest.json`. `scripts/fixtures.ts` writes five shared synthetic inputs to a temporary directory for seeding: reference, full, low, misplaced and mismatched. An empty photo reuses the reference. Source images live in `tests/fixtures/shelves/` and are never user photos. Seeded checks save only the input photo (no overlay or mask).

| Shelf   | Name      | Demonstrates                                                                                       |
| ------- | --------- | -------------------------------------------------------------------------------------------------- |
| DEMO-01 | Cereals 1 | Low stock: Low result and an active restocking task                                                |
| DEMO-02 | Cereals 2 | Full stock: no task                                                                                |
| DEMO-03 | Cereals 3 | Empty stock: Empty result and a task                                                               |
| DEMO-04 | Cereals 4 | Misplaced products with placement configured (placement finding is API-only)                       |
| DEMO-05 | Cereals 5 | Full stock with placement configured and matching                                                  |
| DEMO-06 | Cereals 6 | Empty stock with placement configured                                                              |
| DEMO-07 | Cereals 7 | Low reading followed by a rejected (mismatched) photo; the earlier valid reading and task are kept |
| DEMO-08 | Cereals 8 | Low reading with staff having reported a restock, awaiting a verifying photo                       |
| DEMO-09 | Cereals 9 | Shelf with no setup: shows Not checked                                                             |

Expected detector values for the frozen images are in `tests/fixtures/detector-expected.json`.
