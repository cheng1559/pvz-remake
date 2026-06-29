from __future__ import annotations

import io
import shutil
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image


IMAGE_SUFFIX_PRIORITY = {".png": 0, ".jpg": 1, ".jpeg": 1, ".gif": 2}
TRANSPARENT_COLORS: dict[str, tuple[int, int, int]] = {}


def get_image_resource_name(path: Path) -> str:
    name = path.name.lower()
    while Path(name).suffix.lower() in IMAGE_SUFFIX_PRIORITY:
        name = Path(name).with_suffix("").name
    return name


def select_image_resources(src_dir: Path) -> dict[str, Path]:
    image_files = [
        p
        for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIX_PRIORITY
    ]
    images_by_resource: dict[str, list[Path]] = {}
    for image_file in image_files:
        images_by_resource.setdefault(get_image_resource_name(image_file), []).append(image_file)

    resources: dict[str, Path] = {}
    for name, candidates in images_by_resource.items():
        resources[name] = min(
            candidates,
            key=lambda path: (IMAGE_SUFFIX_PRIORITY[path.suffix.lower()], path.name.count(".")),
        )
    return resources


def is_alpha_companion_name(resource_name: str) -> bool:
    return resource_name.endswith("_")


def get_alpha_companion_name(resource_name: str) -> str:
    return f"{resource_name}_"


def load_alphagrid_resources(resources_xml: Path) -> dict[str, tuple[str, str]]:
    if not resources_xml.exists():
        return {}

    root = ElementTree.parse(resources_xml).getroot()
    result: dict[str, tuple[str, str]] = {}
    for image in root.iter("Image"):
        path = image.get("path")
        alphagrid = image.get("alphagrid")
        resource_id = image.get("id")
        if path and alphagrid and resource_id:
            result[get_image_resource_name(Path(path))] = (
                get_image_resource_name(Path(alphagrid)),
                resource_id.lower(),
            )
    return result


def get_output_name(src: Path, resource_name: str, force_png: bool) -> str:
    if force_png or src.suffix.lower() == ".gif":
        return f"{resource_name}.png"
    return src.name.lower()


def write_preprocessed_resource(
    src: Path,
    dst: Path,
    *,
    resource_name: str | None = None,
    alpha_src: Path | None = None,
    alpha_grid_src: Path | None = None,
) -> bool:
    name = resource_name if resource_name is not None else get_image_resource_name(src)
    transparent_color = TRANSPARENT_COLORS.get(name)
    alpha_src = alpha_src or alpha_grid_src

    if alpha_src or transparent_color or src.suffix.lower() == ".gif":
        data = _preprocess_to_png_bytes(
            src,
            alpha_src=alpha_src,
            transparent_color=transparent_color,
        )
        return _write_if_changed(dst, data)

    if dst.exists() and dst.read_bytes() == src.read_bytes():
        return False

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def _preprocess_to_png_bytes(
    src: Path,
    *,
    alpha_src: Path | None,
    transparent_color: tuple[int, int, int] | None,
) -> bytes:
    with Image.open(src) as image:
        result = image.convert("RGBA")

    if alpha_src:
        with Image.open(alpha_src) as image:
            alpha = image.convert("L")
        if alpha.size == result.size:
            result.putalpha(alpha)
        else:
            print(f"[textures] Skipped alpha with mismatched size: {src} vs {alpha_src}")

    if transparent_color:
        pixels = result.load()
        width, height = result.size
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if (r, g, b) == transparent_color:
                    pixels[x, y] = (r, g, b, 0)
                elif a == 0:
                    pixels[x, y] = (r, g, b, 255)

    output = io.BytesIO()
    result.save(output, "PNG")
    return output.getvalue()


def _write_if_changed(dst: Path, data: bytes) -> bool:
    if dst.exists() and dst.read_bytes() == data:
        return False

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)
    return True
