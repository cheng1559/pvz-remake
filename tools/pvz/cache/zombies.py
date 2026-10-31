import math
from pathlib import Path
from typing import Any

from PIL import Image

from .packets import (
    ANIMATION_DIR,
    composite,
    logical_height,
    new_canvas,
    load_json,
    load_texture,
    paste_transformed,
    render_frame_to_matrix,
    sample_frames,
)


ATLAS_COLUMNS = 8
ZOMBIE_COUNT = 26
CELL_WIDTH = 76
CELL_HEIGHT = 76
CACHE_WIDTH = 200
CACHE_HEIGHT = 210
CACHE_BASE_X = 40.0
CACHE_BASE_Y = 40.0
ALMANAC_BASE_X = 1.0
ALMANAC_BASE_Y = -6.0
ALMANAC_SCALE = 0.5

from .. import ROOT
TEXTURE_DIR = ROOT / "mods/pvz-base/assets/images"
OUTPUT_PATH = TEXTURE_DIR / "zombie_previews_cached.png"

HIDDEN_BY_DEFAULT = {
    "anim_cone",
    "anim_bucket",
    "anim_screendoor",
    "Zombie_flaghand",
    "Zombie_duckytube",
    "anim_tongue",
    "Zombie_mustache",
    "Zombie_innerarm_screendoor",
    "Zombie_innerarm_screendoor_hand",
    "Zombie_outerarm_screendoor",
}

ZOMBIE_DEFINITIONS: dict[int, dict[str, Any]] = {
    0: {"animation": "zombie", "layer": "anim_idle"},
    1: {
        "animation": "zombie",
        "layer": "anim_idle",
        "show": ["Zombie_flaghand", "Zombie_innerarm_screendoor"],
        "hide": ["anim_innerarm1", "anim_innerarm2", "anim_innerarm3"],
        "flag": True,
        "previewOffset": (2.0, 10.0),
    },
    2: {"animation": "zombie", "layer": "anim_idle", "show": ["anim_cone"], "hidePrefix": ["anim_hair"], "previewOffset": (0.0, 12.0)},
    3: {"animation": "zombie_polevaulter", "layer": "anim_idle", "previewOffset": (2.0, -3.0)},
    4: {"animation": "zombie", "layer": "anim_idle", "show": ["anim_bucket"], "hidePrefix": ["anim_hair"], "previewOffset": (0.0, 9.0)},
    5: {"animation": "zombie_paper", "layer": "anim_idle"},
    6: {
        "animation": "zombie",
        "layer": "anim_idle",
        "show": [
            "anim_screendoor",
            "Zombie_innerarm_screendoor",
            "Zombie_innerarm_screendoor_hand",
            "Zombie_outerarm_screendoor",
        ],
        "hide": ["anim_innerarm1", "anim_innerarm2", "anim_innerarm3"],
        "hidePrefix": ["Zombie_outerarm_hand", "Zombie_outerarm_lower"],
    },
    7: {"animation": "zombie_football", "layer": "anim_idle",  "cacheOffset": (-10.0, -10.0), "previewOffset": (-8.0, 5.0)},
    8: {"animation": "zombie_disco", "layer": "anim_moonwalk", "cacheOffset": (0.0, 16.0), "previewScale": 0.8},
    9: {"animation": "zombie_backup", "layer": "anim_walk", "cacheOffset": (0.0, 16.0), "previewOffset": (-8.0, 5.0), "previewScale": 0.8},
    10: {"animation": "zombie", "layer": "anim_idle", "show": ["Zombie_duckytube"]},
    11: {"animation": "zombie_snorkle", "layer": "anim_idle", "previewOffset": (-10.0, 0.0)},
    12: {"animation": "zombie_zamboni", "layer": "anim_drive", "previewOffset": (0.0, 3.0)},
    13: {"animation": "zombie_bobsled", "layer": "anim_idle", "previewOffset": (0.0, -8.0)},
    14: {"animation": "zombie_dolphinrider", "layer": "anim_idle", "previewOffset": (-2.0, -10.0)},
    15: {"animation": "zombie_jackbox", "layer": "anim_idle"},
    16: {
        "animation": "zombie_balloon",
        "layer": "anim_idle",
        "extraLayers": [
            {
                "node": "propeller",
                "layer": "propeller",
                "offset": (0.0, -1.0),
            },
        ],
    },
    17: {"animation": "zombie_digger", "layer": "anim_idle"},
    18: {"animation": "zombie_pogo", "layer": "anim_pogo", "previewOffset": (0.0, -3.0)},
    19: {"animation": "zombie_yeti", "layer": "anim_idle", "previewOffset": (0.0, 4.0)},
    20: {"animation": "zombie_bungi", "layer": "anim_idle", "previewOffset": (-4.0, 3.0)},
    21: {"animation": "zombie_ladder", "layer": "anim_idle", "previewOffset": (0.0, -3.0)},
    22: {"animation": "zombie_catapult", "layer": "anim_idle", "previewOffset": (-24.0, -1.0)},
    23: {"animation": "zombie_gargantuar", "layer": "anim_idle", "cacheOffset": (0.0, 20.0), "previewOffset": (15.0, 17.0)},
    24: {"animation": "zombie_imp", "layer": "anim_walk", "previewOffset": (-8.0, -7.0)},
}


