#!/usr/bin/env python3
"""
Convert PvZ LawnStrings.txt into a Cocos Creator JSON resource.

Usage:
    python tools/lawnstrings_converter.py
"""

import argparse
import html
import json
import re
from pathlib import Path


def read_lawnstrings_text(src_path: Path) -> str:
    data = src_path.read_bytes()
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

    for encoding in ('utf-8-sig', 'cp1252', 'latin1'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue

    return data.decode('utf-8', errors='replace')


def parse_lawnstrings(text: str) -> dict[str, str]:
    strings: dict[str, str] = {}
    index = 0
    length = len(text)

    while True:
        name_start = text.find('[', index)
        if name_start == -1:
            if text[index:].strip():
                raise ValueError('Failed to find string name')
            return strings

        name_end = text.find(']', name_start + 1)
        if name_end == -1:
            raise ValueError("Failed to find ']'")

        name = text[name_start + 1:name_end].strip()
        if not name:
            raise ValueError('Name Too Short')

        value_start = name_end + 1
        next_name_start = text.find('[', value_start)
        value_end = next_name_start if next_name_start != -1 else length
        value = text[value_start:value_end].strip().replace('\r', '')
        strings[name.upper()] = value

        if next_name_start == -1:
            return strings
        index = next_name_start


def parse_default_xml_strings(text: str) -> dict[str, str]:
    strings: dict[str, str] = {}
    for match in re.finditer(r'<String\s+id="([^"]*)">(.*?)</String>', text, re.DOTALL):
        name = html.unescape(match.group(1)).strip()
        if not name:
            continue
        value = match.group(2).strip().replace('\r', '')
        value = value.replace('&cr;', '\n').replace('&nbsp;', ' ')
        strings[name.upper()] = html.unescape(value)
    return strings


def convert_lawnstrings(src_path: Path, dst_path: Path, default_xml_path: Path | None = None) -> int:
    text = read_lawnstrings_text(src_path)
    strings = parse_lawnstrings(text)
    if default_xml_path and default_xml_path.exists():
        default_strings = parse_default_xml_strings(read_lawnstrings_text(default_xml_path))
        for key, value in default_strings.items():
            strings.setdefault(key, value)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    dst_path.write_text(
        json.dumps(strings, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    return len(strings)


def main():
    parser = argparse.ArgumentParser(description='Convert PvZ LawnStrings.txt to JSON.')
    parser.add_argument(
        '--input',
        type=Path,
        default=Path('./tools/raw/properties/lawnstrings.txt'),
        help='Source LawnStrings.txt path.',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('./assets/resources/properties/lawnstrings.json'),
        help='Destination JSON resource path.',
    )
    parser.add_argument(
        '--default-xml',
        type=Path,
        default=Path('./tools/raw/properties/default.xml'),
        help='Optional default.xml strings to merge without overriding LawnStrings keys.',
    )
    args = parser.parse_args()

    count = convert_lawnstrings(args.input, args.output, args.default_xml)
    print(f"[lawnstrings] Wrote {count} strings -> {args.output}")


if __name__ == '__main__':
    main()
