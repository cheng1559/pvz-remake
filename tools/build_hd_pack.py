"""Package existing HD images/fonts with stable resource IDs; no neural inference."""
import argparse
import json
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'art/resource-packs/hd'
BASE = ROOT / 'assets/bundles/pvz-base'


def build(pack=PACK, pack_id='hd'):
    sprites = {}
    metadata = json.loads((pack / 'sprites/manifest.json').read_text())
    for name, entry in metadata['images'].items():
        candidates = [ROOT / 'assets/resources/textures' / f'{name}{extension}.meta' for extension in ('.png', '.jpg', '.jpeg')]
        candidates.append(ROOT / 'assets/resources/textures/particles' / f'{name}.png.meta')
        candidates.append(BASE / 'sprites' / f'{name}.png.meta')
        meta_path = next((path for path in candidates if path.exists()), None)
        meta = json.loads(meta_path.read_text()) if meta_path else {}
        frame = next((value['userData'] for value in meta.get('subMetas', {}).values() if value['importer'] == 'sprite-frame'), {})
        sprite = {'file': f'sprites/{name}.png', 'width': entry['width'], 'height': entry['height'], 'scale': metadata['scale'],
                  'rect': [frame.get('trimX', 0), frame.get('trimY', 0), frame.get('width', entry['width']), frame.get('height', entry['height'])],
                  'offset': [frame.get('offsetX', 0), frame.get('offsetY', 0)],
                  'borders': [frame.get(key, 0) for key in ('borderLeft', 'borderTop', 'borderRight', 'borderBottom')]}
        if 'animations' in entry:
            sprite['animations'] = entry['animations']
        sprites[f'pvz:{name}'] = sprite

    # The UI-only pack supplies two HD backgrounds; a full pack already has an SR atlas.
    if 'seeds' not in metadata['images']:
        with Image.open(BASE / 'sprites/seeds.png') as source:
            seeds = source.convert('RGBA').resize((900, 140), Image.Resampling.NEAREST)
        for name, column in [('seedpacket_larger', 2), ('seedpacket_upgrade_larger', 1)]:
            path = pack / f'sprites/{name}.png'
            with Image.open(path) as source:
                image = source.convert('RGBA')
                if image.size != (100, 140):
                    raise ValueError(f'{name} must be 100x140')
                seeds.paste(image, (column * 100, 0))
            sprites[f'pvz:{name}'] = {'file': f'sprites/{name}.png', 'width': 100, 'height': 140}
        seeds.save(pack / 'sprites/seeds.png')
        sprites['pvz:seeds'] = {'file': 'sprites/seeds.png', 'width': 450, 'height': 70, 'scale': 2}

    fonts = {f'pvz:{path.stem}': f'fonts/{path.name}' for path in sorted((pack / 'fonts').glob('*.json'))}
    if any(name in fonts for name in ('pvz:pico129', 'pvz:pix118bold')):
        raise ValueError('Pixel fonts must not be included in the HD pack')
    manifest = {'id': pack_id, 'sprites': sprites, 'fonts': fonts}
    (pack / 'pack.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    archive = ROOT / f'dist/resource-packs/{pack_id}.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
        for path in sorted(pack.rglob('*')):
            if path.is_file() and path.suffix != '.meta' and path.name != 'manifest.json':
                output.write(path, path.relative_to(pack).as_posix())
    print(f'{pack_id}: {len(sprites)} sprites, {len(fonts)} fonts; {archive}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, default=PACK)
    parser.add_argument('--id', default='hd')
    args = parser.parse_args()
    build(args.pack, args.id)
