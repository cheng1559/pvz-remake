import hashlib
import json
import re
from xml.etree import ElementTree
from pathlib import Path
from typing import Any

from sprite_texture_preprocessor import (
    get_alpha_companion_name,
    get_output_name,
    is_alpha_companion_name,
    select_image_resources,
    write_preprocessed_resource,
)


QUALIFIED_ID = re.compile(r"^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$")


def get_float(xml_elem: ElementTree.Element, tag: str) -> float | None:
    node = xml_elem.find(tag)
    if node is not None and node.text and node.text.strip():
        try:
            return float(node.text)
        except ValueError:
            return None
    return None


def get_string(xml_elem: ElementTree.Element, tag: str) -> str | None:
    node = xml_elem.find(tag)
    if node is not None and node.text:
        return node.text.strip()
    return None


def load_json_config(config_dir: Path) -> dict[str, Any]:
    file_path = config_dir / 'anim_defs.json'
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_anim_xml(xml_dir: Path, anim_name: str) -> ElementTree.Element:
    file_path = xml_dir / f"{anim_name}.reanim"
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        raw = f.read()
    root = ElementTree.fromstring(f"<root>{raw}</root>")
    return root


def parse_track_data(
    track_node: ElementTree.Element,
    include_inactive: bool = False,
) -> tuple[str, int, list[dict[str, Any]]]:
    name_node = track_node.find('name')
    if name_node is None or name_node.text is None:
        raise ValueError(
            "Track is missing required <name> element or it has no text")
    name = name_node.text.strip()
    if not name:
        raise ValueError("Track name must not be empty")

    curr = {
        'x': 0.0, 'y': 0.0, 'sx': 1.0, 'sy': 1.0,
        'kx': 0.0, 'ky': 0.0, 'alpha': 1.0, 'image': None,
        'frameIndex': 0
    }
    is_active = True
    frames = []
    t_nodes = track_node.findall('t')
    duration = len(t_nodes)

    if duration > 0:
        f_init = get_float(t_nodes[0], 'f')
        if f_init == -1:
            is_active = False

    for i, frame_node in enumerate(t_nodes):
        curr['frameIndex'] = i

        f_val = get_float(frame_node, 'f')
        if f_val == 0:
            is_active = True
        elif f_val == -1:
            is_active = False

        def update_tag(tag, key):
            val = get_float(frame_node, tag)
            if val is not None:
                curr[key] = val

        update_tag('x', 'x')
        update_tag('y', 'y')
        update_tag('sx', 'sx')
        update_tag('sy', 'sy')
        update_tag('kx', 'kx')
        update_tag('ky', 'ky')
        update_tag('a', 'alpha')

        val_i = get_string(frame_node, 'i')
        if val_i is not None:
            if not val_i.startswith('IMAGE_REANIM_'):
                raise ValueError(f"Unexpected image format: {val_i}")
            curr['image'] = val_i.replace('IMAGE_REANIM_', '', 1).lower()

        if is_active:
            frames.append(curr.copy())
        elif include_inactive:
            hidden = curr.copy()
            hidden['image'] = None
            frames.append(hidden)

    return name, duration, frames


