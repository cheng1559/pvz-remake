"""Convert JiangNanGame's unpacked PVZ2PAK into an installable visual resource pack."""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image

from almanac_assets import almanac_definitions
from build_pvz_base import ADVENTURE_12_CLIPS, LEVEL_CLIPS, MAIN_MENU_CLIPS, PLANT_ZOMBIE_CLIPS, STARTUP_CLIPS
from build_zh_cn_pack import read_text, write_json
from decompile_particle_compiled import convert_directory as decompile_particles
from decompile_reanim_compiled import convert_file as decompile_reanim
from font_converter import PvZFontParser, _write_font_atlases
from lawnstrings_converter import parse_lawnstrings
from particle_converter import convert_directory as convert_particles
from reanim_converter import build_reanim_clip, content_sprite_name, get_anim_nodes, parse_track_data
from sprite_texture_preprocessor import (
    _preprocess_to_png_bytes, get_alpha_companion_name, is_alpha_companion_name,
    load_alphagrid_resources, select_image_resources,
)

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'dist/resource-packs/jiangnan-pvz2'
COMMIT = '74ec8f95c369d4aa30afdd2fc9b7e764bff924c7'


def extract(source: Path, raw: Path):
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            parts = Path(info.filename).parts[1:]
            if not parts or info.is_dir():
                continue
            if '..' in parts or any(':' in part for part in parts):
                raise ValueError(f'Invalid source ZIP path: {info.filename}')
            if parts[0].lower() not in ('images', 'reanim', 'compiled', 'particles', 'data', 'properties') and parts[0] not in ('README.md', 'LICENSE-ENGLISH.md'):
                continue
            target = raw.joinpath(*(part.lower() for part in parts))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
    for path in sorted((raw / 'compiled/reanim').glob('*.reanim.compiled')):
        decompile_reanim(path, raw / 'reanim')
    for original, alias in [('zombie_jackson', 'zombie_disco'), ('zombie_dancer', 'zombie_backup')]:
        target = raw / f'reanim/{alias}.reanim'
        if not target.exists():
            shutil.copyfile(raw / f'reanim/{original}.reanim', target)
    decompile_particles(raw / 'compiled/particles', raw / 'particles')


def convert_images(raw: Path) -> tuple[dict, list]:
    originals = {path.stem: path for directory in (ROOT / 'assets/resources/textures', ROOT / 'assets/bundles/pvz-base/sprites')
                 for path in directory.iterdir() if path.suffix.lower() in ('.png', '.jpg', '.jpeg')}
    grids = load_alphagrid_resources(raw / 'properties/resources.xml')
    sprites = {}
    rejected = []
    referenced = {content_sprite_name((node.text or '').removeprefix('IMAGE_REANIM_').removeprefix('IMAGE_').lower())
                  for path in [*(raw / 'reanim').glob('*.reanim'), *(raw / 'particles').glob('*.xml')]
                  for node in ElementTree.fromstring('<root>' + path.read_text() + '</root>').iter()
                  if node.tag in ('i', 'Image')}
    resources = ElementTree.parse(raw / 'properties/resources.xml')
    referenced.update(Path(node.get('path', '')).stem.lower() for node in resources.iter('Image'))
    for folder in ('images', 'particles', 'reanim'):
        images = select_image_resources(raw / folder)
        for name, source in sorted(images.items()):
            if is_alpha_companion_name(name) or name in {grid for grid, _ in grids.values()}:
                continue
            grid, output_name = grids.get(name, ('', name))
            output_name = content_sprite_name(output_name)
            try:
                data = _preprocess_to_png_bytes(source,
                    alpha_src=images.get(get_alpha_companion_name(name)) or images.get(grid), transparent_color=None)
            except OSError:
                if output_name in referenced:
                    raise
                rejected.append(source.relative_to(raw).as_posix())
                continue
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                left, top, right, bottom = image.getbbox() or (0, 0, width, height)
            file = f'sprites/{output_name}.png'
            (PACK / file).write_bytes(data)
            original = originals.get(output_name)
            meta = json.loads(original.with_suffix(original.suffix + '.meta').read_text()) if original else {}
            frame = next((entry['userData'] for entry in meta.get('subMetas', {}).values() if entry['importer'] == 'sprite-frame'), {})
            sprites[f'pvz:{output_name}'] = {
                'file': file, 'width': width, 'height': height,
                'rect': [left, top, right - left, bottom - top],
                'offset': [(left + right - width) / 2, (height - top - bottom) / 2],
                'borders': [frame.get(key, 0) for key in ('borderLeft', 'borderTop', 'borderRight', 'borderBottom')],
            }
    return sprites, rejected


