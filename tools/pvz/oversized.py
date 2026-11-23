"""
The dancers' art (the Dancing Zombie's and the Backup Dancer's) is drawn a quarter larger than every other zombie's,
and the original shrinks it back by drawing the two at Zombie::mScaleZombie 0.8 about (30, 120) of their Reanim.
Converted to the others' size, they are drawn at 1 just where the original has them:

- each image their Reanims draw is shrunk to 0.8 (shrink), but for the few already at the others' size (NORMAL_SIZE);
  so are the parts they drop of the same art (DROPPED);
- each keyframe of their Reanims comes 0.8 of its way from (30, 120), and one whose image is not shrunk (or that draws
  none) is drawn at 0.8 as well (normalize_clip).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

SCALE = 0.8
PIVOT = (30, 120)
# The original Reanims of the two dancers.
REANIMS = frozenset({'zombie_disco', 'zombie_backup'})
# The images the dancers' Reanims draw at the others' size: their head and chops, the medallion and the jaw (which
# every zombie has).
NORMAL_SIZE = frozenset({'pvz:zombie_dancer__head', 'pvz:zombie_disco_chops', 'pvz:zombie_disco_medalion', 'pvz:zombie_jaw'})
# Their dropped parts' images that no Reanim draws: the Dancing Zombie's head (the Backup Dancer's is at the others' size).
DROPPED = frozenset({'pvz:zombiedancerhead_disco'})
# 0.8 of an image comes out in whole pixels from a multiple of 5.
_STEP = 5


def normalize_dancers(clips: dict[str, tuple[str, dict[str, Any]]], images: list[Path], particle_images: list[Path]) -> frozenset[str]:
    """
    Converts the dancers in place: their clips in `clips` (by ID, each with the name of its Reanim) and their image
    files, a Reanim's (`images`) shrunk about its top left and a particle's (`particle_images`) about its middle.
    Returns the shrunk sprites, which nothing else may draw.
    """
    dancers = sorted(id for id, (name, _) in clips.items() if name in REANIMS)
    shrunk = frozenset(set().union(*(clip_sprites(clips[id][1]) for id in dancers)) - NORMAL_SIZE | DROPPED)
    for id, (_, clip) in clips.items():
        if id not in dancers and clip_sprites(clip) & shrunk:
            raise ValueError(f'{id} draws images of the dancers: {sorted(clip_sprites(clip) & shrunk)}')
    files = {f'pvz:{file.stem}': (file, False) for file in images} | {f'pvz:{file.stem}': (file, True) for file in particle_images}
    if shrunk - files.keys():
        raise ValueError(f'dancer images not converted: {sorted(shrunk - files.keys())}')
    for sprite in sorted(shrunk):
        file, centered = files[sprite]
        with Image.open(file) as image:
            small = shrink(image, centered=centered)
        small.save(file)
    for id in dancers:
        name, clip = clips[id]
        clips[id] = (name, normalize_clip(clip, shrunk))
    return shrunk


def shrink(image: Image.Image, *, centered: bool, density: int = 1) -> Image.Image:
    """
    `image` at 0.8 of its size. It first grows to a multiple of 5 (logical) pixels each way with transparent ones,
    so its picture shrinks by exactly 0.8, about its top left where a Reanim draws it from, or `centered` about its
    middle where a particle is drawn from. `density`: its pixels to a logical one (an HD image's 2).
    """
    width, height = image.size
    if width % density or height % density:
        raise ValueError(f'image size {width}x{height} is not a whole number of logical pixels at density {density}')
    pads = [_pad(size // density, centered) * density for size in (width, height)]
    canvas = Image.new('RGBA', (width + pads[0], height + pads[1]), (0, 0, 0, 0))
    canvas.paste(image.convert('RGBA'), (pads[0] // 2, pads[1] // 2) if centered else (0, 0))
    # Pillow resizes RGBA with its alpha premultiplied, so no edge takes the color of a transparent pixel.
    return canvas.resize((canvas.width * 4 // _STEP, canvas.height * 4 // _STEP), Image.Resampling.LANCZOS)


def _pad(size: int, centered: bool) -> int:
    # About the middle the padding is split evenly, so it is the even one of the two that come to a multiple of 5.
    return next(pad for pad in range(2 * _STEP) if (size + pad) % _STEP == 0 and (not centered or pad % 2 == 0))


def clip_sprites(clip: dict[str, Any]) -> set[str]:
    """The sprites a Reanim clip draws."""
    return {key['sprite'] for track in clip['tracks'] for key in track['keyframes'] if key.get('sprite')}


def normalize_clip(clip: dict[str, Any], shrunk: frozenset[str] | set[str]) -> dict[str, Any]:
    """
    A dancer's Reanim clip as drawn at 1: every keyframe 0.8 of its way from (30, 120), and scaled to 0.8 on a track
    whose images are not `shrunk` (sprite IDs; one with none is not). A track draws either kind, not both.
    """
    tracks = []
    for track in clip['tracks']:
        sprites = {key['sprite'] for key in track['keyframes'] if key.get('sprite')}
        if sprites & shrunk and sprites - shrunk:
            raise ValueError(f"{clip['id']} track {track['id']} draws shrunk and unshrunk images: {sorted(sprites)}")
        scale = 1 if sprites & shrunk else SCALE
        keyframes = [{**key,
                      'x': _round(PIVOT[0] * (1 - SCALE) + SCALE * key['x']),
                      'y': _round(PIVOT[1] * (1 - SCALE) + SCALE * key['y']),
                      'scaleX': _round(scale * key['scaleX']),
                      'scaleY': _round(scale * key['scaleY'])} for key in track['keyframes']]
        tracks.append({**track, 'keyframes': keyframes})
    return {**clip, 'tracks': tracks}


def _round(value: float) -> float:
    # The original's frames have six decimals.
    return round(value, 6) + 0.0
