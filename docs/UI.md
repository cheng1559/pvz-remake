[简体中文](UI.zh-CN.md)

# UI

The game's interface consists of the menu pages, the menu dialogs and the level's own controls (the Menu button, the seed bank, the tools and the seed chooser). It is drawn with the original art and bitmap fonts and responds to the mouse, the keyboard and touch.

## Controls

### Input modes

The game takes input either from the mouse or from touch, not both at once:

- **Desktop mode** reads mouse events.
- **Mobile mode** reads touch events. It is on by default on devices that the engine reports as mobile (`sys.isMobile`). `/mobile` switches it for the current session; the choice is not saved.

Every control listens only to the events of the current mode, so a touch that the browser also reports as a mouse click activates a button once.

### Mouse

- **Left button**: presses buttons, picks up a seed packet or the shovel, plants, collects sun and coins, and advances Crazy Dave's lines.
- **Right button**: drops the seed packet or tool being held. Many buttons also respond to the right button, as in the original; some, such as the in-level Menu button and Let's Rock, respond to the left button only.
- **Press and drag**: a pressed button keeps the press while the pointer moves. Releasing over it activates it once; releasing elsewhere cancels. No other button lights up until the release.
- **Hover**: shows tooltips (seed packets, the shovel, the main menu's trophy, the gardens' next-garden button) and, in the store, Crazy Dave's description of the item.
- **Wheel**: scrolls the achievements page and long almanac descriptions. When the seed chooser or the plant almanac has more than one page (`/cheatseed`), the wheel over its cards turns the pages, one notch a page; a touchpad's smaller steps add up to one notch before a page turns.
- **Collecting**: sun and coins are collected by clicking them. `/collect move` collects them as the pointer passes over them, and `/collect auto` collects them automatically; both handle ordinary drops only.
- **Dialogs** can be dragged by their frame.

### Touch

- **Planting**: tap a seed packet to select it; it stays selected. Drag out of the packet to show the plant and the row and column guide, then lift the finger to plant. Lifting at an invalid place, or back on the source packet, cancels. Tapping another ready packet switches to it.
- **Shovel**: press the shovel to pick it up, drag to aim, and lift to dig; dragging back onto its button cancels.
- **Collecting**: a finger dragged across the lawn collects the sun and coins along its path.
- **One finger**: the lawn follows one finger from touch to release. A pause discards the gesture.
- **Buttons**: sliding from one button onto another moves the press to the button under the finger, and lifting activates that one.
- **Lists** scroll by dragging and keep moving briefly after release. The thin scroll bar can be dragged, and tapping its track pages.
- **Sliders**: drag the knob, or tap the slot to move the knob there.
- **Dialogs** can be dragged by their frame.
- **Store**: a purchase starts when the finger lifts, so holding an item shows its description first. With a mouse it starts on the press.
- **Text fields** open the on-screen keyboard; the game draws the text itself. On iOS the fields use the ASCII keyboard with autocorrection off.
- **Debug console**: double-tap the bottom-right corner of the screen (100 CSS pixels square) within 350 ms. This works in mobile mode and on any mobile device.

### Keyboard

