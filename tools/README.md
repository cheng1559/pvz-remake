[简体中文](README.zh-CN.md)

# Development Scripts

Directories are split by purpose. The root holds only this guide, the Node module configuration `package.json`, and the original's inputs, which Git ignores and you supply yourself:

```text
tools/
├── build/
│   └── clean-native-assets.ts  # Clears old data/assets, and the built Xcode apps, from the output directory before a native build (called by the Windows, macOS and iOS build commands)
├── installer/                  # Installers: package-windows.ts makes the Windows installer (windows.iss, Inno Setup) and zip, package-macos.ts makes a macOS disk image per architecture
├── kernel/build.ts             # Compiles the C++ kernel to Wasm
├── mod/                        # Mod initialization, packing, validation, host module list generation and configuration reading
│   ├── cli.ts
│   ├── content.ts
│   ├── hosts.ts
│   └── test.ts
├── preview/check-imports.ts    # Checks the Cocos preview's module mapping
├── profile/ios.ts              # iOS JS performance sampling
├── pvz/                        # Original PAK import and conversion, anim-defs.json and ui-strings.json
├── resources/                  # App icons, font and image super-resolution
│   └── licenses/               # Third-party licenses of the resource processing tools
├── local/                      # Git-ignored local resource pack generators
├── main.pak                    # Git-ignored: the original's resource package, the default input of build:content
└── PlantsVsZombies.exe         # Git-ignored: the original program; build:content extracts its mouse cursors and build:icons its icon
```

Common entry points:

| Purpose | Command |
| --- | --- |
| Import the base resources from the original PAK and program and publish the ZIP | `npm run build:content -- --pak /path/to/main.pak --exe /path/to/PlantsVsZombies.exe` |
| Initialize, pack and validate a Mod | `npm run mod:init`, `npm run mod:pack`, `npm run mod:test` |
| Regenerate the Mod host module list | `npm run mod:hosts` |
| Check the Cocos preview's module mapping | `npm run check:preview` |
| Package the Windows installer and zip, and the macOS disk image | `npm run package:windows`, `npm run package:macos` |
| Stage the web build for Cloudflare Pages and check a deployment | `npm run package:pages`, `npm run verify:pages -- <deployment URL>` |
| Compile the shared C++ kernel to Wasm | `npm run build:kernel` |
| Generate the web and native app icons from the original program's icon | `npm run build:icons -- --exe /path/to/PlantsVsZombies.exe` |
| Font and image super-resolution | `python3 -m tools.resources.upscale_fonts`, `python3 -m tools.resources.upscale_ui` |
| iOS JS performance sampling | `npx tsx tools/profile/ios.ts ...` |
| Tests of the resource conversion tools | `npm run test:tools` |

Run Python commands from the project root. `npm run build:content` calls `python3 -m tools.pvz`; the conversion is implemented in `pvz/`:

```text
pvz/
├── __main__.py             # Entry of the PAK import command
├── anim-defs.json          # The original's animation conversion rules
├── ui-strings.json         # Interface text this project adds, merged into pvz:strings on import (keys must not repeat the original's)
├── importer.py              # Import flow and resource manifest
├── pak.py                   # PAK unpacking, file name normalization, temporary directory
├── images.py                # Images and alpha channel merging
├── reanim.py                # Reanim tracks, clips and animation marks
├── oversized.py             # The dancers' art, a quarter larger than the others', shrunk with their Reanims to the others' size
├── compiled_reanim.py       # Decoding of the original's compiled animations
├── particles.py             # Particle XML conversion
├── compiled_particles.py    # Decoding of the original's compiled particles
├── fonts.py                 # Bitmap fonts
├── pe.py                    # Resources of the original program (PE resource directory) and its icon
├── cursors.py               # Extraction of the mouse cursors from the original program
├── strings.py               # The original's text
├── audio.py                 # Sound effect conversion
├── music/                   # Music conversion and libopenmpt bindings
└── cache/                   # Plant still-frame atlases rendered from the animations, for resource packs to ship (such as jiangnan's held and planting previews)
```

The original's resource conversion rules are in `tools/pvz/anim-defs.json`:

- Without `animations`, the Reanim's `anim_*` marks are read automatically; an explicit list selects some of the clips. Without marks, the full `default` animation is used.
- `slots` configures part attachment points; `hiddenTrackPrefixes` filters out unneeded equipment tracks.
- `exports` maps the original's clips to the resource IDs the game uses; Python no longer keeps a second export list.

`local/` holds the local resource pack generators kept out of Git; their sources are kept, and each needs its own asset input.

Node tools are all TypeScript, run through the project's existing `tsx`; Python decodes and converts the original's resources.

`mod/content.ts` reads the author's configuration for Mod packing and engine-free tests; `mod/test.ts` implements the `mod:test` validation.

The PAK is only unpacked into a temporary directory, and the conversion results are written straight into `mods/pvz-base/assets/`. After everyday edits to existing resources, you only need:

```bash
npm run mod:pack -- pvz-base --publish assets/resources/base.zip
```
