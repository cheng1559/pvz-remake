import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / 'tools'))

from pvz.doors import FRONT_YARD, PARTS, Picture, over, places, remake_mod

RANDOM = np.random.default_rng(7)


def picture(width, height, scale=1, hole=False):
    """A door picture: random colors, a soft edge column on its right, and (`hole`) a see-through doorway in its middle."""
    pixels = np.concatenate([RANDOM.integers(0, 256, (height * scale, width * scale, 3)), np.full((height * scale, width * scale, 1), 255)], -1)
    pixels[:, -scale:, 3] = 128
    if hole:
        pixels[height * scale // 4:height * scale * 3 // 4, width * scale // 3:, 3] = 0
    return Image.fromarray(pixels.astype(np.uint8), 'RGBA')


def front_yard(folder: Path, scale=1, door_scale=1):
    """A Mod with a front yard of its own: backgrounds by day and by night, and door pictures the originals' sizes apart."""
    sprites = {}
    sizes = {'interior': {'day': (5, 9), 'night': (9, 13)}, 'doorway': {'day': (6, 12), 'night': (5, 10)}}
    for time, (background, door) in FRONT_YARD.items():
        ground = RANDOM.integers(0, 256, (600 * scale, 1400 * scale, 3)).astype(np.uint8)
        Image.fromarray(ground, 'RGB').save(folder / f'{background}.png')
        sprites[f'pvz:{background}'] = {'file': f'{background}.png', 'width': 1400, 'height': 600, **({'scale': scale} if scale != 1 else {})}
        for part, (name, _, _) in door.items():
            width, height = sizes[part][time]
            picture(width, height, door_scale, hole=part == 'doorway').save(folder / f'{name}.png')
            sprites[f'pvz:{name}'] = {'file': f'{name}.png', 'width': width, 'height': height,
                                      'rect': [0, 0, width - 1, height], 'offset': [-0.5, 0], **({'scale': door_scale} if door_scale != 1 else {})}
    (folder / 'content.json').write_text(json.dumps({'resources': {'sprites': sprites}}, indent=4) + '\n', encoding='utf-8')
    return sprites


def look(folder: Path, sprites: dict, time: str, places_by_part: dict, scale=1, door_scale=1):
    """A time's house as the game draws it, not blending: its background, its interior, its doorway mask; over a fixed rectangle."""
    background, door = FRONT_YARD[time]
    rect = (-140, 190, -100, 240)
    ground = Picture.load(folder / sprites[f'pvz:{background}']['file'], scale)
    shown = ground.on(rect, scale)
    for part in PARTS:
        name = door[part][0]
        entry = json.loads((folder / 'content.json').read_text())['resources']['sprites'][f'pvz:{name}']
        over(shown, Picture.load(folder / entry['file'], entry.get('scale', 1), places_by_part[time][part], scale).on(rect, scale))
    return shown


class DoorTests(unittest.TestCase):
    def test_front_yard_doors_alike_by_day_and_by_night(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            sprites = front_yard(folder)
            original = {time: {part: door[part][1:] for part in PARTS} for time, (_, door) in FRONT_YARD.items()}
            before = {time: look(folder, sprites, time, original) for time in FRONT_YARD}
            report = remake_mod(folder)
            self.assertEqual(len(report), 2, report)
            made = {time: {part: places()[part] for part in PARTS} for time in FRONT_YARD}
            after = {time: look(folder, sprites, time, made) for time in FRONT_YARD}
            for time in FRONT_YARD:
                self.assertLess(np.abs(before[time] - after[time])[..., :3].max(), 1 / 255, f'{time} looks as before')
            index = json.loads((folder / 'content.json').read_text())['resources']['sprites']
            for part in PARTS:
                names = [door[part][0] for _, door in FRONT_YARD.values()]
                entries = [index[f'pvz:{name}'] for name in names]
                self.assertEqual({(entry['width'], entry['height']) for entry in entries}.__len__(), 1, f'{part}: one size')
                for entry in entries:
                    self.assertEqual((entry['rect'], entry['offset']), ([0, 0, entry['width'], entry['height']], [0, 0]))
                    with Image.open(folder / entry['file']) as image:
                        self.assertEqual(image.size, (entry['width'], entry['height']))
                        alpha = np.asarray(image)[..., 3]
                    self.assertTrue(set(np.unique(alpha)) <= {0, 255}, f'{part}: whole or not drawn')
            # The doorway the zombie walks into stays see-through.
            with Image.open(folder / index['pvz:background1_gameover_mask']['file']) as image:
                self.assertEqual(np.asarray(image)[..., 3].min(), 0)
            # The old time's going out over the new one's is the two looks blended.
            rect = (-140, 190, -100, 240)
            for weight in (0.25, 0.5):
                shown = Picture.load(folder / 'background2.png').on(rect, 1)
                over(shown, Picture.load(folder / 'background1.png').on(rect, 1) * np.array([1, 1, 1, 1 - weight]))
                for part in PARTS:
                    night, day = (Picture.load(folder / index[f'pvz:{FRONT_YARD[time][1][part][0]}']['file'], at=places()[part]).on(rect, 1)
                                  for time in ('night', 'day'))
                    over(shown, night)
                    over(shown, day * np.array([1, 1, 1, 1 - weight]))
                blended = before['day'] * (1 - weight) + before['night'] * weight
                self.assertLess(np.abs(shown - blended)[..., :3].max(), 2 / 255, f'blended at {weight}')
            # Once alike, they are left as they are.
            files = {name: (folder / f'{name}.png').read_bytes() for _, door in FRONT_YARD.values() for name, _, _ in door.values()}
            self.assertTrue(all('alike already' in line for line in remake_mod(folder)))
            self.assertEqual(files, {name: (folder / f'{name}.png').read_bytes() for name in files})

    def test_door_pictures_come_out_at_their_backgrounds_scale(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            front_yard(folder, scale=2)
            remake_mod(folder)
            index = json.loads((folder / 'content.json').read_text())['resources']['sprites']
            entry = index['pvz:background2_gameover_mask']
            self.assertEqual(entry['scale'], 2)
            with Image.open(folder / entry['file']) as image:
                self.assertEqual(image.size, (entry['width'] * 2, entry['height'] * 2))

    def test_a_mod_without_a_front_yard_of_its_own_is_left_alone(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'content.json').write_text('{"resources":{"sprites":{}}}\n', encoding='utf-8')
            self.assertIn('no front yard of its own', remake_mod(folder)[0])
            self.assertEqual((folder / 'content.json').read_text(), '{"resources":{"sprites":{}}}\n')

    def test_the_presentation_puts_the_door_where_its_pictures_are_made_to_lie(self):
        boards = json.loads((ROOT / 'mods/pvz-base/presentation/definitions/boards.json').read_text(encoding='utf-8'))
        for id in ('pvz:frontyard', 'pvz:frontyard-unsodded'):
            game_over = boards[id]['gameOver']
            self.assertEqual({part: (game_over[part]['x'], game_over[part]['y']) for part in PARTS}, places(), id)


if __name__ == '__main__':
    unittest.main()
