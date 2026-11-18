# Debug CLI

In Debug and Release builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions of commands and installed content, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, and entity names also ignore spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row, whatever rows the level has active; an omitted zombie row still follows the level's spawn-row selection.

Opening the CLI pauses gameplay and global presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input, commands and closing the CLI all work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

| Purpose | Command |
| --- | --- |
| Pages | `/goto {page}`: `main`, `minigames`, `puzzle`, `survival`, `almanac`, `plants`, `zombies`, `store`, `garden`, `mushroom`, `aquarium`, `tree`, `achievements`, `help` |
| Levels | `/level 1-1`, `/restart`; both skip the prompt about an existing save |
| Seed chooser test | `/level pvz:seed-chooser-test`: choose 6 cards from the 9 implemented plants, and confirming enters the test level |
| Teams demo | `/level pvz:teams-demo` starts a temporary level that does not overwrite the adventure save and grants no achievements. The plants' own plants stand ready on the left, and columns 6–8 on the right hold 9 zombies' side plants facing left (Peashooter, Snow Pea, Wall-nut, Chomper, Potato Mine, Explode-o-nut); the two sides attack each other while 4 waves of normal zombies come from the right through the zombies' side plants. 1000 sun and a fixed bank of 8 cards. Put down a plants' side zombie there with `/zombie normal 3 1 plants`; see [Teams](TEAMS.md) |
| Stress test | `/level pvz:stress-test` starts a temporary level with 40 plants and spawns 160 zombies after 12 seconds. It does not overwrite the current adventure save. Use `/nextwave` to spawn them early; `/perf plants` and `/perf zombies` turn plant or zombie drawing off to isolate rendering, and on again |
| App | `/reload`, `/quit` |
| Speed | `/gamespeed {0-10}`, applied to the unified game clock |
| Win, loss and waves | `/win`, `/lose`, `/nextwave`, `/nextflag` (see below) |
| Plants | `/plant {plant_name} {row} {col} [team]` creates a plant. A `team` of `zombies` creates a left-facing plant that fights for the zombies. `/removeplant {row} {col}` removes a plant if present and also succeeds on an empty cell. See [Teams](TEAMS.md). |
| Grid items | `/griditem {type} {row} {col} [team]` replaces any grave or crater in the cell and clears plants occupying it. A new grave starts rising and a new crater starts with its seed's full lifetime. Graves default to the zombies' side and craters to the plants' side. Both persist in the level save. |
| Raise grave zombies | `/gravezombies` immediately raises one zombie from each grave, including newly placed graves and graves on a lawn with a dropped award. Each grave picks from the level's weighted pool and raises the zombie on its own side. An empty lawn or pool yields zero zombies. The rise animation takes 150 gameplay ticks and advances on resume if paused. The natural final wave opens fully risen graves after 200 ticks if the award has yet to drop. |
| Seed packets | `/seed {slot} {seed_name} [team]`, such as `/seed 1 snowpea`; a `team` other than the seed's own makes the packet put down the other side's; see below and [Teams](TEAMS.md) |
| Repick | `/repick` chooses the bank again during a level (see below) |
| Zombies | `/zombie {zombie_name} [row] [col] [team]`, `/damage {damage}`, `/kill`. A `team` of `plants` creates a plants' side zombie, which walks right and bites the zombies' side as they bite it; it is not mind-controlled, so it is not purple; see [Teams](TEAMS.md) |
| Drops | `/item {item_name} [row col]` drops an installed item as zombie loot. With `award`, each call drops another copy of the level reward at the current wave and tutorial step. Collecting one wins the level. |
| Values | `/sun {add\|set} {number}`, `/money {add\|set} {number}` (money counts the original's coins, 1 coin = $10, and is written to the profile as well; outside a level it changes the profile directly, and in a level it also works during the intro; after a change the coin bank shows as when coins are collected, during the intro only once Crazy Dave appears) |
| Lawn mowers | `/lawnmower {trigger\|reset} [row]` |
| Rules | `/cooldown`, `/suncost`, `/plantinvincible`, `/cheatseed` |
| Collection | `/collect {auto\|click\|move}`; auto and move collection handle ordinary drops only |
| Achievements | `/achievement give {achievement}`, `/achievement reset [achievement]` (see below) |
| Hotkeys | `/hotkeys`; `1`–`9` and `0` pick the matching slot of the seed bank or the conveyor, `F` picks up or puts back the shovel (holding a plant, it swaps straight to the shovel, as the number keys swap packets), `D` turns zero speed on and off, `R` runs `/repick` and, pressed again in the repick, is Let's Rock, and `S` and `C` turn `/suncost` and `/cooldown` the other way, as typing them would |
| Haptics | `/haptics`, on by default, applies immediately and is saved locally |
| Original cursors | `/cursor`, on by default, applies immediately and is saved locally |
| Frame rate | `/fps` shows or hides the live frame rate at the bottom left of the original 800×600 game area |
| Hitboxes | `/hitboxes` |
| Tilted seed packets | `/tilted`, off by default, applies immediately and is saved locally |
| High resolution | `/highresolution`, off by default, applies immediately and is saved locally |
| Sharpness | `/sharpness {0-1}`, 0.5 by default, applies immediately and is saved locally |
| Mods (resource packs included) | `/mod` (the manager window, no arguments) |
| Performance | `/perf {plants\|zombies\|particles\|sfx\|logic}` |
| Platform | `/mobile`, `/fullscreen` |
| Volume | `/music {0-100}`, `/sfx {0-100}`, saved through the settings API |

Common examples:

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

`/plantinvincible` turns plant invincibility on or off. While it is on, plants lose no health to zombie bites or to hostile plants' attacks (shots, blasts, fumes, bowled nuts, a hostile Ice-shroom's ice), though a hostile Snow Pea's chill still slows them and a hostile Ice-shroom still freezes them, and lawn mowers no longer crush hostile plants. A Hypno-shroom still turns the zombie that chews it, or the hostile plant that bites it, and is gone; a hostile Chomper still swallows a plant whole. It applies to current and newly planted plants, defaults to off and persists locally across levels and restarts. A plant's own self-destruction, shoveling and `/removeplant` still work.

