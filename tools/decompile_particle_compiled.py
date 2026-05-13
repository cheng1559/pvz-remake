#!/usr/bin/env python3
"""Decompile PvZ particle .xml.compiled files back to text XML."""

from __future__ import annotations

import argparse
import math
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape


COOKIE = 0xDEADFED4
PARTICLE_DEFINITION_SIZE = 8
EMITTER_DEFINITION_SIZE = 0x164
PARTICLE_FIELD_SIZE = 0x14
FLOAT_TRACK_NODE_SIZE = 20

PARTICLE_FLAGS = [
    (0, "RandomLaunchSpin"),
    (1, "AlignLaunchSpin"),
    (2, "AlignToPixel"),
    (4, "ParticleLoops"),
    (3, "SystemLoops"),
    (5, "ParticlesDontFollow"),
    (6, "RandomStartTime"),
    (7, "DieIfOverloaded"),
    (8, "Additive"),
    (9, "FullScreen"),
    (10, "SoftwareOnly"),
    (11, "HardwareOnly"),
]
EMITTER_TYPES = {
    0: "Circle",
    1: "Box",
    2: "BoxPath",
    3: "CirclePath",
    4: "CircleEvenSpacing",
}
FIELD_TYPES = {
    1: "Friction",
    2: "Acceleration",
    3: "Attractor",
    4: "MaxVelocity",
    5: "Velocity",
    6: "Position",
    7: "SystemPosition",
    8: "GroundConstraint",
    9: "Shake",
    10: "Circle",
    11: "Away",
}

INT_FIELDS = [
    ("ImageRow", 0x8),
    ("ImageCol", 0x4),
    ("ImageFrames", 0xC),
    ("Animated", 0x10),
]
TRACK_FIELDS = [
    ("SystemDuration", 0x24),
    ("CrossFadeDuration", 0x2C),
    ("SpawnRate", 0x34),
    ("SpawnMinActive", 0x3C),
    ("SpawnMaxActive", 0x44),
    ("SpawnMaxLaunched", 0x4C),
    ("EmitterRadius", 0x54),
    ("EmitterOffsetX", 0x5C),
    ("EmitterOffsetY", 0x64),
    ("EmitterBoxX", 0x6C),
    ("EmitterBoxY", 0x74),
    ("EmitterPath", 0x8C),
    ("EmitterSkewX", 0x7C),
    ("EmitterSkewY", 0x84),
    ("ParticleDuration", 0x94),
    ("SystemRed", 0xAC),
    ("SystemGreen", 0xB4),
    ("SystemBlue", 0xBC),
    ("SystemAlpha", 0xC4),
    ("SystemBrightness", 0xCC),
    ("LaunchSpeed", 0x9C),
    ("LaunchAngle", 0xA4),
    ("ParticleRed", 0xE4),
    ("ParticleGreen", 0xEC),
    ("ParticleBlue", 0xF4),
    ("ParticleAlpha", 0xFC),
    ("ParticleBrightness", 0x104),
    ("ParticleSpinAngle", 0x10C),
    ("ParticleSpinSpeed", 0x114),
    ("ParticleScale", 0x11C),
    ("ParticleStretch", 0x124),
    ("CollisionReflect", 0x12C),
    ("CollisionSpin", 0x134),
    ("ClipTop", 0x13C),
    ("ClipBottom", 0x144),
    ("ClipLeft", 0x14C),
    ("ClipRight", 0x154),
    ("AnimationRate", 0x15C),
]


class CacheReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def read(self, size: int) -> bytes:
        end = self.pos + size
        if end > len(self.data):
            raise ValueError("Unexpected end of compiled particle cache")
        chunk = self.data[self.pos:end]
        self.pos = end
        return chunk

    def read_i32(self) -> int:
        return struct.unpack("<i", self.read(4))[0]

    def read_string(self) -> str:
        length = self.read_i32()
        if length < 0 or length > 100000:
            raise ValueError(f"Invalid string length: {length}")
        if length == 0:
            return ""
        return self.read(length).decode("utf-8", errors="replace")


@dataclass
class TrackNode:
    time: float
    low: float
    high: float
    curve: int
    distribution: int


