"""Redraws the cached plant and zombie portraits and the lawn mower for an HD pack from that pack's own part images, instead of
super-resolving the 1x atlases, so they match the HD plants and zombies on the lawn.

    python3 -m pvz.cache.hd ../art/resource-packs/hd   (run from tools/)

Every part comes from the pack at the density its content.json records, as the game draws it. The portraits draw parts
at about half size, so they are written at 4x to keep every pixel of the 2x parts. The plant previews sheet would take
120 MB of GPU memory at 4x (7040x4480), so it and the lawn mower are drawn at 2x, the density of the HD parts.
"""
import argparse
import json
from pathlib import Path

from .. import ROOT
from . import lawnmower, packets, plants, zombies

SCALES = {'packet_plants_cached': 4, 'plant_previews_cached': 2, 'zombie_previews_cached': 4, 'lawnmower_cached': 2}


def part_images(pack: Path) -> dict[str, tuple[Path, int]]:
    """The pack's images by the base file names Reanim tracks use, with their densities."""
    base = json.loads((ROOT / 'mods/pvz-base/content.json').read_text())['resources']['sprites']
    replaced = json.loads((pack / 'content.json').read_text())['resources']['sprites']
    return {Path(entry['file']).stem: (pack / replaced[id]['file'], replaced[id].get('scale', 1))
            for id, entry in base.items() if id in replaced and id == f"pvz:{Path(entry['file']).stem}"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    args = parser.parse_args()
    index = args.pack / 'content.json'
    text = index.read_text()
    content = json.loads(text)
    sprites = content['resources']['sprites']
    parts = part_images(args.pack)
    for name, generate in [('packet_plants_cached', packets.generate), ('plant_previews_cached', plants.generate),
                           ('zombie_previews_cached', zombies.generate), ('lawnmower_cached', lawnmower.generate)]:
        scale = SCALES[name]
        packets.hd(scale, parts)
        entry = sprites[f'pvz:{name}']
        generate(args.pack / entry['file'])
        entry['scale'] = scale
    # The pack keeps its compact, unindented index.
    index.write_text(json.dumps(content, separators=(',', ':'), ensure_ascii=False) + ('\n' if text.endswith('\n') else ''))


if __name__ == '__main__':
    main()
