#!/usr/bin/env python3
"""Import the workspace PvZ widescreen MP3s without transcoding."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent
# Verified against bass.dll's order table (VA 0x46dbdc) and debugs.txt,
# then matched to Music::PlayMusic / the base music manifest's MO3 orders.
# MP3 numbering is NOT the MusicTune enum numbering.
TRACKS = [
    ("day_grasswalk", 1, 0),
    ("choose_seeds", 6, 122),
    ("title_theme", 8, 152),
    ("zen_garden", 14, 221),
    ("puzzle", 11, 177),
    ("minigame", 10, 166),
    ("conveyer", 13, 212),
    ("final_boss", 9, 158),
]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=4) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="PvZ widescreen directory containing lawnbgm(*).mp3")
    args = parser.parse_args()
    audio = {}
    tunes = {}
    tracks = []
    (ROOT / "assets/audio").mkdir(parents=True, exist_ok=True)
    for tune_id, number, order in TRACKS:
        source = args.source / f"lawnbgm({number}).mp3"
        probe = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "format=duration:stream=sample_rate", "-of", "json", str(source),
        ]))
        duration = float(probe["format"]["duration"])
        sample_rate = int(probe["streams"][0]["sample_rate"])
        asset_id = f"local:widescreen-bgm/{tune_id}"
        destination = f"assets/audio/{tune_id}.mp3"
        shutil.copyfile(source, ROOT / destination)
        audio[asset_id] = destination
        # These are complete mixed tracks, so no base drums/hihats or day burst scheme.
        tunes[tune_id] = {
            "id": tune_id,
            "sampleRate": sample_rate,
            "durationSec": duration,
            "loopStartSec": 0,
            "loopEndSec": duration,
            "stems": {"main": asset_id},
        }
        tracks.append({
            "tune": tune_id, "source": source.name, "mo3Order": order,
            "file": destination, "durationSec": duration, "sampleRate": sample_rate,
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        })
    # The legacy index keeps its nominal rate; playback uses each AudioClip's
    # native rate, including the 48 kHz title track. No resampling is needed.
    write_json(ROOT / "assets/music_manifest.json", {
        "version": 1, "sampleRate": 44100, "tunes": tunes,
    })
    write_json(ROOT / "content.json", {"resources": {
        "audio": audio,
        "json": {"pvz:audio/music/music_manifest": "assets/music_manifest.json"},
    }})
    write_json(ROOT / "conversion.json", {
        "source": "Workspace PvZ widescreen lawnbgm(*).mp3",
        "mapping": "bass.dll MO3 order table at VA 0x46dbdc, corroborated by debugs.txt",
        "processing": "Byte-for-byte copy; full-track loop; no transcoding or added stems",
        "tracks": tracks,
    })
    print(f"Imported {len(tracks)} widescreen BGM tracks into {ROOT}")


if __name__ == "__main__":
    main()
