import "server-only";
import { randomUUID } from "node:crypto";
import {
  query,
  transaction,
  insert,
  update,
  type Connection,
  type Row,
} from "./database";
import { readImage, writeAsset, cleanup } from "./storage";
import {
  decode,
  detect,
  comparePlacement,
  ALGORITHM_VERSION,
  type RGB,
  type Detection,
} from "./shelf-analysis";
import {
  HttpError,
  settingsSchema,
  placementSchema,
  type ROI,
  type Settings,
  type PlacementSettings,
} from "./validation";
export async function activeStore(c?: Connection) {
  const stores = await query(
    "SELECT * FROM stores ORDER BY created_at,id",
    [],
    c,
  );
  if (stores.length > 1)
    throw new HttpError(
      503,
      "Multiple stores found. Ask the operator to select the shared store before continuing.",
    );
  const s = stores[0];
  if (!s)
    throw new HttpError(
      503,
      "Store is not initialized. Run npm run initialize.",
    );
  return s;
}
export async function getShelf(id: string, c?: Connection, lock = false) {
  const store = await activeStore(c);
  const s = (
    await query(
      `SELECT * FROM shelves WHERE id=$1 AND store_id=$2${lock ? " FOR UPDATE" : ""}`,
      [id, store.id],
      c,
    )
  )[0];
  if (!s) throw new HttpError(404, "Shelf zone not found.");
  return s;
}
export async function assetOut(id: string | null, c?: Connection) {
  if (!id) return null;
  const a = (await query("SELECT * FROM image_assets WHERE id=$1", [id], c))[0];
  if (!a) throw new HttpError(404, "Image not found.");
  const { storage_key, demo, ...out } = a;
  return { ...out, url: `/media/${a.id}.png` };
}
export async function analysisOut(
  a: Row | null,
  c?: Connection,
): Promise<Row | null> {
  if (!a) return null;
  return {
    ...a,
    input: await assetOut(a.input_image_id, c),
    reference: await assetOut(a.reference_image_id, c),
    overlay: await assetOut(a.overlay_image_id, c),
    mask: await assetOut(a.mask_image_id, c),
    placement_reference: await assetOut(a.placement_reference_image_id, c),
  };
}
export async function activeAlert(id: string, c?: Connection) {
  return (
    (
      await query(
        "SELECT * FROM alerts WHERE shelf_id=$1 AND state IN ('Open','Acknowledged')",
        [id],
        c,
      )
    )[0] ?? null
  );
}
export async function alertOut(a: Row | null, c?: Connection) {
  if (!a) return null;
  const s = await getShelf(a.shelf_id, c),
    r = (
      await query(
        "SELECT occupancy_ratio FROM analyses WHERE id=$1",
        [a.analysis_id],
        c,
      )
    )[0];
  return {
    ...a,
    identifier: s.identifier,
    location: s.location,
    occupancy_ratio: r.occupancy_ratio,
    recommended_action: "Restock",
  };
}
export async function shelfOut(s: Row, c?: Connection) {
  let current = s.latest_valid_analysis_id
    ? (
        await query(
          "SELECT * FROM analyses WHERE id=$1",
          [s.latest_valid_analysis_id],
          c,
        )
      )[0]
    : null;
  if (current?.calibration_version !== s.calibration_version) current = null;
  const latest =
    (
      await query(
        "SELECT * FROM analyses WHERE shelf_id=$1 ORDER BY created_at DESC LIMIT 1",
        [s.id],
        c,
      )
    )[0] ?? null;
  return {
    id: s.id,
    identifier: s.identifier,
    name: s.name,
    location: s.location,
    category: s.category,
    demo: s.demo,
    calibration_version: s.calibration_version,
    roi: s.roi,
    settings: settingsSchema.parse(s.settings),
    placement_settings: placementSchema.parse(s.placement_settings),
    reference: await assetOut(s.reference_image_id, c),
    placement_reference: await assetOut(s.placement_reference_image_id, c),
    status: current
      ? current.classification
      : !s.reference_image_id
        ? "Needs setup"
        : s.last_error
          ? "Review required"
          : "Not checked",
    current: await analysisOut(current, c),
    latest_attempt: await analysisOut(latest, c),
    active_alert: await alertOut(await activeAlert(s.id, c), c),
    awaiting_verification: s.reported_restocked_at !== null,
    reported_restocked_at: s.reported_restocked_at,
    last_error: s.last_error,
    last_attempt_at: s.last_attempt_at,
  };
}
export async function listShelves() {
  const store = await activeStore();
  const rows = await query("SELECT * FROM shelves WHERE store_id=$1", [
    store.id,
  ]);
  const records = await Promise.all(rows.map((s) => shelfOut(s)));
  const order: Record<string, number> = {
    Empty: 0,
    Low: 1,
    "Review required": 2,
    "Needs setup": 3,
    "Not checked": 4,
    Full: 5,
  };
  return records.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      a.identifier.localeCompare(b.identifier),
  );
}
export async function createShelf(payload: Row, demo = false) {
  return transaction(async (c) => {
    const now = new Date(),
      store = await activeStore(c);
    return insert(
      "shelves",
      {
        id: randomUUID(),
        store_id: store.id,
        ...payload,
        demo,
        settings: {},
        placement_settings: {},
        calibration_version: 0,
        created_at: now,
        updated_at: now,
      },
      c,
    );
  });
}
export async function decodeUpload(id: string, bytes: Buffer) {
  await getShelf(id);
  try {
    return await decode(bytes);
  } catch (e) {
    if (e instanceof HttpError)
      await transaction(async (c) => {
        await getShelf(id, c, true);
        await update(
          "shelves",
          id,
          {
            last_error: e.message,
            last_attempt_at: new Date(),
            updated_at: new Date(),
          },
          c,
        );
      });
    throw e;
  }
}
export async function calibrate(
  id: string,
  image: RGB,
  config: { roi: ROI; settings: Settings },
  demo = false,
  options: { uploadId?: string; expectedVersion?: number } = {},
) {
  if (
    options.uploadId &&
    (
      await query(
        "SELECT id FROM image_assets WHERE id=$1 AND shelf_id=$2 AND role='Reference'",
        [options.uploadId, id],
      )
    ).length
  )
    return options.uploadId;
  if (
    Math.min(config.roi.width * image.width, config.roi.height * image.height) <
    32
  )
    throw new HttpError(
      422,
      "ROI must span at least 32 source pixels per side.",
    );
  const result = await detect(image, image, config.roi, config.settings);
  if (result.outcome !== "Valid")
    throw new HttpError(
      422,
      "Reference unusable: " + result.warnings.join("; "),
    );
  const keys: string[] = [];
  try {
    const asset = await writeAsset(
      id,
      image,
      "Reference",
      demo,
      keys,
      options.uploadId,
    );
    let duplicate = false;
    await transaction(async (c) => {
      const s = await getShelf(id, c, true);
      if (
        options.uploadId &&
        (
          await query(
            "SELECT id FROM image_assets WHERE id=$1 AND shelf_id=$2",
            [options.uploadId, id],
            c,
          )
        ).length
      ) {
        duplicate = true;
        return;
      }
      if (
        options.expectedVersion !== undefined &&
        s.calibration_version !== options.expectedVersion
      )
        throw new HttpError(409, "Calibration changed; reload setup.");
      await insert("image_assets", asset, c);
      await update(
        "shelves",
        id,
        {
          reference_image_id: asset.id,
          placement_reference_image_id: null,
          roi: config.roi,
          settings: config.settings,
          calibration_version: s.calibration_version + 1,
          latest_valid_analysis_id: null,
          last_error: null,
          last_attempt_at: null,
          updated_at: new Date(),
        },
        c,
      );
    });
    if (duplicate) await cleanup(keys);
    return asset.id;
  } catch (e) {
    await cleanup(keys);
    throw e;
  }
}
export async function configurePlacement(
  id: string,
  image: RGB,
  settings: PlacementSettings,
  version: number,
  demo = false,
  uploadId?: string,
) {
  if (
    uploadId &&
    (
      await query(
        "SELECT id FROM image_assets WHERE id=$1 AND shelf_id=$2 AND role='PlacementReference'",
        [uploadId, id],
      )
    ).length
  )
    return uploadId;
  const s = await getShelf(id);
  if (!s.reference_image_id || s.calibration_version !== version)
    throw new HttpError(
      409,
      "Save stock calibration first, then reload placement setup.",
    );
  const a = (
    await query("SELECT * FROM image_assets WHERE id=$1", [
      s.reference_image_id,
    ])
  )[0];
  const empty = await decode(await readImage(a.storage_key), true);
  const result = await detect(
    empty,
    image,
    s.roi,
    settingsSchema.parse(s.settings),
  );
  if (result.outcome !== "Valid" || result.classification !== "Full")
    throw new HttpError(
      422,
      "Use a correctly arranged Full shelf photo with matching framing.",
    );
  const keys: string[] = [];
  try {
    const asset = await writeAsset(
      id,
      image,
      "PlacementReference",
      demo,
      keys,
      uploadId,
    );
    let duplicate = false;
    await transaction(async (c) => {
      const locked = await getShelf(id, c, true);
      if (
        uploadId &&
        (
          await query(
            "SELECT id FROM image_assets WHERE id=$1 AND shelf_id=$2",
            [uploadId, id],
            c,
          )
        ).length
      ) {
        duplicate = true;
        return;
      }
      if (locked.calibration_version !== version)
        throw new HttpError(
          409,
          "Calibration changed; reload placement setup.",
        );
      await insert("image_assets", asset, c);
      await update(
        "shelves",
        id,
        {
          placement_reference_image_id: asset.id,
          placement_settings: settings,
          calibration_version: version + 1,
          latest_valid_analysis_id: null,
          last_error: null,
          last_attempt_at: null,
          updated_at: new Date(),
        },
        c,
      );
    });
    if (duplicate) await cleanup(keys);
    return asset.id;
  } catch (e) {
    await cleanup(keys);
    throw e;
  }
}
export async function disablePlacement(id: string) {
  await transaction(async (c) => {
    const s = await getShelf(id, c, true);
    if (s.placement_reference_image_id)
      await update(
        "shelves",
        id,
        {
          placement_reference_image_id: null,
          calibration_version: s.calibration_version + 1,
          latest_valid_analysis_id: null,
          last_error: null,
          last_attempt_at: null,
          updated_at: new Date(),
        },
        c,
      );
  });
}
export async function updateAlert(s: Row, a: Row, c: Connection) {
  const alert = await activeAlert(s.id, c);
  if (a.classification === "Full") {
    if (alert)
      await update(
        "alerts",
        alert.id,
        {
          state: "Resolved",
          resolution_reason: "Verified full",
          resolved_at: a.created_at,
        },
        c,
      );
  } else if (alert)
    await update(
      "alerts",
      alert.id,
      {
        analysis_id: a.id,
        severity: a.classification,
        last_detected_at: a.created_at,
      },
      c,
    );
  else
    await insert(
      "alerts",
      {
        id: randomUUID(),
        shelf_id: s.id,
        analysis_id: a.id,
        severity: a.classification,
        state: "Open",
        first_detected_at: a.created_at,
        last_detected_at: a.created_at,
      },
      c,
    );
  await update("shelves", s.id, { reported_restocked_at: null }, c);
}
export type AnalysisOptions = {
  demo?: boolean;
  stockOnly?: boolean;
  timestamp?: Date;
  digest?: string;
  expectedVersion?: number;
  beforePublish?: () => Promise<void>;
};
export async function analyze(
  id: string,
  image: RGB,
  options: AnalysisOptions = {},
) {
  const s = await getShelf(id),
    version = s.calibration_version;
  if (
    options.expectedVersion !== undefined &&
    options.expectedVersion !== version
  )
    throw new HttpError(409, "Calibration changed; retry the monitored image.");
  const receipt = async (c?: Connection) =>
    options.digest
      ? (
          await query(
            "SELECT analysis_id FROM ingestion_receipts WHERE shelf_id=$1 AND calibration_version=$2 AND digest=$3",
            [id, version, options.digest],
            c,
          )
        )[0]
      : null;
  const existing = await receipt();
  if (existing) return existing.analysis_id;
  const load = async (assetId: string) => {
    const a = (
      await query("SELECT storage_key FROM image_assets WHERE id=$1", [assetId])
    )[0];
    return decode(await readImage(a.storage_key), true);
  };
  let result: Detection = {
    outcome: "Needs setup",
    classification: null,
    occupancy_ratio: null,
    warnings: ["Upload an empty reference and select an ROI first."],
    duration_ms: 0,
  };
  let placement = null;
  if (s.reference_image_id) {
    const ref = await load(s.reference_image_id);
    result = await detect(ref, image, s.roi, settingsSchema.parse(s.settings));
    if (s.placement_reference_image_id && !options.stockOnly) {
      const start = performance.now();
      placement = await comparePlacement(
        ref,
        await load(s.placement_reference_image_id),
        image,
        s.roi,
        settingsSchema.parse(s.settings),
        placementSchema.parse(s.placement_settings),
        result,
      );
      result.duration_ms += performance.now() - start;
    }
  }
  const keys: string[] = [];
  try {
    const input = await writeAsset(
        id,
        image,
        "Input",
        options.demo ?? false,
        keys,
      ),
      overlay = result.overlay
        ? await writeAsset(
            id,
            result.overlay,
            "Overlay",
            options.demo ?? false,
            keys,
          )
        : null,
      mask = result.mask
        ? await writeAsset(id, result.mask, "Mask", options.demo ?? false, keys)
        : null;
    await options.beforePublish?.();
    const published = await transaction(async (c) => {
      const locked = await getShelf(id, c, true);
      if (locked.calibration_version !== version)
        throw new HttpError(
          409,
          "Calibration changed during processing. Submit a new image.",
        );
      const duplicate = await receipt(c);
      if (duplicate) return { id: duplicate.analysis_id, duplicate: true };
      for (const a of [input, overlay, mask])
        if (a) await insert("image_assets", a, c);
      const analysis = await insert(
        "analyses",
        {
          id: randomUUID(),
          shelf_id: id,
          input_image_id: input.id,
          reference_image_id: s.reference_image_id,
          placement_reference_image_id: s.placement_reference_image_id,
          placement_result: placement,
          overlay_image_id: overlay?.id ?? null,
          mask_image_id: mask?.id ?? null,
          outcome: result.outcome,
          classification: result.classification,
          occupancy_ratio: result.occupancy_ratio,
          warnings: result.warnings,
          algorithm_version: ALGORITHM_VERSION,
          calibration_version: version,
          snapshot: {
            roi: s.roi,
            settings: s.settings,
            placement_settings: s.placement_reference_image_id
              ? s.placement_settings
              : null,
          },
          duration_ms: result.duration_ms,
          created_at: options.timestamp ?? new Date(),
        },
        c,
      );
      if (options.digest)
        await insert(
          "ingestion_receipts",
          {
            shelf_id: id,
            calibration_version: version,
            digest: options.digest,
            analysis_id: analysis.id,
          },
          c,
        );
      await update(
        "shelves",
        id,
        {
          last_attempt_at: analysis.created_at,
          last_error: result.warnings.join("; ") || null,
          ...(result.outcome === "Valid"
            ? { latest_valid_analysis_id: analysis.id }
            : {}),
          updated_at: new Date(),
        },
        c,
      );
      if (result.outcome === "Valid") await updateAlert(locked, analysis, c);
      return { id: analysis.id, duplicate: false };
    });
    if (published.duplicate) await cleanup(keys);
    return published.id;
  } catch (e) {
    await cleanup(keys);
    throw e;
  }
}
export async function staffAction(id: string, action: string) {
  await transaction(async (c) => {
    const a = (await query("SELECT * FROM alerts WHERE id=$1", [id], c))[0];
    if (!a) throw new HttpError(404, "Alert not found.");
    const s = await getShelf(a.shelf_id, c, true);
    const current = (
      await query("SELECT * FROM alerts WHERE id=$1", [id], c)
    )[0];
    if (current.state === "Resolved")
      throw new HttpError(
        409,
        "This task is already closed. Refresh to see the current task.",
      );
    const now = new Date();
    if (action === "acknowledge")
      await update(
        "alerts",
        id,
        {
          state: "Acknowledged",
          acknowledged_at: current.acknowledged_at ?? now,
        },
        c,
      );
    else {
      await update(
        "alerts",
        id,
        {
          state: "Resolved",
          resolution_reason: "Staff reported restocked",
          resolved_at: now,
        },
        c,
      );
      await update(
        "shelves",
        s.id,
        { reported_restocked_at: now, updated_at: now },
        c,
      );
    }
  });
}