def get_anim_node(animation_json: dict[str, Any], node_name: str | None = None) -> dict[str, Any] | None:
    if node_name is not None:
        node = animation_json.get(node_name)
        if isinstance(node, dict) and "tracks" in node and "animations" in node:
            return node
        return None

    for value in animation_json.values():
        if isinstance(value, dict) and "tracks" in value and "animations" in value:
            return value
    return None


def is_track_hidden(track_name: str, definition: dict[str, Any]) -> bool:
    # Track lookups in Reanimation ignore case, as here.
    name = track_name.lower()
    shown = {track.lower() for track in definition.get("show", [])}
    hidden = {track.lower() for track in definition.get("hide", [])}
    hidden_prefixes = tuple(prefix.lower() for prefix in definition.get("hidePrefix", []))

    if name in hidden:
        return True
    if hidden_prefixes and name.startswith(hidden_prefixes):
        return True
    if name in shown:
        return False
    return name in {track.lower() for track in HIDDEN_BY_DEFAULT}


def sample_reanim_tracks(
    animation_json: dict[str, Any],
    layer_name: str,
    definition: dict[str, Any],
    node_name: str | None = None,
) -> list[dict[str, Any]]:
    node = get_anim_node(animation_json, node_name)
    if not node:
        if node_name is not None:
            print(f"[zombie-preview-cache] WARN: missing node {node_name}")
        return []
    animation = node.get("animations", {}).get(layer_name)
    if not animation:
        print(f"[zombie-preview-cache] WARN: missing layer {layer_name}")
        return []

    target_frame = animation["startFrame"]
    sampled: list[dict[str, Any]] = []
    for track_name, track in node.get("tracks", {}).items():
        if is_track_hidden(track_name, definition):
            continue
        frame = sample_frames(track.get("frames", []), target_frame)
        if not frame or not frame.get("image"):
            continue
        sampled.append({
            "z": track.get("zIndex", 0),
            "image": frame["image"],
            "alpha": frame.get("alpha", 1),
            "matrix": render_frame_to_matrix(frame),
        })

    sampled.sort(key=lambda item: item["z"])
    return sampled


def draw_reanim(
    canvas: Image.Image,
    animation_json: dict[str, Any],
    layer_name: str,
    x: float,
    y: float,
    definition: dict[str, Any],
    node_name: str | None = None,
) -> None:
    for item in sample_reanim_tracks(animation_json, layer_name, definition, node_name):
        local = item["matrix"]
        matrix = (
            local[0],
            local[1],
            local[2],
            local[3],
            x + local[4],
            y + local[5],
        )
        paste_transformed(canvas, load_texture(item["image"]), matrix, item["alpha"])


def render_boss_cache() -> Image.Image:
    cache = new_canvas(CACHE_WIDTH, CACHE_HEIGHT)
    boss = load_json(ANIMATION_DIR / "zombie_boss.json")
    # ReanimatorCache::MakeCachedZombieFrame draws the driver between the rear and front robot layers.
    draw_reanim(cache, boss, "anim_head_idle", -524.0, -88.0, {})
    draw_reanim(cache, load_json(ANIMATION_DIR / "zombie_boss_driver.json"), "anim_idle", 46.0, 22.0, {})
    # Reanimation::AssignRenderGroupToTrack matches names case-insensitively (Boss_neck, Boss_head2), as is_track_hidden does.
    draw_reanim(cache, boss, "anim_head_idle", -524.0, -88.0, {"hide": ["boss_body1", "boss_neck", "boss_head2"]})
    return cache


