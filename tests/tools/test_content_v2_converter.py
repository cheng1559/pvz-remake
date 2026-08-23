import tempfile
import unittest
import json
from pathlib import Path

import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[2] / "tools"))

from content_v2_converter import build_sprite_content
from font_converter import write_font_v2


class ContentV2ConverterTest(unittest.TestCase):
    def test_explicit_sprites_are_stable_and_merge_alpha(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "background.jpg"
            alpha = root / "background_.png"
            Image.new("RGB", (2, 2), (20, 40, 60)).save(source)
            Image.new("L", (2, 2), 127).save(alpha)
            output = root / "output"
            fixture = Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2"

            first = build_sprite_content(
                fixture,
                output,
                sprite_sources=[(source, "pvz:background1")],
            )
            first_bytes = (output / "manifest.json").read_bytes()
            second = build_sprite_content(
                fixture,
                output,
                sprite_sources=[(source, "pvz:background1")],
            )

            self.assertEqual(first, second)
            self.assertEqual(first_bytes, (output / "manifest.json").read_bytes())
            self.assertEqual(
                first["client"]["sprites"]["pvz:background1"],
                "sprites/background1/spriteFrame",
            )
            with Image.open(output / "sprites" / "background1.png") as image:
                self.assertEqual(image.getpixel((0, 0))[3], 127)

            with self.assertRaisesRegex(ValueError, "duplicate sprite ID"):
                build_sprite_content(
                    fixture,
                    output,
                    sprite_sources=[
                        (source, "pvz:background1"),
                        (source, "pvz:background1"),
                    ],
                )

    def test_output_is_stable_and_references_exist(self):
        source = Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2"
        reanim = Path(__file__).parents[2] / "tools" / "fixtures" / "reanim-v2" / "phase2.reanim"
        with tempfile.TemporaryDirectory() as temp:
            bundle = Path(temp)
            first = build_sprite_content(source, bundle, reanim_sources=[reanim])
            first_bytes = (bundle / "manifest.json").read_bytes()
            stale = bundle / "sprites" / "stale.png"
            stale.write_bytes(b"stale")
            Path(f"{stale}.meta").write_bytes(b"stale-meta")
            second = build_sprite_content(source, bundle, reanim_sources=[reanim])

            self.assertEqual(first, second)
            self.assertEqual(first_bytes, (bundle / "manifest.json").read_bytes())
            self.assertTrue((bundle / "sprites" / "phase2_checker.png").is_file())
            self.assertEqual(
                first["client"]["sprites"]["pvz:phase2_checker"],
                "sprites/phase2_checker/spriteFrame",
            )
            self.assertEqual(first["client"]["reanim"]["pvz:phase2"], "reanim/phase2")
            self.assertTrue((bundle / "reanim" / "phase2.json").is_file())
            for path in first["gameplay"].values():
                self.assertTrue((bundle / path).is_file())
            self.assertFalse(stale.exists())
            self.assertFalse(Path(f"{stale}.meta").exists())

    def test_font_v2_output_is_deterministic(self):
        descriptor = """
Define CharList ('A');
Define WidthList (2);
Define RectList ((0, 0, 2, 2));
Define OffsetList ((0, 0));
CreateLayer Main;
LayerSetImage Main 'testfont';
LayerSetAscent Main 2;
LayerSetCharWidths Main CharList WidthList;
LayerSetImageMap Main CharList RectList;
LayerSetCharOffsets Main CharList OffsetList;
LayerSetPointSize Main 2;
SetDefaultPointSize 2;
"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "testfont.txt"
            source.write_text(descriptor, encoding="utf-8")
            Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(root / "testfont.png")
            output = root / "output"

            first = write_font_v2(source, output, "pvz:testfont")
            first_bytes = [(path.name, path.read_bytes()) for path in first]
            second = write_font_v2(source, output, "pvz:testfont")

            self.assertEqual(first_bytes, [(path.name, path.read_bytes()) for path in second])
            self.assertTrue((output / "testfont_atlas.png").is_file())
            self.assertIn('"schemaVersion":2', (output / "testfont.json").read_text())

    def test_peasplat_particle_v2_tracks_and_atlases(self):
        particle_xml = """
<Emitter><Image>IMAGE_PEA_SPLATS</Image><ImageFrames>4</ImageFrames>
<SpawnMinActive>1</SpawnMinActive><SpawnMaxLaunched>1</SpawnMaxLaunched>
<ParticleAlpha>.9,70 0</ParticleAlpha><ParticleScale>[.4 .6] [.8 1.2]</ParticleScale>
<EmitterRadius>[0 10]</EmitterRadius><ParticleDuration>20</ParticleDuration>
<SystemDuration>20</SystemDuration><RandomLaunchSpin>1</RandomLaunchSpin></Emitter>
<Emitter><Image>IMAGE_PEA_PARTICLES</Image><ImageFrames>3</ImageFrames>
<SpawnMinActive>[6 10]</SpawnMinActive><ParticleAlpha>1,80 0</ParticleAlpha>
<ParticleScale>[.8 1.2]</ParticleScale><EmitterRadius>[0 10]</EmitterRadius>
<LaunchSpeed>[150]</LaunchSpeed><ParticleDuration>20</ParticleDuration>
<SystemDuration>20</SystemDuration><ParticleSpinSpeed>[-200 200]</ParticleSpinSpeed>
<Field><FieldType>Friction</FieldType><X>0.0,40 .1</X><Y>0.0,40 .1</Y></Field>
<Field><FieldType>Acceleration</FieldType><Y>10</Y></Field></Emitter>
"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "peasplat.xml"
            source.write_text(particle_xml, encoding="utf-8")
            Image.new("RGBA", (96, 24), (0, 255, 0, 255)).save(root / "pea_splats.png")
            Image.new("RGBA", (33, 11), (0, 255, 0, 255)).save(root / "pea_particles.png")
            output = root / "output"

            manifest = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                particles=[(source, "pvz:peasplat")],
            )
            data = json.loads((output / "particles" / "peasplat.json").read_text())

            self.assertEqual(data["durationSeconds"], 0.2)
            self.assertEqual(data["emitters"][0]["particleAlpha"]["nodes"], [
                {"timeRatio": 0.7, "low": 0.9, "high": 0.9},
                {"timeRatio": 1, "low": 0, "high": 0},
            ])
            self.assertEqual(data["emitters"][0]["particleScale"]["nodes"][0],
                             {"timeRatio": 0, "low": 0.4, "high": 0.6})
            self.assertEqual(data["emitters"][1]["fields"][0]["x"]["nodes"][0]["timeRatio"], 0.4)
            self.assertEqual(data["emitters"][1]["fields"][1]["y"]["nodes"][0]["low"], 1000)
            self.assertEqual(manifest["client"]["particles"]["pvz:peasplat"], "particles/peasplat")
            self.assertTrue((output / "sprites" / "pea_splats.png").is_file())
            self.assertTrue((output / "sprites" / "pea_particles.png").is_file())

            source.write_text(particle_xml.replace(
                "<EmitterRadius>[0 10]</EmitterRadius>",
                "<EmitterRadius>[0 10]</EmitterRadius><LaunchAngle>[110 250]</LaunchAngle>",
                1,
            ), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "directed LaunchAngle"):
                build_sprite_content(
                    Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                    output,
                    particles=[(source, "pvz:peasplat")],
                )

    def test_seedpacketflash_particle_v2_offsets_and_default_frame(self):
        particle_xml = """
<Emitter><Image>IMAGE_SEEDPACKETFLASH</Image><SpawnMinActive>1</SpawnMinActive>
<ParticleAlpha>0 1,40 0</ParticleAlpha><ParticleDuration>25</ParticleDuration>
<EmitterOffsetX>25</EmitterOffsetX><EmitterOffsetY>35</EmitterOffsetY></Emitter>
"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "seedpacketflash.xml"
            source.write_text(particle_xml, encoding="utf-8")
            Image.new("RGBA", (64, 64), (255, 255, 255, 255)).save(root / "seedpacketflash.png")
            output = root / "output"

            manifest = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                particles=[(source, "pvz:seedpacketflash")],
            )
            data = json.loads((output / "particles" / "seedpacketflash.json").read_text())
            emitter = data["emitters"][0]

            self.assertEqual(emitter["frameCount"], 1)
            self.assertEqual(emitter["emitterOffsetX"]["nodes"][0]["low"], 25)
            self.assertEqual(emitter["emitterOffsetY"]["nodes"][0]["low"], 35)
            self.assertEqual(emitter["particleAlpha"]["nodes"], [
                {"timeRatio": 0, "low": 0, "high": 0},
                {"timeRatio": 0.4, "low": 1, "high": 1},
                {"timeRatio": 1, "low": 0, "high": 0},
            ])
            self.assertEqual(manifest["client"]["particles"]["pvz:seedpacketflash"],
                             "particles/seedpacketflash")
            self.assertTrue((output / "sprites" / "seedpacketflash.png").is_file())

    def test_sound_is_copied_and_registered_deterministically(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "splat.mp3"
            source.write_bytes(b"ID3-pvz-splat")
            output = root / "output"

            first = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                sounds=[(source, "pvz:splat")],
            )
            first_bytes = (output / "manifest.json").read_bytes()
            second = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                sounds=[(source, "pvz:splat")],
            )

            self.assertEqual(first, second)
            self.assertEqual(first_bytes, (output / "manifest.json").read_bytes())
            self.assertEqual(first["client"]["sounds"]["pvz:splat"], "audio/sfx/splat")
            self.assertEqual((output / "audio" / "sfx" / "splat.mp3").read_bytes(), source.read_bytes())

            with self.assertRaisesRegex(ValueError, "outside pvz:"):
                build_sprite_content(source.parent, output, sounds=[(source, "other:splat")])
            with self.assertRaisesRegex(ValueError, "unsafe sound ID path"):
                build_sprite_content(source.parent, output, sounds=[(source, "pvz:a/../splat")])
            with self.assertRaisesRegex(ValueError, "duplicate sound ID"):
                build_sprite_content(source.parent, output, sounds=[
                    (source, "pvz:splat"), (source, "pvz:splat"),
                ])

    def test_music_v2_definition_and_main_stem_are_deterministic(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest = root / "music_manifest.json"
            manifest.write_text(json.dumps({"tunes": {"title_theme": {
                "durationSec": 87.465079,
                "loopStartSec": 0,
                "loopEndSec": 87.465079,
                "stems": {"main": "audio/music/title_theme"},
            }}}), encoding="utf-8")
            (root / "title_theme.mp3").write_bytes(b"ID3-pvz-title")
            output = root / "output"

            first = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                music=[(manifest, "title_theme", "pvz:title_theme")],
            )
            first_bytes = (output / "manifest.json").read_bytes()
            second = build_sprite_content(
                Path(__file__).parents[2] / "tools" / "fixtures" / "content-v2",
                output,
                music=[(manifest, "title_theme", "pvz:title_theme")],
            )
            definition = json.loads((output / "music" / "title_theme.json").read_text())

            self.assertEqual(first, second)
            self.assertEqual(first_bytes, (output / "manifest.json").read_bytes())
            self.assertEqual(first["client"]["music"]["pvz:title_theme"], "music/title_theme")
            self.assertEqual(definition["stems"], {
                "main": "audio/music/title_theme", "drums": None, "hihats": None,
            })
            self.assertEqual(
                (output / "audio" / "music" / "title_theme.mp3").read_bytes(),
                b"ID3-pvz-title",
            )


if __name__ == "__main__":
    unittest.main()
