[简体中文](DEBUG_CLI.zh-CN.md)

# Debug Console

The debug console tests levels, changes the state of the game and switches display and input options. It is available in Debug and Release builds on every platform.

## Opening and closing

| Action | How |
| --- | --- |
| Open with a keyboard | Press `/` while no text field has focus |
| Open by touch | On a mobile device, or with mobile controls on (`/mobile`), double-tap the bottom-right corner of the window (100 × 100 CSS pixels) within 350 ms |
| Run the command | Enter, or the OK button |
| Close without running | Escape, the Cancel button, or deleting the whole line, leading slash included |

The console cannot open while the game is starting up or while a Mod error dialog is shown.

Opening the console pauses the level and the game clock, which drives both gameplay and presentation. Closing it restores the pause state from before, and keeps any new `/gamespeed` setting. Typing, running commands and closing the console all work at speed 0.

## Typing commands

- The line opens with `/`. The slash is optional.
- Only printable ASCII characters are accepted, up to 120 of them.
- Command names and fixed values ignore case. Names of plants, seeds, zombies, items and achievements also ignore spaces, underscores and hyphens, and the base game's `pvz:` prefix may be left out: `snowpea`, `Snow_Pea` and `pvz:snowpea` are the same. Content from other Mods needs its namespace, such as `corn:cob_cannon`.
- Arguments are separated by spaces. An argument may be quoted with `"…"` or `'…'`.
- In the syntax below, `{value}` is required, `[value]` is optional and `a|b` lists the accepted values. Optional arguments are positional: to give `[team]`, give every argument before it.
- Rows, columns and seed slots count from 1. An explicit row may be any row of the board, whatever rows the level has active.

### Completion and history

- Tab completes the word at the end of the line; pressing it again cycles through the candidates.
- Command names and fixed values (pages, `add|set`, teams and so on) complete anywhere. Names of installed plants, seeds, zombies, items and levels complete only in a level, because the running level supplies them.
- A faded suffix after the text shows the first completion, followed by the placeholders of the remaining arguments as hints. In mobile mode, tap the faded suffix to fill it in and keep typing.
- Up and Down recall the last 64 commands. The history is kept on this device across restarts; running a command again moves it to the newest place.

### Results

| Result | What happens |
| --- | --- |
| Success | The console closes. A switch shows its new state on screen, such as "Recharge: off"; other success messages go only to the log, prefixed with `[Debug CLI]`. |
| Syntax error: an unknown command, the wrong number of arguments, or a value that is not accepted or out of range | The line flashes red with the buzzer sound and stays open for correction. |
| Unmet condition: no level running, content not installed, no wave left and so on | The console closes with the buzzer sound and shows the reason on screen. |

### Where commands work

- Commands for pages, levels, the app, speed, volume, display and input work anywhere; only `/restart` needs a running level.
- Most board commands need a level in play: past the intro and the seed chooser, and neither won nor lost. Elsewhere they report "/… requires an active level".
- `/plant` works in any state of a level: during the intro, in the seed chooser and after the result.
- `/money` and `/achievement` also work during the intro. `/money` outside a level and `/achievement` anywhere need a player profile.
- The rule switches (`/cooldown`, `/suncost`, `/plantinvincible`, `/cheatseed`) and `/collect` work in any state of a level. Outside a level they only set the preference for the levels to come.
- Commands work while the level is paused and at speed 0.

## Examples

| Example | Effect |
| --- | --- |
| `/level 1-1` | Starts Adventure 1-1 afresh |
| `/level pvz:seed-chooser-test` | Starts the seed chooser test level |
| `/gamespeed 2` | Runs the game at double speed |
| `/sun set 999` | Sets the sun to 999 |
| `/seed 1 snowpea` | Puts a Snow Pea in seed slot 1, ready at once |
| `/plant repeater 3 1` | Creates a Repeater in row 3, column 1 |
| `/zombie normal 3 9` | Puts a Zombie down in row 3, column 9 |
| `/zombie normal 3 1 plants` | Puts a plants' side Zombie down in row 3, column 1 |
| `/item award` | Drops the level's award |
| `/plantinvincible`, `/cheatseed`, `/tilted`, `/highresolution`, `/haptics`, `/cursor`, `/fps` | Turn these switches over |
| `/sharpness 0.5` | Sets the sharpness back to its default |
| `/mod` | Opens the Mod manager |
| `/win` | Wins the level |
| `/goto main` | Opens the main menu |