| Key | Where | Effect |
| --- | --- | --- |
| Space | In play | Opens the GAME PAUSED dialog. Holding Space does not open it again. Space does not pause during the level intro (the seed chooser included) or a repick. |
| Escape | In play | Drops the held seed packet or tool; otherwise opens the in-game options, as the Menu button does. |
| Escape | On a menu page | Goes back: to the main menu from most pages, to the almanac index from the plant and zombie lists, and from the almanac index or the store to whatever they were opened from. |
| Enter, Space / Escape | In a dialog | Confirm / cancel the topmost dialog. |
| Enter / Escape | In a text field | Submit / cancel the field. Space always types a space and never confirms the dialog. |
| Space, Enter | While Crazy Dave speaks | Advance to his next line; holding the key repeats. |
| Enter, Space | Help page | Return to the main menu (Escape too). |
| Enter, Space | Award page | Continue to the next level, or to the page that the award opens first. Escape returns to the main menu. |
| Up, Down | Achievements page | Scroll the list (see [Achievements](#achievements-achievementscreen)). |
| Up, Down | Player list | Move the selection. |
| Tab | Text fields | Moves to the next field (Shift+Tab to the previous one); in the debug console, completes the command. |
| Any key | Title screen | Starts once loading has finished. |
| `/` | After startup, outside text fields | Opens the debug console. |

### Hotkeys

Hotkeys are off by default. `/hotkeys` turns them on or off, and the choice is saved on the device. While they are on, the first ten seed packets show their key (1–9, 0) and the shovel's bank shows F.

| Key | Effect |
| --- | --- |
| 1–9, 0 | Pick up the packet in that slot of the seed bank or the conveyor belt. While another packet is held, the key swaps to this one; pressed for the packet already held, it drops it. Packets respond once the intro is over. |
| F | Picks up the shovel or puts it back. While a packet is held, it swaps straight to the shovel. |
| D | Freezes the game (speed 0); pressed again, restores the previous speed. |
| R | Runs `/repick`; during a repick, presses Let's Rock. |
| S, C | Turn sun cost and recharge off or on, as typing `/suncost` and `/cooldown` would: the preference carries over to later levels, and the new state is shown. |

### Pausing, focus and saving

- **GAME PAUSED**: Space opens this dialog, with the Newspaper Zombie in it. It is separate from the in-game options, which the [Menu button](#the-levels-ui) and Escape open and which pause the level too. Resume Game, Enter, Space or Escape returns to the same board.
- **While paused**: opening GAME PAUSED saves the level. While either dialog is open, the server's game logic, the scene's Reanim animations, particles, tweens and music stand still, without changing the global clock; on resume, only the animation components that were enabled before the pause are enabled again.
- **Losing focus** (another window or tab, a minimized window, an app sent to the background) mutes the game. With auto-pause on (`/autopause`; on by default and saved on the device), it also opens GAME PAUSED, without the pause sound, when a level is in play and no page, dialog or debug console is open. With auto-pause off, the game mutes only while it is hidden (another tab, a minimized window, an app in the background), and stays audible behind another window.
- **Saving**: the running level is saved when the game is hidden (the tab or app goes to the background), when its window closes (the close button, Alt+F4 or Cmd+Q), when GAME PAUSED opens and when a level is left for the main menu. Entering a level that has a save asks CONTINUE GAME?: Continue, Restart Level (after a confirmation) or Cancel.

## Display and device settings

| Setting | How to change it | Default | Kept |
| --- | --- | --- | --- |
| Music, sound effects | Options sliders; `/music {0-100}`, `/sfx {0-100}` | 85% each | With the options |
| Full screen | Options → Full Screen; `/fullscreen` | Off; always on in the Android and iOS apps | With the options |
| High resolution | `/highresolution` | Off: original-resolution rendering | On this device |
| Sharpness | `/sharpness {0-1}` | 0.5 | On this device |
| Tilted seed packets | `/tilted` | Off | On this device |
| Frame rate counter | `/fps` | Off | On this device |
| Original cursors | `/cursor` | On | On this device |
| Haptics | `/haptics` | On | On this device |
| Auto-pause | `/autopause` | On | On this device |
| Hotkeys | `/hotkeys` | Off | On this device |
| Mobile mode | `/mobile` | On for mobile devices | This session only |

Each switch applies at once. The commands are described in [Debug Console](DEBUG_CLI.md).

Device settings other than the options live in `platform/debug/GameDebugSettings.ts` under the `pvz-remake:debug:settings` key; only the kept settings are written, so retired ones drop out.

### Original-resolution rendering

By default the game is drawn as the original draws it. Each frame is composed at one pixel per unit of the 800×600 layout (as wide as the window makes it, so a widescreen layout is wider), and that picture is enlarged over the window. Turned and scaled parts are therefore resampled on the same pixel grid as in the original, instead of being drawn sharper than the original ever shows them.

- The picture is an even number of pixels in each direction: the next even size past the window, shown from its middle at the window's scale. The window cuts off less than one unit at each edge. With an odd size every pixel would sit half a unit off the layout's grid, and art placed on whole units would smear over two pixels.
- The scene's camera draws into the picture and still takes the window's pointer, so clicks land where they are drawn.
- Dialogs move by whole units when dragged, as the original's do, so their text does not shift within the frame.

### High resolution

`/highresolution` draws the game straight to the window at the window's own pixels. The same art is sharper than the original shows it, and dialogs move freely when dragged.

### Sharpness

`/sharpness {0-1}` sets how crisp an enlarged pixel is: the edge between two pixels blends over `1 - sharpness` screen pixels. `0` blends over a whole screen pixel (the softest edges); `1` is close to nearest-pixel scaling (crisp edges, though at a non-integer scale pixels may differ in size by one). The original leaves the enlarging to the display, which on most displays is crisper than plain linear filtering.

The setting applies to the enlarged picture. With `/highresolution` there is no such picture, and it applies to the base bitmap fonts instead: their glyphs are area-sampled, so strokes stay even when shrunk; whole-number scales are unaffected.

### Tilted seed packets

`/tilted` enlarges the picture in each seed packet (a plant's by half, a zombie's to twice its size) and rotates it clockwise so that it leans out of the packet. It is clipped only at the inner bottom border and on the side behind it; above and in front it may stand out of the packet. Packet backgrounds, costs and hit areas keep their original size, and the loaded picture is reused when the switch changes. The held plant and the planting preview on the lawn are never tilted.

### Frame rate

`/fps` shows a white counter at the bottom left of the original 800×600 area; widescreen layouts do not move it. It counts drawn frames against real time, whatever the pause state or game speed.

### Cursors

With original cursors on (`/cursor`), the game shows the original's mouse cursors:

| Cursor | Shown |
| --- | --- |
| The big arrow | By default |
| The pointing hand | Over clickable things |
| The dragging hand | While a dialog is dragged |

Text fields keep the system I-beam. The images are extracted from the original executable when the resources are imported, and resource packs may replace them. Until they load, or if they fail to, the system cursors stay. In Whack a Zombie, where the game draws the mallet, the system cursor is hidden while nothing clickable is under it (desktop mode only).

### Haptics

`/haptics` turns haptic feedback on or off; it is on by default and saved on the device. Feedback works in the Android and iOS apps and in Android browsers. iOS browsers have no vibration API and desktop machines no motor.

Feedback is given when:

- a finger touches or slides onto a button (seed packets, tools, chooser cards, almanac cards and the main menu's trophy excepted);
- a slider's knob passes each twentieth of its range;
- an almanac entry is chosen;
- the board shakes, such as for an explosion; the strongest shake of a frame decides the strength.

An explosion's feedback waits 40 ms of game time and takes precedence over lighter feedback; feedback within 40 ms of the last one is merged.

## Options

The Options dialog (`dialogs/OptionsDialog.ts`) keeps the original's layout:

- **Music** and **Sound FX** sliders change the volume immediately. Sound effects use a 0.65 volume scale (`SFX_VOLUME_SCALE`).
- **3D Acceleration** is always on. Clicking the box explains that it is required.
- **Full Screen** takes effect when the dialog closes; it is submitted inside the input callback, so browsers keep the user activation. In the Android and iOS apps it is always on, and clicking it explains why; where the browser offers no full screen, ticking it reports that.
- **In a level**: View Almanac (once the almanac is unlocked, and not during the intro), Restart Level (after a confirmation; not during the intro), Main Menu (after a confirmation, and the level is saved; during the intro it leaves at once) and Back To Game.
- **From the main menu**: Mods opens the Mod manager over the options (see [Mods](MODS.md)), and OK closes them.
- Enter and Escape close the dialog, as Back To Game or OK does.

The settings keep the `pvz-remake:settings:options` storage key.

## Screens

### Startup (`StartupScreen`)

- The PopCap logo fades in, holds and fades out over 200 ticks (50-tick fades). It shows when the game starts, and also when pending Mod changes are applied, which happens while it shows; returning to the title skips it.
- The title screen then plays as `TitleScreen` does. The title drops in and the loading bar (314 px) rises below it: a strip of dirt that grass covers as the game loads, with a sod roll at its front, and sprouts and a zombie head popping up along it at the five original thresholds (0.11, 0.32, 0.54, 0.72 and 0.906 of the bar; 0.906 in 1.0.0.1051, 1.2.0.1073 and 1.2.0.1096). Timing uses 100 Hz ticks of the global clock; the effects (`pvz:loadbar_sprout` and `pvz:loadbar_zombiehead`, 18 frames a second) play on the current `ReanimPlayer`. They are converted from `main.pak` with the other resources by `npm run build:content`, which also repacks the built-in ZIP (see [Development](DEVELOPMENT.md)).
- Progress follows the actual work. Release builds first preload every asset (Debug builds and iOS browsers load images as they are used: HD packs decode to more than the page's memory limit there), then prepare the main menu's images and animations, then build the achievements page and draw it once behind the loading screen.
- Once loading is complete and the bar reads CLICK TO START!, click it, click or tap anywhere, or press any key; the bar follows the button rules for the mouse. The prepared main menu stays hidden and is reused when this input starts its entrance.

### Main menu (`MainMenuScreen`)

- The presentation's `mainMenu` (`main-menu.json`) holds the original button images, track offsets, polygon hit areas and the animations' paces (`fps`, frames a second). The screen composes them with the current `ReanimPlayer`, in the original's draw order.
- The entrance plays `open`, then `sign`, and holds the final pose. Clouds, the grass and the three flowers on the right animate on their own; each flower plays its animation once when clicked. Without a player, the grass is not drawn and the create-user dialog opens when the entrance finishes; the sign drops once a player exists.
- The gravestone buttons start Adventure, Mini-games, Puzzle and Survival, with polygon hit areas and the gravestone sound. The other buttons are the player and Zombatar signs and the garden, store, almanac, achievements, options, help and quit buttons, with the tap sound. Hover plays the original bleep. Quit asks first.
- Locks follow `GameSelector::SyncButtons`: until a mode is unlocked, its button is shaded grey, keeps its normal image under the pointer, stays silent and, when clicked, shows its locked message, which explains why. The almanac, store and Zen Garden are hidden until unlocked. Without a player, every mode is locked.
- The Adventure button reads the profile: it shows Start Adventure for a new player and otherwise the Adventure image with the current level's digits (for example 2-5). Clicking it plays the 4.5-second flash (the button blinking every 0.1 s), the zombie hand, the losing music, the dirt sound and, at 1.25 s, the evil laugh, then enters the profile's current Adventure level (`play`; a saved level offers to continue).
- A finished Adventure puts a sunflower trophy on the left, gold once all 48 challenge trophies (every mini-game, puzzle and survival trophy) are won, with the original sparkle and a tooltip at a fixed place while the pointer is over (50, 250)–(135, 475).
- The wooden signs change the player (see [Menu dialogs](#menu-dialogs)) and open Zombatar, which is not available yet and shows an unavailable message.

### Challenge pages (`ChallengeScreen`)

`ChallengeScreen` draws the original's Mini-games, Puzzle and Survival thumbnail buttons (20, 20 and 11) from the presentation's `challenges` layout, and the trophies won so far from the profile's trophy counts (completed out of those that award a trophy; the endless entries award none). The buttons reuse `UI.button` capture and visual states, their labels turning red on hover. Selecting any challenge currently shows a COMING SOON dialog ("This mode is not available yet."). The Back to Menu button keeps its margin from the UI area's left edge.

### Almanac (`AlmanacScreen`)

- `AlmanacScreen` provides the plant packets, the static zombie thumbnails, selection, the detail cards, costs, recharge labels and the colored bitmap descriptions. The index page shows the Sunflower and the normal zombie and leads to View Plants (a `seed` button) and View Zombies.
- The plant list shows the seed packets the player owns; the selected plant stands animated on its ground with its name, description, Cost and Recharge. The zombie list shows the zombies the Adventure has reached, the others as blank windows; a zombie that first appears on the current level reads ??? in place of its description until a later level.
- `AlmanacEntityView` shows the plant or zombie of the details without making a combat entity. Off the board, an entity is what the original's `Plant` not in play (`IsInPlay()` false) or `Zombie` (`ZOMBIE_WAVE_UI`) is: its animation follows the level's rules, a plant's by `shared/content/plantAnimation` (by which the server steps the plants in a level) and a zombie's standing by `shared/content/zombieAnimation` (`Zombie::LoadReanim`), and `client/view/offBoard.ts` draws it (see [Off-board views and loading](ARCHITECTURE.md#off-board-views-and-loading)).
- In the details, a plant or zombie stands off its usual place by its presentation's `almanacOffset`, in the original's Y-down pixels (`AlmanacDialog::DrawPlants` and `DrawZombies`): the Grave Buster 55 lower, the Football Zombie 10 left. A zombie's thumbnail (`AlmanacZombiePortrait`) uses its presentation's `portrait` and holds the zombie still at that place and scale, as the original's cached half-size frame. Places, scales and shadows reach the view through its `draw` argument.
- The Recharge label is none for no cooldown, fast for 750 ticks, slow for 3000 and very slow otherwise.
- Long descriptions scroll. `AlmanacText` keeps the original markup (`{KEYWORD}`, `{STAT}`, `{FLAVOR}`, `{NOCTURNAL}`, `{AQUATIC}`, `{METAL}`, `{KEYMETAL}`, `{NORMAL}`, `{SHORTLINE}`, `{EXTRASHORTLINE}`) and lays out the text inside `UI.scroll`. The scroll follows the Steam 1096 `AlmanacDialog`: a page of 85% of the box (so the end usually leaves 15% blank), 5% of the text per wheel step, and the page's scrollbar colors. The text is drawn 7 px narrower than it is measured, and the range is extended to reach a line that this adds.
- The shared `UIScroll` and `ScrollGesture` handle wheel, thumb-drag and mobile touch scrolling, with inertia driven by the global clock.
- With `/cheatseed`, the plant list has more pages (Mod seeds, then the hidden cards) turned by PREVIOUS PAGE and NEXT PAGE (the latter's image mirrored) or by the wheel over the cards; see [Debug Console](DEBUG_CLI.md).
- ALMANAC INDEX and CLOSE sit at the bottom. They use the dedicated `almanacIndex` and `almanacClose` presets at their original positions, keeping their margins from the UI area's edges.

### Store (`StoreScreen`)

- `StoreScreen` supplies Crazy Dave's car, the sign's entrance, the four pages, the hover descriptions, the money counter and the 0.5-second hatchback page turn (the car shakes for its first 0.15 seconds), all on the global clock. The pages open as the Adventure progresses, and the taillights turn them. Items stand in two rows of four with price tags, and may be marked Coming Soon or Sold Out.
- Crazy Dave (`CrazyDaveView`) enters at the place where the original's `StoreScreen` draws him and talks in his speech bubble: he describes the item under the pointer or finger, and now and then says an ambient line, chosen by weight from the presentation's `storeDialogue`, never the line he said last, the `completed` lines only after the Adventure. The original draws the page arrows (the car's taillights) over him, so his entering arm passes behind a taillight; here they stay below him.
- `server/menu/storeCatalog` reads progress and the purchase counts (the profile's `purchases`, by store item ID) from the active profile for availability, prices, stock limits and confirmed purchases. Money uses the original units ($10 per stored coin). The API reloads the profile before charging and persists it on the backend; `/money` changes reach an open store at once.
- Buying asks for confirmation, or says there is not enough money; buying a seed slot reports the new slot count, and buying the Tree of Wisdom offers to visit it. What a purchased item does in play belongs to the system it concerns.
- Opened from a garden or from the seed chooser, the back button reads GO BACK and returns there; otherwise it is the main menu button.

### Achievements (`AchievementScreen`)

- The main menu slides up and the achievements page rises from below (see [Transitions and fades](#transitions-and-fades)). The page reads the achievement definitions (the gameplay `achievements` table: the base game's 21 in the original order, which Mods may extend) and the active player's earned IDs through `getAchievements()`, when it is built and again each time it is shown, which also scrolls it back to the top. Triggers, granting and the award page's list are described in [Achievements](ACHIEVEMENTS.md).
- The layout follows `AchievementsWidget`: two columns 290 px apart, rows 57 px apart from y 178, 70 px atlas cells drawn at 0.8 scale (56 px), green titles and wrapped white bitmap descriptions. Earned achievements have bright icons (alpha 255), the rest faint ones (alpha 32). Mods may replace the whole background layer (the top, the tiled holes and the China at the bottom) without touching the decorations or the controls.
- The list scrolls with the wheel, the Up and Down keys, dragging (in mobile mode) and the More rock at the bottom right. The shared `UIScroll` scrolls 80 px per wheel notch with no easing. The More rock scrolls 230 px down over 0.25 s, to the rest of the list; pressed again, in its Top state, it scrolls back up. Only scrolling down plays the rock sound. Touch dragging has inertia; all motion follows the global clock.
- The arrow keys follow GOTY's `AchievementsWidget::KeyDown`: each press sets the speed to 30, which drops by 1 every 10 ms while moving that many pixels (about 435 px a press); key repeats reset the speed instead of adding to it.
- The button at the top left returns to the menu. The tiled underground background and this return control move with the content. Scrolling never requests data or grants achievements.

### Gardens, Help and the award page

- The four Zen Garden pages show their backgrounds and their buttons (Main Menu, next garden, store); the gardens themselves are not implemented yet. `MenuPageControls` supplies these buttons and the achievements page's return button. Switching gardens uses `clickOnPress`, and its tooltip keeps the previous centre x=599, top y=52 through the tooltip's `offset`.
- Help shows the help note, with a `seed` Main Menu button at its original position that returns to the menu. Its fade is described in [Transitions and fades](#transitions-and-fades).
- The award page (`AwardScreen`) shows the new plant, item or note: it draws the new seed packet at twice its size, an item's picture or a note's images, with the name and description, and a `seed` NEXT LEVEL! button that goes on (or the button of the page the award opens first). Some awards also have a small Main Menu button at the top right. Award pages use the original button images and keep the earlier Adventure 1-1 replay path: R on the award page navigates to `restart`.
- Achievements that were earned but not yet shown, in a level or an earlier list, are listed first (`AwardAchievements`, after `AwardScreen::DrawAchievements`): each row slides in from y 750 over 100 ticks, one every 100 ticks from tick 150, rows 76 px apart, and Continue appears once the last row has arrived. The page's keys (see [Keyboard](#keyboard)) keep working meanwhile.

### Menu dialogs

| Dialog | Source | Notes |
| --- | --- | --- |
| Options | `dialogs/OptionsDialog.ts` | See [Options](#options) |
| GAME PAUSED | `dialogs/MenuDialog.ts` | The Newspaper Zombie on its idle, at the original widget position (header spacing 155); see [Pausing, focus and saving](#pausing-focus-and-saving) |
| GAME OVER | `dialogs/MenuDialog.ts` | Try Again restarts; Main Menu returns |
| Quit | `dialogs/MenuDialog.ts` | Confirming ends the game |
| WHO ARE YOU? | `dialogs/UserDialog.ts` | See below |
| CONTINUE GAME? | `dialogs/ContinueGameDialog.ts` | See [Pausing, focus and saving](#pausing-focus-and-saving) |
| Debug console | `dialogs/DebugCliDialog.ts` | See [Debug Console](DEBUG_CLI.md) |
| Mod manager | `dialogs/PackageDialog.ts` | See [Mods](MODS.md) |
| Restarting... | `dialogs/RestartingDialog.ts` | Cannot be closed; drawn before a restart runs |

**WHO ARE YOU?** (`dialogs/UserDialog.ts`) is the player list. It calls `MenuApi` to select, create, rename and delete players; the backend validates and stores these operations.

- It shows up to eight players, the current one first. Click a name to select it; double-click it or press OK to switch, and Cancel keeps the current player. Rename and Delete act on the selected player; the last row creates a new player.
- Names follow the original's limit of 12 ASCII letters, digits and spaces; runs of spaces become one, and a name may not be empty or match another (ignoring case).
- Deleting a player, after a confirmation, removes only that player's profile and their legacy, primary and temporary saves.
- The game always needs a player: the first start, and deleting the last player, ask for a new one. The retained main menu refreshes its name and Adventure state.
- Each player has their own Mods. Switching to a player whose Mods differ asks for a restart and restarts the game; a new player may copy the previous player's Mods, and the first player keeps the Mods installed before.
- The player dialogs reuse the shared tall-bottom frame, extra sizing and top-aligned message layout.

The debug console's history (64 commands) is kept under `pvz-remake:debug:cli-history`.

### The level's UI

- **Menu button**: the original 117×46 stone button at the top right, at (681, -10), created by `LevelHudPresenter` and shown after the level intro (not after a loss). It ignores the right button. While a seed packet or tool is held, a click on it only drops it; otherwise it opens the in-game [Options](#options) dialog. Pausing is described in [Pausing, focus and saving](#pausing-focus-and-saving). It stands in the level's controls (`LevelView.controls`, `LevelControls`), which keep their margin from the UI area's right edge and take the buttons Mods add beside it (`LevelHudOptions.controlsParent`); they are drawn in the seed bank's layer unless a Mod moves them.
- **Seed bank and tools**: bank and conveyor packets share `LevelSeedBank`'s views, buttons and tooltips; `LevelBoardHud` lays out the tools. The key labels shown while hotkeys are on are described in [Hotkeys](#hotkeys).
- **Seed chooser** (`LevelSeedChooser`, the original `SeedChooserScreen`): the server decides which seeds are offered and chosen; the client moves the panel and the cards.
  - The panel drops in during the level intro, 516 px over intro ticks 400–425, and lifts out over 450–475 (`CutScene`'s `TimeSeedChoserSlideOnStart` and the rest); a repick follows the same timeline.
  - The grid has 8 columns 53 px apart, five rows 73 px apart, or six rows 70 px apart once a card sits at places 40–47; a seed not yet unlocked leaves a silhouette in its place.
  - Click or tap a card to put it in the seed bank, and a chosen card to send it back. Cards fly between the grid and the bank over 25 ticks (15 when moving between slots), and a new click lands every flying card first.
  - Tooltips describe each card. A card the level does not recommend is greyed (to 115 while it waits in the grid), and its tooltip carries a red warning.
  - Let's Rock (`seed`, yellow font) looks enabled exactly while the bank is full; with `/cheatseed`, once any card is chosen. If the level has warnings, each then asks in turn, and Re-pick goes back to choosing.
  - ALMANAC and SHOP (`seedSmall`) appear once the almanac and the store are unlocked, when `LawnApp::CanShowAlmanac` and `CanShowStore` allow, and open over the paused level, its music playing on; a repick has neither. Clicking a zombie on the street opens its almanac entry.
  - With `/cheatseed`, `(Prev Page)` and `(Next Page)` use the `text` skin.
- **Touch planting** uses the gestures described in [Touch](#touch); `LevelInputPresenter` handles them. Swipe collection samples every 24 px, selection highlights reuse `SeedPacketView`'s mobile mode, and planting uses the existing backend commands.

## Window placement (Windows and macOS)

Native Windows and macOS remember the window like the original's `PreferredX`/`PreferredY` registry values. `native/engine/common/Classes/Game.cpp` follows the position and size of the normal window (not full screen, maximized or minimized), writes them to `window.txt` in the writable path when the window closes, and reads them before creating the next window. When the middle of the saved window's top edge is no longer within any display's usable area, the engine centres an 800×600 window instead.

Unless `/resize` is on (see [Debug Console](DEBUG_CLI.md)), the window keeps a height of 600 and a width that follows its aspect within the allowed range, so it is 800×600 without the widescreen Mod. `ClientViewport.constrainNativeWindow` passes that height to `jsb.setWindowAspectRatio`, whose native side scales the window to it and holds it through drags, Snap and DPI changes, with maximizing turned off; a saved window of another size is corrected at startup.

## UI toolkit

### Code layout

Paths are relative to `assets/scripts/` unless they say otherwise.

| Path | Contents |
| --- | --- |
| `client/ui/` | The toolkit: the `UI` factory, `UIButton`, `UILabel`, `UIInput`, `UIScroll`, `UISlider`, `UIDialog`, `UITooltip`, `UIAssets` (fonts, sprites, text), `WheelPageTurner`, `formatMoney` |
| `client/input/` | `UIHoverManager` (hover, modal scopes, cursor), `CursorManager`, `ScrollGesture` |
| `client/screens/` | The menu shell (`MenuScreen`, `MenuPages`, `ScreenTransition`, `PageFade`) and each page's screen |
| `client/dialogs/` | Menu dialogs (`MenuDialog`, `OptionsDialog`, `UserDialog`, `ContinueGameDialog`, `DebugCliDialog`, `PackageDialog`, `RestartingDialog`) |
| `client/level/` | The level's HUD and input (`LevelHudPresenter`, `LevelSeedBank`, `LevelBoardHud`, `LevelSeedChooser`, `LevelInputPresenter`) |
| `app/GameApp.ts` | The app shell: navigation, menu dialogs, global keys, focus handling and saving |
| `platform/` | `GameDebugSettings` (device settings), `OptionsSettings` (full screen), `Haptics` |

### Conventions

- **Coordinates**: every factory option, polygon and offset is in parent-local pixels, x pointing right and y pointing down, as in the original. Most screens lay out on the 800×600 layout from its top-left corner.
- **Values**: setting a control's `value` in code is silent; only user input calls `onChange`.
- **Text**: `ui.text(key)` reads one merged string table: the base game's, then each running Mod's own keys and translations. A Mod may add keys only in its own namespace; other additions are rejected and logged. A missing key shows the key itself and logs an error. `ui.format(key, args)` fills `%s`/`%d` in order, like the original's `StrFormat`; `ui.hasText(key)` tells whether a key exists (for text shown only when there is some, such as a Mod plant's description); `ui.locale` is the installed text's language (BCP 47, declared by a text pack's manifest).
- **Time**: screen timers and animations run on the global clock (`core/GameClock`), mostly in the original's 10 ms ticks.
- **Data**: screens read and change profile data only through `MenuApi`; see [Menu backend](ARCHITECTURE.md#menu-backend).

### The UI factory

`client/ui/UI.ts` creates labels, images, buttons, text inputs, checkboxes, selects, sliders, scroll areas, tooltips and dialogs. Text is drawn by the existing `FontRenderer` with the original bitmap fonts, and the controls reuse the original textures and interactions. `UI.load()` loads the running UI assets (with every Mod); `UI.recovery()` loads the base game's alone (keeping a language pack that has already loaded), for the dialog shown after a Mod failure.

```ts
const ui = await UI.load()
const label = ui.label(parent, { text: 'Music', x: 20, y: 30 })
const button = ui.button(parent, { text: 'OK', x: 20, y: 80, onClick: close })
const slider = ui.slider(parent, { x: 220, y: 30, value: 0.85, onChange: setVolume })
const checkbox = ui.checkbox(parent, { x: 220, y: 80, value: true, onChange: setChecked })
const select = ui.select(parent, { x: 20, y: 140, items: ['A', 'B'], value: 0, onChange: selectItem })
const input = ui.input(parent, { x: 20, y: 190, width: 300, maxLength: 12, onSubmit: saveName })
const confirmed = await ui.dialog(parent, { title: 'Continue?', cancelText: 'CANCEL' }).result
```

Labels expose `text`, `color` and `setPosition(x, y)`; buttons expose `setText()` and `interactable`; inputs, checkboxes, selects and sliders expose `value`. Dialogs block input below them, can be dragged, take Enter, Space and Escape while topmost, and close with `close()`.

#### Fonts

`UIAssets` loads these presets by resource ID, so text and HD packs can replace them:

| Preset | Font | Typical use |
| --- | --- | --- |
| `label` | `pvz:dwarventodcraft18` | Default label |
| `button`, `buttonHover` | `pvz:dwarventodcraft18greeninset`, `…brightgreeninset` | Stone buttons |
| `large`, `largeHover` | `pvz:dwarventodcraft36greeninset`, `…brightgreeninset` | The Options back button |
| `title` | `pvz:dwarventodcraft24` | Dialog titles, some page titles |
| `pageTitle`, `pageTitleSmall` | `pvz:houseofterror28`, `pvz:houseofterror20` | Page titles, the store's back button |
| `body` | `pvz:dwarventodcraft15` | Dialog messages, achievement titles |
| `small` | `pvz:briannetod12` | Small buttons, almanac text |
| `yellow` | `pvz:dwarventodcraft18yellow` | Plant names, Let's Rock |
| `profile` | `pvz:briannetod16` | Player names, text inputs, the loading bar |
| `packetCost` | `pvz:pico129` | Packet costs, tooltips |
| `tooltipTitle` | `pvz:pix118bold` | Tooltip titles |
| `money` | `pvz:continuumbold14` | The store's money counter |
| `storeItem` | `pvz:houseofterror16` | Store item labels |
| `hotkey` | `pvz:hotkey` | Hotkey letters; an ID of its own, so a text pack that replaces `houseofterror16` for words leaves it, while an HD pack can still redraw it |
| `achievement` | `pvz:dwarventodcraft12` | Achievement descriptions |

#### Labels

`ui.label(parent, options)` takes a font preset or a loaded `BitmapFontAssets`, plus `x`, `y`, `width` (wrapping), `fontSize`, `lineSpacing`, `color`, `align` and `baseline` (place `y` on the baseline). `node` binds an existing prefab text node instead of adding a second renderer. `pixelAlign` rounds the final position, for the original's HUD text.

The level HUD, shared by every level, uses these labels for the sun count, the level name, the player's house name and advice; their fonts come from the content registry, so Mod overrides apply. Seed packets use `UIButton` for press, capture and modal handling, and suspending the level's input disables the components. Recharge, selection, flashes, the advice animation and the progress meter keep their own rendering.

#### Buttons

`ui.button(parent, options)` picks one of the original presets through `skin`. Sizes default to the source image, except stone (and `text`) buttons, which default to 180×46.

| `skin` | Appearance |
| --- | --- |
| `stone` | The default tiled stone button, with highlighted hover glyphs |
| `back` | The large Options return button, 360×100 |
| `seed` | The large seed chooser button, 156×42, with an additive glow and a disabled image |
| `seedSmall` | The small seed chooser button, 111×26, swapping to its hover image |
| `almanacIndex` | The almanac footer's index button, 164×26, its text offset to the right |
| `almanacClose` | The almanac footer's close button, 89×26, its text offset to the left |
| `image` | A custom image button with optional `text`; chosen automatically when `images` is given |
| `text` | A label alone, on no image, lit by `hoverColor`, as the seed chooser's `(Debug Play)` button is |

```ts
ui.button(parent, { skin: 'seed', text: 'Continue', x: 20, y: 80, onClick: next })
ui.button(parent, {
    x: 400, y: 100,
    images: { normal, hover, pressed, disabled }, // SpriteFrames; only normal is required
    polygon: [[7, 1], [328, 30], [314, 125], [1, 78]],
    onClick: startAdventure,
})
```

Load images with `modResources.sprite(id)`, which returns the `SpriteFrame` of the highest-priority running pack that has it.

| Option | Default | Effect |
| --- | --- | --- |
| `images` | The skin's | `normal` is required. A missing state falls back to the normal image; `pressed` first falls back to `hover`. Without a disabled image, a disabled button is drawn at half opacity. |
| `imageBox` | The whole button | Image bounds separate from the hit area. The main menu's bottom buttons keep the original's larger hit areas this way while their images keep their natural size. |
| `mirrored` | `false` | Draws the images mirrored and offsets the label the other way (the almanac's NEXT PAGE). |
| `font`, `hoverFont`, `color`, `hoverColor`, `disabledColor` | The skin's | The label's font and colors; `hoverColor` is the original's `GameButton::SetLabelHiliteColor`. |
| `pressOffset` | `[1, 1]` for `seed` and the footer skins, else `[0, 0]` | Moves the visual while pressed; the hit area stays put. |
| `pressSound` | Tap for `seed`, `seedSmall` and the footer skins; the gravestone sound for `stone` and `back`; a button click otherwise | Played on press. `null` mutes it. |
| `clickSound` | None | Played with the action. `null` mutes it. |
| `hoverSound` | None | Played when the pointer actually enters the button. |
| `clickOnPress` | `false` | Runs the action on a mouse or touch press, without capturing the pointer. Switching gardens uses it. |
| `rightClickTriggers` | `true` | `false` makes the button ignore the right button. |
| `rightClickPressesVisual` | `true`, `false` for the footer skins | `false` keeps right-click activation without the pressed look, as the almanac footer does. |
| `releaseToNormalOnPressOut` | `true`, `false` for `image` | While a press is dragged outside, the button looks normal; an `image` button keeps its highlight but drops the press offset. The cursor returns to the default outside in both cases. |
| `refreshHoverOnEnable` | `true` | Re-checks hover when the button is enabled. The main menu's buttons turn it off, as the original does. |
| `enabled` | `true` | The initial `interactable`. |
| `tooltip` | None | A tooltip shown while the button is hovered (see [Tooltips](#tooltips)). |
| `onClick` | None | The action, run on release inside the button (or on press with `clickOnPress`). |

The `UIButton` component also has `touchSlide` (follow the finger and activate on release; off for controls with their own drag gesture), `changeCursor` (show the pointing hand), `hapticsEnabled`, `canInteract` (a temporary gate that keeps the normal look), `onHoverEnter`, `onHoverChange`, `onStateChange` and `trigger()`, which presses the button from the keyboard (its sound and action) when it could be pressed now. Factories set images, callbacks and polygons before activating the node, so no hover fires during construction.

**Capture.** `UIButton` follows the original's shared capture. A left or right press stays with its button while the pointer is dragged, and no other button can hover until the release. Releasing inside clicks once; releasing outside cancels. Desktop mode listens to mouse events and mobile mode to touch events, so a simulated touch never activates a button twice. `onHoverEnter` tracks the actual entry, independently of the visual state, and plays `hoverSound`. Disabling or destroying a button, or switching pages, cancels its capture.

**Polygon hit areas.** `polygon` lists local pixels from the button's top-left corner, x right and y down, within its `width` and `height`. Three or more vertices enable polygon hit testing; otherwise the rectangle is used. Edges count as inside, concave polygons work, and node scaling and rotation are taken into account. Hover, both mouse buttons, touch and release-outside all use the same area; points outside it pass through to the controls below. Press offsets move only the visual.

#### Tooltips

A button's `tooltip` is a string or `{ text, title?, warning?, font?, maxWidth?, gap?, offset?, surface?, fixed? }`. The popup uses the original's colors: a pale yellow box with a black border, the text in Pico129 (`packetCost`), an optional title in Pix118Bold and an optional warning line in red.

- It follows the actual hover, appears below the anchor (`gap`, 4 px by default), flips above it when there is no room, and stays within the enclosing viewport, mask or Canvas, 2 px from its edges.
- Long text wraps by the original's rules (`ToolTipWidget::GetLines`): at the first space at or past the target width, and at each newline. Text without spaces, such as Chinese, breaks only at the newlines written into it.
- `offset: [x, y]` moves it right and down before edge clamping. The gardens' tooltip uses it (see [Gardens, Help and the award page](#gardens-help-and-the-award-page)).
- `fixed` puts the popup's top-left corner at the anchor's (a `ToolTipWidget` at a fixed position, as the main menu's trophy uses); `surface` draws it on another node when the control is inside a clipped area.
- `ui.tooltip(anchor, options)` creates one for manual `show()` and `hide()`, with settable `text`, `title` and `warning`. Disabling the anchor hides the popup; destroying it removes it.

#### Text input

`ui.input(parent, options)` creates a `UIInput` on the original edit-box art. It exposes `value`, `interactable`, `focus()`, `blur()`, `selectAll()`, `hasFocus`, `hasSelection` and `color`, and calls `onChange`, `onSubmit` and `onCancel`.

- `filter` sanitizes input and `maxLength` limits it. Characters the bitmap font cannot draw are dropped whatever the filter allows, and only the first line is kept.
- Cocos `EditBox` handles the keyboard, IME and clipboard; the original bitmap text, the edit-box art, the selection and the caret are drawn by the game. Access to the browser's selection stays inside the component.
- The pointer places or drags the caret, and a double click (within 500 ms and 6 px) selects everything. The hover cursor is the text I-beam.
- Typing Space in a focused field never confirms the dialog. Tab moves between fields unless `onKey` takes it; `completion` draws a faded suffix after the caret and `onCompletionTap` accepts it with a tap (the debug console).
- A modal opened above releases the focus; the user dialogs restore it when their validation message closes.
- `keyboardType` (ASCII by default) and `autocorrect` (off by default) set the iOS keyboard. On iOS browsers the hidden DOM input stays at the top-left corner, so the page does not pan when the keyboard opens; while the keyboard is down, a tap on a field reaches WebKit as an ordinary tap, so the field can take keyboard focus back. On Android the native editor is hidden inside the game's screen, and text being composed is shown as it is typed.
- In mobile mode, an input inside a dialog moves the dialog's panel up.

#### Scroll areas

`ui.scroll(parent, { x, y, width, height, contentHeight, wheelStep?, pageHeight?, scrollbar?, colors?, wheelDuration? })` creates a vertical `UIScroll` with the GOTY `ScrollbarWidget`: 8 px wide, its left edge 6 px inside the area's right edge, no arrow buttons. Add labels, images or other nodes to `scroll.content`, using `scroll.contentWidth` for layout (7 px narrower while the bar shows).

- `scroll.offset` scrolls to a pixel offset at once; `scroll.scrollTo(offset, seconds)` animates there with a double S curve.
- Call `scroll.setContentHeight(height, drawnHeight?)` after the content changes. `drawnHeight` lets the range reach drawn content taller than the measured one without changing the thumb.
- The component owns clipping, the bar's automatic visibility, the original thumb drawing and dragging, track paging (a held track pages again after 25 updates of 10 ms, then every 5), touch inertia and listener cleanup. It runs on the global clock.
- `wheelStep` is the pixels per wheel notch (12 by default). A notch is a wheel delta of 120; a touchpad's smaller deltas move proportionally less, at most one notch per event.
- `pageHeight` (the height by default) is how far a track click pages, and scrolling stops with that much content showing. `colors` are the bar's six `ScrollbarWidget` colors (track, track while paging, thumb, edge, shadow, highlight); the default is the zombie almanac's set.
- `scrollbar: false` hides the bar and keeps the full content width. `wheelDuration` turns on the previous double-S easing for wheel steps.

#### Sliders, checkboxes and selects

- `ui.slider` draws the original slot and knob, 135 px wide by default. Pressing the knob drags it; pressing the slot moves the knob to the press. Releasing plays a click.
- `ui.checkbox` is 46×45 and toggles on press. With `locked`, a press calls `locked()` instead of toggling; Options uses it for 3D acceleration and for full screen when it is forced.
- `ui.select` is a stone button showing the current item; clicking it opens a dialog with a button for each item.

#### Dialog frames

`ui.dialog(parent, options)` builds the original dialog frame, or a single `background` image (the Options dialog), centred on whole units as `LawnApp::CenterDialog` does.

| Option | Effect |
| --- | --- |
| `title`, `message` | The header (the `title` font) and the wrapped message (the `body` font), in the original's text color |
| `width`, `height`, `extraWidth`, `extraHeight` | Size; by default it grows from the title and message as `LawnDialog::CalcSize` does |
| `tall` | The tall bottom frame |
| `centerMessage` | `false` places the message at the top instead of centring it in its area |
| `contentInsetTopExtra`, `spaceAfterHeader` | Extra space above the title, and below it (3 by default, `LawnDialog`'s value; `Dialog` uses 10) |
| `footer`, `confirmText`, `cancelText`, `buttons` | The footer: OK, OK and Cancel, or up to two buttons of your own plus an optional third, full-width one |
| `clickSound` | The sound of a footer release and of keyboard confirmation or cancellation |
| `onClose` | Called with whether the dialog was confirmed |

`UIDialog` keeps a stack. The topmost dialog takes Enter and Space (confirm) and Escape (cancel), after any focused `UIInput` and its own `onKeyDown`. `result` resolves with whether it was confirmed; `onConfirm` and `onCancel` may be replaced. A dialog is modal (it blocks input below and opens a modal scope for hover), can be dragged by its panel's background (with the dragging-hand cursor) unless `draggable` is false, and is kept within the viewport, refitting when the viewport resizes. Outside `/highresolution` a dragged dialog moves by whole units.

### Input, hover and cursors

- **`UIHoverManager`** runs on the app's root node. It remembers the last pointer and asks its clients (buttons, inputs, the dialog drag, the level HUD) what is hovered, scoped to the topmost modal root: the open dialogs and the current page. Transitions block input entirely (`beginInputBlock`). Closing a dialog restores hover from the remembered mouse position. It also sets the cursor: the pointing hand over a client that asks for it, the I-beam over a text field and the dragging hand while a dialog is dragged; when nothing is hovered, the default arrow or none (`setIdleCursor`, for Whack a Zombie's mallet, as `Board::UpdateCursor`).
- **`CursorManager`** maps `default`, `pointer` and `grabbing` to `pvz:cursor_pointer`, `pvz:cursor_hand` and `pvz:cursor_dragging` at the original hotspots (0, 0), (11, 4) and (15, 10), scaled for higher-density replacements. The web uses CSS cursors; native Windows and macOS use SDL color cursors through the engine's `jsb.setCursorImage`. Other styles, and every style with `/cursor` off, stay system cursors. Some decorative controls keep the arrow (`changeCursor = false`): the achievements page's return button and More rock, the main menu's flowers and trophy.
- **`ScrollGesture`** converts wheel deltas to steps (120 a notch, at most one per event) and drives touch dragging with inertia: the release speed carries on if the finger moved within the last 100 ms, decaying until it falls below 8 px a second.
- **`WheelPageTurner`** turns pages with the wheel as their buttons turn them: one notch a page, down for the next page, with a tap sound. A touchpad's small steps add up to one notch, and a change of direction starts again.

### Menu shell

#### Pages and dialogs

`client/screens/MenuPages.ts` declares the pages: `splash`, `title`, `main`, `minigames`, `puzzle`, `survival`, `almanac`, `plants`, `zombies`, `store`, `garden`, `mushroom`, `aquarium`, `tree`, `achievements`, `help` and `award`. Each `MENU_PAGES` entry gives its music, `heading`, backgrounds, the targets of its buttons, its `back` target and whether it keeps the previous page (`retainPrevious`).

Options (`options` from the main menu, `gameOptions` in a level), the player list, the quit confirmation, the pause dialog and game over are not pages but menu dialogs (`client/dialogs/MenuDialog.ts`), like the original's Dialogs. `GameApp.openDialog` opens one at a time over the current page or the paused level, which stays mounted and takes no input until the dialog closes. Main menu buttons name a page or a dialog with the same `target`.

- `MenuPages.heading` declares the original title fonts, baselines and colors, with the text from `pvz:strings`; there are no placeholder title bars. The store draws its original sign instead, and the award page its own title.
- The store, the almanac pages and the achievements page keep their caller (`retainPrevious`), so closing them does not replay the main menu's entrance; a garden stays under the store the same way. Help, the challenge pages, the gardens, the title and gameplay replace and destroy the main menu; returning creates a fresh one, with its entrance.
- The achievements page is built once, behind the loading screen, and never destroyed; each visit refreshes it.
- Navigation history: the almanac index and its two lists count as one page, so CLOSE leaves all of them. A page opened from a running level (by the debug console) goes back to the level. The almanac opened from the in-game options returns to the options; the almanac opened from an award page continues to the next level when closed.

#### Transitions and fades

- `MenuScreen.prepare()` loads the next page before `ScreenTransition` commits it. Only resource preparation, page commits and the achievements slide lock input; loading failures keep the caller and the history.
- Between the main menu and the achievements page, both pages slide 600 px vertically over 0.75 seconds with the original double S curve, overlapping by one pixel to avoid a seam; the main menu stays alive off screen.
- `PageFade` belongs to its page. An ordinary award page fades in from white; Help and note awards fade in from black, stop the music and play the paper sound. The fade lasts 180 game ticks of 10 ms (1.8 seconds at normal speed), starts when the page activates and goes with the page. It only draws: pointer input and keyboard navigation, such as Help's Enter, Space and Escape, work during it.
- Other pages and dialogs switch at once, with no generic fade.

## Mapping to the original

| Remake | Original (Steam 1.2.0.1096) |
| --- | --- |
| `StartupScreen` | The PopCap logo and `TitleScreen` |
| `MainMenuScreen` | `GameSelector` |
| `ChallengeScreen` | `ChallengeScreen` |
| `AlmanacScreen`, `AlmanacText`, `AlmanacEntityView` | `AlmanacDialog` |
| `StoreScreen` | `StoreScreen` |
| `AchievementScreen` | `AchievementsWidget` |
| `AwardScreen`, `AwardAchievements` | `AwardScreen` |
| `PageFade` | The fades of `AwardScreen` and the help screen |
| `LevelSeedChooser` | `SeedChooserScreen` |
| `OptionsDialog` | `NewOptionsDialog` |
| `UI.dialog`, `UIDialog` | `Dialog` and `LawnDialog` |
| `UI.button`, `UIButton` | `GameButton` and the SexyAppFramework button widgets |
| `UIScroll` | `ScrollbarWidget` |
| `UITooltip` | `ToolTipWidget` |
| `CursorManager` | `LawnApp::EnforceCursor` |
| Window placement (`Game.cpp`) | The `PreferredX`/`PreferredY` registry values |
