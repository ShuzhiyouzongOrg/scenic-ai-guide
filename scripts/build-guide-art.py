"""Build Scenic's original orb artwork and the optimized existing Haru poster.

Offline design tool. Requires Pillow. The application ships the generated WebP
files. Haru retains its source licensing, see server/src/web/live2d/THIRD_PARTY_NOTICES.md.
"""
from pathlib import Path
import json
import math

from PIL import Image, ImageColor


ROOT = Path(__file__).resolve().parents[1] / "visitor-app"
DEST = ROOT / "static" / "guide-stage"
PALETTE = json.loads((ROOT / "design/tokens.json").read_text(encoding="utf-8"))["orb"]["texture"]
COLORS = {key: ImageColor.getrgb(value) for key, value in PALETTE.items()}


def clamp(value):
    return min(1.0, max(0.0, value))


def mix(base, tint, amount):
    amount = clamp(amount)
    return tuple(a * (1 - amount) + b * amount for a, b in zip(base, tint))


def light_at(x, y, cx, cy, width, height):
    return math.exp(-((x - cx) / width) ** 2 - ((y - cy) / height) ** 2)


def rgba(color, alpha):
    return tuple(round(v) for v in color) + (round(255 * clamp(alpha)),)


def orb_pixel(x, y):
    # The unequal lobes soften the sphere's silhouette while keeping it centred.
    angle = math.atan2(y, x)
    radius = 0.89 + 0.028 * math.sin(3 * angle - 0.65) + 0.011 * math.cos(5 * angle + 0.7)
    distance = math.hypot(x, y) / radius
    interior = clamp((1 - distance) * 110 + 0.5)
    if interior == 0:
        return (0, 0, 0, 0), (0, 0, 0, 0)
    # Model a translucent river stone. Diffuse colour, the diagonal jade fold
    # and the fine caustic edge are baked, independent of a platform shader.
    z = math.sqrt(max(0, 1 - distance * distance))
    base = mix(COLORS["depth"], COLORS["water"], 0.2 + 0.55 * z)
    base = mix(base, COLORS["ice"], light_at(x, y, -0.1, -0.32, 0.9, 0.78) * 0.94)
    base = mix(base, COLORS["iris"], light_at(x, y, 0.64, -0.08, 0.51, 0.94) * 0.9)
    fold_y = 0.09 - 0.49 * x + 0.2 * math.sin(3.3 * x + 0.2)
    delta = y - fold_y
    base = mix(base, COLORS["water"], math.exp(-((delta + 0.22) / 0.16) ** 2) * 0.53)
    base = mix(base, COLORS["jade"], math.exp(-((delta - 0.22) / 0.35) ** 2) * 0.95)
    base = mix(base, COLORS["pearl"], math.exp(-(delta / 0.09) ** 2) * (0.38 + z * 0.38))
    base = mix(base, COLORS["ice"], light_at(x, y, -0.48, 0.44, 0.27, 0.49) * 0.73)
    edge = math.exp(-((distance - 0.95) / 0.038) ** 2)
    base = mix(base, COLORS["pearl"], edge * (0.34 + 0.27 * math.sin(angle - 0.3)))
    shine = 0.72 * light_at(x, y, -0.39, -0.48, 0.31, 0.18)
    shine += 0.39 * math.exp(-((distance - 0.87) / 0.025) ** 2) * light_at(x, y, 0.22, 0.64, 0.52, 0.32)
    return rgba(base, interior), rgba(COLORS["pearl"], shine * interior)


def render():
    DEST.mkdir(exist_ok=True)
    size = 216
    body, sheen = Image.new("RGBA", (size, size)), Image.new("RGBA", (size, size))
    pixels, cool_pixels, highlights = [], [], []
    for row in range(size):
        for col in range(size):
            pixel, highlight = orb_pixel((col + 0.5) * 2 / size - 1, (row + 0.5) * 2 / size - 1)
            pixels.append(pixel)
            cool_pixels.append(rgba(mix(pixel[:3], COLORS["thought"], 0.36), pixel[3] / 255))
            highlights.append(highlight)
    body.putdata(pixels)
    sheen.putdata(highlights)
    body.save(DEST / "orb-body.webp", quality=76, method=6)
    body.putdata(cool_pixels)
    body.save(DEST / "orb-thought.webp", quality=72, method=6)
    sheen.resize((72, 72), Image.Resampling.LANCZOS).save(
        DEST / "orb-sheen.webp", quality=60, alpha_quality=64, method=6)
    glow = Image.new("RGBA", (72, 72))
    glow.putdata([rgba(COLORS["halo"], (max(0, 1 - ((x - 35.5) ** 2 + (y - 35.5) ** 2) / 1260)) ** 2.3)
                  for y in range(72) for x in range(72)])
    glow.save(DEST / "glow.webp", quality=60, alpha_quality=64, method=6)
    # A single narrow optical ring is reserved for measured audio amplitude.
    ring = Image.new("RGBA", (100, 100))
    ring.putdata([rgba(COLORS["signal"], math.exp(-((math.hypot(x - 49.5, y - 49.5) - 44.0) / 0.92) ** 2))
                  for y in range(100) for x in range(100)])
    ring.save(DEST / "orb-signal.webp", quality=58, alpha_quality=74, method=6)

    poster = Image.open(ROOT / "design/masters/guide-haru-transparent.png").convert("RGBA")
    poster.save(ROOT / "static/digital-human/guide-haru-transparent.webp", quality=70, method=6,
                alpha_quality=100, exact=True)


if __name__ == "__main__":
    render()
