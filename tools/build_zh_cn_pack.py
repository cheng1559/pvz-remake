"""Build a text/image/font-only resource pack from the Chinese PvZ PAK."""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import tempfile
import zipfile
from pathlib import Path

from PIL import Image

from font_converter import PvZFontParser, _write_font_atlases
from lawnstrings_converter import parse_default_xml_strings, parse_lawnstrings
from pak_extractor import _decrypt, _entry_output_path, parse_pak
from sprite_texture_preprocessor import (
    _preprocess_to_png_bytes, get_alpha_companion_name,
    is_alpha_companion_name, load_alphagrid_resources, select_image_resources,
)

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'art/resource-packs/zh-cn'
PAK_SHA256 = 'b3fcbdbd48d30e0349d5faacf50303f6410480905534a0c7cd7fb95b23b51c38'


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def read_text(path: Path) -> str:
    data = path.read_bytes()
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data.decode('gb18030')


def convert_font(source: Path, original: dict) -> dict:
    parser = PvZFontParser(source)
    for layer in parser.layers:
        layer['image'] = layer['image'].lower()
    config = parser.to_json()
    extra = dict(zip(parser.defines.get('ExInfoKeys0', []), parser.defines.get('ExInfoValues0', [])))
    text = extra.get('sfb.text', '')
    parts = [parser, *[PvZFontParser(path) for path in sorted(source.parent.glob(f'{source.stem}_s*.txt'))]]
    if not text:
        raise ValueError(f'Missing Chinese character map: {source.name}')
    for index, layer in enumerate(config['layers']):
        # The PAK stores one ordered Unicode string and byte-indexed sub-fonts.
        # Their atlas rectangles give the common glyph order without guessing GBK bytes.
        glyphs = {tuple(glyph['rect']): glyph for part in parts for glyph in part.layers[index]['chars'].values()
                  if glyph['rect'][2] > 0 and glyph['rect'][3] > 0}
        ordered = sorted(glyphs, key=lambda rect: (rect[1], rect[0]))
        if len(ordered) != len(text):
            raise ValueError(f'Chinese glyph count mismatch: {source.name}')
        layer['chars'] = {'32': layer['chars']['32'], **{
            str(ord(char)): copy.deepcopy(glyphs[rect]) for char, rect in zip(text, ordered)
        }}
    # UI fontSize values use the existing logical point size. Glyph pixels/metrics stay from the PAK.
    config['defaultPointSize'] = original['defaultPointSize']
    config.update(schemaVersion=2, id=f'pvz:{source.stem}')
    _write_font_atlases(parser, config, PACK / 'fonts')
    write_json(PACK / f'fonts/{source.stem}.json', config)
    return config


def convert_images(raw: Path) -> dict:
    originals = {path.stem: path for directory in (ROOT / 'assets/resources/textures', ROOT / 'assets/bundles/pvz-base/sprites')
                 for path in directory.iterdir() if path.suffix.lower() in ('.png', '.jpg', '.jpeg')}
    alpha_grids = load_alphagrid_resources(raw / 'properties/resources.xml')
    sprites = {}
    for folder in ('images', 'reanim'):
        images = select_image_resources(raw / folder)
        grid_sources = {name for name, _ in alpha_grids.values()}
        for name, source in sorted(images.items()):
            if is_alpha_companion_name(name) or name in grid_sources:
                continue
            grid, output_name = alpha_grids.get(name, ('', name))
            original_path = originals.get(output_name)
            if not original_path:
                continue
            image = Image.open(io.BytesIO(_preprocess_to_png_bytes(source,
                alpha_src=images.get(get_alpha_companion_name(name)) or images.get(grid), transparent_color=None))).convert('RGBA')
            with Image.open(original_path) as original:
                original = original.convert('RGBA')
                if image.size != original.size:
                    image = image.resize(original.size, Image.Resampling.LANCZOS)
                clear = Image.new('RGBA', image.size)
                if Image.alpha_composite(clear, image).tobytes() == Image.alpha_composite(clear, original).tobytes():
                    continue
            target = PACK / f'sprites/{output_name}.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target)
            width, height = image.size
            # Trim the localized image itself so wider Chinese lettering is not cut off.
            left, top, right, bottom = image.getbbox() or (0, 0, width, height)
            meta = json.loads(original_path.with_suffix(original_path.suffix + '.meta').read_text())
            frame = next((value['userData'] for value in meta.get('subMetas', {}).values() if value['importer'] == 'sprite-frame'), {})
            sprites[f'pvz:{output_name}'] = {
                'file': f'sprites/{output_name}.png', 'width': width, 'height': height,
                'rect': [left, top, right - left, bottom - top],
                'offset': [(left + right - width) / 2, (height - top - bottom) / 2],
                'borders': [frame.get(key, 0) for key in ('borderLeft', 'borderTop', 'borderRight', 'borderBottom')],
            }
    return sprites