def build_reanim_v2(
    source: Path,
    content_id: str,
    available_sprites: set[str],
    namespace: str = "pvz",
) -> dict[str, Any]:
    """Convert one Reanim file to the small, runtime-independent v2 format."""
    if not QUALIFIED_ID.fullmatch(content_id):
        raise ValueError(f"invalid reanim id: {content_id}")

    root = ElementTree.fromstring(f"<root>{source.read_text(encoding='utf-8')}</root>")
    fps_text = root.findtext("fps", "12")
    try:
        fps = int(fps_text)
    except ValueError as error:
        raise ValueError(f"invalid fps: {fps_text}") from error
    if fps <= 0:
        raise ValueError("fps must be positive")

    duration: int | None = None
    tracks: list[dict[str, Any]] = []
    track_ids: set[str] = set()
    missing_sprites: set[str] = set()
    for z_index, track_node in enumerate(root.findall("track")):
        track_id, track_duration, frames = parse_track_data(track_node, include_inactive=True)
        if track_id in track_ids:
            raise ValueError(f"duplicate track id: {track_id}")
        track_ids.add(track_id)
        if duration is None:
            duration = track_duration
        elif duration != track_duration:
            raise ValueError(
                f"track '{track_id}' has duration {track_duration}, expected {duration}"
            )

        keyframes = []
        for frame in frames:
            if not 0 <= frame["alpha"] <= 1:
                raise ValueError(f"track '{track_id}' alpha must be between 0 and 1")
            sprite = f"{namespace}:{frame['image']}" if frame["image"] else None
            if sprite is not None and sprite not in available_sprites:
                missing_sprites.add(sprite)
            keyframes.append({
                "timeSeconds": frame["frameIndex"] / fps,
                "x": frame["x"],
                "y": frame["y"],
                "scaleX": frame["sx"],
                "scaleY": frame["sy"],
                "skewX": frame["kx"],
                "skewY": frame["ky"],
                "alpha": frame["alpha"],
                "sprite": sprite,
                "interpolation": "linear",
            })
        if keyframes:
            tracks.append({"id": track_id, "zIndex": z_index, "keyframes": keyframes})

    if duration is None:
        raise ValueError("reanim has no tracks")
    if duration == 0 or not tracks:
        raise ValueError("reanim has no active frames")
    if missing_sprites:
        raise ValueError(f"missing sprite references: {', '.join(sorted(missing_sprites))}")
    return {
        "schemaVersion": 2,
        "id": content_id,
        "durationSeconds": duration / fps,
        "tracks": tracks,
    }


