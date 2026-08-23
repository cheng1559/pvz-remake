<div align="center">
  <h1>PvZ Remake</h1>
  <p>A TypeScript/Cocos Creator remake of the original Plants vs. Zombies adventure experience.</p>

  <p>
    <a href="README.zh-CN.md"><img alt="Language: Chinese" src="https://img.shields.io/badge/lang-zh--CN-red"></a>
    <img alt="Cocos Creator 4.0.0 alpha.27" src="https://img.shields.io/badge/Cocos%20Creator-4.0.0--alpha.27-55c2e1">
    <img alt="TypeScript" src="https://img.shields.io/badge/code-TypeScript-3178c6">
    <img alt="Status" src="https://img.shields.io/badge/status-early%20playable-7cc576">
    <a href="https://space.bilibili.com/3494365624273288"><img alt="Bilibili: 金色初华犬" src="https://img.shields.io/badge/Bilibili-%E9%87%91%E8%89%B2%E5%88%9D%E5%8D%8E%E7%8A%AC-00a1d6"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
  </p>
</div>

## Overview

**PvZ Remake** rebuilds the core feel of the original Plants vs. Zombies in Cocos Creator, with a focus on faithful gameplay timing, UI flow, animation playback, audio behavior, and web/mobile runtime support.

The project is source-code only. It does not include original Plants vs. Zombies assets.

<p align="center">
  <img src="docs/images/screenshots/main-menu.png" alt="PvZ Remake main menu" width="720">
</p>

## Screenshots

<table>
  <tr>
    <td><img src="docs/images/screenshots/loading.png" alt="Loading screen"></td>
    <td><img src="docs/images/screenshots/level1-1.png" alt="Adventure 1-1"></td>
    <td><img src="docs/images/screenshots/level1-5.png" alt="Adventure 1-5"></td>
  </tr>
  <tr>
    <td align="center">Loading Screen</td>
    <td align="center">Adventure 1-1</td>
    <td align="center">Adventure 1-5</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/level1-8.png" alt="Adventure 1-8"></td>
    <td><img src="docs/images/screenshots/level1-10.png" alt="Adventure 1-10"></td>
    <td><img src="docs/images/screenshots/new-plant.png" alt="New plant reward"></td>
  </tr>
  <tr>
    <td align="center">Adventure 1-8</td>
    <td align="center">Adventure 1-10</td>
    <td align="center">New Plant Reward</td>
  </tr>
</table>

## Play Online

The web build is available at:

<p>
  <a href="https://plants-vs-zombies.cc"><strong>plants-vs-zombies.cc</strong></a>
</p>

It is statically hosted on Cloudflare Pages. The first load can take a while because the browser needs to download and cache the game resources; please wait patiently on the loading screen.

## Features

### Game Restoration

- [x] Adventure mode progression from `1-1` through `1-10`
- [x] Day lawn combat loop: seed packets, sun collection, planting, projectiles, zombie waves, flag waves, lawn mowers, victory rewards, and game-over flow
- [x] Implemented plants: Peashooter, Sunflower, Cherry Bomb, Wall-nut, Potato Mine, Snow Pea, Chomper, and Repeater
- [x] Implemented zombies: regular, flag, conehead, buckethead, and pole-vaulting variants
- [x] Original-style UI flow: PopCap/startup loading, player selection, seed chooser, in-game menu, options, help, award screens, and progress meter
- [x] Partial original mode screens: Almanac and Challenge selection UI
- [x] Animation, particle, sound effect, music, font, and LawnStrings conversion from original game resources
- [x] Profile data, adventure progress, coins, settings, and in-level save snapshots
- [ ] Later-world content parity
- [ ] Mini-games, puzzle, survival, and late-game systems
- [ ] Store, Zen Garden, and Achievements completion

### Project Additions

- [x] Explode-o-nut: a 150-sun Wall-nut variant with Wall-nut health that detonates in a 3x3 area after being eaten; currently plantable only through Debug CLI commands
- [x] Browser/mobile runtime support, including mobile full-screen handling and touch-oriented controls
- [x] Debug CLI with commands for level navigation, spawning, win/lose/restart, game speed, hotkeys, hitboxes, performance toggles, audio settings, and background display
- [x] Widescreen side backgrounds with a debug toggle
- [x] Custom TypeScript runtime systems for animation playback, particle rendering, audio stem playback, persistence, and resource loading
- [x] One-step asset import pipeline for legally owned original PvZ files
- [ ] Broad device/browser compatibility validation
- [ ] Optimize iOS native performance by reducing runtime stalls, memory pressure, and rendering overhead
- [ ] Add i18n support by moving remaining hardcoded UI/debug text into language resources and supporting runtime language switching
- [ ] Import original save data from legally owned PvZ save files and map player/profile progress into this project
- [ ] Rewrite the project in Godot with a cleaner long-term runtime architecture

## Documentation

- [Development Guide](docs/DEVELOPMENT.md)
- [中文开发说明](docs/DEVELOPMENT.zh-CN.md)
- [Debug CLI Guide](docs/DEBUG_CLI.md)
- [License](LICENSE)

## Acknowledgements

- [Electr0Gunner/PvZ-Quality-of-the-Lawn-Decompile](https://github.com/Electr0Gunner/PvZ-Quality-of-the-Lawn-Decompile)
- [wszqkzqk/PvZ-Portable](https://github.com/wszqkzqk/PvZ-Portable)
- PopCap Games, for creating the original Plants vs. Zombies

## Disclaimer

This is an unofficial fan remake project.

This repository does not contain original Plants vs. Zombies assets, music, sounds, images, names, or other copyrighted game content. Those materials remain the property of their respective copyright holders.

To run the project locally, you must provide your own legally obtained copy of the original game and generate local runtime assets with the provided import tools.

This project is not affiliated with, endorsed by, sponsored by, or approved by PopCap Games, Electronic Arts, or any related rights holder.

## License

The source code in this repository is licensed under the [MIT License](LICENSE). The license applies only to the source code and project files in this repository.
