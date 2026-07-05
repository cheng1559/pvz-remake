# Development Guide

This document covers local setup, asset import, development workflow, and build notes for PvZ Remake.

## Requirements

- Cocos Creator `3.8.8`
- Python `3.10` or newer
- `ffmpeg` available in `PATH`
- Original Plants vs. Zombies game files
  - Recommended: Steam Game of the Year Edition `1.2.0.1096`
  - Other versions may not match the current asset pipeline.

## Asset Import

Original assets are not committed to this repository. To prepare the project locally:

1. Copy `main.pak` from your Plants vs. Zombies installation into:

   ```text
   tools/main.pak
   ```

2. Run the asset pipeline from the repository root:

   ```bash
   python tools/process_pak.py
   ```

   On macOS/Linux, `python3` may be required:

   ```bash
   python3 tools/process_pak.py
   ```

The pipeline extracts original resources, converts animations, particles, fonts, text, images, sound effects, and music, then writes generated runtime resources into the Cocos project.

## Open In Cocos Creator

1. Open the repository with Cocos Creator `3.8.8`.
2. Go to `Project` > `Project Settings` > `Scripting`.
3. Set `Import Map` to the absolute path of this repository's `import-map.json`.

   Example:

   ```text
   C:\path\to\pvz-remake\import-map.json
   ```

4. Open the main scene:

   ```text
   assets/scenes/scene
   ```

5. Use Browser Preview or Editor Preview.

Simulator Preview currently has known compatibility issues.

## Development Notes

- Source code lives mainly in `assets/scripts`.
- Runtime resources generated from original PvZ files live under `assets/resources`.
- Native bridge code lives under `native/engine`.
- Asset conversion scripts live under `tools`.
- Generated folders such as `library`, `temp`, `build`, `tools/raw`, and original asset outputs are intentionally ignored by git.

Useful debug entry points:

- Desktop: press `/` to open the debug CLI.
- Mobile mode: double tap the bottom-right screen corner to open the debug CLI.
- Use `/background true|false` to toggle widescreen side backgrounds.

## Repository Layout

```text
assets/
  scenes/               Cocos scenes
  scripts/              TypeScript game, UI, renderer, and persistence code
  resources/            Generated runtime assets
native/
  engine/               Native bridge and Android project files
tools/
  process_pak.py        One-step original asset import pipeline
  *.py                  Asset conversion utilities
```

## Build

Use Cocos Creator's Build panel for target platforms.

Recommended before building:

1. Re-run the asset pipeline after changing conversion scripts.
2. Test in Browser Preview.
3. Verify mobile mode and full-screen behavior if targeting mobile.
4. Keep generated build output out of git unless it is explicitly attached to a release.
