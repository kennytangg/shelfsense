import io

import numpy as np
import pytest
from PIL import Image

from shelfsense.detector import DetectorConfig, ImageError, ROI, classify, decode, detect
from shelfsense.fixtures import ROOT, generate


@pytest.mark.parametrize(
    "ratio,expected",
    [
        (0, "Empty"),
        (0.149999, "Empty"),
        (0.15, "Low"),
        (0.599999, "Low"),
        (0.60, "Full"),
        (1, "Full"),
    ],
)
def test_stock_boundaries(ratio, expected):
    assert classify(ratio, DetectorConfig()) == expected


def test_fixtures_use_actual_mask_area():
    manifest = generate()
    for shelf in manifest["shelves"]:
        reference = decode((ROOT / shelf["reference"]).read_bytes())
        for variant, sample in shelf["samples"].items():
            result = detect(
                reference,
                decode((ROOT / sample["file"]).read_bytes()),
                ROI(**shelf["roi"]),
                DetectorConfig(),
            )
            assert (result.classification or result.outcome) == sample["expected"]
            if variant == "empty":
                assert result.occupancy_ratio == 0
            if variant == "low":
                assert 0.25 < result.occupancy_ratio < 0.50
            if variant == "full":
                assert result.occupancy_ratio > 0.70
            if result.mask is not None:
                assert result.occupancy_ratio == np.count_nonzero(result.mask) / result.mask.size


@pytest.mark.parametrize("data", [b"bad", b"x" * (10 * 1024 * 1024 + 1)])
def test_invalid_bytes(data):
    with pytest.raises(ImageError):
        decode(data)


def test_size_format_and_pixel_limits():
    for size, format in [((20, 20), "PNG"), ((64, 64), "GIF"), ((5000, 4100), "PNG")]:
        stream = io.BytesIO()
        Image.new("RGB", size).save(stream, format=format)
        with pytest.raises(ImageError):
            decode(stream.getvalue())


def test_quality_and_settings():
    reference = np.random.default_rng(1).integers(60, 200, (100, 100, 3), dtype=np.uint8)
    for value in [0, 120, 255]:
        result = detect(reference, np.full_like(reference, value), ROI(), DetectorConfig())
        assert result.outcome == "Review required" and result.classification is None
    with pytest.raises(ValueError):
        DetectorConfig(empty_threshold=0.8, full_threshold=0.6)
    with pytest.raises(ValueError):
        ROI(x=0.5, width=0.8)


def test_exif_orientation():
    stream = io.BytesIO()
    image = Image.new("RGB", (100, 70), "green")
    exif = image.getexif()
    exif[274] = 6
    image.save(stream, format="JPEG", exif=exif)
    assert decode(stream.getvalue()).shape == (100, 70, 3)


def test_placement_excludes_missing_products_and_flags_changed_packaging():
    from shelfsense.placement import PlacementConfig, compare_placement

    manifest = generate()
    for entry in manifest["shelves"]:
        empty = decode((ROOT / entry["reference"]).read_bytes())
        expected = decode((ROOT / entry["samples"]["full"]["file"]).read_bytes())
        roi, settings = ROI(**entry["roi"]), DetectorConfig()
        for name, status in [
            ("full", "Matches reference"),
            ("low", "Matches reference"),
            ("empty", "Not enough evidence"),
            ("misplaced", "Placement review"),
            ("mismatched", "Not enough evidence"),
        ]:
            current = decode((ROOT / entry["samples"][name]["file"]).read_bytes())
            stock = detect(empty, current, roi, settings)
            original = stock.overlay.copy() if stock.overlay is not None else None
            result = compare_placement(
                empty, expected, current, roi, settings, PlacementConfig(), stock
            )
            assert result.status == status
            if name == "misplaced":
                assert stock.classification == "Full"
                assert result.mismatch_ratio > 0.25
                assert np.any(stock.overlay != original)
            if name == "low":
                assert stock.classification == "Low" and result.mismatch_ratio == 0
            if name == "empty":
                assert result.mismatch_ratio is None


def test_placement_requires_matching_framing_and_valid_settings():
    from shelfsense.placement import PlacementConfig, compare_placement

    generate()
    empty = decode((ROOT / "zone-01/reference.png").read_bytes())
    current = decode((ROOT / "zone-01/full.png").read_bytes())
    stock = detect(empty, current, ROI(), DetectorConfig())
    result = compare_placement(
        empty, current[:100], current, ROI(), DetectorConfig(), PlacementConfig(), stock
    )
    assert result.status == "Not enough evidence"
    with pytest.raises(ValueError):
        PlacementConfig(mismatch_threshold=0)
