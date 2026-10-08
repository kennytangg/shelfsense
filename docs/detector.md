# How the detector works

`backend/src/shelfsense/detector.py` exposes `detect(reference, current, roi, config)`. Inputs are decoded RGB NumPy arrays. It has no database, fixture-name, expected-label, network, or UI dependencies. `decode(bytes)` validates formats and resource limits and applies Pillow's EXIF transpose consistently before ROI coordinates are interpreted.

1. **Framing guard:** reject aspect ratios differing by more than 2.5%. Corresponding resolutions can differ. Compatible ratios do not prove the camera position matches; there is no perspective reconstruction or registration.
2. **ROI:** crop the same normalized rectangle in each image; reject either ROI side below 32 source pixels. Resize crops to a common width (640 by default) preserving reference-ROI proportions. Reject processing heights above 4096.
3. **Quality:** reject mean grayscale below 12 or above 245, grayscale standard deviation below 3, or Laplacian variance below 2. Reject large uniform lightness changes (absolute median Lab L delta >48 with median chroma distance <8). These are conservative, explainable prototype checks, not a comprehensive quality estimator.
4. **Smooth/color:** a 3×3 Gaussian suppresses minor sensor noise. OpenCV's 8-bit Lab representation gives a simple lightness-and-color comparison; it is not a calibrated perceptual Delta-E measurement.
5. **Difference:** Euclidean Lab distance ≥28 marks foreground. This parameter is adjustable.
6. **Cleanup:** 3×3 opening removes specks; closing fills tiny holes. Connected components smaller than 40 processing pixels are removed. No bounding-box areas are counted.
7. **Measurement:** `occupancy_ratio = count_nonzero(mask) / mask.size`.
8. **Status:** Empty `< 0.15`, Low `>= 0.15 and < 0.60`, Full `>= 0.60`. Equality behavior is tested explicitly. Validated settings require `0 < empty_threshold < full_threshold < 1`; morphology size must be odd.
9. **Artifacts:** save a binary mask at processing dimensions and a full-input overlay with teal foreground highlights and the ROI outline. Input, reference, mask, overlay, algorithm version, ROI/settings snapshot, calibration version, processing duration, warnings and UTC processing timestamp are persisted together.

Thresholds, processing width, morphology size and minimum component size live in one validated `DetectorConfig`. The detector timer measures the decoded-image processing pipeline, excluding upload, encoding and database time. Invalid upload bytes produce an actionable HTTP error and a last-attempt diagnostic; decoded setup/review outcomes additionally receive an Analysis record with no classification/occupancy. Such attempts never replace a valid current reading or alter alerts. A new calibration clears the current reading but preserves history and active tasks until a valid new measurement provides evidence.

## Synthetic fixtures

`fixtures.py` deterministically generates 12 pairs of textured shelf scenes with colored boxes and rounded containers, plus Empty/Low/Full and mismatched variants. `assets/demo/manifest.json` associates zones with references, normalized ROIs and expected evaluation labels. The expected labels are used only in tests. The production detector never reads the manifest; the demo route uses it only to select an allowlisted input file and then calls the ordinary analysis service.

The original generated artwork is marked **CC0** and requires no attribution or downloaded data. All such views are labeled “Synthetic demo images.” Fixtures intentionally sit away from thresholds; actual threshold boundaries are separately unit tested. Full → Low → Empty → Full chronological samples for SH-01 are processed through the same persistence/alert service when seeded.

## Limits

Visible surface differences are a proxy for coverage. They cannot establish semantic product presence, product identity/count, shelf depth, or hidden inventory. Shadows, reflections, illumination changes, camera movement, similar packaging/background colors and occlusion can cause incorrect results even if quality checks pass. Use a controlled front-facing view; independently inspect the overlay and mask. Default thresholds are presentation choices, not industry standards. No accuracy percentage or probability is claimed.
