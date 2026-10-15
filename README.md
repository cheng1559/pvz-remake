# PvZ Remake

The `refactor/architecture` branch starts from a minimal Cocos project. It contains one 800×600 scene with built-in Canvas, Camera, and Label components displaying the project name. No gameplay logic is included.

Requires Cocos Creator 4.0.0-alpha.35 and a local Cocos CLI installation.

```sh
npm run preview
npm run build
```

`preview` starts the browser preview. `build` creates a Web Mobile debug build. No project npm dependencies need to be installed.

Project structure:

```text
assets/scenes/                 Base scene and asset metadata
settings/cocos.config.json     Cocos configuration
build-configs/debug.json       Debug build configuration
```