## Commands

### Pages, levels and the app

| Command | Effect |
| --- | --- |
| `/goto {page}` | Opens a menu page: `main` (main menu), `minigames`, `puzzle`, `survival`, `almanac` (the almanac index), `plants` and `zombies` (the almanac's pages), `store`, `garden` (Zen Garden), `mushroom` (Mushroom Garden), `aquarium` (Aquarium Garden), `tree` (Tree of Wisdom), `achievements`, `help` |
| `/level {level}` | Starts a level afresh, skipping the prompt about an existing save. Adventure levels take their number: `1-1`, `adventure-1-1` and `pvz:adventure-1-1` are the same. Other levels take their full ID, namespace included, such as `pvz:stress-test`. In a level, a level that is not installed is refused. |
| `/restart` | Starts the current level afresh, skipping the prompt about an existing save; needs a running level |
| `/reload` | Saves the running level and starts the game again from the splash screen |
| `/quit` | Saves the running level and quits the game |

Starting an ordinary level with `/level` or `/restart` replaces the current level save. A temporary level keeps it: the running level is saved first, the temporary level itself is never saved, and finishing it, won or lost, returns to the main menu with no award and no Adventure progress.

#### Test levels

| Level | Content |
| --- | --- |
| `pvz:teams-demo` | A temporary level that grants no achievements. Day lawn, 1000 sun and a fixed bank of 8 cards. On the left, every row has the plants' side's Sunflower and a shooter ready. Columns 7–9 on the right hold 9 zombies' side plants facing left (Peashooter, Repeater, Snow Pea, Wall-nut, Chomper, Potato Mine, Explode-o-nut). The two sides attack each other while 4 waves of zombies (Zombie, Conehead, Buckethead; the last is a flag wave) come from the right through the zombies' side plants. Put down a plants' side zombie there with `/zombie normal 3 1 plants`. See [Teams and the Hypno-shroom](TEAMS.md). |
| `pvz:stress-test` | A temporary level that grants no achievements. Day lawn and 9990 sun, with 40 plants already placed (8 in each row) and 1023 zombies spawned as play begins. `/perf plants` and `/perf zombies` turn plant or zombie drawing off, and on again, to isolate rendering. |
| `pvz:seed-chooser-test` | A level on the day lawn with 50 sun and 3 waves that grants no achievements. It has no fixed bank, so its bank starts by the original's rule: the seed chooser opens when the player owns more seeds than the bank has slots (6, plus any bought), and confirming starts the level; otherwise the bank holds every owned seed. It is not temporary: it replaces the level save, and winning it awards the Repeater and moves Adventure on to level 1-10 if it was not already past it. |

### Speed, waves and results

| Command | Effect |
| --- | --- |
| `/gamespeed {0-10}` | Sets the speed of the game clock, which drives gameplay and presentation alike. Any number from 0 to 10 is accepted, decimals included; `0` freezes the game. The speed lasts until the game restarts. |
| `/win` | Wins the level at once |
| `/lose` | Loses the level at once |
| `/nextwave` | Spawns the next wave at once |
| `/nextflag` | Skips to the next flag wave |
| `/repick` | Chooses the bank again during the level |

#### Waves

- `/nextwave` spawns the next wave at once. A flag wave it reaches before its huge-wave warning also shows the warning and plays its sound.
- `/nextflag` skips to the next flag wave, leaving out the waves before it. If no huge-wave countdown is running, it starts that wave's countdown with the warning, and the wave comes 750 ticks (7.5 seconds at normal speed) later. If a countdown is running, it ends it and the wave spawns at once. This is the original's `/` cheat key in `Board::KeyChar`.
- Each reports an unmet condition when no such wave remains ("No remaining zombie waves", "No remaining flag waves").

#### Repick

`/repick` chooses the bank again in play:

- The level and its music stand still. The shovel leaves and the bank moves to its choosing place while the seed chooser drops in from the top; the camera stays put. There are no Almanac or Shop buttons, and the bank stays over the lawn's zombies, coins and sun.
- As in the intro's chooser, Space does not pause, while Escape and the Menu button still open the menu.
- Let's Rock lifts the chooser out and moves the bank back, and the level and its music go on once that is done. The bank's cards stay chosen, closed up over empty slots, and the bank keeps its size.
- Recharges follow Survival's repick: a card the bank held keeps its recharge, whether left in or chosen again, and any other card is ready. No chooser warning asks anything before Let's Rock, neither the one for a missing sun producer nor the level's own tutorial warnings.
- It works on a level that deals its bank too, which goes back to a dealt bank afterwards, but not on a conveyor-belt level or a level without a bank ("This level has no seed bank to choose again"), and not while seeds are being chosen ("Finish choosing seeds first").
- A repick is not saved: a save made during one holds the bank from before it (or, after Let's Rock, the bank chosen) and loads straight into play.
- With hotkeys on (`/hotkeys`), `R` runs it during play, and pressed again in the repick it is Let's Rock.

### Plants, zombies and the lawn

| Command | Effect |
| --- | --- |
| `/plant {plant_name} {row} {col} [team]` | Creates a plant in a cell. `team` is `plants` (the default) or `zombies`. |
| `/removeplant {row} {col}` | Removes the plant in a cell; also succeeds on an empty cell |
| `/zombie {zombie_name} [row] [col] [team]` | Creates a zombie. `team` is `zombies` (the default) or `plants`. |
| `/damage {damage}` | Deals the damage, a positive integer, to every zombie on the lawn, on either side |
| `/kill` | Removes every zombie from the lawn at once, on either side |
| `/griditem {grave\|crater} {row} {col} [team]` | Places a grave or a crater in a cell |
| `/gravezombies` | Raises a zombie from every grave at once |
| `/lawnmower {trigger\|reset} [row]` | Sets off or resets the lawn mower of one row, or of every active row |

#### `/plant`

- It creates an installed plant directly, including Mod plants such as `/plant corn:cob_cannon 3 1`. The name is a plant seed's ID, hidden ones included (`explodenut`, `bowling-wallnut`, `bowling-explodenut`).
- It bypasses occupancy, upgrade prerequisites, seed-bank availability, sun cost, recharge, tutorials and the level's phase and result. It keeps the held seed and initializes the plant's registered behaviour normally.
- Only an installed ID and a valid board position are required; overlapping plants are saved normally.
- A `team` of `zombies` creates a left-facing plant that fights for the zombies. See [Teams and the Hypno-shroom](TEAMS.md).
- A plant created this way is not the player's planting, so achievements that depend on what the player plants ignore it. See [Achievements](ACHIEVEMENTS.md).
- Planting with the mouse or by touch keeps its usual rules.

#### `/zombie`

- Without a row, the zombie goes in a random one of the level's active rows.
- With a row and no column, it enters at the right edge of the row, as a wave's zombies do. With a column, it is put down in that cell, as a zombie seed's zombie is.
- A `team` of `plants` creates a plants' side zombie, which walks right and bites the zombies' side as they bite it. It is not mind-controlled, so it is not purple. See [Teams and the Hypno-shroom](TEAMS.md).

#### Graves and craters

- `/griditem` replaces any grave or crater in the cell and clears the plants occupying it.
- A new grave starts rising. A new crater starts with its seed's full lifetime and needs the crater seed to be installed.
- Graves default to the zombies' side and craters to the plants' side; a plants' side grave raises plants' side zombies. Both persist in the level save.
- `/gravezombies` immediately raises one zombie from each grave, including newly placed graves and graves on a lawn where the award has dropped. Each grave picks from the level's weighted pool and raises the zombie on its own side. An empty lawn or an empty pool raises no zombies.
- The rise takes 150 gameplay ticks; if the game is paused, it advances on resume.
- Independently of the command, the level's final wave opens the fully risen graves 200 ticks after it starts, if the award has yet to drop.

#### Lawn mowers

- `trigger` sets off the waiting lawn mower of the row, or of every active row.
- `reset` puts a new lawn mower down in the row, or in every active row, whose mower has gone, whatever that one is still doing.
- When no mower changes, the command reports "No lawn mowers could be changed".

### Seeds, sun, coins, drops and achievements

| Command | Effect |
| --- | --- |
| `/seed {slot} {seed_name} [team]` | Puts a seed in a seed slot, ready at once |
| `/seed {slot} empty` | Empties a seed slot |
| `/sun {add\|set} {number}` | Adds or sets sun, kept within 0–9990 |
| `/money {add\|set} {number}` | Adds or sets coins, kept within 0–99999, in the player profile as well |
| `/item {item_name} [row col]` | Drops an installed item as zombie loot |
| `/item award` | Drops another copy of the level's award |
| `/achievement give {achievement}` | Grants an achievement |
| `/achievement reset [achievement]` | Forgets one achievement, or every achievement |

#### `/seed`

- It replaces the packet in a seed slot, numbered from 1 on the left, with an installed seed, or fills the slot when it is empty. `/seed {slot} empty` empties it. A slot outside the bank reports the slots there are ("Use slot 1-6").
- The new packet is immediately ready and uses its own cost and recharge.
- The seed may be a zombie seed, such as `/seed 1 normal`, which puts down a hostile zombie.
- A `team` other than the seed's own makes the packet put down the other side's, drawn mirrored in the packet, in hand and in the placement preview:
  - a plant seed with `zombies` plants a zombies' side plant, which costs sun, recharges and follows the planting rules as usual, but cannot be shoveled;
  - a zombie seed with `plants` puts down a zombie on the plants' side, which is not mind-controlled and so not purple;
  - the grave seed with `plants` puts down a grave on the plants' side;
  - the crater seed (`/seed 1 crater`) is the plants' own: it makes a crater in any cell but one with a crater or a grave, and the plants there die; with `zombies` it makes a crater drawn turned round;
  - leaving `team` out, or giving the seed's own side, restores the default.

  See [Teams and the Hypno-shroom](TEAMS.md).
- Replacing a held packet clears the cursor. A seed may appear in several slots, each with its own recharge.
- On a conveyor-belt level the slots are the belt's packets from the left. A seed changes that packet where it stands, and `empty` takes it off, the packets after it closing up as the belt moves; `team` works there too.
- The command becomes available when gameplay starts; during a repick, once the seed chooser has closed. Changes work while paused or at speed 0 and persist in the level save.

#### `/sun` and `/money`

- The number is an integer; with `add`, a negative number takes away. The result is kept within 0 and the maximum.
- `/sun` needs a level in play.
- `/money` counts the original's coins: 1 coin is $10, so `/money set 100` shows $1,000. It is written to the player profile as well. Outside a level it changes the profile directly; in a level it also works during the intro. After a change the coin bank shows, as when coins are collected; during the intro, only once Crazy Dave appears.

#### `/item`

- It drops an installed item as zombie loot: `sun`, `smallsun`, `coin_silver`, `coin_gold`, `diamond`, or a Mod item with its namespace.
- With a row and a column (both or neither), the item drops in that cell; without them, near the middle of the lawn.
- With `award`, each call drops another copy of the level's award at the current wave and tutorial step. Collecting one wins the level.

#### `/achievement`

- `/achievement give {achievement}` grants an achievement by ID; `pvz:` may be omitted, as in `/achievement give sunny-days`. In a level the level grants it, so it is announced with its message and sound like a real one. Outside a level it only goes into the profile and waits for the next award page.
- It reports an unmet condition when the achievement is already earned, or in a level that grants no achievements, such as the test levels.
- `/achievement reset [achievement]` forgets one achievement, or every achievement when no ID is given, in the profile and in the running level, so it can be earned again.
- Both need a player profile. See [Achievements](ACHIEVEMENTS.md).

### Rule switches

| Command | Effect |
| --- | --- |
| `/cooldown` | Turns seed recharge on or off; turning it off makes every packet ready at once |
| `/suncost` | Turns sun cost on or off |
| `/plantinvincible` | Turns plant invincibility on or off |
| `/cheatseed` | Turns cheat seeds on or off: more seeds in the seed chooser, every slot and the shovel, and the whole almanac |
| `/collect {auto\|click\|move}` | Sets how sun and coins are collected |

In a level these commands change the level's rules and also keep the new state as a preference; every new level starts with the preferences. Outside a level they only set the preference. The preferences are saved on this device.

#### `/collect`

- `click`, the default, collects a drop when it is clicked, as in the original.
- `auto` collects every ordinary drop (sun, coins and diamonds) as soon as it can be collected.
- `move` collects ordinary drops when the mouse pointer passes over them.
- Neither `auto` nor `move` collects the level's award, which must still be clicked.

#### `/plantinvincible`

- While it is on, plants lose no health to zombie bites or to hostile plants' attacks (shots, blasts, fumes, bowled nuts, a hostile Ice-shroom's ice). A hostile Snow Pea's chill still slows them and a hostile Ice-shroom still freezes them, and lawn mowers no longer crush hostile plants.
- A Hypno-shroom still turns the zombie that chews it, or the hostile plant that bites it, and is gone; a hostile Chomper still swallows a plant whole.
- It applies to current and newly planted plants.
- A plant's own self-destruction, shoveling and `/removeplant` still work.
- It is off by default and persists locally across levels and restarts.

#### `/cheatseed`

In the seed chooser:

- The chooser gets more pages:
  1. Page 1 is the original grid with every seed in it, owned or not.
  2. Next come each Mod's seeds, every Mod from a page of its own, in the order the Mods load.
  3. Then the hidden cards (Explode-o-nut, the bowling nuts, every zombie seed, the grave seed and the crater seed) go on a page of their own, each card at its `position`, on the plants' side (the crater seed is the plants' own).
  4. The same pages follow on the zombies' side. A group longer than a page goes on to more pages.
