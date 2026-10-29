#!/usr/bin/env python3
"""Convert original PvZ MO3 music into runtime-friendly Cocos audio stems."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from ctypes import c_int16
from dataclasses import dataclass
from pathlib import Path

from .openmpt_ctypes import OpenMptError, OpenMptLibrary


SAMPLE_RATE = 44100
CHUNK_FRAMES = 4096
MANIFEST_NAME = "music_manifest.json"
OUTPUT_SUFFIX = ".mp3"
OUTPUT_AUDIO_SUFFIXES = (".wav", ".mp3", ".ogg", ".m4a")


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
    loop_start: float = 0.0
    loop_end: float | None = None

    @property
    def output_name(self) -> str:
        return f"{self.tune}{OUTPUT_SUFFIX}"


DAY_GRASSWALK_STEMS = [
    StemSpec("day_grasswalk", "main", "mainmusic.mo3", tuple(range(0, 24))),
    StemSpec("day_grasswalk", "drums", "mainmusic.mo3", tuple(range(24, 27))),
    StemSpec("day_grasswalk", "hihats", "mainmusic_hihats.mo3", (27,)),
]

STATIC_TUNES = [
    StaticTuneSpec("choose_seeds", "mainmusic.mo3", 0x7A, loop_start=3.6, loop_end=21.6),
    StaticTuneSpec("title_theme", "mainmusic.mo3", 0x98),
    StaticTuneSpec("zen_garden", "mainmusic.mo3", 0xDD),
    StaticTuneSpec("puzzle", "mainmusic.mo3", 0xB1),
    StaticTuneSpec("minigame", "mainmusic.mo3", 0xA6, loop_start=0.1, loop_end=106.5),
    StaticTuneSpec("conveyer", "mainmusic.mo3", 0xD4, loop_start=16.0, loop_end=120.0),
    StaticTuneSpec("final_boss", "mainmusic.mo3", 0x9E),
]


# Music::PlayMusic(MUSIC_TUNE_NIGHT_MOONGRAINS) plays these orders from two streams of mainmusic.mo3; burst
# scheme 2 jumps the drum stream to order 76 or 77 on the main stream's next order, by its parity.
NIGHT_MAIN_ORDER = 0x30
NIGHT_DRUMS_ORDER = 0x4C


def resolve_ffmpeg(ffmpeg: str) -> str:
    resolved = shutil.which(ffmpeg)
    if resolved:
        return resolved

    for candidate in (
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ):
        if Path(candidate).exists():
            return candidate

    raise OpenMptError(
        "ffmpeg is required to convert rendered music to MP3. "
        "Install it with `brew install ffmpeg` on macOS, or pass --ffmpeg /path/to/ffmpeg."
    )


def render_stem_output(
    library: OpenMptLibrary,
    ffmpeg_path: str,
    src: Path,
    dst: Path,
    channels: tuple[int, ...] | None,
    start_order: int = 0,
    start_row: int = 0,
    max_frames: int | None = None,
) -> int:
    if dst:
        dst.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_process = subprocess.Popen(
        [
            ffmpeg_path,
            "-y",
            "-v",
            "error",
            "-f",
            "s16le",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-i",
            "pipe:0",
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "2",
            str(dst),
        ],
        stdin=subprocess.PIPE,
    ) if dst else None

    buffer = (c_int16 * (CHUNK_FRAMES * 2))()
    frames = 0
    with library.open_module(src) as module:
        if channels is not None:
            module.set_channel_mutes(set(channels))
        if start_order != 0 or start_row != 0:
            module.set_position_order_row(start_order, start_row)
        while max_frames is None or frames < max_frames:
            limit = CHUNK_FRAMES if max_frames is None else min(CHUNK_FRAMES, max_frames - frames)
            chunk_frames = module.read_interleaved_stereo(SAMPLE_RATE, limit, buffer)
            if chunk_frames <= 0:
                break
            data = bytes(buffer)[: chunk_frames * 2 * 2]
            if ffmpeg_process and ffmpeg_process.stdin:
                ffmpeg_process.stdin.write(data)
            frames += chunk_frames

    if ffmpeg_process and ffmpeg_process.stdin:
        ffmpeg_process.stdin.close()
    if ffmpeg_process and ffmpeg_process.wait() != 0:
        raise OpenMptError(f"ffmpeg failed while writing {dst}")
    if dst:
        print(f"[music] Wrote: {dst} ({frames / SAMPLE_RATE:.3f}s)")
    return frames


def remove_old_audio_outputs(dst_dir: Path, output_stem: str) -> None:
    for path in dst_dir.glob(f"{output_stem}.*"):
        if path.suffix.lower() in OUTPUT_AUDIO_SUFFIXES:
            path.unlink()


def tune_manifest_entry(spec: StaticTuneSpec, frames: int) -> dict:
    duration = frames / SAMPLE_RATE
    loop_end = spec.loop_end if spec.loop_end is not None else duration
    return {
        "id": spec.tune,
        "source": spec.source,
        "startOrder": spec.order,
        "startRow": spec.row,
        "durationSec": round(duration, 6),
        "loopStartSec": round(spec.loop_start, 6),
        "loopEndSec": round(loop_end, 6),
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


def build_night_manifest(library: OpenMptLibrary, ffmpeg_path: str, src_dir: Path, dst_dir: Path, overwrite: bool) -> dict:
    with library.open_module(src_dir / "mainmusic.mo3") as module:
        time = lambda order: float(library.lib.openmpt_module_get_time_at_position(module.module, order, 0))
        order_seconds = time(NIGHT_DRUMS_ORDER + 1) - time(NIGHT_DRUMS_ORDER)
        main_orders = [(order, time(order) - time(NIGHT_MAIN_ORDER)) for order in range(NIGHT_MAIN_ORDER + 1, NIGHT_DRUMS_ORDER)]
    durations, loops = {}, {}
    for stem, order in (("main", NIGHT_MAIN_ORDER), ("drums", NIGHT_DRUMS_ORDER)):
        frames = render_stem_output(library, ffmpeg_path, src_dir / "mainmusic.mo3", None, None, order)
        # Both sections are whole orders; anything after is the release tail of their last notes.
        loops[stem] = round(frames / SAMPLE_RATE / order_seconds) * order_seconds
        dst = dst_dir / f"night_moongrains_{stem}{OUTPUT_SUFFIX}"
        if overwrite:
            remove_old_audio_outputs(dst_dir, f"night_moongrains_{stem}")
        # The drum stream loops by itself, so its file ends exactly on the loop; the main stem jumps at loopEndSec.
        limit = round(loops[stem] * SAMPLE_RATE) if stem == "drums" else None
        frames = render_stem_output(library, ffmpeg_path, src_dir / "mainmusic.mo3",
                                    dst if overwrite or not dst.exists() else None, None, order, max_frames=limit)
        durations[stem] = frames / SAMPLE_RATE
    entries = [(order, seconds) for order, seconds in main_orders if 0 < seconds < loops["main"] - 0.05]
    return {
        "id": "night_moongrains",
        "durationSec": round(durations["main"], 6),
        "loopStartSec": 0,
        "loopEndSec": round(loops["main"], 6),
        "drumsLoopEndSec": round(loops["drums"], 6),
        "burstScheme": "night",
        "burstBoundariesSec": [round(seconds, 6) for _, seconds in entries],
        "burstDrumsOffsetsSec": [round(order_seconds if order % 2 else 0, 6) for order, _ in entries],
        "stems": {"main": "audio/music/night_moongrains_main", "drums": "audio/music/night_moongrains_drums"},
    }


def convert_music(
    src_dir: Path,
    dst_dir: Path,
    overwrite: bool = False,
    libopenmpt: str | None = None,
    ffmpeg: str = "ffmpeg",
) -> int:
    required = sorted({spec.source for spec in DAY_GRASSWALK_STEMS} | {spec.source for spec in STATIC_TUNES})
    missing = [name for name in required if not (src_dir / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing source music files in {src_dir}: {', '.join(missing)}")

    library = OpenMptLibrary(libopenmpt)
    ffmpeg_path = resolve_ffmpeg(ffmpeg)
    dst_dir.mkdir(parents=True, exist_ok=True)

    stem_frames: dict[str, int] = {}
    for spec in DAY_GRASSWALK_STEMS:
        dst = dst_dir / spec.output_name
        should_write = overwrite or not dst.exists()
        if overwrite:
            remove_old_audio_outputs(dst_dir, spec.output_stem)
        stem_frames[spec.stem] = render_stem_output(
            library,
            ffmpeg_path,
            src_dir / spec.source,
            dst if should_write else None,
            spec.channels,
        )

    frame_counts = set(stem_frames.values())
    if len(frame_counts) != 1:
        details = ", ".join(f"{stem}={frames}" for stem, frames in sorted(stem_frames.items()))
        raise OpenMptError(f"Rendered music stems have different frame counts: {details}")

    tune_entries = {
        "day_grasswalk": build_day_manifest(library, src_dir, dst_dir, stem_frames),
        "night_moongrains": build_night_manifest(library, ffmpeg_path, src_dir, dst_dir, overwrite),
    }
    static_count = 0
    for spec in STATIC_TUNES:
        dst = dst_dir / spec.output_name
        should_write = overwrite or not dst.exists()
        if overwrite:
            remove_old_audio_outputs(dst_dir, spec.tune)
        frames = render_stem_output(
            library,
            ffmpeg_path,
            src_dir / spec.source,
            dst if should_write else None,
            None,
            spec.order,
            spec.row,
        )
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
    return len(DAY_GRASSWALK_STEMS) + 2 + static_count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        required=True,
        help="Directory containing extracted PvZ sound files.",
    )
    parser.add_argument(
        "--dst",
        type=Path,
        default=Path("./mods/pvz-base/assets/audio/music"),
        help="Destination under the Cocos resources directory.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing music stems.")
    parser.add_argument("--libopenmpt", help="Path to libopenmpt dynamic library.")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable used for MP3 conversion.")
    args = parser.parse_args()

    try:
        count = convert_music(args.src, args.dst, args.overwrite, args.libopenmpt, args.ffmpeg)
    except (FileNotFoundError, OpenMptError) as error:
        print(f"[music] Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(f"[music] Converted {count} music stems -> {args.dst}")


if __name__ == "__main__":
    main()
