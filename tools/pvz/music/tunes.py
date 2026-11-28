"""The original's tunes as module music resources: the game plays the original's tracker modules itself (libopenmpt),
so the import copies the modules and writes, for each tune, the parts Music::PlayMusic plays and the channels
Music::SetupMusicFileForTune leaves heard."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

# Tracker resource ID -> the original's file.
MODULES = {"mainmusic": "mainmusic.mo3", "mainmusic_hihats": "mainmusic_hihats.mo3"}


def part(module: str, order: int, *channels: tuple[int, int]) -> dict:
    """Music::PlayFromOffset of `module` from `order`; with `channels`, only those ranges heard."""
    entry = {"module": f"pvz:{module}", "order": order}
    if channels:
        entry["channels"] = [list(channel) for channel in channels]
    return entry


# Music::PlayMusic's start orders. Music::SetupMusicFileForTune sets its 29 tracks only for the day, pool, fog and roof
# tunes' three files, and otherwise leaves them all heard; track 29 is never set, and these tunes' orders have no notes in it.
TUNES = {
    "day_grasswalk": {
        "parts": {
            "main": part("mainmusic", 0x00, (0, 23)),
            "drums": part("mainmusic", 0x00, (24, 26)),
            "hihats": part("mainmusic_hihats", 0x00, (27, 27)),
        },
        "burstScheme": "day",
    },
    "night_moongrains": {
        "parts": {"main": part("mainmusic", 0x30), "drums": part("mainmusic", 0x5C)},
        "burstScheme": "night",
        # Music::UpdateMusicBurst: the drums start order 76 on an even order of the melody, 77 on an odd one.
        "drumsJumpOrders": [76, 77],
    },
    "choose_seeds": {"parts": {"main": part("mainmusic", 0x7A)}},
    "title_theme": {"parts": {"main": part("mainmusic", 0x98)}},
    "zen_garden": {"parts": {"main": part("mainmusic", 0xDD)}},
    "puzzle": {"parts": {"main": part("mainmusic", 0xB1)}},
    "minigame": {"parts": {"main": part("mainmusic", 0xA6)}},
    "conveyer": {"parts": {"main": part("mainmusic", 0xD4)}},
    "final_boss": {"parts": {"main": part("mainmusic", 0x9E)}},
}


def import_music(sounds: Path, modules_dir: Path, music_dir: Path) -> tuple[dict[str, Path], dict[str, Path]]:
    """Copies the modules and writes each tune (`pvz:<tune>`, schemaVersion 4); their files by resource ID."""
    modules_dir.mkdir(parents=True, exist_ok=True)
    music_dir.mkdir(parents=True, exist_ok=True)
    modules = {}
    for module, name in MODULES.items():
        source = sounds / name
        if not source.is_file():
            raise FileNotFoundError(f"Missing music module: {source}")
        modules[f"pvz:{module}"] = Path(shutil.copyfile(source, modules_dir / name))
    tunes = {}
    for tune, entry in TUNES.items():
        path = music_dir / f"{tune}.json"
        path.write_text(json.dumps({"schemaVersion": 4, "id": f"pvz:{tune}", **entry}, indent=2) + "\n", encoding="utf-8", newline="\n")
        tunes[f"pvz:{tune}"] = path
    return modules, tunes
