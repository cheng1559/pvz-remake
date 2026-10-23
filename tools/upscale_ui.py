#!/usr/bin/env python3
"""Batch 2x UI super-resolution. Originals and logical sprite coordinates stay intact.

Uses the cached Real-ESRGAN model from upscale_fonts.py; see licenses/font-upscale.txt.
Requires Pillow, NumPy and PyTorch. Re-running skips unchanged completed outputs.
"""

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from xml.etree import ElementTree

import torch
from PIL import Image, ImageDraw

from upscale_fonts import Upscaler

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/resources/textures"
BASE_BUNDLE = ROOT / "assets/bundles/pvz-base"
OUTPUT = ROOT / "art/resource-packs/hd/sprites"
SCALE = 2
PREFIXES = (
    "options_", "button_", "seedchooser_button", "dialog_", "almanac_",
    "selectorscreen_", "store_", "challenge_", "acheesements_", "achievements_",
)
NAMES = {
    "editbox", "coinbank", "trophy", "minigame_trophy",
    "titlescreen", "pvz_logo", "popcap_logo", "loadbar_dirt", "loadbar_grass", "sodrollcap",
    "background_greenhouse", "background_mushroomgarden", "aquarium1", "tree_bg",
    "background1", "background1unsodded", "sod1row", "sod3row", "seedbank", "sunbank",
    "flagmeter", "flagmeterparts", "flagmeterlevelprogress",
    "zombienote", "zombie_note_help", "awardscreen_back",
    "zen_nextgarden", "zenshopbutton", "zenshopbutton_highlight", "zen_gardenglove", "zen_wheelbarrow",
    "icon_poolcleaner", "icon_rake", "icon_roofcleaner", "imitaterseed", "wateringcangold",
    "fertilizer", "bug_spray", "phonograph", "treefood", "stinky_turn3",
}
EXCLUDED_NAMES = {"challenge_thumbnails", "survival_thumbnails"}
SHEETS = {"acheesements_icons": (70, 70), "selectorscreen_levelnumbers": (12, 17),
          "flagmeter": (158, 27), "flagmeterparts": (25, 25)}


def animation_sprites():
    """Follow installed UI clips, including shared parts whose names are not UI-prefixed."""
    manifest = json.loads((BASE_BUNDLE / "manifest.json").read_text())
    names = {}
    for content_id, path in manifest["client"]["reanim"].items():
        if not (content_id.startswith(("pvz:selector_", "pvz:loadbar_")) or content_id == "pvz:sodroll"):
            continue
        clip = json.loads((BASE_BUNDLE / f"{path}.json").read_text())
        for track in clip["tracks"]:
            for frame in track["keyframes"]:
                if frame["sprite"]:
                    names.setdefault(frame["sprite"].split(":", 1)[1], set()).add(content_id)
    return names


def sources(dependencies, all_images=False):
    if all_images:
        return {path.stem: path for directory in (BASE_BUNDLE / 'sprites', SOURCE / 'particles', SOURCE)
                for path in sorted(directory.iterdir()) if path.suffix.lower() in {'.png', '.jpg', '.jpeg'}}
    selected = {path.stem: path for path in sorted(SOURCE.iterdir())
            if path.suffix.lower() in {".png", ".jpg", ".jpeg"}
            and (path.stem in NAMES or path.stem in dependencies or path.stem.startswith(PREFIXES))
            and path.stem not in EXCLUDED_NAMES}
    for name in sorted(dependencies.keys() - selected.keys()):
        path = BASE_BUNDLE / "sprites" / f"{name}.png"
        if not path.is_file():
            raise FileNotFoundError(f"missing UI animation sprite: {name}")
        selected[name] = path
    return selected


def all_sheet_sizes(inputs):
    """Use original frame grids so SR never mixes adjacent animation cells."""
    sheets = {}

    def add(name, columns, rows):
        if name not in inputs or columns * rows <= 1:
            return
        with Image.open(inputs[name]) as image:
            cell = (image.width / columns, image.height / rows)
        if name in sheets and sheets[name] != cell:
            raise ValueError(f'Conflicting sprite grids: {name}')
        sheets[name] = cell

    resources = ElementTree.parse(ROOT / 'tools/raw/properties/resources.xml')
    for image in resources.findall('.//Image'):
        name = Path(image.get('path', '').replace('\\', '/')).stem.lower()
        add(name, int(image.get('cols', 1)), int(image.get('rows', 1)))
    for path in sorted((ROOT / 'assets/resources/particles').glob('*.json')):
        for emitter in json.loads(path.read_text())['emitters']:
            name = emitter.get('image', '').split('/')[-1]
            add(name, int(emitter.get('imageColumns', emitter.get('imageFrames', 1))), int(emitter.get('imageRows', 1)))
    sheets.update(SHEETS)
    sheets.update({'packet_plants_cached': (50, 70), 'plant_previews_cached': (220, 160),
                   'zombie_previews_cached': (76, 76)})
    return sheets


def update_animation_scopes(manifest, dependencies):
    for name, image in manifest["images"].items():
        if name in dependencies and name not in NAMES and not name.startswith(PREFIXES):
            image["animations"] = sorted(dependencies[name])
        else:
            image.pop("animations", None)


def write_manifest(path, manifest):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n")
    temporary.replace(path)


