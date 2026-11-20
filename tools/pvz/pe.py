"""Resources of a Windows executable, read from its PE resource directory (the original's cursors and icon are
only there, not in main.pak)."""
from __future__ import annotations

import struct

RT_CURSOR, RT_ICON, RT_GROUP_ICON = 1, 3, 14


def resources(exe: bytes, kind: int) -> dict[int | str, bytes]:
    """Data of every resource of one type, by its numeric ID or its name (such as "IDI_MAIN_ICON"); the first
    language of each."""
    pe = struct.unpack_from("<I", exe, 0x3C)[0]
    sections, optional_size = struct.unpack_from("<H12xH", exe, pe + 6)
    optional = pe + 24
    directories = optional + (112 if struct.unpack_from("<H", exe, optional)[0] == 0x20B else 96)
    root_rva = struct.unpack_from("<I", exe, directories + 2 * 8)[0]
    # Section headers: virtual size, virtual address, raw size, raw file offset.
    table = [struct.unpack_from("<8xIIII", exe, optional + optional_size + 40 * i) for i in range(sections)]

    def offset(rva: int) -> int:
        for virtual_size, address, raw_size, raw in table:
            if address <= rva < address + max(virtual_size, raw_size):
                return rva - address + raw
        raise ValueError(f"RVA {rva:#x} is outside every section")

    root = offset(root_rva)

    def entries(directory: int) -> list[tuple[int, int]]:
        named, numbered = struct.unpack_from("<HH", exe, root + directory + 12)
        return [struct.unpack_from("<II", exe, root + directory + 16 + 8 * i) for i in range(named + numbered)]

    def name(entry: int) -> int | str:
        # A set high bit points at a length-prefixed UTF-16 name instead of being the ID.
        if not entry & 0x80000000:
            return entry
        length = struct.unpack_from("<H", exe, root + (entry & 0x7FFFFFFF))[0]
        start = root + (entry & 0x7FFFFFFF) + 2
        return exe[start:start + 2 * length].decode("utf-16-le")

    found: dict[int | str, bytes] = {}
    for type_id, type_dir in entries(0):
        if type_id != kind:
            continue
        for name_id, name_dir in entries(type_dir & 0x7FFFFFFF):
            _, data_entry = entries(name_dir & 0x7FFFFFFF)[0]
            rva, size = struct.unpack_from("<II", exe, root + data_entry)
            found[name(name_id)] = exe[offset(rva):offset(rva) + size]
    return found


def icon(exe: bytes, group: int | str) -> bytes:
    """One icon group rebuilt as an .ico file: the group lists its images (each its own RT_ICON resource) with
    the same fields an .ico directory has, except that a 16-bit resource ID stands where the file offset goes."""
    directory = resources(exe, RT_GROUP_ICON)[group]
    images = resources(exe, RT_ICON)
    count = struct.unpack_from("<H", directory, 4)[0]
    header, data = struct.pack("<HHH", 0, 1, count), b""
    for i in range(count):
        *fields, _, image_id = struct.unpack_from("<BBBBHHIH", directory, 6 + 14 * i)
        image = images[image_id]
        header += struct.pack("<BBBBHHII", *fields, len(image), 6 + 16 * count + len(data))
        data += image
    return header + data
