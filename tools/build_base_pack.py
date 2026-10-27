"""Build the builtin resources using the shared Mod archive format."""
from __future__ import annotations

import hashlib
import io
import json
import tempfile
import zipfile
from pathlib import Path

from PIL import Image
from content_source import read_content
from reanim_converter import build_reanim_clip

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'tools/generated/pvz-base'
RESOURCES = ROOT / 'tools/generated/resources'


def build() -> Path:
    files: dict[str, bytes] = {}
    pack: dict = {kind: {} for kind in ('sprites', 'fonts', 'audio', 'json', 'text', 'reanim', 'particles', 'music', 'prefabs')}

    def image(source: Path, file: str) -> tuple[int, int]:
        with Image.open(source) as pixels:
            size = pixels.size
            if source.suffix.lower() == '.png':
                files[file] = source.read_bytes()
            else:
                output = io.BytesIO()
                pixels.convert('RGBA').save(output, 'PNG')
                files[file] = output.getvalue()
        return size

    def sprite(resource_id: str, source: Path, file: str) -> None:
        width, height = image(source, file)
        meta_path = Path(str(source) + '.meta')
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        frame = next((entry['userData'] for entry in meta.get('subMetas', {}).values() if entry['importer'] == 'sprite-frame'), {})
        pack['sprites'][resource_id] = {
            'file': file, 'width': width, 'height': height,
            'rect': [frame.get('trimX', 0), frame.get('trimY', 0), frame.get('width', width), frame.get('height', height)],
            'offset': [frame.get('offsetX', 0), frame.get('offsetY', 0)],
            'borders': [frame.get(key, 0) for key in ('borderLeft', 'borderTop', 'borderRight', 'borderBottom')],
        }

    def data(kind: str, resource_id: str, source: Path, file: str) -> None:
        files[file] = source.read_bytes()
        pack[kind][resource_id] = file

    # Retain existing resources IDs, including directory-qualified JSON and text IDs.
    for source in sorted(RESOURCES.rglob('*')):
        if not source.is_file() or source.suffix == '.meta':
            continue
        relative = source.relative_to(RESOURCES)
        suffix = source.suffix.lower()
        resource_id = 'pvz:' + relative.with_suffix('').as_posix()
        file = 'resources/' + relative.as_posix()
        if suffix in ('.png', '.jpg', '.jpeg'):
            sprite('pvz:' + source.stem, source, 'resources/' + relative.with_suffix('.png').as_posix())
        elif suffix in ('.mp3', '.wav'):
            data('audio', 'pvz:' + source.stem, source, file)
        elif suffix == '.json':
            data('json', resource_id, source, file)
            if relative.parts[0] == 'fonts':
                config = json.loads(source.read_text())
                pack['fonts']['pvz:' + source.stem] = file
                for layer in config['layers']:
                    atlas = source.parent / (layer['image'] + '.png')
                    image(atlas, 'resources/' + atlas.relative_to(RESOURCES).as_posix())
        elif suffix == '.txt':
            data('text', resource_id, source, file)
        else:
            raise ValueError(f'Unsupported base resource: {source}')

    generated = json.loads((CONTENT / 'manifest.json').read_text())['client']
    for resource_id, path in generated['sprites'].items():
        if resource_id not in pack['sprites']:
            source = CONTENT / (path.removesuffix('/spriteFrame') + '.png')
            sprite(resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for category in ('reanim', 'particles', 'music'):
        for resource_id, path in generated[category].items():
            source = CONTENT / (path + '.json')
            data(category, resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for resource_id, path in generated['sounds'].items():
        if resource_id not in pack['audio']:
            source = next((CONTENT / (path + ext) for ext in ('', '.mp3', '.wav') if (CONTENT / (path + ext)).is_file()))
            data('audio', resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for resource_id, path in generated['prefabs'].items():
        source = ROOT / 'assets/resources' / (path + '.prefab')
        data('prefabs', resource_id, source, path + '.prefab')

    # Export selected legacy clips through the shared Reanim converter.
    for source_id, nodes in json.loads((ROOT / 'tools/anim_defs.json').read_text()).items():
        selected = [(node, clip, resource_id) for node, settings in nodes.items()
                    for clip, resource_id in settings.get('contentClips', {}).items()]
        if not selected:
            continue
        source = RESOURCES / 'animations' / (source_id + '.json')
        exported = json.loads(source.read_text())
        for node, clip, resource_id in selected:
            file = 'content/reanim/' + resource_id.replace(':', '/') + '.json'
            animation = build_reanim_clip(source, nodes, node, clip, resource_id, set(pack['sprites']), nodes=exported)
            files[file] = json.dumps(animation, ensure_ascii=False, separators=(',', ':')).encode()
            pack['reanim'][resource_id] = file

    source_root = ROOT / 'tools/content/pvz-base'
    source = read_content(source_root)
    content = {'resources': pack}
    for kind in ('gameplay', 'presentation'):
        file = f'assets/{kind}.json'
        files[file] = json.dumps(source[kind], ensure_ascii=False, separators=(',', ':')).encode()
        content[kind] = file
    # Keep public JSON resource IDs for strings and presentation overrides.
    pack['json']['pvz:presentation/definitions'] = content['presentation']
    file = 'assets/strings.json'
    files[file] = json.dumps(source['gameplay']['strings'], ensure_ascii=False, separators=(',', ':')).encode()
    pack['json']['pvz:gameplay/strings'] = file
    for kind, entries in source['resources'].items():
        for resource_id, entry in entries.items():
            if kind == 'sprites':
                sprite(resource_id, source_root / entry['file'], entry['file'])
                pack[kind][resource_id].update(entry)
            else:
                data(kind, resource_id, source_root / entry, entry)

    # Identity covers the common index and every payload, including default definitions.
    manifest = json.loads((source_root / 'manifest.json').read_text())
    manifest.pop('contentHash', None)
    digest = hashlib.sha256(json.dumps({'manifest': manifest, 'content': content}, sort_keys=True).encode())
    for file, payload in sorted(files.items()):
        digest.update(file.encode()); digest.update(payload)
    files['content.json'] = json.dumps(content, ensure_ascii=False, separators=(',', ':')).encode()
    files['manifest.json'] = json.dumps({**manifest, 'contentHash': digest.hexdigest()}, separators=(',', ':')).encode()

    output = ROOT / 'assets/resources/base.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    # Cocos watches assets: publish only a completed archive so it cannot import a partial ZIP.
    with tempfile.NamedTemporaryFile(dir=CONTENT.parent, suffix='.zip', delete=False) as temporary:
        staging = Path(temporary.name)
    try:
        with zipfile.ZipFile(staging, 'w') as archive:
            for file, payload in sorted(files.items()):
                # Images and audio are already compressed; avoid decoding another compression layer at startup.
                compression = zipfile.ZIP_STORED if file.endswith(('.png', '.mp3')) else zipfile.ZIP_DEFLATED
                info = zipfile.ZipInfo(file, (2020, 1, 1, 0, 0, 0))
                info.compress_type = compression
                archive.writestr(info, payload)
        staging.replace(output)
    finally:
        staging.unlink(missing_ok=True)
    print(f'base.zip: {len(pack["sprites"])} sprites, {len(pack["fonts"])} fonts, {len(files)} files, {output.stat().st_size / 1024**2:.1f} MiB')
    return output


if __name__ == '__main__':
    build()
