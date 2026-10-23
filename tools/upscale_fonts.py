#!/usr/bin/env python3
"""4x neural super-resolution of the original bitmap glyphs, keeping layout metrics.

Requires Pillow, NumPy and PyTorch. Models are cached outside the generated assets.
Network definitions follow Real-ESRGAN (BSD-3-Clause) and waifu2x (MIT):
https://github.com/xinntao/Real-ESRGAN
https://github.com/nagadomi/waifu2x
See tools/licenses/font-upscale.txt.
"""

import argparse
import copy
import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
PIXEL_FONTS = {"pico129", "pix118bold"}
MODELS = {
    "general": ("v0.2.5.0", "realesr-general-x4v3.pth"),
    "waifu2x": ("", "waifu2x-scale2.json"),
}


class SRVGGNet(nn.Module):
    def __init__(self):
        super().__init__()
        layers = [nn.Conv2d(3, 64, 3, 1, 1), nn.PReLU(64)]
        for _ in range(32):
            layers.extend([nn.Conv2d(64, 64, 3, 1, 1), nn.PReLU(64)])
        layers.append(nn.Conv2d(64, 3 * SCALE * SCALE, 3, 1, 1))
        self.body = nn.Sequential(*layers)

    def forward(self, x):
        return F.pixel_shuffle(self.body(x), SCALE) + F.interpolate(x, scale_factor=SCALE, mode="nearest")


