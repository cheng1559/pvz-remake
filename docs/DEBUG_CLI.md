# Debug CLI

In Debug and Release builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row; an omitted zombie row still follows the level's spawn-row selection.

`/level pvz:stress-test` starts a temporary level with 40 plants and spawns 160 zombies after 12 seconds. It does not overwrite the current adventure save. Use `/nextwave` to spawn them early; `/perf plants` and `/perf zombies` turn plant or zombie drawing off to isolate rendering, and on again.

Opening the CLI pauses gameplay and presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input and commands work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

See the [command table](DEBUG_CLI.zh-CN.md) for all command signatures. Common examples:

```text
/gamespeed 2
/tilted
/sharpness 0.5
/level pvz:seed-chooser-test
/haptics
/cursor
/highresolution
/fps
/plantinvincible
/cheatseed
/seed 1 snowpea
/mod
/sun set 999
/plant repeater 3 1
/zombie normal 3 9
/item award
/win
/goto main
```

The switches (the rules, `/hotkeys`, `/haptics`, `/cursor`, `/highresolution`, `/tilted`, `/fps`, `/hitboxes`, `/mobile`, `/fullscreen` and `/perf {category}`) take no state: each turns its switch over and shows where it now stands as advice, such as "Recharge: off".

`/haptics` turns all haptic feedback on or off immediately and saves the preference locally. Enabled by default.

`/cursor` switches between the original mouse cursors and the system ones: the original big arrow, a pointing hand over clickable objects and an open hand while dragging a dialog; text fields keep the system I-beam. Enabled by default and saved locally. `npm run build:content` extracts the images from the original executable into the base content; resource packs may replace them by ID.

