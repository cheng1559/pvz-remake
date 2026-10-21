# Development

The main scene mounts `app/GameApp.ts`, which coordinates the menu shell and starts `LocalIntegratedGame` through `app/LevelController.ts`. Gameplay runs in `server`; the client consumes protocol snapshots and events. Keep engine imports out of `server`, `shared`, and `ecs`.

## Server level structure

`server/level.ts` initializes shared level state and advances level progress; `levelState.ts` defines the runtime components and resources. `sun.ts`, `items.ts`, `waves.ts`, and `zombieGroans.ts` provide shared sky-sun, item, wave/award, and zombie-groan logic. The corresponding progress, wave, and groan Mod system IDs are `pvz:level-progress`, `pvz:waves`, and `pvz:zombie-groans`.

`server/tutorials/index.ts` selects a script by the level definition's `tutorial` ID and routes seed selection, cancellation, planting, cooldown completion, and sun collection callbacks. `PlantingTutorial.ts` and `SunflowerTutorial.ts` contain only their special guides. Levels without a tutorial script use the shared flow. Ordinary levels configure rows, starting sun, seeds, waves, and awards in `tools/content/pvz-base/gameplay/levels.json`; they do not need numbered server files. Special tutorials register a script without adding level branches to the main server.

## Level presentation

`client/level/LevelScene` owns the common intro → gameplay → award/game-over lifecycle, game-clock scaling, input suspension and presentation saves. It depends on the `LevelGame` client API. `LevelView` composes the HUD, input, entities, particles, audio and end presenters; `LevelSeedBank` creates and updates each configured packet independently. Board geometry, active rows, seed costs and the level number come from installed gameplay definitions.

`LevelPresentation` selects the intro and tutorial text/guide configuration using the backend tutorial ID. The accepted 1-1 grass-roll sequence, preview zombies and guide steps live in `level/adventure/Adventure11*`; the shared scene contains no 1-1 timings. `level/boards/DayBoard` owns the day background, music and doorway geometry. `LevelPlantVisuals` holds client atlas positions for currently implemented plants. Later levels add backend content and a presentation entry (or reuse an existing one); new environments implement their board presentation. They do not copy the scene, input, HUD or save controller. Only 1-1 content is currently installed.

Client saves now write `level`; the decoder accepts the previous `adventure11` field. Intro-specific validation belongs to that intro implementation. The installed `pvz:adventure11` prefab ID and script UUIDs remain stable so existing content packs and saves keep resolving their assets. `client/showcase` only contains the standalone content preview probe.

Menu data follows `screens → client/api/MenuApi → MenuTransport → server/menu/MenuService`. `shared/menu` defines request and response DTOs. The backend owns profile storage/name validation, store catalog/prices/availability/purchases, challenge progress, almanac definitions, achievement entries/unlocks, and persisted options. Views render API responses and submit IDs/actions; they never import repositories or write profiles. Price, current-user identity, stock and balance are rechecked by the backend at purchase confirmation. JSON round trips isolate client copies from backend state.

Store responses specify `highlight` (`none`, `seedPacket`, or `additive` with opacity) and optional `seedSlots`/`quantity` labels. The client renders these fields without inferring a product's appearance from its ID; catalog overrides preserve the upgrade packet and Imitater styles.

`app/LocalMenuApi.ts` connects this API to the existing in-process backend; `GameApp` injects Cocos storage at startup. Backend modules have no Cocos/client imports. Existing profile, options and per-user save keys remain compatible. Presentation assets, localized strings, layout, sound and actual fullscreen operations stay on the client. A network transport can implement the same `MenuTransport`; this worktree currently uses the local transport.

Only Adventure 1-1 is connected. The debug CLI is available in Debug and Release builds: press `/`, or double-tap the bottom-right corner in mobile mode. See [Debug CLI](DEBUG_CLI.md). Adventure 1-2 onward remains unimplemented. The main menu uses original image buttons and its Reanim entrance; Options has working settings and in-game actions. Almanac and Store have their own content and interactions; other game modes remain unimplemented. Refer to the workspace's `pvz-remake` when porting their behavior.

