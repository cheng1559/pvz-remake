import json
import uuid
from pathlib import Path
from typing import Any

from PIL import Image

from generate_packet_plant_cache import (
    ANIMATION_DIR,
    TEXTURE_DIR,
    load_json,
    load_texture,
    paste_transformed,
    render_frame_to_matrix,
    sample_frames,
)


OUTPUT_WIDTH = 90
OUTPUT_HEIGHT = 100
RENDER_SCALE = 0.85
DRAW_OFFSET_X = 10.0
DRAW_OFFSET_Y = 0.0

OUTPUT_PATH = TEXTURE_DIR / "lawnmower_cached.png"
OUTPUT_META_PATH = TEXTURE_DIR / "lawnmower_cached.png.meta"


def get_anim_node(animation_json: dict[str, Any]) -> dict[str, Any] | None:
    node = animation_json.get("default")
    if isinstance(node, dict) and "tracks" in node and "animations" in node:
        return node
    return None


def sample_lawnmower_tracks(animation_json: dict[str, Any]) -> list[dict[str, Any]]:
    node = get_anim_node(animation_json)
    if not node:
        print("[lawnmower-cache] WARN: missing default animation node")
        return []

    animation = node.get("animations", {}).get("anim_normal")
    if not animation:
        print("[lawnmower-cache] WARN: missing anim_normal layer")
        return []

    target_frame = animation["startFrame"]
    sampled: list[dict[str, Any]] = []
    for track_name, track in node.get("tracks", {}).items():
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


def render_lawnmower_cache() -> Image.Image:
    animation_path = ANIMATION_DIR / "lawnmower.json"
    animation_json = load_json(animation_path)
    canvas = Image.new("RGBA", (OUTPUT_WIDTH, OUTPUT_HEIGHT), (0, 0, 0, 0))

    for item in sample_lawnmower_tracks(animation_json):
        local = item["matrix"]
        matrix = (
            RENDER_SCALE * local[0],
            RENDER_SCALE * local[1],
            RENDER_SCALE * local[2],
            RENDER_SCALE * local[3],
            DRAW_OFFSET_X + RENDER_SCALE * local[4],
            DRAW_OFFSET_Y + RENDER_SCALE * local[5],
        )
        paste_transformed(canvas, load_texture(item["image"]), matrix, item["alpha"])

    return canvas


def write_meta() -> None:
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
                "displayName": "lawnmower_cached",
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
                "displayName": "lawnmower_cached",
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": OUTPUT_WIDTH,
                    "height": OUTPUT_HEIGHT,
                    "rawWidth": OUTPUT_WIDTH,
                    "rawHeight": OUTPUT_HEIGHT,
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
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    render_lawnmower_cache().save(OUTPUT_PATH)
    write_meta()
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
