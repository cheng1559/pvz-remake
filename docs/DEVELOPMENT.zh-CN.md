[English](DEVELOPMENT.md)

# 开发

构建游戏需要 Node.js、Python、Cocos 工具链，以及正版原版游戏的文件。原版资源在构建时转换，不存放在 Git 中。

## 所需环境

| 环境 | 用途 |
| --- | --- |
| Node.js 22.17.0 与 `node-gyp` | Cocos CLI（其安装说明的要求）以及项目的 Node 工具 |
| Python 3.10 及以上（以 `python3` 调用）与 Pillow、NumPy | `build:content`、`build:icons` 和 `test:tools`，它们都调用 `python3` |
| ffmpeg | 编码音效；从 `PATH` 中查找，或在 `/opt/homebrew/bin`、`/usr/local/bin` 中查找 |
| 对应平台的开发工具 | 原生构建，如构建 macOS 和 iOS 版本需要 Xcode |
| Inno Setup 6 | Windows 安装包 |
| Xcode 命令行工具（`codesign`、`SetFile`） | macOS 磁盘映像 |
| Emscripten（`em++` 位于 `PATH` 中） | 仅在重新编译共享 C++ 内核和音乐播放器（`npm run build:kernel`、`npm run build:music`）时需要 |
| 原版游戏文件 | 导入资源，见[原版游戏文件](#原版游戏文件) |

## 工具链

PvZ Remake 使用两个工具链仓库的 `dev/pvz-remake` 分支。游戏在 `package.json` 中声明的 Creator 版本为 `4.0.0-alpha.35`。CLI 从 `packages/engine` 读取引擎源码。

| 仓库 | 作用 | v0.2.0 核对的版本 |
| --- | --- | --- |
| [cheng1559/cocos-cli](https://github.com/cheng1559/cocos-cli/tree/dev/pvz-remake) | 提供 `cocos preview`、`cocos build` 和 `cocos make`，包括 IPA 打包。 | [`e24f0f9`](https://github.com/cheng1559/cocos-cli/commit/e24f0f92ee8b15e223512331ba7b5285b7b1ae0b) |
| [cheng1559/cocos4](https://github.com/cheng1559/cocos4/tree/dev/pvz-remake) | 提供运行时与原生引擎，包括原生鼠标指针、低分辨率摄像机的指针输入，以及 DPI 和音频播放的修复。 | [`c987978`](https://github.com/cheng1559/cocos4/commit/c987978d37fe64fc180021806838de2dde78dc38) |

全新搭建工具链时，请在游戏仓库之外进行。CLI 的安装说明使用 Node.js 22.17.0 和 `node-gyp`。其默认的 `npm run init` 会按 `repo.json` 选用上游引擎；下面的命令则把本游戏的引擎分叉放到引擎目录，并按两个分叉共同声明的标签获取原生库。

```sh
git clone --branch dev/pvz-remake https://github.com/cheng1559/cocos-cli.git
cd cocos-cli
git clone --branch dev/pvz-remake https://github.com/cheng1559/cocos4.git packages/engine
git clone --depth 1 --branch v4.0.0-10 https://github.com/cocos/cocos-engine-external.git packages/engine/native/external
npm install -g node-gyp
npm run install:engine
npm install
npm run build
npm link
cocos --help
```

如果 `cocos4` 放在单独的检出目录中，可以在 `cocos-cli/packages/engine` 建立指向它的目录符号链接（Windows 上可用目录联接）。在 CLI 根目录执行 `git -C packages/engine remote get-url origin` 和 `git -C packages/engine rev-parse HEAD`，即可确认将要构建的是哪个引擎。

## 原版游戏文件

构建需要正版《植物大战僵尸》Steam 年度版 1.2.0.1096 中的以下文件，放入 `tools/` 目录。这两个文件均被 Git 忽略。

| 文件 | 提供的资源 | 读取它的命令 |
| --- | --- | --- |
| `main.pak` | 图像、动画、粒子、字体、音效、音乐与文本 | `npm run build:content` |
| `PlantsVsZombies.exe` | 程序内置的资源：鼠标指针与应用图标 | `npm run build:content`、`npm run build:icons` |

使用 1.2.0.1073 的文件也可以完成构建，但其 `main.pak` 中的 `properties/LawnStrings.txt` 缺少部分界面文本，`images/acheesements_icons.png` 缺少"舞者精神"成就图标，因此：

- 成就页与奖励页上的成就名称和说明显示为文本键名；
- 图鉴条目的标题显示为文本键名；
- 对话框按钮、暂停菜单、选项及玩家档案管理界面的文字显示为文本键名；
- "舞者精神"的成就图标为空白；
- 启用汉化资源包后，上述文本仍无法显示中文。

## 导入资源与预览

把原版文件放入 `tools/` 后，在**游戏仓库根目录**执行：

```sh
npm ci
npm run build:content                     # 转换原版资源，约需 9 分钟
npm run build:icons                       # 生成应用图标（可选）
npm run preview:debug                     # 启动预览服务器，默认地址 http://localhost:9527
```

`npm run preview:release` 以非调试模式启动预览。在游戏中按 `/` 打开调试控制台，输入 `/level pvz:adventure-2-10` 等指令，详见[调试指令](DEBUG_CLI.zh-CN.md)。

### 基础内容

`npm run build:content` 执行的是 `python3 -m tools.pvz`：

- 输入文件默认为 `tools/main.pak` 和 `tools/PlantsVsZombies.exe`；可用 `--pak /path/to/main.pak` 和 `--exe /path/to/PlantsVsZombies.exe` 指定其他文件。文件不存在时报错。程序会先读取可执行文件，因此指定了错误的可执行文件时，会在耗时的 PAK 转换开始前就失败。
- 它把 PAK 解包到临时目录，并把资源直接转换到 `mods/pvz-base/assets/`，按 `images`、`fonts`、`audio`、`reanim`、`particles`、`music`、`json` 和 `prefabs` 分组。
- 它更新 `mods/pvz-base/content.json` 中显式的资源映射，然后调用通用的模组打包工具，把基础内容包发布为 `assets/resources/base.zip`。
- 原版动画的转换规则来自 `tools/pvz/anim-defs.json`；本项目新增的界面文本来自 `tools/pvz/ui-strings.json`，在导入时并入 `pvz:strings`。
- 转换出的资源被 Git 忽略；手写的玩法与表现数据表保持不变。
- 除发布的 `base.zip` 外，只有启动场景（`assets/scenes/scene.scene`）、关卡布局预制体（`assets/resources/ui/level.prefab`，导入时也会作为 `pvz:level` 复制到基础内容包中）和 `assets/resources/effects/` 中的着色器仍由引擎管理。

修改已有的模组资源或定义后，无需重新转换，直接重新打包：

```sh
npm run mod:pack -- pvz-base --publish assets/resources/base.zip
```

### 基础内容与存档

- 内置 ZIP 与模组使用相同的 `manifest.json` 和 `content.json`，玩法定义与表现定义直接由通用索引引用。其哈希覆盖所有默认文件和资源映射。
- 读取存档时仍会检查基础内容的 ID、版本与哈希，以及玩法模组。不匹配的存档会被丢弃，关卡重新开始。
- 模组对表现层的修改不会改动权威的玩法 JSON。

### 音乐与音效

- 音效由 `tools/pvz/audio.py` 转换为 MP3，使用 LAME VBR 质量 4，采样率 44.1 kHz。
- 音乐直接复制原版的 tracker 模块（`tools/pvz/music/tunes.py`）：`mainmusic.mo3` 和 `mainmusic_hihats.mo3` 成为 tracker 资源 `pvz:mainmusic` 和 `pvz:mainmusic_hihats`。每首曲目都是独立的音乐资源（`pvz:<tune>`），列出 Music::PlayMusic 播放的各部分，因此模组注册相同的 ID 即可替换单首曲目。
- 游戏自己播放这些模块，见[音乐](ARCHITECTURE.zh-CN.md#音乐)。

### 鼠标指针

- 鼠标指针只存在于原版程序中，不在 `main.pak` 里。转换开始前，导入工具会提取原版 `LawnApp::EnforceCursor` 显示的大箭头（程序的指针资源），以及 SexyAppFramework 的手指和拖动手掌（32×32 的 `CreateCursor` 掩码）。它按内容哈希查找这些指针，不依赖资源 ID 或文件偏移，程序资源由 `tools/pvz/pe.py` 中的 PE 资源解析器读取。
- 它们在 `content.json` 中注册为精灵 `pvz:cursor_pointer`、`pvz:cursor_hand` 和 `pvz:cursor_dragging`，随内置 ZIP 一起发布，资源包可以按 ID 替换。
- `CursorManager` 把 `default`、`pointer` 和 `grabbing` 映射到这些图像，并使用原版的热点位置（高分辨率替换图按 `scale` 缩放热点）：网页版使用 CSS 光标，原生 Windows 和 macOS 版通过引擎的 `jsb.setCursorImage` 使用 SDL 彩色光标。
- 关闭 `/cursor`，或图像加载失败时，使用系统指针。

### 应用图标

- 应用图标来自原版游戏图标，即 `PlantsVsZombies.exe` 中的 `IDI_MAIN_ICON` 图标组。`npm run build:icons` 在内存中把该图标组重建为 `.ico`，默认读取 `tools/PlantsVsZombies.exe`；`--exe /path/to/PlantsVsZombies.exe` 可读取其他副本，`--ico /path/to/icon.ico` 则改用指定的 `.ico` 文件。
- 1.2.0.1051、1.2.0.1073 和 1.2.0.1096 的图标组相同：共 12 张图像，分别为 16、32、48 和 256 像素的 4 位、8 位与 32 位版本，其中 32 位的 256 像素图像以 PNG 存储。该命令以其中最大的真彩色图像为源；16×16 的帧就是窗口标题栏上的小花。
- 它把网页图标（`game.ico`、`icon-256.png`、`apple-touch-icon.png`）写入 `build-templates/web-mobile/`，把 macOS、iOS、Android 和 Windows 图标写入 `native/engine/`。所有输出都被 Git 忽略。Windows 安装包在 `native/engine/win64/res/game.ico` 存在时也会使用它。
- iOS 图标不能透明，因此会加上白色背景和边距，避免图案被圆角裁掉。
- 该命令需要 Pillow，生成 `Icon.icns` 还需要 macOS 的 `iconutil`。

## 常用命令

`tools/` 的目录结构与各脚本入口见[开发脚本](../tools/README.zh-CN.md)。

| 命令 | 作用 |
| --- | --- |
| **测试与检查** | |
| `npm run test:server` | 服务端类型检查，以及 `tests/` 下的全部测试 |
| `npm run typecheck:server` | 仅服务端类型检查 |
| `npx tsx --tsconfig tsconfig.server.json --test tests/server/xxx.test.ts` | 运行单个测试文件 |
| `npx tsc --noEmit -p tsconfig.json` | 客户端类型检查 |
| `npm run test:tools` | 资源转换工具的测试（Python） |
| `npx tsx --tsconfig tsconfig.server.json --test mods/widescreen/tests/*.test.ts` | 模组自带的测试 |
| `npm run check:preview` | 检查预览的模块映射，见[预览模块映射](#预览模块映射) |
| **内容与模组** | |
| `npm run build:content -- --pak /path/to/main.pak` | 从原版 PAK 完整转换（约 9 分钟） |
| `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` | 修改 pvz-base 后重新打包基础内容包 |
| `npm run mod:init -- my-mod` | 在 `mods/my-mod/` 中按模板创建模组 |
| `npm run mod:pack -- mods/widescreen` | 把模组打包为 `dist/mods/widescreen.zip` |
| `npm run mod:test -- my-mod` | 打包模组并检查其服务端注册 |
| `npm run mod:hosts` | 重新生成模组可获取的宿主模块列表 |
| `npm run build:icons`（或 `npm run build:icons -- --exe /path/to/PlantsVsZombies.exe`） | 从程序的图标生成应用图标 |
| `npm run build:kernel` | 把共享 C++ 内核（`native/engine/common/kernel`）编译为 WebAssembly |
| `npm run build:music` | 把音乐播放器（`native/engine/common/music`，含 libopenmpt）编译为 WebAssembly |
| **预览与构建** | |
| `npm run preview:debug`、`npm run preview:release` | 以调试或非调试模式启动预览服务器 |
| `npm run build:web:debug` | 调试版网页构建 |
| `npm run build:web:benchmark` | 用于性能基准的发布版网页构建，见[性能基准](#性能基准) |
| `npm run bench -- <A> [<B>]` | 在已构建的游戏上对比性能基准，见[性能基准](#性能基准) |
| `npm run compile:{platform}:release` | 原生平台的发布构建，见[构建发布版本](#构建发布版本) |

`build:kernel` 把生成的模块写入 `assets/scripts/shared/kernel/binary.ts`，该文件已提交到仓库，因此其他构建不需要 Emscripten。原生构建直接编译同一份内核源码。`build:music` 同样写入 `assets/resources/music/pvz_music.bin`。

## 测试

日常检查：

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

`npm run test:server` 已包含服务端类型检查和全部 `tests/**/*.test.ts` 测试，无需单独运行 `typecheck:server`。模组自带的测试不在 `tests/` 下，需要按上表单独运行。

### 测试准则

- 自动化测试侧重核心玩法、存档与恢复、模组加载与隔离、客户端与服务端的边界，以及关键的输入流程。检查可观察的行为和必要的边界；复用或扩展已有用例，避免重复覆盖，也避免与实现细节绑定的断言。
- 简单、低风险的改动采用最少的必要验证。动画、布局和文字细节在合适时手动检查；回归风险较高时再补充自动化测试。不要为固定的美术坐标、颜色或播放速率单独编写用例，也不要读取源码文本来断言特定的代码结构。
- 日常改动运行相关的测试，必要时再运行类型检查。跨模块的改动，或要求完整验证时，运行 `npm run test:server`。
- 运行单个文件可使用如 `npx tsx --tsconfig tsconfig.server.json --test tests/server/save-restore.test.ts`。测试失败时，保留有效的检查，区分新出现的失败与原有的失败，不要通过删除或跳过关键测试来掩盖失败。
- 分别报告自动化测试、构建和运行时检查的结果。必要时在相应环境中验证画面、交互或平台行为；原生构建成功不代表已在设备上验证。除非需要验证画面或交互，否则避免使用浏览器自动化。

## 构建发布版本

| 平台 | 命令 | 输出 |
| --- | --- | --- |
| 网页 | `npm run build:web:release` | `build/web-mobile/` 中的 Web 构建 |
| Windows | `npm run compile:windows:release`，然后 `npm run package:windows` | 安装包 `dist/pvz-remake-v{version}-windows-x64-setup.exe` 和压缩包 `dist/pvz-remake-v{version}-windows-x64.zip`；打包需要 Inno Setup 6 |
| macOS | `npm run compile:macos:arm64:release` 和 `compile:macos:x64:release`，然后 `npm run package:macos` | 磁盘映像 `dist/pvz-remake-v{version}-macos-arm64.dmg`（Apple 芯片）和 `-macos-x64.dmg`（Intel）；仅能在 macOS 上构建 |
| Android | `npm run compile:android:arm64:release` | `build/android-arm64-release/` 中的 arm64 安装包；32 位设备使用 `compile:android:armv7:release`，输出到 `build/android-armv7-release/` |
| iOS | `npm run compile:ios:release` | 未签名的 IPA `build/ios/pvz-remake-mobile-unsigned.ipa`，需要自行签名；仅能在 macOS 上构建 |

- 把命令中的 `release` 换成 `debug` 即可构建调试版本，如 `npm run build:web:debug`、`npm run compile:windows:debug`。Windows 安装包和 macOS 磁盘映像只能从 Release 版本打包。
- `compile:*` 命令先运行对应的 `build:*` 命令（以 `build-configs/` 中该平台的配置调用 `cocos build`），再调用 `cocos make` 编译原生工程。
- `{version}` 为 `package.json` 中的 `version`。
- 网页版的验证不代表原生版本能够编译或已在设备上验证；原生构建成功也不代表已在设备上验证。

### 网页

1. `npm run build:web:release` 把 Web 构建写入 `build/web-mobile/`，可以用任何静态托管服务提供。
2. Cloudflare Pages 不接受超过 25 MiB 的文件，因此 `npm run package:pages`（`tools/installer/pages.ts`）在 `dist/pages/` 中为它准备一份构建：
   - 基础内容包按 16 MiB 拆成多个分片，以各自的哈希命名，构建出的游戏的 `.zip` 下载器会下载这些分片并拼接起来；
   - 引擎 `cc.js` 以带哈希的文件名再保存一份，因为 `_headers` 允许浏览器把 `/cocos-js/*` 缓存一年。

   分片和基础内容包的哈希记录在 `dist/pages.json` 中。构建中找不到唯一一处可修改的 `.zip` 下载器时会报错，例如修改了基础内容包的加载方式或代码压缩工具之后。
3. `npm run verify:pages -- <部署地址>` 检查一次部署：入口文件和引擎与准备好的文件一致，且部署中的下载器能把分片拼接成原来的基础内容包。

推送 `v*` 标签时，CI（`.github/workflows/build.yml`）会在其他平台构建完成后部署这份构建：先部署为预览并检查，再部署到 Pages 项目 `pvz-remake` 的正式环境，即 plants-vs-zombies.cc。仓库需要配置密钥 `CLOUDFLARE_API_TOKEN`（具有 Cloudflare Pages 编辑权限的令牌）和 `CLOUDFLARE_ACCOUNT_ID`。

### Windows

1. `npm run compile:windows:release` 先清除构建目录中的旧资源（见[原生构建输出](#原生构建输出)），再构建并编译出 `build/windows/proj/Release/pvz-remake.exe`。
2. `npm run package:windows` 从 Release 构建中取出游戏可执行文件、其 DLL 和 `Resources/`，并用编译它的 Visual Studio 的 C++ 运行库（`Microsoft.VC143.CRT`）替换 Cocos 复制来的旧版，玩家无需另装 Visual C++ 运行库。随后用 Inno Setup 6 编译 `tools/installer/windows.iss`，并传入 `package.json` 中的版本号，生成 `dist/pvz-remake-v{version}-windows-x64-setup.exe`；再用同样的文件生成 `dist/pvz-remake-v{version}-windows-x64.zip`，解压后是一个 `Plants vs. Zombies` 文件夹，可直接从中运行游戏。缺少 Release 可执行文件时报错。

打包脚本按以下顺序查找 `ISCC.exe`：环境变量 `ISCC`，`%LOCALAPPDATA%\Programs`、`%ProgramFiles(x86)%` 和 `%ProgramFiles%` 下的 `Inno Setup 6` 目录，最后是 `PATH`。

安装包：

- 打包游戏可执行文件、其 DLL 和 `Resources/`，不包括链接产物（`.lib`、`.exp`）和 Cocos 复制到每个构建旁的调试版 C 运行库；
- 默认为所有用户安装"Plants vs. Zombies"，安装对话框中也可选择无需管理员权限的仅当前用户安装；
- 可选创建桌面快捷方式，安装完成后可启动游戏；
- 使用固定的 `AppId`，因此新版安装包可以直接升级已有的安装；
- `native/engine/win64/res/game.ico`（由 `npm run build:icons` 生成）存在时，以它作为安装包图标。

### macOS

在装有 Xcode 命令行工具的 macOS 上：

1. `npm run compile:macos:arm64:release` 和 `npm run compile:macos:x64:release` 先清除构建目录中的旧资源和应用（见[原生构建输出](#原生构建输出)），再构建并编译出 `Plants vs. Zombies.app`，分别位于 `build/mac-arm64-release/proj/Release/` 和 `build/mac-x64-release/proj/Release/`，要求 macOS 12.0 及以上。`cocos make` 编译哪个架构，由 `build-configs/macos-arm64-release.json` 和 `macos-x64-release.json` 中 `packages.mac` 的 `archs` 指定。调试版本 `npm run compile:macos:debug` 仍同时包含 arm64 与 x86_64，位于 `build/mac/`。
2. `npm run package:macos`（`tools/installer/package-macos.ts`）把它们分别打包为 `dist/pvz-remake-v{version}-macos-arm64.dmg` 和 `dist/pvz-remake-v{version}-macos-x64.dmg`。`npm run package:macos -- arm64`（或 `-- x64`）只打包一个。

打包前：

- `native/engine/mac/Info.plist` 中的版本号（`CFBundleShortVersionString`）必须与 `package.json` 中的一致，修改一致后需重新构建；
- 先推出所有名为"Plants vs. Zombies"的已挂载卷（如之前打开的磁盘映像），否则 Finder 会去布置那个卷的窗口。

打包前会先检查所有构建，再生成映像。以下情况会报错：缺少构建；构建中含有其他架构的代码；构建中带有游戏不会加载的资源包（不在其 `src/settings.json` 的 `projectBundles` 中），这是之前的构建遗留下来的。

签名：

- 默认使用临时签名（ad hoc），并启用强化运行时和 `native/engine/mac/entitlements.plist`。证书名称会写入签名（Apple Development 证书包含其 Apple ID 的邮箱地址），任何拿到映像的人都能读到；而且除非是经过公证的 Developer ID，否则对玩家而言它并不比临时签名更有用。
- 设置 `SIGN_IDENTITY` 即改用证书签名。请填写证书的 SHA-1 哈希：钥匙串中可能有两个同名证书（如续期后的证书），`codesign` 会认为同名有歧义。

磁盘映像：

- 窗口背景为 `tools/installer/dmg-background.png`（660 × 400 点，按 144 dpi 绘制），也可以用 `DMG_BACKGROUND` 指定其他文件。缺少该文件时映像没有背景。
- Finder 会布置窗口，放入应用和指向"应用程序"文件夹的链接，卷图标使用应用的图标。
- 映像中的可执行文件会去除符号，约小三分之一；构建目录中的那份保留符号，方便调试。

相关脚本见 `tools/installer/`。

### Android

- `npm run compile:android:arm64:release` 构建 `arm64-v8a` 版本，输出到 `build/android-arm64-release/`。
- `npm run compile:android:armv7:release` 构建 `armeabi-v7a` 版本（用于 32 位设备），输出到 `build/android-armv7-release/`。

### iOS

在装有 Xcode 的 macOS 上，`npm run compile:ios:release` 导出当前资源，并调用 `cocos make` 编译、打包出供自行签名的 `build/ios/pvz-remake-mobile-unsigned.ipa`：

- arm64 iPhone Release 版本（要求 iOS 15.0 及以上）不需要开发者团队。
- Cocos 会检查 ZIP 的完整性，并在旁边写入 `.ipa.sha256` 校验文件。
- 中间产物 `.app` 保留在 `build/ios/proj/Release-iphoneos/` 下。
- 该命令会先清除构建目录中的旧资源和应用（见[原生构建输出](#原生构建输出)）。
- Xcode 会在签名前去除 Release 可执行文件的符号（约小三分之一，见 `native/engine/ios/CMakeLists.txt`），所以配置了开发者团队的签名版本依然有效。

### 原生构建输出

原生构建会保留输出目录，而构建工具不会用新文件覆盖已存在的原始资源。同一 UUID 下内容会变化的文件，如每次打包基础内容都会变化的 `assets/resources/base.zip`，会一直保持首次构建时的内容；新代码遇到旧内容，游戏就无法启动。

- Windows、macOS 和 iOS 的构建命令会先通过 `tools/build/clean-native-assets.ts` 清除构建目录中的 `data/assets`。
- Xcode 构建会把每个资源复制进应用，但不会删除工程中已不再列出的资源，所以该脚本也会删除构建目录 `proj/<配置>/` 下的应用，下次构建时重新生成。
- Android 的命令不会清除。重新打包 `base.zip` 后，请先用同样的方式清除对应构建目录中的资源再构建，如 `npx tsx tools/build/clean-native-assets.ts build/android-arm64-release`。

## 性能分析

### iOS 上的 JavaScript

iOS 禁止 JIT，V8 只能以解释器方式运行，JavaScript 的开销远高于桌面端，因此请在真机上评估性能。

1. `PVZ_JS_PROFILE=1 npm run compile:ios:release` 在不开启 `CC_DEBUG` 的前提下，为 Release 版本开启 V8 调试端口（6086）。
2. 安装应用后，用 `pymobiledevice3 usbmux forward 16086 6086` 转发端口。
3. 运行 `npx tsx tools/profile/ios.ts http://127.0.0.1:16086 10 /tmp/pvz.cpuprofile` 进行采样。

脚本的参数依次为转发后的地址（默认 `http://127.0.0.1:16086`）、采样秒数（默认 10）和输出文件（默认 `/tmp/pvz-ios-js.cpuprofile`）。它每毫秒采样一次，保存 CPU 性能分析文件，并列出自身耗时最多的 20 个函数。

### 高负载对比

使用 `/level pvz:stress-test` 并开启 `/fps`：40 株植物对 1023 只僵尸。`/perf {plants|zombies|particles|sfx|logic}` 可以每次关闭一部分，见[调试指令文档](DEBUG_CLI.zh-CN.md#性能开关)。

### 性能基准

性能基准（`app/Benchmark.ts`）每次都以完全相同的方式运行压力测试，并测量其中的耗时：

1. `npm run build:web:benchmark` 生成 Release 网页版，输出到 `build/web-benchmark/`，脚本以 Chrome 110 及以上版本为目标。
2. `npm run bench -- <A> [<B>]` 在一个或两个构建上多次运行基准，输出每个构建在各次运行中的中位数和范围。对比两个构建时，还给出 B 相对于 A 的变化，变化处于各次运行的波动范围内时标记为“~”。

目标可以是网页构建目录（用全新的无头 Chrome 打开），也可以是原生可执行文件或 macOS 应用。两个目标轮流运行（先 A 后 B，再先 B 后 A），每次都使用全新的浏览器或进程。可用选项：

- `--scenario steady`（默认）测量压力测试开局 10 秒后的视图、动画和绘制，此后服务端静止；`--scenario combat` 从正式开始起运行，包括服务端。两个场景中植物都无敌，僵尸会一直啃食到结束。
- `--frames 1200` 和 `--rounds 3` 分别设置每次运行计时的帧数（计时前先预热 120 帧）和每个目标的运行次数。
- `--screenshots <目录>` 保存每次网页运行的最后一帧，并统计它与第一次运行的画面相差的像素数。
- `--chrome <路径>` 指定浏览器。

每次运行的都是同一局游戏：关卡使用固定种子；无论一帧实际花了多久，每帧都让游戏推进 1/60 秒；客户端的 `Math.random` 按帧号设定种子。每次运行给出整帧（平均值、中位数、p99 和 1% low，即最慢的 1% 帧的平均值）、更新、更新中服务端的逻辑步、引擎的绘制、绘制调用数，以及服务端最后一个快照的校验值。校验值相同说明两次运行的是同一局游戏。

网页版在地址中加 `?benchmark=combat&frames=1200`，或原生版在命令行中加 `--benchmark=combat --frames=1200 --benchmark-out=<文件>` 启动时，游戏会运行基准，在加载界面加载完所有资源后开始。全新的浏览器或安装中没有玩家档案，它会创建名为 Benchmark 的玩家。结果输出到控制台和 `globalThis.pvzBenchmark`；原生版还会写入该文件（默认为游戏数据目录中的 `benchmark.json`），然后退出游戏。

### 调试版本

调试版本会把关卡探针挂在全局变量 `pvzLevel`（关卡控制器）上，把游戏时钟挂在全局变量 `pvzTime` 上。模组的开发与安装见[模组](MODS.zh-CN.md)。

## 预览模块映射

Cocos 预览会把每个脚本编译为 SystemJS 模块，模块中导入的是 `__unresolved_N` 占位符，由 `temp/programming/packer-driver/targets/preview/import-map.json` 按模块解析。修改了被大量文件导入的模块（如 `shared/protocol`）之后，某个模块的编译代码可能与其映射不再一致，其导入会悄无声息地来自另一个模块。运行时表现为莫名其妙的 `undefined`，如 `Cannot read properties of undefined (reading 'name')`，而 Node 测试却能通过。

```sh
npm run check:preview                # 检查，并触碰映射过期的源文件，让预览重新编译它们
npm run check:preview -- --dry-run   # 只检查
```

- 该脚本（`tools/preview/check-imports.ts`）检查每个模块导入的每个名称，确认其映射指向的源文件确实导出了它，并列出过期的导入。
- 触碰文件后，等预览重新编译完成再刷新页面。
- 没有预览构建时无可检查，脚本直接退出。
- 在预览中，`Error` 会连同调用栈写入 `temp/logs/cocos.log`，`IntegratedGameHost` 也会记录服务端的原始错误，从中可以看出出错的位置。

## 常见问题

- **修改 pvz-base 的 JSON 后要重新打包 `base.zip`**（`npm run mod:pack -- pvz-base --publish assets/resources/base.zip`），否则游戏和 `mod-resources` 测试读到的仍是旧数据。重新打包会改变内容哈希，因此之前保存的关卡中途存档将无法读取。
- **生成的文件不在 Git 中**：`mods/pvz-base/assets/` 下转换出的资源、除 `pvz-base` 和 `example` 以外的所有模组目录（如 `mods/widescreen/`）以及 `tools/local/` 都被忽略，它们的改动不会出现在 diff 中。修改它们时请明确说明，并手动打包。
- **原生构建会保留旧资源**：在 Windows 以外的平台上，重新打包 `base.zip` 后要清除构建目录中的 `data/assets`，见[原生构建输出](#原生构建输出)。
- **预览可能编译到写了一半的文件**：短时间内连续修改同一文件时，预览编译器可能读到中间版本（例如报 `xxx is not defined`）。触碰该文件即可重新编译。
- **预览的导入映射可能错位**：见[预览模块映射](#预览模块映射)。
- **添加、移动或删除模块后要重新生成宿主模块列表**（`npm run mod:hosts`）。模组通过 `client/content/hostModules.ts` 和 `server/session/hostModules.ts` 按路径获取模块，测试会检查这两个列表。
- **卡槽按序号区分**：同一种子栏中可能有两张相同的种子，因此选择、冷却和闪烁都按卡槽处理（`selection.slot`，以及事件中的 `slot`）。
- **绘制顺序沿用原版**：新加入的对象通过 `shared/content/renderOrder.ts` 中的 `renderOrder(layer, row, offset)` 使用原版的 `RenderLayer` 和偏移（见[架构说明](ARCHITECTURE.zh-CN.md#绘制顺序)），不要随意编造数值来凑效果。
- **模组会深入宿主内部**：模组用 `host.around()` 包装宿主的方法，并依赖基础游戏的节点结构（例如宽屏拓展依赖成就页的 `Background` 层）。重命名、移动或删除宿主成员之前，请搜索所有 `mods/*/src`，包括本地被忽略的模组。
- **`build:icons` 需要 `iconutil`**：脚本在所有平台上都会调用 macOS 的 `iconutil` 生成 `Icon.icns`。在其他平台上会停在这一步：此时网页、Android 和 iOS 图标已经写出，Windows 图标尚未写出。