def write_reanim_v2(
    source: Path,
    output: Path,
    content_id: str,
    available_sprites: set[str],
    namespace: str = "pvz",
) -> str:
    payload = json.dumps(
        build_reanim_v2(source, content_id, available_sprites, namespace),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    payload += b"\n"
    output.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def warn_missing_track(anim_name: str, node_name: str, track_name: str, usage: str) -> None:
    print(
        f"[reanim] WARN: {anim_name}.{node_name} {usage} track '{track_name}' "
        "not found; skipping it"
    )


def get_animation_data(
    tracks: dict[str, dict[str, Any]],
    source_anim_name: str,
    node_name: str,
    anim_name: str,
    fps: int,
) -> dict[str, Any] | None:
    anim_track = tracks.get(anim_name)
    if anim_track is None:
        warn_missing_track(source_anim_name, node_name, anim_name, "animation")
        return None

    start_frame, end_frame = None, None
    for frame in anim_track['frames']:
        if frame is not None:
            if start_frame is None:
                start_frame = frame['frameIndex']
            end_frame = frame['frameIndex']

    if start_frame is None or end_frame is None:
        print(
            f"[reanim] WARN: {source_anim_name}.{node_name} animation track "
            f"'{anim_name}' has no active frames; skipping it"
        )
        return None

    return {
        'fps': fps,
        'duration': end_frame - start_frame + 1,
        'startFrame': start_frame,
        'endFrame': end_frame,
    }


def get_slot_data(
    tracks: dict[str, dict[str, Any]],
    source_anim_name: str,
    node_name: str,
    slot_name: str,
) -> dict[str, Any] | None:
    slot_track = tracks.get(slot_name)
    if slot_track is None:
        warn_missing_track(source_anim_name, node_name, slot_name, "slot")
        return None
    return {
        'frames': [
            {
                'frameIndex': frame['frameIndex'],
                'x': frame['x'],
                'y': frame['y'],
                'sx': frame['sx'],
                'sy': frame['sy'],
                'kx': frame['kx'],
                'ky': frame['ky'],
            }
            for frame in slot_track['frames']
        ]
    }


def get_anim_nodes(
    source_anim_name: str,
    anim_info: dict[str, Any],
    anim_xml: ElementTree.Element,
) -> dict[str, Any]:
    fps_node = anim_xml.find('fps')
    fps = int(fps_node.text) if fps_node is not None and fps_node.text else 12

    tracks: dict[str, dict[str, Any]] = {}
    anim_duration = None

    def unique_track_name(track_name: str) -> str:
        if track_name not in tracks:
            return track_name

        index = 2
        while f"{track_name}_{index}" in tracks:
            index += 1
        return f"{track_name}_{index}"

    for z, t_node in enumerate(anim_xml.findall('track')):
        track_name, track_duration, track_frames = parse_track_data(t_node)
        resolved_track_name = unique_track_name(track_name)
        tracks[resolved_track_name] = {
            'frames': track_frames,
            'zIndex': z
        }
        if anim_duration is None:
            anim_duration = track_duration
        elif track_duration != anim_duration:
            raise ValueError(
                f"Track '{track_name}' has duration {track_duration} which differs from expected {anim_duration}.")

    if anim_duration is None:
        raise ValueError(
            "No tracks found in XML, cannot determine animation duration.")

    anim_nodes = {}
    for node_name, node_info in anim_info.items():
        anim_names = node_info.get('animations', [])
        slot_names = node_info.get('slots', [])

        animations = {}
        for anim_name in anim_names:
            anim_data = get_animation_data(
                tracks,
                source_anim_name,
                node_name,
                anim_name,
                fps,
            )
            if anim_data is not None:
                animations[anim_name] = anim_data

        if not animations:
            animations = {
                'default': {
                    'fps': fps,
                    'duration': anim_duration,
                    'startFrame': 0,
                    'endFrame': anim_duration - 1
                }
            }
        slots = {}
        for slot_name in slot_names:
            slot_data = get_slot_data(
                tracks,
                source_anim_name,
                node_name,
                slot_name,
            )
            if slot_data is not None:
                slots[slot_name] = slot_data

        anim_ranges = [
            (anim_data['startFrame'], anim_data['endFrame'])
            for anim_data in animations.values()
        ]

        def filter_frames_in_range(track_data: dict[str, Any]) -> list[dict[str, Any]]:
            filtered = []
            for frame in track_data['frames']:
                fi = frame['frameIndex']
                for start, end in anim_ranges:
                    if start <= fi <= end:
                        filtered.append(frame)
                        break
            return filtered

        related_tracks = {}
        for k, v in tracks.items():
            filtered = filter_frames_in_range(v)
            if filtered:
                related_tracks[k] = {
                    'frames': filtered,
                    'zIndex': v['zIndex']
                }

        anim_nodes[node_name] = {
            'animations': animations,
            'slots': slots,
            'tracks': related_tracks
        }

    return anim_nodes


def build_reanim_clip_v2(
    source: Path,
    anim_info: dict[str, Any],
    node_id: str,
    clip_id: str,
    content_id: str,
    available_sprites: set[str],
    namespace: str = "pvz",
) -> dict[str, Any]:
    if not QUALIFIED_ID.fullmatch(content_id):
        raise ValueError(f"invalid reanim id: {content_id}")
    root = ElementTree.fromstring(f"<root>{source.read_text(encoding='utf-8')}</root>")
    nodes = get_anim_nodes(source.stem, anim_info, root)
    node = nodes.get(node_id)
    if node is None:
        raise ValueError(f"unknown reanim node: {node_id}")
    clip = node["animations"].get(clip_id)
    if clip is None:
        raise ValueError(f"unknown reanim clip: {node_id}/{clip_id}")

    fps = clip["fps"]
    start = clip["startFrame"]
    end = clip["endFrame"]
    tracks = []
    missing_sprites: set[str] = set()
    for track_id, track in sorted(node["tracks"].items(), key=lambda item: (item[1]["zIndex"], item[0])):
        if any(track_id.startswith(prefix) for prefix in anim_info[node_id].get("hiddenTrackPrefixes", [])):
            continue
        frames = [frame for frame in track["frames"] if start <= frame["frameIndex"] <= end]
        if not frames:
            continue
        keyframes = []
        previous = None
        for frame in frames:
            if previous is not None and frame["frameIndex"] > previous["frameIndex"] + 1:
                keyframes.append(_legacy_frame_v2(previous, previous["frameIndex"] + 1, start, fps, None))
            sprite = f"{namespace}:{frame['image']}" if frame["image"] else None
            if sprite is not None and sprite not in available_sprites:
                missing_sprites.add(sprite)
            keyframes.append(_legacy_frame_v2(frame, frame["frameIndex"], start, fps, sprite))
            previous = frame
        if previous is not None and previous["frameIndex"] < end:
            keyframes.append(_legacy_frame_v2(previous, previous["frameIndex"] + 1, start, fps, None))
        tracks.append({"id": track_id, "zIndex": track["zIndex"], "keyframes": keyframes})

    if missing_sprites:
        raise ValueError(f"missing sprite references: {', '.join(sorted(missing_sprites))}")
    return {
        "schemaVersion": 2,
        "id": content_id,
        "durationSeconds": (end - start + 1) / fps,
        "tracks": tracks,
    }


def write_reanim_clip_v2(
    source: Path,
    output: Path,
    anim_info: dict[str, Any],
    node_id: str,
    clip_id: str,
    content_id: str,
    available_sprites: set[str],
    namespace: str = "pvz",
) -> str:
    data = build_reanim_clip_v2(
        source, anim_info, node_id, clip_id, content_id, available_sprites, namespace
    )
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode() + b"\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()


def _legacy_frame_v2(
    frame: dict[str, Any],
    frame_index: int,
    start_frame: int,
    fps: int,
    sprite: str | None,
) -> dict[str, Any]:
    return {
        "timeSeconds": (frame_index - start_frame) / fps,
        "x": frame["x"],
        "y": frame["y"],
        "scaleX": frame["sx"],
        "scaleY": frame["sy"],
        "skewX": frame["kx"],
        "skewY": frame["ky"],
        "alpha": frame["alpha"],
        "sprite": sprite,
        "interpolation": "linear",
    }


def save_anim_data(output_dir: Path, anim_name: str, anim_nodes: dict[str, Any]):
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / f"{anim_name}.json", 'w') as f:
        json.dump(anim_nodes, f, separators=(',', ':'))
    node_names = ', '.join(anim_nodes.keys())
    print(f"[reanim]   Nodes: {node_names}")
    print(f"[reanim] Wrote: {output_dir / f'{anim_name}.json'}")


