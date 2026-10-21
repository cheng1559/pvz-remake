# Debug CLI

In Debug builds, press `/` or double-tap the bottom-right 100 CSS pixel corner in mobile mode. The CLI is unavailable during startup.

The previous controls are preserved: Tab cycles completions, Up/Down recalls the last 64 commands, Enter executes, and Escape/Cancel closes. The slash is optional. Names ignore case, spaces, underscores and hyphens. Grid positions are one-based. Explicit positions can use any board row; an omitted zombie row still follows the level's spawn-row selection.

Opening the CLI pauses gameplay and presentation time. Closing restores the previous pause state while preserving any new `/gamespeed` setting. Input and commands work at zero speed. Syntax errors flash red and keep the dialog open; condition failures close it and show the reason.

See the [command table](DEBUG_CLI.zh-CN.md) for all command signatures. Common examples:

```text
/gamespeed 2
/hdseed true
/hdfont true
/sun set 999
/plant repeater 3 1
/zombie normal 3 9
/item award
/win
/home
```

`/hdseed true` enables the 100×140 backgrounds for normal and upgrade seed packets, actual Reanim portraits for all 49 almanac plants, and static Reanim portraits for all 26 zombies in the almanac list. It also covers held/grid placement previews for implemented plants, preserving static poses, shading, transparency and sizes. `/hdseed false` restores the original atlas backgrounds and cached portraits. Existing packets and zombie portraits switch immediately. The preference is saved locally and applies in levels, awards, the almanac and the shop. Imitater packets retain their original background style.

`/hdfont true` loads 4× upscaled bitmap fonts on demand and updates existing menu and level text. `/hdfont false` restores the originals. The preference defaults to off and is saved locally; size, spacing and baselines stay the same. Pico129, Pix118Bold and Mod fonts keep their original assets.

The current package provides Adventure 1-1, Peashooter, Repeater, normal zombies, sun and the level award. Completions use installed backend content. Flag waves, widescreen backgrounds and unmigrated content report that they are unavailable.

The dialog reuses `UI.dialog` and `UI.input`. Gameplay commands use the existing `debugCommand` channel and receive a `debugResult`; the backend validates and mutates the authoritative world. Audio/fullscreen settings use the menu API. Cooldown, sun-cost and collection preferences are reapplied to new sessions.
