import io
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools'))

from pvz.pak import extracted_pak, PAK_MAGIC, XOR_KEY
from pvz.fonts import convert_font
from pvz.images import convert_images, sprite_trim
from pvz.particles import build_particle, write_particle
from pvz.pe import RT_GROUP_ICON, RT_ICON, icon


def fake_exe(resources):
    """A PE32 file holding only a resource section: {type: {ID or name: data}}, one language each."""
    base, raw, section = 0x1000, 0x200, bytearray()

    def directory(children):
        start = len(section)
        named = sum(isinstance(key, str) for key, _ in children)
        section.extend(struct.pack('<IIHHHH', 0, 0, 0, 0, named, len(children) - named))
        slots = [(len(section) + 8 * i, key, value) for i, (key, value) in enumerate(children)]
        section.extend(bytes(8 * len(children)))
        for slot, key, value in slots:
            if isinstance(key, str):
                name, key = key, 0x80000000 | len(section)
                section.extend(struct.pack('<H', len(name)) + name.encode('utf-16-le'))
            if isinstance(value, bytes):
                entry = len(section)
                section.extend(struct.pack('<IIII', base + entry + 16, len(value), 0, 0) + value)
                struct.pack_into('<II', section, slot, key, entry)
            else:
                struct.pack_into('<II', section, slot, key, 0x80000000 | directory(value))
        return start

    directory([(kind, [(key, [(0x409, data)]) for key, data in entries.items()]) for kind, entries in resources.items()])
    header = bytearray(raw)
    struct.pack_into('<I', header, 0x3C, 0x40)
    header[0x40:0x44] = b'PE\0\0'
    struct.pack_into('<HH12xHH', header, 0x44, 0x14C, 1, 224, 0)
    struct.pack_into('<H', header, 0x58, 0x10B)
    struct.pack_into('<II', header, 0x58 + 96 + 2 * 8, base, len(section))
    struct.pack_into('<8sIIII', header, 0x58 + 224, b'.rsrc', len(section), base, len(section), raw)
    return bytes(header + section)


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

            outputs = lambda: sorted((path.name, path.read_bytes()) for path in output.iterdir())
            convert_font(source, output)
            first = outputs()
            convert_font(source, output)

            self.assertEqual(first, outputs())
            self.assertEqual([name for name, _ in first], ["testfont.json", "testfont_atlas.png"])

    def test_font_layers_find_their_images_whatever_the_case(self):
        # The PAK import lowercases file names; descriptors keep the original spelling, and an outline layer has an
        # image of its own.
        descriptor = """
Define CharList ('A');
Define WidthList (2);
Define RectList ((0, 0, 2, 2));
Define OffsetList ((0, 0));
CreateLayer Outline;
LayerSetImage Outline 'TestFontOutline';
LayerSetCharWidths Outline CharList WidthList;
LayerSetImageMap Outline CharList RectList;
LayerSetCharOffsets Outline CharList OffsetList;
CreateLayer Main;
LayerSetImage Main 'TestFont';
LayerSetCharWidths Main CharList WidthList;
LayerSetImageMap Main CharList RectList;
LayerSetCharOffsets Main CharList OffsetList;
SetDefaultPointSize 2;
"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "testfont.txt"
            source.write_text(descriptor, encoding="utf-8")
            Image.new("RGBA", (2, 2), (255, 255, 255, 255)).save(root / "testfont.png")
            Image.new("RGBA", (2, 2), (255, 0, 0, 255)).save(root / "testfontoutline.png")
            output = root / "output"
            convert_font(source, output)

            layers = json.loads((output / "testfont.json").read_text(encoding="utf-8"))["layers"]
            self.assertEqual([layer["image"] for layer in layers], ["testfontoutline_atlas", "testfont_atlas"])
            self.assertEqual(sorted(path.name for path in output.glob("*.png")),
                             ["testfont_atlas.png", "testfontoutline_atlas.png"])

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

    def test_a_sprite_is_trimmed_to_its_visible_pixels(self):
        image = Image.new('RGBA', (67, 80), (0, 0, 0, 0))
        image.paste((255, 0, 0, 255), (0, 0, 67, 66))
        # Cocos's trim: the box, and its middle from the image's, right and up.
        self.assertEqual(sprite_trim(image), ([0, 0, 67, 66], [0, 7]))
        image = Image.new('RGBA', (26, 40), (0, 0, 0, 0))
        image.paste((255, 0, 0, 1), (3, 6, 22, 40))
        self.assertEqual(sprite_trim(image), ([3, 6, 19, 34], [-0.5, -3]))
        self.assertEqual(sprite_trim(Image.new('RGBA', (4, 2), (0, 0, 0, 0))), ([0, 0, 0, 0], [-2, 1]))

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

    def test_full_screen_flash_keeps_its_white_pixel(self):
        # IceTrap's IceFlash: a FullScreen emitter on IMAGE_WHITEPIXEL fills the screen in its color.
        particle_xml = '\n<Emitter><Name>IceFlash</Name><SpawnMinActive>1</SpawnMinActive><SpawnMaxLaunched>1</SpawnMaxLaunched>\n<ParticleDuration>30</ParticleDuration><ParticleScale>1600</ParticleScale><ParticleAlpha>.5 0</ParticleAlpha>\n<Image>IMAGE_WHITEPIXEL</Image><ParticleRed>.5</ParticleRed><FullScreen>1</FullScreen></Emitter>\n'
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'icetrap.xml'
            source.write_text(particle_xml)
            emitter = write_particle(source, Path(directory) / 'particle.json', 'pvz:icetrap', image_grids={})['emitters'][0]
            self.assertEqual((emitter['name'], emitter['sprite'], emitter['fullScreen']), ('IceFlash', 'pvz:whitepixel', True))
            self.assertEqual(emitter['particleRed']['nodes'], [{'time': 0, 'low': .5, 'high': .5}])

    def test_an_exe_icon_group_becomes_an_ico_file(self):
        # The group lists its images by RT_ICON resource ID; the .ico lists them by file offset.
        frames = {}
        for image_id, size in ((7, 16), (9, 32)):
            png = io.BytesIO()
            Image.new('RGBA', (size, size), (size, 0, 0, 255)).save(png, 'PNG')
            frames[image_id] = png.getvalue()
        group = struct.pack('<HHH', 0, 1, 2) + b''.join(
            struct.pack('<BBBBHHIH', size, size, 0, 0, 1, 32, len(frames[image_id]), image_id)
            for image_id, size in ((7, 16), (9, 32)))
        exe = fake_exe({RT_ICON: frames, RT_GROUP_ICON: {'IDI_MAIN_ICON': group}})
        ico = Image.open(io.BytesIO(icon(exe, 'IDI_MAIN_ICON')))
        self.assertEqual(ico.ico.sizes(), {(16, 16), (32, 32)})
        for size in (16, 32):
            self.assertEqual(ico.ico.getimage((size, size)).convert('RGBA').getpixel((0, 0)), (size, 0, 0, 255))


if __name__ == '__main__':
    unittest.main()
