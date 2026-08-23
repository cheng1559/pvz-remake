from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from font_converter import write_font_v2
from particle_converter import write_particle_v2
from reanim_converter import build_reanim_clip_v2, load_json_config, write_reanim_clip_v2, write_reanim_v2
from sprite_texture_preprocessor import (
    get_alpha_companion_name,
    select_image_resources,
    write_preprocessed_resource,
)

MANAGED_DIRECTORIES = ("audio", "fonts", "music", "particles", "reanim", "sprites")
NAMESPACE_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
QUALIFIED_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$")


def build_sprite_content(
    source: Path,
    bundle: Path,
    namespace: str = "pvz",
    reanim_sources: list[Path] | None = None,
    reanim_clips: list[tuple[Path, str, str, str]] | None = None,
    fonts: list[tuple[Path, str]] | None = None,
    anim_config: Path = Path("tools"),
    particles: list[tuple[Path, str]] | None = None,
    sounds: list[tuple[Path, str]] | None = None,
    music: list[tuple[Path, str, str]] | None = None,
    gameplay_source: Path | None = None,
    sprite_sources: list[tuple[Path, str]] | None = None,
    prefabs: list[tuple[Path, str]] | None = None,
) -> dict:
    if not NAMESPACE_PATTERN.fullmatch(namespace):
        raise ValueError(f"invalid content namespace: {namespace}")
    sprite_ids = _validated_local_ids(sprite_sources or [], 1, namespace, "sprite")
    clip_ids = _validated_local_ids(reanim_clips or [], 3, namespace, "reanim")
    font_ids = _validated_local_ids(fonts or [], 1, namespace, "font")
    particle_ids = _validated_local_ids(particles or [], 1, namespace, "particle")
    sound_ids = _validated_local_ids(sounds or [], 1, namespace, "sound")
    music_ids = _validated_local_ids(music or [], 2, namespace, "music")
    prefab_ids = _validated_local_ids(prefabs or [], 1, namespace, "prefab")
    gameplay_source = gameplay_source or source / "gameplay"
    inputs = sorted(path for path in source.iterdir() if path.is_file())
    sprites: dict[str, str] = {}
    outputs: list[Path] = []

    for src in inputs:
        name = src.stem.lower()
        if not name or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in name):
            raise ValueError(f"invalid sprite name: {src.name}")
        content_id = f"{namespace}:{name}"
        if content_id in sprites:
            raise ValueError(f"duplicate sprite name: {name}")
        dst = bundle / "sprites" / f"{name}.png"
        write_preprocessed_resource(src, dst, resource_name=name, force_png=True)
        sprites[content_id] = f"sprites/{name}/spriteFrame"
        outputs.append(dst)

    for source_path, content_id in sprite_sources or []:
        if content_id in sprites:
            raise ValueError(f"duplicate sprite ID: {content_id}")
        local_id = sprite_ids[content_id]
        resources = select_image_resources(source_path.parent)
        dst = bundle / "sprites" / f"{local_id}.png"
        write_preprocessed_resource(
            source_path,
            dst,
            resource_name=local_id,
            alpha_src=resources.get(get_alpha_companion_name(source_path.stem.lower())),
            force_png=True,
        )
        sprites[content_id] = f"sprites/{local_id}/spriteFrame"
        outputs.append(dst)

    reanim: dict[str, str] = {}
    for source_path in sorted(reanim_sources or []):
        content_id = f"{namespace}:{source_path.stem.lower()}"
        if content_id in reanim:
            raise ValueError(f"duplicate reanim ID: {content_id}")
        output = bundle / "reanim" / f"{source_path.stem.lower()}.json"
        write_reanim_v2(source_path, output, content_id, set(sprites), namespace)
        reanim[content_id] = f"reanim/{source_path.stem.lower()}"
        outputs.append(output)

    anim_defs = load_json_config(anim_config) if reanim_clips else {}
    for source_path, node_id, clip_id, content_id in reanim_clips or []:
        if content_id in reanim:
            raise ValueError(f"duplicate reanim ID: {content_id}")
        anim_info = anim_defs.get(source_path.stem)
        if anim_info is None:
            raise ValueError(f"missing anim config: {source_path.stem}")
        resources = select_image_resources(source_path.parent)
        available = {f"{namespace}:{name}" for name in resources}
        data = build_reanim_clip_v2(
            source_path, anim_info, node_id, clip_id, content_id, available, namespace
        )
        referenced = sorted({
            frame["sprite"].split(":", 1)[1]
            for track in data["tracks"]
            for frame in track["keyframes"]
            if frame["sprite"] is not None
        })
        for name in referenced:
            src = resources.get(name)
            if src is None:
                raise ValueError(f"missing sprite source: {name}")
            dst = bundle / "sprites" / f"{name}.png"
            write_preprocessed_resource(
                src,
                dst,
                resource_name=name,
                alpha_src=resources.get(get_alpha_companion_name(name)),
                force_png=True,
            )
            sprites[f"{namespace}:{name}"] = f"sprites/{name}/spriteFrame"
            if dst not in outputs:
                outputs.append(dst)

        local_id = clip_ids[content_id]
        output = bundle / "reanim" / f"{local_id}.json"
        write_reanim_clip_v2(
            source_path, output, anim_info, node_id, clip_id, content_id, set(sprites), namespace
        )
        reanim[content_id] = f"reanim/{local_id}"
        outputs.append(output)

    font_entries: dict[str, str] = {}
    for source_path, content_id in fonts or []:
        local_id = font_ids[content_id]
        if source_path.stem.lower() != local_id:
            raise ValueError(f"font ID must match source name: {content_id}")
        font_outputs = write_font_v2(source_path, bundle / "fonts", content_id)
        font_entries[content_id] = f"fonts/{local_id}"
        outputs.extend(font_outputs)

    particle_entries: dict[str, str] = {}
    for source_path, content_id in particles or []:
        local_id = particle_ids[content_id]
        if source_path.stem.lower() != local_id:
            raise ValueError(f"particle ID must match source name: {content_id}")
        output = bundle / "particles" / f"{local_id}.json"
        data = write_particle_v2(source_path, output, content_id, namespace)
        particle_entries[content_id] = f"particles/{local_id}"
        outputs.append(output)
        for sprite_id in sorted({emitter["sprite"] for emitter in data["emitters"]}):
            name = sprite_id.split(":", 1)[1]
            src = source_path.parent / f"{name}.png"
            if not src.is_file():
                raise ValueError(f"missing particle sprite source: {src}")
            dst = bundle / "sprites" / f"{name}.png"
            write_preprocessed_resource(src, dst, resource_name=name, force_png=True)
            sprites[sprite_id] = f"sprites/{name}/spriteFrame"
            if dst not in outputs:
                outputs.append(dst)

    for path in sprites.values():
        image = bundle / f"{path.removesuffix('/spriteFrame')}.png"
        if not image.is_file():
            raise ValueError(f"missing sprite output: {image}")

    gameplay_entries = {
        "definitions": "gameplay/definitions.json",
        "levels": "gameplay/levels.json",
        "strings": "gameplay/strings.json",
    }
    expected_gameplay_fields = {
        "definitions": {"schemaVersion", "tickSeconds", "boards", "seeds", "plants", "zombies", "projectiles", "items", "lawnMowers"},
        "levels": {"schemaVersion", "levels"},
        "strings": {"schemaVersion", "locale", "entries"},
    }
    for category, relative_path in gameplay_entries.items():
        source_path = gameplay_source / f"{category}.json"
        if not source_path.is_file():
            raise ValueError(f"missing gameplay source: {source_path}")
        data = json.loads(source_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("schemaVersion") != 2:
            raise ValueError(f"invalid gameplay {category} schemaVersion")
        if set(data) != expected_gameplay_fields[category]:
            raise ValueError(f"invalid gameplay {category} fields")
        output = bundle / relative_path
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(_json_bytes(data) + b"\n")
        outputs.append(output)

    sound_entries: dict[str, str] = {}
    for source_path, content_id in sounds or []:
        local_id = sound_ids[content_id]
        if source_path.stem.lower() != local_id:
            raise ValueError(f"sound ID must match source name: {content_id}")
        suffix = source_path.suffix.lower()
        if suffix not in {".mp3", ".ogg", ".wav"}:
            raise ValueError(f"unsupported sound format: {source_path}")
        output = bundle / "audio" / "sfx" / f"{local_id}{suffix}"
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, output)
        sound_entries[content_id] = f"audio/sfx/{local_id}"
        outputs.append(output)

    music_entries: dict[str, str] = {}
    for manifest_path, tune_id, content_id in music or []:
        local_id = music_ids[content_id]
        if tune_id != local_id:
            raise ValueError(f"music ID must match tune: {content_id}")
        legacy = json.loads(manifest_path.read_text(encoding="utf-8"))
        tune = legacy.get("tunes", {}).get(tune_id)
        if not isinstance(tune, dict):
            raise ValueError(f"missing music tune: {tune_id}")
        legacy_stems = tune.get("stems")
        if not isinstance(legacy_stems, dict) or not isinstance(legacy_stems.get("main"), str):
            raise ValueError(f"music tune has no main stem: {tune_id}")
        stems = {name: legacy_stems.get(name) for name in ("main", "drums", "hihats")}
        definition = {
            "schemaVersion": 2,
            "id": content_id,
            "durationSeconds": tune["durationSec"],
            "loopStartSeconds": tune["loopStartSec"],
            "loopEndSeconds": tune["loopEndSec"],
            "stems": stems,
        }
        definition_path = bundle / "music" / f"{local_id}.json"
        definition_path.parent.mkdir(parents=True, exist_ok=True)
        definition_path.write_bytes(_json_bytes(definition) + b"\n")
        outputs.append(definition_path)
        music_entries[content_id] = f"music/{local_id}"
        for stem_path in sorted(path for path in stems.values() if path is not None):
            source_audio = manifest_path.parent / f"{Path(stem_path).name}.mp3"
            if not source_audio.is_file():
                raise ValueError(f"missing music stem: {source_audio}")
            output_audio = bundle / f"{stem_path}.mp3"
            output_audio.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_audio, output_audio)
            outputs.append(output_audio)

    prefab_entries: dict[str, str] = {}
    for source_path, content_id in prefabs or []:
        if not source_path.is_file():
            raise ValueError(f"missing prefab: {source_path}")
        output_path = bundle / "ui" / f"{prefab_ids[content_id]}.prefab"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if source_path.resolve() != output_path.resolve():
            shutil.copyfile(source_path, output_path)
        outputs.append(output_path)
        prefab_entries[content_id] = f"ui/{prefab_ids[content_id]}"

    _remove_stale_outputs(bundle, outputs)
    manifest = {
        "schemaVersion": 2,
        "id": f"{namespace}:base",
        "version": "2.0.0",
        "contentHash": "",
        "gameplay": gameplay_entries,
        "client": {
            "bundle": f"{namespace}-base",
            "sprites": sprites,
            "reanim": reanim,
            "particles": particle_entries,
            "fonts": font_entries,
            "sounds": sound_entries,
            "music": music_entries,
            "prefabs": prefab_entries,
        },
    }
    digest = hashlib.sha256()
    digest.update(_json_bytes(manifest))
    for path in sorted(set(outputs), key=lambda item: item.relative_to(bundle).as_posix()):
        digest.update(path.relative_to(bundle).as_posix().encode())
        digest.update(path.read_bytes())
    manifest["contentHash"] = digest.hexdigest()
    (bundle / "manifest.json").write_bytes(_json_bytes(manifest) + b"\n")
    return manifest


