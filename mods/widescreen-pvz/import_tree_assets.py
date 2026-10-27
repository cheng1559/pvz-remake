#!/usr/bin/env python3
"""Import and 2x upscale the sprites used by the existing Wisdom Tree page animations."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
sys.path.insert(0, str(PROJECT / 'tools'))
from sprite_texture_preprocessor import write_preprocessed_resource


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Workspace PvZ directory containing reanim/')
    source = parser.parse_args().source.resolve()
    clips = ['pvz:tree_grow50', *[f'pvz:tree_cloud{index}' for index in range(1, 7)]]
    dependencies: dict[str, list[str]] = {}
    with zipfile.ZipFile(PROJECT / 'assets/resources/base.zip') as archive:
        base = json.loads(archive.read('content.json'))
        for identifier in clips:
            clip = json.loads(archive.read(base['resources']['reanim'][identifier]))
            sprites = {frame['sprite'] for track in clip['tracks'] for frame in track['keyframes'] if frame['sprite']}
            for sprite in sorted(sprites - {'pvz:tree_bg'}):
                dependencies.setdefault(sprite, []).append(identifier)
    files = {path.stem.lower(): path for path in (source / 'reanim').iterdir()
             if path.suffix.lower() in ('.png', '.jpg', '.jpeg')}
    output = ROOT / 'assets/tree'
    output.mkdir(parents=True, exist_ok=True)
    resources, records = {}, []
    for identifier, animations in sorted(dependencies.items()):
        name = identifier.split(':', 1)[1]
        path = files[name]
        target = output / f'{name}.png'
        alpha = files.get(name + '_')
        if path.suffix.lower() == '.png' and alpha is None:
            shutil.copyfile(path, target)
        else:
            write_preprocessed_resource(path, target, alpha_src=alpha, force_png=True)
        with Image.open(target) as image:
            width, height = image.size
        resources[identifier] = dict(file=target.relative_to(ROOT).as_posix(), width=width, height=height,
                                     alphaMode='straight', animations=animations)
        inputs = [path, *([alpha] if alpha else [])]
        records.append(dict(id=identifier, file=resources[identifier]['file'], width=width, height=height,
                            sources={p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
                            sha256=hashlib.sha256(target.read_bytes()).hexdigest(), animations=animations))
    fragment = dict(sprites=resources)
    fragment_path = ROOT / 'tree-resources.json'
    fragment_path.write_text(json.dumps(fragment, indent=4) + '\n')
    content_path = ROOT / 'content.json'
    content = json.loads(content_path.read_text())
    content['resources']['sprites'].update(resources)
    content_path.write_text(json.dumps(content, indent=4) + '\n')
    reference = dict(sourceRoot=str(source), clips=clips, images=records,
                     note='Reuse existing screen animation tracks; overrides apply only to the listed tree clips.')
    (ROOT / 'tree-conversion.json').write_text(json.dumps(reference, indent=4) + '\n')
    print(f'Imported {len(resources)} tree and cloud sprites; upscaling with the existing pipeline.', flush=True)
    subprocess.run([sys.executable, str(ROOT / 'upscale_assets.py')], cwd=PROJECT, check=True)
    content = json.loads(content_path.read_text())
    fragment['sprites'] = {identifier: content['resources']['sprites'][identifier] for identifier in resources}
    fragment_path.write_text(json.dumps(fragment, indent=4) + '\n')
    conversion_path = ROOT / 'conversion.json'
    conversion = json.loads(conversion_path.read_text())
    conversion['tree'] = reference
    conversion_path.write_text(json.dumps(conversion, indent=4) + '\n')


if __name__ == '__main__':
    main()
