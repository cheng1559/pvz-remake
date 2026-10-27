# PvZ base content

The built-in base package is authored and packed as a Mod. `content.json` declares gameplay tables, presentation tables, and every resource ID, including particles.

- Edit authored rules and presentation in `gameplay/` and `presentation/`.
- Runtime resources live in `assets/images/`, `fonts/`, `audio/`, `reanim/`, `particles/`, `music/`, `json/`, `text/` and `prefabs/`. Bitmap font configurations and atlases stay together in `assets/fonts/`. Converted resource directories are ignored by Git and packed directly from the Mod directory.
- `npm run build:content -- --pak /path/to/main.pak` extracts into a temporary directory and converts directly into these asset directories, updating the explicit resource mappings in `content.json`. Temporary files are removed even if conversion fails. The pipeline does not create a persistent raw/generated tree or an intermediate Bundle.
- `npm run mod:pack -- pvz-base` uses the standard Mod packer and writes `dist/mods/pvz-base.zip`.
- `npm run mod:test -- dist/mods/pvz-base` validates the packed content.
- `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` packs the same source and publishes the completed ZIP as `assets/resources/base.zip` for the game.
- `npm run build:content -- --pak /path/to/main.pak` imports the original PAK, converts directly to Mod assets, and packs/publishes the built-in ZIP. With no argument, the input defaults to `tools/main.pak`. Requires Python 3.10+, Pillow, ffmpeg and libopenmpt.

The importer preserves authored gameplay/presentation tables and existing custom Mod assets that are not supplied by the PAK. `presentation/ui-strings.json` contains authored UI text.

Packing reads the declared resources; it does not discover assets or regenerate source mappings. Like other Mods, references use qualified IDs such as `pvz:peasplat`. The runtime loads this package first as the required base content.
