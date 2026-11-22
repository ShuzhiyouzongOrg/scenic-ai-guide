"""Measure visible Orb motion in actual rendered H5 frames.

Use --prepare with an empty destination, build that visitor-app as H5 and serve
the result on localhost. Pass --url and --output to capture the fixture.
Requires Playwright Chromium, Pillow and NumPy. No microphone is opened here.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

import numpy as np
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def prepare(destination):
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Choose an empty directory for the temporary project")
    shutil.copytree(ROOT / "visitor-app", destination, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("node_modules", "unpackage", ".git", ".hbuilderx"))
    shutil.copyfile(ROOT / "scripts/fixtures/guide-orb-preview.uvue", destination / "pages/ai-guide/index.uvue")


def sample(page, selector, frames=9):
    box = selector.bounding_box()
    pad = 10
    clip = {"x": box["x"] - pad, "y": box["y"] - pad,
            "width": box["width"] + 2 * pad, "height": box["height"] + 2 * pad}
    images = []
    for _ in range(frames):
        data = page.screenshot(clip=clip)
        images.append(Image.open(BytesIO(data)).convert("RGB"))
        page.wait_for_timeout(130)
    cube = np.stack([np.asarray(im) for im in images]).astype(np.int16)
    # The excursion in any RGB channel must exceed 12/255 to count. The crop
    # includes the outer ring and ten CSS pixels of unchanged scene on all sides.
    changed = np.max(cube.max(axis=0) - cube.min(axis=0), axis=2) > 12
    return images, round(100 * changed.mean(), 2)


def run(url, output):
    if urlsplit(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("The preview must be served on the loopback interface")
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        failures = []
        page.on("pageerror", lambda error: failures.append(str(error)))
        page.route("**/*", lambda route: route.continue_() if
                   urlsplit(route.request.url).hostname in {"localhost", "127.0.0.1", "::1"} else route.abort())
        page.goto(url.rstrip("/") + "/pages/ai-guide/index")
        orb = page.locator(".ambient-orb")
        orb.wait_for()
        choose = lambda text: page.get_by_text(text, exact=True).click()
        record = {"browser": browser.version, "dpr": 2,
                  "method": "9 consecutive compositor captures per case, spaced at least 130 ms, including 10 CSS px scene padding; percent of crop pixels whose RGB channel excursion exceeds 12/255.",
                  "states": {}, "rms": {}, "uncaught_errors": failures}
        frames_by_level = {}
        for size in (62, 76):
            choose(f"{size} pixels")
            choose("LISTENING")
            for level in (-1, 0, 0.02, 0.08, 0.25):
                choose(f"{level} RMS")
                page.wait_for_timeout(500)
                frames, difference = sample(page, orb)
                ring = orb.locator(".orb-signal").count() == 1
                assert ring == (level > 0), (size, level, ring)
                row = {"changed_pixels_percent": difference, "real_audio_ring": ring}
                record["rms"].setdefault(str(size), {})[str(level)] = row
                if size == 62:
                    frames_by_level[level] = frames
        choose("62 pixels")
        for state in ("IDLE", "LISTENING", "THINKING", "SPEAKING", "RECONNECTING", "PAUSED", "ERROR", "DISABLED", "CANCELLED"):
            choose(state)
            page.wait_for_timeout(500)
            _, difference = sample(page, orb)
            record["states"][state] = difference
            if state in ("PAUSED", "ERROR", "DISABLED", "CANCELLED"):
                assert difference == 0, state
        choose("SPEAKING")
        for control in ("reduce", "toggle active"):
            choose(control)
            page.wait_for_timeout(550)
            _, difference = sample(page, orb)
            assert difference == 0 and not orb.locator(".orb-signal").count(), control
            record["states"][control] = difference
            choose(control)
        for size, levels in record["rms"].items():
            assert levels["0"]["changed_pixels_percent"] < levels["0.02"]["changed_pixels_percent"], size
            assert levels["-1"]["changed_pixels_percent"] >= 5, size
            assert levels["0.08"]["changed_pixels_percent"] >= 6, size
            assert levels["0.25"]["changed_pixels_percent"] >= 9, size
        assert not failures, failures
        browser.close()

    montage = []
    tile_size = frames_by_level[0][0].width
    for frame in range(len(frames_by_level[0])):
        image = Image.new("RGB", (tile_size * 5, tile_size + 30), "white")
        draw = ImageDraw.Draw(image)
        for column, (level, images) in enumerate(frames_by_level.items()):
            left = column * tile_size
            image.paste(images[frame], (left, 0))
            draw.text((left + 6, tile_size + 7), "No sample" if level < 0 else f"RMS {level}", fill="#172A22")
        montage.append(image)
    montage[0].save(output / "ai-orb-motion-perception.webp", save_all=True, append_images=montage[1:],
                    duration=180, loop=0, lossless=True, method=6)
    (output / "ai-orb-motion-perception.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", type=Path)
    parser.add_argument("--url")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.prepare:
        prepare(args.prepare)
    elif args.url and args.output:
        run(args.url, args.output)
    else:
        parser.error("Use --prepare or supply both --url and --output")