`/cheatseed` gives the seed chooser more pages, turned by two yellow `(Prev Page)` and `(Next Page)` buttons drawn as the original's cheat-key `(Debug Play)` button (FONT_BRIANNETOD12 in 255,240,0, lit 200,200,255) where the DLC puts its arrows beside Let's Rock, or by the mouse wheel over the chooser (a notch a page, both ways round from either end). Page 1 is the original grid with every seed in it, owned or not; next come each Mod's seeds, every Mod from a page of its own in the order the Mods load, then the hidden cards (explode-o-nut, the bowling nuts, every zombie seed, the grave seed and the crater seed) on a page of their own, each card at its `position`, on the plants' side (the crater seed is the plants' own). The same pages follow on the zombies' side, and a group past one page goes on to more pages. Cards on the side that is not their seed's own draw mirrored, and both sides of one seed can be chosen. The slots need not all be filled: Let's Rock starts with any cards chosen, at least one, the slots left over empty. These cards count towards the chooser's slots and whether it opens, so a first adventure's early levels open the chooser too. It defaults to off and persists locally; outside a level it only sets the preference. It turns in any state, the intro, a chooser and a finished level included; an open chooser takes it up at once. Mods may restyle the two buttons (`LevelSeedChooser.pageTurners`). It also opens the whole almanac: every plant and zombie is shown and described. When the plants' almanac has more than one page, Previous Page and Next Page appear to the left of Close (Next Page's image mirrored); they, or the mouse wheel over its cards, turn it to the same pages of Mod seeds and hidden cards, each with its cost and recharge (none for a seed without a cooldown), and its zombie or grave standing where a plant does; the hidden cards share a placeholder description (`ALMANAC_HIDDEN_DESCRIPTION`) in the middle of the box, and a Mod's plant has one when its text table holds `{nameKey}_DESCRIPTION_HEADER` and `_DESCRIPTION`. The almanac's entry points stay as they are.

`/plant {plant_name} {row} {col}` directly creates an installed plant, including Mod plants such as `/plant corn:cob_cannon 3 1`. It bypasses occupancy, upgrade prerequisites, seed-bank availability, sun cost, cooldown, tutorials and level phase/result restrictions. It preserves the held seed and initializes the plant's registered behavior normally. Only installed IDs and valid board coordinates are required; overlapping plants are saved normally. Mouse/touch planting keeps its usual rules.

`/repick` chooses the bank again in play: the level and its music stand still, the shovel leaves and the bank moves to its choosing place while the chooser drops in from the top, the camera staying put; there are no Almanac or Shop buttons, and the bank stays over the lawn's zombies, coins and sun. As in the intro's chooser, Space does not pause, while Escape and the Menu button still open the menu. Let's Rock lifts the chooser out and moves the bank back, and the level and its music go on once that is done. The bank's cards stay chosen, closed up over empty slots, and it keeps its size. Recharges follow Survival's repick: a card it held keeps its recharge, left in or chosen again, any other is ready, and no chooser warning asks anything before Let's Rock, neither the one for a missing sun producer nor the level's own tutorial warnings. It works on a level that deals its bank too, which goes back to a dealt bank afterwards, but not on a conveyor. A repick is not saved: a save made during one holds the bank from before it (or, after Let's Rock, the bank chosen) and loads straight into play. With hotkeys on (`/hotkeys`), `R` runs it during play, and pressed again in the repick it is Let's Rock. `S` and `C` turn `/suncost` and `/cooldown` the other way, as typing them would.

