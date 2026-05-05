#!/usr/bin/env python3
"""
Convert PvZ LawnStrings.txt into a Cocos Creator JSON resource.

Usage:
    python tools/lawnstrings_converter.py
"""

import argparse
import json
from pathlib import Path


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


def convert_lawnstrings(src_path: Path, dst_path: Path) -> int:
    text = src_path.read_text(encoding='cp1252')
    strings = parse_lawnstrings(text)

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
    args = parser.parse_args()

    count = convert_lawnstrings(args.input, args.output)
    print(f"[lawnstrings] Wrote {count} strings -> {args.output}")


if __name__ == '__main__':
    main()
