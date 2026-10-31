"""Build display-only Reanim clips; no gameplay definitions are installed here."""
import copy
from pathlib import Path
from xml.etree import ElementTree

from .cache.packets import ANIMATION_NAMES, style_for
from .reanim import plant_display_nodes, resolve_animation_config
from .cache.zombies import CACHE_BASE_X, CACHE_BASE_Y, HIDDEN_BY_DEFAULT, ZOMBIE_DEFINITIONS, zombie_preview_matrix

# Per-type drawing values below are fallbacks for entries without authored animation definitions.
PLANT_OFFSET = {11: [0, 55], 23: [0, 18], 33: [0, -20], 35: [0, 20], 47: [-40, 0]}
# PlantDrawHeightOffset and Plant::UpdateReanim, in the original Y-down coordinates.
PLANT_HEIGHT = {11: -40, 13: -14, 16: 25, 19: 24, 21: 15, 24: 28, 29: 10, 30: 15, 33: 26, 35: -20, 46: 21}
PLANT_SHADOW = {9: [-3, 42], 10: [-3, 47], 13: [-9, 55], 17: [-3, 56], 23: [-3, 54], 25: [-3, 57], 26: [-8, 50], 30: [-3, 46], 32: [-3, 47], 33: [-4, 46], 34: [0, 47], 35: [-3, 81], 37: [-7, 52], 39: [-3, 47], 42: [-3, 47], 44: [-3, 47]}
ZOMBIE_OFFSET = {7: [-10, 0], 12: [-30, 5], 16: [0, -20], 20: [15, 0], 22: [-10, 0], 23: [0, 40], 25: [-540, -175]}
# Zombie::GetDrawPos, including the UI bobsled's fixed -10 altitude.
ZOMBIE_DRAW = {7: [0, -16], 12: [68, -23], 13: [0, -2], 16: [0, 17], 18: [0, 16], 19: [0, -20], 20: [-18, 0], 22: [-25, -18], 23: [0, -8]}
# Zombie::DrawShadow includes GetDrawPos; bouncing Pogo altitude cancels out.
ZOMBIE_SHADOW = {7: [41, 92], 8: [19, 92], 9: [19, 92], 11: [35, 97], 13: [20, 103], 14: [19, 103], 16: [23, 122], 17: [17, 97], 18: [23, 108], 19: [3, 92], 23: [27, 91], 24: [25, 99]}