def build(source: Path):
    if source.suffix.lower() == '.zip':
        with zipfile.ZipFile(source) as archive:
            candidates = [name for name in archive.namelist() if Path(name).name.lower() == 'main.pak']
            if len(candidates) != 1:
                raise ValueError('Source ZIP must contain exactly one main.pak')
            pak = archive.read(candidates[0])
    else:
        pak = source.read_bytes()
    if hashlib.sha256(pak).hexdigest() != PAK_SHA256:
        raise ValueError('Source PAK does not match the documented Chinese patch')
    data = _decrypt(pak)
    with tempfile.TemporaryDirectory(prefix='pvz-zh-cn-') as temporary:
        raw = Path(temporary)
        for entry in parse_pak(data):
            name = entry.name.replace('\\', '/').lower()
            if name.split('/')[0] not in ('data', 'images', 'reanim', 'properties'):
                continue
            target = _entry_output_path(raw, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data[entry.data_offset:entry.data_offset + entry.size])

        for folder in ('fonts', 'sprites'):
            (PACK / folder).mkdir(parents=True, exist_ok=True)
            for path in (PACK / folder).iterdir():
                if path.suffix in ('.png', '.json'):
                    path.unlink()
        fonts = {}
        for original in sorted((ROOT / 'assets/resources/fonts').glob('*.json')):
            convert_font(raw / f'data/{original.stem}.txt', json.loads(original.read_text()))
            fonts[f'pvz:{original.stem}'] = f'fonts/{original.name}'
        sprites = convert_images(raw)
        strings = json.loads((ROOT / 'assets/resources/properties/lawnstrings.json').read_text())
        strings.update(parse_default_xml_strings(read_text(raw / 'properties/default.xml')))
        strings.update(parse_lawnstrings(read_text(raw / 'properties/lawnstrings.txt')))
        strings.update(ADVICE_HUGE_WAVE='一大波僵尸即将来袭！', ADVICE_ZOMBIES_ATE_BRAINS='僵尸吃掉了你的脑子！')
        write_json(PACK / 'text/lawnstrings.json', strings)
        gameplay = json.loads((ROOT / 'assets/bundles/pvz-base/gameplay/strings.json').read_text())
        gameplay['locale'] = 'zh-CN'
        gameplay['entries'] = {key: strings[key] for key in gameplay['entries']}
        write_json(PACK / 'text/level_strings.json', gameplay)

    manifest = {'id': 'zh-cn', 'sprites': sprites, 'fonts': fonts, 'json': {
        'pvz:properties/lawnstrings': 'text/lawnstrings.json', 'pvz:gameplay/strings': 'text/level_strings.json',
    }}
    write_json(PACK / 'pack.json', manifest)
    archive = ROOT / 'dist/resource-packs/zh-cn.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    files = {'pack.json', 'README.md', *manifest['json'].values(), *fonts.values(),
             *(entry['file'] for entry in sprites.values()),
             *(path.relative_to(PACK).as_posix() for path in (PACK / 'fonts').glob('*.png'))}
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
        for name in sorted(files):
            output.write(PACK / name, name)
    print(f'Chinese pack: {len(sprites)} sprites, {len(fonts)} fonts, {len(strings)} strings; {archive} ({archive.stat().st_size:,} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'tools/raw/localization/zh-cn/PvZ_Steam_ZH_Patch_Fixed.zip')
    build(parser.parse_args().input)