def render_zombie_cache(zombie_id: int) -> Image.Image:
    if zombie_id == 25:
        return render_boss_cache()
    definition = ZOMBIE_DEFINITIONS.get(zombie_id)
    cache = new_canvas(CACHE_WIDTH, CACHE_HEIGHT)
    if definition is None:
        return cache

    cache_offset_x, cache_offset_y = definition.get("cacheOffset", (0.0, 0.0))
    base_x = CACHE_BASE_X + cache_offset_x
    base_y = CACHE_BASE_Y + cache_offset_y

    if definition.get("flag"):
        flag_json = load_json(ANIMATION_DIR / "zombie_flagpole.json")
        draw_reanim(cache, flag_json, "Zombie_flag", base_x, base_y, {})

    animation_path = ANIMATION_DIR / f"{definition['animation']}.json"
    if not animation_path.exists():
        print(f"[zombie-preview-cache] WARN: missing animation json for zombie {zombie_id}: {animation_path}")
        return cache

    animation_json = load_json(animation_path)
    if zombie_id == 20:
        node = get_anim_node(animation_json)
        start = node["animations"][definition["layer"]]["startFrame"]
        body = sample_frames(node["tracks"]["Zombie_bungi_body"]["frames"], start)
        cord = load_texture("bungeecord")
        cord_height = logical_height(cord)
        y = base_y + body["y"] - cord_height
        while y > -cord_height:
            # Same body-local X position as the rendered portrait.
            paste_transformed(cache, cord, (1, 0, 0, 1, base_x + 38, y), 1.0)
            y -= cord_height
    draw_reanim(cache, animation_json, definition["layer"], base_x, base_y, definition)
    for extra_layer in definition.get("extraLayers", []):
        offset_x, offset_y = extra_layer.get("offset", (0.0, 0.0))
        draw_reanim(
            cache,
            animation_json,
            extra_layer["layer"],
            base_x + offset_x,
            base_y + offset_y,
            definition,
            extra_layer.get("node"),
        )
    return cache


def zombie_preview_matrix(zombie_id: int) -> tuple[float, ...]:
    definition = ZOMBIE_DEFINITIONS.get(zombie_id, {})
    offset_x, offset_y = definition.get("previewOffset", (0.0, 0.0))
    definition_scale = definition.get("previewScale", 1.0)
    preview_scale = ALMANAC_SCALE * definition_scale
    scale_offset_x = CACHE_WIDTH * ALMANAC_SCALE * (1.0 - definition_scale) * 0.5
    scale_offset_y = CACHE_HEIGHT * ALMANAC_SCALE * (1.0 - definition_scale) * 0.5
    return (
        preview_scale,
        0,
        0,
        preview_scale,
        ALMANAC_BASE_X + offset_x + scale_offset_x,
        ALMANAC_BASE_Y + offset_y + scale_offset_y,
    )


def render_zombie_preview(zombie_id: int) -> Image.Image:
    cell = new_canvas(CELL_WIDTH, CELL_HEIGHT)
    if zombie_id not in ZOMBIE_DEFINITIONS and zombie_id != 25:
        return cell
    paste_transformed(cell, render_zombie_cache(zombie_id), zombie_preview_matrix(zombie_id), 1.0)
    return cell


def generate(output: Path | None = None) -> None:
    output = output or OUTPUT_PATH
    rows = math.ceil(ZOMBIE_COUNT / ATLAS_COLUMNS)
    atlas = new_canvas(ATLAS_COLUMNS * CELL_WIDTH, rows * CELL_HEIGHT)
    for zombie_id in range(ZOMBIE_COUNT):
        cell = render_zombie_preview(zombie_id)
        composite(atlas, cell, zombie_id % ATLAS_COLUMNS * CELL_WIDTH, zombie_id // ATLAS_COLUMNS * CELL_HEIGHT)
    atlas.save(output)
    print(f"Wrote {output}")


if __name__ == "__main__":
    generate()
