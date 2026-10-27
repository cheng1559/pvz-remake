#!/usr/bin/env python3
"""Apply the project's existing 2x Real-ESRGAN pipeline to this Mod's published sprites."""
import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
sys.path.insert(0, str(PROJECT / 'tools'))
from upscale_fonts import Upscaler
from upscale_ui import upscale


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=4) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='mps' if torch.backends.mps.is_available() else 'cpu')
    args = parser.parse_args()
    content_path = ROOT / 'content.json'
    content = json.loads(content_path.read_text())
    manifest_path = ROOT / 'upscale.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else dict(images={})
    weights = PROJECT / 'temp/font-upscale/realesr-general-x4v3.pth'
    signature = sha(Path(__file__).read_bytes() + (PROJECT / 'tools/upscale_fonts.py').read_bytes()
                    + (PROJECT / 'tools/upscale_ui.py').read_bytes() + weights.read_bytes())
    manifest.update(model='realesr-general-x4v3', scale=2, weightsSha256=sha(weights.read_bytes()), generatorHash=signature)
    cache = PROJECT / 'temp/widescreen-pvz-upscale'
    cache.mkdir(parents=True, exist_ok=True)
    model = None
    started = time.monotonic()
    sprites = content['resources']['sprites']
    for index, (identifier, entry) in enumerate(sprites.items(), 1):
        target = ROOT / entry['file']
        source = target.read_bytes()
        digest = sha(source)
        previous = manifest['images'].get(identifier, {})
        if digest == previous.get('outputSha256') and previous.get('generatorHash') == signature:
            entry['scale'] = 2
            entry['alphaMode'] = previous['alphaMode']
            write_json(content_path, content)
            print(f'[{index}/{len(sprites)}] cached {target.name}', flush=True)
            continue
        if entry.get('scale', 1) != 1:
            raise ValueError(f'Reimport original assets before changing the upscale pipeline: {identifier}')
        original = cache / f'{digest}.png'
        if not original.exists():
            original.write_bytes(source)
        image = Image.open(original).convert('RGBA')
        assert image.size == (entry['width'], entry['height'])
        mode = entry.get('alphaMode', 'straight')
        if mode == 'premultiplied':
            pixels = np.asarray(image, dtype=np.float32).copy()
            alpha = pixels[:, :, 3:4]
            pixels[:, :, :3] = np.divide(pixels[:, :, :3] * 255, alpha,
                                        out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0).clip(0, 255)
            image = Image.fromarray(np.rint(pixels).astype(np.uint8))
        if model is None:
            model = Upscaler('general', args.device)
        result = upscale(image, model)
        if mode == 'premultiplied':
            pixels = np.asarray(result, dtype=np.float32).copy()
            pixels[:, :, :3] *= pixels[:, :, 3:4] / 255
            result = Image.fromarray(np.rint(pixels).astype(np.uint8))
        temporary = target.with_suffix('.sr.tmp')
        result.save(temporary, 'PNG')
        record = dict(file=entry['file'], width=entry['width'], height=entry['height'], scale=2,
                      alphaMode=mode, sourceSha256=digest, outputSha256=sha(temporary.read_bytes()),
                      generatorHash=signature)
        manifest['images'][identifier] = record
        write_json(manifest_path, manifest)
        temporary.replace(target)
        entry['scale'] = 2
        write_json(content_path, content)
        print(f'[{index}/{len(sprites)}] {target.name} {image.width}x{image.height} -> '
              f'{result.width}x{result.height}, elapsed {time.monotonic() - started:.0f}s', flush=True)
        if args.device == 'mps':
            torch.mps.empty_cache()

    # Preserve the density of already-upscaled Ultimate sprites if the PvZ sources are reimported later.
    fragment_path = ROOT / 'ultimate-bushes-resources.json'
    fragment = json.loads(fragment_path.read_text())
    for identifier in fragment['sprites']:
        fragment['sprites'][identifier] = sprites[identifier]
    write_json(fragment_path, fragment)
    conversion_path = ROOT / 'conversion.json'
    conversion = json.loads(conversion_path.read_text())
    conversion['upscale'] = manifest
    conversion['ultimateBushes'] = json.loads((ROOT / 'ultimate-bushes-conversion.json').read_text())
    write_json(conversion_path, conversion)
    print(f'Completed {len(sprites)} sprites; logical geometry and animation tracks unchanged.', flush=True)


if __name__ == '__main__':
    main()
