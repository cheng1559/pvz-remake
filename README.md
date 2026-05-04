# PvZ Remake

A Plants vs. Zombies 1 remake project built with Cocos Creator 3.8.8 and TypeScript.

[中文说明](README.zh-CN.md)

## Requirements

- Python 3.10 or newer
- Cocos Creator 3.8.8
- Plants vs. Zombies original game files
  - Recommended version: Steam Game of the Year Edition 1.2.0.1096
  - Other versions are not guaranteed to be fully compatible with the current asset pipeline.

## Import Original Game Assets

1. Copy `main.pak` from the root directory of the original Plants vs. Zombies installation into this project's `tools` directory.

   Expected path:

   ```text
   tools/main.pak
   ```

2. From the project root, run:

   ```bash
   python3 tools/process_pak.py
   ```

   The script extracts `main.pak`, converts the required resources, and imports them into the Cocos project resource folders automatically.

## Open the Project

1. Open this project with Cocos Creator 3.8.8.
2. In Cocos Creator, go to `Project` > `Project Settings` > `Scripting`.
3. Set `Import Map` to the absolute path of this project's `import-map.json`.

   Example:

   ```text
   C:\path\to\pvz-remake\import-map.json
   ```

## Run

1. In the Cocos Creator Asset panel, open:

   ```text
   assets/scenes/scene
   ```

2. Switch to Browser Preview or Editor Preview.

   Simulator Preview currently has known compatibility issues.

3. Click the Run button to start the project.
