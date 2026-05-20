#!/usr/bin/env python3
"""
Convert PvZ ImageFont descriptors into Cocos Creator JSON and texture assets.

Usage:
    python tools/font_converter.py
"""

import re
import sys
import json
from pathlib import Path
from typing import Any

from PIL import Image

MAX_FONT_ATLAS_SIZE = 4096


def _read_text_with_encoding_detection(path: Path) -> str:
    data = path.read_bytes()
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')

    sample = data[:2000]
    if sample:
        odd_nuls = sample[1::2].count(0)
        even_nuls = sample[0::2].count(0)
        half_len = max(1, len(sample) // 2)
        if odd_nuls / half_len > 0.3:
            return data.decode('utf-16le')
        if even_nuls / half_len > 0.3:
            return data.decode('utf-16be')

    for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue

    return data.decode('utf-8', errors='replace')


def _normalize_image_stem(image_name: str) -> str:
    return image_name.lstrip('_') + '_atlas'


def _normalize_image_name(path: Path) -> str:
    return _normalize_image_stem(path.with_suffix('').name) + '.png'


def _find_font_image(basedir: Path, image_name: str) -> Path | None:
    for prefix in ['_', '']:
        for ext in ['.png', '.gif']:
            candidate = basedir / (prefix + image_name + ext)
            if candidate.exists():
                return candidate
    return None


def _normalize_font_mask_rgba(src: Path) -> Image.Image:
    with Image.open(src) as image:
        rgba = image.convert('RGBA')

    alpha = rgba.getchannel('A')
    alpha_histogram = alpha.histogram()
    has_transparency = sum(alpha_histogram[:255]) > 0
    if has_transparency:
        return rgba

    source = rgba.load()
    mask = Image.new('L', rgba.size, 0)
    mask_pixels = mask.load()
    width, height = rgba.size
    max_value = 0
    for y in range(height):
        for x in range(width):
            r, g, b, _a = source[x, y]
            value = max(r, g, b)
            mask_pixels[x, y] = value
            if value > max_value:
                max_value = value

    if max_value > 0 and max_value < 128:
        scale = 255 / max_value
        mask = mask.point(lambda value: min(255, round(value * scale)))

    normalized = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    normalized.putalpha(mask)
    return normalized


def _wrap_font_atlas_if_needed(font_data: dict, image_name: str, image: Image.Image) -> Image.Image:
    if image.width <= MAX_FONT_ATLAS_SIZE and image.height <= MAX_FONT_ATLAS_SIZE:
        return image

    if image.height > MAX_FONT_ATLAS_SIZE:
        raise ValueError(f"Font atlas is too tall for mobile WebGL: {image_name} {image.size}")

    layers = [layer for layer in font_data['layers'] if layer['image'] == image_name]
    if not layers:
        return image

    glyphs = []
    for layer in layers:
        for char_code, char_info in layer['chars'].items():
            rect = char_info['rect']
            glyphs.append((rect[1], rect[0], char_code, char_info))

    glyphs.sort()

    placements: list[tuple[dict, tuple[int, int, int, int], tuple[int, int]]] = []
    x = 0
    y = 0
    row_height = 0
    used_width = 0

    for _src_y, _src_x, _char_code, char_info in glyphs:
        src_x, src_y, width, height = char_info['rect']
        if width > MAX_FONT_ATLAS_SIZE:
            raise ValueError(f"Font glyph is too wide for mobile WebGL: {image_name} {width}px")
        if x > 0 and x + width > MAX_FONT_ATLAS_SIZE:
            y += row_height
            x = 0
            row_height = 0
        placements.append((char_info, (src_x, src_y, width, height), (x, y)))
        x += width
        used_width = max(used_width, x)
        row_height = max(row_height, height)

    used_height = y + row_height
    if used_height > MAX_FONT_ATLAS_SIZE:
        raise ValueError(f"Wrapped font atlas is still too tall for mobile WebGL: {image_name} {used_height}px")

    wrapped = Image.new('RGBA', (used_width, used_height), (0, 0, 0, 0))
    for char_info, src_rect, dst_pos in placements:
        src_x, src_y, width, height = src_rect
        dst_x, dst_y = dst_pos
        wrapped.paste(image.crop((src_x, src_y, src_x + width, src_y + height)), dst_pos)
        char_info['rect'] = [dst_x, dst_y, width, height]

    print(f"[font] Wrapped oversized atlas: {image_name} {image.size} -> {wrapped.size}")
    return wrapped


class PvZFontParser:
    """Parse a PvZ font descriptor file."""

    def __init__(self, filepath: Path):
        self.filepath = filepath
        self.basedir = filepath.parent
        self.defines: dict[str, Any] = {}
        self.layers: list[dict[str, Any]] = []
        self.char_map: dict[int, int] = {}  # from_code -> to_code
        self.default_point_size: int = 0
        self._parse()

    def _read_file(self) -> str:
        return _read_text_with_encoding_detection(self.filepath)

    def _tokenize(self, text: str) -> list[str]:
        """Tokenize a full descriptor file."""
        tokens = []
        i = 0
        while i < len(text):
            c = text[i]
            # Skip whitespace.
            if c in ' \t\r\n':
                i += 1
                continue
            # Skip line comments.
            if c == '/' and i + 1 < len(text) and text[i + 1] == '/':
                while i < len(text) and text[i] != '\n':
                    i += 1
                continue
            # Parse string literals.
            if c == "'" or c == '"':
                quote = c
                i += 1
                s = ''
                while i < len(text) and text[i] != quote:
                    if text[i] == '\\' and i + 1 < len(text):
                        escaped = text[i + 1]
                        if escaped == 'n':
                            s += '\n'
                        elif escaped == 'r':
                            s += '\r'
                        elif escaped == 't':
                            s += '\t'
                        else:
                            s += escaped
                        i += 2
                        continue
                    s += text[i]
                    i += 1
                if i < len(text):
                    i += 1  # skip closing quote
                tokens.append(('STR', s))
                continue
            # Parse parentheses, commas, and semicolons.
            if c in '(),;':
                tokens.append(('SYM', c))
                i += 1
                continue
            # Parse numbers.
            if c == '-' or c.isdigit():
                num = c
                i += 1
                while i < len(text) and (text[i].isdigit() or text[i] == '.'):
                    num += text[i]
                    i += 1
                tokens.append(('NUM', num))
                continue
            # Parse identifiers.
            if c.isalpha() or c == '_':
                ident = ''
                while i < len(text) and (text[i].isalnum() or text[i] == '_'):
                    ident += text[i]
                    i += 1
                tokens.append(('ID', ident))
                continue
            # Skip unsupported characters.
            i += 1
        return tokens

    def _parse_value(self, tokens: list, pos: int) -> tuple[Any, int]:
        """Parse a list, string, number, or identifier reference."""
        if pos >= len(tokens):
            return None, pos

        tok_type, tok_val = tokens[pos]

        if tok_type == 'SYM' and tok_val == '(':
            # Parse list values.
            items = []
            pos += 1
            while pos < len(tokens):
                if tokens[pos] == ('SYM', ')'):
                    pos += 1
                    break
                if tokens[pos] == ('SYM', ','):
                    pos += 1
                    continue
                val, pos = self._parse_value(tokens, pos)
                if val is not None:
                    items.append(val)
            return items, pos
        elif tok_type == 'STR':
            return tok_val, pos + 1
        elif tok_type == 'NUM':
            if '.' in tok_val:
                return float(tok_val), pos + 1
            return int(tok_val), pos + 1
        elif tok_type == 'ID':
            return tok_val, pos + 1
        elif tok_type == 'SYM' and tok_val == ';':
            return None, pos + 1
        else:
            return None, pos + 1

    def _resolve(self, val: Any) -> Any:
        """Resolve descriptor constants."""
        if isinstance(val, str) and val in self.defines:
            return self.defines[val]
        if isinstance(val, list):
            return [self._resolve(v) for v in val]
        return val

    @staticmethod
    def _int_to_color(val: int) -> list:
        a = (val >> 24) & 0xFF
        r = (val >> 16) & 0xFF
        g = (val >> 8) & 0xFF
        b = val & 0xFF
        if a == 0:
            a = 0xFF  # PvZ: if(mAlpha==0) mAlpha = 0xff;
        return [r, g, b, a]

    def _parse(self):
        text = self._read_file()
        tokens = self._tokenize(text)

        pos = 0
        current_layer = None

        while pos < len(tokens):
            tok_type, tok_val = tokens[pos]

            if tok_type != 'ID':
                pos += 1
                continue

            cmd = tok_val
            pos += 1

            if cmd == 'Define':
                # Define <name> <value>
                name_tok = tokens[pos]
                name = name_tok[1]
                pos += 1
                val, pos = self._parse_value(tokens, pos)
                # Skip the trailing semicolon.
                if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                    pos += 1
                self.defines[name] = val

            elif cmd == 'SetDefaultPointSize':
                val, pos = self._parse_value(tokens, pos)
                if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                    pos += 1
                self.default_point_size = int(self._resolve(val))

            elif cmd == 'SetCharMap':
                from_val, pos = self._parse_value(tokens, pos)
                to_val, pos = self._parse_value(tokens, pos)
                if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                    pos += 1
                from_list = self._resolve(from_val)
                to_list = self._resolve(to_val)
                if isinstance(from_list, list) and isinstance(to_list, list):
                    for f, t in zip(from_list, to_list):
                        self.char_map[ord(f) if isinstance(f, str) else f] = ord(
                            t) if isinstance(t, str) else t

            elif cmd == 'CreateLayer':
                name_tok = tokens[pos]
                layer_name = name_tok[1]
                pos += 1
                if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                    pos += 1
                layer = {
                    'name': layer_name,
                    'image': '',
                    'ascent': 0,
                    'ascentPadding': 0,
                    'lineSpacingOffset': 0,
                    'pointSize': 0,
                    'height': 0,
                    'spacing': 0,
                    'offset': [0, 0],
                    'drawMode': -1,
                    'baseOrder': 0,
                    'colorMult': [255, 255, 255, 255],
                    'colorAdd': [0, 0, 0, 0],
                    'chars': {},  # char -> { rect, offset, width, order, kerning }
                    'spaceWidth': 0,
                }
                self.layers.append(layer)
                current_layer = layer

            elif cmd == 'CreateLayerFrom':
                name_tok = tokens[pos]
                layer_name = name_tok[1]
                pos += 1
                source_name_tok = tokens[pos]
                source_name = source_name_tok[1]
                pos += 1
                if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                    pos += 1
                # Find the source layer.
                source = None
                for l in self.layers:
                    if l['name'] == source_name:
                        source = l
                        break
                if source:
                    import copy
                    layer = copy.deepcopy(source)
                    layer['name'] = layer_name
                    self.layers.append(layer)
                    current_layer = layer

            elif cmd.startswith('Layer'):
                # Every Layer* command uses the layer name as the first argument.
                layer_name_tok = tokens[pos]
                layer_name = layer_name_tok[1]
                pos += 1

                # Find the target layer.
                target = None
                for l in self.layers:
                    if l['name'] == layer_name:
                        target = l
                        break

                if target is None:
                    # Skip to the end of the command.
                    while pos < len(tokens) and tokens[pos] != ('SYM', ';'):
                        pos += 1
                    if pos < len(tokens):
                        pos += 1
                    continue

                if cmd == 'LayerSetImage':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['image'] = self._resolve(
                        val) if isinstance(val, str) else str(val)

                elif cmd == 'LayerSetAscent':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['ascent'] = int(self._resolve(val))

                elif cmd == 'LayerSetAscentPadding':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['ascentPadding'] = int(self._resolve(val))

                elif cmd == 'LayerSetLineSpacingOffset':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['lineSpacingOffset'] = int(self._resolve(val))

                elif cmd == 'LayerSetPointSize':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['pointSize'] = int(self._resolve(val))

                elif cmd == 'LayerSetHeight':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['height'] = int(self._resolve(val))

                elif cmd == 'LayerSetSpacing':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['spacing'] = int(self._resolve(val))

                elif cmd == 'LayerSetDrawMode':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['drawMode'] = int(self._resolve(val))

                elif cmd == 'LayerSetBaseOrder':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    target['baseOrder'] = int(self._resolve(val))

                elif cmd == 'LayerSetOffset':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    resolved = self._resolve(val)
                    if isinstance(resolved, list) and len(resolved) == 2:
                        target['offset'] = [int(resolved[0]), int(resolved[1])]

                elif cmd == 'LayerSetColorMult':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    resolved = self._resolve(val)
                    if isinstance(resolved, int):
                        target['colorMult'] = self._int_to_color(resolved)
                    elif isinstance(resolved, list) and len(resolved) == 4:
                        target['colorMult'] = [
                            int(float(v) * 255) for v in resolved]

                elif cmd == 'LayerSetColorAdd':
                    val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    resolved = self._resolve(val)
                    if isinstance(resolved, int):
                        target['colorAdd'] = self._int_to_color(resolved)
                    elif isinstance(resolved, list) and len(resolved) == 4:
                        target['colorAdd'] = [
                            int(float(v) * 255) for v in resolved]

                elif cmd == 'LayerSetCharWidths':
                    chars_val, pos = self._parse_value(tokens, pos)
                    widths_val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    chars_list = self._resolve(chars_val)
                    widths_list = self._resolve(widths_val)
                    if isinstance(chars_list, list) and isinstance(widths_list, list):
                        for ch, w in zip(chars_list, widths_list):
                            c = ch if isinstance(ch, str) else chr(ch)
                            code = ord(c)
                            code_str = str(code)
                            if code_str not in target['chars']:
                                target['chars'][code_str] = {
                                    'rect': [0, 0, 0, 0],
                                    'offset': [0, 0],
                                    'width': 0,
                                    'order': 0,
                                    'kerning': {}
                                }
                            target['chars'][code_str]['width'] = int(w)

                elif cmd == 'LayerSetImageMap':
                    chars_val, pos = self._parse_value(tokens, pos)
                    rects_val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    chars_list = self._resolve(chars_val)
                    rects_list = self._resolve(rects_val)
                    if isinstance(chars_list, list) and isinstance(rects_list, list):
                        for ch, rect in zip(chars_list, rects_list):
                            c = ch if isinstance(ch, str) else chr(ch)
                            code = ord(c)
                            code_str = str(code)
                            if code_str not in target['chars']:
                                target['chars'][code_str] = {
                                    'rect': [0, 0, 0, 0],
                                    'offset': [0, 0],
                                    'width': 0,
                                    'order': 0,
                                    'kerning': {}
                                }
                            r = self._resolve(rect)
                            target['chars'][code_str]['rect'] = [
                                int(v) for v in r]

                elif cmd == 'LayerSetCharOffsets':
                    chars_val, pos = self._parse_value(tokens, pos)
                    offsets_val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    chars_list = self._resolve(chars_val)
                    offsets_list = self._resolve(offsets_val)
                    if isinstance(chars_list, list) and isinstance(offsets_list, list):
                        for ch, off in zip(chars_list, offsets_list):
                            c = ch if isinstance(ch, str) else chr(ch)
                            code = ord(c)
                            code_str = str(code)
                            if code_str not in target['chars']:
                                target['chars'][code_str] = {
                                    'rect': [0, 0, 0, 0],
                                    'offset': [0, 0],
                                    'width': 0,
                                    'order': 0,
                                    'kerning': {}
                                }
                            o = self._resolve(off)
                            target['chars'][code_str]['offset'] = [
                                int(v) for v in o]

                elif cmd == 'LayerSetKerningPairs':
                    pairs_val, pos = self._parse_value(tokens, pos)
                    values_val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    pairs_list = self._resolve(pairs_val)
                    values_list = self._resolve(values_val)
                    if isinstance(pairs_list, list) and isinstance(values_list, list):
                        for pair, val in zip(pairs_list, values_list):
                            if isinstance(pair, str) and len(pair) == 2:
                                first_code = str(ord(pair[0]))
                                second_code = str(ord(pair[1]))
                                if first_code in target['chars']:
                                    target['chars'][first_code]['kerning'][second_code] = int(
                                        val)

                elif cmd == 'LayerSetCharOrders':
                    chars_val, pos = self._parse_value(tokens, pos)
                    orders_val, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens) and tokens[pos] == ('SYM', ';'):
                        pos += 1
                    chars_list = self._resolve(chars_val)
                    orders_list = self._resolve(orders_val)
                    if isinstance(chars_list, list) and isinstance(orders_list, list):
                        for ch, order in zip(chars_list, orders_list):
                            c = ch if isinstance(ch, str) else chr(ch)
                            code_str = str(ord(c))
                            if code_str in target['chars']:
                                target['chars'][code_str]['order'] = int(order)

                elif cmd in ('LayerRequireTags', 'LayerExcludeTags', 'LayerPointRange'):
                    # Skip rarely used layer constraints.
                    while pos < len(tokens) and tokens[pos] != ('SYM', ';'):
                        _, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens):
                        pos += 1
                else:
                    # Skip unknown layer commands.
                    while pos < len(tokens) and tokens[pos] != ('SYM', ';'):
                        pos += 1
                    if pos < len(tokens):
                        pos += 1
            else:
                pos += 1

    def to_json(self) -> dict:
        """Convert the parsed descriptor to the runtime font JSON format."""
        result = {
            'defaultPointSize': self.default_point_size,
            'charMap': {str(k): v for k, v in self.char_map.items()},
            'layers': []
        }

        for layer in self.layers:
            layer_data = {
                'name': layer['name'],
                'image': _normalize_image_stem(layer['image']) if layer['image'] else '',
                'ascent': layer['ascent'],
                'ascentPadding': layer['ascentPadding'],
                'lineSpacingOffset': layer['lineSpacingOffset'],
                'pointSize': layer['pointSize'],
                'height': layer['height'],
                'spacing': layer['spacing'],
                'offset': layer['offset'],
                'drawMode': layer['drawMode'],
                'baseOrder': layer['baseOrder'],
                'colorMult': layer['colorMult'],
                'colorAdd': layer['colorAdd'],
                'chars': layer['chars'],
            }
            result['layers'].append(layer_data)

        return result

    def get_image_files(self) -> list[Path]:
        """Return all image files used by the font layers."""
        images = []
        for layer in self.layers:
            img_name = layer['image']
            if img_name:
                candidate = _find_font_image(self.basedir, img_name)
                if candidate:
                    images.append(candidate)
        return images


