#!/usr/bin/env python3
"""Import TV115 lawn/store backgrounds and widescreen-pvz gardens, Wisdom Tree and car."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCES = {
    'background1': 'images/background1.jpg',
    'background1unsodded': 'images/background1unsodded.jpg',
    'sod1row': 'images/sod1row.png',
    'sod3row': 'images/sod3row.png',
    'background1_gameover_interior_overlay': 'images/background1_gameover_interior_overlay.png',
    'background1_gameover_mask': 'images/background1_gameover_mask.png',
    'store_background': 'images/Store_Background.jpg',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='PvZ-TV-115 checkout root')
    parser.add_argument('--car-source', type=Path, default=ROOT.parent / 'widescreen-pvz',
        help='widescreen-pvz root containing garden backgrounds, Wisdom Tree and store car')
    args = parser.parse_args()
    source = args.source.resolve() / 'app/src/main/assets/files'
    car_source = args.car_source.resolve()
    car_content = json.loads((car_source / 'content.json').read_text())
    inputs = {name: source / path for name, path in SOURCES.items()}
    for path in inputs.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    content = json.loads((ROOT / 'content.json').read_text())
    records = []
    for name, path in inputs.items():
        target = ROOT / 'assets/images' / (name + '.png')
        if path.suffix.lower() == '.png':
            shutil.copyfile(path, target)
        else:
            with Image.open(path) as image:
                image.convert('RGBA').save(target)
        with Image.open(target) as image:
            width, height = image.size
        file = target.relative_to(ROOT).as_posix()
        content['resources']['sprites']['local:widescreen/' + name] = dict(
            file=file, width=width, height=height, alphaMode='straight')
        records.append(dict(source=SOURCES[name], file=file, width=width, height=height,
            sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    car_records, garden_records = [], []
    for name in ['background_greenhouse', 'background_mushroomgarden', 'aquarium1', 'tree_bg',
            'store_car', 'store_carclosed', 'store_hatchbackopen']:
        entry = car_content['resources']['sprites']['local:widescreen-pvz/' + name]
        path = car_source / entry['file']
        target = ROOT / entry['file']
        shutil.copyfile(path, target)
        content['resources']['sprites']['local:widescreen/' + name] = entry.copy()
        destination = car_records if name.startswith('store_') else garden_records
        destination.append(dict(file=entry['file'], width=entry['width'], height=entry['height'],
            scale=entry.get('scale', 1), sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    tree_records = []
    for identifier, entry in car_content['resources']['sprites'].items():
        if not entry['file'].startswith('assets/tree/'):
            continue
        path, target = car_source / entry['file'], ROOT / entry['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        content['resources']['sprites'][identifier] = entry.copy()
        tree_records.append(dict(id=identifier, **entry, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (ROOT / 'content.json').write_text(json.dumps(content, indent=4) + '\n')
    conversion = json.loads((ROOT / 'conversion.json').read_text())
    conversion['tv115'] = dict(sourceRoot=str(source), images=records,
        lawnPadding=dict(x=240, y=60),
        note='PNG bytes retained; JPEG pixels exported losslessly to PNG.')
    conversion['storeCar'] = dict(sourceRoot=str(car_source), images=car_records,
        note='Same PNG bytes, logical dimensions and density as widescreen-pvz; complete car for each hatch state.')
    conversion['gardenBackgrounds'] = dict(sourceRoot=str(car_source), images=garden_records,
        note='Same PNG bytes, logical dimensions, density and alpha mode as widescreen-pvz; centered at 600px high.')
    conversion['tree'] = dict(sourceRoot=str(car_source), images=tree_records,
        note='Same PNG bytes and animation-scoped sprite declarations as widescreen-pvz; reuse the existing Wisdom Tree animations.')
    (ROOT / 'conversion.json').write_text(json.dumps(conversion, indent=4) + '\n')
    print(f'Imported {len(records)} TV backgrounds, {len(garden_records)} widescreen-pvz garden backgrounds, {len(tree_records)} Wisdom Tree sprites and {len(car_records)} car images')


if __name__ == '__main__':
    main()
