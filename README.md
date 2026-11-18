# PvZ Remake — Client / Server

This worktree contains the new client/server implementation. The scene starts with the splash/title screens and a menu shell. The menu connects challenge categories, almanac, store, gardens, achievements, help/options, and Adventure 1-1 through 2-10. The previous game loop has been removed; the workspace's `../pvz-remake` worktree remains the reference implementation.

## Run

```sh
npm install
npm run preview:debug
```

Requires the local Cocos CLI and Cocos 4.0.0-alpha.35. Adventure follows the current player's progress. Escape opens/closes its pause menu; other pages use Escape to go back. After a win, R on the award page plays the level again; after a loss, Try Again in the GAME OVER dialog restarts it. Entering Adventure resumes the current player's save automatically; the game saves when it is hidden.

## Structure

- `assets/scripts/app`: scene entry, local client/server assembly, and save coordination.
- `assets/scripts/server`: authoritative gameplay, fixed ticks, deterministic RNG, and server saves.
- `assets/scripts/shared`: protocol, content schemas and channel.
- `assets/scripts/client`: input, rendering, audio, content loading, and shared level presenters.
- `assets/scripts/core`: the shared game clock (`GameClock`) and the Cocos tweens that follow it (`GameTween`).
- `mods/pvz-base`: gameplay, presentation, categorized runtime assets, and the explicit resource index.
- `assets/resources/base.zip`: generated builtin content, using the same `manifest.json` and `content.json` format as installed Mods.
- `tools`: shared resource conversion and Mod tooling.

Builtin content, resource-only Mods and scripted Mods share ZIP validation, decoding, asset caches and resource IDs. All installed packages use `/mod`; source metadata is `manifest.json` and `content.json`. Only the bootstrap scene, level layout prefab and compiled shader remain Cocos assets. Run `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` after editing content JSON; `npm run build:content -- --pak /path/to/main.pak` converts directly from the original PAK and rebuilds the builtin ZIP.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): the layers, the protocol, the server, levels and rules, content definitions, the client and the menu backend.
- [Development](docs/DEVELOPMENT.md): setup, common commands, resource conversion, tests, builds, profiling and common pitfalls.
- [Gameplay](docs/GAMEPLAY.md): what each level and entity does, and its source in the original.
- [UI](docs/UI.md): the UI toolkit, the menu screens and level input.
- [Mods](docs/MODS.md): installing, writing and packing Mods.
- [Debug CLI](docs/DEBUG_CLI.md): the in-game debug commands.
- [Teams](docs/TEAMS.md): the two sides and the Hypno-shroom.
- [Achievements](docs/ACHIEVEMENTS.md): the achievements, as checked against 1096.
- [Tick rewind](docs/TICK_REWIND.md): the planned debug rewind and stepping (not implemented).

Source code is licensed under [MIT](LICENSE); original game assets retain their respective ownership.
