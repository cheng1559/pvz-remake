<div align="center">
  <h1>PvZ Remake</h1>
  <p>基于 COCOS 4 和 TypeScript 的《植物大战僵尸》冒险模式重制项目</p>

  <p>
    <a href="README.md"><img alt="Language: English" src="https://img.shields.io/badge/lang-English-blue"></a>
    <a href="https://github.com/cheng1559/cocos4/tree/dev/pvz-remake"><img alt="COCOS 4 引擎分支" src="https://img.shields.io/badge/engine-COCOS%204-55c2e1"></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/code-TypeScript-3178c6">
    <img alt="Status" src="https://img.shields.io/badge/status-early%20playable-7cc576">
    <a href="https://space.bilibili.com/3494365624273288"><img alt="Bilibili: 金色初华犬" src="https://img.shields.io/badge/Bilibili-%E9%87%91%E8%89%B2%E5%88%9D%E5%8D%8E%E7%8A%AC-00a1d6"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
  </p>

  <img src="docs/images/header.png" alt="PvZ Remake" width="100%">
</div>

## 项目简介

PvZ Remake 是《植物大战僵尸》PC 版的开源重制项目，以 Steam 年度版 1.2.0.1096 为还原基准，使用 TypeScript 与 Cocos 4 开发，可在浏览器、Windows、macOS、Android 和 iOS 上运行。项目旨在基于现代技术栈重构并扩展原版：为玩家提供跨平台、更稳定的游玩体验，为社区提供更便捷、更规范的二次开发途径。

当前版本为 v0.2.0，已完成冒险模式白天与黑夜共 20 个关卡。在还原原版玩法的同时，项目修正了原版中部分表现与逻辑问题，并加入了阵营系统、调试指令和模组支持，详见下文。

## 如何游玩

### 在线游玩

