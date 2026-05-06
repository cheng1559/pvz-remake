import json
import math
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image


PACKET_WIDTH = 50
PACKET_HEIGHT = 70
ATLAS_COLUMNS = 8
SEED_COUNT = 49

ROOT = Path(__file__).resolve().parents[1]
ANIMATION_DIR = ROOT / "assets/resources/animations"
TEXTURE_DIR = ROOT / "assets/resources/textures"
OUTPUT_PATH = TEXTURE_DIR / "packet_plants_cached.png"
OUTPUT_META_PATH = TEXTURE_DIR / "packet_plants_cached.png.meta"

ANIMATION_NAMES: dict[int, str] = {
    0: "peashootersingle",
    1: "sunflower",
    2: "cherrybomb",
    3: "wallnut",
    4: "potatomine",
    5: "snowpea",
    6: "chomper",
    7: "peashooter",
    8: "puffshroom",
    9: "sunshroom",
    10: "fumeshroom",
    11: "gravebuster",
    12: "hypnoshroom",
    13: "scaredyshroom",
    14: "iceshroom",
    15: "doomshroom",
    16: "lilypad",
    17: "squash",
    18: "threepeater",
    19: "tanglekelp",
    20: "jalapeno",
    21: "caltrop",
    22: "torchwood",
    23: "tallnut",
    24: "seashroom",
    25: "plantern",
    26: "cactus",
    27: "blover",
    28: "splitpea",
    29: "starfruit",
    30: "pumpkin",
    31: "magnetshroom",
    32: "cabbagepult",
    33: "pot",
    34: "cornpult",
    35: "coffeebean",
    36: "garlic",
    37: "umbrellaleaf",
    38: "marigold",
    39: "melonpult",
    40: "gatlingpea",
    41: "twinsunflower",
    42: "gloomshroom",
    43: "cattail",
    44: "wintermelon",
    45: "goldmagnet",
    46: "spikerock",
    47: "cobcannon",
    48: "imitater",
}

DEFAULT_STYLE = {"x": 5.0, "y": -9.0, "scale": 0.5, "timeRatio": 0.0}
STYLES: dict[int, dict[str, float]] = {
    1: {"timeRatio": 0.15},
    10: {"x": 8.0, "y": -13.0, "scale": 0.4},
    11: {"x": 10.0, "y": -16.0, "scale": 0.4},
    12: {"x": 8.0, "y": -13.0, "scale": 0.4},
    15: {"x": 8.0, "y": -13.0, "scale": 0.4},
    17: {"x": 8.0, "y": -13.0, "scale": 0.4},
    19: {"x": 8.0, "y": -13.0, "scale": 0.4},
    21: {"x": 8.0, "y": -13.0, "scale": 0.4},
    22: {"x": 8.0, "y": -13.0, "scale": 0.4},
    25: {"x": 8.0, "y": -13.0, "scale": 0.4},
    26: {"x": 9.0, "y": -14.0},
    28: {"x": 12.0, "y": -13.0, "scale": 0.45},
    29: {"x": 6.0, "y": -9.0},
    31: {"y": -13.0},
    32: {"x": 15.0, "y": -15.0, "scale": 0.4},
    34: {"x": 13.0, "y": -15.0, "scale": 0.4},
    35: {"x": 0.0, "y": -10.0, "scale": 0.55},
    39: {"x": 18.0, "y": -20.0, "scale": 0.35},
    40: {"x": 2.0, "y": -9.0},
    42: {"x": 7.0, "y": -15.0, "scale": 0.45},
    43: {"x": 8.0, "y": -14.0, "scale": 0.45},
}