def upscale(image, model):
    # Opaque backgrounds need only one inference. RGBA icons use the existing
    # black/white composite method to preserve transparency without black halos.
    image = image.convert("RGBA")
    opaque = image.getextrema()[3] == (255, 255)
    result = model.rgb(image) if opaque else model.rgba(image)
    return result.convert("RGBA").resize((image.width * SCALE, image.height * SCALE), Image.Resampling.LANCZOS)


def upscale_sheet(image, cell, model):
    result = Image.new("RGBA", (image.width * SCALE, image.height * SCALE))
    width, height = cell
    for row in range(math.ceil(image.height / height)):
        for column in range(math.ceil(image.width / width)):
            x, y = round(column * width), round(row * height)
            right, bottom = min(round((column + 1) * width), image.width), min(round((row + 1) * height), image.height)
            if right > x and bottom > y:
                result.paste(upscale(image.crop((x, y, right, bottom)), model), (x * SCALE, y * SCALE))
    return result


def comparison(name, original, result, model_name):
    # Crop backgrounds instead of shrinking the output for review.
    box = (0, 0, min(original.width, 300), min(original.height, 220))
    original = original.crop(box).convert("RGBA").resize((box[2] * SCALE, box[3] * SCALE), Image.Resampling.LANCZOS)
    result = result.crop(tuple(value * SCALE for value in box))
    canvas = Image.new("RGB", (original.width * 2, original.height + 24), "#888888")
    canvas.paste(original, (0, 24), original)
    canvas.paste(result, (original.width, 24), result)
    draw = ImageDraw.Draw(canvas)
    draw.text((6, 5), "Original (2x display)", fill="white")
    draw.text((original.width + 6, 5), f"{model_name} 2x", fill="white")
    directory = ROOT / "art/generated/ui-upscale"
    directory.mkdir(parents=True, exist_ok=True)
    canvas.save(directory / f"{name}-comparison.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="process only these UI sprite names")
    parser.add_argument("--all", action="store_true", help="include all textures, animation parts, particles and thumbnails")
    parser.add_argument("--list", action="store_true", help="list the selected inputs without inference")
    parser.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    parser.add_argument("--model", default="general", help="general, waifu2x, or a 4x RGB model file (requires spandrel)")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.all and args.output == OUTPUT:
        parser.error('--all requires a separate --output directory')
    dependencies = {} if args.all else animation_sprites()
    inputs = sources(dependencies, args.all)
    sheets = all_sheet_sizes(inputs) if args.all else SHEETS
    excluded = set() if args.all else EXCLUDED_NAMES
    if args.only:
        unknown = set(args.only) - inputs.keys()
        if unknown:
            parser.error(f"not selected UI sprites: {sorted(unknown)}")
        inputs = {name: inputs[name] for name in args.only}
    if args.list:
        pixels = 0
        for name, path in inputs.items():
            with Image.open(path) as image:
                pixels += image.width * image.height
                print(f"{name}: {image.width}x{image.height}")
        print(f"{len(inputs)} images, {pixels / 1e6:.2f} MP source, {pixels * SCALE ** 2 * 4 / 1024 ** 2:.0f} MiB RGBA total")
        return

    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"scale": SCALE, "model": "realesr-general-x4v3", "images": {}}
    for name in excluded:
        manifest["images"].pop(name, None)
    update_animation_scopes(manifest, dependencies)
    write_manifest(manifest_path, manifest)
    for name in excluded:
        (output / f"{name}.png").unlink(missing_ok=True)
        (output / f"{name}.png.meta").unlink(missing_ok=True)
    signature = hashlib.sha256(Path(__file__).read_bytes() + (ROOT / 'tools/upscale_fonts.py').read_bytes()
                               + args.model.encode() + json.dumps(sheets, sort_keys=True).encode())
    if Path(args.model).is_file():
        weights_hash = hashlib.sha256(Path(args.model).read_bytes()).hexdigest()
        signature.update(weights_hash.encode())
        manifest['weightsSha256'] = weights_hash
    else:
        manifest.pop('weightsSha256', None)
    manifest['model'] = Path(args.model).stem
    signature = signature.hexdigest()
    model = None
    start = time.monotonic()
    for index, (name, path) in enumerate(inputs.items(), 1):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        target = output / f"{name}.png"
        previous = manifest["images"].get(name, {})
        if target.exists() and previous.get("sourceHash") == digest and previous.get("generatorHash") == signature:
            print(f"[{index}/{len(inputs)}] cached {name}", flush=True)
            continue
        if model is None:
            model = Upscaler(args.model, args.device)
        with Image.open(path) as source:
            image = source.convert("RGBA")
        result = upscale_sheet(image, sheets[name], model) if name in sheets else upscale(image, model)
        temporary = target.with_suffix(".tmp")
        result.save(temporary, "PNG")
        temporary.replace(target)
        manifest["images"][name] = {"width": image.width, "height": image.height,
                                    "sourceHash": digest, "generatorHash": signature}
        update_animation_scopes(manifest, dependencies)
        # Publish only complete images; interrupted batches can safely resume.
        write_manifest(manifest_path, manifest)
        if name in {"options_menuback", "button_left", "challenge_background"}:
            comparison(name, image, result, model.name)
        print(f"[{index}/{len(inputs)}] {name} {image.width}x{image.height} -> {result.width}x{result.height}, elapsed {time.monotonic() - start:.0f}s", flush=True)
        if args.device == "mps":
            torch.mps.empty_cache()


if __name__ == "__main__":
    main()
