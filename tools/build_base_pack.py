"""Build the builtin ZIP using exactly the installed resource-pack format."""
from __future__ import annotations

import hashlib
import io
import json
import tempfile
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'tools/generated/pvz-base'
RESOURCES = ROOT / 'tools/generated/resources'


def build() -> Path:
    files: dict[str, bytes] = {}
    pack: dict = {'id': 'base', 'sprites': {}, 'fonts': {}, 'audio': {}, 'json': {}, 'text': {}}

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

    content = json.loads((CONTENT / 'manifest.json').read_text())
    for resource_id, path in content['client']['sprites'].items():
        if resource_id not in pack['sprites']:
            source = CONTENT / (path.removesuffix('/spriteFrame') + '.png')
            sprite(resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for category in ('reanim', 'particles', 'music'):
        for resource_id, path in content['client'][category].items():
            source = CONTENT / (path + '.json')
            data('json', resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for resource_id, path in content['client']['sounds'].items():
        if resource_id not in pack['audio']:
            source = next((CONTENT / (path + ext) for ext in ('', '.mp3', '.wav') if (CONTENT / (path + ext)).is_file()))
            data('audio', resource_id, source, 'content/' + source.relative_to(CONTENT).as_posix())
    for source in sorted((ROOT / 'tools/content/pvz-base/gameplay').glob('*.json')):
        data('json', 'pvz:gameplay/' + source.stem, source, 'content/gameplay/' + source.name)
    source = ROOT / 'tools/content/pvz-base/presentation/definitions.json'
    data('json', 'pvz:presentation/definitions', source, 'content/presentation/definitions.json')

    # Save identity includes all default data, not only the old level subset.
    content['client']['bundle'] = 'base'
    content.pop('saveCompatibleHashes', None)
    content['contentHash'] = ''
    pack['json']['pvz:content'] = 'content.json'
    digest = hashlib.sha256(json.dumps({'content': content, 'pack': pack}, sort_keys=True).encode())
    for file, payload in sorted(files.items()):
        digest.update(file.encode()); digest.update(payload)
    content['contentHash'] = digest.hexdigest()
    files['content.json'] = json.dumps(content, ensure_ascii=False, separators=(',', ':')).encode()
    files['pack.json'] = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode()

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
