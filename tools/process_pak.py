#!/usr/bin/env python3
"""
PvZ asset pipeline

Steps:
  1. Extract main.pak -> tools/raw/
  2. Rename files to lowercase
  3. Convert reanim animations
  4. Convert fonts
  5. Copy images to textures
"""

import shutil
from pathlib import Path

from pak_extractor import parse_pak, extract_entries, _decrypt
from rename_raw_to_lower import rename_all_to_lower
from reanim_converter import main as convert_reanim
from font_converter import main as convert_font


def copy_images(src_dir: Path, dst_dir: Path) -> int:
    """Copy all image files from src_dir to dst_dir, return count of newly copied files."""
    dst_dir.mkdir(parents=True, exist_ok=True)

    image_files = sorted(
        p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif')
    )
    # Skip .jpg/.jpeg when a .png with the same stem exists (avoid URL conflict)
    png_stems = {p.stem.lower()
                 for p in image_files if p.suffix.lower() == '.png'}

    copied = 0
    for src in image_files:
        if src.suffix.lower() in ('.jpg', '.jpeg') and src.stem.lower() in png_stems:
            continue
        dst = dst_dir / src.name.lower()
        if not dst.exists():
            shutil.copy2(src, dst)
            print(f"[pipeline] Wrote: {dst}")
            copied += 1
    return copied


def main():
    pak_path = Path("./tools/main.pak")
    raw_dir = Path("./tools/raw")

    # ── Step 1: Extract pak ───────────────────────────────────────────
    print("=" * 60)
    print("[pipeline] Step 1: Extract main.pak")
    print("=" * 60)

    raw = pak_path.read_bytes()
    data = _decrypt(raw)
    entries = parse_pak(data)
    count = extract_entries(data, entries, raw_dir, verbose=False)
    print(f"[pipeline] Extracted {count} files -> {raw_dir}\n")

    # ── Step 2: Rename to lowercase ────────────────────────────────
    print("=" * 60)
    print("[pipeline] Step 2: Rename files to lowercase")
    print("=" * 60)

    renamed = rename_all_to_lower(raw_dir)
    print(f"[pipeline] Renamed {renamed} files\n")

    # ── Step 3: Convert reanim ─────────────────────────────────────
    print("=" * 60)
    print("[pipeline] Step 3: Convert reanim animations")
    print("=" * 60)
    convert_reanim()

    # ── Step 4: Convert fonts ──────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 4: Convert fonts")
    print("=" * 60)
    convert_font()

    # ── Step 5: Copy images ────────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 5: Copy images to textures")
    print("=" * 60)

    images_dir = raw_dir / "images"
    texture_dir = Path("./assets/resources/textures")
    img_count = copy_images(images_dir, texture_dir)
    print(f"[pipeline] Copied {img_count} new images -> {texture_dir}")

    print()
    print("=" * 60)
    print("[pipeline] All done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