def almanac_definitions(raw_root: Path, shared: list, configuration: dict, presentation: dict) -> tuple[dict, dict, list]:
    shared_clips = {(source.stem, node, clip): content_id
                    for source, node, clip, content_id in shared}
    shared_clips[('peashooter', 'face', 'anim_blink')] = shared_clips[('peashootersingle', 'face', 'anim_blink')]
    configs = copy.deepcopy(configuration)
    catalog = {"plants": [], "zombies": []}
    clips = []
    fps_cache = {}

    def source_config(source):
        if source not in fps_cache:
            root = ElementTree.fromstring("<root>" + (raw_root / "reanim" / f"{source}.reanim").read_text() + "</root>")
            fps_cache[source] = float(root.findtext("fps", "12"))
            configs[source] = resolve_animation_config(configs[source], root)
        return configs[source]

    def eye_tracks(source):
        # Plant::DoBlink hides the body's tracks by the anim_eye prefix; the game shows and hides exact track IDs.
        root = ElementTree.fromstring("<root>" + (raw_root / "reanim" / f"{source}.reanim").read_text() + "</root>")
        names = (track.findtext("name") for track in root.findall("track"))
        return list(dict.fromkeys(name for name in names if name and name.startswith("anim_eye")))

    def part(kind, entry_id, source, node, clip, content_name=None, **extra):
        source_config(source)
        shared = shared_clips.get((source, node, clip))
        if kind == 'zombie' and entry_id == 0:
            shared = shared_clips[(source, 'body', clip)]
        content_id = shared or f"pvz:almanac_{kind}_{entry_id}_{content_name or node.lower()}"
        if not shared:
            clips.append((raw_root / "reanim" / f"{source}.reanim", node, clip, content_id))
        return {"name": node, "id": content_id, "fps": fps_cache[source], **extra}

    for seed_id, source in ANIMATION_NAMES.items():
        nodes = source_config(source)
        if source == "cornpult":
            # Both the original idle plant and cached packet pose hide the butter.
            nodes["body"]["hiddenTrackPrefixes"] = ["Cornpult_butter"]
        parts = []
        for definition in plant_display_nodes(seed_id, nodes):
            node, clip = definition.pop('name'), definition.pop('animation')
            packet_clip = definition.pop('packetAnimation', None)
            value = part('plant', seed_id, source, node, clip, **definition)
            if packet_clip:
                value['packetId'] = part('plant', seed_id, source, node, packet_clip, content_name='packet_body')['id']
            parts.append(value)
        eyes = eye_tracks(source)
        for value in parts:
            if value.get('blink') and eyes:
                value['eyeTracks'] = eyes
        rate = [15, 20] if seed_id in (18, 28, 40) else [10, 15]
        if seed_id == 27:
            rate = [10, 10]
        elif seed_id == 48:
            rate = [25, 30]
        height = PLANT_HEIGHT.get(seed_id, 0)
        shadow_x, shadow_y = PLANT_SHADOW.get(seed_id, [-3, 51])
        shadow_scale = 0.5 if seed_id in (9, 37) else 1.3 if seed_id in (10, 23, 42) else 1.4 if seed_id == 30 else 1
        catalog["plants"].append({"parts": parts, "rate": rate, "offset": PLANT_OFFSET.get(seed_id, [0, 0]),
            "drawOffset": [12, height + 10] if seed_id == 35 else [0, height],
            "scale": 0.8 if seed_id == 35 else 1,
            "shadow": seed_id not in (11, 16, 19, 21, 24, 29, 43, 46, 47),
            "shadowOffset": [shadow_x, shadow_y + height], "shadowScale": shadow_scale,
            **({"packetOffset": [12, 12], "packetScale": 0.85 if seed_id == 4 else 0.8} if seed_id in (4, 35) else {})})

    # Each basic Zombie variant has its own equipment tracks baked into the display clip.
    for zombie_id in range(26):
        definition = ZOMBIE_DEFINITIONS.get(zombie_id, {"animation": "zombie_boss", "layer": "anim_head_idle"})
        source = definition["animation"]
        node = "body"
        if zombie_id == 16:
            configs[source]["body"]["slots"] = ["hat"]
        if source == "zombie":
            node = f"almanac{zombie_id}"
            config = copy.deepcopy(configs[source]["body"])
            shown = set(definition.get("show", []))
            hidden = (set(HIDDEN_BY_DEFAULT) - shown) | set(definition.get("hide", []))
            config["hiddenTrackPrefixes"] = sorted(hidden) + definition.get("hidePrefix", [])
            configs[source][node] = config
        clip = "anim_armraise" if zombie_id in (8, 9) else "anim_drop" if zombie_id == 20 else definition["layer"]
        parts = [part("zombie", zombie_id, source, node, clip)]
        if zombie_id == 0:
            parts[0]["idle2Id"] = part("zombie", zombie_id, source, node, "anim_idle2", content_name="idle2")["id"]
        if zombie_id == 1:
            parts.append(part("zombie", zombie_id, "zombie_flagpole", "flag", "Zombie_flag", parent=node, track="Zombie_flaghand", behind="Zombie_innerarm_screendoor"))
        if zombie_id == 16:
            parts.append(part("zombie", zombie_id, source, "propeller", "propeller", parent=node, track="hat"))
        if zombie_id == 25:
            parts.append(part("zombie", zombie_id, "zombie_boss_driver", "driver", "anim_idle", parent="body", track="Boss_head2", socket=True, offset=[28, 84], scale=1.2, rate=18))
        preview_matrix = zombie_preview_matrix(zombie_id)
        cache_x, cache_y = definition.get("cacheOffset", (0, 0))
        cache_x, cache_y = CACHE_BASE_X + cache_x, CACHE_BASE_Y + cache_y
        portrait = {"offset": [preview_matrix[4] + preview_matrix[0] * cache_x, preview_matrix[5] + preview_matrix[3] * cache_y], "scale": preview_matrix[0]}
        if clip != definition["layer"]:
            portrait["parts"] = [part("zombie", zombie_id, source, node, definition["layer"], content_name="portrait_body")]
        if zombie_id == 1:
            portrait["parts"] = [{key: item[key] for key in ("name", "id", "fps")} for item in reversed(parts)]
        if zombie_id == 16:
            portrait["parts"] = [parts[0], {key: parts[1][key] for key in ("name", "id", "fps")} | {"offset": [0, -1]}]
        if zombie_id == 25:
            portrait["offset"] = [preview_matrix[4] - preview_matrix[0] * 524, preview_matrix[5] - preview_matrix[3] * 88]
            portrait["parts"] = [
                {**parts[0], "name": "back"},
                {key: parts[1][key] for key in ("name", "id", "fps")} | {"offset": [570, 110]},
                {**parts[0], "name": "front", "hiddenTracks": ["boss_body1", "Boss_neck", "Boss_head2"]},
            ]
        rates = {8: [12, 12], 9: [12, 12], 12: [12, 12], 16: [8, 10], 18: [40, 40], 20: [24, 24], 22: [8, 8], 25: [12, 12]}
        scale = 0.8 if zombie_id in (8, 9) else 1
        catalog["zombies"].append({"parts": parts, "offset": ZOMBIE_OFFSET.get(zombie_id, [0, 0]), "drawOffset": ZOMBIE_DRAW.get(zombie_id, [0, 0]), "rate": rates.get(zombie_id, [12, 18]), "scale": scale,
            "shadow": zombie_id not in (12, 20, 22, 25), "shadowOffset": ZOMBIE_SHADOW.get(zombie_id, [23, 92]), "shadowScale": scale * (1.5 if zombie_id == 23 else 0.6 if zombie_id == 24 else 1),
            "portrait": portrait, **({"motion": "pogo"} if zombie_id == 18 else {"motion": "bungee"} if zombie_id == 20 else {})})
    # Match authored definitions by their body clip, so new implementations join automatically.
    for kind, entries in catalog.items():
        registered = {}
        for target, definition in presentation[kind].items():
            animations = definition.get('animations', {})
            body = animations.get('body') or animations.get('armed') or animations.get('idle')
            if body:
                registered[body['reanimId']] = target
        for entry in entries:
            target = registered.get(entry['parts'][0]['id'])
            if not target:
                continue
            body_name = entry['parts'][0]['name']
            entry['animationTarget'] = target
            for key in ('parts', 'rate', 'drawOffset', 'scale', 'shadowOffset', 'shadowScale'):
                entry.pop(key)
            if kind == 'zombies' and entry.get('portrait', {}).get('parts'):
                entry['portrait']['parts'] = [{'name': 'body' if part['name'] == body_name else part['name']}
                                             for part in entry['portrait']['parts']]
    for seed_id, entry in enumerate(catalog['plants']):
        ratio = style_for(seed_id)['timeRatio']
        if ratio:
            entry['packetTimeRatio'] = ratio
    return catalog, configs, clips
