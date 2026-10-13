"""Fixed-layout appearance comparison, independent of persistence and product labels."""

import cv2
import numpy as np
from pydantic import BaseModel, Field

from .detector import Detection, DetectorConfig, ROI, detect

PLACEMENT_VERSION = "occupied-appearance-lab/1.0"


class PlacementConfig(BaseModel):
    appearance_distance: float = Field(default=35, ge=5, le=150)
    mismatch_threshold: float = Field(default=0.18, gt=0, lt=1)
    min_shared_ratio: float = Field(default=0.05, gt=0, lt=1)


class PlacementResult(BaseModel):
    status: str
    mismatch_ratio: float | None = None
    compared_ratio: float = 0
    reason: str
    algorithm_version: str = PLACEMENT_VERSION


def compare_placement(
    empty: np.ndarray,
    expected: np.ndarray,
    current: np.ndarray,
    roi: ROI,
    stock_config: DetectorConfig,
    config: PlacementConfig,
    stock: Detection,
) -> PlacementResult:
    expected_stock = detect(empty, expected, roi, stock_config)
    if stock.outcome != "Valid" or expected_stock.outcome != "Valid":
        return PlacementResult(
            status="Not enough evidence", reason="A reliable stock comparison is required."
        )
    # Exclude background and missing products; erode boundaries to reduce edge noise.
    kernel = np.ones((3, 3), np.uint8)
    shared = (cv2.erode(stock.mask, kernel) > 0) & (cv2.erode(expected_stock.mask, kernel) > 0)
    compared = float(np.count_nonzero(shared) / shared.size)
    if compared < config.min_shared_ratio:
        return PlacementResult(
            status="Not enough evidence",
            compared_ratio=compared,
            reason="Too little overlapping product area; inspect stock coverage first.",
        )

    def lab_crop(image):
        h, w = image.shape[:2]
        crop = image[
            round(roi.y * h) : round((roi.y + roi.height) * h),
            round(roi.x * w) : round((roi.x + roi.width) * w),
        ]
        resized = cv2.resize(crop, (shared.shape[1], shared.shape[0]), interpolation=cv2.INTER_AREA)
        return cv2.cvtColor(cv2.GaussianBlur(resized, (3, 3), 0), cv2.COLOR_RGB2LAB).astype(
            np.float32
        )

    difference = np.linalg.norm(lab_crop(current) - lab_crop(expected), axis=2)
    mismatch = shared & (difference >= config.appearance_distance)
    ratio = float(np.count_nonzero(mismatch) / np.count_nonzero(shared))
    flagged = ratio >= config.mismatch_threshold
    if flagged and stock.overlay is not None:
        h, w = current.shape[:2]
        x, y = round(roi.x * w), round(roi.y * h)
        x2, y2 = round((roi.x + roi.width) * w), round((roi.y + roi.height) * h)
        selected = (
            cv2.resize(mismatch.astype(np.uint8), (x2 - x, y2 - y), interpolation=cv2.INTER_NEAREST)
            > 0
        )
        region = stock.overlay[y:y2, x:x2]
        region[selected] = (
            current[y:y2, x:x2][selected] * 0.2 + np.array([255, 130, 25]) * 0.8
        ).astype(np.uint8)
    return PlacementResult(
        status="Placement review" if flagged else "Matches reference",
        mismatch_ratio=ratio,
        compared_ratio=compared,
        reason=(
            "Occupied appearance differs from the expected layout. Orange marks differences; "
            "inspect for misplaced items, lighting changes, or camera movement."
            if flagged
            else "Compared occupied areas match the expected appearance; missing areas are excluded."
        ),
    )
