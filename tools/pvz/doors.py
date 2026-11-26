"""
The front yard's house door made alike by day and by night, so `/time`'s change of time of day blends it as it blends
the lawn.

Board::DrawHouseDoorBottom draws a time's door interior (the open door, under the zombie walking in) and
Board::DrawHouseDoorTop its doorway mask (the frame, over the zombie), each a picture cut from that time's background.
By day and by night they lie at slightly different places and sizes, and their edges are soft: wherever one time's
picture draws and the other's does not, or both only partly, the old time's going out over the new one's
(LevelGameOverPresenter.timeBlend) counts what lies under them twice. So every time's pictures of a part are remade to
one place and size (the union of their rectangles), whole wherever any time's picture draws, each pixel what its own time
shows there: its background, under the doorway mask its interior too, the picture over it. Where none draws they draw
nothing, the doorway the zombie walks into included. Not blending, each time looks as before, but for the zombie, which
the doorway's soft edge no longer shows through.

The base converter makes the base game's alike (make_alike); a Mod with front yard pictures of its own remakes those:

    python -m tools.pvz.doors mods/<name> [--namespace widescreen]

A Mod's pictures come out at its background's scale, a door picture of a lower one scaled up first. A Mod whose door
pictures are alike already (each part's of one size) is left as it is, its sprites given that size; otherwise all four
must be the originals.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

# The original's front yard (Board::DrawHouseDoorBottom, Board::DrawHouseDoorTop): each time's background, and its door's
# pictures with their top lefts on the board.
FRONT_YARD = {
    'day': ('background1', {'interior': ('background1_gameover_interior_overlay', -126, 225),
                            'doorway': ('background1_gameover_mask', -130, 202)}),
    'night': ('background2', {'interior': ('background2_gameover_interior_overlay', -125, 196),
                              'doorway': ('background2_gameover_mask', -128, 207)}),
}
PARTS = ('interior', 'doorway')
# The board point a background hangs about: the original's 1400 x 600 lies at (-220, 0), TV115's 1880 x 720 at (-460, -60).
BACKGROUND_MIDDLE = (480, 300)


def places() -> dict[str, tuple[int, int]]:
    """Where each part of the door lies, by day and by night alike, once made alike (presentation boards' `gameOver`)."""
    return {part: (min(door[part][1] for _, door in FRONT_YARD.values()), min(door[part][2] for _, door in FRONT_YARD.values()))
            for part in PARTS}


class Picture:
    """An image as straight-alpha floats, `scale` pixels to the board's unit, its top left at `at` on the board."""

    def __init__(self, pixels: np.ndarray, scale: float, at: tuple[float, float]):
        self.pixels, self.scale, self.at = pixels, scale, at

    @classmethod
    def load(cls, path: Path, scale: float = 1, at: tuple[float, float] | None = None, to: float | None = None) -> Picture:
        """The image at `path`; `at` left out, a background's place (BACKGROUND_MIDDLE); `to`, the scale to resample it to."""
        with Image.open(path) as image:
            image = image.convert('RGBA')
        if to is not None and to != scale:
            image = image.resize((round(image.width * to / scale), round(image.height * to / scale)), Image.LANCZOS)
            scale = to
        size = image.width / scale, image.height / scale
        if at is None:
            at = BACKGROUND_MIDDLE[0] - size[0] / 2, BACKGROUND_MIDDLE[1] - size[1] / 2
        return cls(np.asarray(image).astype(np.float64) / 255, scale, at)

    @property
    def size(self) -> tuple[float, float]:
        return self.pixels.shape[1] / self.scale, self.pixels.shape[0] / self.scale

    def rect(self) -> tuple[float, float, float, float]:
        return self.at[0], self.at[1], self.at[0] + self.size[0], self.at[1] + self.size[1]

    def on(self, rect: tuple[float, float, float, float], scale: float) -> np.ndarray:
        """Its pixels over the board rectangle `rect` at `scale`: transparent where it does not lie."""
        if scale != self.scale:
            raise ValueError(f'A picture at scale {self.scale} is drawn at {scale}')
        canvas = np.zeros((round((rect[3] - rect[1]) * scale), round((rect[2] - rect[0]) * scale), 4))
        ox, oy = round((self.at[0] - rect[0]) * scale), round((self.at[1] - rect[1]) * scale)
        x0, y0 = max(0, -ox), max(0, -oy)
        x1, y1 = min(self.pixels.shape[1], canvas.shape[1] - ox), min(self.pixels.shape[0], canvas.shape[0] - oy)
        if x1 > x0 and y1 > y0:
            canvas[oy + y0:oy + y1, ox + x0:ox + x1] = self.pixels[y0:y1, x0:x1]
        return canvas


def over(dst: np.ndarray, src: np.ndarray) -> np.ndarray:
    """`src` drawn over the opaque `dst`, in place."""
    alpha = src[..., 3:4]
    dst[..., :3] = src[..., :3] * alpha + dst[..., :3] * (1 - alpha)
    return dst


def alike(times: dict[str, tuple[Picture, dict[str, Picture]]]) -> tuple[dict[str, dict[str, np.ndarray]], dict[str, tuple]]:
    """
    Each time's door pictures made alike (the module's doc): `times` gives each time's background and its pictures by
    part, all at the background's scale. Returns the pictures made, by time and part, and each part's board rectangle.
    """
    made: dict[str, dict[str, np.ndarray]] = {time: {} for time in times}
    rects = {}
    for part in PARTS:
        pictures = [door[part].rect() for _, door in times.values()]
        rect = rects[part] = (min(r[0] for r in pictures), min(r[1] for r in pictures), max(r[2] for r in pictures), max(r[3] for r in pictures))
        scale = {background.scale for background, _ in times.values()}
        if len(scale) != 1:
            raise ValueError(f'The backgrounds are at different scales: {sorted(scale)}')
        scale = scale.pop()
        draws = np.zeros((round((rect[3] - rect[1]) * scale), round((rect[2] - rect[0]) * scale)), bool)
        for _, door in times.values():
            draws |= door[part].on(rect, scale)[..., 3] > 0
        for time, (background, door) in times.items():
            # What the time shows there: its background, under the doorway mask its interior, the picture over it.
            shown = background.on(rect, scale)
            shown[..., 3] = 1
            if part == 'doorway':
                over(shown, door['interior'].on(rect, scale))
            over(shown, door[part].on(rect, scale))
            shown[~draws] = 0
            made[time][part] = shown
    return made, rects


def save(pixels: np.ndarray, path: Path) -> None:
    Image.fromarray(np.round(pixels * 255).astype(np.uint8), 'RGBA').save(path)


def make_alike(images: Path) -> None:
    """The base converter's front yard doors made alike in place, among its images (all at scale 1) in `images`."""
    times = {time: (Picture.load(images / f'{background}.png'),
                    {part: Picture.load(images / f'{name}.png', at=(x, y)) for part, (name, x, y) in door.items()})
             for time, (background, door) in FRONT_YARD.items()}
    made, _ = alike(times)
    for time, (_, door) in FRONT_YARD.items():
        for part, (name, _, _) in door.items():
            save(made[time][part], images / f'{name}.png')


def remake_mod(mod: Path, namespace: str = 'pvz') -> list[str]:
    """
    A Mod's front yard doors made alike in place, the sprites of `namespace` its content.json registers: their files
    rewritten and their entries given their new size and scale. Returns what it did, a line each.
    """
    index_path = mod / 'content.json'
    text = index_path.read_text(encoding='utf-8')
    index = json.loads(text)
    sprites = index.get('resources', {}).get('sprites', {})
    ids = [f'{namespace}:{background}' for background, _ in FRONT_YARD.values()]
    ids += [f'{namespace}:{name}' for _, door in FRONT_YARD.values() for name, _, _ in door.values()]
    missing = [id for id in ids if id not in sprites]
    if missing:
        return [f'{mod.name}: no front yard of its own in {namespace} (missing {", ".join(missing)})']

    def entry(name: str) -> dict:
        return sprites[f'{namespace}:{name}']

    def logical(name: str) -> tuple[float, float]:
        """A sprite file's size in the board's unit."""
        sprite = entry(name)
        with Image.open(mod / sprite['file']) as image:
            return image.width / sprite.get('scale', 1), image.height / sprite.get('scale', 1)

    def describe(name: str, size: tuple[float, float], scale: float) -> None:
        sprite = entry(name)
        width, height = (int(v) if v == int(v) else v for v in size)
        sprite.update(width=width, height=height)
        if scale == 1:
            sprite.pop('scale', None)
        else:
            sprite['scale'] = int(scale) if scale == int(scale) else scale
        if 'rect' in sprite:
            sprite['rect'] = [0, 0, width, height]
        if 'offset' in sprite:
            sprite['offset'] = [0, 0]

    names = {part: [door[part][0] for _, door in FRONT_YARD.values()] for part in PARTS}
    report = []
    if all(len({logical(name) for name in names[part]}) == 1 for part in PARTS):
        # Alike already: their sprites take the files' size (a generator may have written the originals' again).
        for part in PARTS:
            size = logical(names[part][0])
            for name in names[part]:
                describe(name, size, entry(name).get('scale', 1))
            report.append(f'{mod.name}: {namespace} {part} alike already ({size[0]:g} x {size[1]:g})')
    else:
        for name in (name for part in PARTS for name in names[part]):
            sprite = entry(name)
            if logical(name) != (sprite['width'], sprite['height']):
                raise ValueError(f'{mod.name}: {namespace}:{name} is {logical(name)} but its sprite says {sprite["width"]} x {sprite["height"]}'
                                 ': not an original (restore the originals of all four pictures)')
        times = {}
        for time, (background, door) in FRONT_YARD.items():
            ground = Picture.load(mod / entry(background)['file'], entry(background).get('scale', 1))
            if (ground.size[0], ground.size[1]) != (entry(background)['width'], entry(background)['height']):
                raise ValueError(f'{mod.name}: {namespace}:{background} does not match its sprite')
            times[time] = (ground, {part: Picture.load(mod / entry(name)['file'], entry(name).get('scale', 1), (x, y), ground.scale)
                                    for part, (name, x, y) in door.items()})
        made, rects = alike(times)
        for part in PARTS:
            rect = rects[part]
            for time, (_, door) in FRONT_YARD.items():
                name = door[part][0]
                save(made[time][part], mod / entry(name)['file'])
                describe(name, (rect[2] - rect[0], rect[3] - rect[1]), times[time][0].scale)
            report.append(f'{mod.name}: {namespace} {part} made alike ({rect[2] - rect[0]:g} x {rect[3] - rect[1]:g} at {rect[0]:g}, {rect[1]:g})')
    # Only the door's sprite entries are rewritten, each in its own layout; the rest of the file stays as it is.
    raw = index_path.read_bytes().decode('utf-8')
    for _, door in FRONT_YARD.values():
        for name, _, _ in door.values():
            raw = rewrite_entry(raw, f'{namespace}:{name}', entry(name))
    index_path.write_bytes(raw.encode('utf-8'))
    return report


def rewrite_entry(text: str, id: str, entry: dict) -> str:
    """The JSON `text` with the object under the key `id` (one without objects inside) written anew as `entry`, laid out as it was."""
    escaped = all(ord(character) < 128 for character in text)
    match = re.search(re.escape(json.dumps(id, ensure_ascii=escaped)) + r'\s*:\s*\{', text)
    if not match:
        raise ValueError(f'No {id} in the content index')
    start = match.end() - 1
    end = text.index('}', start) + 1
    old = text[start:end]
    if '\n' not in old:
        separators = (', ', ': ') if '": ' in old else (',', ':')
        new = json.dumps(entry, ensure_ascii=escaped, separators=separators)
    else:
        newline = '\r\n' if '\r\n' in old else '\n'
        lines = old.split(newline)
        base = len(lines[-1]) - len(lines[-1].lstrip(' '))
        step = len(lines[1]) - len(lines[1].lstrip(' ')) - base
        new = json.dumps(entry, ensure_ascii=escaped, indent=step).replace('\n', newline + ' ' * base)
    return text[:start] + new + text[end:]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mod', type=Path, help='the Mod folder, its content.json registering the front yard pictures')
    parser.add_argument('--namespace', default='pvz', help="the sprites' namespace (pvz; widescreen for the TV pictures)")
    args = parser.parse_args()
    for line in remake_mod(args.mod, args.namespace):
        print(line)


if __name__ == '__main__':
    main()
