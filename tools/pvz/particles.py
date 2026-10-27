#!/usr/bin/env python3
"""Convert original PvZ particle XML to the single full-feature particle schema."""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

TRACK_FIELDS = {
    "SystemDuration": "systemDuration",
    "SpawnRate": "spawnRate",
    "SpawnMinActive": "spawnMinActive",
    "SpawnMaxActive": "spawnMaxActive",
    "SpawnMaxLaunched": "spawnMaxLaunched",
    "EmitterRadius": "emitterRadius",
    "EmitterOffsetX": "emitterOffsetX",
    "EmitterOffsetY": "emitterOffsetY",
    "EmitterBoxX": "emitterBoxX",
    "EmitterBoxY": "emitterBoxY",
    "EmitterSkewX": "emitterSkewX",
    "EmitterSkewY": "emitterSkewY",
    "EmitterPath": "emitterPath",
    "ParticleDuration": "particleDuration",
    "SystemRed": "systemRed",
    "SystemGreen": "systemGreen",
    "SystemBlue": "systemBlue",
    "SystemAlpha": "systemAlpha",
    "SystemBrightness": "systemBrightness",
    "LaunchSpeed": "launchSpeed",
    "LaunchAngle": "launchAngle",
    "ParticleRed": "particleRed",
    "ParticleGreen": "particleGreen",
    "ParticleBlue": "particleBlue",
    "ParticleAlpha": "particleAlpha",
    "ParticleBrightness": "particleBrightness",
    "ParticleSpinAngle": "particleSpinAngle",
    "ParticleSpinSpeed": "particleSpinSpeed",
    "ParticleScale": "particleScale",
    "ParticleStretch": "particleStretch",
    "CollisionReflect": "collisionReflect",
    "CollisionSpin": "collisionSpin",
}

FLAG_FIELDS = {
    "RandomLaunchSpin": "randomLaunchSpin",
    "AlignLaunchSpin": "alignLaunchSpin",
    "ParticleLoops": "particleLoops",
    "SystemLoops": "systemLoops",
    "RandomStartTime": "randomStartTime",
    "ParticlesDontFollow": "particlesDontFollow",
    "Additive": "additive",
}

FIELD_TYPES = {
    "Friction": "friction",
    "Acceleration": "acceleration",
    "Attractor": "attractor",
    "MaxVelocity": "max-velocity",
    "Velocity": "velocity",
    "Position": "position",
    "SystemPosition": "system-position",
    "GroundConstraint": "ground-constraint",
    "Shake": "shake",
    "Circle": "circle",
    "Away": "away",
}

CURVES = {'Linear': 'linear', 'EaseIn': 'ease-in', 'EaseOut': 'ease-out',
          'EaseInOutWeak': 'ease-in-out', 'FastInOutWeak': 'fast-in-out', 'Bounce': 'bounce'}

NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
PVZ_TRACK_TOKEN_RE = re.compile(
    rf"\s*(?P<value>\[[^\]]+\]|{NUMBER})(?:,(?P<time>{NUMBER}))?(?:\s+(?P<curve>EaseInOutWeak|FastInOutWeak|EaseIn|EaseOut|Bounce|Linear)\b)?"
)