def copy_textures(xml_dir: Path, texture_dir: Path):
    """Copy all image files from xml_dir to texture_dir."""
    texture_dir.mkdir(parents=True, exist_ok=True)

    resources = select_image_resources(xml_dir)
    copied = 0
    skipped = 0
    for resource_name, src in sorted(resources.items()):
        if is_alpha_companion_name(resource_name) and resource_name[:-1] in resources:
            continue
        alpha_src = resources.get(get_alpha_companion_name(resource_name))
        dst_name = get_output_name(src, resource_name, force_png=alpha_src is not None)
        dst = texture_dir / dst_name
        if write_preprocessed_resource(src, dst, resource_name=resource_name, alpha_src=alpha_src):
            print(f"[reanim] Wrote: {dst}")
            copied += 1
        else:
            skipped += 1

    print(f"[reanim] Textures: {copied} copied, {skipped} skipped")


def main():
    config_dir = Path("./tools")
    xml_dir = Path("./tools/raw/reanim")
    output_dir = Path("./assets/resources/animations")
    texture_dir = Path("./assets/resources/textures")

    anim_defs = load_json_config(config_dir)

    for anim_name, anim_info in anim_defs.items():
        print(f"[reanim] Processing: {anim_name}")

        anim_xml = load_anim_xml(xml_dir, anim_name)
        anim_nodes = get_anim_nodes(anim_name, anim_info, anim_xml)
        save_anim_data(output_dir, anim_name, anim_nodes)

    copy_textures(xml_dir, texture_dir)


if __name__ == "__main__":
    main()
