# UI

The UI toolkit (`client/ui`), the menu screens and the level's input. The rules every page and dialog follow are in [Architecture](ARCHITECTURE.md#menu-backend) for the data and here for what is drawn.

## Components

The in-level Menu is the original 117×46 stone button at (681, 10), shown after the entrance. It first cancels a held plant, then opens the existing game Options dialog for settings, confirmed restart, and saved return to the main menu. Space opens the separate `GAME PAUSED` dialog; Escape remains a pause shortcut. Resume/Enter/Space/Escape return to the same board, and holding Space cannot toggle repeatedly. Pause saves the current game and freezes server logic, scene Reanim/particles/tweens and music without changing the global clock. Only previously enabled animation components resume. The pause dialog reserves the reference header spacing for its deferred newspaper-zombie animation.

`client/ui/UI.ts` creates labels, buttons, inputs, checkboxes, selects, sliders, scroll areas, and dialogs. Coordinates are parent-local pixels, with x pointing right and y pointing down. Text uses the existing `FontRenderer` and original bitmap fonts. Controls reuse the reference textures and interactions. Programmatic `value` changes are silent; user input invokes `onChange`.

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

`ui.scroll(parent, { x, y, width, height, contentHeight, wheelStep?, pageHeight?, scrollbar?, colors?, wheelDuration? })` creates a vertical `UIScroll`. Add labels, images, or other nodes to `scroll.content`, using `scroll.contentWidth` for layout. Set `scroll.offset` to scroll in pixels, and call `scroll.setContentHeight(height, drawnHeight?)` after content changes; `drawnHeight` lets the range reach drawn content taller than the measured one without changing the thumb. The component owns clipping, automatic scrollbar visibility, legacy thumb rendering/dragging and track paging, touch inertia, and listener cleanup; it uses the global clock. `pageHeight` (the height by default) is what a track click pages by, and the scroll stops with that much of the content showing; `colors` are the scrollbar's. The almanac follows the Steam 1096 `AlmanacDialog`: a page of 85% of the box (so the end usually leaves 15% blank), 5% of the text per wheel step, and its page's scrollbar colors. `scrollbar: false` retains full content width; `wheelDuration` enables the previous double-S easing, and `scroll.scrollTo(offset, seconds)` animates programmatic movement.

Labels expose `text`, `color`, and `setPosition(x, y)`; buttons expose `setText()` and `interactable`; input controls expose `value`. Dialogs support modal input blocking, dragging, topmost Enter/Space/Escape handling, and `close()`.

`UI.label` accepts a font preset or loaded `BitmapFontAssets`, and `node` binds an existing prefab text node without adding a second renderer. `pixelAlign` rounds the final position for original HUD text. Adventure 1-1 uses these labels for sun, level, house name and advice; fonts still come from its content registry so Mod overrides apply. Seed packets use `UIButton` for press/capture/modal handling, with suspension disabling the component. Cooldown, selection, flashes, advice animation and the progress meter remain specialized rendering.

`UIInput` exposes `value`, `interactable`, `focus()`, `blur()`, `selectAll()`, and `onChange`/`onSubmit`/`onCancel`. `filter` sanitizes input and `maxLength` limits it. Cocos `EditBox` handles keyboard, IME, and clipboard input; original bitmap text, edit-box art, selection, and caret remain game-rendered. Web selection access stays inside the component. Pointer input positions/drags the caret or selects all on double click, with a text cursor. Focused typing Space does not confirm a dialog. Upper modals release focus; closing validation feedback restores it.

`dialogs/UserDialog.ts` calls `MenuApi` for selecting, creating, renaming, and deleting users; the backend validates and persists these operations. It shows up to eight users with the current user first; single click selects, double click/OK commits, and Cancel preserves the current user. Names follow the reference limit of 12 ASCII letters/digits/spaces, with collapsed spaces and empty/case-insensitive duplicate validation. Confirmed deletion removes only that user's legacy and primary/temp saves. First launch and deleting the last user require creating a user. The retained main menu refreshes its name and Adventure state. User dialogs reuse the shared tall-bottom frame, extra sizing, and top-aligned message layout.

Buttons select original presets through `skin`. Sizes default to the source image, except stone buttons (180×46):

| skin | Appearance |
| --- | --- |
| `stone` | Default tiled stone button with highlighted hover glyphs |
| `back` | Large Options return button, 360×100 |
| `seed` | Large seed chooser button, 156×42, additive glow and disabled image |
| `seedSmall` | Small seed chooser button, 111×26, hover image swap |
| `almanacIndex` | Almanac footer index button, 164×26, text offset to the right |
| `almanacClose` | Almanac footer close button, 89×26, text offset to the left |
| `image` | Custom image button with optional `text`; inferred when `images` is supplied |