- Cards on the side that is not their seed's own are drawn mirrored, and both sides of one seed can be chosen.
- Two yellow `(Prev Page)` and `(Next Page)` buttons turn the pages. They are drawn as the original's cheat-key `(Debug Play)` button (FONT_BRIANNETOD12 in 255,240,0, lit 200,200,255), where the DLC puts its arrows beside Let's Rock. The mouse wheel over the chooser turns them too, a notch a page, wrapping round at either end. Mods may restyle the two buttons (`LevelSeedChooser.pageTurners`).
- The slots need not all be filled: Let's Rock starts with any number of cards chosen, at least one, and leaves the remaining slots empty.
- These cards count towards the chooser's slots and towards whether it opens, so the early levels of a first Adventure open the chooser too.

In a level:

- A level started with it on has every slot (`seedBank.maxSlots`, 10): the seed-slot upgrades count as bought, for that level only, so Crazy Dave offers none. Turning it over later leaves the level's slots as they are.
- The shovel, and any tool a level awards, counts as collected; a level with tools of its own still has only those (Whack a Zombie has none).

In the almanac:

- The whole almanac opens: every plant and zombie is shown and described.
- When the plants' almanac has more than one page, Previous Page and Next Page appear to the left of Close (Next Page's image mirrored). They, or the mouse wheel over its cards, turn it to the same pages of Mod seeds and hidden cards, each with its cost and recharge (none for a seed without a recharge), and its zombie or grave standing where a plant does.
- The hidden cards share a placeholder description (`ALMANAC_HIDDEN_DESCRIPTION`) in the middle of the box. A Mod's plant has a description when its text table holds `{nameKey}_DESCRIPTION_HEADER` and `{nameKey}_DESCRIPTION`.
- The almanac's entry points stay as they are.

