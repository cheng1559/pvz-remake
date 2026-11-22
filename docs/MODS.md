[简体中文](MODS.zh-CN.md)

# Mods

Every extension to the game is a Mod, and the base game is itself a built-in Mod with the ID `pvz`. The [Mod Lab](../mods/example/README.md) sample demonstrates most of what a Mod can do.

## What a Mod is

A Mod is a ZIP package installed into the game. It can contain any combination of:

- **Resources**: images, fonts, sounds, music, animations, particles and text, either new or replacing the base game's by ID. A Mod with only resources is a resource pack and needs no code entry point.
- **Definitions**: gameplay definitions (numbers and rules) and presentation definitions (animations, positions, sounds) in JSON. They add plants, zombies, projectiles, seeds, levels, store items, achievements and more, or replace existing ones.
- **Scripts**: a server entry point (gameplay) and a client entry point (presentation) that register new kinds, views, commands and rule changes.

The same manager handles installation, priority, enabled state and uninstallation for every kind of Mod. The base game (`pvz`) always loads first and cannot be disabled, uninstalled or imported.

Several Mods can be enabled at once and stack. For example, with an HD pack and a translation pack enabled together, the translation pack can replace only the images that contain text while every other image still comes from the HD pack. A Mod can change what the Mods below it in the list define, and a translation pack can translate other Mods' text.

## Installing Mods

ZIP is the only way to install a Mod.

