import { readdir, stat, readFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createHash } from "node:crypto";
export class FolderMonitor {
  private signatures = new Map<string, string>();
  private handled = new Map<string, string>();
  constructor(
    public folder: string,
    public base: string,
    public authorization?: string,
  ) {}
  async request(path: string, init?: RequestInit) {
    const r = await fetch(this.base + "/api" + path, {
      ...init,
      headers: {
        ...init?.headers,
        ...(this.authorization ? { Authorization: this.authorization } : {}),
      },
    });
    const data = await r.json();
    if (!r.ok) throw Object.assign(Error(data.detail), { status: r.status });
    return data;
  }
  async scan() {
    const shelves = await this.request("/shelves"),
      published: string[] = [];
    for (const zone of await readdir(this.folder, { withFileTypes: true })) {
      if (!zone.isDirectory()) continue;
      const shelf = shelves.find(
        (s: { identifier: string }) => s.identifier === zone.name,
      );
      if (!shelf) continue;
      for (const entry of await readdir(join(this.folder, zone.name), {
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !/^.+\.(png|jpe?g)$/i.test(entry.name)) continue;
        const path = join(this.folder, zone.name, entry.name),
          info = await stat(path),
          signature = `${info.size}:${info.mtimeMs}`,
          key = `${signature}:${shelf.calibration_version}`;
        const previous = this.signatures.get(path);
        this.signatures.set(path, signature);
        if (previous !== signature || this.handled.get(path) === key) continue;
        try {
          const bytes = await readFile(path),
            after = await stat(path);
          if (after.size !== info.size || after.mtimeMs !== info.mtimeMs)
            continue;
          const fields = {
            ingestion: true,
            expected_version: shelf.calibration_version,
          };
          let result;
          const ticket = await this.request("/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shelf_id: shelf.id, operation: "analyses" }),
          });
          if (ticket.storage === "local") {
            const form = new FormData();
            form.append(
              "file",
              new Blob([bytes], {
                type: /\.png$/i.test(path) ? "image/png" : "image/jpeg",
              }),
              entry.name,
            );
            form.append("ingestion", "true");
            form.append("expected_version", String(shelf.calibration_version));
            result = await this.request(`/shelves/${shelf.id}/analyses`, {
              method: "POST",
              body: form,
            });
          } else {
            const { upload } = await import("@vercel/blob/client");
            await upload(ticket.pathname, new Blob([bytes]), {
              access: "private",
              contentType: /\.png$/i.test(path) ? "image/png" : "image/jpeg",
              handleUploadUrl: this.base + "/api/uploads/blob",
              clientPayload: ticket.ticket,
              headers: this.authorization
                ? { Authorization: this.authorization }
                : undefined,
            });
            result = await this.request(`/shelves/${shelf.id}/analyses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...fields,
                upload_ticket: ticket.ticket,
                digest: createHash("sha256").update(bytes).digest("hex"),
              }),
            });
          }
          this.handled.set(path, key);
          published.push(result.id);
        } catch (e) {
          const status = (e as { status?: number }).status;
          if (status === 422 || status === 413) this.handled.set(path, key);
          console.error(
            `Ingestion failed for ${zone.name}/${entry.name}: ${e instanceof Error ? e.message : "retry pending"}`,
          );
        }
      }
    }
    return published;
  }
}
async function main() {
  const args = process.argv.slice(2),
    option = (name: string) =>
      args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined,
    folder = option("--folder"),
    base = option("--url") || "http://127.0.0.1:3000",
    interval = Number(option("--interval") || 2);
  if (
    !args.includes("--folder") ||
    !folder ||
    interval < 1 ||
    interval > 3600 ||
    !Number.isFinite(interval)
  )
    throw Error("Use --folder PATH --url APP_URL --interval 1..3600");
  const dir = await realpath(folder),
    media = await realpath(process.env.MEDIA_DIR || "media").catch(() =>
      resolve("media"),
    );
  if (
    dir === media ||
    dir.startsWith(media + "/") ||
    media.startsWith(dir + "/")
  )
    throw Error("Watch a folder separate from managed media");
  const monitor = new FolderMonitor(
    dir,
    base,
    process.env.SHELFSENSE_AUTHORIZATION,
  );
  let running = true;
  process.on("SIGINT", () => (running = false));
  process.on("SIGTERM", () => (running = false));
  while (running) {
    try {
      await monitor.scan();
    } catch (e) {
      console.error(e instanceof Error ? e.message : "API unavailable");
    }
    await setTimeout(interval * 1000);
  }
}
if (process.argv[1]?.endsWith("watch.ts"))
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