The switch is off by default and persists locally. It turns in any state of a level, the intro, a chooser and a finished level included, and an open chooser takes it up at once. Outside a level it only sets the preference.

### Display, input and device

| Command | Effect |
| --- | --- |
| `/fps` | Shows or hides the frame rate |
| `/hitboxes` | Shows or hides hitboxes on the lawn |
| `/highresolution` | Draws the game at the window's own pixels instead of the original's |
| `/sharpness {0-1}` | Sets how crisp an enlarged pixel is; 0.5 by default |
| `/tilted` | Enlarges and tilts the pictures in seed packets |
| `/cursor` | Switches between the original mouse cursors and the system's |
| `/hotkeys` | Turns the keyboard hotkeys on or off; see [Hotkeys](#hotkeys) |
| `/autopause` | Turns pausing on focus loss on or off |
| `/haptics` | Turns haptic feedback on or off |
| `/mobile` | Switches between mouse controls and touch controls |
| `/fullscreen` | Switches full screen on or off |
| `/resize` | Lets the desktop window be resized freely, or holds it at a height of 600 |
| `/music {0-100}` | Sets the music volume, an integer percentage |
| `/sfx {0-100}` | Sets the sound effect volume, an integer percentage |
| `/perf {plants\|zombies\|particles\|sfx\|logic}` | Turns one part of drawing or processing off or on |
| `/mod` | Opens the Mod manager |

#### Resolution and sharpness

- By default the game is drawn as the original draws it: at one pixel to a unit of its 800×600 layout (as wide as the window makes it), and that picture is enlarged over the window. The scene is still drawn once: its camera draws into the small picture and stays the one that takes the pointer (the engine's `Camera.presentedOnWindow`).
- `/highresolution` draws the scene straight to the window at the window's own pixels instead, where the same art is sharper than the original ever shows it. It is off by default and saved locally.
- `/sharpness {0-1}` sets how crisp an enlarged pixel is and saves it locally. The edge between two pixels blends over `1 - sharpness` screen pixels: `0` blends over a whole screen pixel (the softest edges), and `1` is close to nearest-pixel scaling (crisp edges; at a non-integer scale, pixels may differ in size by one). The default is 0.5.
- The pixels it applies to are those of the picture enlarged over the window. With `/highresolution` there is no such picture, and it applies to the base bitmap fonts instead: their glyphs are area-sampled, so strokes stay even when shrunk, and whole-number scales are unaffected.

#### Seed packet pictures

- A seed packet shows its plant or zombie drawn by its view, in the pose the original's cached art has, with four samples to a screen pixel, which is what that cached art comes to when scaled into a packet.
- `/tilted` enlarges and tilts the picture: a plant's to 1.5 times its size, turned 12° clockwise, and a zombie's to twice its size. Plants are clipped only at the image area's inner left and bottom borders, and may overflow at the top and right.
- Packet backgrounds, costs and hit areas keep their original size, and the loaded picture is reused when the switch turns. The pictures held in hand and previewed on the lawn are never tilted.
- A seed whose plant no view draws yet shows the original's cached art.
- It is off by default and saved locally.

#### Mouse cursors

- `/cursor` switches between the original mouse cursors and the system ones. The original cursors are the big arrow, a pointing hand over clickable objects and an open hand while dragging a dialog; text fields keep the system I-beam.
- `npm run build:content` extracts the cursor images from the original executable into the base content; resource packs may replace them by ID.
- It is on by default and saved locally.

#### Frame rate and hitboxes

- `/fps` shows or hides a white frame-rate counter at the bottom left of the original 800×600 game area; widescreen expansion does not move it. The counter measures drawn frames against real time, independently of the game's pause or speed. It is off by default and saved locally.
- `/hitboxes` outlines on the lawn the plants' bodies (green), the zombies' bodies (red) and bite areas (yellow), and the hitboxes of projectiles and lawn mowers (cyan; a waiting lawn mower's is the area where a zombie sets it off). It is off by default and saved locally.

#### Focus, haptics, controls, full screen and volume

- `/autopause`: when the window loses focus or is hidden, a level that can pause opens the pause menu (not while a menu page, a dialog or the console is open), and the audio is muted. Off, the game neither pauses nor mutes when another window takes the focus; it still mutes while hidden (another tab, a minimized window, an app in the background). It is on by default and saved locally.
- `/haptics` turns all haptic feedback on or off immediately. It is on by default and saved locally.
- `/mobile` switches mobile mode. In mobile mode the board ignores the mouse and takes touches: press a seed packet or the shovel, drag it onto the lawn and release it there; dragging across sun and coins collects them. See [Touch](UI.md#touch) in UI. It is on by default on mobile devices and off elsewhere, and it lasts for the session only.
- `/fullscreen` switches full screen, saved in the game settings like the full-screen option in Options. Native mobile apps are always full screen ("Windowed mode is unavailable on mobile"), and a browser without full-screen support reports "Full screen is unavailable".
- `/resize` decides how the Windows and macOS window can be resized; it is off by default and kept on this device. Off, the window keeps a height of 600 and a width of 600 times its aspect, within the range of aspects the game allows: 800×600 without the widescreen Mod, and with it a width from 800 to 1400 that only a sideways drag changes, and it cannot be maximized. Turning it off scales the window to that height at its current aspect; a full-screen window is scaled when it leaves full screen. On, the window can be resized freely within the range. The 600 is in the game's pixels, which a high-DPI display enlarges as it does the default window. On the web and on mobile devices it reports "Window resizing is unavailable".
- `/music` and `/sfx` set the volume as an integer from 0 to 100, saved through the settings API in the same settings as Options.

#### Performance switches

`/perf {category}` turns one category off, or on again, to isolate its cost. Every category is on by default, and the switches last for the session only.

| Category | What it turns off |
| --- | --- |
| `plants` | Drawing of plants |
| `zombies` | Drawing of zombies |
| `particles` | Particle effects |
| `sfx` | Sound effects |
| `logic` | Game logic: the level stops advancing while it is still drawn |

#### Mod manager

`/mod` opens the common package manager, which is the only management entry, and takes no arguments.

- Import selects local ZIPs; several can be chosen at once. The progress dialog is titled `Importing...`.
- In the window, enable, disable, uninstall and reorder the entries (their priority), then Apply.
- Changes to enabled states or to active resources ask for a restart. Confirming saves the running level and restarts the game; the running code and resources stay in use until the restart. Cancel discards the draft changes.
- Installed Mods persist locally, independently of the original ZIP, and can be updated with a package of the same ID.
- Higher-priority Mods, loaded later, override matching resource IDs. Missing IDs use the original resources; declared resources that fail to load do not fall back.
- ZIP is the only installation format. The game has no built-in HD assets; they ship separately as a resource pack. Pico129 and Pix118Bold are excluded from the HD pack.
- The manager shows `Loading...` until the installed Mod list is ready.

See [Mods](MODS.md) for the package format and installation.

## Hotkeys

With hotkeys on (`/hotkeys`, off by default and saved locally), each seed packet shows its number key and the shovel shows its letter.

| Key | Action |
| --- | --- |
| `1`–`9`, `0` | Pick the packet in seed slot 1–10, or the conveyor belt's packet in that place from the left. Holding another packet or the shovel, the key swaps straight to it; pressing the held packet's key puts it back. |
| `F` | Pick up the shovel, or put it back. Holding a plant, it swaps straight to the shovel, as the number keys swap packets. |
| `R` | Run `/repick`; pressed again in the repick, it is Let's Rock |
| `S` | Turn `/suncost` the other way, as typing it would |
| `C` | Turn `/cooldown` the other way, as typing it would |

Hotkeys work only in a level, while no dialog covers the board. `F` works whenever the shovel can be picked up; the other keys only after the level's intro, and the number keys only during play.

## Switches and saved settings

The switches take no argument: each run turns its switch over and shows where it now stands, such as "Recharge: off". They are the rule switches, `/autopause`, `/hotkeys`, `/haptics`, `/cursor`, `/highresolution`, `/tilted`, `/fps`, `/hitboxes`, `/mobile`, `/fullscreen`, `/resize` and `/perf {category}`.

| Setting | Command | Default | Kept |
| --- | --- | --- | --- |
| Recharge | `/cooldown` | On | On this device |
| Sun cost | `/suncost` | On | On this device |
| Invincible plants | `/plantinvincible` | Off | On this device |
| Cheat seeds | `/cheatseed` | Off | On this device |
| Collection | `/collect` | `click` | On this device |
| Frame rate | `/fps` | Off | On this device |
| Hitboxes | `/hitboxes` | Off | On this device |
| High resolution | `/highresolution` | Off | On this device |
| Sharpness | `/sharpness` | 0.5 | On this device |
| Tilted seed packets | `/tilted` | Off | On this device |
| Original cursors | `/cursor` | On | On this device |
| Hotkeys | `/hotkeys` | Off | On this device |
| Pause on focus loss | `/autopause` | On | On this device |
| Haptics | `/haptics` | On | On this device |
| Window resizing | `/resize` | Off | On this device |
| Mobile controls | `/mobile` | On on mobile devices, off elsewhere | This session only |
| Performance switches | `/perf {category}` | On | This session only |
| Game speed | `/gamespeed` | 1 | This session only |
| Full screen | `/fullscreen` | As set in Options | Game settings |
| Music and sound effect volume | `/music`, `/sfx` | As set in Options | Game settings |

Settings kept on this device, and the command history, live in the game's local storage; on the web they are part of the site's data in the browser.

## Installed content

Content names complete only in a level. The base package of this version installs:

| Kind | Names |
| --- | --- |
| Levels | Adventure `1-1` to `1-10` and `2-1` to `2-10`; `pvz:teams-demo`, `pvz:stress-test`, `pvz:seed-chooser-test` |
| Plants | `peashooter`, `sunflower`, `cherrybomb`, `wallnut`, `potatomine`, `snowpea`, `chomper`, `repeater`, `puffshroom`, `sunshroom`, `fumeshroom`, `gravebuster`, `hypnoshroom`, `scaredyshroom`, `iceshroom`, `doomshroom`, `lilypad` |
| Hidden plant seeds | `explodenut` (Explode-o-nut), `bowling-wallnut` and `bowling-explodenut` (the bowling nuts) |
| Zombies and zombie seeds | `normal`, `flag`, `conehead`, `pole_vaulter`, `buckethead`, `newspaper`, `screendoor`, `football`, `dancer`, `backup_dancer` |
| Other seeds | `grave`, `crater` |
| Items | `sun`, `smallsun`, `coin_silver`, `coin_gold`, `diamond`, and `award` for the level's award |
| Achievements | `home-security`, `nobel-peas-prize`, `better-off-dead`, `china-shop`, `spudow`, `explodonator`, `morticulturalist`, `dont-pea-in-pool`, `roll-some-heads`, `grounded`, `zombologist`, `penny-pincher`, `sunny-days`, `popcorn-party`, `good-morning`, `no-fungus-among-us`, `beyond-the-grave`, `immortal`, `towering-wisdom`, `mustache-mode`, `disco-is-undead` |

Plant, zombie, item and level names come from the installed content on the game server, Mods' content included. Content not yet migrated from the original is unavailable, and wave commands report an unmet condition when no matching wave remains. Widescreen support, main menu included, is an optional Mod.

## How a command runs

1. `GameApp` opens the dialog (`client/dialogs/DebugCliDialog.ts`), built on `UI.dialog` and `UI.input`. When a level is running, it first asks the server for a `catalog` of the installed plant seeds, seeds, zombies, items and levels, which feeds completion and the `/level` check.
2. `executeDebugCliCommand` (`platform/debug/DebugCliCommands.ts`) parses the line with `parseDebugCliCommand` from `shared/debug/DebugCli.ts`, whose `specs.list()` holds every command's syntax. It runs the client's own commands itself: pages, levels and the app, speed, display and input switches, `/mod`, and `/money` outside a level and `/achievement` through the menu API's profile. Audio and full-screen settings go through the menu API's settings.
3. Gameplay commands are forwarded as raw text: `LevelController.debugCommand` → `LocalIntegratedGame.debugCommand` → `IntegratedGameClient`, which sends a `debugCommand` packet.
4. `IntegratedGameHost` queues the packet only when debug commands are enabled, as the local integrated game enables them, and otherwise rejects it with `unsupported-command`.
5. The session runs it as a session command between ticks (`server/session/commands.ts`): it parses the text again and calls `executeDebugGameCommand` (`server/debug/debugCommands.ts`), which validates the command and changes the authoritative world, never the client's snapshot.
6. The result comes back in a `debugResult` packet. `LocalIntegratedGame` waits for it, and the level view syncs with the world before the console shows the result.

Results:

- `debugSuccess` and `debugSyntax` carry a message that only reaches the log.
- `debugCondition` carries a string table key and its arguments, which the client formats and shows on screen.
- `debugSwitched` adds the advice `DEBUG_SWITCH_ON` or `DEBUG_SWITCH_OFF` with the switch's name key, `DEBUG_SWITCH_{NAME}` (`/perf plants` is `DEBUG_SWITCH_PERF_PLANTS`).

Rules and preferences:

- The rule switches act on the session's `DebugRulesResource`. Recharge, sun cost, plant invincibility, collection and cheat seeds are also kept as debug preferences in `GameDebugSettings` and applied to each new level by `LevelController`; outside a level these commands only set the preference.
- `GameDebugSettings` stores the settings kept on the device under the local storage key `pvz-remake:debug:settings` and the history under `pvz-remake:debug:cli-history`.
- The hotkeys `S` and `C` run `/suncost` and `/cooldown` through `executeDebugCliCommand`, as the console does; `R` sends `/repick` to the level (`client/level/LevelInputPresenter.ts`).

Mods add commands by wrapping `specs.list` and the `executor` objects with `host.around`; see [Mods](MODS.md#extending-cli-commands).
