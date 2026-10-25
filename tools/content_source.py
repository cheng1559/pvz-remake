"""Read authoring tables and assemble the existing runtime definitions format."""
import json
from pathlib import Path


def read_definitions(directory: Path) -> dict:
    source = json.loads((directory / "definitions.json").read_text(encoding="utf-8"))
    tables = source.pop("tables")
    return {**source, **{
        kind: json.loads((directory / path).read_text(encoding="utf-8"))
        for kind, path in tables.items()
    }}