网页版为项目的 Web 构建，部署于 [plants-vs-zombies.cc](https://plants-vs-zombies.cc)，支持桌面与移动端浏览器，可作为 PWA 安装到桌面或主屏幕。

玩家档案、关卡存档与设置保存在浏览器的 localStorage 中，已安装的模组与资源包保存在 IndexedDB 中。清除站点数据会一并删除上述内容，数据不在设备之间同步。

### 下载预构建程序

[Releases](https://github.com/cheng1559/pvz-remake/releases) 提供各平台的预构建程序。

### 自行构建

自行构建需要正版《植物大战僵尸》Steam 年度版（1.2.0.1096）中的以下文件，放入 `tools/` 目录：

| 文件 | 提供的资源 |
| --- | --- |
| `main.pak` | 图像、动画、粒子、字体、音效、音乐与文本 |
| `PlantsVsZombies.exe` | 程序内置资源：鼠标指针与应用图标 |

需要说明的是，使用 1.2.0.1073 的文件也可以完成构建，但其 `main.pak` 中的 `properties/LawnStrings.txt` 缺少部分界面文本，`images/acheesements_icons.png` 缺少"舞者精神"成就图标，因此部分文本和图像会显示异常，包括：

- 成就页与奖励页上的成就名称和说明显示为文本键名；
- 图鉴条目的标题显示为文本键名；
- 对话框按钮、暂停菜单、选项及玩家档案管理界面的文字显示为文本键名；
- "舞者精神"的成就图标为空白；
- 启用汉化资源包后，上述文本仍无法显示中文。

运行导入命令后，构建工具会转换资源并生成基础内容包；生成应用图标需要另行运行图标命令。完整步骤见[开发与构建](#开发与构建)。

## 游戏截图

### 本体

<table>
  <tr>
    <td><img src="docs/images/screenshots/loading.png" alt="加载界面" width="250"></td>
    <td><img src="docs/images/screenshots/main.png" alt="主界面" width="250"></td>
    <td><img src="docs/images/screenshots/level-1-10.png" alt="冒险 1-10" width="250"></td>
  </tr>
  <tr>
    <td align="center">加载界面</td>
    <td align="center">主界面</td>
    <td align="center">冒险 1-10</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/level-2-5.png" alt="冒险 2-5" width="250"></td>
    <td><img src="docs/images/screenshots/new-plant-award.png" alt="新植物奖励" width="250"></td>
    <td><img src="docs/images/screenshots/almanac-plant.png" alt="植物图鉴" width="250"></td>
  </tr>
  <tr>
    <td align="center">冒险 2-5：打僵尸</td>
    <td align="center">新植物奖励</td>
    <td align="center">植物图鉴</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/achievements.png" alt="成就" width="250"></td>
    <td><img src="docs/images/screenshots/teams.png" alt="阵营系统" width="250"></td>
    <td><img src="docs/images/screenshots/mods.png" alt="模组管理器" width="250"></td>
  </tr>
  <tr>
    <td align="center">成就</td>
    <td align="center">阵营系统</td>
    <td align="center">模组管理器</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/level-cheatseed.png" alt="全卡模式：选卡" width="250"></td>
    <td><img src="docs/images/screenshots/almanac-cheatseed.png" alt="全卡模式：图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/dlc-button-level.png" alt="扩展按钮资源包" width="250"></td>
  </tr>
  <tr>
    <td align="center">全卡模式：选卡</td>
    <td align="center">全卡模式：图鉴</td>
    <td align="center">扩展按钮资源包</td>
  </tr>
</table>

### 宽屏拓展与 HD 资源包

<table>
  <tr>
    <td><img src="docs/images/screenshots/hd-widescreen-level.png" alt="宽屏关卡" width="250"></td>
    <td><img src="docs/images/screenshots/hd-widescreen-almanac.png" alt="宽屏图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/hd-widescreen-achievements.png" alt="宽屏成就" width="250"></td>
  </tr>
  <tr>
    <td align="center">关卡</td>
    <td align="center">图鉴</td>
    <td align="center">成就</td>
  </tr>
</table>

### 江南 PvZ2 资源包

<table>
  <tr>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-loading.png" alt="加载界面" width="250"></td>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-menu.png" alt="主界面与选项" width="250"></td>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-level.png" alt="关卡" width="250"></td>
  </tr>
  <tr>
    <td align="center">加载界面</td>
    <td align="center">主界面与选项</td>
    <td align="center">关卡</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-almanac-plant.png" alt="植物图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-almanac-zombie.png" alt="僵尸图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/jiangnan-pvz2-achievements.png" alt="成就" width="250"></td>
  </tr>
  <tr>
    <td align="center">植物图鉴</td>
    <td align="center">僵尸图鉴</td>
    <td align="center">成就</td>
  </tr>
</table>

### HD 汉化资源包

<table>
  <tr>
    <td><img src="docs/images/screenshots/zh-cn-hd-main.png" alt="主界面" width="250"></td>
    <td><img src="docs/images/screenshots/zh-cn-hd-user.png" alt="玩家档案" width="250"></td>
    <td><img src="docs/images/screenshots/zh-cn-hd-achievements.png" alt="成就" width="250"></td>
  </tr>
  <tr>
    <td align="center">主界面</td>
    <td align="center">玩家档案</td>
    <td align="center">成就</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshots/zh-cn-hd-almanac-plant.png" alt="植物图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/zh-cn-hd-almanac-zombies.png" alt="僵尸图鉴" width="250"></td>
    <td><img src="docs/images/screenshots/zh-cn-hd-help.png" alt="帮助" width="250"></td>
  </tr>
  <tr>
    <td align="center">植物图鉴</td>
    <td align="center">僵尸图鉴</td>
    <td align="center">帮助</td>
  </tr>
</table>

## 项目架构

### 客户端/服务端

游戏采用客户端/服务端分离的架构。单机游玩时，两者运行在同一进程中，通过消息通信：

- **服务端**负责全部玩法规则，包括植物、僵尸、子弹、波次、阳光与胜负判定。战斗以固定步长推进，每秒 100 步，与原版的逻辑帧率一致。
- **客户端**负责输入、画面、动画、粒子、音效和界面。它不直接修改游戏状态，而是把玩家的操作（选卡、种植、收集阳光等）作为命令发给服务端，再根据服务端返回的状态快照和事件绘制画面。两次逻辑步之间的画面由客户端插值生成，因此在高刷新率显示器上依然平滑。

关卡存档由服务端状态（含随机数状态）和客户端的表现状态两部分组成，读档后战斗能从中断处精确继续。规则集中在服务端，也为后续的联机模式提供了基础。

```mermaid
flowchart LR
    Input[玩家输入] --> Client[客户端]
    Client -- 命令 --> Server[服务端<br/>每秒 100 步]
    Server -- 状态快照与事件 --> Client
    Client --> Output[画面与音效]
```

### 数据驱动

植物、僵尸、子弹、种子、关卡与波次、商店、成就等内容均以 JSON 数据定义，分为玩法定义与表现定义两类：前者描述数值和规则，后者描述动画、位置与音效。调整数值或新增内容通常只需修改数据，无需改动代码。

基础游戏本身也是一个内容包（`pvz-base`），与模组使用相同的格式和加载流程。模组可以按 ID 覆盖基础定义，也可以加入新的定义；需要新行为时，模组可以注册自己的植物或僵尸类型，并在数据中引用。

美术、动画、粒子、字体、音效与文本均在构建时从正版游戏资源转换而来，项目仓库不包含原版素材。

详见[架构](docs/ARCHITECTURE.zh-CN.md)。

## 新增功能

### 调试指令

游戏内置调试控制台，用于测试关卡、调整状态和切换显示选项。桌面端按 `/` 打开，移动端双击屏幕右下角打开；启动过程中不可用。控制台打开期间游戏暂停，关闭后恢复原来的状态。

输入时可省略开头的斜杠，名称不区分大小写；按 Tab 补全指令和已安装内容的名称，按上下方向键调出最近 64 条历史指令。行、列和卡槽编号均从 1 开始。参数格式错误时输入框闪红并保持打开；条件不满足时（如当前不在关卡中）控制台关闭并提示原因。

开关类指令不带参数，每次执行切换一次状态，并在屏幕上提示当前状态。开关和设置都保存在本机，重启后保留；只有 `/mobile`、`/perf`、`/gamespeed` 仅在本次运行有效，`/fullscreen`、`/music`、`/sfx` 与"选项"中的设置相同。

**界面与关卡**

| 指令 | 作用 |
| --- | --- |
| `/goto {页面}` | 打开指定界面：`main`、`minigames`、`puzzle`、`survival`、`almanac`、`plants`、`zombies`、`store`、`garden`、`mushroom`、`aquarium`、`tree`、`achievements`、`help` |
| `/level {关卡}` | 进入指定关卡，如 `/level 2-10`；跳过"是否继续存档"的提示 |
| `/restart` | 重新开始当前关卡 |
| `/reload`、`/quit` | 重新载入游戏、退出游戏 |

另有三个测试关卡，不覆盖冒险存档：`pvz:teams-demo`（阵营演示）、`pvz:stress-test`（40 株植物对 160 只僵尸的压力测试）、`pvz:seed-chooser-test`（选卡测试）。

**战斗流程**

| 指令 | 作用 |
| --- | --- |
| `/gamespeed {0-10}` | 设定游戏速度，`0` 为定格 |
| `/win`、`/lose` | 立即胜利或失败 |
| `/nextwave` | 立即生成下一波僵尸 |
| `/nextflag` | 跳到下一个旗帜波并开始预警；预警期间再次执行则立即出怪 |
| `/repick` | 在战斗中重新选卡；保留的种子沿用原有冷却，新选的种子立即可用。传送带关卡不可用 |

**植物、僵尸与地形**

| 指令 | 作用 |
| --- | --- |
| `/plant {植物} {行} {列} [阵营]` | 在指定格子直接种下植物，不受阳光、冷却和格子占用限制 |
| `/removeplant {行} {列}` | 移除指定格子的植物 |
| `/zombie {僵尸} [行] [列] [阵营]` | 放置僵尸；省略行时按关卡的出怪行选择 |
| `/damage {伤害}` | 对场上僵尸造成伤害 |
| `/kill` | 消灭场上全部僵尸 |
| `/griditem {grave\|crater} {行} {列} [阵营]` | 放置墓碑或弹坑，替换格内原有的墓碑、弹坑并清除植物 |
| `/gravezombies` | 让每座墓碑立即召唤一只僵尸 |
| `/lawnmower {trigger\|reset} [行]` | 启动或重置小推车 |

**种子、资源与成就**

| 指令 | 作用 |
| --- | --- |
| `/seed {卡槽} {种子} [阵营]` | 替换卡槽中的种子，新种子立即可用；传送带关卡中替换传送带上的卡片 |
| `/seed {卡槽} empty` | 清空卡槽 |
| `/sun {add\|set} {数值}` | 增加或设定阳光 |
| `/money {add\|set} {数值}` | 增加或设定金币，同时写入玩家档案 |
| `/item {物品} [行 列]` | 掉落指定物品；`/item award` 掉落本关奖励 |
| `/achievement give {成就}` | 授予成就，关卡中会正常弹出提示 |
| `/achievement reset [成就]` | 重置指定成就；省略时重置全部 |

**规则开关**

| 指令 | 作用 |
| --- | --- |
| `/cooldown` | 开关种子冷却 |
| `/suncost` | 开关阳光消耗 |
| `/plantinvincible` | 开关植物无敌：植物不受伤害，但仍会被减速和冰冻 |
| `/cheatseed` | 开关全卡模式：选卡界面和图鉴显示全部种子，包括模组种子与隐藏种子 |
| `/collect {auto\|click\|move}` | 设定阳光和金币的收集方式：自动、点击或鼠标经过 |

**显示与设备**

| 指令 | 作用 |
| --- | --- |
| `/fps` | 显示帧率 |
| `/hitboxes` | 显示碰撞箱 |
| `/highresolution` | 按窗口实际像素渲染，画面比原版更清晰 |
| `/sharpness {0-1}` | 调整像素放大后的边缘锐度，默认 0.5 |
| `/tilted` | 种子包插图放大并倾斜显示 |
| `/cursor` | 在原版鼠标指针与系统指针之间切换 |
| `/hotkeys` | 开关键盘热键，见下文 |
| `/autopause` | 开关失去焦点时自动暂停；关闭后，切换到其他窗口时也不再静音 |
| `/haptics` | 开关触屏振动 |
| `/mobile`、`/fullscreen` | 切换移动模式、全屏 |
| `/resize` | 允许自由调整桌面窗口大小；关闭时窗口固定 600 高，宽度随宽高比（默认关） |
| `/music {0-100}`、`/sfx {0-100}` | 设定音乐、音效音量 |
| `/perf {plants\|zombies\|particles\|sfx\|logic}` | 关闭指定部分的绘制或运算，用于性能排查 |
| `/mod` | 打开模组管理器 |

开启热键后：`1`–`9` 和 `0` 选取对应卡槽或传送带上的卡片，`F` 拿起或放回铁铲，`D` 切换定格，`R` 执行 `/repick`（重新选卡时再按一次即开始战斗），`S` 和 `C` 分别切换阳光消耗和冷却。

完整说明见[调试指令](docs/DEBUG_CLI.zh-CN.md)。

### 阵营系统

原版只用一个"被控制"标记区分为玩家作战的僵尸，并在二十多处分别判断。本项目改为阵营制：所有植物和僵尸都属于植物方或僵尸方，不同阵营互为敌对，所有攻击、啃食和胜负判定都以"是否敌对"为准。默认情况下，植物属于植物方（玩家），僵尸属于僵尸方，游戏表现与原版一致。

**朝向与移动**

- 僵尸方的单位朝左，植物方的单位朝右；子弹、爆炸范围和保龄球方向随之镜像。
- 植物方的僵尸向右行进，走出草坪右侧后消失；僵尸方的僵尸进入房屋则关卡失败。

**交互规则**

| 场景 | 规则 |
| --- | --- |
| 植物攻击 | 射手、大喷菇、大嘴花、土豆地雷和保龄球只攻击敌对阵营的植物和僵尸，不伤害己方 |
| 子弹击中植物 | 直接扣除生命值并闪白；子弹会越过小喷菇、土豆地雷等低矮植物，射手也不会瞄准它们，范围攻击仍可命中 |
| 大嘴花 | 可以整株吞下敌方植物 |
| 土豆地雷 | 对敌方植物的触发与爆炸范围向前延伸半格 |
| 僵尸啃食 | 先寻找前方的敌对僵尸，再寻找敌对植物；不啃食己方植物 |
| 减速与冰冻 | 寒冰射手的减速、冰川菇的冰冻只作用于敌对阵营，并且对植物同样有效：被减速的植物射击、生产和计时速度减半，被冰冻时全部停止 |
| 小推车 | 只碾压敌对阵营的单位 |
| 铁铲 | 只能铲除己方植物 |
| 墓碑与伴舞 | 墓碑召唤的僵尸、舞者僵尸召唤的伴舞，都属于召唤者的阵营 |
| 波次与胜负 | 只统计僵尸方的僵尸 |

**迷糊菇**

清醒的迷糊菇被敌对僵尸啃咬时，该僵尸转入迷糊菇的阵营，显示为紫色。敌方大嘴花咬到迷糊菇时同样会倒戈（原版中植物不会吃植物）。若倒戈的是场上最后一只敌方僵尸，关卡奖励随即掉落。

**设定阵营的方式**

- 迷糊菇；
- 调试指令的阵营参数，如 `/zombie normal 3 1 plants`、`/plant peashooter 3 9 zombies`；
- 带阵营的种子包，如 `/seed 1 snowpea zombies`；
- 关卡数据中预设的单位。

只有被迷糊菇控制的单位显示为紫色；直接放置的另一阵营单位保持原色，只改变朝向。项目还新增了僵尸卡、墓碑卡和弹坑卡，可以像植物一样放入卡槽使用。

通过 `/level pvz:teams-demo` 可进入阵营演示关：右侧预置 9 株僵尸方植物，与玩家的植物互相攻击，同时有 4 波僵尸从右侧进攻。

完整规则见[阵营与迷糊菇](docs/TEAMS.zh-CN.md)。

### 模组系统

模组是可以安装到游戏中的扩展包。基础游戏本身也是一个模组，和其他模组使用相同的格式与加载方式，所以模组可以修改游戏的任何部分。常见的模组有这几类：

- **资源替换**：高清化、更换美术风格、翻译成其他语言、替换音乐；
- **数值调整**：修改植物和僵尸的属性、关卡的波次与出怪、商店价格等；
- **新增内容**：加入新的植物、僵尸、子弹、关卡和成就；
- **玩法改动**：修改种植、收集等规则，或加入新的关卡规则和界面。

多个模组可以同时启用并互相叠加。例如 HD 包和汉化包一起使用时，汉化包只替换带文字的图片，其余图片仍来自 HD 包。模组也可以依赖其他模组，或为其他模组提供翻译。模组记录的数据会随关卡存档一起保存。

#### 运行机制

- **统一的包格式**：所有扩展都以模组形式提供，基础游戏本身也是一个内置包（ID 为 `pvz`）。资源包只包含资源，不需要脚本；脚本模组可以同时包含服务端脚本（玩法）和客户端脚本（表现）。
- **加载顺序**：依赖的模组先加载。多个模组提供同一资源时，管理器列表中位置靠前的优先。
- **命名空间**：模组新增的资源和定义必须使用自己的命名空间（如 `widescreen:background1`）。替换已有定义时需在 `overrides` 中显式声明，同一定义只能被一个模组替换。
- **文本**：全部文本合并在一张表中。模组可以改写任何已有文本，新增文本需带命名空间。翻译包只需列出要改写的条目，也可以翻译其他模组的文本。
- **加载校验**：加载时检查内容是否完整，例如每个植物和僵尸是否都有对应的外观，每个关卡奖励是否都有图片。不完整的模组直接加载失败，不会等到进入关卡才报错。
- **错误恢复**：运行中模组出错时会弹出错误对话框，可以直接从中打开模组管理器禁用出错的模组，然后重启。
- **存储**：网页版存放在 IndexedDB 中，原生版存放在应用数据目录的 `mods/` 中。每个玩家档案单独保存自己安装的模组、版本、启用状态和顺序；内容相同的 ZIP 在同一设备上只保存一份。

#### 使用方式

1. 在主菜单点击"选项"，再点击"模组"，打开模组管理器；也可以执行 `/mod` 打开。
2. 点击"导入"选择 ZIP 文件，可一次选择多个。
3. 勾选要启用的模组，用箭头调整顺序。
4. 点击"应用"并确认重启。游戏会先保存当前关卡，在下次启动时完成安装、卸载和启用。

取消会丢弃本次的导入和排序。只调整未启用模组的顺序时无需重启。切换玩家档案时，如果对方启用的模组不同，游戏会提示重启；新建档案时可选择复制当前档案的模组。

#### 示例模组

| 模组 | 内容 |
| --- | --- |
| 宽屏拓展（`widescreen`） | 将画面扩展到 4:3 至 21:9，并替换为宽屏主界面与背景 |
| 江南 PvZ2 资源包（`jiangnan-pvz2`） | 移植江南游戏开发社《PVZ2PAK 年度版》的美术、动画与音效 |
| 汉化资源包（`zh-cn`） | 简体中文文本、字体与界面图片，译文取自官方中文年度加强版 |
| HD 资源包（`hd`） | 全部图像 2 倍、位图字体 4 倍的高清资源 |
| HD 汉化资源包（`zh-cn-hd`） | 高清资源与简体中文的合并包，可单独使用 |
| 扩展按钮资源包（`dlc-buttons`） | 加入加速、冻结按钮，并将选卡界面的翻页文字改为箭头按钮 |

#### 开发说明

每个模组的根目录包含两个文件：

- `manifest.json`：模组的 ID、版本、依赖，以及脚本入口（如有）；
- `content.json`：玩法定义、表现定义和资源的索引。

```sh
npm run mod:init -- my-mod          # 创建模组模板
npm run mod:pack -- mods/my-mod     # 编译并打包为 ZIP，输出到 dist/mods/
npm run mod:test -- my-mod          # 打包后检查服务端注册是否正常
```

模组可以通过以下方式扩展游戏，设计参考了 Minecraft 模组生态中的 Fabric API 与 Mixin：

- **数据定义**：用 JSON 新增植物、僵尸、子弹、种子、关卡、商店物品和成就，或替换已有定义。
- **注册接口**（类似 Fabric API）：脚本入口 `register({ host, assets })` 通过 `host.get()` 取得游戏模块，向注册表添加新的植物、僵尸和子弹类型，以及对应的视图、调试指令、成就触发条件、关卡规则和教程脚本。新类型继承基础游戏的类，在定义中通过 `kind` 引用。
- **方法包装**（类似 Mixin）：`host.around()` 可以包装服务端的规则函数，在原有逻辑前后加入处理或替换其结果；游戏内部的调用同样经过包装。

```ts
export function register({ host, assets }) {
    // 注册新的植物类型
    const registry = host.get('gameplay/registry')
    const { Shooter } = host.get('server/plants/Shooter')
    registry.plants.register(assets.id, 'example:rapid_pea', regenerating(Shooter))

    // 包装种植规则
    const { planting } = host.get('server/seeds/planting')
    host.around(planting, 'seedAvailability', function (next, session, seedId, ...rest) {
        return next(session, seedId, ...rest)
    })
}
```

示例模组 [Mod Lab](mods/example/README.zh-CN.md) 演示了新植物与僵尸类型、实体数据与存档、关卡修改、资源替换、自定义视图、双端指令和菜单扩展。完整开发说明见[模组](docs/MODS.zh-CN.md)。

## 开发与构建

### 环境准备

项目依赖两个分叉仓库，均使用 `dev/pvz-remake` 分支：

| 仓库 | 用途 |
| --- | --- |
| [cocos-cli](https://github.com/cheng1559/cocos-cli/tree/dev/pvz-remake) | 命令行工具，负责预览、构建和原生打包 |
| [cocos4](https://github.com/cheng1559/cocos4/tree/dev/pvz-remake) | 游戏引擎，包含本项目对原生平台的修改 |

所需环境：

- Node.js 22.17.0 与 `node-gyp`；
- Python 3.10 及以上，以及 Pillow、ffmpeg、libopenmpt（用于转换游戏资源）；
- 构建原生版本时，还需要对应平台的开发工具，如构建 macOS 和 iOS 版本需要 Xcode。

在游戏仓库之外安装命令行工具，并把引擎放到它的 `packages/engine` 目录：

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
```

### 导入资源与预览

按[自行构建](#自行构建)的说明把游戏文件放入 `tools/` 目录，然后在游戏仓库根目录执行：

```sh
npm ci
npm run build:content     # 转换游戏资源，约需 9 分钟
npm run build:icons       # 生成应用图标（可选）
npm run preview:debug     # 启动预览，默认地址 http://localhost:9527
```

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run test:server` | 服务端类型检查与全部测试 |
| `npx tsc --noEmit -p tsconfig.json` | 客户端类型检查 |
| `npm run test:tools` | 资源转换工具的测试 |
| `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` | 修改基础内容的定义后重新打包，无需重新转换资源 |
| `npm run mod:pack -- mods/{模组}` | 打包模组 |

### 构建发布版本

| 平台 | 命令 | 输出 |
| --- | --- | --- |
| 网页 | `npm run build:web:release` | Web 构建 |
| Windows | `npm run compile:windows:release`，然后 `npm run package:windows` | 安装包 `dist/pvz-remake-v{版本}-windows-x64-setup.exe`；打包需要 Inno Setup 6 |
| macOS | `npm run compile:macos:arm64:release` 和 `compile:macos:x64:release`，然后 `npm run package:macos` | 磁盘映像 `dist/pvz-remake-v{版本}-macos-arm64.dmg`（Apple 芯片）和 `-macos-x64.dmg`（Intel）；仅能在 macOS 上构建 |
| Android | `npm run compile:android:arm64:release` | arm64 安装包；32 位设备使用 `android:armv7` |
| iOS | `npm run compile:ios:release` | 未签名的 IPA，需要自行签名；仅能在 macOS 上构建 |

把命令中的 `release` 换成 `debug` 即可构建调试版本。Windows 安装包只能从 Release 版本打包。

完整说明见[开发](docs/DEVELOPMENT.zh-CN.md)。

## 问题修复

以下问题存在于原版 1.2.0.1096 中，本项目已修正。表现层问题只影响画面和声音，不改变游戏结果；逻辑层问题会影响游戏的进行或结果。

### 表现层

1. 修复主界面墓碑按钮在入场动画结束后才切换的问题。原版入场期间墓碑始终显示"开始冒险"，动画结束后才变为"冒险模式"和关卡进度。
2. 修正图鉴中阳光菇的影子大小。原版图鉴展示的是长大的阳光菇，影子却按幼苗大小绘制。
3. 修复商店中疯子戴夫入场时手臂被车尾灯（翻页按钮）遮挡的问题。
4. 修正图鉴中舞者僵尸和伴舞僵尸预览图的大小，使其与草坪上一致。
5. 修复舞者僵尸和伴舞僵尸在举手等舞步中进入房屋时保持原动作滑入的问题，现在进屋时会切换为行走动作。
6. 修复开场滚草皮时暂停游戏，滚草皮音效在暂停期间持续循环的问题。
7. 修正被迷糊菇控制的僵尸掉落头、手臂和旗帜的方向，现在按僵尸的实际朝向飞出。
8. 修复被迷糊菇控制的舞者僵尸聚光灯偏离身体的问题。

### 逻辑层

1. 重写滚动逻辑，按滚动幅度计算滚动距离，修复触控板滚动速度异常的问题。
2. 修复同一行有多只已跳过杆的撑杆僵尸时，土豆地雷的判定范围被累计缩小、甚至无法引爆的问题（四杆引雷）。
3. 修复舞者僵尸的舞步节拍在暂停期间仍然推进、可借暂停操控舞步的问题（女仆秘籍）。现在节拍按关卡时间计算。
4. 修复旗帜僵尸残留旗帜动画编号导致其他对象的动画被误删的问题（FRS）。原版可借此制造免疫啃食的窝瓜等异常状态。
5. 修复打僵尸模式中，最后一组僵尸出现时墓碑已全部被咬咬碑吃掉、场上也没有僵尸，导致奖励不掉落、关卡无法结束的问题。
6. 修复拖动或缩放窗口时游戏停止运行的问题。

## 开发计划

已发布版本列出实际包含的内容，计划中的版本可能会调整。

### v0.1.0（已发布）

- 冒险模式（白天）
- 白天关卡（1-1至1-10）
- 植物（豌豆射手、向日葵、樱桃炸弹、坚果、土豆地雷、爆炸坚果、寒冰射手、大嘴花、双重射手、小喷菇）
- 僵尸（普通僵尸、旗子僵尸、路障僵尸、铁桶僵尸、撑杆僵尸）
- 界面（启动画面、玩家档案、选卡、菜单、选项、帮助、奖励页、关卡进度条、图鉴、迷你游戏选择）
- 存档（玩家档案、冒险进度、金币、设置、关内存档）
- 网页版与移动端适配
- 调试控制台

### v0.2.0（当前版本）

- 客户端/服务端架构重写
- 冒险模式（黑夜）
- 特殊模式（打僵尸）
- 植物（阳光菇、大喷菇、咬咬碑、迷糊菇、胆小菇、冰川菇、末日菇）
- 僵尸（读报僵尸、铁网门僵尸、橄榄球僵尸、舞者僵尸、伴舞僵尸）
- 黑夜关卡（2-1至2-10）
- 商店物品（卡片槽）
- 图鉴
- 成就（土豆泥、火爆兄弟、铁公鸡、阳光满屋、全日无休、无菇之夜、舞者精神）
- 阵营系统、僵尸卡、墓碑卡、弹坑卡（独立添加）
- 模组与资源包（ZIP 安装、高清包、简体中文包、宽屏）
- 画面（原版分辨率渲染、高分辨率模式、帧率显示、种子包倾斜样式）
- 操作（键盘热键、原版鼠标指针、触控振动、失焦静音与自动暂停）

### v0.3.0（计划中）

- 冒险模式（泳池）
- 特殊模式（拉霸、小小大僵尸）
- 商店物品（池塘清洁车、干草叉）
- 植物（莲叶、窝瓜、三重射手、缠绕水草、机枪射手、双胞向日葵、火爆辣椒、地刺、火炬树桩、高坚果）
- 僵尸（鸭子救生圈僵尸、潜水僵尸、雪橇车僵尸、雪橇车僵尸小队、海豚僵尸骑士、豌豆射手僵尸、坚果僵尸、其他植物僵尸拓展）
- 泳池关卡（3-1至3-10）
- 迷你游戏关卡（植物僵尸、坚果保龄球、拉霸）
- 彩蛋密码
- 成就（豌豆先生的假期、五颗星、大胡子模式）

### v0.4.0（计划中）

- 冒险模式（浓雾）
- 特殊模式（暴风雨之夜、花瓶终结者、僵尸公敌）
- 植物（水兵菇、路灯花、仙人掌、三叶草、多嘴小蘑菇、猫尾草、双向射手、星星果、南瓜头、磁力菇）
- 僵尸（小丑僵尸、气球僵尸、矿工僵尸、蹦蹦僵尸）
- 浓雾关卡（4-1至4-10）
- 益智模式关卡（花瓶终结者、一路向左、第3个花瓶、僵尸公敌、僵尸公敌2、地道战）
- 关闭 3D 加速的视觉效果

### v0.5.0（计划中）

- 冒险模式（屋顶）
- 特殊模式（飞贼闪击战、僵尸博士战、种子雨、僵尸迷阵、隐形战争）
- 1-0入场动画
- 制作人员 MV
- 植物（卷心菜投手、花盆、钢地刺、吸金菇、玉米投手、咖啡豆、大蒜、萝卜伞、金盏花、西瓜投手、冰西瓜、玉米加农炮、变身茄子）
- 僵尸（飞贼僵尸、梯子僵尸、投石车僵尸、巨人僵尸、小鬼僵尸）
- 商店物品（屋顶推车、黄金水壶、化肥、杀虫剂、唱片机、园艺手套、坚果愈合术、金盏花苗、蘑菇园、水族馆、宠物蜗牛、智慧树、树肥料、手推车）
- 休闲花园
- 智慧树
- 屋顶关卡（5-1至5-9）
- 僵尸博士关卡（5-10）
- 益智模式关卡（连锁反应、完全防御）
- 迷你游戏关卡（种子雨、僵尸迷阵、隐形战争）
- 成就（庭院无忧、植物猎人、空中管制、爆米花派对、天天向上）

### v0.6.0（计划中）

- 冒险模式（二周目）
- 特殊模式（艺术挑战、僵尸水族馆、僵尸迷阵 旋风、斗转星移、排山倒海、全面冻结、僵尸快跑、坚不可摧、蹦蹦舞会）
- 植物（巨型坚果）
- 僵尸（雪人僵尸、火爆辣椒僵尸、高坚果僵尸、窝瓜僵尸、机枪射手僵尸、其他植物僵尸拓展、红眼巨人僵尸）
- 迷你游戏关卡（观星、僵尸水族馆、僵尸迷阵 旋风、小小大僵尸、斗转星移、排山倒海、全面冻结、僵尸快跑、打僵尸、坚不可摧、植物僵尸2、坚果保龄球2、蹦蹦舞会、僵尸博士的复仇）
- 益智模式关卡（金属狂潮、胆怯的制陶工、戏法时刻、连锁反应之二、破坏之王、花瓶终结者（无限）、死亡气球、力拔山河、太空舞步、飞檐走壁、大混战、僵尸公敌（无限））
- 生存模式（白天、黑夜、泳池、浓雾、屋顶、白天（困难）、黑夜（困难）、泳池（困难）、浓雾（困难）、屋顶（困难）、白天（无限）、黑夜（无限）、泳池（无限）、浓雾（无限）、屋顶（无限））
- 成就（葵花宝典、头脑风暴、瓷器太厚、僵尸学家、狂热死忠、无懈可击）

### v0.7.0（计划中）

- 特殊模式（晴天、不毛之地、重要时间、空袭、急冻先锋、牛顿的力量、坟墓危险、地道战、松鼠）
- 隐藏迷你游戏关卡（当艺术遇上坚果、晴天、不毛之地、重要时间、当艺术遇上向日葵、空袭、急冻先锋、牛顿的力量、坟墓危险、地道战、暴风雨之夜、飞贼闪击战、松鼠、追加销售）
- 僵尸大头贴

### TODO

- 存档云同步
- 联机模式
- 优化性能瓶颈
- 原版遍历顺序
- Linux 等平台适配

## 鸣谢

- 感谢 Quality of the Lawn 的反编译工作，为查证原版行为提供了可读的代码参考。[PvZ-Quality-of-the-Lawn-Decompile](https://github.com/Electr0Gunner/PvZ-Quality-of-the-Lawn-Decompile)
- 感谢 PvZ-Portable 项目，其移植源码帮助我们理解关卡流程、植物行为和僵尸状态。[PvZ-Portable](https://github.com/wszqkzqk/PvZ-Portable)
- 感谢 Pzwboy 发布的 Steam 年度版汉化补丁，汉化资源包的文本、字体与图片取自该补丁。[Steam 年度版汉化补丁](https://www.pzwboy.top/2026/09/19/pvz-steam-zhp)
- 感谢江南游戏开发社的《PVZ2PAK 年度版》，江南 PvZ2 资源包的美术、动画与音效移植自该作品。[江南游戏开发社](https://jiangnangame.com/game/p2pak/index.html)
- 感谢 HenryJk 的 PvZWidescreen，宽屏拓展的主界面背景、花园、智慧树和商店车辆沿用了它的高清素材，商店的实现也参考了它。[PvZWidescreen](https://github.com/HenryJk/PvZWidescreen)
- 感谢《植物大战僵尸精华版》（PvZ Ultimate），宽屏拓展的主界面、加载页、图鉴、成就页和奖励页使用了它的素材。
- 宽屏拓展的白天草坪、商店背景和右侧草丛取自《植物大战僵尸》Android TV 版（1.1.5）。
- 感谢宝开游戏创作《植物大战僵尸》。

## 免责声明

PvZ Remake 是基于 PC 原版《植物大战僵尸》制作的非官方同人重制项目。开发者独立于 Electronic Arts（EA）和 PopCap 运营本项目，并对项目内容负责。原版《植物大战僵尸》的游戏素材、著作权及商标归 Electronic Arts Inc. 所有。MIT 许可证适用于本项目的原创源码。

EA 的政策要求模组免费提供，仅供非商业用途。对于 PC 原版这类付费游戏，模组必须要求玩家使用正版游戏，且分发时须排除原版游戏文件。在本地构建 PvZ Remake 时，请从自己持有的正版游戏中导入资源。[EA《植物大战僵尸》模组政策（英文）](https://help.ea.com/en/articles/plants-vs-zombies/mod-policy/)

## 开源协议

本项目源码采用 [MIT 许可证](LICENSE)。
