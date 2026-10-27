"""PvZ PAK import and resource conversion helpers."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE_MOD = ROOT / 'mods/pvz-base'
ANIMATION_CONFIG = Path(__file__).with_name('anim_defs.json')