def _json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def _validated_local_ids(
    entries: list[tuple],
    id_index: int,
    namespace: str,
    category: str,
) -> dict[str, str]:
    result: dict[str, str] = {}
    for entry in entries:
        content_id = entry[id_index]
        if not isinstance(content_id, str) or not QUALIFIED_ID_PATTERN.fullmatch(content_id):
            raise ValueError(f"invalid {category} ID: {content_id}")
        owner, local_id = content_id.split(":", 1)
        if owner != namespace:
            raise ValueError(f"{category} ID {content_id} is outside {namespace}:")
        if any(part in {"", ".", ".."} for part in local_id.split("/")):
            raise ValueError(f"unsafe {category} ID path: {content_id}")
        if content_id in result:
            raise ValueError(f"duplicate {category} ID: {content_id}")
        result[content_id] = local_id
    return result


def _remove_stale_outputs(bundle: Path, outputs: list[Path]) -> None:
    expected = set(outputs)
    for directory in MANAGED_DIRECTORIES:
        root = bundle / directory
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix != ".meta" and path not in expected:
                path.unlink()
                Path(f"{path}.meta").unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--namespace", default="pvz")
    parser.add_argument("--reanim", action="append", type=Path, default=[])
    parser.add_argument("--reanim-clip", action="append", nargs=4, default=[], metavar=("SOURCE", "NODE", "CLIP", "ID"))
    parser.add_argument("--font", action="append", nargs=2, default=[], metavar=("SOURCE", "ID"))
    parser.add_argument("--particle", action="append", nargs=2, default=[], metavar=("SOURCE", "ID"))
    parser.add_argument("--sound", action="append", nargs=2, default=[], metavar=("SOURCE", "ID"))
    parser.add_argument("--music", action="append", nargs=3, default=[], metavar=("MANIFEST", "TUNE", "ID"))
    parser.add_argument("--anim-config", type=Path, default=Path("tools"))
    args = parser.parse_args()
    clips = [(Path(source), node, clip, content_id) for source, node, clip, content_id in args.reanim_clip]
    fonts = [(Path(source), content_id) for source, content_id in args.font]
    particles = [(Path(source), content_id) for source, content_id in args.particle]
    sounds = [(Path(source), content_id) for source, content_id in args.sound]
    music = [(Path(manifest), tune, content_id) for manifest, tune, content_id in args.music]
    build_sprite_content(
        args.source, args.bundle, args.namespace, args.reanim, clips, fonts,
        args.anim_config, particles, sounds, music
    )
