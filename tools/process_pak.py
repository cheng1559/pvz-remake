#!/usr/bin/env python3
"""
PvZ asset pipeline

Steps:
  1. Extract main.pak -> tools/raw/
  2. Rename files to lowercase
  3. Convert reanim animations
  4. Convert fonts
  5. Convert LawnStrings
  6. Copy images to textures
  7. Copy particle images to texture resources
  8. Copy sounds to audio resources
  9. Generate cached packet plant atlas
 10. Generate cached plant preview atlas
 11. Generate cached zombie preview atlas
"""

import shutil
from pathlib import Path

from pak_extractor import parse_pak, extract_entries, _decrypt
from rename_raw_to_lower import rename_all_to_lower
from reanim_converter import main as convert_reanim
from font_converter import main as convert_font
from lawnstrings_converter import convert_lawnstrings
from copy_particles import copy_particles
from copy_sounds import copy_sounds
from generate_packet_plant_cache import main as generate_packet_plant_cache
from generate_plant_preview_cache import main as generate_plant_preview_cache
from generate_zombie_preview_cache import main as generate_zombie_preview_cache


IMAGE_SUFFIX_PRIORITY = {'.png': 0, '.jpg': 1, '.jpeg': 1, '.gif': 2}


def get_image_resource_name(path: Path) -> str:
    name = path.name.lower()
    while Path(name).suffix.lower() in IMAGE_SUFFIX_PRIORITY:
        name = Path(name).with_suffix('').name
    return name


def copy_images(src_dir: Path, dst_dir: Path) -> int:
    """Copy all image files from src_dir to dst_dir, return count of newly copied files."""
    dst_dir.mkdir(parents=True, exist_ok=True)

    image_files = [
        p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIX_PRIORITY
    ]
    images_by_resource: dict[str, list[Path]] = {}
    for image_file in image_files:
        images_by_resource.setdefault(get_image_resource_name(image_file), []).append(image_file)

    copied = 0
    for candidates in sorted(images_by_resource.values(), key=lambda files: get_image_resource_name(files[0])):
        src = min(candidates, key=lambda path: (IMAGE_SUFFIX_PRIORITY[path.suffix.lower()], path.name.count('.')))
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

    # ── Step 5: Convert LawnStrings ────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 5: Convert LawnStrings")
    print("=" * 60)

    lawnstrings_src = raw_dir / "properties/lawnstrings.txt"
    lawnstrings_dst = Path("./assets/resources/properties/lawnstrings.json")
    string_count = convert_lawnstrings(lawnstrings_src, lawnstrings_dst)
    print(f"[pipeline] Converted {string_count} strings -> {lawnstrings_dst}")

    # ── Step 6: Copy images ────────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 6: Copy images to textures")
    print("=" * 60)

    images_dir = raw_dir / "images"
    texture_dir = Path("./assets/resources/textures")
    img_count = copy_images(images_dir, texture_dir)
    print(f"[pipeline] Copied {img_count} new images -> {texture_dir}")

    # ── Step 7: Copy particle images ───────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 7: Copy particle images to texture resources")
    print("=" * 60)

    particles_dir = raw_dir / "particles"
    particle_texture_dir = Path("./assets/resources/textures/particles")
    particle_count = copy_particles(particles_dir, particle_texture_dir)
    print(f"[pipeline] Copied {particle_count} new particle images -> {particle_texture_dir}")

    # ── Step 8: Copy sounds ────────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 8: Copy sounds to audio resources")
    print("=" * 60)

    sounds_dir = raw_dir / "sounds"
    audio_dir = Path("./assets/resources/audio/sfx")
    sound_count = copy_sounds(sounds_dir, audio_dir)
    print(f"[pipeline] Copied {sound_count} new sounds -> {audio_dir}")

    # ── Step 9: Generate cached packet plant atlas ────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 9: Generate cached packet plant atlas")
    print("=" * 60)

    generate_packet_plant_cache()

    # ── Step 10: Generate cached plant preview atlas ──────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 10: Generate cached plant preview atlas")
    print("=" * 60)

    generate_plant_preview_cache()

    # ── Step 11: Generate cached zombie preview atlas ─────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 11: Generate cached zombie preview atlas")
    print("=" * 60)

    generate_zombie_preview_cache()

    print()
    print("=" * 60)
    print("[pipeline] All done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
