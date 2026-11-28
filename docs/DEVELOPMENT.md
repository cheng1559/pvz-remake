[简体中文](DEVELOPMENT.zh-CN.md)

# Development

Building the game needs Node.js, Python, the Cocos toolchain and the files of a licensed copy of the original game. The original's resources are converted at build time and are never kept in Git.

## Requirements

| Requirement | Used for |
| --- | --- |
| Node.js 22.17.0 and `node-gyp` | The Cocos CLI, as its setup guide specifies, and the project's Node tools |
| Python 3.10 or later, run as `python3`, with Pillow and NumPy | `build:content`, `build:icons` and `test:tools`, which call `python3` |
| ffmpeg | Encoding sound effects; found on `PATH`, or in `/opt/homebrew/bin` or `/usr/local/bin` |
| The platform's development tools | Native builds, such as Xcode for macOS and iOS |
| Inno Setup 6 | The Windows installer |
| Xcode command line tools (`codesign`, `SetFile`) | The macOS disk image |
| Emscripten (`em++` on `PATH`) | Only for rebuilding the shared C++ kernel and the music player (`npm run build:kernel`, `npm run build:music`) |
| The original game files | Importing resources; see [Original game files](#original-game-files) |

## Toolchain

PvZ Remake uses the `dev/pvz-remake` branch of both toolchain repositories. The game declares Creator `4.0.0-alpha.35` in `package.json`. The CLI reads its engine source from `packages/engine`.

| Repository | Role | Revision checked for v0.2.1 |
| --- | --- | --- |
| [cheng1559/cocos-cli](https://github.com/cheng1559/cocos-cli/tree/dev/pvz-remake) | Provides `cocos preview`, `cocos build` and `cocos make`, including IPA packaging. | [`409c35b`](https://github.com/cheng1559/cocos-cli/commit/409c35bdf1294df45809dc3dcbf1a7b7116c032f) |
| [cheng1559/cocos4](https://github.com/cheng1559/cocos4/tree/dev/pvz-remake) | Supplies the runtime and native engine, including native cursors, pointer input for the low-resolution camera, audio streams for the tracker music, the macOS touch screen and trackpad scrolling, and fixes for DPI and audio playback. | [`a2df3bd`](https://github.com/cheng1559/cocos4/commit/a2df3bd432c1aa1947a8c53e22d52ba3acb7a188) |

For a fresh toolchain, start outside the game repository. The CLI setup guide uses Node.js 22.17.0 and `node-gyp`. Its default `npm run init` selects the upstream engine from `repo.json`; the commands below instead place the game's fork in the engine slot and fetch the native libraries at the tag declared by both forks.

```sh
git clone --branch dev/pvz-remake https://github.com/cheng1559/cocos-cli.git
cd cocos-cli
git clone --branch dev/pvz-remake https://github.com/cheng1559/cocos4.git packages/engine
git clone --depth 1 --branch v4.0.0-10 https://github.com/cocos/cocos-engine-external.git packages/engine/native/external
npm install -g node-gyp
npm run install:engine
npm install
npm run build
npm link
cocos --help
```

If you keep `cocos4` in a separate checkout, a directory symlink (or a junction on Windows) at `cocos-cli/packages/engine` can point to it. From the CLI root, run `git -C packages/engine remote get-url origin` and `git -C packages/engine rev-parse HEAD` to check which engine it will build.

## Original game files

Building requires these files from a licensed copy of the *Plants vs. Zombies* Steam Game of the Year edition, version 1.2.0.1096, placed in `tools/`. Git ignores both.

| File | Resources it provides | Read by |
| --- | --- | --- |
| `main.pak` | Images, animations, particles, fonts, sound effects, music and text | `npm run build:content` |
| `PlantsVsZombies.exe` | Resources built into the program: the mouse cursors and the app icon | `npm run build:content`, `npm run build:icons` |

The files of version 1.2.0.1073 also build, but in its `main.pak`, `properties/LawnStrings.txt` lacks part of the interface text and `images/acheesements_icons.png` lacks the Disco is Undead icon. As a result:

- achievement names and descriptions on the achievements and award pages show as text keys;
- almanac entry titles show as text keys;
- dialog buttons, the pause menu, the options and the player profile screens show text keys;
- the Disco is Undead achievement icon is blank;
- with the Chinese resource pack enabled, the text above still cannot be shown in Chinese.

## Importing resources and previewing

From the **game repository root**, with the original files in `tools/`:

```sh
npm ci
npm run build:content                     # convert the original resources, about 9 minutes
npm run build:icons                       # generate the app icons (optional)
npm run preview:debug                     # preview server, http://localhost:9527 by default
```

`npm run preview:release` starts the preview without debug mode. In the game, press `/` to open the debug console and enter commands such as `/level pvz:adventure-2-10`; see [Debug Console](DEBUG_CLI.md).

### Base content

`npm run build:content` runs `python3 -m tools.pvz`:

- The sources default to `tools/main.pak` and `tools/PlantsVsZombies.exe`; `--pak /path/to/main.pak` and `--exe /path/to/PlantsVsZombies.exe` choose others. A missing file is an error. The executable is read first, so a wrong one fails before the long PAK conversion.
- It extracts the PAK into a temporary directory and converts the resources directly into `mods/pvz-base/assets/`, grouped as `images`, `fonts`, `audio`, `reanim`, `particles`, `music`, `json` and `prefabs`.
- It updates the explicit resource mappings in `mods/pvz-base/content.json`, then invokes the ordinary Mod packer, which publishes the base package as `assets/resources/base.zip`.
- The original's animation conversion rules come from `tools/pvz/anim-defs.json`, and the interface text this project adds comes from `tools/pvz/ui-strings.json`, merged into `pvz:strings` on import.
- Converted assets are ignored by Git; the authored gameplay and presentation tables remain unchanged.
- Besides the published `base.zip`, only the bootstrap scene (`assets/scenes/scene.scene`), the level layout prefab (`assets/resources/ui/level.prefab`, which the import also copies into the base package as `pvz:level`) and the shaders in `assets/resources/effects/` remain engine-managed resources.

After editing existing Mod assets or definitions, repack without reconverting:

```sh
npm run mod:pack -- pvz-base --publish assets/resources/base.zip
```

### Base content and saves

- The built-in ZIP uses the same `manifest.json` and `content.json` as Mods, with gameplay and presentation definitions referenced directly from the common index. Its hash covers every default file and resource mapping.
- Loading a save still checks the base content's ID, version and hash and the gameplay Mods. A save that does not match is discarded, and the level starts afresh.
- A Mod's presentation changes do not modify the authoritative gameplay JSON.

### Music and sound effects

- Sound effects are converted to MP3 by `tools/pvz/audio.py`, at LAME VBR quality 4 and 44.1 kHz.
- The music is the original's tracker modules, copied as they are (`tools/pvz/music/tunes.py`): `mainmusic.mo3` and `mainmusic_hihats.mo3` become the tracker resources `pvz:mainmusic` and `pvz:mainmusic_hihats`. Each tune is its own music resource (`pvz:<tune>`) listing the parts Music::PlayMusic plays, so a Mod replaces one tune by registering the same ID.
- The game plays the modules itself; see [Music](ARCHITECTURE.md#music).

### Mouse cursors

- The mouse cursors exist only in the original program, not in `main.pak`. Before converting, the importer extracts the big arrow (the program's cursor resource) and SexyAppFramework's pointing and dragging hands (32×32 `CreateCursor` masks) that the original `LawnApp::EnforceCursor` shows. It finds them by content hash rather than by resource IDs or file offsets, reading the program's resources with the PE resource parser in `tools/pvz/pe.py`.
- They are registered in `content.json` as the sprites `pvz:cursor_pointer`, `pvz:cursor_hand` and `pvz:cursor_dragging`, ship in the built-in ZIP, and resource packs may replace them by ID.
- `CursorManager` maps `default`, `pointer` and `grabbing` to these images at their original hotspots, scaled by `scale` for higher-density replacements: CSS cursors on the web, and SDL colour cursors through the engine's `jsb.setCursorImage` on native Windows and macOS.
- Turning `/cursor` off, or images that fail to load, leave the system cursors.

### App icons

- App icons come from the original game icon, the `IDI_MAIN_ICON` icon group in `PlantsVsZombies.exe`. `npm run build:icons` rebuilds that group as an `.ico` in memory, reading `tools/PlantsVsZombies.exe` by default; `--exe /path/to/PlantsVsZombies.exe` reads another copy, and `--ico /path/to/icon.ico` uses an `.ico` file instead.
- Versions 1.2.0.1051, 1.2.0.1073 and 1.2.0.1096 carry the same icon group: 12 images, 4-bit, 8-bit and 32-bit at 16, 32, 48 and 256 pixels, the 32-bit 256-pixel image stored as PNG. The command works from the largest true-colour image; its 16×16 frame is the window title-bar flower.
- It writes the web icons (`game.ico`, `icon-256.png`, `apple-touch-icon.png`) under `build-templates/web-mobile/` and the macOS, iOS, Android and Windows icons under `native/engine/`. All outputs are ignored by Git. The Windows installer also uses `native/engine/win64/res/game.ico` when it exists.
- iOS icons cannot be transparent, so they get a white background and a margin that keeps the art clear of the rounded corners.
- The command needs Pillow, and macOS's `iconutil` for `Icon.icns`.

## Common commands

The layout of `tools/` and its entry points are in [Development Scripts](../tools/README.md).

| Command | Effect |
| --- | --- |
| **Tests and checks** | |
| `npm run test:server` | Server typecheck and every test under `tests/` |
| `npm run typecheck:server` | Server typecheck alone |
| `npx tsx --tsconfig tsconfig.server.json --test tests/server/xxx.test.ts` | One test file |
| `npx tsc --noEmit -p tsconfig.json` | Client typecheck |
| `npm run test:tools` | Tests of the resource conversion tools (Python) |
| `npx tsx --tsconfig tsconfig.server.json --test mods/widescreen/tests/*.test.ts` | A Mod's own tests |
| `npm run check:preview` | Checks the preview's module mapping; see [Preview module mapping](#preview-module-mapping) |
| **Content and Mods** | |
| `npm run build:content -- --pak /path/to/main.pak` | Full conversion from the original PAK (about 9 minutes) |
| `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` | Repacks the base package after editing pvz-base |
| `npm run mod:init -- my-mod` | Creates a Mod from the template in `mods/my-mod/` |
| `npm run mod:pack -- mods/widescreen` | Packs a Mod as `dist/mods/widescreen.zip` |
| `npm run mod:test -- my-mod` | Packs a Mod and checks its server registration |
| `npm run mod:hosts` | Regenerates the lists of host modules that Mods can get |
| `npm run build:icons` (or `npm run build:icons -- --exe /path/to/PlantsVsZombies.exe`) | Generates the app icons from the program's icon |
| `npm run build:kernel` | Compiles the shared C++ kernel (`native/engine/common/kernel`) to WebAssembly |
| `npm run build:music` | Compiles the music player (`native/engine/common/music`, with libopenmpt) to WebAssembly |
| **Preview and builds** | |
| `npm run preview:debug`, `npm run preview:release` | Starts the preview server, with or without debug mode |
| `npm run build:web:debug` | Debug web build |
| `npm run build:web:benchmark` | Release web build for benchmarks; see [Benchmarks](#benchmarks) |
| `npm run bench -- <A> [<B>]` | Compares the benchmark on built games; see [Benchmarks](#benchmarks) |
| `npm run compile:{platform}:release` | Release native build; see [Release builds](#release-builds) |

`build:kernel` writes the generated module to `assets/scripts/shared/kernel/binary.ts`, which is committed, so other builds do not need Emscripten. Native builds compile the same kernel source directly. `build:music` likewise writes `assets/resources/music/pvz_music.bin`.

## Testing

Routine checks:

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

`npm run test:server` includes the server typecheck and all `tests/**/*.test.ts` tests, so a separate `typecheck:server` run is unnecessary. A Mod's own tests are outside `tests/` and run separately, as in the table above.

### Testing guidelines

- Automated tests focus on core gameplay, save and restore, Mod loading and isolation, client-server boundaries, and essential input flows. Check observable behaviour and necessary boundaries; reuse or extend existing cases, and avoid duplicate coverage and assertions tied to implementation details.
- Use the minimum appropriate validation for simple, low-risk changes. Check animation, layout and text details manually when appropriate, and add automated coverage when the regression risk warrants it. Do not add separate cases for fixed artwork coordinates, colours or playback rates, or read source text to assert a particular code structure.
- For routine changes, run the relevant tests, and the typecheck when needed. Run `npm run test:server` for cross-module changes or when full validation is requested.
- To run one file, use, for example, `npx tsx --tsconfig tsconfig.server.json --test tests/server/save-restore.test.ts`. When tests fail, retain valid checks, distinguish new failures from existing ones, and do not hide failures by deleting or skipping critical tests.
- Report automated tests, builds and runtime checks separately. Verify visuals, interaction or platform behaviour in the relevant environment when needed; a successful native build does not establish device validation. Avoid browser automation unless visual or interaction validation is required.

## Release builds

| Platform | Command | Output |
| --- | --- | --- |
| Web | `npm run build:web:release` | The web build in `build/web-mobile/` |
| Windows | `npm run compile:windows:release`, then `npm run package:windows` | The installer `dist/pvz-remake-v{version}-windows-x64-setup.exe` and the zip `dist/pvz-remake-v{version}-windows-x64.zip`; packaging needs Inno Setup 6 |
| macOS | `npm run compile:macos:arm64:release` and `compile:macos:x64:release`, then `npm run package:macos` | The disk images `dist/pvz-remake-v{version}-macos-arm64.dmg` for Apple silicon and `-macos-x64.dmg` for Intel Macs; macOS only |
| Android | `npm run compile:android:arm64:release` | An arm64 package in `build/android-arm64-release/`; `compile:android:armv7:release` builds for 32-bit devices into `build/android-armv7-release/` |
| iOS | `npm run compile:ios:release` | The unsigned IPA `build/ios/pvz-remake-mobile-unsigned.ipa` to sign yourself; macOS only |

- Replace `release` with `debug` in a command for a debug build, such as `npm run build:web:debug` or `npm run compile:windows:debug`. The Windows installer and the macOS disk image pack only a Release build.
- A `compile:*` command runs the matching `build:*` command, which calls `cocos build` with the platform's configuration in `build-configs/`, and then `cocos make`, which compiles the native project.
- `{version}` is the `version` in `package.json`.
- Web validation does not establish native compilation or device validation, and a successful native build does not establish device validation.

### Web

1. `npm run build:web:release` writes the web build to `build/web-mobile/`, which any static host can serve.
2. Cloudflare Pages takes no file over 25 MiB, so `npm run package:pages` (`tools/installer/pages.ts`) stages the build for it in `dist/pages/`:
   - the base archive is written as 16 MiB parts named by their hash, and the built game's `.zip` downloader fetches and joins them;
   - the engine `cc.js` is staged again under a name with its hash, because `_headers` lets browsers keep `/cocos-js/*` for a year.

   It records the parts and the archive's hash in `dist/pages.json`. Staging fails when the build does not have exactly one `.zip` downloader to change, as can happen after a change to the base archive's loading or to the minifier.
3. `npm run verify:pages -- <deployment URL>` checks a deployment: its entry files and engine are the staged ones, and its downloader joins the parts into the archive that was staged.

A `v*` tag deploys the staged build from CI (`.github/workflows/build.yml`), after the other platforms build: first to a preview deployment, which is checked, then to production on the Pages project `pvz-remake`, which serves plants-vs-zombies.cc. The repository needs the secrets `CLOUDFLARE_API_TOKEN`, a token with Cloudflare Pages edit permission, and `CLOUDFLARE_ACCOUNT_ID`.

### Windows

1. `npm run compile:windows:release` clears the build's old assets (see [Native build output](#native-build-output)), builds, and compiles `build/windows/proj/Release/pvz-remake.exe`.
2. `npm run package:windows` picks the game executable, its DLLs and `Resources/` from the Release build, with the C++ runtime of the Visual Studio that built it (`Microsoft.VC143.CRT`) in place of the older one Cocos copies, so players need not install the Visual C++ runtime. It compiles `tools/installer/windows.iss` with Inno Setup 6 over them, passing the version from `package.json`, and writes `dist/pvz-remake-v{version}-windows-x64-setup.exe`. From the same files it writes `dist/pvz-remake-v{version}-windows-x64.zip`, which unpacks into a `Plants vs. Zombies` folder the game runs from. It fails if the Release executable is missing.

The packaging script finds `ISCC.exe` through the `ISCC` environment variable, then in `Inno Setup 6` under `%LOCALAPPDATA%\Programs`, `%ProgramFiles(x86)%` and `%ProgramFiles%`, and finally on `PATH`.

The installer:

- packs the game executable, its DLLs and `Resources/`, without link outputs (`.lib`, `.exp`) or the debug C runtime that Cocos copies next to every build;
- installs "Plants vs. Zombies" for all users by default, and its dialog also offers a per-user install without administrator rights;
- offers an optional desktop shortcut and launches the game when it finishes;
- keeps a fixed `AppId`, so a newer installer upgrades an existing installation;
- uses `native/engine/win64/res/game.ico`, written by `npm run build:icons`, as its icon when that file exists.

### macOS

On macOS, with the Xcode command line tools:

1. `npm run compile:macos:arm64:release` and `npm run compile:macos:x64:release` clear the build's old assets and apps (see [Native build output](#native-build-output)), build, and compile `Plants vs. Zombies.app` for macOS 12.0 or later under `build/mac-arm64-release/proj/Release/` and `build/mac-x64-release/proj/Release/`. The `archs` of `packages.mac` in `build-configs/macos-arm64-release.json` and `macos-x64-release.json` names the architecture `cocos make` compiles. The debug build, `npm run compile:macos:debug`, stays an arm64 and x86_64 build under `build/mac/`.
2. `npm run package:macos` (`tools/installer/package-macos.ts`) packs them into `dist/pvz-remake-v{version}-macos-arm64.dmg` and `dist/pvz-remake-v{version}-macos-x64.dmg`. `npm run package:macos -- arm64` (or `-- x64`) packs one.

Before packaging:

- the version in `native/engine/mac/Info.plist` (`CFBundleShortVersionString`) must match the one in `package.json`; rebuild after making them match;
- eject any mounted volume named "Plants vs. Zombies", such as an earlier disk image, because Finder would lay out that volume instead.

Packaging checks every build before making any image, and fails if a build is missing, holds code for another architecture, or carries an asset bundle that the game does not load (`projectBundles` in its `src/settings.json`), which is left from an earlier build.

Signing:

- By default the app is signed ad hoc, with the hardened runtime and `native/engine/mac/entitlements.plist`. A certificate's name in the signature (an Apple Development certificate carries its Apple ID's email address) is readable by anyone with the image, and gives players nothing over ad hoc signing unless it is a notarized Developer ID.
- `SIGN_IDENTITY` signs with a certificate instead. Give the certificate's SHA-1 hash: a keychain can hold two certificates of one name (a renewed one), which `codesign` finds ambiguous.

The disk image:

- The window's background is `tools/installer/dmg-background.png` (660 × 400 points, drawn at 144 dpi), or the file named by `DMG_BACKGROUND`. Without it the image has no background.
- Finder lays out the window with the app and a link to Applications, and the volume shows the app's icon.
- The image's copy of the executable is stripped of symbols, about a third of its size; the build's own copy keeps them for debugging.

See `tools/installer/` for the scripts.

### Android

- `npm run compile:android:arm64:release` builds for `arm64-v8a` into `build/android-arm64-release/`.
- `npm run compile:android:armv7:release` builds for `armeabi-v7a`, for 32-bit devices, into `build/android-armv7-release/`.

### iOS

On macOS with Xcode, `npm run compile:ios:release` exports the current resources and calls `cocos make` to compile and package `build/ios/pvz-remake-mobile-unsigned.ipa` for self-signing:

- The arm64 iPhone Release build, for iOS 15.0 or later, requires no developer team.
- Cocos checks the ZIP's integrity and writes a `.ipa.sha256` checksum file next to it.
- The intermediate `.app` remains under `build/ios/proj/Release-iphoneos/`.
- The command clears the build's old assets and apps first (see [Native build output](#native-build-output)).
- Xcode strips the Release executable of its symbols, about a third of its size, before signing it (`native/engine/ios/CMakeLists.txt`), so a build signed with a developer team stays valid.

### Native build output

A native build keeps its output folder, and the builder never copies a raw asset over one that is already there. A file that changes under the same UUID, as `assets/resources/base.zip` does every time the base content is packed, would stay as it was first built; the new code then meets old content and the game does not start.

- The Windows, macOS and iOS build commands clear `data/assets` in their build folder first, through `tools/build/clean-native-assets.ts`.
- An Xcode build copies each asset into the app but never removes one that the project no longer lists, so the script also removes the apps under the build's `proj/<configuration>/`, and the next build makes them afresh.
- The Android commands do not clear anything. After repacking `base.zip`, clear their build's assets the same way, for example `npx tsx tools/build/clean-native-assets.ts build/android-arm64-release`, before building again.

## Profiling

### iOS JavaScript

iOS forbids JIT, so V8 runs as an interpreter and JavaScript costs far more than on desktop; judge performance on a device.

1. `PVZ_JS_PROFILE=1 npm run compile:ios:release` enables the V8 debugger port (6086) in a Release build without enabling `CC_DEBUG`.
2. After installing the app, forward the port with `pymobiledevice3 usbmux forward 16086 6086`.
3. Run `npx tsx tools/profile/ios.ts http://127.0.0.1:16086 10 /tmp/pvz.cpuprofile` to sample.

The script's arguments are the forwarded endpoint (default `http://127.0.0.1:16086`), the sampling time in seconds (default 10) and the output file (default `/tmp/pvz-ios-js.cpuprofile`). It samples every millisecond, saves the CPU profile and lists the 20 functions with the most self time.

### High-load comparisons

Use `/level pvz:stress-test` with `/fps` on: 40 plants against 1023 zombies. `/perf {plants|zombies|particles|sfx|logic}` turns one part off at a time; see [Debug Console](DEBUG_CLI.md#performance-switches).

### Benchmarks

The benchmark (`app/Benchmark.ts`) plays the stress test the same way on every run and times the work:

1. `npm run build:web:benchmark` makes a Release web build in `build/web-benchmark/` whose scripts target Chrome 110 and later.
2. `npm run bench -- <A> [<B>]` runs the benchmark on one or two builds several times and prints each one's median over the runs with their range. For two builds it adds the change from A to B, marked "~" when it is within the runs' spread.

A target is a web build folder, opened in a fresh headless Chrome, or a native executable or macOS app. Two targets take turns (A then B, then B then A), each run in a fresh browser or process. Options:

- `--scenario steady` (the default) times the views, animations and drawing of the stress test after 10 seconds of play, the server then standing still; `--scenario combat` plays it from the start, the server included. In both the plants are invincible, so the zombies eat them to the end.
- `--frames 1200` and `--rounds 3` set the frames each run times, after 120 frames of warm-up, and the runs of each target.
- `--screenshots <folder>` saves each web run's last frame and counts the pixels that differ from the first run's.
- `--chrome <path>` names the browser.

Every run plays the same game: the level starts with a fixed seed, each frame advances the game by 1/60 s whatever time it took, and the client's `Math.random` is seeded from the frame's number. A run reports the whole frame (mean, median, p99 and 1% low, the mean of the slowest 1% of frames), the updates, the server's ticks within them, the engine's drawing, the draw calls, and a checksum of the server's last snapshot. Runs with the same checksum played the same game.

The game runs the benchmark when it is launched with `?benchmark=combat&frames=1200` in the web page's address, or `--benchmark=combat --frames=1200 --benchmark-out=<file>` on a native command line. It starts once the loading screen has loaded everything. A fresh browser or install has no player, so it creates one named Benchmark. The result goes to the console and to `globalThis.pvzBenchmark`; a native build also writes it to the file (by default `benchmark.json` in the game's data folder) and then quits.

### Debug builds

Debug builds keep the level probe on the global `pvzLevel` (the level controller) and the game clock on the global `pvzTime`. See [Mods](MODS.md) for Mod development and installation.

## Preview module mapping

The Cocos preview compiles each script to a SystemJS module that imports `__unresolved_N` placeholders, which `temp/programming/packer-driver/targets/preview/import-map.json` resolves per module. After editing a module that many files import (such as `shared/protocol`), a module's compiled code and its mapping can fall out of step, and its imports silently come from another module. At run time this shows up as an unexplained `undefined`, such as `Cannot read properties of undefined (reading 'name')`, while the Node tests pass.

```sh
npm run check:preview                # check, and touch the sources with stale mappings so the preview recompiles them
npm run check:preview -- --dry-run   # check only
```

- The script (`tools/preview/check-imports.ts`) checks, for every name each module imports, that the source file its mapping points to exports it, and lists the stale imports.
- After touching, wait for the preview to recompile before reloading the page.
- Without a preview build there is nothing to check, and it exits.
- In the preview, an `Error` reaches `temp/logs/cocos.log` with its stack, and `IntegratedGameHost` logs the original server error, which shows where it failed.

## Common pitfalls

- **Repack `base.zip` after editing pvz-base JSON** (`npm run mod:pack -- pvz-base --publish assets/resources/base.zip`), or the game and the `mod-resources` tests read the old data. A repack changes the content hash, so mid-level saves made before it no longer load.
- **Generated files are not in Git**: the converted assets under `mods/pvz-base/assets/`, every Mod directory but `pvz-base` and `example` (such as `mods/widescreen/`) and `tools/local/` are ignored, so their changes never show in a diff. Say so when you change them, and pack them by hand.
- **Native builds keep old assets**: outside Windows, clear the build's `data/assets` after repacking `base.zip`; see [Native build output](#native-build-output).
- **The preview may compile a half-written file**: after quick successive edits to one file, the preview compiler can pick up an intermediate version (an `xxx is not defined`, for example). Touch the file to compile it again.
- **The preview's import map may drift**: see [Preview module mapping](#preview-module-mapping).
- **Regenerate the host module lists** with `npm run mod:hosts` after adding, moving or deleting a module. Mods get modules by their path through `client/content/hostModules.ts` and `server/session/hostModules.ts`, and the tests check the lists.
- **Seed slots are told apart by index**: a bank may hold the same seed twice, so selection, recharge and flashing go by the slot (`selection.slot`, the events' `slot`).
- **Draw order is the original's**: new things take the original's `RenderLayer` and offset through `renderOrder(layer, row, offset)` in `shared/content/renderOrder.ts` (see [Architecture](ARCHITECTURE.md#draw-order)), never numbers made up to fit.
- **Mods reach into the host**: they wrap host methods with `host.around()` and depend on the base game's node structure (the widescreen Mod on the achievements page's `Background` layer, for example). Before renaming, moving or removing a host member, search every `mods/*/src`, the local, ignored Mods included.
- **`build:icons` needs `iconutil`**: the script calls macOS's `iconutil` for `Icon.icns` on every platform. Elsewhere it stops at that step, after writing the web, Android and iOS icons and before writing the Windows icon.
