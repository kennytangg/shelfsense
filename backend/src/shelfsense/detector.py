"""Independent empty-reference differencing. No labels or database dependencies."""

import io
import time
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, model_validator

ALGORITHM_VERSION = "empty-reference-lab/1.0"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageError(ValueError):
    pass


class ROI(BaseModel):
    x: float = Field(default=0, ge=0, lt=1)
    y: float = Field(default=0, ge=0, lt=1)
    width: float = Field(default=1, gt=0, le=1)
    height: float = Field(default=1, gt=0, le=1)

    @model_validator(mode="after")
    def bounds(self):
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("ROI must fit inside the image")
        return self


class DetectorConfig(BaseModel):
    difference_threshold: float = Field(default=28, ge=5, le=150)
    processing_width: int = Field(default=640, ge=128, le=1024)
    morphology_size: int = Field(default=3, ge=1, le=9)
    min_component_pixels: int = Field(default=40, ge=0, le=2000)
    empty_threshold: float = Field(default=0.15, gt=0, lt=1)
    full_threshold: float = Field(default=0.60, gt=0, lt=1)

    @model_validator(mode="after")
    def thresholds(self):
        if self.empty_threshold >= self.full_threshold:
            raise ValueError("Require 0 < empty threshold < full threshold < 1")
        if self.morphology_size % 2 == 0:
            raise ValueError("Morphology size must be odd")
        return self


def decode(data: bytes) -> np.ndarray:
    if len(data) > MAX_BYTES:
        raise ImageError("Image exceeds 10 MB. Choose a smaller PNG or JPEG.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in {"PNG", "JPEG"}:
                raise ImageError("Only PNG and JPEG images are supported.")
            if image.width * image.height > MAX_PIXELS:
                raise ImageError("Image exceeds the 20 million decoded-pixel limit.")
            if min(image.size) < 64:
                raise ImageError("Image is too small; both dimensions must be at least 64 pixels.")
            image.load()
            oriented = ImageOps.exif_transpose(image).convert("RGB")
            return np.array(oriented)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageError("Cannot decode this image. Choose a complete PNG or JPEG.") from exc


def classify(ratio: float, config: DetectorConfig) -> str:
    if ratio < config.empty_threshold:
        return "Empty"
    return "Low" if ratio < config.full_threshold else "Full"


@dataclass
class Detection:
    outcome: str
    classification: str | None
    occupancy_ratio: float | None
    warnings: list[str]
    duration_ms: float
    overlay: np.ndarray | None = None
    mask: np.ndarray | None = None


def detect(
    reference: np.ndarray, current: np.ndarray, roi: ROI, config: DetectorConfig
) -> Detection:
    start = time.perf_counter()

    def review(reason):
        return Detection(
            "Review required", None, None, [reason], (time.perf_counter() - start) * 1000
        )

    rh, rw = reference.shape[:2]
    h, w = current.shape[:2]
    if abs((w / h) / (rw / rh) - 1) > 0.025:
        return review(
            "Image framing has an incompatible aspect ratio. Retake from the reference position."
        )

    def crop(image):
        ih, iw = image.shape[:2]
        return image[
            round(roi.y * ih) : round((roi.y + roi.height) * ih),
            round(roi.x * iw) : round((roi.x + roi.width) * iw),
        ]

    a, b = crop(reference), crop(current)
    if min(*a.shape[:2], *b.shape[:2]) < 32:
        return review("Selected ROI is too small; use at least 32 source pixels per side.")
    size = (
        config.processing_width,
        max(32, round(config.processing_width * a.shape[0] / a.shape[1])),
    )
    if size[1] > 4096:
        return review("ROI is too tall and narrow. Choose a wider display area.")
    a, b = [cv2.resize(i, size, interpolation=cv2.INTER_AREA) for i in (a, b)]
    gray = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY)
    if float(gray.mean()) < 12 or float(gray.mean()) > 245:
        return review(
            "Photo is severely underexposed or overexposed. Adjust lighting and try again."
        )
    if float(gray.std()) < 3:
        return review("Photo has insufficient detail for a reliable comparison.")
    if cv2.Laplacian(gray, cv2.CV_64F).var() < 2:
        return review("Photo is too blurred. Hold the camera steady and retake.")
    # Median Lab lightness shift rejects large uniform exposure changes without
    # normalizing away foreground. Moderate/local lighting remains a limitation.
    lab = [
        cv2.cvtColor(cv2.GaussianBlur(i, (3, 3), 0), cv2.COLOR_RGB2LAB).astype(np.float32)
        for i in (a, b)
    ]
    delta = lab[1] - lab[0]
    if (
        abs(float(np.median(delta[:, :, 0]))) > 48
        and np.median(np.linalg.norm(delta[:, :, 1:], axis=2)) < 8
    ):
        return review("Large lighting change detected. Match the reference lighting.")
    mask = (np.linalg.norm(delta, axis=2) >= config.difference_threshold).astype(np.uint8) * 255
    kernel = np.ones((config.morphology_size, config.morphology_size), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    keep = np.zeros(count, dtype=np.uint8)
    keep[1:] = (stats[1:, cv2.CC_STAT_AREA] >= config.min_component_pixels) * 255
    mask = keep[labels]
    ratio = float(np.count_nonzero(mask) / mask.size)
    overlay = current.copy()
    x, y = round(roi.x * w), round(roi.y * h)
    x2, y2 = round((roi.x + roi.width) * w), round((roi.y + roi.height) * h)
    selected = cv2.resize(mask, (x2 - x, y2 - y), interpolation=cv2.INTER_NEAREST) > 0
    region = overlay[y:y2, x:x2]
    region[selected] = (region[selected] * 0.55 + np.array([20, 190, 155]) * 0.45).astype(np.uint8)
    cv2.rectangle(overlay, (x, y), (x2 - 1, y2 - 1), (0, 145, 120), 3)
    return Detection(
        "Valid",
        classify(ratio, config),
        ratio,
        [],
        (time.perf_counter() - start) * 1000,
        overlay,
        mask,
    )