class Upscaler:
    def __init__(self, name, device):
        version, filename = MODELS[name]
        path = ROOT / "temp/font-upscale" / filename
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            url = ("https://raw.githubusercontent.com/nagadomi/waifu2x/master/models/upconv_7/art/scale2.0x_model.json"
                   if name == "waifu2x" else f"https://github.com/xinntao/Real-ESRGAN/releases/download/{version}/{filename}")
            urllib.request.urlretrieve(url, path)
        self.device = torch.device(device)
        self.name = name
        if name == "waifu2x":
            layers = []
            for spec in json.loads(path.read_text()):
                cls = nn.ConvTranspose2d if spec["class_name"] == "nn.SpatialFullConvolution" else nn.Conv2d
                conv = cls(spec["nInputPlane"], spec["nOutputPlane"], spec["kW"], spec["dW"], spec["padW"])
                conv.load_state_dict({"weight": torch.tensor(spec["weight"]), "bias": torch.tensor(spec["bias"])})
                layers.extend([conv, nn.LeakyReLU(0.1)])
            self.model = nn.Sequential(*layers[:-1])
        else:
            self.model = SRVGGNet()
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            self.model.load_state_dict(checkpoint.get("params_ema", checkpoint.get("params")), strict=True)
        self.model.eval().to(self.device)

    @torch.inference_mode()
    def _waifu2x(self, tensor):
        for _ in range(2):
            total = None
            # Average mirrored/transposed predictions to remove the model's
            # directional edge bias, without blurring the finished glyph.
            for transpose in (False, True):
                for flips in ((), (-1,), (-2,), (-2, -1)):
                    view = tensor.flip(flips) if flips else tensor
                    if transpose:
                        view = view.transpose(-2, -1)
                    result = self.model(F.pad(view, (7, 7, 7, 7), mode="replicate")).clamp_(0, 1)
                    if transpose:
                        result = result.transpose(-2, -1)
                    if flips:
                        result = result.flip(flips)
                    total = result if total is None else total.add_(result)
            tensor = total / 8
        return tensor

    @torch.inference_mode()
    def rgb(self, image):
        pixels = np.asarray(image.convert("RGB"), dtype=np.float32) / 255
        height, width = pixels.shape[:2]
        output = np.empty((height * SCALE, width * SCALE, 3), dtype=np.uint8)
        # Overlap provides context at tile boundaries; only copy each tile's centre.
        tile, overlap = getattr(self, 'tile_size', 192), 24
        for y in range(0, height, tile):
            for x in range(0, width, tile):
                x1, y1 = max(0, x - overlap), max(0, y - overlap)
                x2, y2 = min(width, x + tile + overlap), min(height, y + tile + overlap)
                tensor = torch.from_numpy(pixels[y1:y2, x1:x2].copy()).permute(2, 0, 1).unsqueeze(0).to(self.device)
                if self.name == "waifu2x":
                    result = self._waifu2x(tensor)[0].permute(1, 2, 0).cpu().numpy()
                else:
                    result = self.model(tensor).clamp_(0, 1)[0].permute(1, 2, 0).cpu().numpy()
                dx, dy = (x - x1) * SCALE, (y - y1) * SCALE
                w, h = min(tile, width - x) * SCALE, min(tile, height - y) * SCALE
                output[y * SCALE:y * SCALE + h, x * SCALE:x * SCALE + w] = np.rint(result[dy:dy + h, dx:dx + w] * 255).astype(np.uint8)
        return Image.fromarray(output)

    def rgba(self, image, separate_layers=False):
        pixels = np.asarray(image)
        visible = pixels[pixels[:, :, 3] > 0, :3]
        if separate_layers and len(visible):
            return self._rgba_layers(image)
        if len(visible) == 0 or np.all(visible == visible[0]):
            # Mask fonts store the whole glyph in alpha, with constant white/black RGB.
            alpha = self.rgb(image.getchannel("A")).convert("L")
            color = tuple(int(value) for value in visible[0]) if len(visible) else (255, 255, 255)
            result = Image.new("RGB", alpha.size, color)
        else:
            # SR both composites, then recover straight alpha. Feeding hidden RGB and
            # alpha independently turns the inset font's translucent shading opaque.
            composites = []
            for color in ("black", "white"):
                background = Image.new("RGBA", image.size, color)
                background.alpha_composite(image)
                composites.append(np.asarray(self.rgb(background), dtype=np.float32) / 255)
            black, white = composites
            opacity = np.clip(1 - np.mean(white - black, axis=2), 0, 1)
            colors = np.clip(black / np.maximum(opacity[:, :, None], 1 / 255), 0, 1)
            result = Image.fromarray(np.rint(colors * 255).astype(np.uint8))
            alpha = Image.fromarray(np.rint(opacity * 255).astype(np.uint8))
        result.putalpha(alpha)
        return result

    def _rgba_layers(self, image):
        # Dwarven's palette consists of black shading, white highlights and an
        # optional coloured face. Upscale their coverages rather than guessing
        # alpha from two independently deformed background composites.
        pixels = np.asarray(image, dtype=np.float32) / 255
        rgb, alpha = pixels[:, :, :3], pixels[:, :, 3]
        darkest, lightest = rgb.min(2), rgb.max(2)
        chroma = lightest - darkest
        masks = [alpha * (1 - lightest), alpha * darkest]
        colors = [np.zeros(3, dtype=np.float32), np.ones(3, dtype=np.float32)]
        if chroma.max() > 0.01:
            color = rgb.reshape(-1, 3)[chroma.argmax()]
            # Black + white + a normalized hue must sum to the source alpha.
            # Using the original hue here counts its gray component twice.
            masks.append(alpha * chroma)
            colors.append((color - color.min()) / (color.max() - color.min()))
        upscaled = []
        for mask in masks:
            mask = Image.fromarray(np.rint(np.clip(mask, 0, 1) * 255).astype(np.uint8))
            # Remove isolated SR notches in coverage, keeping the original
            # antialias values and shading instead of blurring finished RGBA.
            prediction = self.rgb(mask).convert("L").filter(ImageFilter.MedianFilter(3))
            upscaled.append(np.asarray(prediction, dtype=np.float32) / 255)
        weights = np.stack(upscaled, axis=2)
        coverage = weights.sum(2, keepdims=True)
        rgb = np.clip(weights @ np.array(colors) / np.maximum(coverage, 1 / 255), 0, 1)
        rgba = np.dstack([rgb, np.minimum(coverage[:, :, 0], 1)])
        return Image.fromarray(np.rint(rgba * 255).astype(np.uint8))


