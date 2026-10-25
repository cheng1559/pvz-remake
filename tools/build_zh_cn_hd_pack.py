"""Combine the English HD assets with super-resolved Chinese localization assets."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
import time
from pathlib import Path

import torch
from package_resources import package_resources
from PIL import Image

from upscale_fonts import Upscaler, pack_glyphs
from upscale_ui import SHEETS, upscale, upscale_sheet

ROOT = Path(__file__).resolve().parents[1]
HD = ROOT / 'art/resource-packs/hd'
ZH = ROOT / 'art/resource-packs/zh-cn'
PACK = ROOT / 'art/resource-packs/zh-cn-hd'
CACHE = ROOT / 'temp/zh-cn-hd'


def model_signature(name: str):
    path = Path(name)
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else name


class CachedUpscaler(Upscaler):
    def __init__(self, name, device):
        super().__init__(name, device)
        # CJK glyph batches benefit from fewer GPU dispatches. The 24px
        # overlap still covers waifu2x's receptive field; averaging is unchanged.
        self.tile_size = 512 if name == 'waifu2x' else 192
        self.signature = model_signature(name)

    def rgb(self, image):
        # Font styles often share identical outline/face masks. Reuse their exact
        # predictions without changing the model's output.
        digest = hashlib.sha256(image.tobytes() + str((image.mode, image.size)).encode()
                                + (ROOT / 'tools/upscale_fonts.py').read_bytes()
                                + self.signature.encode()).hexdigest()
        target = CACHE / f'rgb-chunks/{self.name}/{digest}.png'
        if target.exists():
            return Image.open(target).convert('RGB')
        result = super().rgb(image)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.tmp')
        result.save(temporary, 'PNG')
        temporary.replace(target)
        return result


def write_json(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    temporary.replace(path)


def build_images(device: str, hd: dict, zh: dict, model_name: str):
    entries = copy.deepcopy(hd['sprites'])
    for id, entry in entries.items():
        if id not in zh['sprites']:
            target = PACK / entry['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(HD / entry['file'], target)
    report_path = CACHE / 'images.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    signature = hashlib.sha256((ROOT / 'tools/upscale_ui.py').read_bytes()
                               + (ROOT / 'tools/upscale_fonts.py').read_bytes()
                               + model_signature(model_name).encode()).hexdigest()
    model = None
    start = time.monotonic()
    for index, (id, entry) in enumerate(zh['sprites'].items(), 1):
        source = ZH / entry['file']
        target = PACK / entry['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if not target.exists() or report.get(id) != [digest, signature]:
            if model is None:
                model = Upscaler(model_name, device)
            with Image.open(source) as image:
                image = image.convert('RGBA')
                name = id.split(':', 1)[1]
                result = upscale_sheet(image, SHEETS[name], model) if name in SHEETS else upscale(image, model)
            temporary = target.with_suffix('.tmp')
            result.save(temporary, 'PNG')
            temporary.replace(target)
            report[id] = [digest, signature]
            write_json(report_path, report)
            if device == 'mps':
                torch.mps.empty_cache()
            print(f'Images [{index}/{len(zh["sprites"])}] {id}, {time.monotonic() - start:.0f}s', flush=True)
        else:
            print(f'Images [{index}/{len(zh["sprites"])}] cached {id}', flush=True)
        entries[id] = {**entry, 'scale': 2}
    write_json(CACHE / 'sprites.json', entries)
    return entries


def build_font(name: str, config: dict, model: Upscaler, device: str):
    config = copy.deepcopy(config)
    output_layers = []
    for layer_index, layer in enumerate(config['layers']):
        image_name = layer['image']
        source = Image.open(ZH / f'fonts/{image_name}.png').convert('RGBA')
        glyphs = {}
        # Remove only transparent padding, compensating offsets so the visible
        # glyph, baseline, advance and kerning retain their original positions.
        for code, char in layer['chars'].items():
            x, y, width, height = char['rect']
            box = source.crop((x, y, x + width, y + height)).getbbox()
            if not box:
                char['rect'] = [0, 0, 0, 0]
                continue
            left, top = max(0, box[0] - 1), max(0, box[1] - 1)
            right, bottom = min(width, box[2] + 1), min(height, box[3] + 1)
            char['rect'] = [x + left, y + top, right - left, bottom - top]
            char['offset'] = [char['offset'][0] + left, char['offset'][1] + top]
            glyphs[code] = char

        # Existing layered bitmap fonts can express pages: every page retains
        # every advance, while glyphs assigned to other pages have an empty rect.
        # This needs no new runtime format or font-renderer branch.
        placements, sizes = {}, []
        x = y = row_height = used_width = page = 0
        for code, char in glyphs.items():
            width, height = char['rect'][2:]
            if x + width + 2 > 1024:
                x, y, row_height = 0, y + row_height, 0
            if y + height + 2 > 1024:
                sizes.append((used_width, y + row_height))
                x = y = row_height = used_width = 0
                page += 1
            placements[code] = (page, x + 1, y + 1)
            x += width + 2
            used_width = max(used_width, x)
            row_height = max(row_height, height + 2)
        sizes.append((used_width, y + row_height))
        pages = [Image.new('RGBA', (width * 4, height * 4)) for width, height in sizes]
        codes = list(glyphs)
        for start in range(0, len(codes), 128):
            batch = codes[start:start + 128]
            packing = {'layers': [{'image': image_name, 'chars': {
                code: {'rect': glyphs[code]['rect'].copy()} for code in batch
            }}]}
            packed = pack_glyphs(packing, image_name, source)
            # Cache complete chunks so interrupted large CJK batches can resume.
            digest = hashlib.sha256(packed.tobytes() + str(packed.size).encode()
                                    + (ROOT / 'tools/upscale_fonts.py').read_bytes()
                                    + model.signature.encode()).hexdigest()
            cached = CACHE / f'font-chunks/{model.name}/{digest}.png'
            if cached.exists():
                result = Image.open(cached).convert('RGBA')
            else:
                result = model.rgba(packed, separate_layers=name.startswith('dwarventodcraft'))
                cached.parent.mkdir(parents=True, exist_ok=True)
                temporary = cached.with_suffix('.tmp')
                result.save(temporary, 'PNG')
                temporary.replace(cached)
            for code, char in packing['layers'][0]['chars'].items():
                sx, sy, width, height = char['rect']
                target_page, dx, dy = placements[code]
                pages[target_page].paste(result.crop((sx * 4, sy * 4, (sx + width) * 4, (sy + height) * 4)), (dx * 4, dy * 4))
            if device == 'mps':
                torch.mps.empty_cache()
            print(f'Fonts {name} layer {layer_index + 1}: {min(start + 128, len(codes))}/{len(codes)} glyphs', flush=True)
        for index, image in enumerate(pages):
            page_layer = copy.deepcopy(layer)
            page_layer['name'] = f'{layer["name"]}_{index}'
            page_layer['image'] = f'{name}_{layer_index}_{index}'
            page_layer['textureScale'] = 4
            for code, char in page_layer['chars'].items():
                target_page, dx, dy = placements.get(code, (-1, 0, 0))
                char['rect'] = [dx, dy, *char['rect'][2:]] if target_page == index else [0, 0, 0, 0]
            image.save(PACK / f'fonts/{page_layer["image"]}.png')
            output_layers.append(page_layer)
    config['layers'] = output_layers
    write_json(PACK / f'fonts/{name}.json', config)


def build_fonts(device: str, zh: dict, model_name: str):
    (PACK / 'fonts').mkdir(parents=True, exist_ok=True)
    report_path = CACHE / 'fonts.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    models = {}
    signature = hashlib.sha256((ROOT / 'tools/upscale_fonts.py').read_bytes()
                               + Path(__file__).read_bytes()
                               + model_signature(model_name).encode()).hexdigest()
    for id, file in zh['fonts'].items():
        source = ZH / file
        config = json.loads(source.read_text())
        digest = hashlib.sha256(source.read_bytes() + signature.encode())
        for name in dict.fromkeys(layer['image'] for layer in config['layers']):
            digest.update((ZH / f'fonts/{name}.png').read_bytes())
        if report.get(id) == digest.hexdigest() and (PACK / file).exists():
            print(f'Fonts cached {id}', flush=True)
            continue
        model = ('waifu2x' if source.stem.startswith('dwarventodcraft') else 'general') if model_name == 'auto' else model_name
        if model not in models:
            models[model] = CachedUpscaler(model, device)
        build_font(source.stem, config, models[model], device)
        report[id] = digest.hexdigest()
        write_json(report_path, report)
    return copy.deepcopy(zh['fonts'])


def package(sprites: dict, fonts: dict, zh: dict):
    resources = {'sprites': sprites, 'fonts': fonts, 'json': copy.deepcopy(zh['json'])}
    for file in zh['json'].values():
        (PACK / file).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ZH / file, PACK / file)
    target = package_resources(PACK, 'zh-cn-hd', resources)
    print(f'Chinese HD pack: {len(sprites)} sprites, {len(fonts)} fonts; {target} ({target.stat().st_size:,} bytes)', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='mps' if torch.backends.mps.is_available() else 'cpu')
    parser.add_argument('--model', default='auto', help='auto, general, waifu2x, or a 4x RGB model path')
    parser.add_argument('--images-only', action='store_true')
    parser.add_argument('--fonts-only', action='store_true')
    args = parser.parse_args()
    hd = json.loads((HD / 'content.json').read_text())['resources']
    zh = json.loads((ZH / 'content.json').read_text())['resources']
    sprites = json.loads((CACHE / 'sprites.json').read_text()) if args.fonts_only else build_images(
        args.device, hd, zh, 'general' if args.model == 'auto' else args.model)
    if not args.images_only:
        fonts = build_fonts(args.device, zh, args.model)
        package(sprites, fonts, zh)


if __name__ == '__main__':
    main()
