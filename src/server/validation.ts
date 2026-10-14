import { randomUUID } from "node:crypto";
import { z } from "zod";
export const roiSchema = z
  .object({
    x: z.number().min(0).lt(1).default(0),
    y: z.number().min(0).lt(1).default(0),
    width: z.number().gt(0).max(1).default(1),
    height: z.number().gt(0).max(1).default(1),
  })
  .refine(
    (r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001,
    "ROI must fit inside the image",
  );
export const settingsSchema = z
  .object({
    difference_threshold: z.number().min(5).max(150).default(28),
    processing_width: z.number().int().min(128).max(1024).default(640),
    morphology_size: z.number().int().min(1).max(9).default(3),
    min_component_pixels: z.number().int().min(0).max(2000).default(40),
    empty_threshold: z.number().gt(0).lt(1).default(0.15),
    full_threshold: z.number().gt(0).lt(1).default(0.6),
  })
  .refine(
    (s) => s.empty_threshold < s.full_threshold && s.morphology_size % 2 === 1,
    "Thresholds must be ordered and morphology size odd",
  );
export const placementSchema = z.object({
  appearance_distance: z.number().min(5).max(150).default(35),
  mismatch_threshold: z.number().gt(0).lt(1).default(0.18),
  min_shared_ratio: z.number().gt(0).lt(1).default(0.05),
});
export const calibrationSchema = z.object({
  roi: roiSchema,
  settings: settingsSchema.prefault({}),
});
export const shelfSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/)
    .default(() => `shelf-${randomUUID().slice(0, 24)}`),
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120).nullable().optional().default(null),
});
export type ROI = z.infer<typeof roiSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type PlacementSettings = z.infer<typeof placementSchema>;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
