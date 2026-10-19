# Development

The main scene mounts `app/GameApp.ts`, which starts `LocalIntegratedGame` through the existing Adventure 1-1 controller. Gameplay runs in `server`; the client consumes protocol snapshots and events. Keep engine imports out of `server`, `shared`, and `ecs`.

Only Adventure 1-1 is connected. The old menu, debug CLI, and Adventure 1-2 onward are not part of this worktree. Refer to the workspace's `pvz-remake` when porting their behavior.

## Resources

The v2 base Bundle is in `assets/bundles/pvz-base`. The presenters also use audio, particle definitions, and particle textures under `assets/resources`; keep these available.

Place your game's `main.pak` at `tools/main.pak`, then run from the project root:

```sh
python3 tools/process_pak.py
```

The existing pipeline prepares shared resources and builds the v2 Bundle. It requires Python 3.10+, Pillow, ffmpeg, and the music converter's libopenmpt backend. If the raw files and shared resources are already available, rebuild only the v2 Bundle with `npm run build:content-v2`.

## Checks and builds

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

Prefer existing focused tests for changed critical logic. Avoid browser automation unless visual or interaction validation is required. Windows and Android build commands remain available; native compilation and device checks are separate from Web validation.

The `pvzPhase0`, `pvzPhase2`, and `pvzPhase4` probes remain available in debug builds. Mod examples are documented in [the Phase 0 guide](../spikes/phase0/README.md).
