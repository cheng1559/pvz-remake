# Debug CLI

In Debug and Release builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row; an omitted zombie row still follows the level's spawn-row selection.

`/level pvz:stress-test` starts a temporary level with 40 plants and spawns 160 zombies after 12 seconds. It does not overwrite the current adventure save. Use `/nextwave` to spawn them early; `/perf plants false` and `/perf zombies false` isolate rendering, with `true` restoring visibility.

Opening the CLI pauses gameplay and presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input and commands work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

See the [command table](DEBUG_CLI.zh-CN.md) for all command signatures. Common examples:

```text
/gamespeed 2
/seedstyle tilted
/fontsharpness 0.5
/level pvz:seed-chooser-test
/haptics false
/cursor false
/fps true
/plantinvincible true
/seed 1 snowpea
/mod
/sun set 999
/plant repeater 3 1
/zombie normal 3 9
/item award
/win
/goto main
```

`/haptics true|false` toggles all haptic feedback immediately and saves the preference locally. Enabled by default.

`/cursor true|false` switches between the original mouse cursors and the system ones: the original big arrow, a pointing hand over clickable objects and an open hand while dragging a dialog; text fields keep the system I-beam. Enabled by default and saved locally. `npm run build:content` extracts the images from the original executable into the base content; resource packs may replace them by ID.

`/fps true|false` shows or hides a white frame-rate counter at the bottom left of the original 800×600 game area; widescreen expansion does not move it. It is off by default and persists locally. The counter measures drawn frames against real time, independent of game pause or speed.

`/plantinvincible true|false` prevents or restores zombie bite damage to all current and newly planted plants. It defaults to false and persists locally across levels and restarts. Normal self-destruction, shoveling, and debug removal still work.

`/plant {plant_name} {row} {col}` directly creates an installed plant, including Mod plants such as `/plant corn:cob_cannon 3 1`. It bypasses occupancy, upgrade prerequisites, seed-bank availability, sun cost, cooldown, tutorials and level phase/result restrictions. It preserves the held seed and initializes the plant's registered behavior normally. Only installed IDs and valid board coordinates are required; overlapping plants are saved normally. Mouse/touch planting keeps its usual rules.

`/repick` chooses the bank again in play: the level and its music stand still, the shovel leaves and the bank moves to its choosing place while the chooser drops in from the top, the camera staying put; there are no Almanac or Shop buttons, and the bank stays over the lawn's zombies, coins and sun. As in the intro's chooser, Space does not pause, while Escape and the Menu button still open the menu. Let's Rock lifts the chooser out and moves the bank back, and the level and its music go on once that is done. The bank's cards stay chosen, closed up over empty slots, and it keeps its size. Recharges follow Survival's repick: a card it held keeps its recharge, left in or chosen again, any other is ready, and there is no sun warning. It works on a level that deals its bank too, which goes back to a dealt bank afterwards, but not on a conveyor. A repick is not saved: a save made during one holds the bank from before it (or, after Let's Rock, the bank chosen) and loads straight into play.

`/seed {slot} {seed_name}` replaces a seed-bank slot, numbered from 1 on the left, with an installed seed, or fills it when empty; `/seed {slot} empty` empties it. The new packet is immediately ready and uses its own cost and cooldown. Replacing a held packet clears the cursor. A seed may appear in several slots, each with its own recharge. The command is unavailable while the seed chooser is open. Changes work while paused or at zero speed and persist in the level save.

`/seedstyle standard|rendered|tilted` independently selects the seed packet style and saves it locally. `standard` uses cached plant art; `rendered` uses the original Reanim pose; `tilted` enlarges that pose and rotates it clockwise. Plants are clipped only at the image area's inner left and bottom borders; the top and right sides may overflow. Backgrounds, costs and hit areas keep their original size. Switching between `rendered` and `tilted` reuses the loaded plant. Almanac zombie portraits and held/grid previews follow it too: `standard` uses the original cached art, the other two render the pose (previews are not tilted).

`/fontsharpness {0-1}` sets how crisp the base bitmap fonts are when magnified and saves it locally. Glyphs are area sampled, so strokes stay even when shrunk; magnified to a non-integer scale, an edge between two atlas pixels blends over `1 - sharpness` screen pixels. `0` is full area sampling (most even strokes, softest edges), `1` is close to nearest (crisp edges, strokes may differ by a pixel); the default is 0.5. Whole-number scales are unaffected.

`/achievement give {achievement}` grants an achievement by ID (`pvz:` may be omitted, e.g. `sunny-days`). In a level the level grants it, so it is announced with its message and sound like a real one; outside a level it only goes into the profile and waits for the next award page. `/achievement reset [achievement]` forgets one, or every achievement without an ID.

`/mod` opens the common package manager and accepts no arguments. Use Import to select local ZIPs; installation progress is titled `Installing...`. Enable, disable, uninstall and reorder entries in the window, then Apply. Enabled-state or active-resource changes ask for a restart; confirming saves the running level and restarts the game. Cancel discards draft changes. Installed Mods persist independently of the original ZIP and can be updated with the same ID. Later Mods override matching resource IDs. Missing IDs use original resources; declared resources that fail to load do not fall back. ZIP is the only installation format; HD assets ship separately. `/hdfont` has been removed; Pico129 and Pix118Bold are excluded from the HD pack. See [resource pack format and installation](RESOURCE_PACKS.md).

The manager shows `Loading...` until the installed Mod list is ready. See [Mod installation](MODS.md).

The current package provides Adventure 1-1 through 2-5; plants Peashooter, Sunflower, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper, Repeater, Puff-shroom, Sun-shroom, Fume-shroom, Grave Buster and Explode-o-nut (`explodenut`, debug only); zombies normal, flag, Conehead (`conehead`), Buckethead (`buckethead`), Pole Vaulting (`pole_vaulter`), Newspaper (`newspaper`) and Screen Door (`screendoor`); sun and level awards. Completions use installed backend content. Wave commands report a condition failure when no matching waves remain; `/background` and unmigrated content remain unavailable. Main-menu widescreen support is an optional Mod.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world. Audio/fullscreen settings use the menu API. Cooldown, sun-cost, plant invincibility and collection preferences are reapplied to new sessions.
