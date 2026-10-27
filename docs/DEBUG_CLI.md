# Debug CLI

In Debug and Release builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row; an omitted zombie row still follows the level's spawn-row selection.

Opening the CLI pauses gameplay and presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input and commands work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

See the [command table](DEBUG_CLI.zh-CN.md) for all command signatures. Common examples:

```text
/gamespeed 2
/seedstyle tilted
/level pvz:seed-chooser-test
/haptics false
/seed 1 snowpea
/mod
/sun set 999
/plant repeater 3 1
/zombie normal 3 9
/item award
/win
/home
```

`/haptics true|false` toggles all haptic feedback immediately and saves the preference locally. Enabled by default.

`/plant {plant_name} {row} {col}` directly creates an installed plant, including Mod plants such as `/plant corn:cob_cannon 3 1`. It bypasses occupancy, upgrade prerequisites, seed-bank availability, sun cost, cooldown, tutorials and level phase/result restrictions. It preserves the held seed and initializes the plant's registered behavior normally. Only installed IDs and valid board coordinates are required; overlapping plants are saved normally. Mouse/touch planting keeps its usual rules.

`/seed {slot} {seed_name}` replaces a seed-bank slot, numbered from 1 on the left, with an installed seed. The new packet is immediately ready and uses its own cost and cooldown. Replacing a held packet clears the cursor; duplicates in other slots are rejected. Changes work while paused or at zero speed and persist in the level save.

`/seedstyle standard|rendered|tilted` independently selects the seed packet style and saves it locally. `standard` uses cached plant art; `rendered` uses the original Reanim pose; `tilted` enlarges that pose and rotates it clockwise. Plants are clipped only at the image area's inner left and bottom borders; the top and right sides may overflow. Backgrounds, costs and hit areas keep their original size. Switching between `rendered` and `tilted` reuses the loaded plant. Almanac portraits and held/grid previews are unaffected.

`/mod` opens the common package manager and accepts no arguments. Use Import to select local ZIPs; installation progress is titled `Installing...`. Enable, disable, uninstall and reorder entries in the window, then Apply. Enabled-state or active-resource changes ask for a restart; confirming saves the running level and restarts the game. Cancel discards draft changes. Installed Mods persist independently of the original ZIP and can be updated with the same ID. Later Mods override matching resource IDs. Missing IDs use original resources; declared resources that fail to load do not fall back. ZIP is the only installation format; HD assets ship separately. `/hdfont` has been removed; Pico129 and Pix118Bold are excluded from the HD pack. See [resource pack format and installation](RESOURCE_PACKS.md).

The manager shows `Loading...` until the installed Mod list is ready. See [Mod installation](MODS.md).

The current package provides Adventure 1-1 through 1-10; plants Peashooter, Sunflower, Repeater, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper and Explode-o-nut (`explodenut`, debug only); zombies normal, flag, Conehead (`conehead`), Buckethead (`buckethead`) and Pole Vaulting (`pole_vaulter`); sun and level awards. Completions use installed backend content. Wave commands report a condition failure when no matching waves remain; `/background` and unmigrated content remain unavailable. Main-menu widescreen support is an optional Mod.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world. Audio/fullscreen settings use the menu API. Cooldown, sun-cost and collection preferences are reapplied to new sessions.
