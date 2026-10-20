import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from content_v2_converter import build_sprite_content


ROOT = Path(__file__).resolve().parents[1]
MAIN_MENU_CLIPS = [
    (ROOT / "tools/raw/reanim/selectorscreen.reanim", name, f"anim_{name}", f"pvz:selector_{name}")
    for name in ["open", "sign", "grass", "flower1", "flower2", "flower3", "cloud1", "cloud2", "cloud4", "cloud5", "cloud6", "cloud7"]
] + [(ROOT / "tools/raw/reanim/zombie_hand.reanim", "default", "default", "pvz:selector_zombie_hand")]
STARTUP_CLIPS = [
    (ROOT / f"tools/raw/reanim/{name}.reanim", "default", "default", f"pvz:{name}")
    for name in ("loadbar_sprout", "loadbar_zombiehead")
]


def content_hash(bundle: Path, manifest: dict) -> str:
    payload = {**manifest, "contentHash": ""}
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(encoded)
    assets = (path for path in bundle.rglob("*") if path.is_file() and path != bundle / "manifest.json" and not path.name.endswith(".meta"))
    for path in sorted(assets, key=lambda item: item.relative_to(bundle).as_posix()):
        digest.update(path.relative_to(bundle).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def build_main_menu(clips: list | None = None) -> dict:
    """Convert just menu clips and merge their assets into the existing base Bundle."""
    bundle = ROOT / "assets/bundles/pvz-base"
    manifest_path = bundle / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    previous_hash = manifest["contentHash"]
    if content_hash(bundle, manifest) != previous_hash:
        raise ValueError("base Bundle has changed outside the menu build; rebuild the full Bundle first")
    changed = False
    with tempfile.TemporaryDirectory() as directory:
        temporary = Path(directory)
        source = temporary / "source"
        source.mkdir()
        output = temporary / "bundle"
        generated = build_sprite_content(
            source, output, reanim_clips=MAIN_MENU_CLIPS if clips is None else clips, anim_config=ROOT / "tools",
            gameplay_source=ROOT / "tools/content/pvz-base/gameplay",
        )
        for category in ("reanim", "sprites"):
            (bundle / category).mkdir(parents=True, exist_ok=True)
            for path in (output / category).iterdir():
                target = bundle / category / path.name
                if not target.is_file() or target.read_bytes() != path.read_bytes():
                    changed = True
                    shutil.copyfile(path, target)
            if any(manifest["client"][category].get(key) != value for key, value in generated["client"][category].items()):
                changed = True
            manifest["client"][category].update(generated["client"][category])

    if changed:
        manifest["saveCompatibleHashes"] = sorted({*manifest.get("saveCompatibleHashes", []), previous_hash})
    manifest["contentHash"] = content_hash(bundle, manifest)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    return manifest


def build_pvz_base() -> dict:
    return build_sprite_content(
        ROOT / "tools/fixtures/content-v2",
        ROOT / "assets/bundles/pvz-base",
        sprite_sources=[
            (ROOT / "tools/raw/images/background1.jpg", "pvz:background1"),
            (ROOT / "tools/raw/images/background1unsodded.jpg", "pvz:background1unsodded"),
            (ROOT / "tools/raw/images/sod1row.jpg", "pvz:sod1row"),
            (ROOT / "tools/raw/images/projectilepea.png", "pvz:projectilepea"),
            (ROOT / "tools/raw/images/pea_shadows.png", "pvz:pea_shadows"),
            (ROOT / "tools/raw/images/plantshadow.png", "pvz:plantshadow"),
            (ROOT / "tools/raw/images/seedbank.png", "pvz:seedbank"),
            (ROOT / "tools/raw/images/seedpacket_larger.png", "pvz:seedpacket_larger"),
            (ROOT / "tools/raw/images/seeds.png", "pvz:seeds"),
            (ROOT / "tools/raw/images/packet_plants.png", "pvz:packet_plants"),
            (ROOT / "assets/resources/textures/packet_plants_cached.png", "pvz:packet_plants_cached"),
            (ROOT / "assets/resources/textures/plant_previews_cached.png", "pvz:plant_previews_cached"),
            (ROOT / "tools/raw/images/sunbank.png", "pvz:sunbank"),
            (ROOT / "assets/resources/textures/flagmeter.png", "pvz:flagmeter"),
            (ROOT / "assets/resources/textures/flagmeterparts.png", "pvz:flagmeterparts"),
            (ROOT / "assets/resources/textures/flagmeterlevelprogress.png", "pvz:flagmeterlevelprogress"),
            (ROOT / "assets/resources/textures/lawnmower_cached.png", "pvz:lawnmower_cached"),
            (ROOT / "tools/raw/reanim/zombie_outerarm_upper2.png", "pvz:zombie_outerarm_upper2"),
        ],
        reanim_sources=[ROOT / "tools/fixtures/reanim-v2/phase2.reanim"],
        reanim_clips=[
            (ROOT / "tools/raw/reanim/sunflower.reanim", "body", "anim_idle", "pvz:sunflower"),
            (ROOT / "tools/raw/reanim/sunflower.reanim", "face", "anim_blink", "pvz:sunflower_blink"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_idle", "pvz:zombie"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_idle2", "pvz:zombie_idle2"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_walk", "pvz:zombie_walk"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_walk2", "pvz:zombie_walk2"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_eat", "pvz:zombie_eat"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_death", "pvz:zombie_death"),
            (ROOT / "tools/raw/reanim/zombie.reanim", "body", "anim_death2", "pvz:zombie_death2"),
            (ROOT / "tools/raw/reanim/peashootersingle.reanim", "body", "anim_idle", "pvz:peashooter"),
            (ROOT / "tools/raw/reanim/peashootersingle.reanim", "head", "anim_head_idle", "pvz:peashooter_head_idle"),
            (ROOT / "tools/raw/reanim/peashootersingle.reanim", "head", "anim_shooting", "pvz:peashooter_shoot"),
            (ROOT / "tools/raw/reanim/peashootersingle.reanim", "face", "anim_blink", "pvz:peashooter_blink"),
            (ROOT / "tools/raw/reanim/peashooter.reanim", "body", "anim_idle", "pvz:repeater"),
            (ROOT / "tools/raw/reanim/peashooter.reanim", "head", "anim_head_idle", "pvz:repeater_head_idle"),
            (ROOT / "tools/raw/reanim/peashooter.reanim", "head", "anim_shooting", "pvz:repeater_shoot"),
            (ROOT / "tools/raw/reanim/lawnmower.reanim", "default", "anim_normal", "pvz:lawnmower"),
            (ROOT / "tools/raw/reanim/lawnmoweredzombie.reanim", "default", "default", "pvz:lawnmowered_zombie"),
            (ROOT / "tools/raw/reanim/sun.reanim", "default", "default", "pvz:sun"),
            (ROOT / "tools/raw/reanim/sodroll.reanim", "default", "default", "pvz:sodroll"),
            (ROOT / "tools/raw/reanim/finalwave.reanim", "default", "default", "pvz:finalwave"),
            *MAIN_MENU_CLIPS,
            *STARTUP_CLIPS,
        ],
        fonts=[
            (ROOT / "tools/raw/data/dwarventodcraft18.txt", "pvz:dwarventodcraft18"),
            (ROOT / "tools/raw/data/continuumbold14.txt", "pvz:continuumbold14"),
            (ROOT / "tools/raw/data/pico129.txt", "pvz:pico129"),
            (ROOT / "tools/raw/data/houseofterror16.txt", "pvz:houseofterror16"),
            (ROOT / "tools/raw/data/houseofterror28.txt", "pvz:houseofterror28"),
        ],
        anim_config=ROOT / "tools",
        particles=[
            (ROOT / "tools/raw/particles/peasplat.xml", "pvz:peasplat"),
            (ROOT / "tools/raw/particles/seedpacketflash.xml", "pvz:seedpacketflash"),
        ],
        sounds=[(ROOT / "assets/resources/audio/sfx/splat.mp3", "pvz:splat")],
        music=[(
            ROOT / "assets/resources/audio/music/music_manifest.json",
            "title_theme",
            "pvz:title_theme",
        )],
        gameplay_source=ROOT / "tools/content/pvz-base/gameplay",
        prefabs=[(
            ROOT / "assets/bundles/pvz-base/ui/adventure11.prefab",
            "pvz:adventure11",
        )],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--main-menu-only", action="store_true", help="rebuild only menu animation assets in an existing base Bundle")
    scope.add_argument("--startup-only", action="store_true", help="rebuild only loading-bar animation assets in an existing base Bundle")
    parser.add_argument("--raw-root", type=Path, default=ROOT / "tools/raw", help="raw asset directory for a scoped menu/startup build")
    args = parser.parse_args()
    if args.main_menu_only or args.startup_only:
        clips = STARTUP_CLIPS if args.startup_only else MAIN_MENU_CLIPS
        build_main_menu([(args.raw_root / "reanim" / path.name, node, clip, content_id) for path, node, clip, content_id in clips])
    else:
        build_pvz_base()
