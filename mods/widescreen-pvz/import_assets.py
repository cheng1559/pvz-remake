#!/usr/bin/env python3
"""Import the workspace PvZ widescreen art without resizing or recoloring it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / 'tools'))
from sprite_texture_preprocessor import write_preprocessed_resource
from PIL import Image

SOURCES = {
    'left': 'reanim/SelectorScreen_BG_Left.png',
    'center': 'reanim/SelectorScreen_BG_Center.jpg',
    'right': 'reanim/SelectorScreen_BG_Right.png',
    'sky': 'reanim/SelectorScreen_BG.png',
    'titlescreen': 'images/titlescreen.jpg',
    'background_greenhouse': 'images/Background_Greenhouse.png',
    'background_mushroomgarden': 'images/Background_MushroomGarden.png',
    'aquarium1': 'images/aquarium1.png',
    'tree_bg': 'reanim/tree_bg.png',
    'store_background': 'images/Store_Background.png',
    'store_car': 'images/Store_Car.png',
    'store_carclosed': 'images/Store_CarClosed.png',
    'store_hatchbackopen': 'images/Store_HatchbackOpen.png',
    'background1': 'images/background1.png',
    'background1unsodded': 'images/background1unsodded.png',
    'sod1row': 'images/sod1row.png',
    'sod3row': 'images/sod3row.png',
    'background1_gameover_interior_overlay': 'images/background1_gameover_interior_overlay.png',
    'background1_gameover_mask': 'images/background1_gameover_mask.png',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='PvZ workspace directory containing images/ and reanim/')
    source = parser.parse_args().source.resolve()
    for file in [*SOURCES.values(), 'reanim/SelectorScreen_BG_Center_.png']:
        if not (source / file).is_file():
            raise FileNotFoundError(source / file)
    images = ROOT / 'assets/images'
    images.mkdir(parents=True, exist_ok=True)
    sprites, records = {}, []
    for name, file in SOURCES.items():
        path, target = source / file, images / f'{name}.png'
        alpha = source / 'reanim/SelectorScreen_BG_Center_.png' if name == 'center' else None
        if path.suffix.lower() == '.png':
            shutil.copyfile(path, target)
        else:
            write_preprocessed_resource(path, target, alpha_src=alpha, force_png=True)
        with Image.open(target) as image:
            width, height = image.size
        relative = target.relative_to(ROOT).as_posix()
        sprites[f'local:widescreen-pvz/{name}'] = {
            'file': relative, 'width': width, 'height': height, 'alphaMode': 'straight',
        }
        inputs = [file] + ([alpha.relative_to(source).as_posix()] if alpha else [])
        records.append({'file': relative, 'width': width, 'height': height,
                        'sources': {file: hashlib.sha256((source / file).read_bytes()).hexdigest() for file in inputs},
                        'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    resources = {'sprites': sprites}
    for name in ['ultimate-bushes-resources.json', 'tree-resources.json']:
        fragment = ROOT / name
        if fragment.exists():
            for category, values in json.loads(fragment.read_text()).items():
                resources.setdefault(category, {}).update(values)
    (ROOT / 'content.json').write_text(json.dumps({'resources': resources}, indent=4) + '\n')
    (ROOT / 'conversion.json').write_text(json.dumps({'sourceRoot': str(source), 'images': records}, indent=4) + '\n')
    print(f'Imported {len(records)} images from {source}')


if __name__ == '__main__':
    main()