def pack_glyphs(config, image_name, source, padding=8, source_scale=1):
    """Repack before SR: isolate glyphs and keep the final texture within 4096px."""
    chars = [char for layer in config["layers"] if layer["image"] == image_name for char in layer["chars"].values()]
    rects = sorted({tuple(char["rect"]) for char in chars}, key=lambda rect: (rect[1], rect[0]))
    max_width = 1024
    positions = {}
    x = y = row_height = used_width = 0
    for rect in rects:
        _sx, _sy, width, height = rect
        if x + width + padding * 2 > max_width:
            x, y, row_height = 0, y + row_height, 0
        positions[rect] = (x + padding, y + padding)
        x += width + padding * 2
        used_width = max(used_width, x)
        row_height = max(row_height, height + padding * 2)
    if max(used_width, y + row_height) * SCALE > 4096:
        raise ValueError(f"Font atlas exceeds 4096px after SR: {image_name}")
    packed = Image.new("RGBA", (used_width * source_scale, (y + row_height) * source_scale))
    for (sx, sy, width, height), position in positions.items():
        crop = source.crop(tuple(value * source_scale for value in (sx, sy, sx + width, sy + height)))
        packed.paste(crop, tuple(value * source_scale for value in position))
    for char in chars:
        position = positions[tuple(char["rect"])]
        char["rect"][:2] = position
    return packed


