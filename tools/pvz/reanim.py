import json
import re
from xml.etree import ElementTree
from pathlib import Path
from typing import Any

from .images import content_sprite_name


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


def load_animation_config(path: Path | None = None) -> dict[str, Any]:
    from . import ANIMATION_CONFIG
    return json.loads((path or ANIMATION_CONFIG).read_text(encoding='utf-8'))


def load_anim_xml(xml_dir: Path, anim_name: str) -> ElementTree.Element:
    file_path = xml_dir / f"{anim_name}.reanim"
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        raw = f.read()
    root = ElementTree.fromstring(f"<root>{raw}</root>")
    return root


def parse_track_data(track_node: ElementTree.Element) -> tuple[str, int, list[dict[str, Any]]]:
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
            # Match the converted file names, e.g. 'Tanglekelp_arm 8' -> tanglekelp_arm_8.png.
            curr['image'] = content_sprite_name(val_i.replace('IMAGE_REANIM_', '', 1))

        if is_active:
            frames.append(curr.copy())

    return name, duration, frames


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


def resolve_animation_config(config: dict[str, Any], xml: ElementTree.Element) -> dict[str, Any]:
    markers = [track.findtext('name') for track in xml.findall('track')
               if (track.findtext('name') or '').startswith('anim_')]
    return {name: {'slots': [], 'animations': list(markers), **settings}
            for name, settings in config.items()}


def get_anim_nodes(
    source_anim_name: str,
    anim_info: dict[str, Any],
    anim_xml: ElementTree.Element,
) -> dict[str, Any]:
    anim_info = resolve_animation_config(anim_info, anim_xml)
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
        anim_names = node_info['animations']
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


def plant_display_nodes(seed_id: int, nodes: dict) -> list[dict]:
    """The same pose selection and attachments drive live displays and offline packet caches."""
    parts = []
    for node, config in nodes.items():
        if node == 'glow':
            continue
        animations = list(config['animations'])
        if not animations:
            continue
        if node == 'body':
            clip = {4: 'anim_armed', 9: 'anim_bigidle', 44: 'anim_idle'}.get(seed_id, 'anim_idle')
            if clip not in animations:
                clip = animations[0]
            body = {'name': node, 'animation': clip}
            packet_clip = {9: 'anim_idle', 19: 'anim_idle_aquarium'}.get(seed_id)
            if packet_clip in animations and packet_clip != clip:
                body['packetAnimation'] = packet_clip
            parts.append(body)
            continue
        clip = next((name for name in animations if 'idle' in name or 'blink' in name.lower()), animations[0])
        if node.startswith('head'):
            parent = 'body'
            track = 'anim_stem' if 'anim_stem' in nodes[parent]['slots'] else f'anim_{node}'
            if track not in nodes[parent]['slots']:
                track = 'anim_idle'
        elif node in ('backHead', 'backFace'):
            parent, track = 'body', 'anim_idle'
        elif node.startswith('face'):
            suffix = node.removeprefix('face')
            parent = f'head{suffix}' if f'head{suffix}' in nodes else 'body'
            track = f'anim_face{suffix}'
            if track not in nodes[parent]['slots']:
                track = next(iter(nodes[parent]['slots']), 'anim_idle')
        else:
            continue
        parts.append({'name': node, 'animation': clip, 'parent': parent, 'track': track, 'blink': 'blink' in clip.lower()})
    if seed_id == 18:
        order = ['body', 'head1', 'face1', 'head3', 'face3', 'head2', 'face2']
        parts.sort(key=lambda item: order.index(item['name']))
    return parts


def build_reanim_clip(
    source: Path,
    anim_info: dict[str, Any],
    node_id: str,
    clip_id: str,
    content_id: str,
    available_sprites: set[str],
    namespace: str = "pvz",
    *,
    nodes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not QUALIFIED_ID.fullmatch(content_id):
        raise ValueError(f"invalid reanim id: {content_id}")
    if nodes is None:
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
                keyframes.append(_legacy_frame(previous, previous["frameIndex"] + 1, start, fps, None))
            sprite = f"{namespace}:{content_sprite_name(frame['image'])}" if frame["image"] else None
            if sprite is not None and sprite not in available_sprites:
                missing_sprites.add(sprite)
            keyframes.append(_legacy_frame(frame, frame["frameIndex"], start, fps, sprite))
            previous = frame
        if previous is not None and previous["frameIndex"] < end:
            keyframes.append(_legacy_frame(previous, previous["frameIndex"] + 1, start, fps, None))
        tracks.append({"id": track_id, "zIndex": track["zIndex"], "keyframes": keyframes})

    if missing_sprites:
        raise ValueError(f"missing sprite references: {', '.join(sorted(missing_sprites))}")
    # Reanimation::DrawRenderGroup draws the shield and over-shield groups after every normal track, in this order.
    # A clip without frames on one of these tracks (the eat clip's door arm) simply leaves it out.
    draw_last = [track for track_id in anim_info[node_id].get("drawLastTracks", [])
                 for track in tracks if track["id"] == track_id]
    if draw_last:
        top = max(track["zIndex"] for track in tracks)
        for offset, track in enumerate(draw_last, start=1):
            track["zIndex"] = top + offset
        tracks.sort(key=lambda track: (track["zIndex"], track["id"]))
    return {
        "schemaVersion": 3,
        "id": content_id,
        "fps": fps,
        "durationSeconds": (end - start + 1) / fps,
        "tracks": tracks,
    }


def _legacy_frame(
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