NODE_CONFIGS: dict[int, dict[str, Any]] = {
    0: {"nodes": ["body", "head"], "attachments": [("head", "body", "anim_stem")]},
    5: {"nodes": ["body", "head"], "attachments": [("head", "body", "anim_stem")]},
    7: {"nodes": ["body", "head"], "attachments": [("head", "body", "anim_stem")]},
    18: {
        "nodes": ["body", "head1", "head2", "head3"],
        "attachments": [
            ("head1", "body", "anim_head1"),
            ("head2", "body", "anim_head2"),
            ("head3", "body", "anim_head3"),
        ],
    },
    28: {
        "nodes": ["body", "head", "backHead"],
        "attachments": [
            ("head", "body", "anim_idle"),
            ("backHead", "body", "anim_idle"),
        ],
    },
    40: {"nodes": ["body", "head"], "attachments": [("head", "body", "anim_idle")]},
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def style_for(seed_id: int) -> dict[str, float]:
    style = DEFAULT_STYLE.copy()
    style.update(STYLES.get(seed_id, {}))
    return style


def get_animation_name(node_data: dict[str, Any]) -> str | None:
    names = list(node_data.get("animations", {}).keys())
    for candidate in names:
        if candidate == "anim_idle":
            return candidate
    for candidate in names:
        if "head_idle" in candidate:
            return candidate
    for candidate in names:
        if "idle" in candidate:
            return candidate
    for candidate in names:
        if "blink" not in candidate.lower():
            return candidate
    return names[0] if names else None


def get_animation_name_for_seed(seed_id: int, node_data: dict[str, Any]) -> str | None:
    if seed_id == 4 and "anim_armed" in node_data.get("animations", {}):
        return "anim_armed"
    if seed_id == 19 and "anim_idle_aquarium" in node_data.get("animations", {}):
        return "anim_idle_aquarium"
    return get_animation_name(node_data)


def sample_frames(frames: list[dict[str, Any]], target_frame: float) -> dict[str, Any] | None:
    if not frames or target_frame > frames[-1]["frameIndex"]:
        return None

    left_index = -1
    for index, frame in enumerate(frames):
        if frame["frameIndex"] <= target_frame:
            left_index = index
        else:
            break
    if left_index < 0:
        return None

    left = frames[left_index]
    if left_index + 1 >= len(frames):
        return dict(left)

    right = frames[left_index + 1]
    span = right["frameIndex"] - left["frameIndex"]
    if span <= 0:
        return dict(left)

    ratio = (target_frame - left["frameIndex"]) / span
    result = {}
    for key in ("frameIndex", "x", "y", "sx", "sy", "kx", "ky", "alpha"):
        if key in left:
            result[key] = left[key] + (right[key] - left[key]) * ratio
    result["image"] = left.get("image") if ratio < 0.5 else right.get("image")
    return result


def frame_to_matrix(frame: dict[str, Any]) -> tuple[float, float, float, float, float, float]:
    rkx = -math.radians(frame["kx"])
    rky = -math.radians(frame["ky"])
    return (
        frame["sx"] * math.cos(rkx),
        frame["sx"] * math.sin(rkx),
        -frame["sy"] * math.sin(rky),
        frame["sy"] * math.cos(rky),
        frame["x"],
        -frame["y"],
    )


def matrix_to_frame(
    matrix: tuple[float, float, float, float, float, float],
    base: dict[str, Any],
) -> dict[str, Any]:
    a, b, c, d, tx, ty = matrix
    sx = math.sqrt(a * a + b * b)
    sy = math.sqrt(c * c + d * d)
    kx = -math.degrees(math.atan2(b, a))
    ky = -math.degrees(math.atan2(-c, d))

    det = a * d - b * c
    if det < 0:
        sy = -sy
        ky += 180

    return {
        **base,
        "x": tx,
        "y": -ty,
        "sx": sx,
        "sy": sy,
        "kx": kx,
        "ky": ky,
    }


def multiply_matrix(
    left: tuple[float, float, float, float, float, float],
    right: tuple[float, float, float, float, float, float],
) -> tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, tx1, ty1 = left
    a2, b2, c2, d2, tx2, ty2 = right
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * tx2 + c1 * ty2 + tx1,
        b1 * tx2 + d1 * ty2 + ty1,
    )


def invert_matrix(matrix: tuple[float, float, float, float, float, float]) -> tuple[float, float, float, float, float, float]:
    a, b, c, d, tx, ty = matrix
    det = a * d - b * c
    if abs(det) < 1e-8:
        return (1, 0, 0, 1, 0, 0)
    inv_a = d / det
    inv_b = -b / det
    inv_c = -c / det
    inv_d = a / det
    return (
        inv_a,
        inv_b,
        inv_c,
        inv_d,
        -(inv_a * tx + inv_c * ty),
        -(inv_b * tx + inv_d * ty),
    )


def sample_slot(node_data: dict[str, Any], slot: str, anim_data: dict[str, Any], time: float) -> dict[str, Any] | None:
    slot_data = node_data.get("slots", {}).get(slot)
    if not slot_data:
        return None
    return sample_frames(slot_data.get("frames", []), anim_data["startFrame"] + time)


def compute_slot_matrix(
    node_states: dict[str, dict[str, Any]],
    node_name: str,
    slot: str,
) -> tuple[float, float, float, float, float, float]:
    state = node_states[node_name]
    slot_data = state["data"].get("slots", {}).get(slot)
    if not slot_data or not slot_data.get("frames"):
        return (1, 0, 0, 1, 0, 0)

    base = frame_to_matrix(slot_data["frames"][0])
    current_frame = sample_slot(state["data"], slot, state["anim"], state["time"])
    if not current_frame:
        return (1, 0, 0, 1, 0, 0)

    current = frame_to_matrix(current_frame)
    delta = multiply_matrix(current, invert_matrix(base))
    parent = state.get("parent")
    if parent:
        parent_name, parent_slot = parent
        delta = multiply_matrix(compute_slot_matrix(node_states, parent_name, parent_slot), delta)
    return delta