`/seed {slot} {seed_name} [team]` replaces a seed-bank slot, numbered from 1 on the left, with an installed seed, or fills it when empty; `/seed {slot} empty` empties it. The new packet is immediately ready and uses its own cost and cooldown. The seed may be a zombie seed, such as `/seed 1 normal`, which puts down an enemy zombie. A `team` other than the seed's own makes the packet put down the other side's, drawn mirrored in the packet, in hand and in the placement preview: a plant seed with `zombies` plants a zombies' side plant (it costs sun, recharges and follows the planting rules as usual, but cannot be shoveled), a zombie seed with `plants` puts down a zombie on the plants' side (not mind-controlled, so not purple), the grave seed with `plants` a grave on the plants' side, and the crater seed (`/seed 1 crater`, the plants' own: a crater in any cell but one with a crater or a grave, the plants there dying) with `zombies` a crater drawn turned round; leaving `team` out, or giving the seed's own, restores the default. See [Teams](TEAMS.md). Replacing a held packet clears the cursor. A seed may appear in several slots, each with its own recharge. On a conveyor level the slots are the belt's packets from the left: a seed changes that packet where it stands, and `empty` takes it off, the ones after it closing up as the belt moves; `team` works there too. The command becomes available when gameplay starts. During a repick it becomes available again once the chooser closes. Changes work while paused or at zero speed and persist in the level save.

`/nextwave` spawns the next wave at once; a flag wave it reaches before its huge-wave warning also shows the warning and plays its sound. `/nextflag` skips to the next flag wave, leaving out the waves before it: if no huge-wave countdown is running, it starts that wave's with the warning, and the wave comes 750 ticks later; if one is running, it ends it and the wave spawns at once (the original's `/` cheat key in `Board::KeyChar`). Each reports a condition failure when no such wave remains.

A seed packet shows its plant or zombie drawn by its view, on the pose the original's cached art has, with four samples to a screen pixel, which is what that cached art scaled into a packet comes to. `/tilted` enlarges the picture and rotates it clockwise: plants are clipped only at the image area's inner left and bottom borders, and the top and right sides may overflow. Backgrounds, costs and hit areas keep their original size, and the loaded picture is reused when the switch turns. The held and grid previews are never tilted. A seed whose plant no view draws yet shows the original's cached art. Off by default and saved locally.

`/sharpness {0-1}` sets how crisp an enlarged pixel is and saves it locally: the edge between two pixels blends over `1 - sharpness` screen pixels. `0` blends over a whole screen pixel (softest edges), `1` is close to nearest (crisp edges; at a non-integer scale pixels may differ in size by one); the default is 0.5. The pixels are those of the picture enlarged over the window. With `/highresolution` there is no such picture, and it applies to the base bitmap fonts: their glyphs are area sampled, so strokes stay even when shrunk, and whole-number scales are unaffected.

`/achievement give {achievement}` grants an achievement by ID (`pvz:` may be omitted, e.g. `sunny-days`). In a level the level grants it, so it is announced with its message and sound like a real one; outside a level it only goes into the profile and waits for the next award page. `/achievement reset [achievement]` forgets one, or every achievement without an ID.

`/mod` opens the common package manager, the only management entry, and accepts no arguments. Use Import to select local ZIPs; installation progress is titled `Installing...`. Enable, disable, uninstall and reorder entries (their priority) in the window, then Apply. Enabled-state or active-resource changes ask for a restart; confirming saves the running level and restarts the game, and the running code and resources stay in use until the restart. Cancel discards draft changes. Installed Mods persist locally, independently of the original ZIP, and can be updated with the same ID. Later, higher-priority Mods override matching resource IDs. Missing IDs use original resources; declared resources that fail to load do not fall back. ZIP is the only installation format; the game has no built-in HD assets, which ship separately. Pico129 and Pix118Bold are excluded from the HD pack. See the [Mod guide](MODS.md) for the package format and installation.

The manager shows `Loading...` until the installed Mod list is ready. See [Mod installation](MODS.md).

The current package provides Adventure 1-1 through 2-10; plants Peashooter, Sunflower, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper, Repeater, Puff-shroom, Sun-shroom, Fume-shroom, Grave Buster, Hypno-shroom, Scaredy-shroom, Ice-shroom, Doom-shroom, Lily Pad and Explode-o-nut (`explodenut`, debug only); zombies normal, flag, Conehead (`conehead`), Buckethead (`buckethead`), Pole Vaulting (`pole_vaulter`), Newspaper (`newspaper`), Screen Door (`screendoor`), Football (`football`), Dancing (`dancer`) and Backup Dancer (`backup_dancer`); sun and level awards. Plant, zombie, item and level completions use installed backend content. Wave commands report a condition failure when no matching waves remain; unmigrated content remains unavailable. Main-menu widescreen support is an optional Mod.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world, never the client's snapshot directly. Audio/fullscreen settings use the menu API. The rule switches act on the backend session; cooldown, sun-cost, plant invincibility and collection preferences are also kept as debug preferences and reapplied to new sessions; outside a level these commands only set the preference.
