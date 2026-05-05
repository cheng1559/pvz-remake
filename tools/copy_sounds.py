#!/usr/bin/env python3
"""
Copy extracted PvZ sound effects into the Cocos resources library.

The original package also contains tracker music and a few legacy audio formats.
This script intentionally copies browser/Cocos-friendly sound effects only.
"""

import argparse
import shutil
from pathlib import Path


SUPPORTED_SOUND_SUFFIXES = (".ogg", ".mp3", ".wav")


def _resource_stem(path: Path) -> str:
    return path.with_suffix("").name.lower()


def copy_sounds(src_dir: Path, dst_dir: Path, overwrite: bool = False) -> int:
    dst_dir.mkdir(parents=True, exist_ok=True)

    sound_files: dict[str, list[Path]] = {}
    for src in sorted(src_dir.iterdir()):
        suffix = src.suffix.lower()
        if not src.is_file() or suffix not in SUPPORTED_SOUND_SUFFIXES:
            continue
        sound_files.setdefault(_resource_stem(src), []).append(src)

    copied = 0
    suffix_priority = {suffix: index for index, suffix in enumerate(SUPPORTED_SOUND_SUFFIXES)}
    for resource_stem, candidates in sorted(sound_files.items()):
        src = min(candidates, key=lambda path: suffix_priority[path.suffix.lower()])
        dst = dst_dir / src.name.lower()
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
