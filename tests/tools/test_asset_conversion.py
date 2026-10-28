import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools'))

from pvz.pak import extracted_pak, PAK_MAGIC, XOR_KEY
from pvz.fonts import write_font
from pvz.images import convert_images
from pvz.particles import build_particle, write_particle


class AssetConversionTests(unittest.TestCase):
    def test_pak_import_uses_temporary_lowercase_paths_and_cleans_up_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            pak = Path(directory) / 'main.pak'
            name, payload = b'Images\\Button.PNG', b'image-payload'
            raw = struct.pack('<II', PAK_MAGIC, 0) + b'\x00' + bytes([len(name)]) + name
            raw += struct.pack('<IQ', len(payload), 0) + b'\x80' + payload
            pak.write_bytes(bytes(value ^ XOR_KEY for value in raw))
            with self.assertRaisesRegex(RuntimeError, 'conversion failed'):
                with extracted_pak(pak) as output:
                    self.assertEqual((output / 'images/button.png').read_bytes(), payload)
                    extracted = output
                    raise RuntimeError('conversion failed')
            self.assertFalse(extracted.exists())
            self.assertTrue(pak.is_file())

    def test_particle_curves_and_distributions_survive_original_cache_conversion(self):
        from pvz.compiled_particles import TrackNode, format_track
        from pvz.particles import parse_pvz_track
        parsed = parse_pvz_track(format_track([
            TrackNode(0, .1, .5, 9, 2), TrackNode(1, 1, 1, 1, 1),
        ]))
        self.assertEqual(parsed['nodes'][0], {
            'time': 0, 'low': .1, 'high': .5, 'curve': 'bounce', 'distribution': 'ease-in',
        })
        self.assertEqual(parse_pvz_track('.5 EaseIn 5')['nodes'][0]['curve'], 'ease-in')

    def test_font_output_is_deterministic(self):
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

            first = write_font(source, output, "pvz:testfont")
            first_bytes = [(path.name, path.read_bytes()) for path in first]
            second = write_font(source, output, "pvz:testfont")

            self.assertEqual(first_bytes, [(path.name, path.read_bytes()) for path in second])
            self.assertTrue((output / "testfont_atlas.png").is_file())
            self.assertIn('"schemaVersion":2', (output / "testfont.json").read_text())

    def test_images_merge_alpha_and_skip_the_companion_mask(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / 'source', root / 'images'
            source.mkdir()
            Image.new('RGB', (2, 2), (20, 40, 60)).save(source / 'background.jpg')
            Image.new('L', (2, 2), 127).save(source / 'background_.png')
            files = convert_images(source, output)
            self.assertEqual(files, [output / 'background.png'])
            before = files[0].read_bytes()
            self.assertEqual(Image.open(files[0]).getpixel((0, 0))[3], 127)
            convert_images(source, output)
            self.assertEqual(files[0].read_bytes(), before)

    def test_peasplat_particle_tracks_and_atlases(self):
        particle_xml = '\n<Emitter><Image>IMAGE_PEA_SPLATS</Image><ImageFrames>4</ImageFrames>\n<SpawnMinActive>1</SpawnMinActive><SpawnMaxLaunched>1</SpawnMaxLaunched>\n<ParticleAlpha>.9,70 0</ParticleAlpha><ParticleScale>[.4 .6] [.8 1.2]</ParticleScale>\n<EmitterRadius>[0 10]</EmitterRadius><ParticleDuration>20</ParticleDuration>\n<SystemDuration>20</SystemDuration><RandomLaunchSpin>1</RandomLaunchSpin></Emitter>\n<Emitter><Image>IMAGE_PEA_PARTICLES</Image><ImageFrames>3</ImageFrames>\n<SpawnMinActive>[6 10]</SpawnMinActive><ParticleAlpha>1,80 0</ParticleAlpha>\n<ParticleScale>[.8 1.2]</ParticleScale><EmitterRadius>[0 10]</EmitterRadius>\n<LaunchSpeed>[150]</LaunchSpeed><ParticleDuration>20</ParticleDuration>\n<SystemDuration>20</SystemDuration><ParticleSpinSpeed>[-200 200]</ParticleSpinSpeed>\n<Field><FieldType>Friction</FieldType><X>0.0,40 .1</X><Y>0.0,40 .1</Y></Field>\n<Field><FieldType>Acceleration</FieldType><Y>10</Y></Field></Emitter>\n'
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'peasplat.xml'
            source.write_text(particle_xml)
            output = Path(directory) / 'particle.json'
            first = write_particle(source, output, 'pvz:peasplat', image_grids={})
            before = output.read_bytes()
            write_particle(source, output, 'pvz:peasplat', image_grids={})
            self.assertEqual(output.read_bytes(), before)
            emitter = first['emitters'][0]
            self.assertEqual(emitter['frameCount'], 4)
            self.assertEqual(first['emitters'][1]['frameCount'], 3)
            self.assertEqual(first['emitters'][1]['fields'][1]['type'], 'acceleration')
            self.assertEqual(emitter['particleAlpha']['nodes'], [
                {'time': .7, 'low': .9, 'high': .9}, {'time': 1, 'low': 0, 'high': 0},
            ])

    def test_seedpacketflash_particle_offsets_and_default_frame(self):
        particle_xml = '\n<Emitter><Image>IMAGE_SEEDPACKETFLASH</Image><SpawnMinActive>1</SpawnMinActive>\n<ParticleAlpha>0 1,40 0</ParticleAlpha><ParticleDuration>25</ParticleDuration>\n<EmitterOffsetX>25</EmitterOffsetX><EmitterOffsetY>35</EmitterOffsetY></Emitter>\n'
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'seedpacketflash.xml'
            source.write_text(particle_xml)
            output = Path(directory) / 'particle.json'
            first = write_particle(source, output, 'pvz:seedpacketflash', image_grids={})
            before = output.read_bytes()
            write_particle(source, output, 'pvz:seedpacketflash', image_grids={})
            self.assertEqual(output.read_bytes(), before)
            emitter = first['emitters'][0]
            self.assertEqual(emitter['frameCount'], 1)
            self.assertEqual(emitter['emitterOffsetX']['nodes'][0]['low'], 25)
            self.assertEqual(emitter['emitterOffsetY']['nodes'][0]['low'], 35)
            self.assertEqual(emitter['particleAlpha']['nodes'], [
                {'time': 0, 'low': 0, 'high': 0}, {'time': .4, 'low': 1, 'high': 1},
                {'time': 1, 'low': 0, 'high': 0},
            ])


if __name__ == '__main__':
    unittest.main()