def render_text(config, directory, text):
    """Offline specimen using the original advances, offsets, kerning and layer order."""
    scale = SCALE
    result = Image.new("RGBA", (1700, 300), (185, 154, 107, 255))
    commands = []
    for layer in config["layers"]:
        texture = Image.open(directory / f"{layer['image']}.png").convert("RGBA")
        texture_scale = layer.get("textureScale", 1)
        x = 12
        for i, letter in enumerate(text):
            code = str(config["charMap"].get(str(ord(letter)), ord(letter)))
            char = layer["chars"].get(code)
            if char is None:
                continue
            rx, ry, width, height = char["rect"]
            glyph = texture.crop(tuple(value * texture_scale for value in (rx, ry, rx + width, ry + height)))
            if texture_scale == 1:
                glyph = glyph.resize((width * scale, height * scale), Image.Resampling.NEAREST)
            data = np.asarray(glyph, dtype=np.float32)
            data = np.clip(data * np.array(layer["colorMult"]) / 255 + np.array(layer["colorAdd"]), 0, 255).astype(np.uint8)
            px = (x + layer["offset"][0] + char["offset"][0]) * scale
            py = (8 + layer["offset"][1] + char["offset"][1]) * scale
            commands.append((layer["baseOrder"] + char["order"], Image.fromarray(data), (px, py)))
            next_code = str(ord(text[i + 1])) if i + 1 < len(text) else "0"
            x += char["width"] + layer["spacing"] + char["kerning"].get(next_code, 0)
    for _order, glyph, position in sorted(commands, key=lambda command: command[0]):
        result.alpha_composite(glyph, position)
    return result.crop((0, 0, min(1700, (x + 10) * scale), min(300, (config["layers"][0]["chars"].get("87", next(iter(config["layers"][0]["chars"].values())))["rect"][3] + 16) * scale)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fonts", nargs="*", help="Font names; pixel fonts are always excluded")
    parser.add_argument("--model", choices=["auto", *MODELS], default="auto",
                        help="Auto uses waifu2x for beveled Dwarven fonts and Real-ESRGAN for the other fonts")
    parser.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    parser.add_argument("--source", type=Path, default=ROOT / "assets/resources/fonts")
    parser.add_argument("--output", type=Path, default=ROOT / "art/resource-packs/hd/fonts")
    parser.add_argument("--preview-output", type=Path, help="Defaults to art/generated/font-upscale for project assets, otherwise --output")
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Output must be separate from the original font directory")
    args.output.mkdir(parents=True, exist_ok=True)
    preview_output = args.preview_output or (ROOT / "art/generated/font-upscale" if args.output.resolve() == parser.get_default("output").resolve() else args.output)
    preview_output.mkdir(parents=True, exist_ok=True)
    upscalers = {}
    report_path = preview_output / "sources.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    paths = [args.source / f"{name}.json" for name in args.fonts] if args.fonts else sorted(args.source.glob("*.json"))
    paths = [path for path in paths if path.stem not in PIXEL_FONTS]
    for name in PIXEL_FONTS:
        report.pop(name, None)
    for path in paths:
        original = json.loads(path.read_text())
        if any(layer.get("textureScale", 1) != 1 for layer in original["layers"]):
            raise ValueError(f"Input must be the original bitmap, not a previously upscaled font: {path}")
        model = ("waifu2x" if path.stem.startswith("dwarventodcraft") else "general") if args.model == "auto" else args.model
        if model not in upscalers:
            upscalers[model] = Upscaler(model, args.device)
        upscaler = upscalers[model]
        source_hash = hashlib.sha256(path.read_bytes())
        config = copy.deepcopy(original)
        for image_name in dict.fromkeys(layer["image"] for layer in config["layers"]):
            image_path = args.source / f"{image_name}.png"
            source_hash.update(image_path.read_bytes())
            source = Image.open(image_path).convert("RGBA")
            packed = pack_glyphs(config, image_name, source)
            result = upscaler.rgba(packed, separate_layers=path.stem.startswith("dwarventodcraft"))
            # Inference needs context around glyphs; the finished texture only
            # needs a 4px gutter, so discard the large temporary padding.
            result = pack_glyphs(config, image_name, result, padding=1, source_scale=SCALE)
            result.save(args.output / f"{image_name}.png")
            print(f"{path.stem}: {model} {image_name} -> {result.size}", flush=True)
        for layer in config["layers"]:
            layer["textureScale"] = SCALE
        (args.output / path.name).write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
        text = "WWW WAVY 123" if "green" not in path.stem else "Back to Game W"
        before = render_text(original, args.source, text)
        after = render_text(config, args.output, text)
        comparison = Image.new("RGB", (max(before.width, after.width), before.height + after.height + 48), "#d7c6a2")
        draw = ImageDraw.Draw(comparison)
        draw.text((8, 4), f"{path.stem}: original bitmap at 4x", fill="black")
        comparison.paste(before, (0, 24))
        draw.text((8, 28 + before.height), f"{model}: 4x super-resolution", fill="black")
        comparison.paste(after, (0, 48 + before.height))
        comparison.save(preview_output / f"{path.stem}-comparison.png")
        report[path.stem] = {"model": model, "scale": SCALE, "sourceSha256": source_hash.hexdigest()}
        if path.stem.startswith("dwarventodcraft"):
            report[path.stem]["rgbaMode"] = "palette-coverage"
            report[path.stem]["ensemble"] = 8 if model == "waifu2x" else 1
            report[path.stem]["paletteWeights"] = "alpha-conserving"
            report[path.stem]["coverageMedianSize"] = 3
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    samples = [preview_output / f"{name}-comparison.png" for name in ("houseofterror28", "dwarventodcraft18greeninset")]
    images = [Image.open(path).convert("RGB") for path in samples if path.exists()]
    if images:
        gallery = Image.new("RGB", (max(image.width for image in images), sum(image.height for image in images) + 16 * (len(images) - 1)), "#d7c6a2")
        y = 0
        for image in images:
            gallery.paste(image, (0, y))
            y += image.height + 16
        gallery.save(preview_output / "comparison.png")


if __name__ == "__main__":
    main()
