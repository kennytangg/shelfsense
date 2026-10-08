"""Deterministic locally generated images; labels are for evaluation only."""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3] / "assets" / "demo"
ROI_DATA = {"x": 0.05, "y": 0.1, "width": 0.9, "height": 0.8}
NAMES = [
    ("Breakfast cereals", "01 · Breakfast"),
    ("Oat & nut bars", "01 · Breakfast"),
    ("Granola", "01 · Breakfast"),
    ("Pasta", "02 · Pantry"),
    ("Rice & grains", "02 · Pantry"),
    ("Cooking sauces", "02 · Pantry"),
    ("Fruit juice", "03 · Drinks"),
    ("Sparkling water", "03 · Drinks"),
    ("Iced tea", "03 · Drinks"),
    ("Crackers", "04 · Snacks"),
    ("Trail mix", "04 · Snacks"),
    ("Biscuits", "04 · Snacks"),
]


def generate():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "description": "Synthetic demo images; original generated artwork, CC0.",
        "shelves": [],
    }
    for index, (name, aisle) in enumerate(NAMES):
        folder = ROOT / f"zone-{index + 1:02d}"
        folder.mkdir(exist_ok=True)
        rng = np.random.default_rng(2026 + index)
        base = np.full((400, 640, 3), [217, 219, 214], dtype=np.int16)
        base += rng.integers(-3, 4, (400, 640, 1))
        reference = Image.fromarray(base.clip(0, 255).astype(np.uint8))
        draw = ImageDraw.Draw(reference)
        for y in (38, 193, 350):
            draw.rectangle((20, y, 620, y + 12), fill="#9baca6")
            draw.line((20, y, 620, y), fill="#657e74", width=2)
        reference.save(folder / "reference.png")
        variants = {}
        for variant, number in [("empty", 0), ("low", 8), ("full", 18)]:
            image = reference.copy()
            draw = ImageDraw.Draw(image)
            for n in range(number):
                row, col = divmod(n, 9)
                x, y = 36 + col * 63, 55 + row * 156
                color = ["#368b86", "#d29445", "#bd6a56", "#769b54", "#637d9b"][(n + index) % 5]
                if (n + index) % 3 == 0:
                    draw.rounded_rectangle((x + 2, y + 6, x + 57, y + 135), radius=12, fill=color)
                else:
                    draw.rectangle((x, y, x + 59, y + 135), fill=color)
                draw.rectangle((x + 6, y + 42, x + 51, y + 80), fill="#f0ce86")
                draw.text((x + 10, y + 52), ["OATS", "FRESH", "DAILY"][index % 3], fill="#405a52")
            image.save(folder / f"{variant}.png")
            variants[variant] = {
                "file": f"zone-{index + 1:02d}/{variant}.png",
                "expected": variant.title(),
            }
        Image.new("RGB", (400, 640), "#222222").save(folder / "mismatched.png")
        variants["mismatched"] = {
            "file": f"zone-{index + 1:02d}/mismatched.png",
            "expected": "Review required",
        }
        manifest["shelves"].append(
            {
                "identifier": f"SH-{index + 1:02d}",
                "name": name,
                "location": aisle,
                "reference": f"zone-{index + 1:02d}/reference.png",
                "roi": ROI_DATA,
                "samples": variants,
            }
        )
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
