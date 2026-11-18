# Development

Setting up, converting resources, checking, building and profiling. How the code is put together is in [Architecture](ARCHITECTURE.md), the UI toolkit and screens in [UI](UI.md), and the game's behaviour against the original, level by level, in [Gameplay](GAMEPLAY.md).

## Setup

```sh
npm install
npm run preview:debug                     # preview server, http://localhost:9527 by default
```

The project uses the local Cocos CLI and Cocos 4.0.0-alpha.35. In the game, `/` opens the debug CLI (`/level <id>`, `/seed`, `/griditem`, `/gravezombies`, `/cooldown`, `/suncost`, `/goto store` and more): see [Debug CLI](DEBUG_CLI.md).

## Common commands

```sh
npm run test:server                       # server typecheck and every test
npx tsx --tsconfig tsconfig.server.json --test tests/server/xxx.test.ts   # one test file
npx tsc --noEmit -p tsconfig.json         # client typecheck
npm run mod:pack -- pvz-base --publish assets/resources/base.zip          # repack after editing pvz-base
npm run build:content -- --pak /path/to/main.pak                          # full conversion from the original PAK (about 9 minutes)
npm run mod:pack -- mods/widescreen       # pack a Mod
npx tsx --tsconfig tsconfig.server.json --test mods/widescreen/tests/*.test.ts   # a Mod's own tests
```

## Resources

`npm run build:content -- --pak /path/to/main.pak` extracts the PAK into a temporary directory and converts resources directly into `mods/pvz-base/assets/`, grouped as `images`, `fonts`, `audio`, `reanim`, `particles`, `music`, `json`, `text` and `prefabs`. It updates the explicit mappings in `content.json`, then invokes the ordinary Mod packer. Converted assets are ignored by Git; authored gameplay/presentation tables remain unchanged. Only the bootstrap scene, compiled layout prefab and shader remain engine-managed resources.

Place your game's `main.pak` and `PlantsVsZombies.exe` in `tools/`, then run from the project root:

```sh
npm run build:content -- --pak /path/to/main.pak
```

The pipeline requires Python 3.10+, Pillow, ffmpeg and libopenmpt. `npm run build:content -- --pak /path/to/main.pak --exe /path/to/PlantsVsZombies.exe` imports and publishes the base package; without `--pak` or `--exe` the sources default to `tools/main.pak` and `tools/PlantsVsZombies.exe`, and a missing file is an error. After editing existing Mod assets or definitions, use `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` without reconversion.

App icons come from the original game icon, which is not kept in Git either. `npm run build:icons -- --ico /path/to/game.ico` writes the web icons (`game.ico`, `icon-256.png`, `apple-touch-icon.png`) under `build-templates/web-mobile/` and the macOS, iOS, Android and Windows icons under `native/engine/`; all outputs are ignored by Git. Without `--ico` the source defaults to `tools/game.ico`. The icon is the `IDI_MAIN_ICON` group in the original `PlantsVsZombies.exe`; its 16×16 frame is the window title-bar flower.

