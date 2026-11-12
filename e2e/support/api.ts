import { readFile } from "node:fs/promises";
import { expect, type APIRequestContext } from "@playwright/test";
import { FIXTURE_ROI, SHELF_IMAGES } from "./fixtures";

export interface ApiShelf {
  id: string;
  name: string;
  location: string;
  identifier: string;
  status: string;
  calibration_version: number;
  awaiting_verification: boolean;
  active_alert: { id: string; state: string } | null;
  current: { classification: string | null } | null;
}

export interface ApiAlert {
  id: string;
  shelf_id: string;
  state: string;
  severity: string;
  resolution_reason: string | null;
}

type ImageName = keyof typeof SHELF_IMAGES;

async function imagePart(path: string, mimeType = "image/png") {
  return { name: "photo.png", mimeType, buffer: await readFile(path) };
}

/** Test-data helpers that talk to the real HTTP API, for arranging state quickly. */
export class ShelfApi {
  constructor(private readonly request: APIRequestContext) {}

  async list(): Promise<ApiShelf[]> {
    const response = await this.request.get("/api/shelves");
    expect(response.ok()).toBe(true);
    return response.json();
  }

  async get(id: string): Promise<ApiShelf> {
    const response = await this.request.get(`/api/shelves/${id}`);
    expect(response.ok()).toBe(true);
    return response.json();
  }

  async create(name: string, location: string): Promise<ApiShelf> {
    const response = await this.request.post("/api/shelves", {
      data: { name, location },
    });
    expect(response.status()).toBe(201);
    return response.json();
  }

  async calibrate(id: string, image: ImageName = "empty") {
    const response = await this.request.post(`/api/shelves/${id}/calibration`, {
      multipart: {
        file: await imagePart(SHELF_IMAGES[image]),
        config: JSON.stringify({ roi: FIXTURE_ROI }),
      },
    });
    expect(response.ok()).toBe(true);
  }

  async createCalibrated(name: string, location: string): Promise<ApiShelf> {
    const shelf = await this.create(name, location);
    await this.calibrate(shelf.id);
    return shelf;
  }

  async check(id: string, image: ImageName) {
    const response = await this.request.post(`/api/shelves/${id}/analyses`, {
      multipart: { file: await imagePart(SHELF_IMAGES[image]) },
    });
    expect(response.status()).toBe(201);
    return response.json();
  }

  /** Every restocking task ever raised for one shelf (including resolved ones). */
  async alertsFor(shelfId: string): Promise<ApiAlert[]> {
    const response = await this.request.get("/api/alerts");
    expect(response.ok()).toBe(true);
    const all: ApiAlert[] = await response.json();
    return all.filter((alert) => alert.shelf_id === shelfId);
  }

  async remove(id: string) {
    const response = await this.request.delete(`/api/shelves/${id}`);
    expect(response.ok()).toBe(true);
  }

  async removeAll() {
    for (const shelf of await this.list()) await this.remove(shelf.id);
  }
}
