# Phase 0 Platform Probe

## Mod CLI

Create, build, smoke-test, and package a Mod with the shared scripts:

```bash
npm run mod:init -- my-mod
npm run mod:build -- mods/my-mod
npm run mod:test -- mods/my-mod
npm run mod:pack -- mods/my-mod
```

`mod:init` creates one gameplay TypeScript source. `mod:build` compiles it to Node ESM and Cocos SystemJS; generated files are not edited manually. `mod:test` loads the Node entry and validates `register(api)`. `mod:pack` writes the installable files, without source, to `dist/mods/<folder>`; pass `--out <directory>` to override it. Client code is compiled when `client/source/index.ts` exists, while its external Cocos Asset Bundle must already exist at the path declared by `mod.json`.

`stacked-peashooter-mod` demonstrates dual-purpose plant upgrades: empty cells still plant `pvz:peashooter`, while placing the same packet on an existing Peashooter consumes it normally and replaces the target with one `pvz:repeater`. While selected, compatible targets use the reference purple-card flash; the cursor and translucent grid preview switch to Repeater only over a compatible target.

```bash
npm run mod:test -- spikes/phase0/stacked-peashooter-mod
npm run mod:pack -- spikes/phase0/stacked-peashooter-mod
```

This probe answers only two platform questions before the real Mod loader is built:

1. Can Node and Cocos load platform artifacts built from the same Cocos-independent gameplay source?
2. Can it load an external Asset Bundle and read a known `JsonAsset`?

The probe is installed as `globalThis.pvzPhase0` in debug builds only. It does not run automatically or change the normal game flow.

## Headless

```bash
npm run test:server
```

Expected: `phase0 gameplay module registers without Cocos` passes.

## Web

```bash
npm run build:web:debug
python -m http.server 8123 --directory .
```

Open `http://127.0.0.1:8123/build/web-mobile/`, then run in the browser console:

```js
await pvzPhase0.loadGameplayModule(
    new URL('../../spikes/phase0/example-mod/gameplay/cocos/index.js', location.href).href,
)
// [{ id: 'phase0:sunflower', kind: 'plant' }]

await pvzPhase0.loadClientBundle(
    new URL('assets/phase0-client', location.href).href,
)
// { id: 'phase0:client', kind: 'client-bundle' }
```

## Windows Native

```bash
npm run build:windows:debug
cocos make --platform windows --dest build/windows
```

Run `build/windows/proj/Debug/pvz-remake.exe`. Native cannot instantiate the gameplay script directly from HTTP. Copy `gameplay/cocos/index.js` to `jsb.fileUtils.getWritablePath()` as `phase0-gameplay.js`, then run:

```js
const writable = jsb.fileUtils.getWritablePath().replace(/[\\/]*$/, '/')

await pvzPhase0.loadGameplayModule(writable + 'phase0-gameplay.js')
// [{ id: 'phase0:sunflower', kind: 'plant' }]
```

`loadGameplayModule` converts the Windows absolute path to the `no-schema:/C:/...` module ID required by the native Cocos SystemJS loader. The Windows Bundle can be tested over HTTP at:

```text
http://127.0.0.1:8123/build/windows/data/assets/phase0-client
```

Copy the complete `build/windows/data/assets/phase0-client` directory to `jsb.fileUtils.getWritablePath() + 'phase0-client'`, then run:

```js
await pvzPhase0.loadClientBundle(writable + 'phase0-client')
// { id: 'phase0:client', kind: 'client-bundle' }
```

Both local loads were verified on Windows native and returned the expected marker values above.

## Phase 1 Automatic Loading

Native installs each complete Mod under:

```text
<jsb writable path>/mods/<folder>/
  mod.json
  gameplay/cocos/index.js
  client/cocos/index.js
  client/cocos-bundle/
```

The application scans that directory before showing the startup screen. Web builds read a `mods.json` array next to the built `index.html`; each entry is a manifest URL relative to `mods.json`:

```json
[
  "../../spikes/phase0/example-mod/mod.json"
]
```

Both startup paths were verified to log `[Mods] Loaded phase0:example` and register the `phase0-client` Bundle without manual probe calls.

The installed example now enhances `pvz:peashooter` into a Repeater-style shooter. It preserves the base attack, schedules one additional projectile 26 gameplay ticks later, replays the shooting animation for the second projectile, and lets both `projectileFired` events drive their own Throw sound. The second-shot deadline remains in the existing saved `PlantAttack.fireAtTick`, so saving between the two projectiles restores deterministically. The client animation enhancement uses the reference Repeater shooting rate `45` instead of the Peashooter rate `35`.
