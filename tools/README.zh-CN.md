[English](README.md)

# 开发脚本

目录按用途划分。根目录只放本说明、Node 模块配置 `package.json`，以及由你自行提供、被 Git 忽略的原版输入文件：

```text
tools/
├── bench/compare.ts            # 在已构建的游戏上运行游戏内性能基准并对比
├── build/
│   └── clean-native-assets.ts  # 原生构建前清除输出目录中旧的 data/assets 和 Xcode 已构建的应用（由 Windows、macOS 和 iOS 构建命令调用）
├── installer/                  # 安装包：package-windows.ts 生成 Windows 安装程序（windows.iss，Inno Setup）和压缩包，package-macos.ts 生成各架构的 macOS 磁盘映像
├── kernel/build.ts             # 把 C++ 内核编译为 Wasm
├── mod/                        # 模组的初始化、打包、校验、宿主模块列表生成与配置读取
│   ├── cli.ts
│   ├── content.ts
│   ├── hosts.ts
│   └── test.ts
├── preview/check-imports.ts    # 检查 Cocos 预览的模块映射
├── profile/ios.ts              # iOS 上的 JS 性能采样
├── pvz/                        # 原版 PAK 的导入与转换，anim-defs.json 和 ui-strings.json
├── resources/                  # 应用图标，字体与图像超分辨率
│   └── licenses/               # 资源处理工具的第三方许可证
├── local/                      # 被 Git 忽略的本地资源包生成脚本
├── main.pak                    # 被 Git 忽略：原版资源包，build:content 的默认输入
└── PlantsVsZombies.exe         # 被 Git 忽略：原版程序；build:content 从中提取鼠标指针，build:icons 从中提取图标
```

常用入口：

| 用途 | 命令 |
| --- | --- |
| 从原版 PAK 和程序导入基础资源并发布 ZIP | `npm run build:content -- --pak /path/to/main.pak --exe /path/to/PlantsVsZombies.exe` |
| 初始化、打包和校验模组 | `npm run mod:init`、`npm run mod:pack`、`npm run mod:test` |
| 重新生成模组宿主模块列表 | `npm run mod:hosts` |
| 检查 Cocos 预览的模块映射 | `npm run check:preview` |
| 打包 Windows 安装程序和压缩包，以及 macOS 磁盘映像 | `npm run package:windows`、`npm run package:macos` |
| 为 Cloudflare Pages 准备 Web 构建，并检查一次部署 | `npm run package:pages`、`npm run verify:pages -- <部署地址>` |
| 把共享的 C++ 内核编译为 Wasm | `npm run build:kernel` |
| 用原版程序的图标生成网页与原生应用图标 | `npm run build:icons -- --exe /path/to/PlantsVsZombies.exe` |
| 字体与图像超分辨率 | `python3 -m tools.resources.upscale_fonts`、`python3 -m tools.resources.upscale_ui` |
| 处理模组自带的前院门图，用于时段切换 | `python3 -m tools.pvz.doors mods/<name> [--namespace widescreen]` |
| iOS 上的 JS 性能采样 | `npx tsx tools/profile/ios.ts ...` |
| 用性能基准对比已构建的游戏 | `npm run bench -- <A> [<B>]` |
| 资源转换工具的测试 | `npm run test:tools` |

Python 命令需在项目根目录运行。`npm run build:content` 调用 `python3 -m tools.pvz`，转换的实现位于 `pvz/`：

```text
pvz/
├── __main__.py             # PAK 导入命令的入口
├── anim-defs.json          # 原版动画的转换规则
├── ui-strings.json         # 本项目新增的界面文本，导入时合并进 pvz:strings（键名不得与原版重复）
├── importer.py              # 导入流程与资源清单
├── pak.py                   # PAK 解包、文件名规范化、临时目录
├── images.py                # 图像与 Alpha 通道合并
├── doors.py                 # 前院门图，白天和黑夜处理成同样的大小和位置
├── reanim.py                # Reanim 轨道、片段与动画标记
├── oversized.py             # 舞者僵尸与伴舞僵尸的美术比其他僵尸大四分之一，连同其 Reanim 缩到与其他僵尸相同的尺寸
├── compiled_reanim.py       # 原版编译后动画的解码
├── particles.py             # 粒子 XML 转换
├── compiled_particles.py    # 原版编译后粒子的解码
├── fonts.py                 # 位图字体
├── pe.py                    # 原版程序的资源（PE 资源目录）及其图标
├── cursors.py               # 从原版程序中提取鼠标指针
├── strings.py               # 原版文本
├── audio.py                 # 音效转换
├── music/                   # 音乐转换与 libopenmpt 绑定
└── cache/                   # 由动画渲染的植物静帧图集，供资源包随包附带（例如 jiangnan 的手持与种植预览）
```

原版资源的转换规则位于 `tools/pvz/anim-defs.json`：

- 不写 `animations` 时，自动读取 Reanim 的 `anim_*` 标记；显式列出时只取其中部分片段。没有标记时使用完整的 `default` 动画。
- `slots` 配置部件挂点；`hiddenTrackPrefixes` 过滤掉不需要的装备轨道。
- `exports` 把原版片段映射到游戏使用的资源 ID；Python 中不再另外保存一份导出列表。

`local/` 存放不进 Git 的本地资源包生成脚本；脚本源码保留在这里，各自需要自己的素材输入。

Node 工具全部用 TypeScript 编写，通过项目自带的 `tsx` 运行；Python 负责解码和转换原版资源。

`mod/content.ts` 为模组打包和不依赖引擎的测试读取作者的配置；`mod/test.ts` 实现 `mod:test` 的校验。

PAK 只会解包到临时目录，转换结果直接写入 `mods/pvz-base/assets/`。日常修改已有资源后，只需执行：

```bash
npm run mod:pack -- pvz-base --publish assets/resources/base.zip
```
