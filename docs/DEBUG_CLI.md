# Debug CLI Guide

Debug CLI is the built-in debug command window for quickly switching levels, spawning entities, changing level state, and toggling debug options.

## Synopsis

```text
/{command} [arguments]
```

Commands may be entered with or without `/`. This document uses `/command` consistently.

## Command Index

- [Level And Screens](#level-and-screens)
  - [`/level`](#level)
  - [`/restart`](#restart)
  - [`/reload`](#reload)
  - [`/home`](#home)
  - [`/quit`](#quit)
  - [`/help`](#help)
  - [`/menu`](#menu)
  - [`/shop`](#shop)
  - [`/almanac`](#almanac)
  - [`/zengarden`](#zengarden)
- [Level Control](#level-control)
  - [`/win`](#win)
  - [`/lose`](#lose)
  - [`/nextwave`](#nextwave)
  - [`/nextflag`](#nextflag)
  - [`/damage`](#damage)
  - [`/kill`](#kill)
  - [`/gamespeed`](#gamespeed)
- [Entities And Resources](#entities-and-resources)
  - [`/plant`](#plant)
  - [`/removeplant`](#removeplant)
  - [`/zombie`](#zombie)
  - [`/item`](#item)
  - [`/sun`](#sun)
  - [`/money`](#money)
  - [`/lawnmower`](#lawnmower)
- [Debug Toggles](#debug-toggles)
  - [`/hotkeys`](#hotkeys)
  - [`/cooldown`](#cooldown)
  - [`/suncost`](#suncost)
  - [`/sunspawning`](#sunspawning)
  - [`/collect`](#collect)
  - [`/hitboxes`](#hitboxes)
  - [`/background`](#background)
  - [`/mobile`](#mobile)
  - [`/fullscreen`](#fullscreen)
  - [`/music`](#music)
  - [`/sfx`](#sfx)
  - [`/perf`](#perf)

## Opening The CLI

- Desktop: press `/`. The input box starts with `/`.
- Mobile: in mobile mode, double tap the bottom-right screen area, roughly a square of `100 * devicePixelRatio` pixels.

Input supports:

- `Tab` to complete commands or arguments.
- `Up` / `Down` to browse command history for the current run.
- `Enter` to execute.
- `Esc` or `Cancel` to close.

## General Rules

- Command names and `{true|false}` are case-insensitive. This document uses lowercase as the canonical spelling.
- `row` and `col` are 1-based.
- Entity ids use the canonical spellings listed here. The CLI normalizes case, spaces, underscores, and hyphens when matching ids.
- Syntax errors flash the input red and keep the CLI open. Failed runtime conditions close the CLI and show an in-game hint.

## Commands

### `/level`

Force-load a level and skip the saved-game prompt.

**Usage**

```text
/level {level}
```

**Arguments**

- `level`: `1-1` through `1-10`, `stress`, or full ids `adventure-1-1` through `adventure-1-10`, `adventure-stress`.

**Availability**

- Any screen except startup loading.

**Side Effects**

- Normal adventure levels sync adventure progress to the target level and delete that level's saved snapshot.
- `stress` does not write official adventure progress.

**Notes**

- `stress` is an internal stress-test level. It starts with a full lawn, no seed bank, no lawn mowers, no falling sun, skips the intro, and spawns dense buckethead zombie waves.

---

### `/restart`

Restart the current level.

**Usage**

```text
/restart
```

**Availability**

- Level screen.

**Side Effects**

- Deletes the current adventure level snapshot.
- Restarts the current level as a new game.

---

### `/reload`

Reload the whole game runtime.

**Usage**

```text
/reload
```

**Availability**

- Any screen except startup loading.

---

### `/home`

Return to the player select / main menu flow.

**Usage**

```text
/home
```

**Availability**

- Any screen except startup loading.

**Side Effects**

- If a level is active, saves a level snapshot first.

---

### `/quit`

Run the current platform's quit path.

**Usage**

```text
/quit
```

**Availability**

- Any screen except startup loading.

**Notes**

- Some platforms do not allow closing the window, so this may have no visible effect.

---

### `/help`

Open the help screen.

**Usage**

```text
/help
```

**Availability**

- Any screen except startup loading.

---

### `/menu`

Open a menu.

**Usage**

```text
/menu
```

**Availability**

- Any screen except startup loading.

**Behavior**

- In a level, opens the in-game menu.
- Outside a level, opens the global options menu.

---

### `/shop`

Open the shop screen.

**Usage**

```text
/shop
```

**Availability**

- Any screen except startup loading.

**Side Effects**

- When opened from a running level, pauses the level and resumes it after closing.

---

### `/almanac`

Open the Almanac screen.

**Usage**

```text
/almanac
```

**Availability**

- Any screen except startup loading.

**Side Effects**

- When opened from a running level, pauses the level and resumes it after closing.

---

### `/zengarden`

Open the Zen Garden screen.

**Usage**

```text
/zengarden
```

**Availability**

- Any screen except startup loading.

## Level Control

### `/win`

Trigger the current level's win flow.

**Usage**

```text
/win
```

**Availability**

- Running level.

---

### `/lose`

Trigger the current level's lose flow.

**Usage**

```text
/lose
```

**Availability**

- Running level.

---

### `/nextwave`

Spawn the next normal zombie wave immediately.

**Usage**

```text
/nextwave
```

**Availability**

- Running level.

**Failure Conditions**

- Fails when no zombie waves remain.

---

### `/nextflag`

Spawn the next flag wave immediately.

**Usage**

```text
/nextflag
```

**Availability**

- Running level.

**Failure Conditions**

- Fails when no flag waves remain.

---

### `/damage`

Damage all currently damageable zombies.

**Usage**

```text
/damage {damage}
```

**Arguments**

- `damage`: positive integer.

**Availability**

- Running level.

**Side Effects**

- Zombies killed by this command go through normal damage / death handling.
- Coins or level-award drops may be generated.

---

### `/kill`

Remove all living zombies directly.

**Usage**

```text
/kill
```

**Availability**

- Running level.

**Behavior**

- Marks and removes all living zombies directly.
- Checks level completion afterward.

**Side Effects**

- Does not run normal death animation, damage resolution, or drop logic.
- Does not generate coins or level-award drops.

---

### `/gamespeed`

Set the global game speed.

**Usage**

```text
/gamespeed {speed}
```

**Arguments**

- `speed`: number from `0` to `10`. `0` freezes gameplay logic.

**Availability**

- Any screen except startup loading.

**Persistence**

- Not persisted.

## Entities And Resources

### `/plant`

Place a plant at a grid cell.

**Usage**

```text
/plant {plant_name} {row} {col}
```

**Arguments**

- `plant_name`: `peashooter`, `sunflower`, `cherrybomb`, `wallnut`, `explodenut`, `snowpea`, `potatomine`, `chomper`, `repeater`, `puffshroom`, `bowling-wallnut`, `bowling-explodenut`.
- `row`: row inside the current board bounds.
- `col`: column inside the current board bounds.

**Availability**

- Running level.

---

### `/removeplant`

Remove the plant at a grid cell.

**Usage**

```text
/removeplant {row} {col}
```

**Arguments**

- `row`: row inside the current board bounds.
- `col`: column inside the current board bounds.

**Availability**

- Running level.

**Failure Conditions**

- Fails when there is no plant at the target cell.

---

### `/zombie`

Summon a zombie.

**Usage**

```text
/zombie {zombie_name}
/zombie {zombie_name} {row}
/zombie {zombie_name} {row} {col}
```

**Arguments**

- `zombie_name`: `normal`, `flag`, `traffic-cone`, `bucket`, `ducky-tube`, `pole-vaulting`.
- `row`: row inside the current board bounds.
- `col`: column inside the current board bounds.

**Availability**

- Running level.

**Behavior**

- Without a position, uses the current level's spawn-row logic.
- With only `row`, spawns at the right edge of that row.
- With `row` and `col`, spawns at that grid cell.

---

### `/item`

Spawn a collectable item.

**Usage**

```text
/item {item_name}
/item {item_name} {row} {col}
```

**Arguments**

- `item_name`: `silver`, `gold`, `diamond`, `sun`, `small-sun`, `large-sun`, `award`.
- `row`: row inside the current board bounds.
- `col`: column inside the current board bounds.

**Availability**

- Running level.

**Behavior**

- Without a position, spawns at the default board position.
- With `row` and `col`, spawns at that grid cell.

**Notes**

- `award` creates the final level reward according to the current level config, such as a seed packet, shovel, or note.

---

### `/sun`

Change the current level's sun amount.

**Usage**

```text
/sun {add|set} {number}
```

**Arguments**

- `add`: add or subtract an integer amount.
- `set`: set sun directly.
- `number`: integer.

**Availability**

- Running level.

---

### `/money`

Change the current coin amount.

**Usage**

```text
/money {add|set} {number}
```

**Arguments**

- `add`: add or subtract an integer amount.
- `set`: set money directly.
- `number`: integer.

**Availability**

- Running level.

---

### `/lawnmower`

Trigger or reset lawn mowers.

**Usage**

```text
/lawnmower {trigger|reset}
/lawnmower {trigger|reset} {row}
```

**Arguments**

- `trigger`: trigger a lawn mower.
- `reset`: reset an already triggered lawn mower.
- `row`: row inside the current board bounds.

**Availability**

- Running level.

**Behavior**

- Without `row`, applies to all available lawn mowers.
- With `row`, applies only to that row.

**Failure Conditions**

- Fails when there is no applicable target.

## Debug Toggles

### `/hotkeys`

Toggle level keyboard shortcuts.

**Usage**

```text
/hotkeys {true|false}
```

**Availability**

- Any screen except startup loading.

**Persistence**

- Saved to local debug settings.

**Notes**

- `1 2 3 4 q w e r a s` selects seed slots or conveyor packets 1 through 10.
- `f` selects / cancels the shovel.
- `d` toggles between the current speed and `0`.

---

### `/cooldown`

Toggle seed packet cooldowns.

**Usage**

```text
/cooldown {true|false}
```

**Availability**

- Any screen except startup loading.

**Side Effects**

- Takes effect immediately in a level.
- Outside a level, only updates the setting; the next level uses it.

**Persistence**

- Saved to local debug settings.

---

### `/suncost`

Toggle planting sun costs.

**Usage**

```text
/suncost {true|false}
```

**Availability**

- Any screen except startup loading.

**Side Effects**

- Takes effect immediately in a level.
- Outside a level, only updates the setting; the next level uses it.

**Persistence**

- Saved to local debug settings.

---

### `/sunspawning`

Toggle natural falling sun for the current level.

**Usage**

```text
/sunspawning {true|false}
```

**Availability**

- Running level.

**Persistence**

- Not persisted.

---

### `/collect`

Set the collection mode for sun and coins. Level rewards are unaffected.

**Usage**

```text
/collect {auto|click|move}
```

**Arguments**

- `auto`: automatically collect sun and coins.
- `click`: collect sun and coins by clicking them.
- `move`: collect sun and coins when the mouse passes over them.

**Availability**

- Any screen except startup loading.

**Side Effects**

- Takes effect immediately in a level.
- Outside a level, only updates the setting; the next level uses it.

**Persistence**

- Saved to local debug settings.

---

### `/hitboxes`

Show or hide level collision debug boxes.

**Usage**

```text
/hitboxes {true|false}
```

**Availability**

- Any screen except startup loading.

**Behavior**

- Green boxes show body areas.
- Plant red boxes show target-search areas; ranged plants do not show red boxes.
- Zombie red boxes show bite attack areas.
- Projectiles and lawn mowers only show red boxes, representing their zombie-hit collision / attack areas.
- Debug boxes are drawn above the entity layer so they can be compared directly against the scene.

**Side Effects**

- Refreshes immediately in a level.
- Outside a level, only updates the setting; the next level uses it.

**Persistence**

- Saved to local debug settings.

**Notes**

- Dead plants, projectiles, and lawn mowers are not drawn.
- Zombies in `dying`, `mowered`, `charred`, or `burned` states are not drawn.
- This only affects debug drawing. It does not change collision behavior.

---

### `/background`

Show or hide widescreen side backgrounds.

**Usage**

```text
/background {true|false}
```

**Availability**

- Any screen except startup loading.

**Persistence**

- Saved to local debug settings.

---

### `/mobile`

Temporarily toggle mobile interaction mode. This does not spoof the device type; it only switches the project's internal mobile input and UI branches.

**Usage**

```text
/mobile {true|false}
```

**Availability**

- Any screen except startup loading.

**Behavior**

- `true`: uses touch input, disables mouse hover and right-click cancel logic.
- `true`: planting and shovel use touch press / drag / release confirmation, with the mobile grid guide.
- `true`: mobile buttons, shop, Almanac, and similar UI use touch states instead of mouse hover states.
- `true`: Debug CLI can be opened by double tapping the bottom-right screen area.
- `false`: uses desktop input, restoring mouse hover, right-click cancel, and mouse-move collection.

**Persistence**

- Not persisted. Refreshing returns to the platform default.

**Warning**

- On an actual mobile device, `/mobile false` switches to desktop input, but the device has no usable mouse input. Touch interaction will stop working until the game is restarted or refreshed.

---

### `/fullscreen`

Toggle fullscreen.

**Usage**

```text
/fullscreen {true|false}
```

**Availability**

- Any screen except startup loading.

**Failure Conditions**

- Native mobile builds cannot disable fullscreen.
- Browsers without fullscreen API support return a condition error.

**Persistence**

- Saved to normal game settings.

---

### `/music`

Set music volume.

**Usage**

```text
/music {0-100}
```

**Arguments**

- `0-100`: integer percentage.

**Availability**

- Any screen except startup loading.

**Persistence**

- Saved to normal game settings.

---

### `/sfx`

Set sound effect volume.

**Usage**

```text
/sfx {0-100}
```

**Arguments**

- `0-100`: integer percentage.

**Availability**

- Any screen except startup loading.

**Persistence**

- Saved to normal game settings.

---

### `/perf`

Temporarily toggle specific rendering, audio, or logic paths.

**Usage**

```text
/perf {plants|zombies|particles|sfx|logic} {true|false}
```

**Arguments**

- `plants`: show or hide plant nodes and projectile nodes. When `false`, plants and projectiles still exist in game logic but stop syncing to rendering.
- `zombies`: show or hide zombie nodes. When `false`, zombies still exist in game logic but stop syncing to rendering.
- `particles`: enable or disable gameplay particle systems, including combat particles and seed chooser tutorial arrows. This also affects whether particle systems are re-enabled when pausing / resuming animations.
- `sfx`: enable or disable sound-effect loading, playback, stopping, and volume update paths. Background music is unaffected.
- `logic`: enable or disable fixed-tick level updates. When `false`, current level combat logic stops advancing and accumulated ticks are cleared.

**Behavior**

- If currently in a level, rendering / particle state is refreshed immediately.
- `plants=false` and `zombies=false` only hide and skip render sync for those entities. They do not delete entities.
- `logic=false` is not the pause-menu state. It only prevents level logic ticks from running.

**Availability**

- Any screen except startup loading.

**Persistence**

- Not persisted.