1. Open the Mod manager: on the main menu choose **Options**, then **Mods**, or run `/mod` in the [Debug Console](DEBUG_CLI.md). `/mod` is the only management command and takes no arguments or subcommands.
2. Click **Import** and choose one or more ZIP files.
3. Tick the Mods to enable and use the arrows to order them (see [Priority and load order](#priority-and-load-order)).
4. Click **Apply** and confirm the restart.

The manager window shows `Loading...` first, and the list once the installed Mods have been read.

### What Import does

Import checks each chosen ZIP in turn while an `Importing...` dialog is shown. ZIPs that fail are listed with their reasons in an **Import Failed** dialog; the others are still imported.

- **Checks.** The manifest, the module files the game runs (`gameplay.cocosModule`, `client.module`, and a bundle's `config.json` and `index.js`), every file path, the size of every PNG against its declaration, font atlases, and that JSON resources parse. Definitions and scripts do not run at import: errors in them appear when the Mod loads at the next start.
- **ZIP layout.** The ZIP must contain exactly one `manifest.json`, either at the root or inside a folder; the folder that holds it becomes the package root, and files outside it are ignored. `__MACOSX/` entries and `.meta` and `.DS_Store` files are skipped. Duplicate, absolute and `..` paths are rejected. Encrypted entries and compression methods other than stored and deflate are not supported.
- **Reserved ID.** `pvz` is the ID of the built-in base package and cannot be imported.
- **Staging.** The ZIP is written, still compressed, to a separate staging area. Installed Mods are not overwritten.
- **Placement.** A new Mod is added at the top of the list and ticked. Importing a Mod whose ID is already installed is an update, and the update keeps its place in the list. Importing the same ID twice before Apply keeps the later file.

**Cancel** or Esc discards the draft and deletes its staged files, for new packages and for updates to installed Mods alike.

### What Apply does

A restart is needed when anything was imported or uninstalled, a Mod was enabled or disabled, or enabled Mods were reordered. In that case Apply:

1. asks **Restart Game?** (the current level will be saved);
2. shows `Restarting...` and locks the manager;
3. saves the current level and the list of pending changes;
4. restarts the game.

Apply itself does not unpack ZIPs or install or delete Mods. During the next startup only the original PopCap logo is shown, drawn from the base package, while Mods are installed and uninstalled in the background. The game resources then load and the title screen opens.

If that background task fails, the pending list and the staged ZIPs are kept and the error is logged; clicking or tapping the screen, or pressing a key, retries. Until the restart, the running code, audio and images keep using the archives loaded when the game started.

Reordering only disabled Mods is saved at once, with no restart.

## Managing installed Mods

Each row of the manager has these controls:

| Control | Effect |
| --- | --- |
| Checkbox, or a click on the name | Enables or disables the Mod in the draft. Ticking never moves the row. |
| Version | The `version` from the Mod's manifest. |
| `[Error]` after the name, in red | The Mod failed in this session, or caused the current game error. Hovering shows the message. |
| Up and down arrows | Move the Mod one place, changing its priority. |
| **Uninstall** | Asks for confirmation, then removes the row from the draft. The Mod is deleted after Apply and the restart. |

Enabling, disabling and uninstalling all take effect through Apply and a restart: a Mod that is running cannot be unloaded. Cancel with unapplied changes asks whether to discard them. Enter is Apply and Esc is Cancel.

## Priority and load order

The order of the list is the priority: the higher a Mod is, the higher its priority.

- **Load order.** Enabled Mods load from the bottom of the list to the top.
- **Resources.** When several running Mods register the same resource ID, the one loaded later (higher in the list) wins. An ID no Mod registers comes from the base package. A Mod that failed to load provides no resources.
- **Definitions.** Two Mods cannot register the same gameplay definition ID; a duplicate is an error. An existing definition is changed in the tables, under its ID (see [Changing what is defined](#changing-what-is-defined)).
- **Text.** For the same text key, the Mod later in enabled priority wins. The text language is that of the last enabled Mod that declares a `locale`.

## Mods and player profiles

Mods are kept per player. Each player has their own installed Mods, versions, enabled states and order, and the manager shows and changes only the current player's.

- **Shared archives.** A ZIP is stored once under its ID and a hash of its content, so a ZIP with the same content installed by several players is stored only once. The hash only identifies identical files; it is not a security check.
- **Cleanup.** ZIPs that no player references (those of deleted players and replaced versions) are removed at startup. Deleting a player deletes their Mod records along with the profile.
- **New players.** The first player created takes over the Mods installed before any player existed. When another player is created and the current player has Mods installed, the game asks whether to copy them to the new player. If declining would leave the new player with a different set from the one running, the question says that choosing No restarts the game.
- **Switching players.** When the other player's enabled Mods or their versions differ from the ones running, the game offers to restart to switch; Cancel stays with the current player. When the current player is deleted, the restart cannot be cancelled.
- **Older versions.** Device-wide installation records from versions before per-player Mods are not migrated: they are ignored, and the archives they referred to are removed by the startup cleanup.

Where the data is kept:

| Data | Web | Native |
| --- | --- | --- |
| Installed archives | IndexedDB (database `pvz-remake-mods`) | `mods/` in the app's writable directory: one folder per archive, holding its extracted files and the ZIP |
| Staged imports | IndexedDB (database `pvz-remake-mod-pending`) | `mod-pending/` in the app's writable directory |
| Each player's installed, enabled and ordered Mods, and the pending changes | The game's local storage | The game's local storage |

## Mods and level saves

A level save records the base package and, in load order, every running Mod that has server code or gameplay definitions, each with its version and content hash.

- If that set differs when the level is continued (a Mod added, removed, reordered or updated), the save is incompatible. It is discarded with a console warning, and the level starts again.
- Mods with only resources or presentation definitions are not part of this check.
- Saves support only the current version and content hash of each Mod; old saves are not converted.

Applying Mod changes saves the current level first. If the change affects the set above, that saved level cannot be continued afterwards.

## When a Mod fails

### At startup

- **Unreadable archives.** A corrupt archive is disabled: it is removed from the enabled list and shows `[Error]` in the manager. It does not prevent the manager from opening. An enabled Mod whose archive is missing is removed from the enabled list with a console warning.
- **Registration errors.** A Mod that fails while it registers (a script throws, a definition is invalid, something has no presentation) is skipped for this session and shows `[Error]` in the manager. Its definitions, registrations and method wrappers are rolled back, and a Mod loaded after it that changes its definitions fails too. It stays enabled, so the next startup tries it again.
- **Notice.** On the main menu a **Mods Failed to Load** notice names each Mod that failed, once.
- **Interrupted startups.** If a startup ends while its Mods are loading (for example, iOS ends the page when it runs out of memory), the next startup runs without Mods and the main menu shows **Startup Failed**. The Mod choices are kept in the manager, and the startup after that loads them again. Hiding or closing the game during startup does not count as a failure.

### During play: the Game Error dialog

A fatal error during loading or play stops the game and opens a **Game Error** dialog with the first line of the error message.

- The left button, **Mods** (or Enter or Space), opens the Mod manager over the dialog. Apply there can restart the game with a new selection; Cancel returns to the error.
- The right button, **Exit**, uses the platform's quit action.
- No save is made after the error: the last successful save of the level is kept.
- The dialog and the manager are built with artwork from the base package. They reuse a language already loaded into memory; if loading or drawing the translated interface fails, the base language and fonts are used.
- The manager marks the responsible Mod with `[Error]` and the message only when the Mod's ID is known.

The rules behind the dialog:

- Uncaught errors and failures in the running level always open the dialog. Where the game catches an error and can restore a usable state, it handles the error itself, unless the error is attributed to a Mod.
- An error is attributed to a Mod when it is thrown from the Mod's script files (their stack locations are `pvzmod:///<id>/...`) or comes from the Mod's resources or text.
- Required loads reject on failure: a declared resource that fails to load does not fall back to the base package, and the error is attributed to the Mod that declared it.
- A stopped server forwards its fatal error to the client, with the responsible Mod's ID when known.
- Once the dialog is up, wrapped host methods call the original method directly, skipping every Mod wrapper.
- Errors caught while registering one Mod follow the startup rollback above, not this dialog.

## Package layout

A Mod's source directory:

```text
my-mod/
├── manifest.json           # ID, version and optional module entries
├── content.json            # Index of gameplay and presentation definitions and resources
├── src/
│   ├── server/index.ts     # Optional server code
│   └── client/index.ts     # Optional client code
└── assets/
    ├── gameplay/           # Gameplay definition JSON, by category
    ├── presentation/       # Presentation definition JSON, by category
    ├── sprites/
    └── audio/
```

Create only the directories you need. A resource-only Mod needs only the manifest, the content index and the resource files. `npm run mod:init -- my-mod` creates `mods/my-mod/` with a manifest, a `content.json` that indexes empty `plants` and `seeds` tables, and a server entry point stub.

Besides the base content's sources (`mods/pvz-base/`, its converted assets ignored), the repository tracks only the `mods/example/` sample and `mods/README.md`; other `mods/` subdirectories are for local development and are ignored by Git.

A source directory and a packed Mod differ in two places:

| | Source | Packed (`dist/mods/<name>/` and the ZIP) |
| --- | --- | --- |
| `gameplay` and `presentation` in `content.json` | One file per table | One merged file each: `assets/gameplay.json`, `assets/presentation.json` |
| Scripts | `src/server/index.ts`, `src/client/index.ts` | Compiled JavaScript at the paths the manifest gives |

## manifest.json

```json
{
  "schemaVersion": 1,
  "id": "example",
  "version": "1.0.0",
  "apiVersion": 1,
  "contentHash": "generated-on-pack",
  "gameplay": {
    "nodeModule": "gameplay/node/index.js",
    "cocosModule": "gameplay/cocos/index.js"
  },
  "client": {
    "module": "client/index.js"
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | Yes | Must be `1`. |
| `id` | Yes | The Mod ID and namespace (see [Namespaces and IDs](#namespaces-and-ids)). |
| `version` | Yes | `x.y.z`. |
| `apiVersion` | Yes | Must be `1`. |
| `contentHash` | Yes | Any non-empty string in the source; `mod:pack` replaces it with a SHA-256 of the manifest's other fields and every file in the package. |
| `locale` | No | The language of the text the Mod supplies, as a language tag such as `zh-CN`. |
| `author` | No | The author's name, at most 64 characters. |
| `gameplay` | No | Server scripts: `nodeModule` (an ES module for Node, run by `mod:test`) and `cocosModule` (a SystemJS module, run by the game). |
| `client` | No | Client scripts: `module` (a SystemJS module) and an optional `bundle`, a Cocos asset bundle directory that must contain `config.json` and `index.js`. |

A pure resource Mod needs only the first six fields. When it needs scripts, add `gameplay` or `client`. The source entry points are `src/server/index.ts` and `src/client/index.ts`; the manifest gives the paths of the compiled output. Every path must stay inside the package.

## content.json

`content.json` is the single index of gameplay definitions, presentation definitions and resources. It accepts only the keys `gameplay`, `presentation` and `resources`.

```json
{
  "gameplay": {
    "plants": "assets/gameplay/plants.json",
    "seeds": "assets/gameplay/seeds.json"
  },
  "presentation": {
    "plants": "assets/presentation/plants.json"
  },
  "resources": {
    "sprites": {
      "example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80 }
    },
    "audio": { "example:launch": "assets/audio/launch.mp3" }
  }
}
```

- `gameplay` and `presentation` map a table name to a file. Paths are relative to the root `content.json`. Each table file is an object from ID to configuration; split configuration into files by category.
- Resource paths are relative to the Mod's root.
- The loader registers static gameplay definitions, presentation definitions and new resources automatically. Script entry points need not register these files again.

## Namespaces and IDs

- **Mod ID.** A name without a colon, such as `widescreen`: lowercase letters, digits, `.`, `_` and `-`, starting with a letter or digit. `mod:init` accepts lowercase letters, digits, `_` and `-`.
- **Namespace.** The Mod ID is also the Mod's namespace. The resources and definitions it adds are all written `name:...`, for example `widescreen:background1`. No two Mods have the same ID, so namespaces never overlap. The built-in base game's namespace is `pvz`.
- **Definitions.** A Mod registers definitions only in its own namespace. An entry under another namespace's ID changes that definition, and is an error if there is none.
- **Resources.** Replacing an existing resource needs only its original ID. A resource written in another namespace counts as a replacement, not as the Mod's own.
- **Script-side IDs.** Kinds, entity data, definition fields of Mod kinds, text keys and tutorial steps that a Mod adds also use its namespace (`example:regeneration`, `example:dig`). Command names may carry it too (`example:hello`).
- **Sounds.** In a sound in presentation configuration (`{ "audio", "foley", "pitchRange"? }`), `audio` is the full audio resource ID, such as `pvz:splat` or `corn:shoop`; an ID without a namespace is an error at validation.

## Definitions

### Definition tables

The gameplay tables a Mod can add to:

| Table | Indexed by |
| --- | --- |
| `boards`, `seeds`, `plants`, `zombies`, `projectiles`, `items`, `achievements`, `tools`, `levels` | Their own IDs |
| `store` | Store item ID |
| `storePages` | Store page ID |
| `almanac` | Zombie ID |

The presentation tables a Mod can add to are `plants`, `zombies`, `projectiles`, `gridItems`, `items`, `awards`, `tools`, `foley`, `boards`, `screens`, `clips`, `levels`, `rules`, `challenges`, `store` and `almanac`. `items` is indexed by dropped item ID, `awards` by level award ID, `rules` by the level rule's `kind`, `store` by store item ID, and `almanac` by the ID of the plant or zombie the almanac shows.

Both sides follow the same rules: new IDs only in the Mod's own namespace, and an entry under anyone else's ID changes it. The base package also has settings outside these tables: the gameplay `settings` and the presentation `mainMenu`, `conveyor`, `storeDialogue`, `iceTrap`, `graves`, `dave` and `seedPackets`. A Mod changes them by writing the same key. Any other top-level key is an error.

Presentation definitions are as strict as gameplay definitions: each object accepts only its own fields, and an extra, misspelled or moved field (such as `vault` in a zombie presentation) reports `... is not supported`.

A new level must be registered in both the gameplay `levels` (rules and waves) and the presentation `levels` (intro, lawn and hints).

### Changing what is defined

An entry a Mod writes under an ID of another namespace (the base game's or another Mod's) changes that definition instead of adding one. So does a block of settings outside the tables written under its key: the gameplay `settings`, or the presentation `mainMenu`, `conveyor`, `storeDialogue`, `iceTrap`, `graves`, `dave` and `seedPackets`. Each is a JSON merge patch (RFC 7386). The example Mod's `levels.json` has a level of its own and a change to 1-1:

```json
{
  "example:testing": { "...": "its own level" },
  "pvz:adventure-1-1": { "seedPackets": ["pvz:peashooter", "example:rapid_pea", "example:beacon"] }
}
```

A presentation `plants` table can remove a field with `null`:

```json
{ "pvz:explodenut": { "visual": { "tint": null } } }
```

- An object is changed field by field, down to the fields given, and `null` removes a field. A list or any other value is replaced whole.
- The Mods are taken in load order, each registering its entries and then applying its changes, so a Mod changes the base game's IDs and those of the Mods loaded before it. Two Mods may change the same field: the later Mod's value is kept.
- An entry under another namespace's ID that is not defined, or is defined only by a Mod loaded later, is an error. What comes of the changes is checked as everything else is: its references, and a field its object does not have or a value it does not take, fail the Mod at load.
- Changes are data only. An entity takes its kind from its definition's `kind` as changed, and an old save whose entity fields do not fit the new definition is handled as an incompatible save.
- A base zombie's presentation whose `view` a change removes is drawn as an ordinary zombie.

### Load checks

When each Mod loads, content assembly checks that:

- every plant, zombie, projectile and dropped item in the gameplay definitions has a presentation, and its view is installed;
- every plant and zombie presentation has a clip for each clip its gameplay animation plays (zombies also need `mowered`), and a plant is drawn only in phases its kind has;
- every grid item presentation's view is installed;
- every tool has a look in the presentation `tools`;
- every level's award has a picture: a seed award uses its plant's presentation, and a `note` also needs `pageImages`;
- every kind, level rule, tutorial and achievement trigger the content names is installed and accepts its settings.

Anything missing makes that Mod fail to load, rather than reporting an error only once it appears in a level.

### Seeds

| Field | Meaning |
| --- | --- |
| `kind` | `plant`, `zombie`, `grave` or `crater`. |
| `position` | The seed's cell within its group (below). |
| `sunCost`, `cooldownTicks` | Cost and recharge. `initialCooldownTicks` is optional. |
| `id` | The plant or zombie a `plant` or `zombie` seed puts down; the seed's own ID when omitted. |
| `placement` | `plant` seeds only: `ground`, `grave` or `water`. |
| `hidden` | Base seeds only: `true` puts the seed in the hidden group. |
| `craterTicks` | `crater` seeds only: how long its crater lasts. |

Every seed must have a `position`, its cell number within its own group. Cells are counted across 8 columns from left to right and top to bottom, starting at 0, 48 cells to a page, and no number may be used twice within a group. A number with no seed is left as an empty cell.

There are three kinds of group, in this order: the original, each Mod, and hidden seeds.

- **The original group** is the seed chooser grid. The base game's seeds belong to it, and their number is the original's plant seed type. Only plant seeds at 0–47 may be there: normally 5 rows (0–39); when any seed at 40–47 (the original's upgrade plants) is owned, it becomes 6 rows as in the original's `Has7Rows`, 70 apart with the first row at y=123. 48 is the original's Imitater.
- **Hidden seeds** are base seeds with `"hidden": true`: the Explode-o-nut, the two bowling nuts, the zombie seeds, the grave seed and the crater seed.
- **A Mod's seeds** always belong to that Mod's own group, numbered by the Mod itself from 0, so they never clash with the base game or other Mods. They cannot be marked `hidden`.

A Mod's seeds are not in the seed chooser grid. With `/cheatseed` on, the seed chooser and the almanac give each Mod pages of its own after the original pages, in Mod load order, and the hidden seeds' page comes last. Otherwise they are offered through `seedChooser.entries` (see [Changing server rules](#changing-server-rules)).

As with the other definition tables, a Mod can only register seeds in its own namespace. To move a seed of the base game or of another Mod, write its new `position` under its ID in the Mod's own `seeds`.

### Plants

The plant presentation requires `scale` and `visual`.

- `visual.nameKey` (required) and `visual.tooltipKey` give the text keys of the plant's name and of its seed chooser description; the text goes in the Mod's `pvz:strings` resource. Without `tooltipKey`, the original's `<nameKey>_TOOLTIP` convention applies.
- A seed packet draws its own plant by default. When `visual.packetPlant` gives another plant's full ID, it draws that one (a bowling nut draws the ordinary Wall-nut).
- The place and size of the plant picture in the packet are in `packet.placement` (`{ scale, offsetX, offsetY }`, the original's `SeedPacket::DrawSeedPacket` offsets), or `seedPackets.defaultPlacement` when it is absent. `packet`'s other fields are the original's `Plant::DrawSeedType` offsets and pose.
- `packet.phase` gives the phase the plant is in in the picture (a small Sun-shroom, a lit Potato Mine). When absent, it is the same as off the board (the gameplay animation's `offBoard`).
- The particle that follows a plant's shot is written in the plant presentation's `fireParticle: { id, x, y, delayTicks }` (the Fume-shroom's smoke).

### Zombies

Every zombie definition must have `wave: { points, weight, firstWave? }`: the original `ZombieDefinition`'s value `mZombieValue`, pick weight `mPickWeight` and earliest wave `mFirstAllowedWave`.

- The points are both what spawning the zombie costs and what decides its chance of dropping money when it dies (`Zombie::DropLoot`). A zombie that only appears in listed waves, from graves or through debug commands needs them too.
- To keep a zombie from being picked at random from the spawn pool, set `weight` to 0.
- Entries of a level's `zombiePool` can override these values.
- A zombie without `wave` is an error at load.

### Gameplay settings of plants, zombies and projectiles

#### Shooters

- `shooter.initialDelayTicks` and `shooter.cadenceTicks` both take integer ranges, for example an initial wait of `{ "min": 0, "max": 150 }` and a cadence of `{ "min": 136, "max": 150 }`. The cadence's minimum must be above zero. A fixed interval uses the same `min` and `max`.
- The server draws the initial wait and every cadence from the level's RNG. The cadence advances even with no target, and the current clock and the RNG state are kept in the save.

#### Scaredy-shroom

The `scaredyshroom` kind is a shooter with a `fright` ability as well (`Plant::UpdateScaredyShroom`): `{ center, radius, rowRange, lowerTicks, raiseTicks }`.

- When a hostile zombie's body comes within `radius` of the plant's top-left corner plus `center`, no more than `rowRange` rows away, the plant goes through four states in turn: `calm`, `lowering` (`lowerTicks`), `scared` and `raising` (a `raiseTicks` range).
- It does not shoot outside `calm`. Once back in `calm`, it waits a whole cadence (`cadenceTicks.max`) before shooting.
- It cannot be written together with a fuse, mine, chomper, grave buster or growth ability.

#### Fuses

`fuse: { ticks, explosion or freeze }` takes one of the two:

- `explosion` is the Cherry Bomb's blast. It can add `crater: { ticks }`, which leaves a crater lasting `ticks` in the plant's cell after the blast (the Doom-shroom); the crater belongs to the plant's side.
- `freeze: { ticks, coldTicks, chillTicks, damage, boardTicks }` is the Ice-shroom's freeze. When the fuse burns out, it freezes every hostile plant and zombie for a time within the `ticks` range (`coldTicks` for those already chilled or frozen), chills them for `chillTicks`, and deals `damage` (through zombies' shields); the board records the frozen side for `boardTicks`.
- A nocturnal plant's fuse does not burn while it sleeps, and zombies eat it as usual.

#### Chill and freeze immunity

Plant and zombie definitions can both have `unchillable` and `unfreezable`.

- A plant can only write `true` (at all times). Immunity only in certain states is up to its class, such as a Potato Mine while rising (`PotatoMine.keptFromIce`).
- A zombie writes `true` or a list of zombie states (such as the pole vaulter's `["airborne"]`).
- `unchillable` takes no slowing at all: neither the Snow Pea nor the Ice-shroom works on it, so it is never frozen either. `unfreezable` is not frozen by the Ice-shroom, only chilled, and takes no freeze damage.

#### Mind control

A plant's `mindControl: true` (the Hypno-shroom) brings over to its side a hostile zombie that eats it while it is awake, or a hostile plant that bites it in one gulp (that bite does not count as swallowing it). A zombie that stops eating and walks on draws its speed again by its own type. See [Teams and the Hypno-shroom](TEAMS.md).

#### Zombie size

A zombie's `scale` is its drawn size (the dancers' 0.8, scaled about the Reanim's (30, 120)). It walks the ground track at that size, its animation faster to match.

#### Dancing

A zombie's `dance` makes it dance to the board's shared beat (`DANCE_BEAT`): on the first 12 beats it walks on `walk`, on the other beats it stands with its arm up on `raise`. It needs a `raise` clip.

- When one of a group (a leader and the backup dancers it summoned) is eating or frozen, the whole group stands still; when one is chilled, the whole group is slowed.
- `dance.lead: { moonwalkTicks, backup, troupe, holdTicks, summonTicks, summonBeforeX, riseTicks }` makes a leader.
- A leader first moonwalks for `moonwalkTicks` on the `moonwalk` clip (which has an `fps` and a `ground` recorded by direction of travel) at that clip's own pace. A chill does not affect it; one frozen during the moonwalk stands where it is once thawed until the moonwalk ends.
- It then plays `point` (which has an `fps` and a `hold`) to snap its fingers, summoning `backup` (which must be a zombie with a `dance` and no `lead`) to each place `{ row, x }` in `troupe`. Row and x are relative to the leader, mirrored left to right on the plants' side. The backup dancers rise from the ground within `riseTicks`.
- After that it holds still for `holdTicks`. When backup dancers are missing it waits `summonTicks`, then summons again on the arm-raising beat once its x is within `summonBeforeX`.

#### Projectile range

A projectile's range limit, `lifetimeTicks`, is written in the projectile definition to apply to everything that shoots it, or in a plant's `shooter.projectile` to apply only to that plant. For example, the Puff-shroom's `{ "id": "pvz:spore", "lifetimeTicks": 75 }`; the Scaredy-shroom shoots the same spore with no range limit.

#### Bowling nuts

The bowling nut is of the plant kind `bowlingnut`. The values of its `bowling` configuration default to the original's `Plant::UpdateBowling`, and a plant writes only the ones it changes.

### Presentation of plants and zombies

#### Zombie presentation

- `shadow` can have a `scale`, scaled about the shadow's center (the dancers' 0.8).
- `held: { x, y, scale }` scales the cached picture held in hand by `scale`, then moves it by (`x`, `y`) (the original's `Plant::DrawSeedType`; the Dancing Zombie's 0.8 and (20, 42)).
- `portrait` can have a `clip`, whose first frame the almanac's small window draws (`idle` by default, drawn at the zombie's `scale`). The seed packet's `packet.clip` and the held picture are drawn at the Reanim's own size.
- A part in `drops` can have `behind: true`, to be drawn one layer behind the zombie when it falls (the Dancing Zombie's head), and a `scale`, to enlarge it beyond the effect's and the zombie's size (the backup dancer's head, 1.3125: the original swaps its particle scale from the zombie's 0.8 to 1.05).
- The presentation of a zombie with a `dance` can have `dance: { music?, spotlight?, rise? }`:
  - `music` is played when a leader first snaps its fingers (with no more than 15 zombies on the board), and stopped when no leading dancer is left on the board.
  - `spotlight: { floor, floorOffset, beam, beamOffset, scale, colors, colorsFrom, colorTicks, colorStep }` is the leader's spotlight after its first snap: `floor` is drawn under it and `beam` over it, its color cycling through `colors` by age.
  - `rise` is how backup dancers rise from the ground, with the same fields as a grave zombie's rise (`depth`, `riseTicks`, `clip`), plus a `particle` and `sounds` for when the rise starts.
- `steps: { effect, marks: [{ at, x, y }] }`: each time the walk animation reaches `at` (a fraction of the clip's length), it plays `effect` once at the zombie's position plus (`x`, `y`), one layer below the zombie, mirrored when it walks right (the Football Zombie's dust).

#### Plant presentation

- `shake: { clip, tracks }`: while the body plays `clip`, every track in `tracks` is offset at random in each direction every tick, by no more than its value (the Doom-shroom's head shaking while its fuse burns).
- `muzzle: { effect, x, y }`: for every shot, it plays `effect` once at the projectile's starting point (the projectile's top-left corner) plus (`x`, `y`), above that row's mower layer, mirrored by the projectile's hitbox for plants on the zombies' side (the muzzle smoke of the Puff-shroom, the Scaredy-shroom and the Snow Pea).
- `freeze: { effect, layer }` and `freezeSounds` are the effect and sounds played at the plant's center when a freeze fuse goes off (the Ice-shroom).

#### Ice blocks

The base presentation's `iceTrap` is the block of ice under a frozen plant or zombie: two images, `back` (behind) and `front` (in front), the ice shard particle `release`, and `{ x, y, scale?, releaseAt }` for each of `zombie` and `plant` (the original's Y-down pixels from the entity's top-left corner). A plant's or zombie's presentation can replace the position of its own group with its own `iceTrap: { x, y, scale? }` (the offsets the original's `Zombie::DrawIceTrap` gives the Pole Vaulting Zombie, the Gargantuar and others).

### Projectile presentation

A projectile presentation can configure a `shadow`: `sprite`, `columns`/`cell` of a single-row atlas, `offset` and `scale`. The shadow is drawn separately on the ground layer, its X following the projectile and its Y the row's start plus `offset.y`. Through the same resource loader it keeps an HD pack's logical size.

### Views, dropped items and level rules

- The presentations of plants, zombies, projectiles, items and grid items can all have a `viewConfig`: an arbitrary JSON object, kept as is, for the view named by `view` (usually one the Mod registers itself) to read and validate. The base game only checks that it is an object.
- In a level rule's presentation (`rules`), every field except `graveRise` is for that rule's own view to read and validate.
- The click area of a dropped item is gameplay: the item definition's `clickPadding` and the level's `itemClickPadding`. The server decides which item was clicked.

### Achievements

Achievements are written in the gameplay `achievements` table, from ID to `{ titleKey, descriptionKey, icon: { sprite, index }, trigger? }`. The icon is cell `index` of `sprite` cut into 70×70 cells, 7 to a row. The achievements page and the award page list the base game's achievements first, then each Mod's in turn.

**Granting.** Server scripts grant achievements with `grantAchievement(world, id, announce)` from the host module `server/achievements/achievements`.

- An achievement the player already has is not granted again.
- When `announce` is true it is announced in the level at once; otherwise it waits to be listed on the award page after the level.
- The client hands the profile to the menu API to save.
- A level definition with `achievements: false` grants no achievements on that level, which suits test levels.

**Triggers.** How an achievement is earned is written in its `trigger: { kind, ...settings }`. The game code only sends server events; the achievement module observes every event and judges it by the trigger type that `kind` names. The base game's trigger types (see [Achievements](ACHIEVEMENTS.md)):

| `kind` | Settings |
| --- | --- |
| `pvz:blast` | `plants`, `kills` |
| `pvz:bowling` | `plants`, `hits` |
| `pvz:coin-streak` | `items`, `coins` |
| `pvz:sun-held` | `sun` |
| `pvz:win-planting` | `boards`, `skipRules`, `only` / `never` |
| `pvz:mind-controlled` | `zombies` |

A Mod's new achievements can use these types directly. When a new way of judging is needed, register one with `registry.achievementTriggers.register(ownerId, kind, { validate, observe })` (`registry` is the host module `gameplay/registry`, the instance of `server/registry/GameplayRegistry`). `observe` receives the event, the settings and this achievement's state in the level (kept in the save). To make a base achievement count a Mod's plants, change its `trigger` under its ID in the Mod's own `achievements`.

### Store

The store is a gameplay definition table too: a Mod adds entries in its own namespace and changes anyone's under their IDs. `store` gives store items by item ID:

```text
{ page, place, cost or prices, message or messages, purchase, level?, completed?, requires?, effect?, unlockChallenge? }
```

- The item ID is also the key of its purchase count in the profile, so items of different Mods never share one.
- `page` names a page in the `storePages` table: `{ level? }` or `{ completed: true }`, the original's `StoreScreen::IsPageShown`. Pages are in registration order, the base game's four first and each Mod's after them in turn.
- `place` is which of the page's 8 cells, in two rows, the item takes (0–7). A cell of a page holds only one item: a Mod can put items in empty cells of the base pages or register pages of its own.
- `prices` and `messages` are picked by how many have been bought. `anyPurchases` and `allPurchases` in `requires` name item IDs.
- The whole store must have exactly one item with `effect: "seedSlots"`: the seed slot upgrade Crazy Dave sells in levels. The slot count shown is `seedBank`'s `baseSlots` plus one per purchase, up to `maxSlots`.

`purchase.kind`:

| Kind | Fields | Effect |
| --- | --- | --- |
| `set` | `value` | Stores `value`. |
| `count` | `amount`, `limit` | Adds `amount`, up to `limit`. |
| `stock` | `minimum`, `amount`, `limit` | Adds `amount` to at least `minimum`; sold out above `limit`. |
| `timestamp` | | Stores when it was bought. |
| `plant` | | Puts a pot of the plant named by `zenGarden.template` in `settings` into the Zen Garden. |
| `seed` | `id` | Sells a seed, which may be an upgrade plant that is not installed yet. |

An item's look is in the presentation `store` table, by the same ID: `sprite`, `offset` and `highlight`. The "x5" shown when a `stock` item sells several at once comes from `amount` in the gameplay data; without a `sprite`, the item draws the packet of the seed it sells. The store screen's timing and Crazy Dave's chatter are in the base presentation's `storeDialogue`.

### Almanac

- The almanac's plant pages are the seed chooser grid (the original's `AlmanacDialog::GetSeedPosition`) and need no entries.
- The gameplay `almanac` table gives the windows of the zombie pages by zombie ID: `{ place, startingLevel, spawnedOnly?, afterAdventure? }`. `place` is a position counted from 0 with 5 to a row and may not repeat, and every key must be an existing zombie.
- The ground a plant or zombie stands on in the almanac is in the presentation `almanac` table, by plant or zombie ID. `ground` is `day`, `night`, `pool`, `nightpool`, `roof` or `ice`, and a plant can add `upgrade: true` (the upgrade plants' packet background). Without an entry, it stands on day ground.

### Tools

Tools are in the gameplay `tools` table, from ID to `{ kind }`, where `kind` says what the tool does; for now there is only `shovel` (digs up the plant in a cell). A level's `tools` and awards with `kind: "tool"` must name existing tools, and every tool also needs its look in the presentation `tools`; a missing one is a load failure.

## Resources

All resource categories share one set of definitions:

| Category | Entry | Notes |
| --- | --- | --- |
| `sprites` | An object | See [Images](#images). |
| `fonts` | A font JSON path | See [Fonts](#fonts). |
| `audio` | A file path | MP3 or WAV. |
| `json` | A file path | Plain JSON, including the `pvz:strings` text table. |
| `text` | A file path | Plain text. |
| `reanim` | A file path | Reanim animations (schemaVersion 3), which record their source `fps`. |
| `particles` | A file path | See [Particles](#particles). |
| `music` | A file path | See [Music](#music). |
| `prefabs` | A file path | Engine prefabs, which still have engine import requirements. |

New animation, particle and music configurations use their own categories, and plain JSON uses `json`. Replacing an existing resource only needs its original ID; new resources use the Mod's own namespace.

### Images

```json
"example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80, "scale": 2 }
```

- `width` and `height` are the logical size, and `scale` is the texture's resolution multiplier. For example, a logical 50×70 image that is actually 100×140 is configured with `scale: 2`.
- The optional `rect`, `offset` and `borders` control cropping, offset and nine-slicing.
- `animations` limits the animation IDs a replacement applies to.
- `alphaMode: "premultiplied"` marks a source PNG as premultiplied alpha; unmarked or `"straight"`, it keeps ordinary RGBA. The mark applies per PNG file, and slices that share a file cannot declare conflicting formats. Raw paths read through `assets.sprite(path)` use the same list. The base loader decodes non-interlaced RGBA8 PNGs in one way and restores their colors.
- Every image (whatever its `alphaMode`, from the base game or a Mod) is color-filled when it loads, as in the original: each fully transparent pixel takes the average color of the adjacent visible pixels in the rows above and below, or black when there are none, its alpha unchanged. Linear sampling then does not blend black fringes in at the edges. The RGB that fully transparent pixels carry in the image is therefore not kept.
- Web and Native use the same path. Animations, fades and ordinary Sprites all keep the default blending, and Mods need not set blend factors themselves.

Client scripts can read images in two ways:

- `assets.sprite(path)` reads one of the Mod's own images directly by path, reusing the shared resource decoding and cache. No other package can replace it.
- `assets.spriteResource(id)` reads by resource ID. Once the Mod has registered the ID in its own `content.json`, a package of higher priority (such as an HD pack) can replace it under the same ID.

### Fonts

A font JSON refers to PNGs in the same directory through `layers[].image`, and `textureScale` sets the density of the glyph texture, keeping the original layout.

Fonts are overridden only by ID, with no "read the base only" special case in normal play. Hotkey letters use a separate `pvz:hotkey` (the same file as `pvz:houseofterror16`), so a text pack overrides only the latter and hotkeys keep the original glyphs; an HD pack must also register `pvz:hotkey` to redraw it.

### Text

All text lives in a single text table merged by key, `pvz:strings`.

- **Base layer.** The base game's layer is the original's text (including level hints; the server sends only the hints' keys) plus the interface text the base game adds. The added text is written by hand in `tools/pvz/ui-strings.json` and merged in when pvz-base is generated; its keys must not repeat the original's.
- **Mod layers.** A Mod registers its own `pvz:strings` file as a layer among the `json` resources in `content.json`. New keys must carry its own namespace (such as `example:menu`). Any existing key, the base game's or any Mod's, can be rewritten, the later one in enabled priority winning. A translation pack therefore lists only the entries it changes, and can translate other Mods' text too.
- **Errors.** A new key that breaks these rules is ignored and reported in the console. A value that is not a string is an error attributed to the Mod.
- **Lookup.** `ui.text(key)` accepts only a key, with no default; a missing key shows the key name and is reported in the console. `ui.format(key, args)` fills `%s` and `%d` in order.
- **Language.** A translation pack states its text language in `manifest.json`'s `locale` (such as `zh-CN`); the last enabled Mod that declares a locale wins, en-US by default. The base game provides that value as `ui.locale`, and image assets with text in them choose their version by it (for example the top of the widescreen Mod's achievements page).

### Music

Each background music track is one `music` resource with the ID `pvz:<track name>`. The base game's tracks are `day_grasswalk`, `night_moongrains`, `choose_seeds`, `title_theme`, `zen_garden`, `puzzle`, `minigame`, `conveyer` and `final_boss`.

The format is in `shared/content/music.ts` (schemaVersion 3): duration, loop points, stems as audio resource IDs (`main`, with optional `drums` and `hihats`), and optionally the original's burst sections. A music Mod registers the track it replaces under the same ID, and the other tracks stay the base game's.

## Animation clips

Animation owners use a `clips` object keyed by name, including single-clip owners such as items (`idle`), animated projectiles (`fly`), dropped armor (`drop`) and the Whack-a-Zombie rule (`hammer`). Screen scenery uses `screens[screenId].clips` in drawing order. The presentation's top-level `clips` table holds shared effects such as `pvz:sod-roll` and `pvz:final-wave`; Mods can add qualified IDs and change existing entries under their IDs.

| Field | Meaning |
| --- | --- |
| `reanimId` | Required. The Reanim resource. |
| `x`, `y` | Local offsets (right and up). |
| `scale` | Defaults to 1. |
| `fps` | An absolute rate, replacing the Reanim's source `fps`. |
| `rateScale` | Multiplies the rate. Both `fps` and `rateScale` accept a number or an ordered pair sampled when playback starts. |
| `start` | `random` or `end`; clips start at the beginning otherwise. |
| `loop` / `hold` | Repeat, or keep the last pose after one pass. |
| `onlyTracks` | Selects exact track IDs. |
| `blend` | Transition time in seconds. |
| `fullLastFrame` | Includes the last frame for its full interval. |
| `attachmentTrackId`, `attachmentBase` | Attach to another layer (plant and zombie layers). |

For example, an item's spin:

```json
"clips": { "idle": { "reanimId": "example:coin", "rateScale": [0.6, 1], "loop": true, "start": "random" } }
```

Plant and zombie layers get their time and loop from the server animation and their scale from the view. They accept a single `rateScale` and can attach to another layer with `attachmentTrackId` and an optional `attachmentBase`. Attached layers use the track as their origin; their own offsets apply when drawn independently.

When a rule or view reads clips from its own configuration, use the shared `parseClip` or `parseClips` (`shared/content/presentation`), then `prepareClips` and `showClip` (`client/reanim/clips`) to load and play them.

## Particles

Particles are all registered in `resources.particles`. Their JSON uses `schemaVersion: 3`, a fully qualified `id` and `emitters`.

- Each emitter's `sprite` is a qualified ID too. Atlases use `columns`, `rows`, `firstFrame` and `frameCount`.
- Optional properties override the original's looping, spawn allowance, tint, rotation, collision and fields; the shared parser fills in the defaults.
- Tracks use `{ "nodes": [{ "time": 0, "low": 1, "high": 1 }] }`. `time` is a fraction of the lifetime, and the values of `systemDuration` / `particleDuration` are counted in ticks of 0.01 s.
- `clipTop`, `clipBottom`, `clipLeft` and `clipRight` (0–1) crop that fraction off each side of the sprite cell as the original's `RenderParticle` does. The rest is drawn centered on the particle's position plus the unrounded top and left crop amounts (such as the hand reaching out of the ground in the particles of a zombie rising from the ground).
- An emitter with `fullScreen: true` (the original's `FullScreen`) fills the whole screen with the particle's current color and alpha, wherever the particle is and whatever its size. The original does a `FillRect` over the whole picture (the flashes of the Ice-shroom and the Doom-shroom, whose image is `pvz:whitepixel`). The color and alpha are still computed by the particle kernel; the client only stretches its quad to the four corners of the screen (`ParticlePlayer`'s `fillScreen`).

XML conversion always goes through `tools/pvz/particles.py`. For the base package it unpacks the PAK temporarily, converts straight into `mods/pvz-base/assets/particles/` and registers the files in the resource list; the generic Mod packer then packs them. The original's curves and random distributions are kept by the conversion and computed by the shared particle kernel.

Scripts play particles with `ParticlePlayer.spawn({ parent, id: 'example:burst', x: 0, y: 0, seed: 123 })`, and every platform uses the same C++ core. `whenReady()` waits for loading; `snapshot()` and `ParticlePlayer.restore()` use the same save structure.

The old particle format and old particle saves are no longer accepted; existing Mods' particle resources must be converted and packed again.

## Sound

Client scripts play effects through `SoundSystem.play(id, options)` (`client/sound/SoundSystem`):

| Option | Effect |
| --- | --- |
| `foley: true` | Uses the effect's variants, pitch range and repeat suppression. |
| `pitch` | A fixed shift in semitones. |
| `channel` | A named channel; a new request replaces its previous one by default. |
| `ifBusy: 'keep'` | The current request on the channel keeps its place, including while loading or paused. |
| `pauseWithGame` | Follows board pause. Independent sounds can also set this in their Foley definition; a call can override that flag. |

For example, `SoundSystem.play(id, { channel: 'dancer', ifBusy: 'keep', pauseWithGame: true })` plays one disco effect across all dancers. Use `isChannelActive(channel)` to check occupancy and `stopChannel(channel)` to cancel playback or a pending load. Pass a presentation sound list directly to `SoundSystem.playSounds(sounds)`.

## Scripting

### Entry points

The entry point of each side is always `register({ host, assets })`:

```ts
export function register({ host, assets }) {
    const registry = host.get('gameplay/registry')
    const { Shooter } = host.get('server/plants/Shooter')
    registry.plants.register(assets.id, 'example:rapid_pea', regenerating(Shooter))
}
```

- The server entry (`src/server/index.ts`) registers custom plant, zombie and projectile kinds, rules and commands; in the game it runs from `cocosModule`. The client entry (`src/client/index.ts`) registers views, menus and client commands.
- `register` may be `async`. The loader calls it after the Mod's static definitions are registered and the Mods before it have loaded; the server entry runs before the client entry.
- If registration fails, the loader undoes that Mod's definitions, registrations and method wrappers (calling `host.dispose()`). Pure resource, data and script Mods use the same loading entry point.
- `src/server/` and `src/client/` compile separately and cannot import each other's files or the host's source. Share data through a JSON file in the archive read with `assets.json()`, and reach host code through `host.get()`.

### Host modules

`host.get(id)` returns a module of the host, the real one the game itself uses. The ID is the module's path under `assets/scripts`, without the extension; a directory's `index` is named by the directory. For example `client/plants/PlantView`, `server/seeds/planting` or `shared/protocol`.

| Side | Modules | Extra values |
| --- | --- | --- |
| Server | Every module under `server/` and `shared/`, except the host's own module lists and `createModHost` | `content/definitions` (the gameplay definition sources), `gameplay/registry` (the gameplay registry) |
| Client | Every module under `client/`, `shared/`, `platform/` and `core/`, with the same exceptions | `cc` (the engine), `content/definitions` (the presentation definition sources), `client/views` (the view registries) |

When a module moves, its ID changes with it. The module lists are generated by `npm run mod:hosts` (`client/content/hostModules.ts`, `server/session/hostModules.ts`) and must be regenerated after a module is added, moved or deleted; the tests check them. An ID not in the list throws `Host module is unavailable`.

### Wrapping host methods

`host.around(target, key, wrapper)` wraps a method of a real host object:

```ts
host.around(target, 'method', function (next, ...args) {
    // before
    const result = next(...args)
    // after
    return result
})
```

- `this` is the original receiver. `next()` with no arguments calls the next layer with the same arguments; `next(...values)` passes new ones.
- Wrappers compose across Mods: the most recently added wrapper runs first, and the original runs last.
- The target must have a function under `key`; a wrapper can be put on an object, on one instance (a single button's `onClick`), or on a class prototype (`MainMenuScreen.prototype`).
- `host.around` returns a function that removes that wrapper. `host.dispose()` removes all of the Mod's wrappers; a Mod can wrap `dispose` itself to clean up nodes it created.
- `host.replace(target, key, replacement)` replaces a method outright; it is a wrapper that does not call `next`.
- The host exports rules as mutable objects (`planting`, `executor`, `specs`) because ES module namespace exports cannot be patched reliably. The host calls itself through these objects, so a wrapper also takes effect on internal calls.

### Reading the Mod's own files

`assets` is the Mod's own archive:

| Member | Returns |
| --- | --- |
| `assets.id`, `assets.manifest` | The Mod ID and parsed manifest. |
| `assets.bytes(path)` | A copy of a file's bytes. |
| `assets.json(path)` | A parsed JSON file, read directly from the archive. |
| `assets.url(path)` | A `pvzmod:///<id>/...` URL for the file. |
| `assets.sprite(path)` | Client only: an image by path (see [Images](#images)). |
| `assets.spriteResource(id)` | Client only: an image by resource ID. |

Paths must stay inside the archive.

### Registries

The server's `gameplay/registry` holds:

| Registry | Registration | Selected by |
| --- | --- | --- |
| `plants` | `register(ownerId, kind, Class)` | A plant definition's `kind` |
| `zombies` | `register(ownerId, kind, Class)` | A zombie definition's `kind` |
| `projectiles` | `register(ownerId, kind, Class)` | A projectile definition's `kind` |
| `extensions` | `register(id, validate?)` | `entity.extensions[id]` (see [Entity data](#entity-data)) |
| `levelRules` | `register(ownerId, kind, rule)`; a rule has at least `validate` and `draft` | A level's `rules.kind`; the base game's are `pvz:adventure`, `pvz:bowling` and `pvz:whack-a-zombie` |
| `achievementTriggers` | `register(ownerId, kind, { validate, observe })` | An achievement's `trigger.kind` |
| `projectileMotions` | `register(ownerId, kind, { move, launch?, parseState? })` | The base game's are `pvz:straight`, `pvz:lob` and `pvz:homing`, chosen by a plant's `shooter.type` (`shooter`, `lobber`, `seeker`) |
| `tutorials` | `register(ownerId, id, script)` | A level's `tutorial` |

`ownerId` is the Mod's ID (`assets.id`). Registering an ID that is already registered is an error.

The client's `client/views` holds the view registries `plants`, `zombies`, `projectiles`, `mowers`, `gridItems` and `items`, and `events`, which hears the server's events. See [Views](#views).

**Tutorial scripts** are server registrations, like level rules. Register one with `registry.tutorials.register(ownerId, id, script)` (`TutorialScript` in `server/tutorials`), and a level uses it with `tutorial: id`. Loading checks that every level's `tutorial` is registered: a misspelled or unregistered name fails the load instead of counting as no tutorial, and a level without a tutorial leaves `tutorial` out. A script's own steps (`TutorialResource.step`) use its own namespace, such as `example:dig`, and are kept in the save.

### Kinds: adding gameplay to plants, zombies and projectiles

A Mod adds gameplay to plants, zombies and projectiles in only one way: write a kind (a class extending one of the base game's), register it, and select it in definitions with `kind`.

- **Own fields.** A Mod kind's own definition fields and entity fields are named with qualified IDs in the Mod's own namespace (such as `example:regeneration`).
- **Definition fields.** Such a field in a definition must be a JSON object and may only be written together with a kind whose static `config` lists it; a kind whose `config` lists a field also requires it. This is the same rule as for the base game's `shooter` and similar fields. The field's contents are checked by the kind's static `validate(definition, id)` when the content loads (`GameplayRegistry.validate`).
- **Entity fields.** The entity field of the same name is kept in the save, and read back and validated by `restoreOwn`.
- **Mixins.** To add the same gameplay to different kinds, write it as a mixin: a function that takes a base class and returns a subclass of it. The subclass appends its own fields to the static `config`, and `validate`, `restoreOwn` and the methods it overrides all call `super`. A class can stack several mixins, and namespaced fields do not overwrite one another. The example Mod's `regenerating` is used on both a shooter and a zombie.

```ts
const Regeneration = 'example:regeneration'
const regenerating = (Base) => class extends Base {
    static config = [...Base.config, Regeneration]
    static validate(definition, id) {
        super.validate(definition, id)
        // check definition[Regeneration]
    }
    [Regeneration] = { ticks: 0 }
    act(...args) {
        // count this[Regeneration].ticks, heal
        return super.act(...args)
    }
    restoreOwn(fields, name) {
        const { [Regeneration]: state, ...rest } = fields
        this[Regeneration] = /* validated */ state
        super.restoreOwn(rest, name)
    }
}
```

#### Plant kinds

Plants are divided by the gameplay definition's `kind` (`plant` by default; the base game also has `shooter`, `scaredyshroom`, `producer`, `sunshroom`, `fuse`, `potatomine`, `chomper`, `gravebuster`, `hypnoshroom`, `wallnut` and `bowlingnut`). It matches the presentation definition's `view` one to one (`Shooter` and `ShooterView`, `Chomper` and `ChomperView`, ...).

- Each plant is an instance of its class, in the world's `plants` list, with an `id` and a `position`. Its fields are saved as they are: a shooter's next shot time `readyAtTick`, a Chomper's stage `phase` and so on are all fields of the class.
- The state every plant has is `state` (`PLANT_STATES` in `shared/content/plantKinds.ts`): `idle` is on the lawn, and `mowered` has been crushed by a lawn mower and stays in the list until the crush animation finishes. A plant not in play does not count as a plant; take plants in play with `plantsInPlay(world)` / `plantInPlay(world, id)` from `server/level/lawn` (the opposite of the original's `Plant::NotOnGround`).
- A custom class extends `Plant` from `server/plants/Plant` or one of the base game's classes, and overrides the methods it changes: `attack` (shooting), `produce` (producing), `act` (its own ability), `roll` (rolling).
- When `inedible(world)` returns `true`, zombies eating it do it no damage; when `mindControls(world)` returns `true`, zombies eating it are mind-controlled. `keptFromCold()` / `keptFromIce()` decide whether it is immune to chilling / freezing at that moment, and `sitOut()` pushes its own timers back on the ticks it is frozen.
- Register it with `registry.plants.register(assets.id, kind, Class)`, then write `kind` in the plant definition.
- When it is planted, `start(random, tick)` runs first (drawing the initial wait and other random values). A subclass gives its own fields initial values in its constructor and overrides `restoreOwn` to read them back from the save.
- What `snapshotOwn(tick?)` returns for the client appears in the snapshot's `own`, and the client view reads it with `this.own(plant, field, validate)`.
- A class's own definition fields (`shooter`, `fright`, `producer`, `fuse`, `mine`, `chomper`, `graveBuster`, `mindControl`, `bowling`) may only be written with the class that takes them. The animation's `phases`, `offBoard.phase` and `blink.phases` and the presentation definition's `packet.phase` and `shadow.phases` may only name phases its class has (`shared/content/plantKinds.ts`).

#### Zombie kinds

Zombies are divided by the gameplay definition's `kind` (`zombie` by default; the base game also has `flag`, `polevaulter`, `newspaper` and `dancer`). It matches the presentation definition's `view` one to one: one class on the server to one view class on the client (`Zombie` and `ZombieView`, `PoleVaulter` and `PoleVaulterView`, ...).

- A custom class extends `Zombie` from `server/zombies/Zombie` or one of the base game's classes (such as `host.get('server/zombies/PoleVaulter').PoleVaulter`) and overrides the methods it changes. For example, when `dodgesBite()` returns `true` a Chomper's bite misses, and when `evades(key)` returns `true` plants targeting with the key `key` (the plant's `targeting.insetKey`, such as the Potato Mine's `pvz:mine`) do not choose it.
- Register it with `registry.zombies.register(assets.id, kind, Class)`, then write `kind` in the zombie definition.
- To show the client something of its own, override `snapshotOwn()` to return a JSON object. It appears in the snapshot's `own`, and the client's matching view class reads it with `this.own(zombie, field, validate)`.
- Each zombie is an instance of its class, in the world's `zombies` list. The instance's fields are saved as they are, so they can only be plain data (refer to another zombie by its entity id). A subclass gives its own fields initial values in its constructor and overrides `restoreOwn(fields, name)` to read them back from the save, taking and validating its own and passing the rest to `super.restoreOwn`.
- A class's own definition fields (`vault`, `dance`, `enrage`) may only be written with the class that takes them, and the class's static `config` lists which ones it takes. The pole vaulter's `vault.evades` lists the targeting keys that leave it out while it holds its pole.

#### Projectile kinds

Projectiles are divided by the gameplay definition's `kind` (`projectile` by default; the base game also has `mowing`, a lawn mower once it has set off). It matches the presentation definition's `view` one to one (`Projectile` and `ProjectileView`, `MowingProjectile` and `MowingProjectileView`).

- Each projectile is an instance of its class, in the world's `projectiles` list, with an `id` and a `position`, and its fields are saved as they are.
- A custom class extends `Projectile` from `server/projectiles/Projectile` or `MowingProjectile` from `server/projectiles/MowingProjectile`, and overrides `canHit` (whether it can hit this target), `strike` (what it does on a hit) and `speedScale` (its speed multiplier this tick).
- Register it with `registry.projectiles.register(assets.id, kind, Class)`, then write `kind` in the projectile definition.
- The `projectile` kind must have `damage`, and `mowing` must not. A shooter's `shooter.projectile` override cannot write fields its projectile's kind does not take. A level's `lawnMower` must be of a kind that mows (`MowingProjectile` or a subclass of it).
- The lawn mower waiting at the end of a row is another class, `Mower` (`server/mowers/Mower.ts`), which on setting off fires a projectile of the level's `lawnMower` type and itself disappears from the row.

### Views

A custom plant or zombie view extends `PlantView` or `ZombieView` and is registered with `host.get('client/views').plants.registerView(kind, Class)` (`zombies` for zombies). The presentation definition's `view` then names that kind, and its `viewConfig` gives the view's parameters.

```ts
const { PlantView } = host.get('client/plants/PlantView')
class BeaconView extends PlantView {
    onBoard(plant, world, ...rest) {
        super.onBoard(plant, world, ...rest)
        // in-level effects only; off the board only `pose` runs
    }
}
host.get('client/views').plants.registerView('example:beacon', BeaconView)
```

The base game's zombie view kinds are `zombie` (the default), `flag`, `polevaulter`, `newspaper` and `dancer` (`FlagZombieView`, `PoleVaulterView`, `NewspaperView`, `DancerView`, all extending `ZombieView`).

Both base views give subclasses the same members:

| Member | Purpose |
| --- | --- |
| `onBoard(entity, world)` | Draws the entity itself on the board every frame; call `super.onBoard` first. |
| `pose` | Poses the layers, off the board too. |
| `shown(layer, entity)` | Decides which clip a layer shows. |
| `playable()` | Lists the Reanims to load first. |
| `presentation` | The presentation definition. |
| `animation` | The animation definition in the gameplay definitions. |
| `body` | The main body's player. |
| `root` | The node the layers are in; moving it moves the whole picture. |
| `clip(name)`, `ownFrames(reanimId)`, `particle(...)`, `flash` | Helpers for clips, frames, particles and the hit flash. |
| `own(entity, field, validate)` | Reads the kind's own snapshot data (`snapshotOwn`). |

Derive cosmetic effects from the authoritative tick and the snapshot rather than a clock of the view's own, so pausing does not keep emitting particles.

### Entity data

The world (`server/state/World`) is a set of lists separated by type: `plants`, `zombies`, `projectiles`, `mowers`, `gridItems` and `items`. Each holds the objects themselves by id and is iterated in id order, with no ECS components.

To keep data of your own on an entity, put it in the entity's `extensions[id]` (a JSON object), where `id` is a qualified ID in your own namespace, registered first with `registry.extensions.register(id, validate?)` (IDs in `pvz:` are refused).

- Registered data is saved and loaded with the entity, appears in the snapshot's `extensions[id][entityId]`, and is validated by `validate` and copied every time.
- Unregistered data is neither saved nor sent.
- A kind's own data is simply written as its fields; `extensions` is for data attached to entities of other kinds. The example Mod's `example:charge` is kept on plants this way.

## Changing server rules

Server rules are exported as objects by responsibility, and the first parameter of every function is the game's `session` (with `world`, `definitions`, `gameplayTick` and so on). The host also calls itself through these objects, so a wrapper takes effect on internal calls as well.

| Module | Objects and methods |
| --- | --- |
| `server/seeds/planting` | `planting.seedAvailability`, `rejectSeed`, `selectSeed`, `selectConveyorPacket`, `placePlant`, `placeZombie`, `createPlant`, `findPlantAt` |
| `server/seeds/tools` | `tools.owned`, `available`, `select`, `use` |
| `server/items/items` | `items.collectAt`, `collect` |
| `server/session/commands` | `commands.execute`, which runs every player command. The protocol's `{ type: 'mod', id, data }` command is answered `unsupported-command` by the base game; a Mod handles its own by wrapping `execute`. |
| `server/session/snapshot` | `snapshot.build`, where a Mod adds its state to `extensions` |
| `server/seeds/seedChooser` | `seedChooser.entries(definitions, owned)` (see below) |
| `shared/protocol` | Reachable from both sides: the data formats between client and server and their helpers, such as `chooserEntryKey` (a seed chooser card's unique key; the two sides' cards of one seed count as two cards) |

```ts
const { planting } = host.get('server/seeds/planting')
host.around(planting, 'seedAvailability', function (next, session, seedId, ...rest) {
    const availability = next(session, seedId, ...rest)
    return availability.reason || seedId !== 'my-mod:plant' || ready(session.world)
        ? availability : { reason: 'seed-not-available', warningKey: 'my-mod:not_ready' }
})
```

**Seed chooser cards.** `seedChooser.entries(definitions, owned)` offers cards beyond the base seed chooser grid, by the seeds the player owns. It returns `{ seedId, team? }` entries, where `team` can move a card to the other side. The base game offers none.

- With `/cheatseed` on, these cards come after the base game's paged cards, and a duplicate card counts once.
- They count, as owned seeds do, toward the number of slots and toward whether the seed chooser opens: it opens only when there are more cards than slots; otherwise they all go into the seed bank.
- The chooser snapshot's `entries` lists them, and `chooseSeed` picks one with the same `team`.
- On the client, the seed chooser uses `showCards` to decide which cards the grid shows, and calls `onCardHidden` when a card goes back from the seed bank and the grid does not have it.
- The page-turning buttons are the seed chooser's `pageTurners` (`{ button, step }`). A Mod can redraw them; turning pages is still handled by the base game.

## Extending CLI commands

Reuse `host.around` to wrap the existing command objects; there is no separate command registration API. Both sides can reach `shared/debug/DebugCli`. Parsing, command name completion, parameter hints and static argument value completion all read its `specs.list()`.

### Declaring the syntax

A command's syntax is `{ name, parameters, minimum, values? }`:

- `parameters` gives the hints and the maximum number of arguments, and `minimum` the minimum.
- The optional `values: { 0: ['a', 'b'] }` provides both validation and completion for the first argument.
- Names are lowercase and may carry a Mod namespace.
- Using the existing parser keeps syntax such as quoted arguments.

Syntax is extended by wrapping `specs.list`, so the list is never modified directly.

### A client command

A client entry point adding `/example:hello {name}`:

```ts
export function register({ host }) {
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:hello', parameters: ['{name}'], minimum: 1 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some(entry => entry.name === spec.name) ? entries : [...entries, spec]
    })

    const { executor } = host.get('platform/debug/DebugCliCommands')
    host.around(executor, 'execute', function (next, input, ...rest) {
        const parsed = cli.parseDebugCliCommand(input)
        if (!('name' in parsed)) return parsed
        if (parsed.name === spec.name) return cli.debugSuccess(`Hello ${parsed.args[0]}`)
        return next(input, ...rest)
    })
}
```

### Results

- Messages from `debugSuccess` and `debugSyntax` only go to the console, so write the text directly.
- `debugCondition` means a condition is not met: the debug window closes and the message is shown on screen as advice. Its first argument is a text key, and the remaining arguments fill the text's `%s`/`%d` in order. For example `"example:cli_need_level": "Start a playing level first"`, written in the `pvz:strings` text resource the Mod registers (see [Text](#text)).
- The client looks the key up with `ui.format(key, args)`; translation packs and Mod text can both override it, and the server never needs the text table.

### Server commands

Commands that change the game state are handled on the server:

- Both sides' entry points apply the same `specs.list` wrapper (which can be moved into a source file the Mod shares between them), and the client adds no matching execution wrapper.
- The normal client entry point forwards the raw command to the server while there is a level.
- When running integrated, both sides share the syntax object, and the same-name check above keeps completions from appearing twice. A standalone server must declare the syntax too.

The server uses `executor` from `server/debug/debugCommands`. `execute(session, command)` receives the game's `session` (with `world`, `definitions`, `gameplayTick` and so on) and the command as parsed and validated by the server. Rules such as planting come from modules such as `server/seeds/planting`, whose first parameter is likewise `session`. For example, to have the server return the message for the command above, keep the syntax wrapper and move the execution wrapper to the server entry point:

```ts
const cli = host.get('shared/debug/DebugCli')
const { executor } = host.get('server/debug/debugCommands')
host.around(executor, 'execute', function (next, session, command) {
    if (command.name === 'example:hello') {
        return cli.debugSuccess(`Hello ${command.args[0]}, tick: ${session.gameplayTick}`)
    }
    return next(session, command)
})
```

- Server commands still go through the existing debug permission and command queue, and can run while paused. A Mod checks for itself the world state its operation needs.
- An execution wrapper handles only its own commands and calls `next` for the others.
- When registration fails, the loader undoes the syntax and execution wrappers along with `host.dispose()`, leaving no broken commands or completions behind.

## Developing and packing

```sh
npm run mod:init -- my-mod             # create mods/my-mod from the template
npm run mod:pack -- mods/my-mod        # compile and pack to dist/mods/my-mod/ and dist/mods/my-mod.zip
npm run mod:test -- dist/mods/my-mod   # check the packed Mod's server registration
npm run mod:hosts                      # regenerate the host module lists
```

| Command | Options |
| --- | --- |
| `mod:init -- <name>` | `--out <directory>` instead of `mods/<name>` |
| `mod:pack -- <name-or-directory>` | `--out <directory>` instead of `dist/mods/<name>`; `--publish <zip-file>` |
| `mod:test -- <name-or-directory>` | |

A bare name means `mods/<name>`.

The [Mod Lab](../mods/example/README.md) shows gameplay kinds and mixins, Mod data on entities and in saves, changes to a base level, adding and overriding resources, custom views, commands on both sides, menu extensions and lifecycle cleanup. Its capability table points to the actual implementation of each.

### Packing

Only `mod:pack` compiles; the source directory gets no compiled files. It:

- copies `manifest.json`, any LICENSE, NOTICE or COPYING file and `conversion.json` from the Mod root (a README stays out of the package), and the `assets/` directory except the definition table files;
- merges the categorized definitions into `assets/gameplay.json` and `assets/presentation.json`. The packed `content.json` keeps the resource mapping, while its `gameplay` and `presentation` point to the generated merged JSON;
- collects every declared resource file and every font atlas;
- compiles `src/server/index.ts` twice, to `gameplay.nodeModule` (ES module, for Node) and `gameplay.cocosModule` (SystemJS, for the game), and `src/client/index.ts` to `client.module` (SystemJS). A `client.bundle` directory is not built; it must already be in the package (for example under `assets/`);
- generates the content hash;
- outputs `dist/mods/<name>/` with a ZIP beside it. The ZIP holds the package in a top-level `<name>/` folder, with PNG and MP3 files stored uncompressed.

`--publish <zip-file>`: after a successful pack, atomically replaces the given location with the complete ZIP; on failure the previously published file is kept.

### Testing

`mod:test` checks the real server registration of a packed directory, without recompiling: it checks the package files as an import does, registers the Mod's gameplay definitions over the base content, runs the server entry (`nodeModule`), and validates and freezes the result. Given a Mod's source (such as `npm run mod:test -- example`), it first packs it to a temporary directory and checks that pack.

It does not replace checking the client or the picture on a real device. After a change, repack, install and restart.

## The base package

The base game's `assets/resources/base.zip` shares `manifest.json`, `content.json`, the definition parsers and the resource parsers with Mods, and has no content index of its own.

- The base package always loads first and cannot be disabled or uninstalled.
- Its source, `mods/pvz-base/content.json`, indexes categorized JSON as a Mod does, merged into `assets/gameplay.json` and `assets/presentation.json` when packed.
- The base gameplay also provides `settings` (schemaVersion, the sun and money caps `economy`, the seed bank `seedBank`, the flag waves' `flagWave` and the Zen Garden's `zenGarden`), the full levels, the default text and the seed catalog. Mods loaded later add content in their own namespaces.
- Every resource (particles included) is registered explicitly in the source `content.json`'s `resources`; packing does not scan for missing ones.

Packing and publishing:

```sh
npm run mod:pack -- pvz-base                                       # dist/mods/pvz-base.zip
npm run mod:pack -- pvz-base --publish assets/resources/base.zip   # also publish the built-in ZIP
```

Both use the generic Mod packer, and the hash covers the unified index and every file. Converting the original resources into `mods/pvz-base/` is described in [Development](DEVELOPMENT.md).