The game is drawn as the original draws it: at one pixel to a unit of its 800x600 layout (as wide as the window makes it), with that picture enlarged over the window. The scene is still drawn once: its camera draws into the small picture and stays the one that takes the pointer (the engine's `Camera.presentedOnWindow`). `/highresolution` draws it straight to the window at the window's own pixels instead, where the same art is sharper than the original ever shows it. Off by default and saved locally.

`/fps` shows or hides a white frame-rate counter at the bottom left of the original 800×600 game area; widescreen expansion does not move it. It is off by default and persists locally. The counter measures drawn frames against real time, independent of game pause or speed.

`/plantinvincible` prevents or restores zombie bite damage to all current and newly planted plants. It defaults to off and persists locally across levels and restarts. Normal self-destruction, shoveling, and debug removal still work.

`/cheatseed` gives the seed chooser more pages, turned by two yellow `(Prev Page)` and `(Next Page)` buttons drawn as the original's cheat-key `(Debug Play)` button (FONT_BRIANNETOD12 in 255,240,0, lit 200,200,255) where the DLC puts its arrows beside Let's Rock, or by the mouse wheel over the chooser (a notch a page, both ways round from either end). Page 1 is the original grid with every seed in it, owned or not; next come each Mod's seeds, every Mod from a page of its own in the order they were installed, then the hidden cards (explode-o-nut, the bowling nuts, every zombie seed and the grave seed) on a page of their own, each card at its `position`, all on the plants' side. The same pages follow on the zombies' side, and a group past one page goes on to more pages. Cards on the side that is not their seed's own draw mirrored, and both sides of one seed can be chosen. Let's Rock starts with any cards chosen, the slots left over empty. These cards count towards the chooser's slots and whether it opens, so a first adventure's early levels open the chooser too. It defaults to off and persists locally; outside a level it only sets the preference. It turns in any state, the intro, a chooser and a finished level included; an open chooser takes it up at once. Mods may restyle the two buttons (`LevelSeedChooser.pageTurners`). It also opens the whole almanac: every plant and zombie is shown and described, and the plants' almanac turns, by Previous Page and Next Page beside Close (Next Page's image mirrored) or by the mouse wheel over its cards, to the same pages of Mod seeds and hidden cards, each with its cost and recharge (none for a seed without a cooldown), and its zombie or grave standing where a plant does; the hidden cards share a placeholder description (`ALMANAC_HIDDEN_DESCRIPTION`) in the middle of the box, and a Mod's plant has one when its text table holds `{nameKey}_DESCRIPTION_HEADER` and `_DESCRIPTION`. The almanac's entry points stay as they are.

`/plant {plant_name} {row} {col}` directly creates an installed plant, including Mod plants such as `/plant corn:cob_cannon 3 1`. It bypasses occupancy, upgrade prerequisites, seed-bank availability, sun cost, cooldown, tutorials and level phase/result restrictions. It preserves the held seed and initializes the plant's registered behavior normally. Only installed IDs and valid board coordinates are required; overlapping plants are saved normally. Mouse/touch planting keeps its usual rules.

`/repick` chooses the bank again in play: the level and its music stand still, the shovel leaves and the bank moves to its choosing place while the chooser drops in from the top, the camera staying put; there are no Almanac or Shop buttons, and the bank stays over the lawn's zombies, coins and sun. As in the intro's chooser, Space does not pause, while Escape and the Menu button still open the menu. Let's Rock lifts the chooser out and moves the bank back, and the level and its music go on once that is done. The bank's cards stay chosen, closed up over empty slots, and it keeps its size. Recharges follow Survival's repick: a card it held keeps its recharge, left in or chosen again, any other is ready, and no warning asks anything before Let's Rock. It works on a level that deals its bank too, which goes back to a dealt bank afterwards, but not on a conveyor. A repick is not saved: a save made during one holds the bank from before it (or, after Let's Rock, the bank chosen) and loads straight into play. With hotkeys on (`/hotkeys`), `R` runs it during play, and pressed again in the repick it is Let's Rock. `S` and `C` turn `/suncost` and `/cooldown` the other way, as typing them would.

`/seed {slot} {seed_name}` replaces a seed-bank slot, numbered from 1 on the left, with an installed seed, or fills it when empty; `/seed {slot} empty` empties it. The new packet is immediately ready and uses its own cost and cooldown. Replacing a held packet clears the cursor. A seed may appear in several slots, each with its own recharge. On a conveyor level the slots are the belt's packets from the left: a seed changes that packet where it stands, and `empty` takes it off, the ones after it closing up as the belt moves; the team works there too. The command is unavailable while the seed chooser is open. Changes work while paused or at zero speed and persist in the level save.

A seed packet shows its plant or zombie drawn by its view, on the pose the original's cached art has, with four samples to a screen pixel, which is what that cached art scaled into a packet comes to. `/tilted` enlarges the picture and rotates it clockwise: plants are clipped only at the image area's inner left and bottom borders, and the top and right sides may overflow. Backgrounds, costs and hit areas keep their original size, and the loaded picture is reused when the switch turns. The held and grid previews are never tilted. A seed whose plant no view draws yet shows the original's cached art. Off by default and saved locally.

`/sharpness {0-1}` sets how crisp an enlarged pixel is and saves it locally: the edge between two pixels blends over `1 - sharpness` screen pixels. `0` blends over a whole screen pixel (softest edges), `1` is close to nearest (crisp edges; at a non-integer scale pixels may differ in size by one); the default is 0.5. The pixels are those of the picture enlarged over the window. With `/highresolution` there is no such picture, and it applies to the base bitmap fonts: their glyphs are area sampled, so strokes stay even when shrunk, and whole-number scales are unaffected.

`/achievement give {achievement}` grants an achievement by ID (`pvz:` may be omitted, e.g. `sunny-days`). In a level the level grants it, so it is announced with its message and sound like a real one; outside a level it only goes into the profile and waits for the next award page. `/achievement reset [achievement]` forgets one, or every achievement without an ID.

`/mod` opens the common package manager and accepts no arguments. Use Import to select local ZIPs; installation progress is titled `Installing...`. Enable, disable, uninstall and reorder entries in the window, then Apply. Enabled-state or active-resource changes ask for a restart; confirming saves the running level and restarts the game. Cancel discards draft changes. Installed Mods persist independently of the original ZIP and can be updated with the same ID. Later Mods override matching resource IDs. Missing IDs use original resources; declared resources that fail to load do not fall back. ZIP is the only installation format; HD assets ship separately. Pico129 and Pix118Bold are excluded from the HD pack. See the [Mod guide](MODS.md) for the package format and installation.

The manager shows `Loading...` until the installed Mod list is ready. See [Mod installation](MODS.md).

The current package provides Adventure 1-1 through 2-6; plants Peashooter, Sunflower, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper, Repeater, Puff-shroom, Sun-shroom, Fume-shroom, Grave Buster, Hypno-shroom, Scaredy-shroom and Explode-o-nut (`explodenut`, debug only); zombies normal, flag, Conehead (`conehead`), Buckethead (`buckethead`), Pole Vaulting (`pole_vaulter`), Newspaper (`newspaper`), Screen Door (`screendoor`) and Football (`football`); sun and level awards. Completions use installed backend content. Wave commands report a condition failure when no matching waves remain; `/background` and unmigrated content remain unavailable. Main-menu widescreen support is an optional Mod.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world. Audio/fullscreen settings use the menu API. Cooldown, sun-cost, plant invincibility and collection preferences are reapplied to new sessions; outside a level these commands only set the preference.
