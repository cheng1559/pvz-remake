#!/usr/bin/env python3
"""
PvZ asset pipeline

Steps:
  1. Extract main.pak -> tools/raw/
  2. Rename files to lowercase
  3. Decompile compiled particles/reanim
  4. Convert reanim animations
  5. Convert fonts
  6. Convert LawnStrings
  7. Copy images to textures
  8. Copy particle images to texture resources
  9. Convert sounds to WAV audio resources
 10. Convert MO3 music to WAV audio stems
 11. Generate cached packet plant atlas
 12. Generate cached plant preview atlas
 13. Generate cached zombie preview atlas
 14. Generate cached lawn mower sprite
"""

from pathlib import Path
import shutil

from pak_extractor import parse_pak, extract_entries, _decrypt
from rename_raw_to_lower import rename_all_to_lower
from decompile_particle_compiled import convert_directory as decompile_particle_directory
from decompile_reanim_compiled import convert_file as decompile_reanim_file
from reanim_converter import main as convert_reanim
from font_converter import main as convert_font
from lawnstrings_converter import convert_lawnstrings
from copy_particles import copy_particles
from copy_sounds import copy_sounds
from convert_music import convert_music
from generate_packet_plant_cache import main as generate_packet_plant_cache
from generate_plant_preview_cache import main as generate_plant_preview_cache
from generate_zombie_preview_cache import main as generate_zombie_preview_cache
from generate_lawnmower_cache import main as generate_lawnmower_cache
from sprite_texture_preprocessor import (
    get_alpha_companion_name,
    get_output_name,
    is_alpha_companion_name,
    select_image_resources,
    write_preprocessed_resource,
)


def copy_images(src_dir: Path, dst_dir: Path) -> int:
    """Copy all image files from src_dir to dst_dir, return count of newly copied files."""
    dst_dir.mkdir(parents=True, exist_ok=True)

    resources = select_image_resources(src_dir)

    copied = 0
    for resource_name, src in sorted(resources.items()):
        if is_alpha_companion_name(resource_name) and resource_name[:-1] in resources:
            continue

        alpha_src = resources.get(get_alpha_companion_name(resource_name))
        dst_name = get_output_name(src, resource_name, force_png=alpha_src is not None)
        dst = dst_dir / dst_name
        if src.suffix.lower() == '.gif':
            legacy_dst = dst_dir / src.name.lower()
            if legacy_dst.exists():
                legacy_dst.unlink()

        if write_preprocessed_resource(src, dst, resource_name=resource_name, alpha_src=alpha_src):
            print(f"[pipeline] Wrote: {dst}")
            copied += 1
    return copied


def decompile_reanim_directory(src_dir: Path, out_dir: Path) -> int:
    count = 0
    if not src_dir.exists():
        return count
    for src in sorted(src_dir.glob("*.reanim.compiled")):
        dst = decompile_reanim_file(src, out_dir)
        print(f"[reanim-decompile] Wrote: {dst}")
        count += 1

    aliases = {
        "zombie_jackson.reanim": "zombie_disco.reanim",
        "zombie_dancer.reanim": "zombie_backup.reanim",
    }
    for source_name, alias_name in aliases.items():
        source = out_dir / source_name
        alias = out_dir / alias_name
        if source.exists() and not alias.exists():
            shutil.copyfile(source, alias)
            print(f"[reanim-decompile] Wrote alias: {alias} <- {source.name}")
            count += 1
    return count


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

    # ── Step 3: Decompile compiled particles/reanim ────────────────
    print("=" * 60)
    print("[pipeline] Step 3: Decompile compiled particles/reanim")
    print("=" * 60)

    particle_compiled_dir = raw_dir / "compiled/particles"
    particle_count = decompile_particle_directory(
        particle_compiled_dir, raw_dir / "particles"
    )
    reanim_compiled_dir = raw_dir / "compiled/reanim"
    reanim_count = decompile_reanim_directory(
        reanim_compiled_dir, raw_dir / "reanim"
    )
    print(
        f"[pipeline] Decompiled {particle_count} particle XML files and "
        f"{reanim_count} reanim files\n"
    )

    # ── Step 4: Convert reanim ─────────────────────────────────────
    print("=" * 60)
    print("[pipeline] Step 4: Convert reanim animations")
    print("=" * 60)
    convert_reanim()

    # ── Step 5: Convert fonts ──────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 5: Convert fonts")
    print("=" * 60)
    convert_font()

    # ── Step 6: Convert LawnStrings ────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 6: Convert LawnStrings")
    print("=" * 60)

    lawnstrings_src = raw_dir / "properties/lawnstrings.txt"
    lawnstrings_dst = Path("./assets/resources/properties/lawnstrings.json")
    string_count = convert_lawnstrings(lawnstrings_src, lawnstrings_dst)
    print(f"[pipeline] Converted {string_count} strings -> {lawnstrings_dst}")

    # ── Step 7: Copy images ────────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 7: Copy images to textures")
    print("=" * 60)

    images_dir = raw_dir / "images"
    texture_dir = Path("./assets/resources/textures")
    img_count = copy_images(images_dir, texture_dir)
    print(f"[pipeline] Copied {img_count} new images -> {texture_dir}")

    # ── Step 8: Copy particle images ───────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 8: Copy particle images to texture resources")
    print("=" * 60)

    particles_dir = raw_dir / "particles"
    particle_texture_dir = Path("./assets/resources/textures/particles")
    particle_count = copy_particles(particles_dir, particle_texture_dir)
    print(f"[pipeline] Copied {particle_count} new particle images -> {particle_texture_dir}")

    # ── Step 9: Convert sounds ─────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 9: Convert sounds to WAV audio resources")
    print("=" * 60)

    sounds_dir = raw_dir / "sounds"
    audio_dir = Path("./assets/resources/audio/sfx")
    sound_count = copy_sounds(sounds_dir, audio_dir, overwrite=True)
    print(f"[pipeline] Converted {sound_count} sounds -> {audio_dir}")

    # ── Step 10: Convert music ────────────────────────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 10: Convert MO3 music to WAV stems")
    print("=" * 60)

    music_dir = Path("./assets/resources/audio/music")
    music_count = convert_music(sounds_dir, music_dir, overwrite=True)
    print(f"[pipeline] Converted {music_count} music stems -> {music_dir}")

    # ── Step 11: Generate cached packet plant atlas ────────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 11: Generate cached packet plant atlas")
    print("=" * 60)

    generate_packet_plant_cache()

    # ── Step 12: Generate cached plant preview atlas ──────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 12: Generate cached plant preview atlas")
    print("=" * 60)

    generate_plant_preview_cache()

    # ── Step 13: Generate cached zombie preview atlas ─────────────
    print()
    print("=" * 60)
    print("[pipeline] Step 13: Generate cached zombie preview atlas")
    print("=" * 60)

    generate_zombie_preview_cache()

    # Step 14: Generate cached lawn mower sprite
    print()
    print("=" * 60)
    print("[pipeline] Step 14: Generate cached lawn mower sprite")
    print("=" * 60)

    generate_lawnmower_cache()

    print()
    print("=" * 60)
    print("[pipeline] All done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
