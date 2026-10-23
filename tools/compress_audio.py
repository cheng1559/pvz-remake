#!/usr/bin/env python3
"""Replace imported PCM WAVs with MP3s, preserving resource UUIDs and source audio."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import subprocess

from copy_sounds import resolve_ffmpeg


def compress_audio(root: Path, backup: Path, ffmpeg: str) -> None:
    files = sorted(root.rglob("*.wav"))
    before = sum(path.stat().st_size for path in files)

    def convert(source: Path) -> int:
        target = source.with_suffix(".mp3")
        temporary = source.with_suffix(".encoding.mp3")
        if target.exists():
            raise FileExistsError(target)
        original = backup / source.relative_to(root)
        original.parent.mkdir(parents=True, exist_ok=True)
        if not original.exists():
            shutil.copy2(source, original)
        try:
            subprocess.run([
                ffmpeg, "-y", "-v", "error", "-i", str(source), "-vn",
                "-c:a", "libmp3lame", "-q:a", "2" if source.parent.name == "music" else "4",
                "-ar", "44100", "-map_metadata", "-1", str(temporary),
            ], check=True)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        meta = Path(f"{source}.meta")
        if meta.exists():
            data = json.loads(meta.read_text())
            data["files"] = [".mp3" if suffix == ".wav" else suffix for suffix in data["files"]]
            Path(f"{target}.meta").write_text(json.dumps(data, indent=2) + "\n")
            meta.unlink()
        source.unlink()
        return target.stat().st_size

    with ThreadPoolExecutor(max_workers=4) as executor:
        after = sum(executor.map(convert, files))
    print(f"Compressed {len(files)} WAVs: {before:,} -> {after:,} bytes; originals: {backup}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=Path("assets/resources/audio"))
    parser.add_argument("--backup", type=Path, default=Path("tools/raw/audio-pcm"))
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    compress_audio(args.src, args.backup, resolve_ffmpeg(args.ffmpeg))
