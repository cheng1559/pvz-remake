#!/usr/bin/env python3
"""
Copy extracted PvZ sound effects into the Cocos resources library.

The original package also contains tracker music and a few legacy audio formats.
This script intentionally copies browser/Cocos-friendly sound effects only.
"""

import argparse
import shutil
from pathlib import Path


SUPPORTED_SOUND_SUFFIXES = {".ogg", ".mp3", ".wav"}


def copy_sounds(src_dir: Path, dst_dir: Path, overwrite: bool = False) -> int:
    dst_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    for src in sorted(src_dir.iterdir()):
        if not src.is_file() or src.suffix.lower() not in SUPPORTED_SOUND_SUFFIXES:
            continue

        dst = dst_dir / src.name.lower()
        if dst.exists() and not overwrite:
            continue

        shutil.copy2(src, dst)
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
    args = parser.parse_args()

    if not args.src.exists():
        raise FileNotFoundError(f"Sound source directory does not exist: {args.src}")

    count = copy_sounds(args.src, args.dst, args.overwrite)
    print(f"[sounds] Copied {count} sound effect files -> {args.dst}")


if __name__ == "__main__":
    main()
