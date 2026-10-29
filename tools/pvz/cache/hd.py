"""Redraws the cached plant and zombie portraits and the lawn mower for an HD pack from that pack's own part images, instead of
super-resolving the 1x atlases, so they match the HD plants and zombies on the lawn.

    python3 -m pvz.cache.hd ../art/resource-packs/hd --raw-root <decompiled reanim dir>   (run from tools/)

The raw root needs zombie_boss.reanim and zombie_boss_driver.reanim (decompiled with pvz.compiled_reanim) for the
Zomboss portrait. Parts the pack lacks, or stores at another density, fall back to the base images. The portraits draw parts at about
half size, so they are written at 4x to keep every pixel of the 2x parts; the pack's content.json records that density.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

from .. import ROOT
from . import lawnmower, packets, plants, zombies

PART_SCALE = 2
OUTPUT_SCALE = 4


def part_images(pack: Path) -> dict[str, Path]:
    base = json.loads((ROOT / 'mods/pvz-base/content.json').read_text())['resources']['sprites']
    replaced = json.loads((pack / 'content.json').read_text())['resources']['sprites']
    images = {}
    for id, entry in base.items():
        name = Path(entry['file']).stem
        hd = replaced.get(id)
        if id != f'pvz:{name}' or not hd or hd.get('scale') != PART_SCALE:
            continue
        width, height = Image.open(ROOT / 'mods/pvz-base' / entry['file']).size
        if Image.open(pack / hd['file']).size == (width * PART_SCALE, height * PART_SCALE):
            images[name] = pack / hd['file']
    return images


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    parser.add_argument('--raw-root', type=Path, required=True)
    args = parser.parse_args()
    index = args.pack / 'content.json'
    text = index.read_text()
    content = json.loads(text)
    sprites = content['resources']['sprites']
    packets.hd(OUTPUT_SCALE, part_images(args.pack), PART_SCALE)
    for name, generate in [('packet_plants_cached', packets.generate), ('plant_previews_cached', plants.generate),
                           ('zombie_previews_cached', lambda output: zombies.generate(args.raw_root, output)),
                           ('lawnmower_cached', lawnmower.generate)]:
        entry = sprites[f'pvz:{name}']
        generate(args.pack / entry['file'])
        entry['scale'] = OUTPUT_SCALE
    # The pack keeps its compact, unindented index.
    index.write_text(json.dumps(content, separators=(',', ':'), ensure_ascii=False) + ('\n' if text.endswith('\n') else ''))


if __name__ == '__main__':
    main()
