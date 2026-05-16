#!/usr/bin/env python3
"""
Convert extracted PvZ sound effects into the Cocos resources library.

The original package also contains tracker music and a few legacy audio formats.
This script intentionally imports sound effects only and normalizes them to WAV,
which is the most reliable shared format across the Cocos targets used here.
"""

import argparse
import json
import shutil
import subprocess
import uuid
from pathlib import Path


SUPPORTED_SOUND_SUFFIXES = (".au", ".ogg", ".mp3", ".wav")
OUTPUT_SUFFIX = ".wav"
OUTPUT_AUDIO_FILES = [".json", OUTPUT_SUFFIX]


def _resource_stem(path: Path) -> str:
    return path.with_suffix("").name.lower()


def write_directory_meta(path: Path) -> None:
    meta = path.with_name(path.name + ".meta")
    if meta.exists():
        return
    meta.write_text(
        json.dumps(
            {
                "ver": "1.2.0",
                "importer": "directory",
                "imported": True,
                "uuid": str(uuid.uuid4()),
                "files": [],
                "subMetas": {},
                "userData": {},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def write_audio_meta(path: Path) -> None:
    meta = path.with_name(path.name + ".meta")
    if meta.exists():
        return
    meta.write_text(
        json.dumps(
            {
                "ver": "1.0.0",
                "importer": "audio-clip",
                "imported": True,
                "uuid": str(uuid.uuid4()),
                "files": OUTPUT_AUDIO_FILES,
                "subMetas": {},
                "userData": {"downloadMode": 0},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def convert_sound(ffmpeg: str, src: Path, dst: Path, overwrite: bool) -> None:
    if src.suffix.lower() == OUTPUT_SUFFIX:
        if overwrite or not dst.exists():
            shutil.copy2(src, dst)
        return

    ffmpeg_path = resolve_ffmpeg(ffmpeg)
    args = [
        ffmpeg_path,
        "-y" if overwrite else "-n",
        "-v",
        "error",
        "-i",
        str(src),
        "-vn",
        "-acodec",
        "pcm_s16le",
    ]
    if src.suffix.lower() != ".au":
        args.extend(["-ar", "44100", "-ac", "2"])
    args.append(str(dst))
    subprocess.run(args, check=True)


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

    raise RuntimeError(
        "ffmpeg is required to convert PvZ sound files to WAV. "
        "Install it with `brew install ffmpeg` on macOS, or pass --ffmpeg /path/to/ffmpeg."
    )


def copy_sounds(src_dir: Path, dst_dir: Path, overwrite: bool = False, ffmpeg: str = "ffmpeg") -> int:
    dst_dir.mkdir(parents=True, exist_ok=True)
    write_directory_meta(dst_dir)

    sound_files: dict[str, list[Path]] = {}
    for src in sorted(src_dir.iterdir()):
        suffix = src.suffix.lower()
        if not src.is_file() or suffix not in SUPPORTED_SOUND_SUFFIXES:
            continue
        sound_files.setdefault(_resource_stem(src), []).append(src)

    copied = 0
    suffix_priority = {".wav": 0, ".ogg": 1, ".mp3": 2, ".au": 3}
    for resource_stem, candidates in sorted(sound_files.items()):
        src = min(candidates, key=lambda path: suffix_priority[path.suffix.lower()])
        dst = dst_dir / f"{resource_stem}{OUTPUT_SUFFIX}"
        existing = [
            path for path in dst_dir.glob(f"{resource_stem}.*")
            if path.suffix.lower() in SUPPORTED_SOUND_SUFFIXES
        ]
        if existing and not overwrite:
            continue
        if overwrite:
            for old_dst in existing:
                if old_dst != dst:
                    old_dst.unlink()
                    meta_path = old_dst.with_name(old_dst.name + ".meta")
                    if meta_path.exists():
                        meta_path.unlink()

        convert_sound(ffmpeg, src, dst, overwrite=True)
        write_audio_meta(dst)
        print(f"[sounds] Wrote: {dst}")
        copied += 1

    return copied


def main():
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
        default=Path("./assets/resources/audio/sfx"),
        help="Destination under the Cocos resources directory.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing copied files.")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable used for WAV conversion.")
    args = parser.parse_args()

    if not args.src.exists():
        raise FileNotFoundError(f"Sound source directory does not exist: {args.src}")

    count = copy_sounds(args.src, args.dst, args.overwrite, args.ffmpeg)
    print(f"[sounds] Copied {count} sound effect files -> {args.dst}")


if __name__ == "__main__":
    main()
