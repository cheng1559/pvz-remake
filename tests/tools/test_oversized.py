import math
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[2] / 'tools'))

from pvz.oversized import DROPPED, normalize_clip, normalize_dancers, shrink


def key(x, y, scale_x=1.0, scale_y=1.0, skew_x=0.0, skew_y=0.0, sprite=None):
    return {'timeSeconds': 0, 'x': x, 'y': y, 'scaleX': scale_x, 'scaleY': scale_y, 'skewX': skew_x, 'skewY': skew_y,
            'alpha': 1, 'sprite': sprite, 'interpolation': 'linear'}


def corner(frame, u, v):
    # A point (u, v) of a track's image, Y down, as the Reanim draws it.
    kx, ky = -frame['skewX'] * math.pi / 180, -frame['skewY'] * math.pi / 180
    return (frame['scaleX'] * math.cos(kx) * u + frame['scaleY'] * math.sin(ky) * v + frame['x'],
            -frame['scaleX'] * math.sin(kx) * u + frame['scaleY'] * math.cos(ky) * v + frame['y'])


def centroid(image):
    alpha = image.getchannel('A')
    total = sx = sy = 0
    for y in range(image.height):
        for x in range(image.width):
            a = alpha.getpixel((x, y))
            total, sx, sy = total + a, sx + a * (x + 0.5), sy + a * (y + 0.5)
    return sx / total, sy / total


class ShrinkTests(unittest.TestCase):
    def test_a_reanim_image_shrinks_about_its_top_left(self):
        image = Image.new('RGBA', (33, 35), (200, 100, 50, 255))
        small = shrink(image, centered=False)
        # 33 grows to 35 on the right, so the picture is 0.8 of itself from the same corner.
        self.assertEqual(small.size, (28, 28))
        self.assertEqual(small.getchannel('A').getbbox()[:2], (0, 0))
        self.assertAlmostEqual(centroid(small)[0], 0.8 * 33 / 2, delta=0.05)

    def test_a_particle_image_shrinks_about_its_middle(self):
        image = Image.new('RGBA', (94, 86), (0, 0, 0, 0))
        image.paste((255, 255, 255, 255), (20, 10, 60, 70))
        small = shrink(image, centered=True)
        # 94 and 86 grow evenly on both sides to 100 and 90.
        self.assertEqual(small.size, (80, 72))
        before, after = centroid(image), centroid(small)
        self.assertAlmostEqual(after[0] - small.width / 2, 0.8 * (before[0] - image.width / 2), delta=0.05)
        self.assertAlmostEqual(after[1] - small.height / 2, 0.8 * (before[1] - image.height / 2), delta=0.05)

    def test_an_hd_image_shrinks_by_its_logical_pixels(self):
        self.assertEqual(shrink(Image.new('RGBA', (134, 160)), centered=False, density=2).size, (112, 128))
        self.assertEqual(shrink(Image.new('RGBA', (67, 80)), centered=False).size, (56, 64))
        with self.assertRaises(ValueError):
            shrink(Image.new('RGBA', (133, 160)), centered=False, density=2)


class NormalizeClipTests(unittest.TestCase):
    def clip(self, *tracks):
        return {'id': 'pvz:dancer_walk', 'tracks': [{'id': id, 'zIndex': index, 'keyframes': keys} for index, (id, keys) in enumerate(tracks)]}

    def test_every_frame_draws_where_the_original_draws_it_at_0_8(self):
        clip = self.clip(
            ('body', [key(12.5, -40, 0.8, 0.79, 10, 12, 'pvz:big'), key(20, -35, 1.0, 0.8, -30, -28, None)]),
            ('head', [key(-3, -80, 1.06, 1.06, 5, 5, 'pvz:normal')]),
            ('_ground', [key(-9.8, 0), key(5, 0)]),
        )
        normalized = normalize_clip(clip, {'pvz:big'})
        for track, after in zip(clip['tracks'], normalized['tracks']):
            shrunk = track['id'] == 'body'
            for old, new in zip(track['keyframes'], after['keyframes']):
                for u, v in ((0, 0), (40, 0), (0, 30), (40, 30)):
                    x, y = corner(old, u, v)
                    expected = (30 + 0.8 * (x - 30), 120 + 0.8 * (y - 120))
                    actual = corner(new, 0.8 * u, 0.8 * v) if shrunk else corner(new, u, v)
                    self.assertAlmostEqual(actual[0], expected[0], places=5)
                    self.assertAlmostEqual(actual[1], expected[1], places=5)
        self.assertEqual([key['x'] for key in normalized['tracks'][2]['keyframes']], [-1.84, 10.0])

    def test_a_track_drawing_both_kinds_of_image_is_refused(self):
        clip = self.clip(('arm', [key(0, 0, sprite='pvz:big'), key(0, 0, sprite='pvz:normal')]))
        with self.assertRaises(ValueError):
            normalize_clip(clip, {'pvz:big'})


class NormalizeDancersTests(unittest.TestCase):
    def test_images_are_shrunk_and_nothing_else_may_draw_them(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            images = [root / 'zombie_disco_hair.png', root / 'zombie_disco_chops.png']
            particles = [root / f"{sprite.split(':')[1]}.png" for sprite in DROPPED]
            for file in images + particles:
                Image.new('RGBA', (94, 86), (10, 20, 30, 255)).save(file)
            dancer = {'id': 'pvz:dancer_walk', 'tracks': [
                {'id': 'hair', 'zIndex': 0, 'keyframes': [key(0, 0, 0.8, 0.8, sprite='pvz:zombie_disco_hair')]},
                {'id': 'chops', 'zIndex': 1, 'keyframes': [key(0, 0, sprite='pvz:zombie_disco_chops')]},
            ]}
            other = {'id': 'pvz:zombie_walk', 'tracks': [{'id': 'hair', 'zIndex': 0, 'keyframes': [key(0, 0, sprite='pvz:zombie_disco_hair')]}]}
            with self.assertRaises(ValueError):
                normalize_dancers({'pvz:dancer_walk': ('zombie_disco', dancer), 'pvz:zombie_walk': ('zombie', other)}, images, particles)
            clips = {'pvz:dancer_walk': ('zombie_disco', dancer)}
            shrunk = normalize_dancers(clips, images, particles)
            self.assertEqual(shrunk, {'pvz:zombie_disco_hair'} | DROPPED)
            sizes = []
            for file in images + particles:
                with Image.open(file) as image:
                    sizes.append(image.size)
            self.assertEqual(sizes, [(76, 72), (94, 86), (80, 72)])
            hair, chops = clips['pvz:dancer_walk'][1]['tracks']
            self.assertEqual([hair['keyframes'][0]['scaleX'], chops['keyframes'][0]['scaleX']], [0.8, 0.8])
            self.assertEqual([hair['keyframes'][0]['x'], hair['keyframes'][0]['y']], [6.0, 24.0])


if __name__ == '__main__':
    unittest.main()
