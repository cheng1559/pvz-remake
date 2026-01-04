import xml.etree.ElementTree as ET
import json
import os
from dataclasses import dataclass, field
from typing import Any


def load_json_config(filename):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, filename)
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


ANIM_TRACKS = load_json_config('anim_tracks.json')

ANIM_PARENTS = load_json_config('anim_parents.json')


@dataclass
class Transform:
    x: float
    y: float
    sx: float
    sy: float
    kx: float
    ky: float
    alpha: float
    image: str | None


@dataclass
class ResourceTrack:
    name: str
    z: int
    data: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class AnimationClip:
    name: str
    parent: str | None
    fps: int
    frames: int
    resources: list[ResourceTrack | None] = field(default_factory=list)


def get_float(xml_elem: ET.Element, tag: str) -> float | None:
    node = xml_elem.find(tag)
    if node is not None and node.text and node.text.strip():
        try:
            return float(node.text)
        except ValueError:
            return None
    return None


def get_string(xml_elem: ET.Element, tag: str) -> str | None:
    node = xml_elem.find(tag)
    if node is not None and node.text:
        return node.text.strip()
    return None


def parse_track_data(track_node: ET.Element) -> tuple[str, list[dict[str, Any]], list[bool], bool]:
    """
    Returns:
    1. Track Name
    2. Dense Data List
    3. Active Mask List
    4. has_transform_data (bool): True if this track contains any x,y,sx,sy,kx,ky,i
    """
    name_node = track_node.find('name')
    if name_node is None or name_node.text is None:
        raise ValueError(
            "Track is missing required <name> element or it has no text")
    name = name_node.text.strip()

    curr = {
        'x': 0.0, 'y': 0.0, 'sx': 1.0, 'sy': 1.0,
        'kx': 0.0, 'ky': 0.0, 'alpha': 1.0, 'image': None
    }
    is_active = True
    has_data = False

    dense_frames = []
    active_mask = []

    t_nodes = track_node.findall('t')

    if len(t_nodes) > 0:
        f_init = get_float(t_nodes[0], 'f')
        if f_init == -1:
            is_active = False

    for t_node in t_nodes:
        f_val = get_float(t_node, 'f')
        if f_val == 0:
            is_active = True
        elif f_val == -1:
            is_active = False

        def check_update(tag, key):
            val = get_float(t_node, tag)
            if val is not None:
                curr[key] = val
                return True
            return False

        d1 = check_update('x', 'x')
        d2 = check_update('y', 'y')
        d3 = check_update('sx', 'sx')
        d4 = check_update('sy', 'sy')
        d5 = check_update('kx', 'kx')
        d6 = check_update('ky', 'ky')
        d7 = check_update('a', 'alpha')

        val_i = get_string(t_node, 'i')
        if val_i is not None:
            assert val_i.startswith('IMAGE_REANIM_'), "Unexpected image format"
            curr['image'] = val_i.replace('IMAGE_REANIM_', '', 1).lower()
            has_data = True

        if d1 or d2 or d3 or d4 or d5 or d6 or d7:
            has_data = True

        dense_frames.append(curr.copy())
        active_mask.append(is_active)

    return name, dense_frames, active_mask, has_data


def parse_reanim_xml(anim_name: str, file_path: str, output_file: str):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            raw = f.read()
        root = ET.fromstring(f"<root>{raw}</root>")
    except Exception as e:
        print(f"Error reading XML: {e}")
        return

    fps_node = root.find('fps')
    fps = int(fps_node.text) if fps_node is not None and fps_node.text else 12

    all_tracks = []
    for t_node in root.findall('track'):
        all_tracks.append(parse_track_data(t_node))

    controllers = []
    data_tracks = []

    if anim_name not in ANIM_TRACKS:
        raise ValueError(
            f"Animation '{anim_name}' not defined in ANIM_TRACKS.")
    anim_tracks = ANIM_TRACKS[anim_name]

    for name, frames, mask, has_data in all_tracks:
        if name in anim_tracks:
            if has_data:
                print(
                    f"Warning: Animation track '{name}' has transform data and will be treated as data track.")
                data_tracks.append((f"{name}_data", frames, mask))
            controllers.append((name, mask))
        else:
            data_tracks.append((name, frames, mask))

    print(
        f"Found {len(controllers)} controllers and {len(data_tracks)} data tracks.")

    final_animations = []

    if not controllers:
        name = "default"
        mask = [True] * len(data_tracks[0][1])
        controllers.append((name, mask))
        print("Warning: No controllers found; created default controller.")

    for ctrl_name, ctrl_mask in controllers:
        valid_indices = [i for i, active in enumerate(ctrl_mask) if active]

        if not valid_indices:
            continue

        anim_resources = []

        for z_index, (data_name, data_frames, data_mask) in enumerate(data_tracks):

            extracted_data = []

            for i in valid_indices:
                if data_mask[i]:
                    frame_obj = data_frames[i].copy()
                    # frame_obj['t'] = i - valid_indices[0]
                else:
                    frame_obj = None
                extracted_data.append(frame_obj)

            if any(extracted_data):
                anim_resources.append(ResourceTrack(
                    name=data_name, z=z_index, data=extracted_data))

        if anim_name not in ANIM_PARENTS:
            raise ValueError(
                f"Animation '{anim_name}' not defined in ANIM_PARENTS.")
        parent = ANIM_PARENTS[anim_name].get(ctrl_name)

        anim_clip = AnimationClip(
            name=ctrl_name,
            parent=parent,
            fps=fps,
            frames=len(valid_indices),
            resources=anim_resources
        )
        final_animations.append(anim_clip)

    output_json = []
    for anim in final_animations:
        anim_dict = {
            "name": anim.name,
            "parent": anim.parent,
            "fps": anim.fps,
            "frames": anim.frames,
            "resources": []
        }
        for res in anim.resources:
            anim_dict["resources"].append({
                "name": res.name,
                "z": res.z,
                "data": res.data
            })
        output_json.append(anim_dict)

    with open(output_file, 'w') as f:
        json.dump(output_json, f, separators=(',', ':'))


if __name__ == "__main__":
    anim_list = ANIM_TRACKS.keys()
    for anim_name in anim_list:
        print(f"Processing animation: {anim_name}")

        input_file = f"./tools/raw_reanim/{anim_name}.reanim"
        output_file = f"./assets/resources/animations/{anim_name}.json"

        try:
            parse_reanim_xml(anim_name, input_file, output_file)
            print(f"Generated flat animation list: {output_file}")
        except Exception as e:
            print(f"Failed: {e}")
        print("-----------------------------")
