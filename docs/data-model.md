# Data model

Six tables, defined in `migrations/0001.sql` and adjusted by `0002.sql`.

- `stores`: one shared store. A partial unique index allows at most one row with `demo = true`.
- `shelves`: belongs to a store; `(store_id, identifier)` is unique. Holds the empty reference image, monitored area (`roi`), settings, an integer `calibration_version`, the latest valid analysis, the last error and attempt time, and when staff reported a restock.
- `image_assets`: every stored image (role Reference, Input, Overlay, Mask or PlacementReference) with a unique `storage_key`, size and dimensions.
- `analyses`: one row per check. `outcome` is Valid, Review required or Needs setup; `classification` is Full, Low or Empty; `occupancy_ratio` is 0 to 1. Also stores warnings, algorithm and calibration versions and the calibration snapshot used.
- `alerts`: restocking task for a shelf with severity Low or Empty and state Open, Acknowledged or Resolved.
- `ingestion_receipts`: one row per shelf, calibration version and SHA-256 digest of the original bytes, pointing at the analysis it produced. Used to return the existing result for a repeated upload.

## Constraints that matter

- Same-shelf foreign keys: `image_assets`, `analyses` and `alerts` are referenced by `(id, shelf_id)`, so a shelf can only point at its own images, analyses and tasks.
- `one_active_alert_per_shelf`: a partial unique index on `alerts(shelf_id)` for state Open or Acknowledged. A shelf has at most one active restocking task.
- `analyses_check`: a Valid analysis must have a classification, a coverage ratio and a reference image; any other outcome must have neither classification nor coverage. Migration 0001 also required overlay and mask images; migration 0002 dropped that so ordinary checks can keep only the input photo. A database still on 0001 rejects such checks with a violation of this constraint, which the API reports as 503 asking for `npm run migrate`.
- Range checks: `calibration_version >= 0`, image width, height and size above zero, `occupancy_ratio` between 0 and 1, digest as 64 lowercase hex characters.
- Placement reference images follow the same same-shelf ownership rule (added in 0001's later statements).

Migrations are immutable and checksum-verified; see [architecture](architecture.md) for how data is published transactionally.
