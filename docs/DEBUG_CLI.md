# Debug CLI

In Debug and Release builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row; an omitted zombie row still follows the level's spawn-row selection.

Opening the CLI pauses gameplay and presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input and commands work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

See the [command table](DEBUG_CLI.zh-CN.md) for all command signatures. Common examples:

```text
/gamespeed 2
/hdseed true
/seedstyle tilted
/level pvz:seed-chooser-test
/haptics false
/seed 1 snowpea
/pack
/pack install
/mod install
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

`/hdseed true` enables actual Reanim portraits for almanac plants and zombies, plus held/grid placement previews for implemented plants, and sets seed packets to `rendered`. `false` selects cached portraits and `standard` packets. Only the selected representation is created; failures report an error without falling back. This setting is saved locally. Seed background resolution is controlled by resource packs independently.

`/seedstyle standard|rendered|tilted` independently selects the seed packet style and saves it locally. `standard` uses cached plant art; `rendered` uses the original Reanim pose; `tilted` enlarges that pose and rotates it clockwise. Plants are clipped only at the image area's inner left and bottom borders; the top and right sides may overflow. Backgrounds, costs and hit areas keep their original size. Switching between `rendered` and `tilted` reuses the loaded plant. Almanac portraits and held/grid previews are unaffected.

`/pack install` takes no arguments and opens a local ZIP picker in Web and macOS builds. Its dialog shows only `Installing...`. Installation, updates and enabled-state changes ask for a restart; confirming immediately restarts the entire game after saving the running level. Current resources remain unchanged until restart. Installed packs persist independently of the original ZIP and can be updated with the same ID. `/pack load hd` enables an installed pack; `/pack unload hd` disables it; `/pack uninstall hd` deletes it and also asks for a restart if it was enabled. Repeated enable/disable commands do not prompt. `/pack list` lists enabled packs. Later packs override matching IDs, including Mod IDs. Missing IDs use original resources; failed pack resources do not fall back. ZIP is the only installation format; HD assets ship separately. `/hdfont` has been removed; Pico129 and Pix118Bold are excluded from the HD pack. See [resource pack format and installation](RESOURCE_PACKS.md).

Without arguments, `/pack` and `/mod` open the resource pack or Mod manager window: import ZIPs, uninstall from each row, toggle enabled state, reorder pack priority, and Apply to save and confirm a restart. `/mod` uses the same `install`, `load`, `unload`, `uninstall`, and `list` operations and restart dialogs. `/mod install` selects a Mod ZIP without arguments; use qualified IDs such as `local:widescreen` for other operations. Installed Mods persist locally, validate their dependencies, and execute only after restart. See [Mod installation](MODS.md).

The current package provides Adventure 1-1 and 1-2; plants Peashooter, Sunflower, Repeater, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper and Explode-o-nut (`explodenut`, debug only); zombies normal, flag, Conehead (`conehead`), Buckethead (`buckethead`) and Pole Vaulting (`pole_vaulter`); sun and level awards. Completions use installed backend content. Wave commands report a condition failure when no matching waves remain; `/background` and unmigrated content remain unavailable. Main-menu widescreen support is an optional Mod.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world. Audio/fullscreen settings use the menu API. Cooldown, sun-cost and collection preferences are reapplied to new sessions.