`StartupScreen` automatically plays the 200-tick PopCap fade/hold/fade, followed by the falling title, rolling grass bar, and flower/zombie-head effects at the five reference thresholds. Timing uses 100Hz ticks from the global clock; effects use the current `ReanimPlayer`. Progress tracks actual main-menu image/animation preparation. The prepared menu stays hidden and is reused when input starts its entrance. Once resources are ready, the bar follows button mouse rules; background presses, touches, or any key can also start. Returning to the title skips PopCap. Generate the new clips with `python tools/build_pvz_base.py --startup-only --raw-root <raw-directory>`; the scoped build retains save compatibility with previous Bundle hashes.

Temporary black title bars are removed. `MenuPages.heading` declares original title fonts, baselines, and colors, with text from `lawnstrings`; Store uses its original sign. `ChallengeScreen` draws the 20/20/11 Mini-games/Puzzle/Survival thumbnail buttons and profile trophy counts, reusing `UI.button` capture and visual states. Selecting an unimplemented mode shows an unavailable dialog. `MenuPageControls` supplies garden cycling/Store entry and the achievement return button. Awards use original button images while retaining Adventure 1-1 replay.

Release startup prepares all assets and animation sprite frames. The almanac and packet previews share the content registry from `EntityDisplay`; `ReanimRepository` shares prepared animation data and frames within each registry and retries failed preparation. Loaders read engine caches directly, and almanac pages wait for portrait/detail first poses before becoming visible. Animation nodes retain the existing page lifecycle.

`AlmanacScreen` provides the plant packets, static zombie thumbnails, selection, detail cards, costs, recharge labels, and colored bitmap descriptions. `AlmanacText` preserves the original markup and lays out text inside `UI.scroll`; the shared `UIScroll` and `ScrollGesture` reuse the previous `pvz-remake` TypeScript wheel, thumb-drag, and mobile touch scrolling, with inertia driven by the global clock. `StoreScreen` supplies the car, sign entrance, four shelves, hover descriptions, money, and the 0.5-second hatchback page turn, using the global clock. `server/menu/StoreCatalog` reads progress and purchase slots from the active profile for availability, prices, stock limits, and confirmed purchases; money uses the original units ($10 per stored coin). The API reloads the profile before charging and persists it on the backend. Plant/zombie detail animations and Crazy Dave animation are deferred; purchased item effects in gameplay belong to their corresponding systems.

`AchievementScreen` reads the 21 definitions and the active user's saved unlocks once through `getAchievements()`. `server/menu/AchievementCatalog` keeps the previous flag/icon order. The view uses the previous two-column positions, 70px atlas cells at 0.8 scale, green titles, wrapped bitmap descriptions, and alpha 255/32 for earned/locked icons. Shared `UIScroll` provides the original 435px wheel step over 0.35 seconds, 230px More/Top motion, touch inertia, and 15px arrow-key steps; animation follows the global clock. The tiled underground background and return control move with the content. Scrolling never requests data or grants achievements.

`MainMenuScreen` composes the current `ReanimPlayer`; `MainMenuConfig` holds reference button images, track offsets, and polygon hit areas. The entrance plays `open → sign` and holds the final pose, with independent clouds, grass, and clickable flowers. Options, users, quit confirmation, Store, Almanac, and achievements retain their caller, so closing them does not replay the menu entrance. Help, challenges, gardens, title, and gameplay replace and destroy the old menu; returning creates a fresh instance and entrance. `MenuPages.retainPrevious` declares these lifetimes explicitly, including retaining a garden beneath Store. Options and other overlays share the animated background and block input below. The Adventure button reads the profile for its start/continue image and level digits, then plays the 4.5-second flash, zombie hand, and sounds before entering the existing Adventure 1-1. Zombatar currently shows an unavailable message.

