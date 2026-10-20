# PvZ Remake — Client / Server

[中文说明](README.zh-CN.md)

This worktree contains the new client/server implementation. The scene starts with the splash/title screens and a menu shell. Simple buttons connect the main menu, challenge categories, almanac, store, gardens, achievements, help/options, and the new Adventure 1-1. The previous game loop and later-level implementations have been removed; the workspace's `../pvz-remake` worktree remains the reference implementation.

## Run

```sh
npm install
npm run preview:debug
```

Requires the local Cocos CLI and Cocos 4.0.0-alpha.35. Use the menu buttons to enter Adventure 1-1. Escape opens/closes its pause menu; other pages use Escape to go back. After winning or losing, press R to play again. Entering Adventure resumes the current player's save automatically; the game saves when it is hidden.

## Structure

- `assets/scripts/app`: scene entry, local client/server assembly, and save coordination.
- `assets/scripts/server`: authoritative gameplay, fixed ticks, deterministic RNG, and server saves.
- `assets/scripts/shared` and `ecs`: protocol, content schemas, channel, and ECS.
- `assets/scripts/client`: input, rendering, audio, content loading, and Adventure 1-1 presenters.
- `assets/scripts/core`: particle and sprite utilities still used by the new presentation layer.
- `assets/bundles/pvz-base`: Content assets and the Adventure 1-1 prefab.
- `tools`: shared resource conversion and Mod tooling.

Menu backgrounds, audio, and particle helpers reuse the existing resources loader. The gameplay Bundle and its save content hash are unchanged. They are not a fallback to the previous game loop.

See [Development Guide](docs/DEVELOPMENT.md) for resource preparation, validation, and builds. Source code is licensed under [MIT](LICENSE); original game assets retain their respective ownership.