@dataclass
class ParticleField:
    field_type: int
    x: list[TrackNode]
    y: list[TrackNode]


@dataclass
class Emitter:
    raw: bytes
    image: str
    name: str
    on_duration: str
    tracks: dict[str, list[TrackNode]]
    fields: list[ParticleField]
    system_fields: list[ParticleField]


def unpack_compiled(path: Path) -> bytes:
    raw = path.read_bytes()
    if len(raw) < 8:
        raise ValueError(f"{path} is too small")

    cookie, uncompressed_size = struct.unpack_from("<II", raw, 0)
    if cookie != COOKIE:
        raise ValueError(f"{path} has invalid cookie 0x{cookie:08X}")

    data = zlib.decompress(raw[8:])
    if len(data) != uncompressed_size:
        raise ValueError(
            f"{path} decompressed to {len(data)} bytes, expected {uncompressed_size}"
        )
    return data


def parse_track_nodes(reader: CacheReader, count: int) -> list[TrackNode]:
    nodes: list[TrackNode] = []
    for _ in range(count):
        time, low, high, curve, distribution = struct.unpack("<fffii", reader.read(FLOAT_TRACK_NODE_SIZE))
        nodes.append(TrackNode(time, low, high, curve, distribution))
    return nodes


def read_track(reader: CacheReader, raw: bytes, offset: int) -> list[TrackNode]:
    raw_count = struct.unpack_from("<i", raw, offset + 4)[0]
    count = reader.read_i32()
    if count != raw_count:
        raise ValueError(f"Float track count mismatch: raw {raw_count}, stream {count}")
    if count < 0 or count > 100000:
        raise ValueError(f"Invalid float track node count: {count}")
    return parse_track_nodes(reader, count)


def parse_field_array(reader: CacheReader, raw: bytes, offset: int) -> list[ParticleField]:
    count = struct.unpack_from("<i", raw, offset + 4)[0]
    def_size = reader.read_i32()
    if def_size != PARTICLE_FIELD_SIZE:
        raise ValueError(f"Unexpected ParticleField size: {def_size}")
    if count == 0:
        return []

    raw_fields = [reader.read(PARTICLE_FIELD_SIZE) for _ in range(count)]
    fields: list[ParticleField] = []
    for raw_field in raw_fields:
        fields.append(
            ParticleField(
                field_type=struct.unpack_from("<i", raw_field, 0)[0],
                x=read_track(reader, raw_field, 0x4),
                y=read_track(reader, raw_field, 0xC),
            )
        )
    return fields


def parse_particle_cache(data: bytes) -> list[Emitter]:
    reader = CacheReader(data)
    reader.read(4)  # schema hash

    definition = reader.read(PARTICLE_DEFINITION_SIZE)
    emitter_count = struct.unpack_from("<i", definition, 4)[0]

    emitter_def_size = reader.read_i32()
    if emitter_def_size != EMITTER_DEFINITION_SIZE:
        raise ValueError(f"Unexpected TodEmitterDefinition size: {emitter_def_size}")

    raw_emitters = [reader.read(EMITTER_DEFINITION_SIZE) for _ in range(emitter_count)]
    emitters: list[Emitter] = []
    for raw in raw_emitters:
        image = reader.read_string()
        name = reader.read_string()
        tracks = {"SystemDuration": read_track(reader, raw, 0x24)}
        on_duration = reader.read_string()
        for field, offset in TRACK_FIELDS[1:22]:
            tracks[field] = read_track(reader, raw, offset)
        fields = parse_field_array(reader, raw, 0xD4)
        system_fields = parse_field_array(reader, raw, 0xDC)
        for field, offset in TRACK_FIELDS[22:]:
            tracks[field] = read_track(reader, raw, offset)
        emitters.append(
            Emitter(
                raw=raw,
                image=image,
                name=name,
                on_duration=on_duration,
                tracks=tracks,
                fields=fields,
                system_fields=system_fields,
            )
        )

    if reader.pos != len(reader.data):
        raise ValueError(f"Unread trailing cache bytes: {len(reader.data) - reader.pos}")

    return emitters


def format_float(value: float) -> str:
    if math.isclose(value, 0.0, rel_tol=0.0, abs_tol=0.000001):
        return "0"
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text != "-0" else "0"


