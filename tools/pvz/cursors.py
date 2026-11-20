"""The original mouse cursors, extracted from PlantsVsZombies.exe (they are not in main.pak).

LawnApp::EnforceCursor shows a big arrow from the executable's cursor resource, and SexyAppFramework's
finger and dragging hands, which CreateCursor builds from 32x32 AND/XOR masks in the program data.
Each is found by its SHA-1, so resource IDs and data offsets may differ between game versions.
"""
from __future__ import annotations

import hashlib
import struct

from PIL import Image

from .pe import RT_CURSOR, resources

ARROW_SHA1 = "84414ed41956b7fdf21cc2432185fc101bb8b0a4"
# (name, SHA-1 of the 256-byte AND+XOR masks, 8 bytes at offset 16 used to find them; the first rows are blank).
MASKS = [
    ("hand", "10d8f763349848110d2646c64ad284b9b2054750", "ffe7ffffffc3ffff"),
    ("dragging", "3a30fb03b280418253fb6f488739200cd049c7d2", "fffe7ffffffc0fff"),
]


def arrow(exe: bytes) -> Image.Image:
    """The big arrow: an RT_CURSOR entry (hotspot, then a palette DIB with its AND mask below the colours)."""
    for resource in resources(exe, RT_CURSOR).values():
        hotspot, dib = struct.unpack_from("<HH", resource), resource[4:]
        if hashlib.sha1(dib).hexdigest() != ARROW_SHA1:
            continue
        assert hotspot == (0, 0), hotspot
        header, width, height, _, bits = struct.unpack_from("<IiiHH", dib)
        height //= 2
        palette = [(dib[header + 4 * i + 2], dib[header + 4 * i + 1], dib[header + 4 * i]) for i in range(1 << bits)]
        pixels = header + 4 * len(palette)
        stride = (width * bits + 31) // 32 * 4
        mask, mask_stride = pixels + stride * height, (width + 31) // 32 * 4
        image = Image.new("RGBA", (width, height))
        for row in range(height):
            for x in range(width):
                bit = x * bits
                index = dib[pixels + row * stride + bit // 8] >> (8 - bits - bit % 8) & ((1 << bits) - 1)
                # AND=1 keeps the screen; the original arrow uses it only for its transparent background.
                clear = dib[mask + row * mask_stride + x // 8] >> (7 - x % 8) & 1
                image.putpixel((x, height - 1 - row), (0, 0, 0, 0) if clear else (*palette[index], 255))
        return image
    raise ValueError("The original arrow cursor resource is missing; is this PlantsVsZombies.exe?")


def hand(exe: bytes, digest: str, anchor: str) -> Image.Image:
    """A CreateCursor hand: 32x32 AND mask then XOR mask, one bit per pixel, top row first."""
    marker, found = bytes.fromhex(anchor), exe.find(bytes.fromhex(anchor))
    while found >= 0:
        data = exe[found - 16:found - 16 + 256]
        found = exe.find(marker, found + 1)
        if hashlib.sha1(data).hexdigest() == digest:
            image = Image.new("RGBA", (32, 32))
            for y in range(32):
                for x in range(32):
                    and_bit, xor_bit = (data[part + y * 4 + x // 8] >> (7 - x % 8) & 1 for part in (0, 128))
                    image.putpixel((x, y), (0, 0, 0, 0) if and_bit else (255, 255, 255, 255) if xor_bit else (0, 0, 0, 255))
            return image
    raise ValueError("A SexyAppFramework hand cursor is missing; is this PlantsVsZombies.exe?")


def extract_cursors(exe: bytes) -> dict[str, Image.Image]:
    """The three cursors by name: pointer (the big arrow), hand and dragging."""
    return {"pointer": arrow(exe), **{name: hand(exe, digest, anchor) for name, digest, anchor in MASKS}}
