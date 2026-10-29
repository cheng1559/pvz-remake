"""Import a PvZ PAK directly into the base Mod, then use the shared Mod packer."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image
from .compiled_particles import convert_directory as decompile_particles
from .compiled_reanim import convert_file as decompile_reanim
from .images import convert_images
from .reanim import build_reanim_clip, get_anim_nodes, load_anim_xml, load_animation_config
from .fonts import convert_font
from .particles import convert_directory as convert_particles
from .strings import convert_lawnstrings
from .audio import copy_sounds
from .music.convert import convert_music

from . import ROOT, BASE_MOD as MOD
from .pak import extracted_pak

def decompile(raw: Path) -> None:
    decompile_particles(raw / 'compiled/particles', raw / 'particles')
    for source in sorted((raw / 'compiled/reanim').glob('*.reanim.compiled')):
        decompile_reanim(source, raw / 'reanim')
    for source, target in (('zombie_jackson', 'zombie_disco'), ('zombie_dancer', 'zombie_backup')):
        original, alias = raw / f'reanim/{source}.reanim', raw / f'reanim/{target}.reanim'
        if original.exists() and not alias.exists():
            shutil.copyfile(original, alias)




def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def import_assets(raw: Path) -> None:
    """Convert extracted PAK assets into the Mod's declared runtime resources."""
    mod = MOD
    index_path = mod / 'content.json'
    index = json.loads(index_path.read_text())
    resources = index.setdefault('resources', {})
    for kind in ('sprites', 'fonts', 'audio', 'json', 'text', 'reanim', 'particles', 'music', 'prefabs'):
        resources.setdefault(kind, {})
    assets = mod / 'assets'

    def register(kind: str, id: str, file: Path) -> None:
        resources[kind][id] = file.relative_to(mod).as_posix()

    def register_sprite(file: Path) -> None:
        with Image.open(file) as image:
            width, height = image.size
        id = f'pvz:{file.stem}'
        previous = resources['sprites'].get(id, {})
        resources['sprites'][id] = {**previous, 'file': file.relative_to(mod).as_posix(),
            'width': width, 'height': height}

    # Convert every image once, directly into its final Mod location.
    print('[content] Images and alpha channels', flush=True)
    outputs = convert_images(raw / 'reanim', assets / 'images')
    outputs += convert_images(raw / 'images', assets / 'images', raw / 'properties/resources.xml')
    outputs += convert_images(raw / 'particles', assets / 'images/particles')
    for image in outputs:
        register_sprite(image)

    source = raw / 'properties/resources.xml'
    file = assets / 'text/properties/resources.xml'
    file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, file)
    register('text', 'pvz:properties/resources', file)

    print('[content] Bitmap fonts', flush=True)
    for source in sorted((raw / 'data').glob('*.txt')):
        convert_font(source, assets / 'fonts')
        config = assets / 'fonts' / f'{source.stem}.json'
        register('fonts', f'pvz:{source.stem}', config)
        register('json', f'pvz:fonts/{source.stem}', config)
    for image in sorted((assets / 'fonts').glob('*.png')):
        register_sprite(image)

    print('[content] Animation tracks and display clips', flush=True)
    configs = load_animation_config()
    for name, config in configs.items():
        nodes = get_anim_nodes(name, config, load_anim_xml(raw / 'reanim', name))
        file = assets / f'json/animations/{name}.json'
        write_json(file, nodes)
        register('json', f'pvz:animations/{name}', file)

    def emit_clips(clips: list, definitions: dict) -> None:
        nodes = {}
        for source, node, clip, id in clips:
            source = source if source.is_absolute() else raw / source
            if source.stem not in nodes:
                nodes[source.stem] = get_anim_nodes(source.stem, definitions[source.stem],
                                                   load_anim_xml(source.parent, source.stem))
            value = build_reanim_clip(source, definitions[source.stem], node, clip, id,
                                     set(resources['sprites']), nodes=nodes[source.stem])
            file = mod / resources['reanim'].get(id, f"assets/reanim/{id.split(':', 1)[1]}.json")
            write_json(file, value)
            register('reanim', id, file)

    shared = [(Path(f'reanim/{name}.reanim'), node, clip, id)
              for name, nodes in configs.items() for node, settings in nodes.items()
              for clip, id in settings.get('exports', {}).items()]
    emit_clips(shared, configs)
    from .almanac import almanac_definitions
    presentation = {kind: json.loads((mod / index['presentation'][kind]).read_text())
                    for kind in ('plants', 'zombies')}
    catalog, display_configs, clips = almanac_definitions(raw, shared, configs, presentation)
    emit_clips(clips, display_configs)
    file = assets / 'json/almanac-animations.json'
    write_json(file, catalog)
    register('json', 'pvz:almanac-animations', file)

    print('[content] Particle effects and text', flush=True)
    convert_particles(raw / 'particles', assets / 'particles', raw / 'properties/resources.xml')
    for file in sorted((assets / 'particles').glob('*.json')):
        particle = json.loads(file.read_text())
        particle['emitters'] = [emitter for emitter in particle['emitters'] if emitter['sprite'] in resources['sprites']]
        write_json(file, particle)
        register('particles', particle['id'], file)
    file = assets / 'json/properties/lawnstrings.json'
    convert_lawnstrings(raw / 'properties/lawnstrings.txt', file, raw / 'properties/default.xml')
    register('json', 'pvz:properties/lawnstrings', file)

    print('[content] Sound effects and music stems', flush=True)
    copy_sounds(raw / 'sounds', assets / 'audio/sfx', overwrite=True)
    convert_music(raw / 'sounds', assets / 'audio/music', overwrite=True)
    for file in sorted((assets / 'audio').rglob('*.mp3')):
        register('audio', f'pvz:{file.stem}', file)
    music = assets / 'audio/music/music_manifest.json'
    file = assets / 'json/audio/music/music_manifest.json'
    file.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(music, file)
    register('json', 'pvz:audio/music/music_manifest', file)
    tune = json.loads(file.read_text())['tunes']['title_theme']
    title = assets / 'music/title_theme.json'
    write_json(title, {'schemaVersion': 2, 'id': 'pvz:title_theme', 'durationSeconds': tune['durationSec'],
        'loopStartSeconds': tune['loopStartSec'], 'loopEndSeconds': tune['loopEndSec'],
        'stems': {stem: tune['stems'].get(stem) for stem in ('main', 'drums', 'hihats')}})
    register('music', 'pvz:title_theme', title)

    print('[content] Cached portraits and packet atlas', flush=True)
    from .cache.packets import generate as packet_cache
    from .cache.plants import generate as plant_cache
    from .cache.zombies import generate as zombie_cache
    from .cache.lawnmower import generate as mower_cache
    packet_cache()
    plant_cache()
    zombie_cache(raw / 'reanim')
    mower_cache()
    for name in ('packet_plants_cached', 'plant_previews_cached', 'zombie_previews_cached', 'lawnmower_cached'):
        register_sprite(assets / f'images/{name}.png')
    file = assets / 'prefabs/ui/level.prefab'
    file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'assets/resources/ui/level.prefab', file)
    register('prefabs', 'pvz:level', file)
    for kind, entries in resources.items():
        for id, entry in entries.items():
            file = entry['file'] if kind == 'sprites' else entry
            if file not in ('assets/gameplay.json', 'assets/presentation.json') and not (mod / file).is_file():
                raise ValueError(f'Missing {kind} resource: {id} -> {file}')
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pak', type=Path, default=ROOT / 'tools/main.pak', help='Original main.pak to import')
    args = parser.parse_args()
    if not args.pak.is_file():
        parser.error(f'PAK not found: {args.pak}; supply --pak /path/to/main.pak')
    with extracted_pak(args.pak) as raw:
        decompile(raw)
        import_assets(raw)
    print('[content] Converted Mod assets; packing the base archive', flush=True)
    subprocess.run(['node', str(ROOT / 'node_modules/tsx/dist/cli.mjs'), str(ROOT / 'tools/mod/cli.ts'), 'pack', 'pvz-base',
                    '--publish', str(ROOT / 'assets/resources/base.zip')], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
