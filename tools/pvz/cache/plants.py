import math
from pathlib import Path

from PIL import Image

from .packets import (
    ANIMATION_DIR,
    ANIMATION_NAMES,
    SEED_COUNT,
    load_json,
    render_plant_cache,
    style_for,
)


ATLAS_COLUMNS = 8
CELL_WIDTH = 220
CELL_HEIGHT = 160
COMMON_OFFSET_X = -40
COMMON_OFFSET_Y = -40

from .. import ROOT
TEXTURE_DIR = ROOT / "mods/pvz-base/assets/images"
OUTPUT_PATH = TEXTURE_DIR / "plant_previews_cached.png"


def render_seed(seed_id: int) -> Image.Image:
    animation_name = ANIMATION_NAMES.get(seed_id)
    cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    if animation_name is None:
        return cell

    animation_path = ANIMATION_DIR / f"{animation_name}.json"
    if not animation_path.exists():
        print(f"[plant-preview-cache] WARN: missing animation json for seed {seed_id}: {animation_path}")
        return cell

    animation_json = load_json(animation_path)
    cache, offset_x, offset_y = render_plant_cache(seed_id, animation_json, style_for(seed_id))
    cell.alpha_composite(cache, (offset_x - COMMON_OFFSET_X, offset_y - COMMON_OFFSET_Y))
    return cell


def generate() -> None:
    rows = math.ceil(SEED_COUNT / ATLAS_COLUMNS)
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT), (0, 0, 0, 0))
    for seed_id in range(SEED_COUNT):
        cel = render_seed(seed_id)
        x = seed_id % ATLAS_COLUMNS * CELL_WIDTH
        y = seed_id // ATLAS_COLUMNS * CELL_HEIGHT
        atlas.alpha_composite(cel, (x, y))
    atlas.save(OUTPUT_PATH)
    print(f"Wrote {OUTPUT_PATH}")
