#!/usr/bin/env python3
"""Import the PvZ widescreen almanac and challenge backgrounds without resizing."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'almanac_indexback': 'images/Almanac_IndexBack.png',
    'almanac_plantback': 'images/Almanac_PlantBack.png',
    'almanac_zombieback': 'images/Almanac_ZombieBack.png',
    'challenge_background': 'images/Challenge_Background.png',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='PvZ widescreen directory containing images/')
    source = parser.parse_args().source.resolve()
    for file in SOURCES.values():
        if not (source / file).is_file():
            raise FileNotFoundError(source / file)
    content = json.loads((ROOT / 'content.json').read_text())
    records = []
    for name, file in SOURCES.items():
        path, target = source / file, ROOT / 'assets/images' / f'{name}.png'
        shutil.copyfile(path, target)
        with Image.open(target) as image:
            width, height = image.size
        relative = target.relative_to(ROOT).as_posix()
        content['resources']['sprites'][f'local:widescreen/{name}'] = dict(
            file=relative, width=width, height=height, alphaMode='straight')
        records.append(dict(source=file, file=relative, width=width, height=height,
            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (ROOT / 'content.json').write_text(json.dumps(content, indent=4) + '\n')
    conversion = json.loads((ROOT / 'conversion.json').read_text())
    conversion['menuBackgrounds'] = dict(sourceRoot=str(source), images=records,
        note='Original PvZ widescreen PNG bytes retained; centered at 1066x600, without resizing.')
    (ROOT / 'conversion.json').write_text(json.dumps(conversion, indent=4) + '\n')
    print(f'Imported {len(records)} PvZ widescreen almanac/challenge backgrounds')


if __name__ == '__main__':
    main()
