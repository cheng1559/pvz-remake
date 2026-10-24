"""Build display-only Reanim clips; no gameplay definitions are installed here."""
import copy
import json
import tempfile
from pathlib import Path
from xml.etree import ElementTree

from generate_packet_plant_cache import ANIMATION_NAMES, style_for
from reanim_converter import plant_display_nodes
from generate_zombie_preview_cache import CACHE_BASE_X, CACHE_BASE_Y, HIDDEN_BY_DEFAULT, ZOMBIE_DEFINITIONS, zombie_preview_matrix

ROOT = Path(__file__).resolve().parents[1]
PLANT_OFFSET = {11: [0, 55], 23: [0, 18], 33: [0, -20], 35: [0, 20], 47: [-40, 0]}
# PlantDrawHeightOffset and Plant::UpdateReanim, in the original Y-down coordinates.
PLANT_HEIGHT = {8: 5, 11: -40, 13: -14, 16: 25, 19: 24, 21: 15, 24: 28, 29: 10, 30: 15, 33: 26, 35: -20, 46: 21}
PLANT_SHADOW = {6: [-21, 57], 8: [-3, 42], 9: [-3, 42], 10: [-3, 47], 13: [-9, 55], 17: [-3, 56], 23: [-3, 54], 25: [-3, 57], 26: [-8, 50], 30: [-3, 46], 32: [-3, 47], 33: [-4, 46], 34: [0, 47], 35: [-3, 81], 37: [-7, 52], 39: [-3, 47], 42: [-3, 47], 44: [-3, 47]}
ZOMBIE_OFFSET = {7: [-10, 0], 12: [-30, 5], 16: [0, -20], 20: [15, 0], 22: [-10, 0], 23: [0, 40], 25: [-540, -175]}
# Zombie::GetDrawPos, including the UI bobsled's fixed -10 altitude.
ZOMBIE_DRAW = {3: [-6, -11], 7: [0, -16], 12: [68, -23], 13: [0, -2], 16: [0, 17], 18: [0, 16], 19: [0, -20], 20: [-18, 0], 22: [-25, -18], 23: [0, -8]}
# Zombie::DrawShadow includes GetDrawPos; bouncing Pogo altitude cancels out.
ZOMBIE_SHADOW = {3: [30, 92], 5: [29, 96], 7: [41, 92], 8: [19, 92], 9: [19, 92], 11: [35, 97], 13: [20, 103], 14: [19, 103], 16: [23, 122], 17: [17, 97], 18: [23, 108], 19: [3, 92], 23: [27, 91], 24: [25, 99]}


def almanac_definitions(raw_root: Path) -> tuple[dict, dict, list]:
    from build_pvz_base import ADVENTURE_12_CLIPS, LEVEL_CLIPS, PLANT_ZOMBIE_CLIPS

    shared_clips = {(source.stem, node, clip): content_id
                    for source, node, clip, content_id in [*LEVEL_CLIPS, *ADVENTURE_12_CLIPS, *PLANT_ZOMBIE_CLIPS]}
    shared_clips[('peashooter', 'face', 'anim_blink')] = shared_clips[('peashootersingle', 'face', 'anim_blink')]
    configs = json.loads((ROOT / "tools/anim_defs.json").read_text())
    catalog = {"plants": [], "zombies": []}
    clips = []
    fps_cache = {}

    def part(kind, entry_id, source, node, clip, content_name=None, **extra):
        if source not in fps_cache:
            root = ElementTree.fromstring("<root>" + (raw_root / "reanim" / f"{source}.reanim").read_text() + "</root>")
            fps_cache[source] = float(root.findtext("fps", "12"))
        shared = shared_clips.get((source, node, clip))
        if kind == 'zombie' and entry_id == 0:
            shared = shared_clips[(source, 'body', clip)]
        content_id = shared or f"pvz:almanac_{kind}_{entry_id}_{content_name or node.lower()}"
        if not shared:
            clips.append((raw_root / "reanim" / f"{source}.reanim", node, clip, content_id))
        return {"name": node, "id": content_id, "fps": fps_cache[source], **extra}

    for seed_id, source in ANIMATION_NAMES.items():
        nodes = configs[source]
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
        rate = [15, 20] if seed_id in (0, 5, 7, 18, 28, 40) else [10, 15]
        if seed_id == 4:
            rate = [12, 12]
        elif seed_id == 27:
            rate = [10, 10]
        elif seed_id == 48:
            rate = [25, 30]
        height = PLANT_HEIGHT.get(seed_id, 0)
        shadow_x, shadow_y = PLANT_SHADOW.get(seed_id, [-3, 51])
        shadow_scale = 0.5 if seed_id in (8, 9, 37) else 1.3 if seed_id in (10, 23, 42) else 1.4 if seed_id == 30 else 1
        catalog["plants"].append({"parts": parts, "rate": rate, "offset": PLANT_OFFSET.get(seed_id, [0, 0]),
            "drawOffset": [12, height + (12 if seed_id == 4 else 10)] if seed_id in (4, 35) else [0, height],
            "scale": 0.8 if seed_id in (4, 35) else 1,
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
        if source == "zombie_boss":
            configs[source] = {"body": {"slots": ["Boss_head2"], "animations": ["anim_head_idle"]}}
            configs["zombie_boss_driver"] = {"driver": {"slots": [], "animations": ["anim_idle"]}}
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
    # Registered entities keep only UI layout here; resources/attachments/rates come from the registry.
    for kind, targets in [('plants', ['peashooter', 'sunflower', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea', 'chomper', 'repeater']),
                          ('zombies', ['normal', 'flag', 'conehead', 'pole_vaulter', 'buckethead'])]:
        for entry_id, target in enumerate(targets):
            entry = catalog[kind][entry_id]
            entry['animationTarget'] = f'pvz:{target}'
            entry.pop('parts')
            entry.pop('rate')
            if kind == 'zombies' and entry.get('portrait', {}).get('parts'):
                entry['portrait']['parts'] = [{'name': 'flag'}, {'name': 'body'}]
    for seed_id, entry in enumerate(catalog['plants']):
        ratio = style_for(seed_id)['timeRatio']
        if ratio:
            entry['packetTimeRatio'] = ratio
    return catalog, configs, clips


def build_almanac(raw_root: Path) -> None:
    from build_pvz_base import build_main_menu
    catalog, configs, clips = almanac_definitions(raw_root)
    with tempfile.TemporaryDirectory() as directory:
        config_dir = Path(directory)
        (config_dir / "anim_defs.json").write_text(json.dumps(configs))
        build_main_menu(clips, sprite_sources=[(raw_root / "images/bungeecord.png", "pvz:bungeecord")], anim_config=config_dir)
    destination = ROOT / "assets/resources/almanac-animations.json"
    destination.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(f"Almanac: {len(catalog['plants'])} plants, {len(catalog['zombies'])} zombies, {len(clips)} clips")
