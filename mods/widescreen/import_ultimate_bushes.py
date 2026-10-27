#!/usr/bin/env python3
"""Extract Ultimate's original bush sprites and LNRA animation tracks, without redrawing."""
import argparse
import hashlib
import io
import json
import struct
import sys
import zlib
from pathlib import Path

from PIL import Image
import zstandard
import dnfile
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

ROOT = Path(__file__).resolve().parent
PREFIX = 'local:widescreen/'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def png(width, height, pixels, filters):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    scanlines = b''.join(bytes([filters[y]]) + pixels[y * width * 4:(y + 1) * width * 4]
                         for y in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))


def reanim(data):
    assert data[:8] == b'LNRA\x03\0\0\0'
    stream = io.BytesIO(zlib.decompress(data[8:]))
    def uint():
        return struct.unpack('<I', stream.read(4))[0]
    def string():
        return stream.read(uint()).decode('utf-8')
    fps = struct.unpack('<f', stream.read(4))[0]
    tracks = []
    for index in range(uint()):
        name, count, unique_count = string(), uint(), uint()
        unique = []
        for _ in range(unique_count):
            values = struct.unpack('<8f', stream.read(32))
            sprite, font, text = string(), string(), string()
            assert not font and not text
            unique.append((values, sprite))
        assert unique_count < 256
        indices = [0] * count if unique_count == 1 else list(stream.read(count))
        frames = []
        for frame, key in enumerate(indices):
            (x, y, kx, ky, sx, sy, visible, alpha), sprite = unique[key]
            frames.append(dict(timeSeconds=frame / fps, x=x, y=y, scaleX=sx, scaleY=sy,
                               skewX=kx, skewY=ky, alpha=alpha,
                               sprite=PREFIX + 'ultimate-' + sprite.removeprefix('IMAGE_REANIM_').lower()
                               if sprite and visible >= 0 else None, interpolation='linear'))
        # Native files repeat track names such as "leaf"; preserve every track and its order.
        tracks.append(dict(id=f'{name}_{index}', zIndex=index, keyframes=frames))
    assert stream.read() == b'\0' * 4
    return dict(schemaVersion=2, durationSeconds=count / fps, tracks=tracks)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=Path, nargs='?', default=Path('/Applications/PvZ Ultimate.app'))
    parser.add_argument('--upscale', action='store_true', help='Apply the existing 2x Real-ESRGAN pipeline')
    parser.add_argument('--device', help='Upscale device, defaulting to MPS when available')
    args = parser.parse_args()
    app = args.app
    model = None
    if args.upscale:
        import numpy as np
        import torch
        sys.path.insert(0, str(ROOT.parents[1] / 'tools'))
        from upscale_fonts import Upscaler
        from upscale_ui import upscale
        model = Upscaler('general', args.device or ('mps' if torch.backends.mps.is_available() else 'cpu'))
    data = (app / 'Contents/Resources/main.rsb').read_bytes()
    assembly = app / 'Contents/MonoBundle/.xamarin/osx-arm64/Lawn.Core.dll'
    dll = assembly.read_bytes()
    header = struct.unpack_from('<27I', data)
    groups = {}
    for index in range(header[10]):
        offset = header[11] + index * header[12]
        name = data[offset:offset + 128].split(b'\0')[0].decode()
        base = struct.unpack_from('<I', data, offset + 128)[0]
        h = struct.unpack_from('<23I', data, base)
        start, size = h[19], h[18]
        pos, prefix, branches, entries = start, '', {}, {}
        while pos < start + size:
            prefix = branches.get(pos, prefix)
            value = struct.unpack_from('<I', data, base + pos)[0]
            char, branch = value & 255, value >> 8
            if branch:
                branches[start + branch * 4] = prefix
            pos += 4
            if char:
                prefix += chr(char)
                continue
            kind = struct.unpack_from('<I', data, base + pos)[0]
            count = 8 if kind == 1 else 3
            entries[prefix] = struct.unpack_from('<' + 'I' * count, data, base + pos)
            pos += count * 4
            prefix = ''
        groups[name] = (base, h, entries)

    pe = struct.unpack_from('<I', dll, 60)[0]
    sections = pe + 24 + struct.unpack_from('<H', dll, pe + 20)[0]
    def rva(address, length):
        for index in range(struct.unpack_from('<H', dll, pe + 6)[0]):
            size, va, raw_size, raw = struct.unpack_from('<4I', dll, sections + index * 40 + 8)
            if va <= address < va + max(size, raw_size):
                return dll[raw + address - va:raw + address - va + length]
        raise ValueError(address)
    metadata = dnfile.dnPE(str(assembly), fast_load=True, clr_lazy_load=True)
    metadata.parse_data_directories(directories=[14])
    table = metadata.net.mdtables.FieldRva
    field_rvas = {struct.unpack_from('<H', table._table_data, offset + 4)[0]:
                  struct.unpack_from('<I', table._table_data, offset)[0]
                  for offset in range(0, len(table._table_data), table.row_size)}
    def inflate(group, gpu=False):
        base, h, _ = groups[group]
        offset, length = (h[10], h[11]) if gpu else (h[6], h[7])
        compressed = data[base + offset:base + offset + length]
        if compressed[:4] != b'\x28\xb5\x2f\xfd':
            decrypt = Cipher(algorithms.AES(rva(field_rvas[0x8367], 16)), modes.CBC(rva(field_rvas[0x83d7], 16))).decryptor()
            compressed = decrypt.update(compressed[:4096]) + decrypt.finalize() + compressed[4096:]
        return zstandard.ZstdDecompressor().decompress(compressed)

    resident = inflate('ResidentFileGroup')
    out = ROOT / 'assets/ultimate-bushes'
    out.mkdir(parents=True, exist_ok=True)
    resources = dict(sprites={}, reanim={})
    records, sprite_ids = [], set()
    for variant in (3, 4, 5):
        source = f'REANIM\\BUSHES{variant}.REANIM'
        _, offset, length = groups['ResidentFileGroup'][2][source]
        raw = resident[offset:offset + length]
        clip = reanim(raw)
        clip['id'] = PREFIX + f'bushes{variant}'
        target = out / f'bushes{variant}.json'
        target.write_text(json.dumps(clip, separators=(',', ':')) + '\n')
        resources['reanim'][clip['id']] = target.relative_to(ROOT).as_posix()
        sprite_ids.update(f['sprite'] for t in clip['tracks'] for f in t['keyframes'] if f['sprite'])
        records.append(dict(source=source, sourceSha256=sha(raw), file=target.relative_to(ROOT).as_posix(),
                            sha256=sha(target.read_bytes()), frames=42, fps=12))

    group = 'DelayLoad_GamePlay_600'
    gpu = inflate(group, gpu=True)
    atlases = {}
    for name, fields in groups[group][2].items():
        if 'LAWNOBJECTS' not in name:
            continue
        _, offset, length, _, filter_offset, height, width, _ = fields
        base = groups[group][0]
        image = Image.open(io.BytesIO(png(width, height, gpu[offset:offset + length],
                                         data[base + filter_offset:base + filter_offset + height])))
        atlases[name] = image
    for sprite_id in sorted(sprite_ids):
        name = 'IMAGE_REANIM_' + sprite_id.split('ultimate-', 1)[1].upper()
        string_offset = data.index((name + '|600\0').encode()) - header[26]
        record = data.index(struct.pack('<I', string_offset), header[25], header[26])
        fields = struct.unpack_from('<14I', data, record)
        rect = struct.unpack_from('<4H', data, record + 20)
        path = data[header[26] + fields[1]:].split(b'\0')[0].decode()
        atlas_path = 'ATLASES\\' + '_'.join(path.split('\\')[2:-1]).upper() + '_600.PTX'
        assert atlas_path in atlases, (name, atlas_path)
        x, y, width, height = rect
        target = out / (sprite_id.split('ultimate-', 1)[1] + '.png')
        image = atlases[atlas_path].crop((x, y, x + width, y + height)).convert('RGBA')
        if model:
            pixels = np.asarray(image, dtype=np.float32).copy()
            alpha = pixels[:, :, 3:4]
            pixels[:, :, :3] = np.divide(pixels[:, :, :3] * 255, alpha,
                out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0).clip(0, 255)
            result = upscale(Image.fromarray(np.rint(pixels).astype(np.uint8)), model)
            pixels = np.asarray(result, dtype=np.float32).copy()
            pixels[:, :, :3] *= pixels[:, :, 3:4] / 255
            image = Image.fromarray(np.rint(pixels).astype(np.uint8))
        image.save(target)
        resources['sprites'][sprite_id] = dict(file=target.relative_to(ROOT).as_posix(), width=width,
                                               height=height, alphaMode='premultiplied', scale=2 if model else 1)
        records.append(dict(source=name, atlas=atlas_path, rect=rect, file=target.relative_to(ROOT).as_posix(),
                            sha256=sha(target.read_bytes())))
    (ROOT / 'ultimate-bushes-resources.json').write_text(json.dumps(resources, indent=4) + '\n')
    reference = dict(
        source=str(app), rsbSha256=sha(data), assemblySha256=sha(dll), resources=records,
        reference=dict(init='Board.InitCoverLayer, RVA 0xb6710', trigger='Board.AddZombieInRow, RVA 0xb4218',
                       track='anim_rustle', rate=10, mode='play once and hold',
                       scope='Bundled managed implementation and actual RSB animation data; not native AOT disassembly.')
    )
    (ROOT / 'ultimate-bushes-conversion.json').write_text(json.dumps(reference, indent=4) + '\n')
    conversion_path = ROOT / 'conversion.json'
    conversion = json.loads(conversion_path.read_text()) if conversion_path.exists() else {}
    conversion.update(ultimateBushes=reference,
        upscale=dict(model='realesr-general-x4v3', scale=2) if model else None)
    conversion_path.write_text(json.dumps(conversion, indent=4) + '\n')
    content = json.loads((ROOT / 'content.json').read_text())
    for name in ['bush_base', *[f'bush_day_{index}' for index in range(5)]]:
        content['resources']['sprites'].pop(PREFIX + name, None)
    for category, values in resources.items():
        content['resources'].setdefault(category, {}).update(values)
    (ROOT / 'content.json').write_text(json.dumps(content, indent=4) + '\n')
    print(f'Imported 3 animation clips and {len(sprite_ids)} sprites from {app}')


if __name__ == '__main__':
    main()
