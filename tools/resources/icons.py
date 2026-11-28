#!/usr/bin/env python3
"""Generate the web and native app icons from the original game icon.

The icon is the IDI_MAIN_ICON group in the original PlantsVsZombies.exe, which is not kept in Git: supply it with
--exe (the default is tools/PlantsVsZombies.exe), or pass an .ico file with --ico instead.
Writes the web icons under build-templates/web-mobile/ and the macOS, iOS, Android and Windows icons
under native/engine/. All outputs are ignored by Git. iOS icons cannot be transparent, so they get
a white background and a margin that keeps the art clear of the rounded corners.
Requires Pillow; Icon.icns needs macOS `iconutil`.
"""

import argparse
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

from pvz.pe import icon  # noqa: E402

WEB = ROOT / "build-templates/web-mobile"
NATIVE = ROOT / "native/engine"
ANDROID_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
MAC_SIZES = (16, 32, 128, 256, 512)
IOS_MARGIN = 0.1


def load(ico: bytes) -> Image.Image:
    """The largest true-color frame; original icons also carry 4-bit and 8-bit frames."""
    image = Image.open(io.BytesIO(ico))
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


def write_web(image: Image.Image, ico: bytes) -> None:
    (WEB / "game.ico").write_bytes(ico)
    resized(image, 256).save(WEB / "icon-256.png")
    opaque(image, 180).save(WEB / "apple-touch-icon.png")


def write_android(image: Image.Image) -> None:
    for density, size in ANDROID_SIZES.items():
        target = NATIVE / f"android/res/mipmap-{density}/ic_launcher.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        resized(image, size).save(target)


def write_ios(image: Image.Image) -> None:
    # One 1024x1024 icon; Xcode makes the iPhone and iPad sizes from it.
    folder = NATIVE / "ios/Images.xcassets/AppIcon.appiconset"
    for entry in json.loads((folder / "Contents.json").read_text())["images"]:
        opaque(image, int(entry["size"].split("x")[0])).save(folder / entry["filename"])


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


def write_windows(ico: bytes) -> None:
    # The window title bar uses the ICO's own 16x16 frame, as in the original game.
    target = NATIVE / "win64/res/game.ico"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(ico)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--exe", type=Path, default=ROOT / "tools/PlantsVsZombies.exe",
                        help="Original game executable, whose main icon is used")
    parser.add_argument("--ico", type=Path, help="An .ico file to use instead of the executable's icon")
    args = parser.parse_args()
    source = args.ico or args.exe
    if not source.is_file():
        parser.error(f"Not found: {source}; supply --exe /path/to/PlantsVsZombies.exe or --ico /path/to/icon.ico")
    ico = source.read_bytes() if args.ico else icon(source.read_bytes(), "IDI_MAIN_ICON")
    image = load(ico)
    write_web(image, ico)
    write_android(image)
    write_ios(image)
    write_mac(image)
    write_windows(ico)
    print(f"[icons] Generated web and native icons from {source}")


if __name__ == "__main__":
    main()
