import json
from xml.etree import ElementTree
from pathlib import Path
from typing import Any


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


def parse_track_data(track_node: ElementTree.Element) -> tuple[str, int, list[dict[str, Any]]]:
    name_node = track_node.find('name')
    if name_node is None or name_node.text is None:
        raise ValueError(
            "Track is missing required <name> element or it has no text")
    name = name_node.text.strip()

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
            assert val_i.startswith('IMAGE_REANIM_'), "Unexpected image format"
            curr['image'] = val_i.replace('IMAGE_REANIM_', '', 1).lower()

        if is_active:
            frames.append(curr.copy())

    return name, duration, frames


def get_animation_data(tracks: dict[str, dict[str, Any]], anim_name: str, fps: int) -> dict[str, Any]:
    anim_track = tracks.get(anim_name)
    if anim_track is None:
        raise ValueError(
            f"Animation track '{anim_name}' not found in XML.")

    start_frame, end_frame = None, None
    for frame in anim_track['frames']:
        if frame is not None:
            if start_frame is None:
                start_frame = frame['frameIndex']
            end_frame = frame['frameIndex']

    if start_frame is None or end_frame is None:
        raise ValueError(
            f"Animation '{anim_name}' has no active frames.")

    return {
        'fps': fps,
        'duration': end_frame - start_frame + 1,
        'startFrame': start_frame,
        'endFrame': end_frame,
    }


def get_slot_data(tracks: dict[str, dict[str, Any]], slot_name: str) -> dict[str, Any]:
    slot_track = tracks.get(slot_name)
    if slot_track is None:
        raise ValueError(
            f"Slot track '{slot_name}' not found in XML.")
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


def get_anim_nodes(anim_info: dict[str, Any], anim_xml: ElementTree.Element) -> dict[str, Any]:
    fps_node = anim_xml.find('fps')
    fps = int(fps_node.text) if fps_node is not None and fps_node.text else 12

    tracks: dict[str, dict[str, Any]] = {}
    anim_duration = None
    for z, t_node in enumerate(anim_xml.findall('track')):
        track_name, track_duration, track_frames = parse_track_data(t_node)
        tracks[track_name] = {
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

        animations = {
            anim_name: get_animation_data(tracks, anim_name, fps)
            for anim_name in anim_names
        }
        if not animations:
            animations = {
                'default': {
                    'fps': fps,
                    'duration': anim_duration,
                    'startFrame': 0,
                    'endFrame': anim_duration - 1
                }
            }
        slots = {
            slot_name: get_slot_data(tracks, slot_name)
            for slot_name in slot_names
        }

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


def save_anim_data(output_dir: Path, anim_name: str, anim_nodes: dict[str, Any]):
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / f"{anim_name}.json", 'w') as f:
        json.dump(anim_nodes, f, separators=(',', ':'))
    node_names = ', '.join(anim_nodes.keys())
    print(f"Saved {anim_name}.json with nodes: {node_names}")


def main():
    config_dir = Path("./tools")
    xml_dir = Path("./tools/raw/reanim")
    output_dir = Path("./assets/resources/animations")

    anim_defs = load_json_config(config_dir)
    for anim_name, anim_info in anim_defs.items():
        print(f"Processing animation: {anim_name}")

        anim_xml = load_anim_xml(xml_dir, anim_name)
        anim_nodes = get_anim_nodes(anim_info, anim_xml)
        save_anim_data(output_dir, anim_name, anim_nodes)
        print("-----------------------------")


if __name__ == "__main__":
    main()
