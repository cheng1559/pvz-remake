#!/usr/bin/env python3
"""Convert original PvZ MO3 music into runtime-friendly Cocos audio stems."""

from __future__ import annotations

import argparse
import json
import sys
import wave
from ctypes import c_int16
from dataclasses import dataclass
from pathlib import Path

from music.openmpt_ctypes import OpenMptError, OpenMptLibrary


SAMPLE_RATE = 44100
CHUNK_FRAMES = 4096
MANIFEST_NAME = "music_manifest.json"
OUTPUT_SUFFIX = ".wav"


@dataclass(frozen=True)
class StemSpec:
    tune: str
    stem: str
    source: str
    channels: tuple[int, ...]

    @property
    def output_stem(self) -> str:
        return f"{self.tune}_{self.stem}"

    @property
    def output_name(self) -> str:
        return f"{self.output_stem}{OUTPUT_SUFFIX}"


@dataclass(frozen=True)
class StaticTuneSpec:
    tune: str
    source: str
    order: int
    row: int = 0

    @property
    def output_name(self) -> str:
        return f"{self.tune}{OUTPUT_SUFFIX}"


DAY_GRASSWALK_STEMS = [
    StemSpec("day_grasswalk", "main", "mainmusic.mo3", tuple(range(0, 24))),
    StemSpec("day_grasswalk", "drums", "mainmusic.mo3", tuple(range(24, 27))),
    StemSpec("day_grasswalk", "hihats", "mainmusic_hihats.mo3", (27,)),
]

STATIC_TUNES = [
    StaticTuneSpec("choose_seeds", "mainmusic.mo3", 0x7A),
    StaticTuneSpec("title_theme", "mainmusic.mo3", 0x98),
    StaticTuneSpec("zen_garden", "mainmusic.mo3", 0xDD),
    StaticTuneSpec("puzzle", "mainmusic.mo3", 0xB1),
    StaticTuneSpec("minigame", "mainmusic.mo3", 0xA6),
    StaticTuneSpec("conveyer", "mainmusic.mo3", 0xD4),
    StaticTuneSpec("final_boss", "mainmusic.mo3", 0x9E),
]


def render_stem(
    library: OpenMptLibrary,
    src: Path,
    dst: Path,
    channels: tuple[int, ...] | None,
    start_order: int = 0,
    start_row: int = 0,
) -> int:
    dst.parent.mkdir(parents=True, exist_ok=True)
    buffer = (c_int16 * (CHUNK_FRAMES * 2))()
    frames_written = 0

    with library.open_module(src) as module:
        if channels is not None:
            module.set_channel_mutes(set(channels))
        if start_order != 0 or start_row != 0:
            module.set_position_order_row(start_order, start_row)
        with wave.open(str(dst), "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            while True:
                frames = module.read_interleaved_stereo(SAMPLE_RATE, CHUNK_FRAMES, buffer)
                if frames <= 0:
                    break
                wav.writeframes(bytes(buffer)[: frames * 2 * 2])
                frames_written += frames

    print(f"[music] Wrote: {dst} ({frames_written / SAMPLE_RATE:.3f}s)")
    return frames_written


def tune_manifest_entry(spec: StaticTuneSpec, frames: int) -> dict:
    duration = frames / SAMPLE_RATE
    return {
        "id": spec.tune,
        "source": spec.source,
        "startOrder": spec.order,
        "startRow": spec.row,
        "durationSec": round(duration, 6),
        "loopStartSec": 0,
        "loopEndSec": round(duration, 6),
        "stems": {
            "main": f"audio/music/{spec.tune}",
        },
    }


def build_day_manifest(
    library: OpenMptLibrary,
    src_dir: Path,
    dst_dir: Path,
    stem_frames: dict[str, int],
) -> dict:
    with library.open_module(src_dir / "mainmusic.mo3") as module:
        boundaries = module.burst_boundaries_seconds()
        source_duration = module.duration_seconds

    duration = min(stem_frames.values()) / SAMPLE_RATE
    return {
        "id": "day_grasswalk",
        "sourceDurationSec": round(source_duration, 6),
        "durationSec": round(duration, 6),
        "loopStartSec": 0,
        "loopEndSec": round(duration, 6),
        "burstScheme": "day",
        "burstBoundariesSec": [value for value in boundaries if value < duration - 0.05],
        "stems": {
            "main": "audio/music/day_grasswalk_main",
            "drums": "audio/music/day_grasswalk_drums",
            "hihats": "audio/music/day_grasswalk_hihats",
        },
        "channelMasks": {
            spec.stem: {
                "source": spec.source,
                "channels": list(spec.channels),
            }
            for spec in DAY_GRASSWALK_STEMS
        },
    }


def convert_music(
    src_dir: Path,
    dst_dir: Path,
    overwrite: bool = False,
    libopenmpt: str | None = None,
) -> int:
    required = sorted({spec.source for spec in DAY_GRASSWALK_STEMS} | {spec.source for spec in STATIC_TUNES})
    missing = [name for name in required if not (src_dir / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing source music files in {src_dir}: {', '.join(missing)}")

    library = OpenMptLibrary(libopenmpt)
    dst_dir.mkdir(parents=True, exist_ok=True)

    stem_frames: dict[str, int] = {}
    for spec in DAY_GRASSWALK_STEMS:
        dst = dst_dir / spec.output_name
        if dst.exists() and not overwrite:
            with wave.open(str(dst), "rb") as wav:
                stem_frames[spec.stem] = wav.getnframes()
            continue
        stem_frames[spec.stem] = render_stem(library, src_dir / spec.source, dst, spec.channels)

    frame_counts = set(stem_frames.values())
    if len(frame_counts) != 1:
        details = ", ".join(f"{stem}={frames}" for stem, frames in sorted(stem_frames.items()))
        raise OpenMptError(f"Rendered music stems have different frame counts: {details}")

    tune_entries = {
        "day_grasswalk": build_day_manifest(library, src_dir, dst_dir, stem_frames),
    }
    static_count = 0
    for spec in STATIC_TUNES:
        dst = dst_dir / spec.output_name
        if dst.exists() and not overwrite:
            with wave.open(str(dst), "rb") as wav:
                frames = wav.getnframes()
        else:
            frames = render_stem(library, src_dir / spec.source, dst, None, spec.order, spec.row)
        tune_entries[spec.tune] = tune_manifest_entry(spec, frames)
        static_count += 1

    manifest = {
        "version": 1,
        "sampleRate": SAMPLE_RATE,
        "tunes": tune_entries,
    }
    manifest_path = dst_dir / MANIFEST_NAME
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[music] Wrote: {manifest_path}")
    return len(DAY_GRASSWALK_STEMS) + static_count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        default=Path("./tools/raw/sounds"),
        help="Directory containing extracted PvZ sound files.",
    )
    parser.add_argument(
        "--dst",
        type=Path,
        default=Path("./assets/resources/audio/music"),
        help="Destination under the Cocos resources directory.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing music stems.")
    parser.add_argument("--libopenmpt", help="Path to libopenmpt dynamic library.")
    args = parser.parse_args()

    try:
        count = convert_music(args.src, args.dst, args.overwrite, args.libopenmpt)
    except (FileNotFoundError, OpenMptError) as error:
        print(f"[music] Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(f"[music] Converted {count} music stems -> {args.dst}")


if __name__ == "__main__":
    main()