def normalize_number(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def parse_pvz_track(text: str | None, default: float = 0.0) -> dict[str, Any]:
    """Parse the original PvZ XML form: [low high],time."""
    if not text or not text.strip():
        return {"nodes": [{"time": 0, "low": default, "high": default}]}

    nodes: list[dict[str, Any]] = []
    position = 0
    while position < len(text):
        if not text[position:].strip():
            break
        match = PVZ_TRACK_TOKEN_RE.match(text, position)
        if not match:
            raise ValueError(f"invalid PvZ particle track: {text!r}")
        token = match.group("value")
        values = [float(value) for value in re.findall(NUMBER, token)]
        if len(values) not in (1, 2):
            raise ValueError(f"unsupported PvZ particle track value: {token!r}")
        node = {
            "time": None,
            "low": normalize_number(values[0]),
            "high": normalize_number(values[-1]),
        }
        distribution = re.sub(NUMBER, '', token).strip('[] ')
        if distribution:
            if distribution not in CURVES:
                raise ValueError(f'unsupported PvZ particle distribution: {distribution}')
            node['distribution'] = CURVES[distribution]
        if match.group('curve'):
            node['curve'] = CURVES[match.group('curve')]
        if match.group("time") is not None:
            node["time"] = normalize_number(round(float(match.group("time")) * 0.01, 10))
        nodes.append(node)
        position = match.end()

    if text[position:].strip():
        raise ValueError(f"invalid PvZ particle track: {text!r}")
    _fill_track_times(nodes)
    return {"nodes": nodes}


def _fill_track_times(nodes: list[dict[str, Any]]) -> None:
    block_start = 0
    previous_time = 0.0
    while block_start < len(nodes):
        explicit = next(
            (index for index in range(block_start, len(nodes)) if nodes[index]["time"] is not None),
            len(nodes),
        )
        next_time = float(nodes[explicit]["time"]) if explicit < len(nodes) else 1.0
        missing_count = explicit - block_start
        for offset in range(missing_count):
            if missing_count == 1 and block_start == 0:
                ratio = 0.0
            elif missing_count == 1:
                ratio = 1.0
            else:
                ratio = offset / (missing_count - 1)
            nodes[block_start + offset]["time"] = normalize_number(
                previous_time + (next_time - previous_time) * ratio
            )
        if explicit == len(nodes):
            break
        previous_time = next_time
        block_start = explicit + 1


def load_image_grid_metadata(resources_xml: Path) -> dict[str, dict[str, int]]:
    if not resources_xml.exists():
        return {}

    root = ElementTree.fromstring(resources_xml.read_text(encoding="utf-8", errors="ignore"))
    image_grids: dict[str, dict[str, int]] = {}
    for image_node in root.findall(".//Image"):
        image_id = image_node.attrib.get("id")
        if not image_id:
            continue
        grid: dict[str, int] = {}
        if image_node.attrib.get("cols"):
            grid["imageColumns"] = int(image_node.attrib["cols"])
        if image_node.attrib.get("rows"):
            grid["imageRows"] = int(image_node.attrib["rows"])
        if grid:
            image_grids[image_id.upper()] = grid
    return image_grids


def strip_image_prefix(raw: str) -> str:
    return raw.removeprefix("IMAGE_REANIM_").removeprefix("IMAGE_")


def parse_bool(text: str | None) -> bool:
    return text is None or text.strip().lower() not in {"0", "false", "no", "off"}


def build_particle(source: Path, content_id: str, namespace: str = "pvz",
                   image_grids: dict[str, dict[str, int]] | None = None) -> dict[str, Any]:
    root = ElementTree.fromstring(f"<root>{source.read_text(encoding='utf-8')}</root>")
    grids = image_grids if image_grids is not None else load_image_grid_metadata(source.parent.parent / "properties/resources.xml")
    emitters = []
    for node in root.findall("Emitter"):
        image = strip_image_prefix((node.findtext("Image") or "").strip())
        if not image or image.lower() == "whitepixel":
            continue
        grid = grids.get(image.upper(), grids.get("IMAGE_" + image.upper(), {}))
        frames = int(node.findtext("ImageFrames") or 1)
        columns, rows = grid.get("imageColumns", frames), grid.get("imageRows", 1)
        if min(frames, columns, rows) <= 0:
            raise ValueError("particle image grid must be positive")
        emitter = {
            "sprite": f"{namespace}:{image.lower()}", "columns": columns, "rows": rows,
            "firstFrame": min(rows - 1, max(0, int(node.findtext("ImageRow") or 0))) * columns + min(columns - 1, max(0, int(node.findtext("ImageCol") or 0))),
            "frameCount": frames,
        }
        if node.findtext("Name"):
            emitter["name"] = node.findtext("Name").strip()
        if node.findtext("EmitterType"):
            emitter["emitterType"] = node.findtext("EmitterType").strip().lower()
        for xml_name, key in FLAG_FIELDS.items():
            if node.find(xml_name) is not None:
                emitter[key] = parse_bool(node.findtext(xml_name))
        for xml_name, key in TRACK_FIELDS.items():
            if node.find(xml_name) is not None:
                emitter[key] = parse_pvz_track(node.findtext(xml_name))
        for xml_name, key in (("Field", "fields"), ("SystemField", "systemFields")):
            emitter[key] = [{
                "type": FIELD_TYPES.get((field.findtext("FieldType") or "").strip(), "unknown"),
                "x": parse_pvz_track(field.findtext("X") or field.findtext("x")),
                "y": parse_pvz_track(field.findtext("Y") or field.findtext("y")),
            } for field in node.findall(xml_name)]
        emitters.append(emitter)
    return {"schemaVersion": 3, "id": content_id, "emitters": emitters}


def write_particle(source: Path, output: Path, content_id: str, namespace: str = "pvz",
                   image_grids: dict[str, dict[str, int]] | None = None) -> dict[str, Any]:
    data = build_particle(source, content_id, namespace, image_grids)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    return data


def convert_directory(src_dir: Path, dst_dir: Path,
                      resources_xml: Path | None = None) -> int:
    grids = load_image_grid_metadata(resources_xml or src_dir.parent / "properties/resources.xml")
    sources = sorted(src_dir.glob("*.xml"))
    for source in sources:
        write_particle(source, dst_dir / (source.stem.lower() + ".json"), "pvz:" + source.stem.lower(), image_grids=grids)
    return len(sources)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, required=True)
    parser.add_argument("--dst", type=Path, default=Path("mods/pvz-base/assets/particles"))
    parser.add_argument("--resources", type=Path, default=Path("tools/raw/properties/resources.xml"))
    args = parser.parse_args()
    if not args.src.is_dir():
        raise FileNotFoundError(args.src)
    print(f"Converted {convert_directory(args.src, args.dst, args.resources)} particle definitions")


if __name__ == "__main__":
    main()