```ts
ui.button(parent, { skin: 'seed', text: 'Continue', x: 20, y: 80, onClick: next })
ui.button(parent, {
    x: 400, y: 100,
    images: { normal, hover, pressed, disabled }, // SpriteFrames; only normal is required
    polygon: [[7, 1], [328, 30], [314, 125], [1, 78]],
    onClick: startAdventure,
})
```

Load images with the existing `modResources.asset(id, SpriteFrame)`. Missing states fall back to the normal image; pressed first falls back to hover. Disabled buttons without a disabled image use half opacity. Override `font`, `color`, or `pressOffset: [x, y]` as needed. Set `pressSound` or `clickSound` to `null` to mute it, and `rightClickTriggers: false` to disable right-click activation. `rightClickPressesVisual: false` keeps right-click activation without a pressed visual, as used by the Almanac footer presets.

Custom image buttons accept `imageBox: { x, y, width, height }` to separate image bounds from the hit area, and `hoverSound` for a hover cue. The main menu's bottom buttons use this to preserve their larger reference hit areas while keeping images at their natural size.

A button's action is `onClick`, run on release inside; with `clickOnPress`, a mouse or touch press runs it at once. `pressSound` plays on press and `clickSound` with the action. Garden switching uses `clickOnPress`. Add `tooltip: 'text'` or `tooltip: { text, font?, maxWidth?, gap?, offset? }` to a button for a Pico129 tooltip with the previous pale-yellow background and black border. `offset: [x, y]` adjusts right/down before edge clamping; the garden tooltip keeps the previous center x=599, top y=52. It follows actual hover, appears below the button, flips above when needed, wraps long text, and stays within the enclosing viewport/Canvas. `ui.tooltip(anchor, options)` also exposes `show()`/`hide()` for manual use; disabling or destroying the anchor hides/cleans up its popup.

`UIButton` follows the reference shared capture behavior. Left/right presses stay with the original button through dragging; other buttons cannot hover until release. Releasing inside clicks once; releasing outside cancels. Desktop uses mouse events and mobile mode uses touch events to avoid duplicate simulated-touch activation. `releaseToNormalOnPressOut` defaults to normal visuals for original presets; `image` retains highlight but removes the pressed offset. The cursor returns to default outside in both cases. `rightClickPressesVisual: false` retains right-click activation without pressed visuals.

`onHoverEnter` tracks actual entry independently of visual state and drives `hoverSound`. `UIHoverManager` owns topmost hits, modal/page scopes, and cursor updates. Closing a dialog restores hover from the remembered mouse position; disabling, destroying, or switching pages cancels capture. `refreshHoverOnEnable` defaults to true; main-menu buttons follow the reference with this automatic refresh disabled. Factories configure images, callbacks, and polygons before activating nodes to avoid premature hover during construction.

Help uses the `seed` return button, and the Almanac footer uses its dedicated index/close presets. These controls and the Almanac's View Plants/View Zombies buttons are wired to page navigation at their reference positions.

`polygon` uses local pixels from the button's top-left corner, with x right and y down, within its `width`/`height`. Three or more vertices enable polygon hit testing; otherwise the rectangle is used. Edges and concave polygons are supported, including node scaling and rotation. Hover, left/right mouse input, touch, and release outside share the same hit area; points outside pass through to controls below. Press offsets move only the visual.

Options preserves immediate volume updates, the 0.65 sound-effect scale, fullscreen submission on close, required 3D acceleration, and forced fullscreen on native mobile. Restart and return-to-menu actions require confirmation; returning saves the level. Settings retain the `pvz-remake:settings:options` storage key. Native Windows and macOS remember the window like the original's `PreferredX`/`PreferredY`: `Game.cpp` follows the normal (not fullscreen, maximized or minimized) window's position and size, writes them to `window.txt` in the writable path on exit, and reads them before creating the next window, falling back to the centred 800×600 window when the position is no longer on any display.

## Screens

`StartupScreen` automatically plays the 200-tick PopCap fade/hold/fade, followed by the falling title, rolling grass bar, and flower/zombie-head effects at the five reference thresholds. Timing uses 100Hz ticks from the global clock; effects use the current `ReanimPlayer`. Progress tracks actual main-menu image/animation preparation. The prepared menu stays hidden and is reused when input starts its entrance. Once resources are ready, the bar follows button mouse rules; background presses, touches, or any key can also start. Returning to the title skips PopCap. Generate the new clips with `npm run build:content -- --pak /path/to/main.pak`; the scoped build updates the existing conversion outputs and repackages the builtin ZIP.

Temporary black title bars are removed. `MenuPages.heading` declares original title fonts, baselines, and colors, with text from `pvz:strings`; Store uses its original sign. `ChallengeScreen` draws the 20/20/11 Mini-games/Puzzle/Survival thumbnail buttons and profile trophy counts, reusing `UI.button` capture and visual states. Selecting an unimplemented mode shows an unavailable dialog. `MenuPageControls` supplies garden cycling/Store entry and the achievement return button. Awards use original button images while retaining Adventure 1-1 replay.