def convert_fonts(raw: Path) -> dict:
    fonts = {}
    for original in sorted((ROOT / 'assets/resources/fonts').glob('*.json')):
        source = raw / f'data/{original.stem}.txt'
        parser = PvZFontParser(source)
        for layer in parser.layers:
            layer['image'] = layer['image'].lower()
        config = parser.to_json()
        config.update(schemaVersion=2, id=f'pvz:{original.stem}', defaultPointSize=json.loads(original.read_text())['defaultPointSize'])
        _write_font_atlases(parser, config, PACK / 'fonts')
        file = f'fonts/{original.name}'
        write_json(PACK / file, config)
        fonts[f'pvz:{original.stem}'] = file
    return fonts


def marker_track(name: str, duration: int) -> ElementTree.Element:
    track = ElementTree.Element('track')
    ElementTree.SubElement(track, 'name').text = name
    for _ in range(duration):
        ElementTree.SubElement(track, 't')
    return track


def convert_animations(raw: Path, sprites: dict, legacy: Path) -> tuple[dict, dict]:
    catalog, configs, almanac_clips = almanac_definitions(raw)
    clips = [(raw / 'reanim' / source.name, node, clip, id)
             for source, node, clip, id in [*LEVEL_CLIPS, *ADVENTURE_12_CLIPS, *PLANT_ZOMBIE_CLIPS, *MAIN_MENU_CLIPS, *STARTUP_CLIPS]]
    clips.extend(almanac_clips)
    defaults = {(source.stem, node) for source, node, clip, _ in clips if clip == 'default'}
    roots = {name: ElementTree.fromstring('<root>' + (raw / f'reanim/{name}.reanim').read_text() + '</root>') for name in configs}
    empty_blinks = []
    empty_clips = []
    sockets = []
    prepared = {}
    active_markers = {}
    for name, nodes in configs.items():
        root = roots[name]
        tracks = {track.findtext('name'): track for track in root.findall('track')}
        active = {name for name, track in tracks.items() if parse_track_data(track)[2]}
        active_markers[name] = active
        duration = len(root.find('track').findall('t'))
        for slot in {slot for node in nodes.values() for slot in node.get('slots', [])} - active:
            if slot in tracks:
                root.remove(tracks[slot])
            root.append(marker_track(slot, duration))
            sockets.append(f'{name}:{slot}')
        (raw / f'reanim/{name}.reanim').write_text(''.join(ElementTree.tostring(child, encoding='unicode') for child in root), encoding='utf-8')
        # Missing independent blink clips belong to the complete PVZ2 idle animation.
        for node in nodes.values():
            node['animations'] = [clip for clip in node['animations'] if clip == 'default' or clip in active]
        prepared[name] = get_anim_nodes(name, configs[name], root)
        for node_id, node in nodes.items():
            if not node['animations'] and (name, node_id) not in defaults:
                prepared[name][node_id]['tracks'] = {}
        write_json(legacy / f'{name}.json', prepared[name])

    manifest = json.loads((ROOT / 'assets/bundles/pvz-base/manifest.json').read_text())
    available = set(sprites) | set(manifest['client']['sprites'])
    entries = {}
    for source, node, clip, id in clips:
        if clip not in active_markers[source.stem] and clip != 'default':
            slots = configs[source.stem][node].get('slots', []) or ['disabled_clip']
            data = {'schemaVersion': 2, 'id': id, 'durationSeconds': 1 / 12, 'tracks': [{
                'id': slot, 'zIndex': index, 'keyframes': [{
                    'timeSeconds': 0, 'x': 0, 'y': 0, 'scaleX': 1, 'scaleY': 1,
                    'skewX': 0, 'skewY': 0, 'alpha': 1, 'sprite': None, 'interpolation': 'linear',
                }],
            } for index, slot in enumerate(slots)]}
            (empty_blinks if 'blink' in clip.lower() else empty_clips).append(id)
        else:
            data = build_reanim_clip(source, configs[source.stem], node, clip, id, available, nodes=prepared[source.stem])
        file = f'animations/{id.split(":", 1)[1]}.json'
        write_json(PACK / file, data)
        entries[id] = file
    write_json(PACK / 'text/almanac-animations.json', catalog)
    entries['pvz:almanac-animations'] = 'text/almanac-animations.json'
    return entries, {'integratedBlinks': empty_blinks, 'emptySourceClips': empty_clips, 'identitySockets': sockets}


