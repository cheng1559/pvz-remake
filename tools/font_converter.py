#!/usr/bin/env python3
"""
PvZ ImageFont → Cocos Creator JSON 转换工具

用法:
    python convert_pvz_font.py <font_desc.txt> [--out-dir <output_dir>]

输入: PvZ 字体描述文件 (如 BrianneTod32.txt)
输出: JSON 配置文件 + 复制对应 PNG 到输出目录

输出 JSON 格式与自定义 Cocos PvZBitmapFont 组件配套使用。
"""

import re
import sys
import json
import shutil
from pathlib import Path
from typing import Any


class PvZFontParser:
    """解析 PvZ 字体描述文件"""

    def __init__(self, filepath: Path):
        self.filepath = filepath
        self.basedir = filepath.parent
        self.defines: dict[str, Any] = {}
        self.layers: list[dict[str, Any]] = []
        self.char_map: dict[int, int] = {}  # from_code -> to_code
        self.default_point_size: int = 0
        self._parse()

    def _read_file(self) -> str:
        with open(self.filepath, 'r', encoding='latin-1') as f:
            return f.read()

    def _tokenize(self, text: str) -> list[str]:
        """将整个文本分词"""
        tokens = []
        i = 0
        while i < len(text):
            c = text[i]
            # 跳过空白
            if c in ' \t\r\n':
                i += 1
                continue
            # 跳过注释 (// 到行尾)
            if c == '/' and i + 1 < len(text) and text[i + 1] == '/':
                while i < len(text) and text[i] != '\n':
                    i += 1
                continue
            # 字符串字面量 'x' 或 "x"
            if c == "'" or c == '"':
                quote = c
                i += 1
                s = ''
                while i < len(text) and text[i] != quote:
                    s += text[i]
                    i += 1
                if i < len(text):
                    i += 1  # skip closing quote
                tokens.append(('STR', s))
                continue
            # 括号和分号
            if c in '(),;':
                tokens.append(('SYM', c))
                i += 1
                continue
            # 数字或负号
            if c == '-' or c.isdigit():
                num = c
                i += 1
                while i < len(text) and (text[i].isdigit() or text[i] == '.'):
                    num += text[i]
                    i += 1
                tokens.append(('NUM', num))
                continue
            # 标识符
            if c.isalpha() or c == '_':
                ident = ''
                while i < len(text) and (text[i].isalnum() or text[i] == '_'):
                    ident += text[i]
                    i += 1
                tokens.append(('ID', ident))
                continue
            # 跳过其他字符
            i += 1
        return tokens

    def _parse_value(self, tokens: list, pos: int) -> tuple[Any, int]:
        """解析一个值：可以是列表 (...)、字符串、数字或标识符引用"""
        if pos >= len(tokens):
            return None, pos

        tok_type, tok_val = tokens[pos]

        if tok_type == 'SYM' and tok_val == '(':
            # 解析列表
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
        """解引用：如果值是已定义的变量名，返回其值"""
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
                # 跳过分号
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
                # 找源层
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
                # 所有 Layer* 命令：第一个参数是层名
                layer_name_tok = tokens[pos]
                layer_name = layer_name_tok[1]
                pos += 1

                # 找到对应层
                target = None
                for l in self.layers:
                    if l['name'] == layer_name:
                        target = l
                        break

                if target is None:
                    # 跳到行尾
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
                    # 跳过这些不常用的命令
                    while pos < len(tokens) and tokens[pos] != ('SYM', ';'):
                        _, pos = self._parse_value(tokens, pos)
                    if pos < len(tokens):
                        pos += 1
                else:
                    # 跳过未知 Layer 命令
                    while pos < len(tokens) and tokens[pos] != ('SYM', ';'):
                        pos += 1
                    if pos < len(tokens):
                        pos += 1
            else:
                pos += 1

    def to_json(self) -> dict:
        """转换为 Cocos 组件可用的 JSON 格式"""
        result = {
            'defaultPointSize': self.default_point_size,
            'charMap': {str(k): v for k, v in self.char_map.items()},
            'layers': []
        }

        for layer in self.layers:
            layer_data = {
                'name': layer['name'],
                'image': layer['image'],
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
        """返回所有需要的图片文件路径"""
        images = []
        for layer in self.layers:
            img_name = layer['image']
            if img_name:
                # 尝试找到实际文件（可能带 _ 前缀或不带，.png/.gif）
                for prefix in ['_', '']:
                    for ext in ['.png', '.gif']:
                        candidate = self.basedir / (prefix + img_name + ext)
                        if candidate.exists():
                            images.append(candidate)
                            break
        return images


def convert_font(input_path: Path, output_dir: Path):
    """转换单个字体"""
    parser = PvZFontParser(input_path)
    font_data = parser.to_json()

    base_name = input_path.stem

    output_dir.mkdir(parents=True, exist_ok=True)

    # 写 JSON
    json_path = output_dir / (base_name + '.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(font_data, f, indent=2)
    print(f"  JSON → {json_path}")

    # 复制图片
    for img_path in parser.get_image_files():
        dst = output_dir / img_path.name
        if not dst.exists() or not dst.samefile(img_path):
            shutil.copy2(img_path, dst)
            print(f"  IMG  → {dst}")


def main():
    input_dir = Path("./tools/raw/data")
    output_dir = Path("./assets/resources/fonts")

    for input_path in input_dir.glob("*.txt"):
        print(f"Converting: {input_path}")
        convert_font(input_path, output_dir)

    print("Done!")


if __name__ == '__main__':
    main()
