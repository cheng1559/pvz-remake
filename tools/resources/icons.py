#!/usr/bin/env python3
"""Generate the web and native app icons from the original game icon (ICO).

The ICO is not kept in Git. Supply your own copy with --ico; the default is tools/game.ico.
Writes the web icons under build-templates/web-mobile/ and the macOS, iOS, Android and Windows icons
under native/engine/. All outputs are ignored by Git. iOS icons cannot be transparent, so they get
a white background and a margin that keeps the art clear of the rounded corners.
Requires Pillow; Icon.icns needs macOS `iconutil`.
"""

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "build-templates/web-mobile"
NATIVE = ROOT / "native/engine"
ANDROID_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
MAC_SIZES = (16, 32, 128, 256, 512)
IOS_MARGIN = 0.1


def load(path: Path) -> Image.Image:
    """The largest true-color frame; original icons also carry 4-bit and 8-bit frames."""
    image = Image.open(path)
    entries = image.ico.entry
    best = max(range(len(entries)), key=lambda i: (entries[i].square, entries[i].color_depth))
    return image.ico.frame(best).convert("RGBA")


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.LANCZOS)


def opaque(image: Image.Image, size: int) -> Image.Image:
    inner = round(size * (1 - 2 * IOS_MARGIN))
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    offset = (size - inner) // 2
    canvas.alpha_composite(resized(image, inner), (offset, offset))
    return canvas.convert("RGB")


def write_web(image: Image.Image, source: Path) -> None:
    shutil.copyfile(source, WEB / "game.ico")
    resized(image, 256).save(WEB / "icon-256.png")
    opaque(image, 180).save(WEB / "apple-touch-icon.png")


def write_android(image: Image.Image) -> None:
    for density, size in ANDROID_SIZES.items():
        target = NATIVE / f"android/res/mipmap-{density}/ic_launcher.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        resized(image, size).save(target)


def write_ios(image: Image.Image) -> None:
    folder = NATIVE / "ios/Images.xcassets/AppIcon.appiconset"
    entries = json.loads((folder / "Contents.json").read_text())["images"]
    for name, size in {entry["filename"]: int(entry["expected-size"]) for entry in entries}.items():
        opaque(image, size).save(folder / name)


def write_mac(image: Image.Image) -> None:
    folder = NATIVE / "mac/Assets.xcassets/AppIcon.appiconset"
    for entry in json.loads((folder / "Contents.json").read_text())["images"]:
        points = int(entry["size"].split("x")[0])
        resized(image, points * int(entry["scale"][0])).save(folder / entry["filename"])
    with tempfile.TemporaryDirectory() as temp:
        iconset = Path(temp) / "Icon.iconset"
        iconset.mkdir()
        for size in MAC_SIZES:
            resized(image, size).save(iconset / f"icon_{size}x{size}.png")
            resized(image, size * 2).save(iconset / f"icon_{size}x{size}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(NATIVE / "mac/Icon.icns")], check=True)


def write_windows(source: Path) -> None:
    # The window title bar uses the ICO's own 16x16 frame, as in the original game.
    target = NATIVE / "win64/res/game.ico"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ico", type=Path, default=ROOT / "tools/game.ico", help="Original game icon (ICO)")
    args = parser.parse_args()
    if not args.ico.is_file():
        parser.error(f"ICO not found: {args.ico}; supply --ico /path/to/game.ico")
    image = load(args.ico)
    write_web(image, args.ico)
    write_android(image)
    write_ios(image)
    write_mac(image)
    write_windows(args.ico)
    print(f"[icons] Generated web and native icons from {args.ico}")


if __name__ == "__main__":
    main()
