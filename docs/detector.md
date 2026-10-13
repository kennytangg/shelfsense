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

## Optional placement comparison

`placement.py` implements `occupied-appearance-lab/1.0`. Setup accepts a correctly
arranged Full shelf photo under the current stock calibration. The expected photo
is stored immutably, with same-shelf ownership and a new calibration version. Saving
or disabling it requires a fresh analysis. Stock recalibration clears the expected
reference, while old analyses retain their own reference and settings snapshot.

The detector extracts foreground in both the expected and current photographs using
the empty reference. It erodes masks with a 3×3 kernel and compares Lab color at shared
occupied coordinates. Missing products are excluded. If less than 5% of the ROI
has shared foreground, or stock analysis is unreliable, placement reports **Not
enough evidence**. Otherwise it measures the fraction of those shared pixels with
Lab distance at least 35. At least 18% mismatching shared pixels produces **Placement
review**; other comparisons report **Matches reference**. All three thresholds are
validated configurable settings. They are heuristic defaults, not confidence scores.

Orange overlay pixels show appearance mismatches; teal continues to show stock
foreground. Responses also expose the compared fraction of the ROI, mismatch
fraction of compared pixels, explanatory reason and placement algorithm version.
Processing duration includes the extra comparison when configured.

The `misplaced.png` fixtures replace packaging appearance in nine occupied slots.
They retain Full coverage, and tests verify separate placement review while ordinary
Low samples still match the remaining expected products. Placement findings appear
in dashboard attention but do not change the restocking task state machine.

This comparison requires a fixed camera and expected layout. It cannot identify a
SKU, detect every misplaced item, or distinguish wrong packaging from changed
lighting, perspective, or legitimate rearrangement. Areas without overlapping
expected foreground are not evaluated for placement. Staff must inspect the evidence.

## General limits

Visible surface differences are a proxy for coverage. They cannot establish semantic product presence, product identity/count, shelf depth, or hidden inventory. Shadows, reflections, illumination changes, camera movement, similar packaging/background colors and occlusion can cause incorrect results even if quality checks pass. Use a controlled front-facing view; independently inspect the overlay and mask. Default thresholds are presentation choices, not industry standards. No accuracy percentage or probability is claimed.
