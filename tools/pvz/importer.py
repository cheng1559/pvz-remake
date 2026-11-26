"""Import a PvZ PAK and the game executable directly into the base Mod, then use the shared Mod packer."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image
from .compiled_particles import convert_directory as decompile_particles
from .compiled_reanim import convert_file as decompile_reanim
from .images import convert_images, sprite_trim
from .oversized import normalize_dancers
from .reanim import build_reanim_clip, get_anim_nodes, load_anim_xml, load_animation_config
from .fonts import convert_font
from .particles import convert_directory as convert_particles
from .strings import convert_lawnstrings, merge_project_strings
from .audio import copy_sounds
from .cursors import extract_cursors
from .doors import make_alike as make_doors_alike
from .music.convert import convert_music, split_manifest

from . import ROOT, BASE_MOD as MOD
from .pak import extracted_pak

def decompile(raw: Path) -> None:
    decompile_particles(raw / 'compiled/particles', raw / 'particles')
    for source in sorted((raw / 'compiled/reanim').glob('*.reanim.compiled')):
        decompile_reanim(source, raw / 'reanim')


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def import_assets(raw: Path, cursors: dict[str, Image.Image]) -> None:
    """Convert extracted PAK assets and the executable's cursors into the Mod's declared runtime resources."""
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
            rect, offset = sprite_trim(image)
        id = f'pvz:{file.stem}'
        previous = resources['sprites'].get(id, {})
        resources['sprites'][id] = {**previous, 'file': file.relative_to(mod).as_posix(),
            'width': width, 'height': height, 'rect': rect, 'offset': offset, 'borders': previous.get('borders', [0, 0, 0, 0])}

    # Convert every image once, directly into its final Mod location.
    print('[content] Images and alpha channels', flush=True)
    images = convert_images(raw / 'reanim', assets / 'images')
    images += convert_images(raw / 'images', assets / 'images', raw / 'properties/resources.xml')
    # The front yard's house door, alike by day and by night for `/time`'s blend (tools/pvz/doors.py).
    make_doors_alike(assets / 'images')
    particle_images = convert_images(raw / 'particles', assets / 'images/particles')
    # The mouse cursors are only in the executable: pvz:cursor_pointer, pvz:cursor_hand, pvz:cursor_dragging.
    for name, image in cursors.items():
        file = assets / f'images/cursor_{name}.png'
        image.save(file)
        images.append(file)

    # resources.xml only guides conversion (alpha companions, particle grids); the game never reads it, so it is not copied.

    print('[content] Animation tracks and display clips', flush=True)
    configs = load_animation_config()
    sprites = set(resources['sprites']) | {f'pvz:{file.stem}' for file in images + particle_images}
    nodes, clips = {}, {}
    for name, definitions in configs.items():
        for node, settings in definitions.items():
            for clip, id in settings.get('exports', {}).items():
                source = raw / f'reanim/{name}.reanim'
                if name not in nodes:
                    nodes[name] = get_anim_nodes(name, definitions, load_anim_xml(source.parent, name))
                clips[id] = (name, build_reanim_clip(source, definitions, node, clip, id, sprites, nodes=nodes[name]))
    shrunk = normalize_dancers(clips, images, particle_images)
    for file in images + particle_images:
        register_sprite(file)
    for id, (_, value) in clips.items():
        file = mod / resources['reanim'].get(id, f"assets/reanim/{id.split(':', 1)[1]}.json")
        write_json(file, value)
        register('reanim', id, file)

    print('[content] Bitmap fonts', flush=True)
    for source in sorted((raw / 'data').glob('*.txt')):
        convert_font(source, assets / 'fonts')
        config = assets / 'fonts' / f'{source.stem}.json'
        # A font's atlases go with it by its layers (the Mod packer); nothing names them as sprites.
        register('fonts', f'pvz:{source.stem}', config)

    print('[content] Particle effects and text', flush=True)
    convert_particles(raw / 'particles', assets / 'particles', raw / 'properties/resources.xml')
    for file in sorted((assets / 'particles').glob('*.json')):
        particle = json.loads(file.read_text())
        particle['emitters'] = [emitter for emitter in particle['emitters'] if emitter['sprite'] in resources['sprites']]
        # Only the dancers' drops put their shrunk images in an effect; one an effect drew itself would come out 0.8 too small.
        if any(emitter['sprite'] in shrunk for emitter in particle['emitters']):
            raise ValueError(f"{particle['id']} draws a dancer's shrunk image")
        write_json(file, particle)
        register('particles', particle['id'], file)
    # All game text: the original LawnStrings plus the project's own UI text.
    file = assets / 'json/strings.json'
    convert_lawnstrings(raw / 'properties/lawnstrings.txt', file, raw / 'properties/default.xml')
    # The project's own UI text (hand-written in tools/pvz/ui-strings.json) joins the original table.
    merge_project_strings(file, Path(__file__).with_name('ui-strings.json'))
    register('json', 'pvz:strings', file)

    print('[content] Sound effects and music stems', flush=True)
    copy_sounds(raw / 'sounds', assets / 'audio/sfx', overwrite=True)
    convert_music(raw / 'sounds', assets / 'audio/music', overwrite=True)
    for file in sorted((assets / 'audio').rglob('*.mp3')):
        register('audio', f'pvz:{file.stem}', file)
    # Each tune is its own music resource (pvz:<tune>), so a Mod replaces one tune by registering the same ID.
    music = assets / 'audio/music/music_manifest.json'
    for tune, file in split_manifest(music, assets / 'music').items():
        register('music', f'pvz:{tune}', file)
    music.unlink()

    file = assets / 'prefabs/ui/level.prefab'
    file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'assets/resources/ui/level.prefab', file)
    register('prefabs', 'pvz:level', file)
    for kind, entries in resources.items():
        for id, entry in entries.items():
            file = entry['file'] if kind == 'sprites' else entry
            if not (mod / file).is_file():
                raise ValueError(f'Missing {kind} resource: {id} -> {file}')
    # Resource categories are optional; leave out the ones the base does not use.
    index['resources'] = {kind: entries for kind, entries in resources.items() if entries}
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pak', type=Path, default=ROOT / 'tools/main.pak', help='Original main.pak to import')
    parser.add_argument('--exe', type=Path, default=ROOT / 'tools/PlantsVsZombies.exe', help='Original game executable (mouse cursors)')
    args = parser.parse_args()
    if not args.pak.is_file():
        parser.error(f'PAK not found: {args.pak}; supply --pak /path/to/main.pak')
    if not args.exe.is_file():
        parser.error(f'Executable not found: {args.exe}; supply --exe /path/to/PlantsVsZombies.exe')
    # Checked before the long PAK conversion, so a wrong executable fails at once.
    cursors = extract_cursors(args.exe.read_bytes())
    with extracted_pak(args.pak) as raw:
        decompile(raw)
        import_assets(raw, cursors)
    print('[content] Converted Mod assets; packing the base archive', flush=True)
    subprocess.run(['node', str(ROOT / 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', str(ROOT / 'tsconfig.server.json'),
                    str(ROOT / 'tools/mod/cli.ts'), 'pack', 'pvz-base',
                    '--publish', str(ROOT / 'assets/resources/base.zip')], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