def build_caches(raw: Path, legacy: Path, sprites: dict):
    import generate_packet_plant_cache as packets
    import generate_plant_preview_cache as plants
    import generate_zombie_preview_cache as zombies
    import generate_lawnmower_cache as mower
    packets.ANIMATION_DIR = plants.ANIMATION_DIR = zombies.ANIMATION_DIR = mower.ANIMATION_DIR = legacy
    packets.TEXTURE_DIR = PACK / 'sprites'
    # The PVZ2 source repeats equipment track names; the converter adds unique suffixes.
    tracks = json.loads((legacy / 'zombie.json').read_text())['body']['tracks']
    def expanded(names):
        return set(names) | {track for track in tracks if any(track.startswith(name) for name in names)}
    zombies.HIDDEN_BY_DEFAULT = expanded(zombies.HIDDEN_BY_DEFAULT)
    zombies.ZOMBIE_DEFINITIONS = copy.deepcopy(zombies.ZOMBIE_DEFINITIONS)
    for definition in zombies.ZOMBIE_DEFINITIONS.values():
        if definition['animation'] == 'zombie':
            for field in ('show', 'hide'):
                definition[field] = sorted(expanded(definition.get(field, [])))
    for module, name in [(packets, 'packet_plants_cached'), (plants, 'plant_previews_cached')]:
        module.OUTPUT_PATH = PACK / f'sprites/{name}.png'
        module.main()
    atlas = Image.new('RGBA', (zombies.ATLAS_COLUMNS * zombies.CELL_WIDTH, 4 * zombies.CELL_HEIGHT))
    for id in range(zombies.ZOMBIE_COUNT):
        atlas.alpha_composite(zombies.render_zombie_preview(id, raw / 'reanim'),
                              (id % zombies.ATLAS_COLUMNS * zombies.CELL_WIDTH, id // zombies.ATLAS_COLUMNS * zombies.CELL_HEIGHT))
    atlas.save(PACK / 'sprites/zombie_previews_cached.png')
    mower.render_lawnmower_cache().save(PACK / 'sprites/lawnmower_cached.png')
    for name in ('packet_plants_cached', 'plant_previews_cached', 'zombie_previews_cached', 'lawnmower_cached'):
        with Image.open(PACK / f'sprites/{name}.png') as image:
            sprites[f'pvz:{name}'] = {'file': f'sprites/{name}.png', 'width': image.width, 'height': image.height}


def build(source: Path):
    for folder in ('sprites', 'fonts', 'animations', 'particles', 'text'):
        path = PACK / folder
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True)
    shutil.copyfile(ROOT / 'art/resource-packs/jiangnan-pvz2/README.md', PACK / 'README.md')
    with tempfile.TemporaryDirectory(prefix='pvz2pak-') as temporary:
        raw, legacy = Path(temporary) / 'raw', Path(temporary) / 'legacy'
        extract(source, raw)
        shutil.copyfile(raw / 'license-english.md', PACK / 'LICENSE-ENGLISH.md')
        shutil.copyfile(raw / 'readme.md', PACK / 'SOURCE-README.md')
        sprites, rejected = convert_images(raw)
        fonts = convert_fonts(raw)
        entries, adaptations = convert_animations(raw, sprites, legacy)
        build_caches(raw, legacy, sprites)
        convert_particles(raw / 'particles', PACK / 'particles', raw / 'properties/resources.xml')
        for path in (PACK / 'particles').glob('*.json'):
            entries[f'pvz:particles/{path.stem}'] = f'particles/{path.name}'
        strings = json.loads((ROOT / 'assets/resources/properties/lawnstrings.json').read_text())
        strings.update(parse_lawnstrings(read_text(raw / 'properties/lawnstrings.txt')))
        write_json(PACK / 'text/lawnstrings.json', strings)
        gameplay = json.loads((ROOT / 'assets/bundles/pvz-base/gameplay/strings.json').read_text())
        gameplay['entries'] = {key: strings.get(key, value) for key, value in gameplay['entries'].items()}
        write_json(PACK / 'text/level_strings.json', gameplay)
        entries.update({'pvz:properties/lawnstrings': 'text/lawnstrings.json', 'pvz:gameplay/strings': 'text/level_strings.json'})
    write_json(PACK / 'pack.json', {'id': 'jiangnan-pvz2', 'sprites': sprites, 'fonts': fonts, 'json': entries})
    write_json(PACK / 'conversion.json', {'source': 'https://github.com/jiangnangame/PVZ2PAK', 'commit': COMMIT,
        'sourceZipSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'unusedBrokenImages': rejected, **adaptations})
    output = ROOT / 'dist/resource-packs/jiangnan-pvz2.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(PACK.rglob('*')):
            if file.is_file():
                archive.write(file, file.relative_to(PACK))
    print(f'PVZ2PAK: {len(sprites)} sprites, {len(fonts)} fonts, {len(entries)} JSON assets; {output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'tools/raw/resource-packs/jiangnan-pvz2/source.zip')
    build(parser.parse_args().input)