`MenuScreen.prepare()` loads the next page before `ScreenTransition` commits it. Main menu/achievements use the reference 0.75-second vertical slide and double S curve, retaining the active menu offscreen. `PageFade` belongs to the page: ordinary awards reveal from white and Help from black over the reference 180 game ticks of 10ms each (1.8 seconds at normal speed). It starts on activation, disappears with its page, and only draws; pointer input and keyboard navigation remain available during the fade. Help's Enter/Space/Escape return to the menu. Only resource preparation, page commits, and achievement slides lock navigation. Other pages and overlays switch immediately without an extra generic fade. Loading failures preserve the caller and history.

`core/GameClock.ts` provides the shared `gameClock` for transitions, menu timers, Reanim, particles, and the local combat frame entry. `startGameTween()` reuses Cocos Tween, applies live speed changes, and unsubscribes on completion or owner destruction. Scale frame deltas once at their entry; server ticks remain 0.01 seconds, while explicit `advance()` calls and save restoration use supplied game time. In Debug previews, call `pvzTime.setSpeed(2)` for double speed, `setSpeed(1)` to restore, or `setSpeed(0)` to freeze game time. Options pauses combat independently so menus and transitions remain usable. Audio playback rate remains unchanged.

## UI components

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

`ui.scroll(parent, { x, y, width, height, contentHeight, wheelStep?, bottomPadding?, scrollbar?, wheelDuration? })` creates a vertical `UIScroll`. Add labels, images, or other nodes to `scroll.content`, using `scroll.contentWidth` for layout. Set `scroll.offset` to scroll in pixels, and call `scroll.setContentHeight(height)` after content changes. The component owns clipping, automatic scrollbar visibility, legacy thumb rendering/dragging, touch inertia, and listener cleanup; it uses the global clock. Almanac supplies its 0.6-line wheel step and bottom padding. `scrollbar: false` retains full content width; `wheelDuration` enables the previous double-S easing, and `scroll.scrollTo(offset, seconds)` animates programmatic movement.

Labels expose `text`, `color`, and `setPosition(x, y)`; buttons expose `setText()` and `interactable`; input controls expose `value`. Dialogs support modal input blocking, dragging, topmost Enter/Space/Escape handling, and `close()`.

`UI.label` accepts a font preset or loaded `BitmapFontAssets`, and `node` binds an existing prefab text node without adding a second renderer. `pixelAlign` rounds the final position for original HUD text. Adventure 1-1 uses these labels for sun, level, house name and advice; fonts still come from its content registry so Mod overrides apply. Seed packets use `UIButton` for press/capture/modal handling, with suspension disabling the component. Cooldown, selection, flashes, advice animation and the progress meter remain specialized rendering.

`UIInput` exposes `value`, `interactable`, `focus()`, `blur()`, `selectAll()`, and `onChange`/`onSubmit`/`onCancel`. `filter` sanitizes input and `maxLength` limits it. Cocos `EditBox` handles keyboard, IME, and clipboard input; original bitmap text, edit-box art, selection, and caret remain game-rendered. Web selection access stays inside the component. Pointer input positions/drags the caret or selects all on double click, with a text cursor. Focused typing Space does not confirm a dialog. Upper modals release focus; closing validation feedback restores it.

`screens/UserDialog.ts` calls `MenuApi` for selecting, creating, renaming, and deleting users; the backend validates and persists these operations. It shows up to eight users with the current user first; single click selects, double click/OK commits, and Cancel preserves the current user. Names follow the reference limit of 12 ASCII letters/digits/spaces, with collapsed spaces and empty/case-insensitive duplicate validation. Confirmed deletion removes only that user's legacy and primary/temp saves. First launch and deleting the last user require creating a user. The retained main menu refreshes its name and Adventure state. User dialogs reuse the shared tall-bottom frame, extra sizing, and top-aligned message layout.

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

Load images with the existing `SpriteLoader.load()`. Missing states fall back to the normal image; pressed first falls back to hover. Disabled buttons without a disabled image use half opacity. Override `font`, `color`, or `pressOffset: [x, y]` as needed. Set `pressSound` or `clickSound` to `null` to mute it, and `rightClickTriggers: false` to disable right-click activation. `rightClickPressesVisual: false` keeps right-click activation without a pressed visual, as used by the Almanac footer presets.

