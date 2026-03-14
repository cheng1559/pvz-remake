#!/usr/bin/env python3
"""
PvZ main.pak 解包工具

输入: PvZ PAK 归档文件 (如 main.pak)
输出: 解包后的所有文件, 保留原始目录结构

PAK 文件格式:
    - 整个文件以 XOR 0xF7 加密
    - 解密后结构:
        Header  : magic(4 bytes, 0xBAC04AC0) + flags(4 bytes)
        TOC     : 连续的文件条目, 每条:
                    flag(1 byte, 0x00) + name_len(1 byte) + name(N bytes)
                    + file_size(4 bytes LE) + file_time(8 bytes LE, Windows FILETIME)
        End TOC : 1 byte (0x80)
        Data    : 所有文件数据按 TOC 顺序紧密排列
"""

from __future__ import annotations

import struct
import sys
import datetime
from pathlib import Path
from typing import NamedTuple

# ── 常量 ────────────────────────────────────────────────────────────

XOR_KEY = 0xF7
PAK_MAGIC = 0xBAC04AC0
HEADER_SIZE = 8              # magic(4) + flags(4)
END_OF_TOC_MARKER = 0x80
FILE_ENTRY_FLAG = 0x00

# Windows FILETIME epoch: 1601-01-01, 单位 100ns
_FILETIME_EPOCH = datetime.datetime(1601, 1, 1, tzinfo=datetime.timezone.utc)


# ── 数据结构 ─────────────────────────────────────────────────────────

class PakEntry(NamedTuple):
    name: str
    size: int
    file_time: int          # 原始 Windows FILETIME
    data_offset: int        # 解密后数据中的起始偏移


# ── 核心解析 ─────────────────────────────────────────────────────────

def _decrypt(data: bytes) -> bytes:
    """XOR 0xF7 解密整个文件"""
    return bytes(b ^ XOR_KEY for b in data)


def _filetime_to_datetime(ft: int) -> datetime.datetime | None:
    """将 Windows FILETIME 转为 UTC datetime, 无效值返回 None"""
    if ft <= 0:
        return None
    try:
        us = ft // 10  # 100ns -> μs
        return _FILETIME_EPOCH + datetime.timedelta(microseconds=us)
    except (OverflowError, OSError):
        return None


def parse_pak(data: bytes) -> list[PakEntry]:
    """
    解析已解密的 PAK 数据, 返回文件条目列表.
    每个条目包含文件名、大小、时间戳以及数据在 *data* 中的偏移.
    """
    if len(data) < HEADER_SIZE:
        raise ValueError("文件太小, 不是有效的 PAK 文件")

    magic = struct.unpack_from('<I', data, 0)[0]
    if magic != PAK_MAGIC:
        raise ValueError(
            f"Magic 不匹配: 期望 0x{PAK_MAGIC:08X}, 实际 0x{magic:08X}")

    pos = HEADER_SIZE
    entries: list[tuple[str, int, int]] = []  # (name, size, file_time)

    while pos < len(data):
        flag = data[pos]
        pos += 1

        if flag == END_OF_TOC_MARKER:
            break
        if flag != FILE_ENTRY_FLAG:
            raise ValueError(
                f"位置 {pos - 1}: 未知的条目标志 0x{flag:02X}")

        name_len = data[pos]
        pos += 1
        if name_len == 0:
            raise ValueError(f"位置 {pos - 1}: 文件名长度为 0")

        name = data[pos:pos + name_len].decode('ascii')
        pos += name_len

        file_size = struct.unpack_from('<I', data, pos)[0]
        pos += 4

        file_time = struct.unpack_from('<Q', data, pos)[0]
        pos += 8

        entries.append((name, file_size, file_time))

    # 计算每个文件在 data blob 中的偏移
    data_start = pos
    result: list[PakEntry] = []
    offset = data_start
    for name, size, ft in entries:
        result.append(PakEntry(name=name, size=size,
                      file_time=ft, data_offset=offset))
        offset += size

    # 校验: 最后一个文件结尾应 == 文件总长
    if result and offset != len(data):
        print(f"[pak_extractor] WARN: Data size mismatch: expected {offset}, actual {len(data)}, "
              f"diff {len(data) - offset}", file=sys.stderr)

    return result


# ── 功能: 列出文件 ──────────────────────────────────────────────────

def list_entries(entries: list[PakEntry]) -> None:
    """打印 PAK 中所有文件的信息表"""
    total_size = 0
    print(f"{'Size':>12}  {'Modified (UTC)':>20}  Name")
    print(f"{'----':>12}  {'----':>20}  ----")
    for e in entries:
        dt = _filetime_to_datetime(e.file_time)
        dt_str = dt.strftime('%Y-%m-%d %H:%M:%S') if dt else '(unknown)'
        print(f"{e.size:>12,}  {dt_str:>20}  {e.name}")
        total_size += e.size
    print(
        f"\n[pak_extractor] {len(entries)} files, {total_size:,} bytes total")


# ── 功能: 解包文件 ──────────────────────────────────────────────────

def extract_entries(data: bytes, entries: list[PakEntry],
                    out_dir: Path, *, verbose: bool = True) -> int:
    """
    将所有文件解包到 out_dir, 返回成功解包的文件数.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for e in entries:
        file_path = out_dir / e.name
        file_path.parent.mkdir(parents=True, exist_ok=True)

        file_data = data[e.data_offset:e.data_offset + e.size]
        file_path.write_bytes(file_data)
        count += 1

        if verbose:
            print(f"[pak_extractor] Wrote: {file_path} ({e.size:,} bytes)")

    return count


# ── CLI 入口 ─────────────────────────────────────────────────────────

def main() -> None:
    pak_path = Path("./tools/main.pak")
    out_dir = Path("./tools/raw")

    # 读取并解密
    print(
        f"[pak_extractor] Reading {pak_path} ({pak_path.stat().st_size:,} bytes) ...")
    raw = pak_path.read_bytes()
    data = _decrypt(raw)

    # 解析 TOC
    entries = parse_pak(data)
    print(f"[pak_extractor] Found {len(entries)} file entries")

    # 解包
    print(f"[pak_extractor] Extracting to {out_dir} ...")
    count = extract_entries(data, entries, out_dir)
    print(f"[pak_extractor] Done: extracted {count} files")


if __name__ == "__main__":
    main()