The mouse cursors exist only in the original program, not in `main.pak`. Before converting, the importer extracts the big arrow (the program's cursor resource) and SexyAppFramework's pointing and dragging hands (32×32 `CreateCursor` masks) that the original `LawnApp::EnforceCursor` shows, finding them by content hash rather than resource IDs or file offsets. They are registered in `content.json` as the sprites `pvz:cursor_pointer`, `pvz:cursor_hand` and `pvz:cursor_dragging`, ship in the built-in ZIP, and resource packs may replace them by ID. `CursorManager` maps `default`, `pointer` and `grabbing` to these images at their original hotspots (scaled by `scale` for higher-density replacements): CSS cursors on the web, SDL colour cursors through the engine's `jsb.setCursorImage` on native Windows and macOS. Turning `/cursor` off, or images that fail to load, leave the system cursors.

Save loading still checks the base content ID, version, hash and gameplay Mods. The builtin ZIP uses the same `manifest.json` and `content.json` as Mods, with gameplay and presentation definitions referenced directly from the common index; its hash covers every default file and resource mapping. Presentation overrides do not modify authoritative gameplay JSON.

Music and sound effects use MP3 through the existing `tools/pvz/music/convert.py` and `tools/pvz/audio.py` pipeline. Music uses LAME VBR q2 and effects q4 at 44.1kHz. Dynamic music stems retain their leading silence, gain and loop/beat metadata. This reduces download/package size; decoded PCM memory does not shrink by the same ratio.

## Checks and builds

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

On macOS with Xcode, `npm run compile:ios:release` exports current resources and calls `cocos make` to compile and package `build/ios/pvz-remake-mobile-unsigned.ipa` for self-signing. The arm64 iPhone Release build requires no developer team. Cocos checks ZIP integrity and writes a `.ipa.sha256` checksum file; the intermediate `.app` remains under `build/ios/proj/Release-iphoneos/`.

Windows and Android build commands remain available; Web validation does not establish native compilation or device validation.

### Testing guidelines

- Automated tests focus on core gameplay, save and restore, Mod loading and isolation, client-server boundaries, and essential input flows. Check observable behavior and necessary boundaries; reuse or extend existing cases and avoid duplicate coverage and assertions tied to implementation details.
- Use the minimum appropriate validation for simple, low-risk changes. Check animation, layout, and text details manually when appropriate; add automated coverage when the regression risk warrants it. Do not add separate cases for fixed artwork coordinates, colors, or playback rates, or read source text to assert a particular code structure.
- For routine changes, run the relevant tests and typecheck when needed. Run `npm run test:server` for cross-module changes or when full validation is requested. It includes the server typecheck and all `tests/**/*.test.ts` tests, so a separate `typecheck:server` run is unnecessary.
- For example, run one file with `npx tsx --tsconfig tsconfig.server.json --test tests/server/save-restore.test.ts`. When tests fail, retain valid checks, distinguish new failures from existing ones, and do not hide failures by deleting or skipping critical tests.
- Report automated tests, builds, and runtime checks separately. Verify visuals, interaction, or platform behavior in the relevant environment when needed; a successful native build does not establish device validation. Avoid browser automation unless visual or interaction validation is required.

### Preview module mapping

The Cocos preview compiles each script to a SystemJS module that imports `__unresolved_N` placeholders, which `temp/programming/packer-driver/targets/preview/import-map.json` resolves per module. After editing a module many files import (such as `shared/protocol`), a module's compiled code and its mapping can fall out of step, and its imports silently come from another module. At run time this shows up as an unexplained `undefined`, such as `Cannot read properties of undefined (reading 'name')`, while the Node tests pass.

```sh
npm run check:preview                # check, and touch the sources with stale mappings so the preview recompiles them
npm run check:preview -- --dry-run   # check only
```

The script (`tools/preview/check-imports.ts`) checks, for every name each module imports, that the source file its mapping points to exports it, and lists the stale imports. After touching, wait for the preview to recompile before reloading the page. Without a preview build there is nothing to check and it exits. In preview, an `Error` reaches `temp/logs/cocos.log` with its stack, and `IntegratedGameHost` logs the original server error, which shows where it failed.

### iOS profiling

iOS forbids JIT, so V8 runs as an interpreter and JS costs far more than on desktop; judge performance on a device. `PVZ_JS_PROFILE=1 npm run compile:ios:release` enables the V8 debugger port (6086) in a Release build without enabling `CC_DEBUG`. After installing, forward it with `pymobiledevice3 usbmux forward 16086 6086`, then run `npx tsx tools/profile/ios.ts http://127.0.0.1:16086 10 /tmp/pvz.cpuprofile` to sample and list the most expensive functions. Use `/level pvz:stress-test` with `/fps` on for high-load comparisons.

### Debug builds

Debug builds keep the level probe on the global `pvzLevel`. See [the Mod guide](MODS.md) for Mod development and installation.

## Common pitfalls

- **Repack `base.zip` after editing pvz-base JSON** (`npm run mod:pack -- pvz-base --publish assets/resources/base.zip`), or the game and the `mod-resources` tests read the old data. A repack changes the content hash, so mid-level saves made before it no longer load.
- **Generated files are not in Git**: the converted assets under `mods/pvz-base/assets/`, every Mod directory but `pvz-base` and `example` (such as `mods/widescreen/`) and `tools/local/` are ignored, so their changes never show in a diff. Say so when you change them, and pack them by hand.
- **The preview may compile a half-written file**: after quick successive edits to one file the preview compiler can pick up an intermediate version (an `xxx is not defined`, for example). Touch the file to compile it again.
- **The preview's import map may drift**: see [Preview module mapping](#preview-module-mapping).
- **Seed slots are told apart by index**: a bank may hold the same seed twice, so selection, recharge and flashing go by the slot (`selection.slot`, the events' `slot`).
- **Draw order is the original's**: new things take the original's `RenderLayer` and offset through `renderOrder(layer, row, offset)` in `shared/content/renderOrder.ts` (see [Architecture](ARCHITECTURE.md#level-presentation)), never numbers made up to fit.
- **Mods reach into the host**: they wrap host methods with `host.around()` and depend on the base's node structure (the widescreen Mod on the achievements page's `Background` layer, for example). Before renaming, moving or removing a host member, search every `mods/*/src`, the local, ignored Mods included.