def format_track(nodes: list[TrackNode]) -> str:
    parts: list[str] = []
    for node in nodes:
        value = format_float(node.low)
        if not math.isclose(node.low, node.high, rel_tol=0.0, abs_tol=0.000001):
            value = f"{value} {format_float(node.high)}"
        if node.time:
            value = f"[{format_float(node.time)} {value}]"
        parts.append(value)
    return " ".join(parts)


def append_track(lines: list[str], indent: str, tag: str, nodes: list[TrackNode]) -> None:
    if nodes:
        lines.append(f"{indent}<{tag}>{escape(format_track(nodes))}</{tag}>")


def append_field(lines: list[str], tag: str, field: ParticleField) -> None:
    lines.append(f"\t<{tag}>")
    field_type = FIELD_TYPES.get(field.field_type, str(field.field_type))
    lines.append(f"\t\t<FieldType>{field_type}</FieldType>")
    append_track(lines, "\t\t", "x", field.x)
    append_track(lines, "\t\t", "y", field.y)
    lines.append(f"\t</{tag}>")


def particle_to_xml(emitters: list[Emitter]) -> str:
    lines: list[str] = []
    for emitter in emitters:
        lines.append("<Emitter>")
        if emitter.image:
            lines.append(f"\t<Image>{escape(emitter.image)}</Image>")
        for tag, offset in INT_FIELDS:
            value = struct.unpack_from("<i", emitter.raw, offset)[0]
            if value:
                lines.append(f"\t<{tag}>{value}</{tag}>")
        flags = struct.unpack_from("<i", emitter.raw, 0x14)[0]
        for bit, tag in PARTICLE_FLAGS:
            if flags & (1 << bit):
                lines.append(f"\t<{tag}>1</{tag}>")
        emitter_type = struct.unpack_from("<i", emitter.raw, 0x18)[0]
        if emitter_type:
            lines.append(f"\t<EmitterType>{EMITTER_TYPES.get(emitter_type, str(emitter_type))}</EmitterType>")
        if emitter.name:
            lines.append(f"\t<Name>{escape(emitter.name)}</Name>")
        for tag, _ in TRACK_FIELDS[:8]:
            append_track(lines, "\t", tag, emitter.tracks[tag])
        if emitter.on_duration:
            lines.append(f"\t<OnDuration>{escape(emitter.on_duration)}</OnDuration>")
        for tag, _ in TRACK_FIELDS[8:]:
            append_track(lines, "\t", tag, emitter.tracks[tag])
        for field in emitter.fields:
            append_field(lines, "Field", field)
        for field in emitter.system_fields:
            append_field(lines, "SystemField", field)
        lines.append("</Emitter>")
    return "\n".join(lines) + "\n"


def output_name(path: Path) -> str:
    name = path.name
    if name.endswith(".compiled"):
        name = name[:-len(".compiled")]
    return name.lower()


def convert_file(src: Path, out_dir: Path) -> Path:
    emitters = parse_particle_cache(unpack_compiled(src))
    dst = out_dir / output_name(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(particle_to_xml(emitters), encoding="utf-8")
    return dst


def convert_directory(src_dir: Path, out_dir: Path) -> int:
    count = 0
    if not src_dir.exists():
        return count
    for src in sorted(src_dir.glob("*.xml.compiled")):
        dst = convert_file(src, out_dir)
        print(f"[particle-decompile] Wrote: {dst}")
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decompile PvZ particle .xml.compiled cache files to XML text."
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        default=[Path("tools/raw/compiled/particles")],
        help="Input .xml.compiled file or directory. Defaults to tools/raw/compiled/particles.",
    )
    parser.add_argument(
        "-o",
        "--out-dir",
        type=Path,
        default=Path("tools/raw/particles"),
        help="Output directory. Defaults to tools/raw/particles.",
    )
    args = parser.parse_args()

    count = 0
    for item in args.inputs:
        if item.is_dir():
            count += convert_directory(item, args.out_dir)
        else:
            dst = convert_file(item, args.out_dir)
            print(f"[particle-decompile] Wrote: {dst}")
            count += 1
    print(f"[particle-decompile] Decompile complete: {count} files")


if __name__ == "__main__":
    main()
