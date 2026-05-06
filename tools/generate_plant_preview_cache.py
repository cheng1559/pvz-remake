import json
import math
import uuid
from pathlib import Path

from PIL import Image

from generate_packet_plant_cache import (
    ANIMATION_DIR,
    ANIMATION_NAMES,
    SEED_COUNT,
    load_json,
    render_plant_cache,
)


ATLAS_COLUMNS = 8
CELL_WIDTH = 220
CELL_HEIGHT = 160
COMMON_OFFSET_X = -40
COMMON_OFFSET_Y = -40

ROOT = Path(__file__).resolve().parents[1]
TEXTURE_DIR = ROOT / "assets/resources/textures"
OUTPUT_PATH = TEXTURE_DIR / "plant_previews_cached.png"
OUTPUT_META_PATH = TEXTURE_DIR / "plant_previews_cached.png.meta"


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
    cache, offset_x, offset_y = render_plant_cache(seed_id, animation_json, {"timeRatio": 0.0})
    cell.alpha_composite(cache, (offset_x - COMMON_OFFSET_X, offset_y - COMMON_OFFSET_Y))
    return cell


def write_meta() -> None:
    if OUTPUT_META_PATH.exists():
        return

    image_uuid = str(uuid.uuid4())
    width = ATLAS_COLUMNS * CELL_WIDTH
    height = math.ceil(SEED_COUNT / ATLAS_COLUMNS) * CELL_HEIGHT
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": image_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{image_uuid}@6c48a",
                "displayName": "plant_previews_cached",
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": image_uuid,
                    "isUuid": True,
                    "visible": False,
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": f"{image_uuid}@f9941",
                "displayName": "plant_previews_cached",
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": width,
                    "height": height,
                    "rawWidth": width,
                    "rawHeight": height,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{image_uuid}@6c48a",
                    "atlasUuid": "",
                    "trimType": "none",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": f"{image_uuid}@6c48a",
        },
    }
    OUTPUT_META_PATH.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    rows = math.ceil(SEED_COUNT / ATLAS_COLUMNS)
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT), (0, 0, 0, 0))
    for seed_id in range(SEED_COUNT):
        cel = render_seed(seed_id)
        x = seed_id % ATLAS_COLUMNS * CELL_WIDTH
        y = seed_id // ATLAS_COLUMNS * CELL_HEIGHT
        atlas.alpha_composite(cel, (x, y))
    atlas.save(OUTPUT_PATH)
    write_meta()
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
