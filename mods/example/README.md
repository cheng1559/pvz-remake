[简体中文](README.zh-CN.md)

# Mod Lab

The repository maintains only this one sample. It demonstrates the whole extension flow, from configuration and resources to scripts on both sides, and includes a playable test level. It depends on no other Mod and needs neither changes to the base game nor the Cocos editor. Its textures and prompt sound are small resources made for the sample.

## Capabilities and code

| Capability | Observable effect | Entry |
| --- | --- | --- |
| New plant, seed, projectile | Rapid Pea shoots every 75 ticks and costs 75; its projectile deals 30 damage | `assets/gameplay/{plants,seeds,projectiles}.json` |
| New zombie and mixin | Regenerating Zombie regains 10 health every 100 ticks; Rapid Pea regenerates too, both through the same mixin | `regenerating()` in `src/server/index.ts` |
| Custom plant and view | Pulse Beacon adds 25 sun every 200 ticks and glows in a loop with its own animation | `src/server/index.ts`, `src/client/beacon.ts` |
| Mod data on entities, snapshots, saves | `example:charge` keeps the remaining time in the plant's `extensions`; the client reads it through `world.extensions` | `registry.extensions.register()` |
| Custom level | `/level example:testing` offers the new seeds and zombie | `assets/gameplay/levels.json`, `assets/presentation/levels.json` |
| Changing existing content | 1-1's seed list gains the two sample plants | `assets/gameplay/levels.json` |
| New resources | Its own PNG, WAV, Reanim, particles, JSON and text ship in the ZIP | `resources` in `content.json` |
| Overriding base resources | The ordinary pea also uses the cyan energy-orb texture | `resources.sprites["pvz:projectilepea"]` |
| Presentation and text | The new projectile, a particle hit effect, the firing sound and the menu text | `assets/presentation/` |
| Client command | `/example:hello` shows the help and plays its own prompt sound; it also works on the main menu | `src/client/index.ts` |
| Server command | `/example:charge 3 1` charges the sample plant in the given cell | `src/server/index.ts` |
| Method wrapping and replacement | `around()` keeps the menu's initialization and then adds a button; `replace()` replaces that button's press sound | `src/client/menu.ts` |
| Lifecycle | Initializing again does not add the button again; disposal or rollback releases the UI it built and its method wrappers | `src/client/menu.ts` |

A new level must be registered in both the gameplay `levels` and the presentation `levels`: the former controls the rules and waves, the latter provides the intro, the lawn and the hints. A level added to the backend alone cannot enter the actual scene.

`content.json` indexes the configuration by category; packing generates `assets/gameplay.json` and `assets/presentation.json`. `src/server/` and `src/client/` compile separately; data both sides share goes in `assets/settings.json` and is read through `assets.json()`, with no import of host source or of the other side's scripts.

## Packing and installing

Run from the game project's root:

```sh
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

The output is `dist/mods/example/` and `dist/mods/example.zip`. Compilation happens only when packing, and no JS is generated in the source directory. `mod:test` checks the real server registration; the repository's integration tests also load the actually packed Cocos modules of both sides and verify the custom views, commands and cleanup.

In the game, run `/mod`, Import the ZIP, Apply and restart. Once it is installed, a **Mod Lab** button appears in the upper-left area of the main menu and opens the sample's help. Disabling the Mod likewise goes through the manager's Apply and a restart.

## Trying it out

1. Click the main menu's Mod Lab button, or run `/example:hello`, and check the prompt sound and the help text.
2. Run `/level example:testing` and, once the intro is over, plant Rapid Pea and Pulse Beacon. You can also place a beacon with `/plant example:beacon 3 2` and spawn the sample zombie with `/zombie example:regenerating_zombie 3 9`.
3. Run `/example:charge 3 2`. Rows and columns both count from 1, and it only works on Rapid Pea and Pulse Beacon. The charge lasts 300 logic ticks and triples regeneration or the beacon's sun production, and the beacon changes color.
4. While charged, pause, save and enter the level again: the remaining time, the regeneration and beacon timers and the results that follow stay consistent; a pause uses up no charge and emits no more particles.
5. On an ordinary level, watch the base pea's appearance override. The new energy-orb resource is `example:orb`, and the `pvz:projectilepea` mapping demonstrates overriding an existing ID; deleting that second mapping removes the override.

The original's resources still come from the base package. Rapid Pea's body and the sample zombie reuse the original's animations, while the beacon uses only the sample's own PNG and Reanim. A standard seed packet's `visual.preview` uses the original's image; the rendered seed packet mode draws the actual plant from the plant presentation definition's `clips` (whose `from` may borrow another plant's) and `packet` pose.

## State and lifecycle

- Gameplay changes happen on the server. The client's charge command only declares its syntax; the command still goes through the normal command queue and the game's existing debug permission check. The client never changes the world directly.
- Rapid Pea, Pulse Beacon and the sample zombie are each a kind (registered with `registry.plants`/`registry.zombies`, with `kind` in the definition): their configuration is the definitions' `example:regeneration` and `example:beacon` fields, and their period timers are fields of the same names on the entities, saved with the save and checked on loading. Regeneration is written as the mixin `regenerating(Base)`, used on both `Shooter` and `Zombie`; the beacon overrides `produce` and, like the base game's production, stops when paused, when the level ends or after the award drops. `example:charge` is `extensions` data on the plant, validated into snapshots and saves, and removed once used up.
- The client computes particles and tint from the authoritative tick and the extension snapshot, with no `setInterval` and no simulation clock of its own. The beacon extends the host's `PlantView`: its animation is driven by the gameplay definition's `animation`, and the view only adds the in-level tint and particles in `onBoard`; displays outside a level, such as the seed packet picture, go through `pose` alone.
- Command syntax is declared by wrapping `specs.list()`, not by mutating the global array. Both sides check for syntax of the same name, so the integrated runtime does not register it twice.
- `host.dispose()` undoes the method wrappers; this sample also wraps that method to destroy the button and dialog it created. Entity views are destroyed with the host's entity nodes; when registration fails, the loader rolls the registries back. Normal enabling and disabling restarts the game to load the complete set of Mods.
- Saves support only the current Mod version and content hash. The sample does not convert old saves.

To extend further, add more views and gameplay the same way. See [Mods](../../docs/MODS.md) for the font, music and prefab formats and the list of host modules; prefabs still have engine import requirements. The manifest's `dependencies` declares dependencies on other Mods' IDs and versions; this sample stays self-contained.
