import math
from pathlib import Path

from PIL import Image

from .packets import (
    ANIMATION_DIR,
    composite,
    new_canvas,
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
    cell = new_canvas(CELL_WIDTH, CELL_HEIGHT)
    if animation_name is None:
        return cell

    animation_path = ANIMATION_DIR / f"{animation_name}.json"
    if not animation_path.exists():
        print(f"[plant-preview-cache] WARN: missing animation json for seed {seed_id}: {animation_path}")
        return cell

    animation_json = load_json(animation_path)
    cache, offset_x, offset_y = render_plant_cache(seed_id, animation_json, style_for(seed_id))
    composite(cell, cache, offset_x - COMMON_OFFSET_X, offset_y - COMMON_OFFSET_Y)
    return cell


def generate(output: Path | None = None) -> None:
    output = output or OUTPUT_PATH
    rows = math.ceil(SEED_COUNT / ATLAS_COLUMNS)
    atlas = new_canvas(ATLAS_COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT)
    for seed_id in range(SEED_COUNT):
        cel = render_seed(seed_id)
        composite(atlas, cel, seed_id % ATLAS_COLUMNS * CELL_WIDTH, seed_id // ATLAS_COLUMNS * CELL_HEIGHT)
    atlas.save(output)
    print(f"Wrote {output}")