def convert_font(input_path: Path, output_dir: Path):
    """Convert one font descriptor."""
    parser = PvZFontParser(input_path)

    for layer in parser.layers:
        image_name = layer['image']
        if image_name and _find_font_image(parser.basedir, image_name) is None:
            fallback = input_path.stem
            if _find_font_image(parser.basedir, fallback) is not None:
                print(f"[font] Using descriptor image fallback: {image_name} -> {fallback}")
                layer['image'] = fallback

    font_data = parser.to_json()

    base_name = input_path.stem

    output_dir.mkdir(parents=True, exist_ok=True)

    # Cocos imports PNG atlases as textures, but the PvZ font atlases are masks.
    # Bake opaque mask images to RGBA so runtime loading is platform-neutral.
    for img_path in parser.get_image_files():
        dst = output_dir / _normalize_image_name(img_path)
        if not dst.exists() or not dst.samefile(img_path):
            image_name = _normalize_image_stem(img_path.with_suffix('').name)
            image = _normalize_font_mask_rgba(img_path)
            image = _wrap_font_atlas_if_needed(font_data, image_name, image)
            image.save(dst, 'PNG')
            print(f"[font] Wrote: {dst}")

    # Write JSON after possible atlas wrapping has updated glyph rects.
    json_path = output_dir / (base_name + '.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(font_data, f, indent=2)
    print(f"[font] Wrote: {json_path}")


def main():
    input_dir = Path("./tools/raw/data")
    output_dir = Path("./assets/resources/fonts")

    for input_path in input_dir.glob("*.txt"):
        print(f"[font] Processing: {input_path.name}")
        convert_font(input_path, output_dir)

    print("[font] Done")


if __name__ == '__main__':
    main()
