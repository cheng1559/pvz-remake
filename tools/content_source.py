"""Read the same content.json table indexes used by Mod sources."""
import json
from pathlib import Path


def read_content(directory: Path) -> dict:
    source = json.loads((directory / 'content.json').read_text(encoding='utf-8'))
    content = {'resources': source.get('resources', {})}
    for kind in ('gameplay', 'presentation'):
        if kind in source:
            content[kind] = {}
            for name, path in source[kind].items():
                if not isinstance(path, str) or Path(path).is_absolute() or '..' in path.replace('\\', '/').split('/'):
                    raise ValueError(f'Invalid table path: {path}')
                content[kind][name] = json.loads((directory / path).read_text(encoding='utf-8'))
    return content


def read_definitions(directory: Path) -> dict:
    content = read_content(directory.parent)[directory.name]
    if directory.name == 'gameplay':
        return {**content['settings'], **{key: value for key, value in content.items()
                                        if key not in ('settings', 'levels', 'strings', 'seedCatalog')}}
    return content
