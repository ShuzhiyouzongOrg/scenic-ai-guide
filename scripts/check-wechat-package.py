"""Measure compiled Mini Program files before the WeChat DevTools packaging stage."""
import argparse
import base64
from collections import Counter
import json
from pathlib import Path
import re


MAX_PACKAGE_BYTES = 2 * 1024 * 1024
FONT = "uni_modules/rice-ui/static/font/riceIcon.ttf"
ICON_STYLE = "uni_modules/rice-ui/components/rice-icon/rice-icon.wxss"
DEVTOOLS_FILES = {"project.config.json", "project.private.config.json"}


def verify_embedded_font(root: Path) -> None:
    css = (root / ICON_STYLE).read_text(encoding="utf-8")
    match = re.search(r"url\(data:[^,]+;base64,([A-Za-z0-9+/=]+)\)", css)
    if not match or base64.b64decode(match.group(1)) != (root / FONT).read_bytes():
        raise ValueError("Rice icon font differs from WXSS. Review manifest.packOptions before release.")
    for file in root.rglob("*"):
        if file.suffix in {".js", ".wxss", ".wxml"} and "riceIcon.ttf" in file.read_text(encoding="utf-8"):
            raise ValueError(f"External Rice font is still referenced by {file.relative_to(root)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="DCloud production mp-weixin output")
    root = parser.parse_args().directory
    app = json.loads((root / "app.json").read_text(encoding="utf-8-sig"))
    project = json.loads((root / "project.config.json").read_text(encoding="utf-8-sig"))
    skipped = {item["value"].lstrip("/") for item in project["packOptions"]["ignore"] if item["type"] == "file"}
    if FONT not in skipped:
        raise ValueError("Expected duplicate Rice font to be excluded by the generated project config")
    verify_embedded_font(root)
    subpackages = tuple(row["root"].strip("/") + "/" for row in app.get("subPackages", []))
    if "pages/spot/" not in subpackages:
        raise ValueError("The place detail package is missing from app.json")
    for name in ("jiulong", "brahma", "mandala", "xiangfu", "tower", "wudeng"):
        thumb = root / "static" / "destinations" / (name + ".webp")
        photo = root / "pages" / "spot" / "static" / thumb.name
        if not thumb.is_file() or not photo.is_file() or photo.stat().st_size <= thumb.stat().st_size:
            raise ValueError(f"Missing thumbnail or detail photo for {name}")
    sizes = Counter()
    for file in root.rglob("*"):
        if not file.is_file():
            continue
        path = file.relative_to(root).as_posix()
        if path in DEVTOOLS_FILES or path in skipped:
            continue
        package = next((name for name in subpackages if path.startswith(name)), "main")
        sizes[package] += file.stat().st_size
    for name, size in sorted(sizes.items()):
        print(f"{name}: {size:,} B (limit {MAX_PACKAGE_BYTES:,} B)")
    if any(size > MAX_PACKAGE_BYTES for size in sizes.values()):
        raise SystemExit("A raw package exceeds the published per-package threshold")
    print("Preflight passed. DevTools' signed/upload package may differ.")


if __name__ == "__main__":
    main()
