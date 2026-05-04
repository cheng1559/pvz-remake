#!/usr/bin/env python3
"""
Copy extracted PvZ particle image assets into the Cocos resources library.

Particle definitions reference image files from tools/raw/particles. Runtime code
loads copied images through SpriteLoader using names under textures/particles.
"""

import argparse
import shutil
from pathlib import Path


SUPPORTED_PARTICLE_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}


def copy_particles(src_dir: Path, dst_dir: Path, overwrite: bool = False) -> int:
    dst_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    for src in sorted(src_dir.iterdir()):
        if not src.is_file() or src.suffix.lower() not in SUPPORTED_PARTICLE_IMAGE_SUFFIXES:
            continue

        dst = dst_dir / src.name.lower()
        if dst.exists() and not overwrite:
            continue

        shutil.copy2(src, dst)
        print(f"[particles] Wrote: {dst}")
        copied += 1

    return copied


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        default=Path("./tools/raw/particles"),
        help="Directory containing extracted PvZ particle files.",
    )
    parser.add_argument(
        "--dst",
        type=Path,
        default=Path("./assets/resources/textures/particles"),
        help="Destination under the Cocos resources texture directory.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing copied files.")
    args = parser.parse_args()

    if not args.src.exists():
        raise FileNotFoundError(f"Particle source directory does not exist: {args.src}")

    count = copy_particles(args.src, args.dst, args.overwrite)
    print(f"[particles] Copied {count} particle image files -> {args.dst}")


if __name__ == "__main__":
    main()
