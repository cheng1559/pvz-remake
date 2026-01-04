#!/usr/bin/env python3
"""Rename files under raw_reanim to lowercase.

Default root: tools/raw_reanim (relative to repo root / current working directory).

Usage:
  python .\tools\rename_raw_reanim_to_lower.py
  python .\tools\rename_raw_reanim_to_lower.py --root .\tools\raw_reanim
  python .\tools\rename_raw_reanim_to_lower.py --dry-run

Notes:
- On Windows, renaming only by case can fail because the filesystem is usually
  case-insensitive. This script uses a temporary filename hop when needed.
"""

from __future__ import annotations

import os
from pathlib import Path
import uuid


def _normcase_path(path: Path) -> str:
    # Normalize for case-insensitive comparisons on Windows.
    return os.path.normcase(str(path.resolve()))


def _unique_temp_name(path: Path) -> Path:
    # Keep temp file in same directory to avoid cross-device rename issues.
    while True:
        candidate = path.with_name(f".__tmp__{uuid.uuid4().hex}{path.suffix}")
        if not candidate.exists():
            return candidate


def _rename_file_case_safe(src: Path, dst: Path, *, dry_run: bool) -> bool:
    """Rename src -> dst. Returns True if a rename would happen."""

    if src.name == dst.name:
        return False

    src_norm = _normcase_path(src)
    dst_norm = os.path.normcase(str(dst.resolve()))

    # If the OS considers these the same path (common on Windows), do a temp hop.
    if src_norm == dst_norm:
        tmp = _unique_temp_name(src)
        if dry_run:
            print(f"RENAME (temp) {src} -> {tmp}")
            print(f"RENAME         {tmp} -> {dst}")
            return True
        src.rename(tmp)
        tmp.rename(dst)
        return True

    if dst.exists():
        raise FileExistsError(f"Target already exists: {dst}")

    if dry_run:
        print(f"RENAME {src} -> {dst}")
        return True

    src.rename(dst)
    return True


def rename_all_to_lower(root: Path, *, dry_run: bool = False) -> int:
    root = root.resolve()
    if not root.exists():
        raise FileNotFoundError(f"Root folder not found: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Root is not a directory: {root}")

    # Collect first to avoid issues if future enhancements include directory renames.
    files: list[Path] = [p for p in root.rglob("*") if p.is_file()]

    renamed = 0
    # Deepest paths first (not strictly needed for files, but harmless).
    files.sort(key=lambda p: len(p.parts), reverse=True)

    for path in files:
        lower_name = path.name.lower()
        if lower_name == path.name:
            continue
        target = path.with_name(lower_name)
        if _rename_file_case_safe(path, target, dry_run=dry_run):
            renamed += 1

    return renamed


if __name__ == "__main__":
    root = Path(r"tools/raw_reanim")
    dry_run = False 

    count = rename_all_to_lower(root, dry_run=dry_run)
    action = "Would rename" if dry_run else "Renamed"
    print(f"{action} {count} file(s).")