def apply_parent_transform(
    frame: dict[str, Any],
    parent_matrix: tuple[float, float, float, float, float, float],
) -> dict[str, Any]:
    transformed = multiply_matrix(parent_matrix, frame_to_matrix(frame))
    return matrix_to_frame(transformed, frame)


def render_frame_to_matrix(frame: dict[str, Any]) -> tuple[float, float, float, float, float, float]:
    skew_diff = frame["kx"] - frame["ky"]
    skew_rad = math.radians(skew_diff)
    cos_skew = math.cos(skew_rad)
    safe_cos = 0.001 if abs(cos_skew) < 0.001 else cos_skew

    scale_x = frame["sx"]
    scale_y = frame["sy"] * safe_cos

    applied_skew = skew_diff
    if abs(scale_x) > 0.0001:
        skew_tan = math.tan(skew_rad)
        applied_tan = skew_tan * (scale_y / scale_x)
        applied_skew = math.degrees(math.atan(applied_tan))

    def transform(source_x: float, source_y: float) -> tuple[float, float]:
        x = source_x * scale_x
        y = -source_y * scale_y
        x += math.tan(math.radians(-applied_skew)) * y

        angle = math.radians(-frame["kx"])
        cos_val = math.cos(angle)
        sin_val = math.sin(angle)
        world_x = frame["x"] + cos_val * x - sin_val * y
        world_y = -frame["y"] + sin_val * x + cos_val * y
        return world_x, -world_y

    origin = transform(0, 0)
    x_axis = transform(1, 0)
    y_axis = transform(0, 1)
    return (
        x_axis[0] - origin[0],
        x_axis[1] - origin[1],
        y_axis[0] - origin[0],
        y_axis[1] - origin[1],
        origin[0],
        origin[1],
    )


def sample_tracks(animation_json: dict[str, Any], seed_id: int, style: dict[str, float]) -> list[dict[str, Any]]:
    config = NODE_CONFIGS.get(seed_id, {"nodes": ["body"], "attachments": []})
    node_states: dict[str, dict[str, Any]] = {}

    for node_name in config["nodes"]:
        node_data = animation_json.get(node_name)
        if not node_data:
            continue
        anim_name = get_animation_name_for_seed(seed_id, node_data)
        if not anim_name:
            continue
        anim_data = node_data["animations"][anim_name]
        time = max(0, anim_data["duration"] - 1) * style["timeRatio"]
        node_states[node_name] = {"data": node_data, "anim": anim_data, "time": time}

    for child, parent, slot in config.get("attachments", []):
        if child in node_states and parent in node_states:
            node_states[child]["parent"] = (parent, slot)

    sampled: list[dict[str, Any]] = []
    for node_name, state in node_states.items():
        parent = state.get("parent")

        target_frame = state["anim"]["startFrame"] + state["time"]
        for track_name, track in state["data"].get("tracks", {}).items():
            if "blink" in track_name.lower() or track_name == "anim_waterline":
                continue
            frame = sample_frames(track.get("frames", []), target_frame)
            if not frame or not frame.get("image"):
                continue
            if parent:
                frame = apply_parent_transform(frame, compute_slot_matrix(node_states, parent[0], parent[1]))
            sampled.append({
                "z": track.get("zIndex", 0),
                "image": frame["image"],
                "alpha": frame.get("alpha", 1),
                "matrix": render_frame_to_matrix(frame),
            })

    sampled.sort(key=lambda item: item["z"])
    return sampled