Custom image buttons accept `imageBox: { x, y, width, height }` to separate image bounds from the hit area, and `hoverSound` for a hover cue. The main menu's bottom buttons use this to preserve their larger reference hit areas while keeping images at their natural size.

Buttons accept `onPress` for actions that start on mouse/touch down; `onClick` still runs on release inside. Garden switching uses `onPress`. Add `tooltip: 'text'` or `tooltip: { text, font?, maxWidth?, gap?, offset? }` to a button for a Pico129 tooltip with the previous pale-yellow background and black border. `offset: [x, y]` adjusts right/down before edge clamping; the garden tooltip keeps the previous center x=599, top y=52. It follows actual hover, appears below the button, flips above when needed, wraps long text, and stays within the enclosing viewport/Canvas. `ui.tooltip(anchor, options)` also exposes `show()`/`hide()` for manual use; disabling or destroying the anchor hides/cleans up its popup.

`UIButton` follows the reference shared capture behavior. Left/right presses stay with the original button through dragging; other buttons cannot hover until release. Releasing inside clicks once; releasing outside cancels. Desktop uses mouse events and mobile mode uses touch events to avoid duplicate simulated-touch activation. `releaseToNormalOnPressOut` defaults to normal visuals for original presets; `image` retains highlight but removes the pressed offset. The cursor returns to default outside in both cases. `rightClickPressesVisual: false` retains right-click activation without pressed visuals.

`onHoverEnter` tracks actual entry independently of visual state and drives `hoverSound`. `UIHoverManager` owns topmost hits, modal/page scopes, and cursor updates. Closing a dialog restores hover from the remembered mouse position; disabling, destroying, or switching pages cancels capture. `refreshHoverOnEnable` defaults to true; main-menu buttons follow the reference with this automatic refresh disabled. Factories configure images, callbacks, and polygons before activating nodes to avoid premature hover during construction.

Help uses the `seed` return button, and the Almanac footer uses its dedicated index/close presets. These controls and the Almanac's View Plants/View Zombies buttons are wired to page navigation at their reference positions.

`polygon` uses local pixels from the button's top-left corner, with x right and y down, within its `width`/`height`. Three or more vertices enable polygon hit testing; otherwise the rectangle is used. Edges and concave polygons are supported, including node scaling and rotation. Hover, left/right mouse input, touch, and release outside share the same hit area; points outside pass through to controls below. Press offsets move only the visual.

Options preserves immediate volume updates, the 0.65 sound-effect scale, fullscreen submission on close, required 3D acceleration, and forced fullscreen on native mobile. Restart and return-to-menu actions require confirmation; returning saves the level. Settings retain the `pvz-remake:settings:options` storage key.

## Resources

The base Bundle is in `assets/bundles/pvz-base`. Menus and presenters also use backgrounds, widget textures, bitmap fonts, audio, particle definitions, and particle textures under `assets/resources`; keep these available.

Place your game's `main.pak` at `tools/main.pak`, then run from the project root:

```sh
python3 tools/process_pak.py
```

The existing pipeline prepares shared resources and builds the Bundle. It requires Python 3.10+, Pillow, ffmpeg, and the music converter's libopenmpt backend. If the raw files and shared resources are already available, rebuild only the Bundle with `npm run build:content`.

For menu animation changes, run `python tools/build_pvz_base.py --main-menu-only`. This reuses the existing converter to update the 13 menu clips and their images while preserving other Bundle assets.

Save loading still checks the base content ID, version, and gameplay Mods. `manifest.saveCompatibleHashes` declares previous package hashes with compatible presentation-only changes in the same version; the next save writes the current hash. Menu-only builds verify the existing Bundle first and preserve compatibility when output changes. Full rebuilds do not inherit these declarations by default.

## Checks and builds

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

Prefer existing focused tests for changed critical logic. Avoid browser automation unless visual or interaction validation is required. Windows and Android build commands remain available; native compilation and device checks are separate from Web validation.

The `pvzPhase0`, `pvzPhase2`, and `pvzPhase4` probes remain available in debug builds. Mod examples are documented in [the Phase 0 guide](../spikes/phase0/README.md).
