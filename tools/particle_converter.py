#!/usr/bin/env python3
"""Convert extracted PvZ particle XML definitions to runtime JSON."""

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

INT_FIELDS = {
    "ImageCol": "imageCol",
    "ImageRow": "imageRow",
    "ImageFrames": "imageFrames",
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

IMAGE_PREFIX = "IMAGE_"
REANIM_IMAGE_PREFIX = "IMAGE_REANIM_"
TOKEN_RE = re.compile(r"\[[^\]]+\]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
PVZ_TRACK_TOKEN_RE = re.compile(
    rf"\s*(?P<value>\[[^\]]+\]|{NUMBER})(?:,(?P<time>{NUMBER}))?"
)


def constant(value: float) -> dict[str, Any]:
    return {"nodes": [{"time": 0, "low": value, "high": value}]}


def normalize_number(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def parse_track(text: str | None, default: float = 0.0) -> dict[str, Any]:
    if not text or not text.strip():
        return constant(default)

    nodes: list[dict[str, Any]] = []
    pending_values: list[float] = []
    for token in TOKEN_RE.findall(text):
        if token.startswith("["):
            values = [float(part) for part in token[1:-1].split()]
            if len(values) < 2:
                continue
            low = values[1]
            high = values[2] if len(values) >= 3 else low
            nodes.append({
                "time": normalize_number(values[0]),
                "low": normalize_number(low),
                "high": normalize_number(high),
            })
            continue
        pending_values.append(float(token))

    if pending_values:
        low = pending_values[0]
        high = pending_values[1] if len(pending_values) >= 2 else low
        nodes.insert(0, {
            "time": 0,
            "low": normalize_number(low),
            "high": normalize_number(high),
        })

    return {"nodes": nodes} if nodes else constant(default)


def parse_pvz_track(text: str | None, default: float = 0.0) -> dict[str, Any]:
    """Parse the original PvZ XML form: [low high],time."""
    if not text or not text.strip():
        return {"nodes": [{"timeRatio": 0, "low": default, "high": default}]}

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
            "timeRatio": None,
            "low": normalize_number(values[0]),
            "high": normalize_number(values[-1]),
        }
        if match.group("time") is not None:
            node["timeRatio"] = normalize_number(round(float(match.group("time")) * 0.01, 10))
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
            (index for index in range(block_start, len(nodes)) if nodes[index]["timeRatio"] is not None),
            len(nodes),
        )
        next_time = float(nodes[explicit]["timeRatio"]) if explicit < len(nodes) else 1.0
        missing_count = explicit - block_start
        for offset in range(missing_count):
            if missing_count == 1 and block_start == 0:
                ratio = 0.0
            elif missing_count == 1:
                ratio = 1.0
            else:
                ratio = offset / (missing_count - 1)
            nodes[block_start + offset]["timeRatio"] = normalize_number(
                previous_time + (next_time - previous_time) * ratio
            )
        if explicit == len(nodes):
            break
        previous_time = next_time
        block_start = explicit + 1


def build_particle_v2(
    source: Path,
    content_id: str,
    namespace: str = "pvz",
    image_grids: dict[str, dict[str, int]] | None = None,
) -> dict[str, Any]:
    raw = source.read_text(encoding="utf-8", errors="strict")
    root = ElementTree.fromstring(f"<root>{raw}</root>")
    emitter_nodes = root.findall("Emitter")
    if not emitter_nodes:
        raise ValueError(f"particle has no emitters: {source}")

    grids = image_grids if image_grids is not None else load_image_grid_metadata(
        Path("tools/raw/properties/resources.xml")
    )
    emitters = [_build_emitter_v2(node, namespace, grids) for node in emitter_nodes]
    duration = max(emitter["durationSeconds"] for emitter in emitters)
    return {
        "schemaVersion": 2,
        "id": content_id,
        "durationSeconds": duration,
        "emitters": emitters,
    }


def write_particle_v2(
    source: Path,
    output: Path,
    content_id: str,
    namespace: str = "pvz",
    image_grids: dict[str, dict[str, int]] | None = None,
) -> dict[str, Any]:
    data = build_particle_v2(source, content_id, namespace, image_grids)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return data


def _build_emitter_v2(
    node: ElementTree.Element,
    namespace: str,
    image_grids: dict[str, dict[str, int]],
) -> dict[str, Any]:
    supported = {
        "Name", "Image", "ImageFrames", "ImageRow", "ImageCol", "SpawnMinActive",
        "SpawnMaxLaunched", "ParticleAlpha", "ParticleScale", "EmitterType",
        "EmitterRadius", "LaunchSpeed", "LaunchAngle", "ParticleDuration",
        "SystemDuration", "EmitterOffsetX", "EmitterOffsetY", "RandomLaunchSpin",
        "ParticleSpinSpeed", "Field",
    }
    for child in node:
        if child.tag not in supported:
            raise ValueError(f"unsupported Particle v2 emitter field: {child.tag}")

    image = strip_image_prefix(_required_text(node, "Image"))
    image_frames = int(_optional_text(node, "ImageFrames", "1"))
    if image_frames <= 0:
        raise ValueError("particle ImageFrames must be positive")
    system_ticks = _constant_track_value(node, "SystemDuration", 0)
    particle_ticks = _constant_track_value(node, "ParticleDuration", 100)
    duration_ticks = system_ticks or particle_ticks
    emitter_type = _optional_text(node, "EmitterType", "circle").lower()
    if emitter_type != "circle":
        raise ValueError(f"unsupported Particle v2 emitter type: {emitter_type}")
    launch_angle = _track(node, "LaunchAngle", 0)
    if any(value != 0 for point in launch_angle["nodes"] for value in (point["low"], point["high"])):
        raise ValueError("Particle v2 does not support directed LaunchAngle yet")
    grid = image_grids.get(image.upper(), {})
    columns = grid.get("imageColumns", image_frames)
    rows = grid.get("imageRows", 1)
    return {
        "sprite": f"{namespace}:{image.lower()}",
        "columns": columns,
        "rows": rows,
        "firstFrame": int(_optional_text(node, "ImageRow", "0")) * columns
        + int(_optional_text(node, "ImageCol", "0")),
        "frameCount": image_frames,
        "durationSeconds": normalize_number(duration_ticks * 0.01),
        "emitterOffsetX": _track(node, "EmitterOffsetX", 0),
        "emitterOffsetY": _track(node, "EmitterOffsetY", 0),
        "spawnMinActive": _track(node, "SpawnMinActive", -1),
        "spawnMaxLaunched": _track(node, "SpawnMaxLaunched", -1),
        "emitterRadius": _track(node, "EmitterRadius", 0),
        "particleDurationSeconds": _scale_track(_track(node, "ParticleDuration", 100), 0.01),
        "launchSpeed": _track(node, "LaunchSpeed", 0),
        "particleAlpha": _track(node, "ParticleAlpha", 1),
        "particleScale": _track(node, "ParticleScale", 1),
        "particleSpinSpeed": _track(node, "ParticleSpinSpeed", 0),
        "randomLaunchSpin": node.find("RandomLaunchSpin") is not None
        and parse_bool(node.findtext("RandomLaunchSpin")),
        "fields": [_build_field_v2(field) for field in node.findall("Field")],
    }


def _build_field_v2(node: ElementTree.Element) -> dict[str, Any]:
    for child in node:
        if child.tag not in {"FieldType", "X", "x", "Y", "y"}:
            raise ValueError(f"unsupported Particle v2 field property: {child.tag}")
    field_type = _required_text(node, "FieldType").lower()
    if field_type not in {"friction", "acceleration"}:
        raise ValueError(f"unsupported Particle v2 field: {field_type}")
    scale = 100 if field_type == "acceleration" else 1
    return {
        "type": field_type,
        "x": _scale_track(parse_pvz_track(node.findtext("X") or node.findtext("x"), 0), scale),
        "y": _scale_track(parse_pvz_track(node.findtext("Y") or node.findtext("y"), 0), scale),
    }


def _track(node: ElementTree.Element, name: str, default: float) -> dict[str, Any]:
    return parse_pvz_track(node.findtext(name), default)


def _scale_track(track: dict[str, Any], scale: float) -> dict[str, Any]:
    return {
        "nodes": [
            {
                **node,
                "low": normalize_number(float(node["low"]) * scale),
                "high": normalize_number(float(node["high"]) * scale),
            }
            for node in track["nodes"]
        ]
    }


def _constant_track_value(node: ElementTree.Element, name: str, default: float) -> float:
    track = _track(node, name, default)["nodes"]
    if len(track) != 1 or track[0]["low"] != track[0]["high"]:
        raise ValueError(f"Particle v2 requires constant {name}")
    return float(track[0]["low"])


def _required_text(node: ElementTree.Element, name: str) -> str:
    value = node.findtext(name)
    if value is None or not value.strip():
        raise ValueError(f"particle emitter is missing {name}")
    return value.strip()


def _optional_text(node: ElementTree.Element, name: str, default: str) -> str:
    value = node.findtext(name)
    return value.strip() if value and value.strip() else default


def parse_bool(text: str | None) -> bool:
    if text is None or not text.strip():
        return True
    try:
        return float(text.strip()) != 0
    except ValueError:
        return text.strip().lower() not in {"false", "no", "off"}


def strip_image_prefix(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip()
    if value.startswith(REANIM_IMAGE_PREFIX):
        return value[len(REANIM_IMAGE_PREFIX):]
    elif value.startswith(IMAGE_PREFIX):
        return value[len(IMAGE_PREFIX):]
    return value


def normalize_image(raw: str | None, src_dir: Path) -> str | None:
    value = strip_image_prefix(raw)
    if not value:
        return None
    value = value.lower()

    source_particle_image = src_dir / f"{value}.png"
    resource_particle_image = Path("assets/resources/textures/particles") / f"{value}.png"
    if source_particle_image.exists() or resource_particle_image.exists():
        return f"particles/{value}"
    return value


def normalize_image_id(raw: str | None) -> str | None:
    value = strip_image_prefix(raw)
    if not value:
        return None
    return value.upper()


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


def parse_field(field_node: ElementTree.Element) -> dict[str, Any]:
    type_node = field_node.find("FieldType")
    raw_type = type_node.text.strip() if type_node is not None and type_node.text else ""
    x_node = field_node.find("x")
    if x_node is None:
        x_node = field_node.find("X")
    y_node = field_node.find("y")
    if y_node is None:
        y_node = field_node.find("Y")
    return {
        "type": FIELD_TYPES.get(raw_type, raw_type.lower() or "unknown"),
        "x": parse_track(x_node.text if x_node is not None else None),
        "y": parse_track(y_node.text if y_node is not None else None),
    }


def parse_emitter(
    emitter_node: ElementTree.Element,
    src_dir: Path,
    image_grids: dict[str, dict[str, int]],
) -> dict[str, Any]:
    emitter: dict[str, Any] = {}
    image_node = emitter_node.find("Image")
    image_id = normalize_image_id(image_node.text if image_node is not None else None)
    image = normalize_image(image_node.text if image_node is not None else None, src_dir)
    if image:
        emitter["image"] = image
    if image_id and image_id in image_grids:
        emitter.update(image_grids[image_id])

    name_node = emitter_node.find("Name")
    if name_node is not None and name_node.text:
        emitter["name"] = name_node.text.strip()

    emitter_type = emitter_node.find("EmitterType")
    if emitter_type is not None and emitter_type.text:
        emitter["emitterType"] = emitter_type.text.strip().lower()

    for xml_name, json_name in INT_FIELDS.items():
        node = emitter_node.find(xml_name)
        if node is not None and node.text and node.text.strip():
            emitter[json_name] = int(float(node.text.strip()))

    for xml_name, json_name in FLAG_FIELDS.items():
        node = emitter_node.find(xml_name)
        if node is not None:
            emitter[json_name] = parse_bool(node.text)

    for xml_name, json_name in TRACK_FIELDS.items():
        node = emitter_node.find(xml_name)
        if node is not None:
            emitter[json_name] = parse_track(node.text)

    emitter["fields"] = [parse_field(node) for node in emitter_node.findall("Field")]
    emitter["systemFields"] = [parse_field(node) for node in emitter_node.findall("SystemField")]
    return emitter


def convert_file(src: Path, dst_dir: Path, image_grids: dict[str, dict[str, int]] | None = None) -> Path:
    raw = src.read_text(encoding="utf-8", errors="ignore")
    root = ElementTree.fromstring(f"<root>{raw}</root>")
    resolved_image_grids = image_grids or {}
    definition = {
        "source": src.name,
        "emitters": [
            parse_emitter(node, src.parent, resolved_image_grids)
            for node in root.findall("Emitter")
        ],
    }

    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / f"{src.stem.lower()}.json"
    dst.write_text(json.dumps(definition, separators=(",", ":")), encoding="utf-8")
    return dst


def convert_directory(
    src_dir: Path,
    dst_dir: Path,
    resources_xml: Path = Path("./tools/raw/properties/resources.xml"),
) -> int:
    image_grids = load_image_grid_metadata(resources_xml)
    count = 0
    for src in sorted(src_dir.glob("*.xml")):
        dst = convert_file(src, dst_dir, image_grids)
        print(f"[particle-convert] Wrote: {dst}")
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=Path("./tools/raw/particles"))
    parser.add_argument("--dst", type=Path, default=Path("./assets/resources/particles"))
    parser.add_argument("--resources", type=Path, default=Path("./tools/raw/properties/resources.xml"))
    args = parser.parse_args()

    if not args.src.exists():
        raise FileNotFoundError(f"Particle XML directory does not exist: {args.src}")
    count = convert_directory(args.src, args.dst, args.resources)
    print(f"[particle-convert] Converted {count} particle definitions -> {args.dst}")


if __name__ == "__main__":
    main()
