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
