#!/usr/bin/env python3
"""Decompile PvZ .reanim.compiled files back to text .reanim files."""

from __future__ import annotations

import argparse
import math
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape


COOKIE = 0xDEADFED4
REANIMATOR_DEFINITION_SIZE = 16
REANIMATOR_TRACK_SIZE = 12
REANIMATOR_TRANSFORM_SIZE = 44
DEFAULT_FIELD_PLACEHOLDER = -10000.0


class CacheReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def read(self, size: int) -> bytes:
        end = self.pos + size
        if end > len(self.data):
            raise ValueError("Unexpected end of compiled reanim cache")
        chunk = self.data[self.pos:end]
        self.pos = end
        return chunk

    def read_u32(self) -> int:
        return struct.unpack("<I", self.read(4))[0]

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
class Transform:
    x: float
    y: float
    kx: float
    ky: float
    sx: float
    sy: float
    frame: float
    alpha: float
    image: str
    font: str
    text: str


@dataclass
class Track:
    name: str
    transforms: list[Transform]


@dataclass
class Reanim:
    fps: float
    tracks: list[Track]


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


def parse_transform(raw: bytes, image: str, font: str, text: str) -> Transform:
    values = struct.unpack_from("<8f", raw, 0)
    return Transform(
        x=values[0],
        y=values[1],
        kx=values[2],
        ky=values[3],
        sx=values[4],
        sy=values[5],
        frame=values[6],
        alpha=values[7],
        image=image,
        font=font,
        text=text,
    )


def parse_reanim_cache(data: bytes) -> Reanim:
    reader = CacheReader(data)
    reader.read_u32()  # schema hash

    definition = reader.read(REANIMATOR_DEFINITION_SIZE)
    track_count = struct.unpack_from("<i", definition, 4)[0]
    fps = struct.unpack_from("<f", definition, 8)[0]

    track_def_size = reader.read_i32()
    if track_def_size != REANIMATOR_TRACK_SIZE:
        raise ValueError(f"Unexpected ReanimatorTrack size: {track_def_size}")

    raw_tracks = [
        reader.read(REANIMATOR_TRACK_SIZE)
        for _ in range(track_count)
    ]

    tracks: list[Track] = []
    for raw_track in raw_tracks:
        transform_count = struct.unpack_from("<i", raw_track, 8)[0]
        name = reader.read_string()

        transform_def_size = reader.read_i32()
        if transform_def_size != REANIMATOR_TRANSFORM_SIZE:
            raise ValueError(f"Unexpected ReanimatorTransform size: {transform_def_size}")

        raw_transforms = [
            reader.read(REANIMATOR_TRANSFORM_SIZE)
            for _ in range(transform_count)
        ]

        transforms = []
        for raw_transform in raw_transforms:
            image = reader.read_string()
            font = reader.read_string()
            text = reader.read_string()
            transforms.append(parse_transform(raw_transform, image, font, text))

        tracks.append(Track(name=name, transforms=transforms))

    if reader.pos != len(reader.data):
        raise ValueError(f"Unread trailing cache bytes: {len(reader.data) - reader.pos}")

    return Reanim(fps=fps, tracks=tracks)


def is_placeholder(value: float) -> bool:
    return math.isclose(value, DEFAULT_FIELD_PLACEHOLDER, rel_tol=0.0, abs_tol=0.001)


def format_float(value: float) -> str:
    if value == 0:
        return "0"
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text != "-0" else "0"


def append_float(lines: list[str], tag: str, value: float) -> None:
    if not is_placeholder(value):
        lines.append(f"\t\t\t<{tag}>{format_float(value)}</{tag}>")


def reanim_to_xml(reanim: Reanim) -> str:
    lines: list[str] = []
    if not math.isclose(reanim.fps, 12.0, rel_tol=0.0, abs_tol=0.001):
        lines.append(f"<fps>{format_float(reanim.fps)}</fps>")

    for track in reanim.tracks:
        lines.append("<track>")
        lines.append(f"\t<name>{escape(track.name)}</name>")
        for transform in track.transforms:
            lines.append("\t<t>")
            append_float(lines, "x", transform.x)
            append_float(lines, "y", transform.y)
            append_float(lines, "kx", transform.kx)
            append_float(lines, "ky", transform.ky)
            append_float(lines, "sx", transform.sx)
            append_float(lines, "sy", transform.sy)
            append_float(lines, "f", transform.frame)
            append_float(lines, "a", transform.alpha)
            if transform.image:
                lines.append(f"\t\t\t<i>{escape(transform.image)}</i>")
            if transform.font:
                lines.append(f"\t\t\t<font>{escape(transform.font)}</font>")
            if transform.text:
                lines.append(f"\t\t\t<text>{escape(transform.text)}</text>")
            lines.append("\t</t>")
        lines.append("</track>")

    return "\n".join(lines) + "\n"


def output_name(path: Path) -> str:
    name = path.name
    if name.endswith(".compiled"):
        name = name[:-len(".compiled")]
    return name.lower()


def convert_file(src: Path, out_dir: Path) -> Path:
    reanim = parse_reanim_cache(unpack_compiled(src))
    dst = out_dir / output_name(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(reanim_to_xml(reanim), encoding="utf-8")
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decompile PvZ reanim .compiled cache files to .reanim XML text."
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        type=Path,
        default=[Path("tools/raw/compiled/reanim")],
        help="Input .reanim.compiled file or directory. Defaults to tools/raw/compiled/reanim.",
    )
    parser.add_argument(
        "-o",
        "--out-dir",
        type=Path,
        default=Path("tools/raw/reanim"),
        help="Output directory. Defaults to tools/raw/reanim.",
    )
    args = parser.parse_args()

    sources: list[Path] = []
    for item in args.inputs:
        if item.is_dir():
            sources.extend(sorted(item.glob("*.reanim.compiled")))
        else:
            sources.append(item)

    for src in sources:
        dst = convert_file(src, args.out_dir)
        print(f"[reanim-decompile] Wrote: {dst}")


if __name__ == "__main__":
    main()