`MainMenuScreen` composes the current `ReanimPlayer`; The presentation `mainMenu` (`main-menu.json`) holds the reference button images, track offsets, and polygon hit areas. The entrance plays `open → sign` and holds the final pose, with independent clouds, grass, and clickable flowers. Store, Almanac, and achievements retain their caller, so closing them does not replay the menu entrance. Help, challenges, gardens, title, and gameplay replace and destroy the old menu; returning creates a fresh instance and entrance. `MenuPages.retainPrevious` declares these lifetimes explicitly, including retaining a garden beneath Store. Options, the player list, quit confirmation, pause, game over, and the in-game options are not pages but menu dialogs (`client/dialogs/MenuDialog`), like the original's Dialogs: `GameApp.openDialog` opens one at a time over the current page or the paused level, which stays mounted and takes no input until it closes. Main menu buttons name a page or a dialog with the same `target`. The Adventure button reads the profile for its start/continue image and level digits, then plays the 4.5-second flash, zombie hand, and sounds before entering the existing Adventure 1-1. Zombatar currently shows an unavailable message.

`MenuScreen.prepare()` loads the next page before `ScreenTransition` commits it. Main menu/achievements use the reference 0.75-second vertical slide and double S curve, retaining the active menu offscreen. `PageFade` belongs to the page: ordinary awards reveal from white and Help from black over the reference 180 game ticks of 10ms each (1.8 seconds at normal speed). It starts on activation, disappears with its page, and only draws; pointer input and keyboard navigation remain available during the fade. Help's Enter/Space/Escape return to the menu. Only resource preparation, page commits, and achievement slides lock navigation. Other pages and dialogs switch immediately without an extra generic fade. Loading failures preserve the caller and history.

`AlmanacScreen` provides the plant packets, static zombie thumbnails, selection, detail cards, costs, recharge labels, and colored bitmap descriptions. `AlmanacEntityView` shows the plant or zombie of the details without making a combat entity. Off the board an entity is as the original's `Plant` not in play (`IsInPlay()` false) or `Zombie` (`ZOMBIE_WAVE_UI`) is: its animation follows the level's rules, a plant's by `shared/content/plantAnimation` (by which the server steps the plants in a level) and a zombie's standing by `shared/content/zombieAnimation` (`Zombie::LoadReanim`), and `client/view/offBoard.ts` draws it (see the off-board views in [Architecture](ARCHITECTURE.md)). In the details a plant or zombie stands off its usual place by its presentation's `almanacOffset` (the original's Y-down pixels, `AlmanacDialog::DrawPlants` and `DrawZombies`: the Grave Buster 55 lower, the Football zombie 10 left), and a zombie's thumbnail uses its `portrait`; places, scales and shadows reach the view through its `draw` argument. `AlmanacText` preserves the original markup and lays out text inside `UI.scroll`; the shared `UIScroll` and `ScrollGesture` reuse the previous `pvz-remake` TypeScript wheel, thumb-drag, and mobile touch scrolling, with inertia driven by the global clock. `StoreScreen` supplies the car, sign entrance, four shelves, hover descriptions, money, and the 0.5-second hatchback page turn, using the global clock. `server/menu/storeCatalog` reads progress and the purchase counts (the profile's `purchases`, by store item ID) from the active profile for availability, prices, stock limits, and confirmed purchases; money uses the original units ($10 per stored coin). The API reloads the profile before charging and persists it on the backend. Plant/zombie detail animations and Crazy Dave animation are deferred; purchased item effects in gameplay belong to their corresponding systems.

`AchievementScreen` reads the achievement definitions (the gameplay `achievements` table: the base game's 21 in the original order, which Mods may extend) and the active user's earned IDs once through `getAchievements()`. Triggers, granting and the award-page list are described in [Achievements](ACHIEVEMENTS.md). The view uses the previous two-column positions, 70px atlas cells at 0.8 scale, green titles, wrapped bitmap descriptions, and alpha 255/32 for earned/locked icons. Shared `UIScroll` provides the original 435px wheel step over 0.35 seconds, 230px More/Top motion, and touch inertia; animation follows the global clock. Arrow keys follow GOTY: each press sets the speed to 30, which drops by 1 every 10ms while moving that many pixels (about 435px per press); key repeats reset the speed instead of adding to it. The tiled underground background and return control move with the content. Scrolling never requests data or grants achievements.

## Level input

Touch planting follows the previous `pvz-remake`: tap a seed packet to keep it selected, drag out to show the plant and row/column guide, then release to plant. Returning to the source packet or releasing at an invalid location cancels; tapping another ready packet switches plants. `LevelInputPresenter` captures one finger until release and discards the gesture on pause. Swipe collection samples every 24px, selection highlights reuse `SeedPacketView` mobile mode, and planting uses the existing backend commands.