def sand_alpha_edges(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    width, height = source.size
    pixels = source.load()
    result = source.copy()
    result_pixels = result.load()

    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] != 0:
                continue

            red = 0
            green = 0
            blue = 0
            count = 0
            for row_offset in (-1, 1):
                sample_y = y + row_offset
                if sample_y < 0 or sample_y >= height:
                    continue
                for column_offset in (-1, 0, 1):
                    sample_x = x + column_offset
                    if sample_x < 0 or sample_x >= width:
                        continue
                    sample = pixels[sample_x, sample_y]
                    if sample[3] == 0:
                        continue
                    red += sample[0]
                    green += sample[1]
                    blue += sample[2]
                    count += 1

            if count > 0:
                result_pixels[x, y] = (red // count, green // count, blue // count, 0)

    return result


@lru_cache(maxsize=None)
def load_texture(name: str) -> Image.Image:
    path = TEXTURE_DIR / f"{name}.png"
    if not path.exists():
        raise FileNotFoundError(path)
    return sand_alpha_edges(Image.open(path))


def paste_transformed(canvas: Image.Image, source: Image.Image, matrix: tuple[float, float, float, float, float, float], alpha: float):
    sampled_matrix = (
        matrix[0],
        matrix[1],
        matrix[2],
        matrix[3],
        matrix[4] - 0.5,
        matrix[5] - 0.5,
    )
    inv = invert_matrix(sampled_matrix)
    transformed = source.transform(
        canvas.size,
        Image.Transform.AFFINE,
        (inv[0], inv[2], inv[4], inv[1], inv[3], inv[5]),
        resample=Image.Resampling.BILINEAR,
    )
    if alpha < 1:
        r, g, b, a = transformed.split()
        a = a.point(lambda value: int(value * alpha))
        transformed = Image.merge("RGBA", (r, g, b, a))
    canvas.alpha_composite(transformed)


def get_plant_image_size(seed_id: int) -> tuple[int, int, int, int]:
    offset_x = -20
    offset_y = -20
    width = 120
    height = 120

    if seed_id == 23:
        offset_y = -40
        height += 40
    elif seed_id in (39, 44):
        offset_x = -40
        width += 40
    elif seed_id == 47:
        width += 80

    return offset_x, offset_y, width, height


def get_cache_render_params(seed_id: int, offset_x: int, offset_y: int) -> tuple[float, float, float]:
    if seed_id == 4:
        return -(offset_x - 12.0), -(offset_y - 12.0), 0.85
    if seed_id == 35:
        return -(offset_x - 12.0), -(offset_y - 12.0), 0.8
    return -offset_x, -offset_y + (5.0 if seed_id == 48 else 0.0), 1.0


def render_plant_cache(seed_id: int, animation_json: dict[str, Any], style: dict[str, float]) -> tuple[Image.Image, int, int]:
    offset_x, offset_y, width, height = get_plant_image_size(seed_id)
    base_x, base_y, render_scale = get_cache_render_params(seed_id, offset_x, offset_y)
    cache = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    for item in sample_tracks(animation_json, seed_id, style):
        local = item["matrix"]
        matrix = (
            render_scale * local[0],
            render_scale * local[1],
            render_scale * local[2],
            render_scale * local[3],
            base_x + render_scale * local[4],
            base_y + render_scale * local[5],
        )
        paste_transformed(cache, load_texture(item["image"]), matrix, item["alpha"])

    return cache, offset_x, offset_y


def render_seed(seed_id: int) -> Image.Image:
    animation_name = ANIMATION_NAMES[seed_id]
    animation_json = load_json(ANIMATION_DIR / f"{animation_name}.json")
    style = style_for(seed_id)
    canvas = Image.new("RGBA", (PACKET_WIDTH, PACKET_HEIGHT), (0, 0, 0, 0))
    cache, offset_x, offset_y = render_plant_cache(seed_id, animation_json, style)
    scale = style["scale"]
    matrix = (
        scale,
        0,
        0,
        scale,
        style["x"] + offset_x * scale,
        -style["y"] + offset_y * scale,
    )
    paste_transformed(canvas, cache, matrix, 1.0)

    return canvas


def write_meta():
    if OUTPUT_META_PATH.exists():
        return

    image_uuid = str(uuid.uuid4())
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
                "displayName": "packet_plants_cached",
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
                "displayName": "packet_plants_cached",
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": ATLAS_COLUMNS * PACKET_WIDTH,
                    "height": math.ceil(SEED_COUNT / ATLAS_COLUMNS) * PACKET_HEIGHT,
                    "rawWidth": ATLAS_COLUMNS * PACKET_WIDTH,
                    "rawHeight": math.ceil(SEED_COUNT / ATLAS_COLUMNS) * PACKET_HEIGHT,
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


def main():
    rows = math.ceil(SEED_COUNT / ATLAS_COLUMNS)
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * PACKET_WIDTH, rows * PACKET_HEIGHT), (0, 0, 0, 0))
    for seed_id in range(SEED_COUNT):
        cel = render_seed(seed_id)
        x = seed_id % ATLAS_COLUMNS * PACKET_WIDTH
        y = seed_id // ATLAS_COLUMNS * PACKET_HEIGHT
        atlas.alpha_composite(cel, (x, y))
    atlas.save(OUTPUT_PATH)
    write_meta()
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
