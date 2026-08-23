from pathlib import Path

from content_v2_converter import build_sprite_content


ROOT = Path(__file__).resolve().parents[1]


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
    build_pvz_base()
