import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env", quiet: true });
const application = process.env.DATABASE_URL;
const target = process.env.TEST_DATABASE_URL;
const enabled = !!target;
let admin: Pool, schema: string, media: string;
let db: typeof import("../src/server/database"),
  service: typeof import("../src/server/shelves"),
  api: typeof import("../src/server/http"),
  migration: typeof import("../scripts/migrate");
const paths = ["reference", "low", "empty", "full", "misplaced", "mismatched"];
const images: Record<string, Buffer> = {};
const roi = { x: 0.05, y: 0.1, width: 0.9, height: 0.8 };
before(async () => {
  if (!target) return;
  const url = new URL(target),
    app = application ? new URL(application) : null;
  if (
    url.protocol !== "postgresql:" ||
    !url.pathname ||
    url.pathname === app?.pathname
  )
    throw Error("TEST_DATABASE_URL must name a separate PostgreSQL database");
  schema = "test_" + randomUUID().replaceAll("-", "");
  admin = new Pool({ connectionString: url.toString() });
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set("options", `-csearch_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  media = await mkdtemp(tmpdir() + "/shelfsense-node-");
  process.env.MEDIA_DIR = media;
  db = await import("../src/server/database");
  service = await import("../src/server/shelves");
  api = await import("../src/server/http");
  migration = await import("../scripts/migrate");
  await migration.migrate();
  const { initialize } = await import("../scripts/maintenance");
  await initialize();
  for (const name of paths)
    images[name] = await readFile(
      `tests/fixtures/shelves/${name === "reference" || name === "empty" ? "sh-01-reference" : name === "mismatched" ? "mismatched" : "sh-01-" + name}.png`,
    );
});
after(async () => {
  if (!admin) return;
  await db.pool().end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await rm(media, { recursive: true, force: true });
});
async function request(path: string, method = "GET", payload?: unknown) {
  let body: BodyInit | undefined,
    headers: Record<string, string> = {};
  if (payload instanceof FormData) body = payload;
  else if (payload !== undefined) {
    body = JSON.stringify(payload);
    headers = { "Content-Type": "application/json" };
  }
  return api.handle(
    new Request("http://localhost/api" + path, { method, body, headers }),
  );
}
async function create() {
  const response = await request("/shelves", "POST", {
    identifier: "TEST-" + randomUUID().slice(0, 8),
    name: "Test shelf",
    location: "Aisle 1",
  });
  assert.equal(response.status, 201);
  return (await response.json()).id as string;
}
async function upload(
  id: string,
  name: string,
  op = "analyses",
  fields: Record<string, string> = {},
) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(images[name] ?? Buffer.from("broken"))], {
      type: "image/png",
    }),
    "test.png",
  );
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const r = await request(`/shelves/${id}/${op}`, "POST", form);
  return { status: r.status, data: await r.json() };
}
async function calibrate(id: string) {
  const r = await upload(id, "reference", "calibration", {
    config: JSON.stringify({ roi }),
  });
  assert.equal(r.status, 200);
  return r.data;
}
async function detail(id: string) {
  return (await request("/shelves/" + id)).json();
}
const integration = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !enabled ? "TEST_DATABASE_URL required" : false }, fn);
integration(
  "shared store initialization is empty, idempotent and rejects ambiguous ownership",
  async () => {
    const { initialize } = await import("../scripts/maintenance");
    const before = await service.activeStore();
    assert.equal(before.demo, false);
    assert.deepEqual(await service.listShelves(), []);
    await initialize();
    assert.equal((await service.activeStore()).id, before.id);
    const response = await request("/shelves", "POST", {
      name: "First shelf",
      location: "Entry aisle",
    });
    assert.equal(response.status, 201);
    const shelf = await response.json();
    assert.match(shelf.identifier, /^shelf-[A-Za-z0-9_-]+$/);
    await initialize();
    assert.equal((await detail(shelf.id)).name, "First shelf");
    const other = await db.insert("stores", {
      id: randomUUID(),
      name: "Ambiguous store",
      demo: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    try {
      await assert.rejects(initialize, /Multiple stores/);
      await assert.rejects(service.activeStore, /Multiple stores/);
    } finally {
      await db.query("DELETE FROM stores WHERE id=$1", [other.id]);
    }
  },
);
integration(
  "fresh migrations and repeat execution preserve existing records",
  async () => {
    const before = await db.query("SELECT * FROM stores");
    await migration.migrate();
    assert.deepEqual(await db.query("SELECT * FROM stores"), before);
    assert.equal(
      (await db.query("SELECT * FROM shelfsense_migrations")).length,
      1,
    );
  },
);
integration(
  "complete restocking lifecycle preserves measured stock until a new photo",
  async () => {
    const id = await create();
    assert.equal((await detail(id)).status, "Needs setup");
    await calibrate(id);
    assert.equal((await detail(id)).status, "Not checked");
    const low = await upload(id, "low");
    assert.equal(low.data.classification, "Low");
    const alert = (await detail(id)).active_alert;
    await upload(id, "empty");
    assert.equal((await detail(id)).active_alert.id, alert.id);
    assert.equal(
      (await request("/alerts/" + alert.id, "PATCH", { action: "acknowledge" }))
        .status,
      200,
    );
    assert.equal((await detail(id)).status, "Empty");
    await request("/alerts/" + alert.id, "PATCH", {
      action: "report_restocked",
    });
    let s = await detail(id);
    assert.equal(s.status, "Empty");
    assert.equal(s.awaiting_verification, true);
    assert.equal(s.active_alert, null);
    assert.equal(
      (await request("/alerts/" + alert.id, "PATCH", { action: "acknowledge" }))
        .status,
      409,
    );
    await upload(id, "low");
    const next = (await detail(id)).active_alert;
    assert.notEqual(next.id, alert.id);
    await upload(id, "full");
    s = await detail(id);
    assert.equal(s.status, "Full");
    assert.equal(s.active_alert, null);
    assert.equal(s.awaiting_verification, false);
    assert.equal((await request(`/shelves/${id}/analyses`)).status, 200);
    assert.equal((await request("/images/" + low.data.input.id)).status, 200);
  },
);
integration(
  "invalid and unreliable attempts retain previous findings and tasks",
  async () => {
    const id = await create();
    await calibrate(id);
    const valid = await upload(id, "low"),
      alert = (await detail(id)).active_alert;
    assert.equal((await upload(id, "broken")).status, 422);
    assert.equal((await detail(id)).current.id, valid.data.id);
    assert.ok((await detail(id)).last_error);
    const review = await upload(id, "mismatched");
    assert.equal(review.status, 201);
    assert.equal(review.data.classification, null);
    assert.equal((await detail(id)).current.id, valid.data.id);
    assert.equal((await detail(id)).active_alert.id, alert.id);
    await calibrate(id);
    assert.equal((await detail(id)).current, null);
    assert.equal((await detail(id)).active_alert.id, alert.id);
    assert.ok((await request(`/shelves/${id}/analyses`)).status === 200);
  },
);
integration(
  "placement setup, history and review stay independent of stock tasks",
  async () => {
    const id = await create();
    await calibrate(id);
    const low = await upload(id, "low"),
      alert = (await detail(id)).active_alert;
    const version = (await detail(id)).calibration_version;
    assert.equal(
      (
        await upload(id, "low", "placement", {
          config: "{}",
          calibration_version: String(version),
        })
      ).status,
      422,
    );
    assert.equal((await detail(id)).current.id, low.data.id);
    assert.equal(
      (
        await upload(id, "full", "placement", {
          config: "{}",
          calibration_version: String(version),
        })
      ).status,
      200,
    );
    assert.equal((await detail(id)).active_alert.id, alert.id);
    assert.equal((await detail(id)).current, null);
    // Historical service callers can still compare placement; new HTTP checks are stock-only.
    const historicalId = await service.analyze(
      id,
      await (
        await import("../src/server/shelf-analysis")
      ).decode(images.misplaced),
    );
    const actual = {
      data: await service.analysisOut(
        (
          await db.query("SELECT * FROM analyses WHERE id=$1", [historicalId])
        )[0],
      ),
    };
    assert.ok(actual.data);
    assert.equal(actual.data.classification, "Full");
    assert.equal(actual.data.placement_result.status, "Placement review");
    assert.equal((await detail(id)).active_alert, null);
    await upload(id, "mismatched");
    assert.equal((await detail(id)).current.id, actual.data.id);
    const dash = await (await request("/dashboard")).json();
    assert.ok(dash.attention.some((s: { id: string }) => s.id === id));
    assert.ok(dash.placement_review > 0);
    const stockOnly = await upload(id, "misplaced");
    assert.equal(stockOnly.data.placement_result, null);
    assert.ok((await detail(id)).placement_reference);
    assert.equal(
      (await request(`/shelves/${id}/placement`, "DELETE")).status,
      200,
    );
    assert.equal((await detail(id)).placement_reference, null);
    const history = await (await request(`/shelves/${id}/analyses`)).json();
    assert.equal(
      history.find((a: { id: string }) => a.id === historicalId)
        .placement_reference.id,
      actual.data.placement_reference.id,
    );
  },
);
integration(
  "concurrent publications serialize and deduplicate by shelf/version/digest",
  async () => {
    const id = await create();
    await calibrate(id);
    const { decode } = await import("../src/server/shelf-analysis"),
      image = await decode(images.low),
      digest = createHash("sha256").update(images.low).digest("hex");
    const before = (await readdir(media)).length;
    const ids = await Promise.all(
      [1, 2, 3].map(() => service.analyze(id, image, { digest })),
    );
    assert.equal(new Set(ids).size, 1);
    assert.equal((await readdir(media)).length - before, 3);
    assert.equal(
      (await db.query("SELECT * FROM alerts WHERE shelf_id=$1", [id])).length,
      1,
    );
    await calibrate(id);
    assert.notEqual(await service.analyze(id, image, { digest }), ids[0]);
  },
);
integration(
  "stale calibration and failed persistence roll back records and generated files",
  async () => {
    const id = await create();
    await calibrate(id);
    const { decode } = await import("../src/server/shelf-analysis"),
      image = await decode(images.low);
    const before = await readdir(media);
    await assert.rejects(
      service.analyze(id, image, {
        beforePublish: async () => {
          await db.query(
            "UPDATE shelves SET calibration_version=calibration_version+1 WHERE id=$1",
            [id],
          );
        },
      }),
      { status: 409 },
    );
    assert.deepEqual((await readdir(media)).sort(), before.sort());
    assert.equal(
      (await db.query("SELECT * FROM analyses WHERE shelf_id=$1", [id])).length,
      0,
    );
    await admin.query(
      `ALTER TABLE ${schema}.alerts ADD CONSTRAINT reject_test_alert CHECK(shelf_id <> '${id}')`,
    );
    try {
      await assert.rejects(
        service.analyze(id, image, { digest: "a".repeat(64) }),
      );
    } finally {
      await admin.query(
        `ALTER TABLE ${schema}.alerts DROP CONSTRAINT reject_test_alert`,
      );
    }
    assert.deepEqual((await readdir(media)).sort(), before.sort());
    assert.equal(
      (
        await db.query("SELECT * FROM ingestion_receipts WHERE shelf_id=$1", [
          id,
        ])
      ).length,
      0,
    );
  },
);
integration(
  "same-shelf ownership and single-active-alert constraints remain enforced",
  async () => {
    const id = await create(),
      other = await create();
    await calibrate(id);
    const low = await upload(id, "low");
    await assert.rejects(
      db.query("UPDATE shelves SET reference_image_id=$1 WHERE id=$2", [
        low.data.reference.id,
        other,
      ]),
    );
    await assert.rejects(
      db.insert("alerts", {
        id: randomUUID(),
        shelf_id: id,
        analysis_id: low.data.id,
        severity: "Low",
        state: "Open",
        first_detected_at: new Date(),
        last_detected_at: new Date(),
      }),
    );
    await assert.rejects(
      db.query("UPDATE analyses SET occupancy_ratio=1.5 WHERE id=$1", [
        low.data.id,
      ]),
    );
    assert.equal((await request("/shelves/missing")).status, 404);
    assert.equal(
      (await request(`/shelves/${id}/analyses?limit=201`)).status,
      422,
    );
    assert.equal(
      (
        await request(`/shelves/${id}/demo-analysis`, "POST", {
          sample: "../../etc/passwd",
        })
      ).status,
      404,
    );
  },
);

integration(
  "migration rejects missing history and changed checksums without losing records",
  async () => {
    const before = await db.query("SELECT * FROM stores");
    const [entry] = await db.query("SELECT * FROM shelfsense_migrations");
    try {
      await db.query("DELETE FROM shelfsense_migrations");
      await assert.rejects(migration.migrate(), /no migration history/);
      assert.deepEqual(await db.query("SELECT * FROM stores"), before);
      await db.query(
        "INSERT INTO shelfsense_migrations(version,checksum) VALUES($1,$2)",
        [entry.version, "changed"],
      );
      await assert.rejects(
        migration.migrate(),
        /Applied migration 0001 changed/,
      );
      await db.query("UPDATE shelfsense_migrations SET version='0002'");
      await assert.rejects(
        migration.migrate(),
        /Unsupported migration history/,
      );
      assert.deepEqual(await db.query("SELECT * FROM stores"), before);
    } finally {
      await db.query("DELETE FROM shelfsense_migrations");
      await db.query(
        "INSERT INTO shelfsense_migrations(version,checksum) VALUES($1,$2)",
        [entry.version, entry.checksum],
      );
    }
  },
);
integration(
  "upload tickets validate ownership and retry calibration/placement once",
  async () => {
    const id = await create(),
      { decode } = await import("../src/server/shelf-analysis"),
      { calibrationSchema, placementSchema } = await import(
        "../src/server/validation"
      );
    const uploadId = randomUUID(),
      config = calibrationSchema.parse({ roi }),
      image = await decode(images.reference);
    await service.calibrate(id, image, config, false, {
      uploadId,
      expectedVersion: 0,
    });
    await service.calibrate(id, image, config, false, {
      uploadId,
      expectedVersion: 0,
    });
    assert.equal((await detail(id)).calibration_version, 1);
    const layoutId = randomUUID(),
      full = await decode(images.full);
    await service.configurePlacement(
      id,
      full,
      placementSchema.parse({}),
      1,
      false,
      layoutId,
    );
    await service.configurePlacement(
      id,
      full,
      placementSchema.parse({}),
      1,
      false,
      layoutId,
    );
    assert.equal((await detail(id)).calibration_version, 2);
    const uploads = await import("../src/server/upload-tickets");
    process.env.BLOB_READ_WRITE_TOKEN = "test-configured";
    process.env.UPLOAD_SIGNING_SECRET = "test-only-secret-for-validation";
    try {
      const ticket = await uploads.uploadTicket(id, "analyses");
      const verified = uploads.verifyTicket(ticket.ticket);
      assert.equal(verified.shelf, id);
      assert.equal(verified.version, 2);
      assert.throws(() => uploads.verifyTicket(ticket.ticket + "x"));
      await assert.rejects(
        uploads.uploadedBytes(ticket.ticket, randomUUID(), "analyses"),
        { status: 422 },
      );
      await assert.rejects(
        uploads.uploadedBytes(ticket.ticket, id, "calibration"),
        { status: 422 },
      );
    } finally {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.UPLOAD_SIGNING_SECRET;
    }
  },
);
integration(
  "seed is idempotent and demo reset preserves user uploads and shelves",
  async () => {
    const { seed, resetDemo } = await import("../scripts/maintenance");
    await seed();
    const s = (
      await db.query("SELECT * FROM shelves WHERE identifier='SH-01'")
    )[0];
    await upload(s.id, "low");
    const before = await detail(s.id);
    await seed();
    assert.equal((await detail(s.id)).current.id, before.current.id);
    await resetDemo();
    assert.equal((await detail(s.id)).current.id, before.current.id);
    assert.equal(
      (await db.query("SELECT * FROM shelves WHERE demo=true")).length,
      1,
    );
    assert.ok(
      (await db.query("SELECT * FROM shelves WHERE demo=false")).length > 0,
    );
  },
);

integration(
  "deleting a shelf removes its history, tasks, receipts and photos only",
  async () => {
    const id = await create();
    const other = await create();
    const shelf = await calibrate(id);
    const result = await upload(id, "low", "analyses", { ingestion: "true" });
    assert.equal(result.status, 201);
    const assets = await db.query(
      "SELECT id,storage_key FROM image_assets WHERE shelf_id=$1",
      [id],
    );
    assert.ok(assets.length > 1);
    assert.equal((await request(`/shelves/${id}`, "DELETE")).status, 200);
    for (const table of [
      "image_assets",
      "analyses",
      "alerts",
      "ingestion_receipts",
    ])
      assert.equal(
        (await db.query(`SELECT * FROM ${table} WHERE shelf_id=$1`, [id]))
          .length,
        0,
      );
    assert.equal((await request(`/shelves/${id}`)).status, 404);
    assert.equal((await request(`/shelves/${id}`, "DELETE")).status, 404);
    assert.equal((await request(`/images/${shelf.reference.id}`)).status, 404);
    assert.equal((await request(`/shelves/${other}`)).status, 200);
    const files = await readdir(media);
    for (const asset of assets) assert.ok(!files.includes(asset.storage_key));
  },
);

integration(
  "deletion during processing prevents publication and cleans generated photos",
  async () => {
    const id = await create();
    await calibrate(id);
    const { decode } = await import("../src/server/shelf-analysis");
    const before = new Set(await readdir(media));
    const owned = await db.query(
      "SELECT storage_key FROM image_assets WHERE shelf_id=$1",
      [id],
    );
    await assert.rejects(
      service.analyze(id, await decode(images.low), {
        beforePublish: async () => {
          assert.equal((await request(`/shelves/${id}`, "DELETE")).status, 200);
        },
      }),
      /Shelf zone not found/,
    );
    for (const asset of owned) before.delete(asset.storage_key);
    assert.deepEqual(new Set(await readdir(media)), before);
  },
);
