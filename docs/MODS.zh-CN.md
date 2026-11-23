[English](MODS.md)

# 模组

游戏的所有扩展都是模组，基础游戏本身也是一个内置模组，ID 为 `pvz`。示例模组 [Mod Lab](../mods/example/README.zh-CN.md) 演示了模组能做的大部分事情。

文中引用的界面文字取自汉化资源包，括号内为英文界面的文字。

## 什么是模组

模组是安装到游戏中的 ZIP 包，可以包含以下任意组合：

- **资源**：图像、字体、音效、音乐、动画、粒子和文本，可以是新资源，也可以按 ID 替换基础游戏的资源。只含资源的模组即资源包，不需要代码入口。
- **定义**：以 JSON 编写的玩法定义（数值与规则）和表现定义（动画、位置与音效），用于新增植物、僵尸、子弹、种子、关卡、商店物品、成就等，或替换已有定义。
- **脚本**：服务端入口（玩法）和客户端入口（表现），用于注册新的类型、视图、指令和规则改动。

各类模组的安装、优先级、启用状态和卸载都由同一个管理器处理。基础游戏（`pvz`）总是最先加载，不能禁用、卸载或导入。

多个模组可以同时启用并互相叠加。例如 HD 资源包和翻译资源包一起启用时，翻译包可以只替换带文字的图片，其余图片仍来自 HD 包。模组可以修改列表中位于它下方的模组的定义，翻译包也可以翻译其他模组的文本。

## 安装模组

模组只能通过 ZIP 安装。

1. 打开模组管理器：在主菜单选择**选项**（Options），再选择**模组**（Mods）；或在调试控制台中执行 `/mod`（见[调试指令](DEBUG_CLI.zh-CN.md)）。`/mod` 是唯一的管理指令，不接受参数或子命令。
2. 点击**导入**（Import），选择一个或多个 ZIP 文件。
3. 勾选要启用的模组，用箭头调整顺序（见[优先级与加载顺序](#优先级与加载顺序)）。
4. 点击**应用**（Apply）并确认重启。

管理器窗口先显示 `Loading...`，读取完已安装的模组后再显示列表。

### 导入时会发生什么

导入期间显示“导入中…”（`Importing...`）对话框，逐个检查所选的 ZIP。检查失败的文件及原因会列在“导入失败”（Import Failed）对话框中，其余文件照常导入。

- **检查内容**：清单、游戏运行的模块文件（`gameplay.cocosModule`、`client.module`，以及 `bundle` 目录中的 `config.json` 和 `index.js`）、所有文件路径、每张 PNG 的尺寸是否与声明一致、字体图集，以及 JSON 资源能否解析。导入时不会运行定义和脚本，其中的错误会在下次启动加载模组时出现。
- **ZIP 结构**：ZIP 中必须恰好有一个 `manifest.json`，可以位于根目录，也可以位于某个文件夹内；包含它的文件夹即为包的根目录，此目录之外的文件会被忽略。`__MACOSX/` 条目以及 `.meta`、`.DS_Store` 文件会被跳过。重复路径、绝对路径和含 `..` 的路径会被拒绝。加密条目以及 stored 和 deflate 以外的压缩方式不受支持。
- **保留 ID**：`pvz` 是内置基础内容包的 ID，不能导入。
- **暂存**：ZIP 以压缩形式原样写入单独的暂存区，不会覆盖已安装的模组。
- **位置**：新模组加入列表顶部并自动勾选。导入一个 ID 已安装的模组即为更新，更新后保持原有位置。应用前重复导入同一 ID 时，保留后导入的文件。

**取消**（Cancel）或 Esc 会丢弃草稿并删除暂存文件，新包和已安装模组的更新都一样。

### 应用时会发生什么

导入或卸载了模组、启用或禁用了模组、或调整了已启用模组的顺序时，需要重启。此时“应用”会：

1. 询问“重新启动游戏？”（Restart Game?），并提示当前关卡将被保存；
2. 显示“重新启动中…”（`Restarting...`）并锁定管理器窗口；
3. 保存当前关卡和待处理的更改列表；
4. 重启游戏。

“应用”本身不会解压 ZIP，也不会安装或删除模组。下次启动时只显示原版 PopCap 标志（取自基础内容包），同时在后台安装和卸载模组，之后再加载游戏资源并进入标题界面。

如果这项后台任务失败，待处理列表和暂存的 ZIP 会保留，错误写入日志；点击或轻触屏幕、或按任意键即可重试。在重启之前，正在运行的代码、音频和图像仍使用游戏启动时加载的压缩包。

只调整未启用模组的顺序时，会直接保存，无需重启。

## 管理已安装的模组

管理器中每一行有以下控件：

| 控件 | 作用 |
| --- | --- |
| 复选框，或点击模组名 | 在草稿中启用或禁用该模组。勾选不会移动这一行。 |
| 版本号 | 模组清单中的 `version`。 |
| 名称后的红色 `[Error]` | 该模组本次运行中出错，或导致了当前的游戏错误。鼠标悬停可查看错误信息。 |
| 上、下箭头 | 将模组移动一位，改变其优先级。 |
| **移除**（Uninstall） | 确认后从草稿中移除这一行。应用并重启后才会真正删除。 |

启用、禁用和移除都要经过“应用”和重启才会生效：正在运行的模组无法卸载。有未应用的更改时点击“取消”，会询问是否放弃这些更改。Enter 相当于“应用”，Esc 相当于“取消”。

## 优先级与加载顺序

列表顺序即优先级：位置越靠上，优先级越高。

- **加载顺序**：已启用的模组从列表底部向顶部依次加载。
- **资源**：多个运行中的模组注册了同一资源 ID 时，后加载（列表中更靠上）的模组生效。没有任何模组注册的 ID 取自基础内容包。加载失败的模组不提供任何资源。
- **定义**：两个模组不能注册同一个玩法定义 ID，重复即为错误。已有定义在表里按 ID 修改（见[修改已有定义](#修改已有定义)）。
- **文本**：同一文本键以启用优先级更靠后的模组为准。文本语言取最后一个声明了 `locale` 的已启用模组。

## 模组与玩家档案

模组按玩家分别保存。每个玩家有自己的已安装模组、版本、启用状态和顺序，管理器只显示和修改当前玩家的模组。

- **共享压缩包**：ZIP 按 ID 和内容哈希只保存一份，多个玩家安装内容相同的 ZIP 时共用同一份。这个哈希只用于识别相同的文件，不是安全校验。
- **清理**：没有任何玩家引用的 ZIP（已删除玩家的、已被替换的旧版本）会在启动时清除。删除玩家时，其模组记录随玩家档案一起删除。
- **新建玩家**：创建的第一个玩家会接管在任何玩家存在之前安装的模组。之后新建玩家时，如果当前玩家装有模组，游戏会询问是否把它们复制给新玩家；如果拒绝会使新玩家的模组与正在运行的不同，提示中会说明选择“否”将重启游戏。
- **切换玩家**：如果另一位玩家启用的模组或其版本与正在运行的不同，游戏会提示重启以完成切换；选择取消则留在当前玩家。当前玩家被删除时，这次重启不能取消。
- **旧版本**：引入按玩家保存模组之前、整台设备共用的安装记录不会迁移：这些记录会被忽略，它们引用的压缩包会在启动清理时删除。

数据保存位置：

| 数据 | 网页版 | 原生版 |
| --- | --- | --- |
| 已安装的压缩包 | IndexedDB（数据库 `pvz-remake-mods`） | 应用可写目录中的 `mods/`：每个压缩包一个文件夹，存放解压后的文件和 ZIP 本身 |
| 暂存的导入 | IndexedDB（数据库 `pvz-remake-mod-pending`） | 应用可写目录中的 `mod-pending/` |
| 每位玩家的已安装、已启用模组及顺序，以及待处理的更改 | 游戏的本地存储 | 游戏的本地存储 |

## 模组与关卡存档

关卡存档会记录基础内容包，以及按加载顺序记录每个带有服务端代码或玩法定义的运行中模组，连同各自的版本和内容哈希。

- 继续关卡时，如果这组模组发生了变化（增加、移除、调整顺序或更新了模组），存档即不兼容：游戏会丢弃该存档并在控制台给出警告，然后重新开始这一关。
- 只含资源或表现定义的模组不参与这项检查。
- 存档只支持每个模组的当前版本和内容哈希，旧存档不会被转换。

应用模组更改时会先保存当前关卡。如果这次更改影响到上述模组组合，保存的这一关之后就无法继续。

## 模组出错时

### 启动时

- **无法读取的压缩包**：压缩包损坏的模组会被停用：它会从启用列表中移除，并在管理器中显示 `[Error]`，但不会妨碍管理器窗口打开。已启用但压缩包缺失的模组会从启用列表中移除，并在控制台给出警告。
- **注册错误**：模组在注册过程中出错（脚本抛出异常、定义无效、缺少表现等）时，本次运行跳过该模组，并在管理器中显示 `[Error]`。它的定义、注册内容和方法包装会被回滚，在它之后加载、修改了它的定义的模组也会加载失败。它仍保持启用，下次启动会再次尝试加载。
- **通知**：主菜单会弹出“模组加载失败”（Mods Failed to Load）通知，列出每个加载失败的模组，每个只提示一次。
- **中断的启动**：如果某次启动在加载模组期间结束（例如 iOS 因内存不足结束页面），下次启动会不加载模组，并在主菜单显示“启动失败”（Startup Failed）。模组选择仍保留在管理器中，再下一次启动会重新加载它们。启动期间隐藏或关闭游戏不算作失败。

### 游戏中：“游戏异常”对话框

加载或游玩过程中发生致命错误时，游戏会停止并弹出“游戏异常”（Game Error）对话框，显示错误信息的第一行。

- 左侧按钮**模组**（Mods，也可按 Enter 或空格）会在对话框之上打开模组管理器。在其中“应用”可以用新的选择重启游戏；“取消”则回到错误对话框。
- 右侧按钮**退出**（Exit）调用平台的退出操作。
- 出错之后不会再保存：保留该关卡最后一次成功的存档。
- 对话框和管理器使用基础内容包的美术资源构建。它们会复用已经加载到内存中的语言；如果加载或绘制翻译后的界面失败，则改用基础语言和字体。
- 只有在知道出错模组 ID 时，管理器才会为该模组标上 `[Error]` 和错误信息。

这个对话框背后的规则如下：

- 未捕获的错误以及运行中关卡里的错误总会打开该对话框。游戏自己捕获并能恢复到可用状态的错误，会由游戏自行处理，除非该错误被归属到某个模组。
- 从模组脚本文件中抛出的错误（其堆栈位置为 `pvzmod:///<id>/...`），以及来自模组资源或文本的错误，会归属到该模组。
- 必需的加载失败时会直接拒绝（reject）：已声明的资源加载失败时不会回退到基础内容包，错误归属到声明它的模组。
- 已停止的服务端会把致命错误转发给客户端，已知时附带出错模组的 ID。
- 对话框出现后，被包装的宿主方法会直接调用原方法，跳过所有模组的包装。
- 某个模组注册过程中捕获的错误按上文的启动回滚处理，不会打开此对话框。

## 包结构

模组的源码目录：

```text
my-mod/
├── manifest.json           # ID、版本与可选的模块入口
├── content.json            # 玩法定义、表现定义与资源的索引
├── src/
│   ├── server/index.ts     # 可选的服务端代码
│   └── client/index.ts     # 可选的客户端代码
└── assets/
    ├── gameplay/           # 按类别拆分的玩法定义 JSON
    ├── presentation/       # 按类别拆分的表现定义 JSON
    ├── sprites/
    └── audio/
```

只需创建用得到的目录。纯资源模组只需要清单、内容索引和资源文件。`npm run mod:init -- my-mod` 会创建 `mods/my-mod/`，其中包含清单、一个索引了空 `plants` 和 `seeds` 表的 `content.json`，以及服务端入口的空模板。

除基础内容的源码（`mods/pvz-base/`，转换出的资源不入库）外，仓库只跟踪示例 `mods/example/` 和 `mods/README.md`；`mods/` 下的其他子目录用于本地开发，被 Git 忽略。

源码目录与打包后的模组有两处不同：

| | 源码 | 打包后（`dist/mods/<name>/` 及 ZIP） |
| --- | --- | --- |
| `content.json` 中的 `gameplay` 与 `presentation` | 每张表一个文件 | 各合并为一个文件：`assets/gameplay.json`、`assets/presentation.json` |
| 脚本 | `src/server/index.ts`、`src/client/index.ts` | 编译后的 JavaScript，位于清单给出的路径 |

## manifest.json

```json
{
  "schemaVersion": 1,
  "id": "example",
  "version": "1.0.0",
  "apiVersion": 1,
  "contentHash": "generated-on-pack",
  "gameplay": {
    "nodeModule": "gameplay/node/index.js",
    "cocosModule": "gameplay/cocos/index.js"
  },
  "client": {
    "module": "client/index.js"
  }
}
```

| 字段 | 必需 | 含义 |
| --- | --- | --- |
| `schemaVersion` | 是 | 必须为 `1`。 |
| `id` | 是 | 模组 ID，即命名空间（见[命名空间与 ID](#命名空间与-id)）。 |
| `version` | 是 | `x.y.z`。 |
| `apiVersion` | 是 | 必须为 `1`。 |
| `contentHash` | 是 | 源码中可以是任意非空字符串；`mod:pack` 会把它替换为清单其余字段与包内所有文件的 SHA-256。 |
| `locale` | 否 | 模组所提供文本的语言，使用语言标签，如 `zh-CN`。 |
| `author` | 否 | 作者名，最多 64 个字符。 |
| `gameplay` | 否 | 服务端脚本：`nodeModule`（供 Node 使用的 ES 模块，由 `mod:test` 运行）和 `cocosModule`（SystemJS 模块，由游戏运行）。 |
| `client` | 否 | 客户端脚本：`module`（SystemJS 模块），以及可选的 `bundle`，即一个 Cocos Asset Bundle 目录，其中必须包含 `config.json` 和 `index.js`。 |

纯资源模组只需要前六个字段；需要脚本时再添加 `gameplay` 或 `client`。源码入口是 `src/server/index.ts` 和 `src/client/index.ts`，清单中给出的是编译产物的路径。所有路径都必须位于包内。

## content.json

`content.json` 是玩法定义、表现定义和资源的唯一索引，只接受 `gameplay`、`presentation` 和 `resources` 三个键。

```json
{
  "gameplay": {
    "plants": "assets/gameplay/plants.json",
    "seeds": "assets/gameplay/seeds.json"
  },
  "presentation": {
    "plants": "assets/presentation/plants.json"
  },
  "resources": {
    "sprites": {
      "example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80 }
    },
    "audio": { "example:launch": "assets/audio/launch.mp3" }
  }
}
```

- `gameplay` 和 `presentation` 把表名映射到文件。路径相对于根目录的 `content.json`。每个表文件都是从 ID 到配置的对象；配置按类别拆分到不同文件中。
- 资源路径相对于模组根目录。
- 加载器会自动注册静态的玩法定义、表现定义和新资源，脚本入口无需再次注册这些文件。

## 命名空间与 ID

- **模组 ID**：不含冒号的名称，如 `widescreen`；由小写字母、数字、`.`、`_` 和 `-` 组成，以字母或数字开头。`mod:init` 只接受小写字母、数字、`_` 和 `-`。
- **命名空间**：模组 ID 同时也是模组的命名空间。模组新增的资源和定义都写作 `名称:...`，例如 `widescreen:background1`。不存在 ID 相同的两个模组，因此命名空间不会重叠。内置基础游戏的命名空间是 `pvz`。
- **定义**：模组只能在自己的命名空间中注册定义。写在其他命名空间 ID 下的条目会修改该定义，该定义不存在时报错。
- **资源**：替换已有资源只需使用原 ID。写在其他命名空间中的资源算作替换，而不是模组自己的资源。
- **脚本中的 ID**：模组新增的类型、实体数据、模组类型的定义字段、文本键和教程步骤同样使用自己的命名空间（`example:regeneration`、`example:dig`）。指令名也可以带上命名空间（`example:hello`）。
- **音效**：表现配置中的音效（`{ "audio", "foley", "pitchRange"? }`）里，`audio` 是完整的音频资源 ID，如 `pvz:splat` 或 `corn:shoop`；不带命名空间的 ID 在校验时报错。

## 定义

### 定义表

模组可以添加内容的玩法表：

| 表 | 索引键 |
| --- | --- |
| `boards`、`seeds`、`plants`、`zombies`、`projectiles`、`items`、`achievements`、`tools`、`levels` | 各自的 ID |
| `store` | 商店物品 ID |
| `storePages` | 商店页面 ID |
| `almanac` | 僵尸 ID |

模组可以添加内容的表现表有 `plants`、`zombies`、`projectiles`、`gridItems`、`items`、`awards`、`tools`、`foley`、`boards`、`screens`、`clips`、`levels`、`rules`、`challenges`、`store` 和 `almanac`。其中 `items` 以掉落物 ID 为键，`awards` 以关卡奖励 ID 为键，`rules` 以关卡规则的 `kind` 为键，`store` 以商店物品 ID 为键，`almanac` 以图鉴所展示的植物或僵尸 ID 为键。

两侧遵循相同的规则：新 ID 只能位于模组自己的命名空间，写在别人 ID 下的条目会修改它。基础内容包还有一些不属于这些表的设置：玩法侧的 `settings`，以及表现侧的 `mainMenu`、`conveyor`、`storeDialogue`、`iceTrap`、`graves`、`dave` 和 `seedPackets`。模组写同样的键来修改它们。写入其他顶层键都会报错。

表现定义与玩法定义一样严格：每个对象只接受自己的字段，多出、拼错或放错位置的字段（如写在僵尸表现中的 `vault`）会报告 `... is not supported`。

新关卡必须同时在玩法 `levels`（规则与波次）和表现 `levels`（开场、草坪与提示）中注册。

### 修改已有定义

模组写在其他命名空间 ID（基础游戏的或其他模组的）下的条目会修改该定义，而不是新增一个。写在对应键下的表外设置块也一样：玩法侧的 `settings`，表现侧的 `mainMenu`、`conveyor`、`storeDialogue`、`iceTrap`、`graves`、`dave` 和 `seedPackets`。每处修改都是一个 JSON 合并补丁（RFC 7386）。示例模组的 `levels.json` 里既有自己的关卡，也有对 1-1 的修改：

```json
{
  "example:testing": { "...": "自己的关卡" },
  "pvz:adventure-1-1": { "seedPackets": ["pvz:peashooter", "example:rapid_pea", "example:beacon"] }
}
```

表现层的 `plants` 表可以用 `null` 删除字段：

```json
{ "pvz:explodenut": { "visual": { "tint": null } } }
```

- 对象逐字段修改，直到给出的字段为止；`null` 删除字段。列表和其他值整体替换。
- 模组按加载顺序依次处理，每个模组先注册自己的条目，再应用它的修改，因此模组可以修改基础游戏的 ID 和在它之前加载的模组的 ID。两个模组可以修改同一字段：保留后加载的模组的值。
- 写在其他命名空间 ID 下、但该定义不存在或只由之后加载的模组定义的条目会报错。修改后的结果和其他内容一样接受检查：引用、对象没有的字段、该字段不接受的值，都会让模组在加载时失败。
- 修改只涉及数据。实体的类型取自修改后定义的 `kind`；实体字段与新定义不符的旧存档按不兼容存档处理。
- 基础僵尸的表现定义如果被修改删掉了 `view`，该僵尸会按普通僵尸绘制。

### 加载校验

每个模组加载时，内容组装会检查：

- 玩法定义中的每个植物、僵尸、子弹和掉落物都有表现，且其视图已安装；
- 每个植物和僵尸的表现为其玩法动画播放的每个片段都提供了对应片段（僵尸还需要 `mowered`），并且植物只在其类型拥有的阶段中绘制；
- 每个格子物品表现的视图都已安装；
- 每个工具在表现 `tools` 中都有外观；
- 每个关卡的奖励都有图片：种子奖励使用对应植物的表现，`note` 还需要 `pageImages`；
- 内容引用的每个类型、关卡规则、教程和成就触发条件都已安装，并接受其设置。

缺少任何一项都会使该模组加载失败，而不是等到关卡中出现时才报错。

### 种子

| 字段 | 含义 |
| --- | --- |
| `kind` | `plant`、`zombie`、`grave` 或 `crater`。 |
| `position` | 种子在其分组内的格位（见下文）。 |
| `sunCost`、`cooldownTicks` | 阳光花费与冷却。`initialCooldownTicks` 可选。 |
| `id` | `plant` 或 `zombie` 种子放下的植物或僵尸；省略时为种子自身的 ID。 |
| `placement` | 仅 `plant` 种子：`ground`、`grave` 或 `water`。 |
| `hidden` | 仅基础种子：`true` 表示放入隐藏分组。 |
| `craterTicks` | 仅 `crater` 种子：其弹坑持续的时间。 |

每个种子都必须有 `position`，即它在所属分组内的格位编号。格位按 8 列从左到右、从上到下计数，从 0 开始，每页 48 格，同一分组内编号不能重复。没有种子的编号留作空格。

分组共有三种，依次为：原版、各个模组、隐藏种子。

- **原版分组**就是选卡界面的网格。基础游戏的种子属于该分组，编号即原版的植物种子类型。只有编号 0–47 的植物种子可以放在这里：通常为 5 行（0–39）；拥有 40–47 中任一种子（原版的升级植物）时变为 6 行，与原版的 `Has7Rows` 一致，行距 70，第一行 y=123。48 是原版的变身茄子。
- **隐藏种子**是带 `"hidden": true` 的基础种子：爆炸坚果、两种保龄球坚果、僵尸种子、墓碑种子和弹坑种子。
- **模组的种子**总是属于该模组自己的分组，由模组自行从 0 编号，因此不会与基础游戏或其他模组冲突，也不能标记为 `hidden`。

模组的种子不在选卡界面的网格中。开启 `/cheatseed` 时，选卡界面和图鉴会在原版页面之后按模组加载顺序为每个模组单独分页，隐藏种子的页面排在最后；否则模组种子通过 `seedChooser.entries` 提供（见[修改服务端规则](#修改服务端规则)）。

与其他定义表一样，模组只能在自己的命名空间中注册种子。要移动基础游戏或其他模组的种子，在模组自己的 `seeds` 中按它的 ID 写入新的 `position`。

### 植物

植物表现必须包含 `scale` 和 `visual`。

- `visual.nameKey`（必需）和 `visual.tooltipKey` 分别给出植物名称和选卡界面说明的文本键；文本写在模组的 `pvz:strings` 资源中。没有 `tooltipKey` 时，沿用原版的 `<nameKey>_TOOLTIP` 约定。
- 种子包默认绘制自身的植物。`visual.packetPlant` 给出另一植物的完整 ID 时，改为绘制那个植物（保龄球坚果绘制普通坚果）。
- 植物图像在种子包中的位置和大小写在 `packet.placement`（`{ scale, offsetX, offsetY }`，即原版 `SeedPacket::DrawSeedPacket` 的偏移）中，缺省时使用 `seedPackets.defaultPlacement`。`packet` 的其他字段是原版 `Plant::DrawSeedType` 的偏移和姿势。
- `packet.phase` 指定图像中植物所处的阶段（小的阳光菇、已亮灯的土豆地雷）。缺省时与场外一致（玩法动画的 `offBoard`）。
- 植物射击时伴随的粒子写在植物表现的 `fireParticle: { id, x, y, delayTicks }` 中（大喷菇的烟雾）。

### 僵尸

每个僵尸定义都必须有 `wave: { points, weight, firstWave? }`，分别对应原版 `ZombieDefinition` 的价值 `mZombieValue`、选取权重 `mPickWeight` 和最早出现波次 `mFirstAllowedWave`。

- 点数既是生成该僵尸的花费，也决定它死亡时掉落金钱的概率（`Zombie::DropLoot`）。只在指定波次、从墓碑中或通过调试指令出现的僵尸同样需要它。
- 要让僵尸不会从出怪池中被随机选中，把 `weight` 设为 0。
- 关卡 `zombiePool` 中的条目可以覆盖这些值。
- 缺少 `wave` 的僵尸在加载时报错。

### 植物、僵尸与子弹的玩法设置

#### 射手

- `shooter.initialDelayTicks` 和 `shooter.cadenceTicks` 都接受整数区间，例如初始等待 `{ "min": 0, "max": 150 }`、射击间隔 `{ "min": 136, "max": 150 }`。间隔的最小值必须大于零。固定间隔可将 `min` 与 `max` 设为相同值。
- 服务端用关卡的随机数生成器抽取初始等待和每次间隔。即使没有目标，间隔也照常推进；当前计时和随机数状态都会保存在存档中。

#### 胆小菇

`scaredyshroom` 类型是额外带有 `fright` 能力的射手（`Plant::UpdateScaredyShroom`）：`{ center, radius, rowRange, lowerTicks, raiseTicks }`。

- 当敌对僵尸的身体进入以植物左上角加 `center` 为中心、半径 `radius` 的范围，且相距不超过 `rowRange` 行时，植物依次经历四个状态：`calm`、`lowering`（`lowerTicks`）、`scared` 和 `raising`（`raiseTicks` 区间）。
- 不在 `calm` 状态时不射击。回到 `calm` 后，要等待一个完整间隔（`cadenceTicks.max`）才会射击。
- 不能与引信、地雷、大嘴花、咬咬碑或生长能力同时编写。

#### 引信

`fuse: { ticks, explosion or freeze }` 二者取其一：

- `explosion` 是樱桃炸弹的爆炸。可以附加 `crater: { ticks }`，爆炸后在植物所在格子留下持续 `ticks` 的弹坑（末日菇）；弹坑属于植物所在的阵营。
- `freeze: { ticks, coldTicks, chillTicks, damage, boardTicks }` 是冰川菇的冰冻。引信燃尽时，所有敌对植物和僵尸被冰冻 `ticks` 区间内的一段时间（已减速或已冰冻者为 `coldTicks`），随后减速 `chillTicks`，并受到 `damage` 伤害（穿透僵尸的护具）；场地会在 `boardTicks` 内记录被冰冻的一方。
- 夜间植物睡着时引信不会燃烧，僵尸照常啃食它。

#### 减速与冰冻免疫

植物和僵尸定义都可以有 `unchillable` 和 `unfreezable`。

- 植物只能写 `true`（任何时候都免疫）。只在特定状态下免疫由其类决定，例如出土中的土豆地雷（`PotatoMine.keptFromIce`）。
- 僵尸可以写 `true`，或一组僵尸状态（如撑杆僵尸的 `["airborne"]`）。
- `unchillable` 完全不受减速：寒冰射手和冰川菇都对它无效，因此也永远不会被冰冻。`unfreezable` 不会被冰川菇冰冻，只会被减速，也不受冰冻伤害。

#### 被迷糊菇控制

植物的 `mindControl: true`（迷糊菇）会让在它醒着时啃食它的敌对僵尸，或一口吞下它的敌对植物（这一口不算吞掉它），转到它的阵营。停止啃食继续前进的僵尸，会按自身类型重新抽取速度。见[阵营与迷糊菇](TEAMS.zh-CN.md)。

#### 僵尸尺寸

僵尸的 `scale` 是其绘制尺寸，以 Reanim 的 (30, 120) 为中心缩放。它以该尺寸沿地面轨迹行走，动画相应加快。本体的僵尸都按 1 绘制：舞者僵尸与伴舞僵尸的美术资源比其他僵尸大四分之一，原版的 0.8 已放进本体转换后的图片和 Reanim（`tools/pvz/oversized.py`），因此替换它们的图片也应与其他僵尸同样大小。

#### 舞蹈

僵尸的 `dance` 使其跟随场地共享的节拍（`DANCE_BEAT`）跳舞：前 12 拍用 `walk` 行走，其余拍子用 `raise` 举手站立。它需要 `raise` 片段。

- 一组僵尸（领舞者及其召唤的伴舞）中只要有一个在啃食或被冰冻，整组都会停住；只要有一个被减速，整组都会减速。
- `dance.lead: { moonwalkTicks, backup, troupe, holdTicks, summonTicks, summonBeforeX, riseTicks }` 使其成为领舞者。
- 领舞者先用 `moonwalk` 片段（带有 `fps`，以及按行进方向记录的 `ground`）以该片段自身的节奏太空步 `moonwalkTicks`。减速对此无效；太空步期间被冰冻的，解冻后原地站立直到太空步结束。
- 随后播放 `point`（带有 `fps` 和 `hold`）打响指，把 `backup`（必须是带 `dance` 且没有 `lead` 的僵尸）召唤到 `troupe` 中的每个位置 `{ row, x }`。行和 x 相对于领舞者，在植物方会左右镜像。伴舞在 `riseTicks` 内从地下升起。
- 之后静止 `holdTicks`。伴舞不全时先等待 `summonTicks`，再在其 x 进入 `summonBeforeX` 以内后的举手拍上再次召唤。

#### 子弹射程

子弹的射程限制 `lifetimeTicks` 可以写在子弹定义中，作用于所有发射它的植物；也可以写在植物的 `shooter.projectile` 中，只作用于该植物。例如小喷菇的 `{ "id": "pvz:spore", "lifetimeTicks": 75 }`；胆小菇发射同一种孢子，但没有射程限制。

#### 保龄球坚果

保龄球坚果属于植物类型 `bowlingnut`。其 `bowling` 配置的各项默认取原版 `Plant::UpdateBowling` 的值，植物只需写出要改的项。

### 植物与僵尸的表现

#### 僵尸表现

- `shadow` 可以有 `scale`，以影子中心缩放。
- `turnedOffsetX` 使僵尸转身（面朝右）时身体再向右绘制这么多，按僵尸的 `scale` 计。原版把每个僵尸转身后向右移 90；舞者僵尸与伴舞僵尸的 −6 使它们停在原版 0.8 所得的位置。
- `held: { x, y, scale? }` 先按 `scale`（默认 1）缩放手持时的缓存图像，再平移 (`x`, `y`)（原版 `Plant::DrawSeedType`；舞者僵尸的 (6, 10)）。
- `portrait` 可以有 `clip`，图鉴小窗绘制它的第一帧（默认 `idle`，按僵尸的 `scale` 绘制）。种子包的 `packet.clip` 和手持图像按 Reanim 自身尺寸绘制。
- `drops` 中的部件可以有 `behind: true`，在掉落时绘制在僵尸后面一层（舞者僵尸的头）；也可以有 `scale`，在特效和僵尸尺寸之外进一步放大。
- 带 `dance` 的僵尸，其表现可以有 `dance: { music?, spotlight?, rise? }`：
  - `music` 在领舞者第一次打响指时播放（场上僵尸不超过 15 个时），场上没有领舞者时停止。
  - `spotlight: { floor, floorOffset, beam, beamOffset, scale, colors, colorsFrom, colorTicks, colorStep }` 是领舞者第一次打响指后的聚光灯：`floor` 画在它下方，`beam` 画在它上方，颜色随时间在 `colors` 中循环。
  - `rise` 是伴舞从地下升起的方式，字段与墓碑僵尸的升起相同（`depth`、`riseTicks`、`clip`），另有升起开始时的 `particle` 和 `sounds`。
- `steps: { effect, marks: [{ at, x, y }] }`：行走动画每次到达 `at`（片段长度的比例）时，在僵尸位置加 (`x`, `y`) 处播放一次 `effect`，位于僵尸下面一层，向右走时镜像（橄榄球僵尸的扬尘）。

#### 植物表现

- `shake: { clip, tracks }`：本体播放 `clip` 期间，`tracks` 中的每条轨道每个逻辑步在各个方向上随机偏移，幅度不超过其值（末日菇引信燃烧时头部的抖动）。
- `muzzle: { effect, x, y }`：每次射击时，在子弹起点（子弹的左上角）加 (`x`, `y`) 处播放一次 `effect`，位于该行小推车图层之上；僵尸方的植物按子弹碰撞框镜像（小喷菇、胆小菇和寒冰射手的枪口烟雾）。
- `freeze: { effect, layer }` 和 `freezeSounds` 是冰冻引信触发时在植物中心播放的特效和音效（冰川菇）。

#### 冰块

基础表现的 `iceTrap` 是被冰冻的植物或僵尸下方的冰块：两张图像 `back`（后）和 `front`（前），冰碴粒子 `release`，以及 `zombie` 和 `plant` 各自的 `{ x, y, scale?, releaseAt }`（原版以实体左上角为原点、Y 轴向下的像素）。植物或僵尸的表现可以用自己的 `iceTrap: { x, y, scale? }` 替换其所属分组的位置（原版 `Zombie::DrawIceTrap` 为撑杆僵尸、巨人僵尸等设置的偏移）。

### 子弹表现

子弹表现可以配置 `shadow`：`sprite`、单行图集的 `columns`/`cell`、`offset` 和 `scale`。影子单独绘制在地面图层上，X 跟随子弹，Y 为所在行的起点加 `offset.y`。它经由同一个资源加载器读取，因此会保持 HD 包的逻辑尺寸。

### 视图、掉落物与关卡规则

- 植物、僵尸、子弹、掉落物和格子物品的表现都可以有 `viewConfig`：一个任意的 JSON 对象，原样保留，由 `view` 指定的视图（通常是模组自己注册的视图）读取并校验。基础游戏只检查它是否为对象。
- 关卡规则的表现（`rules`）中，除 `graveRise` 外的字段都由该规则自己的视图读取并校验。
- 掉落物的点击范围属于玩法：物品定义的 `clickPadding` 和关卡的 `itemClickPadding`。点中了哪个物品由服务端判定。

### 成就

成就写在玩法 `achievements` 表中，从 ID 映射到 `{ titleKey, descriptionKey, icon: { sprite, index }, trigger? }`。图标是把 `sprite` 切成 70×70 的格子、每行 7 格后的第 `index` 格。成就页面和奖励界面先列出基础游戏的成就，再依次列出各模组的成就。

**授予**：服务端脚本用宿主模块 `server/achievements/achievements` 中的 `grantAchievement(world, id, announce)` 授予成就。

- 玩家已拥有的成就不会再次授予。
- `announce` 为 true 时立即在关卡中宣布；否则等到关卡结束后在奖励界面上列出。
- 由客户端把玩家档案交给菜单接口保存。
- 关卡定义写 `achievements: false` 时，该关卡不授予任何成就，适合测试关卡。

**触发条件**：成就的获得方式写在 `trigger: { kind, ...settings }` 中。游戏代码只发送服务端事件；成就模块观察每个事件，并按 `kind` 指定的触发类型判断。基础游戏的触发类型（见[成就](ACHIEVEMENTS.zh-CN.md)）：

| `kind` | 设置 |
| --- | --- |
| `pvz:blast` | `plants`、`kills` |
| `pvz:bowling` | `plants`、`hits` |
| `pvz:coin-streak` | `items`、`coins` |
| `pvz:sun-held` | `sun` |
| `pvz:win-planting` | `boards`、`skipRules`、`only` / `never` |
| `pvz:mind-controlled` | `zombies` |

模组新增的成就可以直接使用这些类型。需要新的判断方式时，用 `registry.achievementTriggers.register(ownerId, kind, { validate, observe })` 注册（`registry` 是宿主模块 `gameplay/registry`，即 `server/registry/GameplayRegistry` 的实例）。`observe` 接收事件、设置，以及该成就在本关中的状态（保存在存档中）。要让基础成就把模组的植物也计算在内，在模组自己的 `achievements` 中按它的 ID 修改 `trigger`。

### 商店

商店同样是玩法定义表：模组在自己的命名空间中添加条目，并可按 ID 修改任何人的条目。`store` 按物品 ID 给出商店物品：

```text
{ page, place, cost or prices, message or messages, purchase, level?, completed?, requires?, effect?, unlockChallenge? }
```

- 物品 ID 同时是其购买次数在玩家档案中的键，因此不同模组的物品不会共用计数。
- `page` 指向 `storePages` 表中的页面：`{ level? }` 或 `{ completed: true }`，对应原版 `StoreScreen::IsPageShown`。页面按注册顺序排列，先是基础游戏的四页，再依次是各模组的页面。
- `place` 是物品占用页面 8 个格子（两行）中的哪一格（0–7）。每页的一个格子只能放一个物品：模组可以把物品放进基础页面的空格，也可以注册自己的页面。
- `prices` 和 `messages` 按已购买次数选取。`requires` 中的 `anyPurchases` 和 `allPurchases` 指定物品 ID。
- 整个商店必须恰好有一个 `effect: "seedSlots"` 的物品：疯子戴夫在关卡中出售的卡片槽升级。显示的卡片槽数量为 `seedBank` 的 `baseSlots` 加上每次购买的一个，最多 `maxSlots`。

`purchase.kind`：

| 类型 | 字段 | 效果 |
| --- | --- | --- |
| `set` | `value` | 存入 `value`。 |
| `count` | `amount`、`limit` | 增加 `amount`，最多到 `limit`。 |
| `stock` | `minimum`、`amount`、`limit` | 在至少 `minimum` 的基础上增加 `amount`；超过 `limit` 即售罄。 |
| `timestamp` | | 记录购买时间。 |
| `plant` | | 把 `settings` 中 `zenGarden.template` 指定的植物种进一个花盆，放入休闲花园。 |
| `seed` | `id` | 出售一个种子，可以是尚未安装的升级植物。 |

物品外观写在表现 `store` 表中，使用相同的 ID：`sprite`、`offset` 和 `highlight`。`stock` 物品一次出售多个时显示的“x5”来自玩法数据中的 `amount`；没有 `sprite` 时，绘制它所出售种子的种子包。商店界面的时间安排和疯子戴夫的台词写在基础表现的 `storeDialogue` 中。

### 图鉴

- 图鉴的植物页面就是选卡界面的网格（原版 `AlmanacDialog::GetSeedPosition`），不需要条目。
- 玩法 `almanac` 表按僵尸 ID 给出僵尸页面的小窗：`{ place, startingLevel, spawnedOnly?, afterAdventure? }`。`place` 是从 0 开始、每行 5 个的位置，不能重复，每个键都必须是已有的僵尸。
- 植物或僵尸在图鉴中所站的地面写在表现 `almanac` 表中，按植物或僵尸 ID 索引。`ground` 为 `day`、`night`、`pool`、`nightpool`、`roof` 或 `ice`，植物还可以加 `upgrade: true`（升级植物的种子包背景）。没有条目时站在白天的地面上。

### 工具

工具写在玩法 `tools` 表中，从 ID 映射到 `{ kind }`，`kind` 表示工具的作用；目前只有 `shovel`（铲除格子中的植物）。关卡的 `tools` 和 `kind: "tool"` 的奖励必须指向已有的工具，每个工具还需要在表现 `tools` 中有外观；缺少即加载失败。

## 资源

所有资源类别共用一套定义：

| 类别 | 条目 | 说明 |
| --- | --- | --- |
| `sprites` | 对象 | 见[图像](#图像)。 |
| `fonts` | 字体 JSON 路径 | 见[字体](#字体)。 |
| `audio` | 文件路径 | MP3 或 WAV。 |
| `json` | 文件路径 | 普通 JSON，包括 `pvz:strings` 文本表。 |
| `text` | 文件路径 | 纯文本。 |
| `reanim` | 文件路径 | Reanim 动画（schemaVersion 3），记录其源 `fps`。 |
| `particles` | 文件路径 | 见[粒子](#粒子)。 |
| `music` | 文件路径 | 见[音乐](#音乐)。 |
| `prefabs` | 文件路径 | 引擎预制体，仍有引擎导入方面的要求。 |

新的动画、粒子和音乐配置使用各自的类别，普通 JSON 使用 `json`。替换已有资源只需使用原 ID；新资源使用模组自己的命名空间。

### 图像

```json
"example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80, "scale": 2 }
```

- `width` 和 `height` 是逻辑尺寸，`scale` 是纹理的分辨率倍数。例如逻辑尺寸 50×70、实际为 100×140 的图像，配置为 `scale: 2`。
- 可选的 `rect`、`offset` 和 `borders` 分别控制裁剪、偏移和九宫格切分。
- `animations` 限定替换只作用于哪些动画 ID。
- `alphaMode: "premultiplied"` 把源 PNG 标记为预乘 alpha；未标记或为 `"straight"` 时保持普通 RGBA。该标记按 PNG 文件生效，共用同一文件的切片不能声明相互冲突的格式。通过 `assets.sprite(path)` 按原始路径读取的图像使用同一份列表。基础加载器以统一方式解码非隔行的 RGBA8 PNG 并还原其颜色。
- 每张图像（无论 `alphaMode` 为何，无论来自基础游戏还是模组）加载时都会像原版一样进行“颜色填充”：每个完全透明的像素取上下相邻行中相邻可见像素的平均颜色，没有则为黑色，其 alpha 不变。这样线性采样时边缘不会混入黑边。因此，图像中完全透明像素原本携带的 RGB 不会保留。
- 网页版和原生版走同一条路径。动画、淡入淡出和普通 Sprite 都使用默认混合方式，模组无需自行设置混合因子。

客户端脚本可以用两种方式读取图像：

- `assets.sprite(path)` 按路径直接读取模组自己的图像，复用共享的资源解码与缓存，其他包无法替换它。
- `assets.spriteResource(id)` 按资源 ID 读取。模组在自己的 `content.json` 中注册该 ID 后，优先级更高的包（如 HD 包）可以用同一 ID 替换它。

### 字体

字体 JSON 通过 `layers[].image` 引用同一目录下的 PNG，`textureScale` 设置字形纹理的密度，并保持原有排版。

正常游玩时字体只按 ID 覆盖，没有“只读取基础版本”的特例。热键字母使用单独的 `pvz:hotkey`（与 `pvz:houseofterror16` 是同一个文件），因此文本包只覆盖后者，热键保留原版字形；HD 包需要同时注册 `pvz:hotkey` 才能重绘热键字母。

### 文本

所有文本都在一张按键合并的文本表 `pvz:strings` 中。

- **基础层**：基础游戏这一层是原版文本（包括关卡提示；服务端只发送提示的键），加上基础游戏新增的界面文本。新增文本手写在 `tools/pvz/ui-strings.json` 中，在生成 pvz-base 时合并进来；其键不能与原版重复。
- **模组层**：模组在 `content.json` 的 `json` 资源中把自己的 `pvz:strings` 文件注册为一层。新键必须带模组自己的命名空间（如 `example:menu`）。任何已有的键，无论属于基础游戏还是任何模组，都可以改写，以启用优先级更靠后的为准。因此翻译包只需列出要改的条目，也可以翻译其他模组的文本。
- **错误**：违反上述规则的新键会被忽略，并在控制台报告。值不是字符串时，会作为归属于该模组的错误处理。
- **查找**：`ui.text(key)` 只接受键，没有默认值；缺少的键会显示键名，并在控制台报告。`ui.format(key, args)` 依次填入 `%s` 和 `%d`。
- **语言**：翻译包在 `manifest.json` 的 `locale` 中声明其文本语言（如 `zh-CN`）；以最后一个声明了 locale 的已启用模组为准，默认为 en-US。基础游戏以 `ui.locale` 提供该值，带文字的图片资源据此选择版本（例如宽屏模组成就页面的顶部）。

### 音乐

每首背景音乐是一个 `music` 资源，ID 为 `pvz:<曲名>`。基础游戏的曲目有 `day_grasswalk`、`night_moongrains`、`choose_seeds`、`title_theme`、`zen_garden`、`puzzle`、`minigame`、`conveyer` 和 `final_boss`。

格式定义在 `shared/content/music.ts` 中（schemaVersion 3）：时长、循环点、以音频资源 ID 表示的分轨（`main`，以及可选的 `drums` 和 `hihats`），以及可选的原版爆发段落。音乐模组用相同 ID 注册要替换的曲目，其余曲目仍使用基础游戏的。

## 动画片段

动画的使用方用一个按名称索引的 `clips` 对象描述片段，包括只有一个片段的使用方，如掉落物（`idle`）、带动画的子弹（`fly`）、掉落的护具（`drop`）和打僵尸规则（`hammer`）。界面布景使用 `screens[screenId].clips`，按绘制顺序排列。表现顶层的 `clips` 表存放共享特效，如 `pvz:sod-roll` 和 `pvz:final-wave`；模组可以添加带命名空间的 ID，并按 ID 修改已有条目。

| 字段 | 含义 |
| --- | --- |
| `reanimId` | 必需。所用的 Reanim 资源。 |
| `x`、`y` | 局部偏移（向右、向上）。 |
| `scale` | 默认为 1。 |
| `fps` | 绝对帧率，替代 Reanim 的源 `fps`。 |
| `rateScale` | 帧率倍数。`fps` 和 `rateScale` 都接受一个数值，或在播放开始时抽取的有序区间。 |
| `start` | `random` 或 `end`；否则从头开始播放。 |
| `loop` / `hold` | 循环播放，或播完一遍后保持最后的姿势。 |
| `onlyTracks` | 选取确切的轨道 ID。 |
| `blend` | 过渡时间，单位为秒。 |
| `fullLastFrame` | 让最后一帧占满完整的帧间隔。 |
| `attachmentTrackId`、`attachmentBase` | 附着到另一个图层（植物和僵尸的图层）。 |

例如掉落物的旋转：

```json
"clips": { "idle": { "reanimId": "example:coin", "rateScale": [0.6, 1], "loop": true, "start": "random" } }
```

植物和僵尸的图层从服务端动画获得时间和循环，从视图获得缩放。它们只接受单个 `rateScale`，并可以用 `attachmentTrackId` 和可选的 `attachmentBase` 附着到另一个图层。附着的图层以该轨道为原点；单独绘制时才使用自身的偏移。

规则或视图从自己的配置中读取片段时，使用共享的 `parseClip` 或 `parseClips`（`shared/content/presentation`），再用 `prepareClips` 和 `showClip`（`client/reanim/clips`）加载和播放。

## 粒子

粒子全部注册在 `resources.particles` 中。其 JSON 使用 `schemaVersion: 3`、完整限定的 `id` 和 `emitters`。

- 每个发射器的 `sprite` 也是带命名空间的 ID。图集使用 `columns`、`rows`、`firstFrame` 和 `frameCount`。
- 可选属性可以覆盖原版的循环、生成配额、着色、旋转、碰撞和力场；共享解析器会补全默认值。
- 轨道写作 `{ "nodes": [{ "time": 0, "low": 1, "high": 1 }] }`。`time` 是生命周期的比例，`systemDuration` / `particleDuration` 的值以 0.01 秒的逻辑步计。
- `clipTop`、`clipBottom`、`clipLeft` 和 `clipRight`（0–1）像原版 `RenderParticle` 一样，从精灵格子的各边裁去相应比例。剩余部分以粒子位置加上未取整的上、左裁剪量为中心绘制（例如僵尸从地下升起时粒子中伸出地面的手）。
- `fullScreen: true` 的发射器（原版的 `FullScreen`）用粒子当前的颜色和 alpha 填满整个屏幕，与粒子的位置和大小无关。原版会对整个画面执行一次 `FillRect`（冰川菇和末日菇的闪光，其图像为 `pvz:whitepixel`）。颜色和 alpha 仍由粒子内核计算，客户端只是把它的四边形拉伸到屏幕四角（`ParticlePlayer` 的 `fillScreen`）。

XML 转换始终经由 `tools/pvz/particles.py`。对于基础内容包，它会临时解包 PAK，直接转换到 `mods/pvz-base/assets/particles/` 并把文件登记到资源列表中，再由通用的模组打包器打包。转换会保留原版的曲线和随机分布，由共享的粒子内核计算。

脚本用 `ParticlePlayer.spawn({ parent, id: 'example:burst', x: 0, y: 0, seed: 123 })` 播放粒子，所有平台使用同一个 C++ 核心。`whenReady()` 等待加载完成；`snapshot()` 和 `ParticlePlayer.restore()` 使用相同的存档结构。

旧的粒子格式和旧的粒子存档已不再接受；现有模组的粒子资源需要重新转换并打包。

## 音效

客户端脚本通过 `SoundSystem.play(id, options)`（`client/sound/SoundSystem`）播放音效：

| 选项 | 作用 |
| --- | --- |
| `foley: true` | 使用该音效的变体、音高范围和重复抑制。 |
| `pitch` | 以半音为单位的固定音高偏移。 |
| `channel` | 命名通道；默认情况下新请求会替换该通道上的上一个请求。 |
| `ifBusy: 'keep'` | 通道上的当前请求保持不变，包括正在加载或已暂停的请求。 |
| `pauseWithGame` | 跟随场地暂停。独立的音效也可以在其 Foley 定义中设置该项；单次调用可以覆盖这个设置。 |

例如 `SoundSystem.play(id, { channel: 'dancer', ifBusy: 'keep', pauseWithGame: true })` 让所有舞者共用一个迪斯科音效。用 `isChannelActive(channel)` 检查通道是否被占用，用 `stopChannel(channel)` 取消播放或尚未完成的加载。表现定义中的音效列表可以直接传给 `SoundSystem.playSounds(sounds)`。

## 脚本

### 入口

每一侧的入口总是 `register({ host, assets })`：

```ts
export function register({ host, assets }) {
    const registry = host.get('gameplay/registry')
    const { Shooter } = host.get('server/plants/Shooter')
    registry.plants.register(assets.id, 'example:rapid_pea', regenerating(Shooter))
}
```

- 服务端入口（`src/server/index.ts`）注册自定义的植物、僵尸和子弹类型、规则以及指令；在游戏中由 `cocosModule` 运行。客户端入口（`src/client/index.ts`）注册视图、菜单和客户端指令。
- `register` 可以是 `async` 函数。加载器在模组的静态定义注册完成、在它之前的模组加载完成之后调用它；服务端入口先于客户端入口运行。
- 注册失败时，加载器会撤销该模组的定义、注册内容和方法包装（调用 `host.dispose()`）。纯资源、数据和脚本模组都使用同一个加载入口。
- `src/server/` 和 `src/client/` 分别编译，不能导入对方的文件或宿主的源码。两侧共享的数据放在压缩包内的 JSON 文件中，用 `assets.json()` 读取；宿主代码通过 `host.get()` 获取。

### 宿主模块

`host.get(id)` 返回宿主的一个模块，即游戏自身使用的那个真实模块。ID 是模块在 `assets/scripts` 下的路径，不带扩展名；目录的 `index` 以目录名表示。例如 `client/plants/PlantView`、`server/seeds/planting` 或 `shared/protocol`。

| 侧 | 模块 | 额外的值 |
| --- | --- | --- |
| 服务端 | `server/` 和 `shared/` 下的所有模块，宿主自身的模块列表和 `createModHost` 除外 | `content/definitions`（玩法定义源）、`gameplay/registry`（玩法注册表） |
| 客户端 | `client/`、`shared/`、`platform/` 和 `core/` 下的所有模块，例外同上 | `cc`（引擎）、`content/definitions`（表现定义源）、`client/views`（视图注册表） |

模块移动后，其 ID 也随之改变。模块列表由 `npm run mod:hosts` 生成（`client/content/hostModules.ts`、`server/session/hostModules.ts`），添加、移动或删除模块后必须重新生成；测试会检查这些列表。不在列表中的 ID 会抛出 `Host module is unavailable`。

### 包装宿主方法

`host.around(target, key, wrapper)` 包装真实宿主对象上的方法：

```ts
host.around(target, 'method', function (next, ...args) {
    // 调用前
    const result = next(...args)
    // 调用后
    return result
})
```

- `this` 是原来的接收者。不带参数调用 `next()` 时，以相同参数调用下一层；`next(...values)` 则传入新的参数。
- 包装在各模组之间可以组合：最后添加的包装最先执行，原方法最后执行。
- 目标在 `key` 上必须是函数；包装可以加在对象上、单个实例上（某一个按钮的 `onClick`），也可以加在类的原型上（`MainMenuScreen.prototype`）。
- `host.around` 返回一个用于移除该包装的函数。`host.dispose()` 移除该模组的所有包装；模组也可以包装 `dispose` 本身，以清理自己创建的节点。
- `host.replace(target, key, replacement)` 直接替换一个方法；它是一个不调用 `next` 的包装。
- 宿主把规则导出为可修改的对象（`planting`、`executor`、`specs`），因为 ES 模块的命名空间导出无法可靠地修补。宿主内部也通过这些对象调用自身，因此包装对内部调用同样生效。

### 读取模组自身的文件

`assets` 代表模组自己的压缩包：

| 成员 | 返回 |
| --- | --- |
| `assets.id`、`assets.manifest` | 模组 ID 和解析后的清单。 |
| `assets.bytes(path)` | 文件字节的副本。 |
| `assets.json(path)` | 直接从压缩包读取并解析的 JSON 文件。 |
| `assets.url(path)` | 该文件的 `pvzmod:///<id>/...` URL。 |
| `assets.sprite(path)` | 仅客户端：按路径读取的图像（见[图像](#图像)）。 |
| `assets.spriteResource(id)` | 仅客户端：按资源 ID 读取的图像。 |

路径必须位于压缩包内。

### 注册表

服务端的 `gameplay/registry` 包含：

| 注册表 | 注册方式 | 由谁选用 |
| --- | --- | --- |
| `plants` | `register(ownerId, kind, Class)` | 植物定义的 `kind` |
| `zombies` | `register(ownerId, kind, Class)` | 僵尸定义的 `kind` |
| `projectiles` | `register(ownerId, kind, Class)` | 子弹定义的 `kind` |
| `extensions` | `register(id, validate?)` | `entity.extensions[id]`（见[实体数据](#实体数据)） |
| `levelRules` | `register(ownerId, kind, rule)`；规则至少要有 `validate` 和 `draft` | 关卡的 `rules.kind`；基础游戏的有 `pvz:adventure`、`pvz:bowling` 和 `pvz:whack-a-zombie` |
| `achievementTriggers` | `register(ownerId, kind, { validate, observe })` | 成就的 `trigger.kind` |
| `projectileMotions` | `register(ownerId, kind, { move, launch?, parseState? })` | 基础游戏的有 `pvz:straight`、`pvz:lob` 和 `pvz:homing`，由植物的 `shooter.type`（`shooter`、`lobber`、`seeker`）选择 |
| `tutorials` | `register(ownerId, id, script)` | 关卡的 `tutorial` |

`ownerId` 是模组的 ID（`assets.id`）。注册已被注册过的 ID 会报错。

客户端的 `client/views` 包含视图注册表 `plants`、`zombies`、`projectiles`、`mowers`、`gridItems` 和 `items`，以及接收服务端事件的 `events`。见[视图](#视图)。

**教程脚本**与关卡规则一样属于服务端注册。用 `registry.tutorials.register(ownerId, id, script)` 注册一个脚本（`server/tutorials` 中的 `TutorialScript`），关卡用 `tutorial: id` 使用它。加载时会检查每个关卡的 `tutorial` 都已注册：拼错或未注册的名称会使加载失败，而不是当作没有教程；没有教程的关卡不写 `tutorial`。脚本自己的步骤（`TutorialResource.step`）使用自己的命名空间，如 `example:dig`，并保存在存档中。

### 类型：为植物、僵尸和子弹添加玩法

模组为植物、僵尸和子弹添加玩法只有一种方式：编写一个类型（继承基础游戏某个类的类），注册它，并在定义中用 `kind` 选用。

- **自有字段**：模组类型自己的定义字段和实体字段，使用模组自身命名空间中的限定 ID 命名（如 `example:regeneration`）。
- **定义字段**：定义中的这种字段必须是 JSON 对象，并且只能与静态 `config` 列出了它的类型一起编写；`config` 列出某个字段的类型也要求必须写出该字段。这与基础游戏的 `shooter` 等字段规则相同。字段内容在加载内容时由该类型的静态 `validate(definition, id)` 检查（`GameplayRegistry.validate`）。
- **实体字段**：同名的实体字段保存在存档中，由 `restoreOwn` 读回并校验。
- **混入（mixin）**：要把同一种玩法加到不同类型上，可以写成 mixin：一个接收基类、返回其子类的函数。子类把自己的字段追加到静态 `config`，`validate`、`restoreOwn` 和它覆写的方法都调用 `super`。一个类可以叠加多个 mixin，带命名空间的字段不会互相覆盖。示例模组的 `regenerating` 同时用在一个射手和一个僵尸上。

```ts
const Regeneration = 'example:regeneration'
const regenerating = (Base) => class extends Base {
    static config = [...Base.config, Regeneration]
    static validate(definition, id) {
        super.validate(definition, id)
        // 检查 definition[Regeneration]
    }
    [Regeneration] = { ticks: 0 }
    act(...args) {
        // 累计 this[Regeneration].ticks，回复生命
        return super.act(...args)
    }
    restoreOwn(fields, name) {
        const { [Regeneration]: state, ...rest } = fields
        this[Regeneration] = /* 校验后的值 */ state
        super.restoreOwn(rest, name)
    }
}
```

#### 植物类型

植物按玩法定义的 `kind` 区分（默认为 `plant`；基础游戏另有 `shooter`、`scaredyshroom`、`producer`、`sunshroom`、`fuse`、`potatomine`、`chomper`、`gravebuster`、`hypnoshroom`、`wallnut` 和 `bowlingnut`）。它与表现定义的 `view` 一一对应（`Shooter` 与 `ShooterView`、`Chomper` 与 `ChomperView` ……）。

- 每株植物都是其类的实例，位于世界的 `plants` 列表中，带有 `id` 和 `position`。它的字段原样保存：射手的下次射击时间 `readyAtTick`、大嘴花的阶段 `phase` 等都是类的字段。
- 每株植物都有的状态是 `state`（`shared/content/plantKinds.ts` 中的 `PLANT_STATES`）：`idle` 表示在草坪上，`mowered` 表示已被小推车碾压，会留在列表中直到碾压动画结束。不在场上的植物不算植物；用 `server/level/lawn` 中的 `plantsInPlay(world)` / `plantInPlay(world, id)` 获取场上的植物（与原版 `Plant::NotOnGround` 相反）。
- 自定义类继承 `server/plants/Plant` 中的 `Plant` 或基础游戏的某个类，并覆写要改变的方法：`attack`（射击）、`produce`（生产）、`act`（自身能力）、`roll`（滚动）。
- `inedible(world)` 返回 `true` 时，啃食它的僵尸不会造成伤害；`mindControls(world)` 返回 `true` 时，啃食它的僵尸会被它控制。`keptFromCold()` / `keptFromIce()` 决定它此刻是否免疫减速 / 冰冻，`sitOut()` 在它被冰冻的逻辑步中推迟它自己的计时器。
- 用 `registry.plants.register(assets.id, kind, Class)` 注册，然后在植物定义中写上 `kind`。
- 种下时先运行 `start(random, tick)`（抽取初始等待等随机值）。子类在构造函数中为自己的字段赋初值，并覆写 `restoreOwn` 从存档中读回它们。
- `snapshotOwn(tick?)` 返回给客户端的内容出现在快照的 `own` 中，客户端视图用 `this.own(plant, field, validate)` 读取。
- 类自己的定义字段（`shooter`、`fright`、`producer`、`fuse`、`mine`、`chomper`、`graveBuster`、`mindControl`、`bowling`）只能与接受它们的类一起编写。动画的 `phases`、`offBoard.phase` 和 `blink.phases`，以及表现定义的 `packet.phase` 和 `shadow.phases`，只能指定其类拥有的阶段（`shared/content/plantKinds.ts`）。

#### 僵尸类型

僵尸按玩法定义的 `kind` 区分（默认为 `zombie`；基础游戏另有 `flag`、`polevaulter`、`newspaper` 和 `dancer`）。它与表现定义的 `view` 一一对应：服务端的一个类对应客户端的一个视图类（`Zombie` 与 `ZombieView`、`PoleVaulter` 与 `PoleVaulterView` ……）。

- 自定义类继承 `server/zombies/Zombie` 中的 `Zombie` 或基础游戏的某个类（如 `host.get('server/zombies/PoleVaulter').PoleVaulter`），并覆写要改变的方法。例如 `dodgesBite()` 返回 `true` 时大嘴花会咬空；`evades(key)` 返回 `true` 时，以 `key` 为瞄准键的植物（植物的 `targeting.insetKey`，如土豆地雷的 `pvz:mine`）不会选中它。
- 用 `registry.zombies.register(assets.id, kind, Class)` 注册，然后在僵尸定义中写上 `kind`。
- 要向客户端展示自己的内容，覆写 `snapshotOwn()` 返回一个 JSON 对象。它出现在快照的 `own` 中，客户端对应的视图类用 `this.own(zombie, field, validate)` 读取。
- 每个僵尸都是其类的实例，位于世界的 `zombies` 列表中。实例的字段原样保存，因此只能是普通数据（引用其他僵尸时使用其实体 id）。子类在构造函数中为自己的字段赋初值，并覆写 `restoreOwn(fields, name)` 从存档中读回：取出并校验自己的字段，把其余字段交给 `super.restoreOwn`。
- 类自己的定义字段（`vault`、`dance`、`enrage`）只能与接受它们的类一起编写，类的静态 `config` 列出了它接受哪些字段。撑杆僵尸的 `vault.evades` 列出它持杆期间不会被哪些瞄准键选中。

#### 子弹类型

子弹按玩法定义的 `kind` 区分（默认为 `projectile`；基础游戏另有 `mowing`，即出动后的小推车）。它与表现定义的 `view` 一一对应（`Projectile` 与 `ProjectileView`、`MowingProjectile` 与 `MowingProjectileView`）。

- 每颗子弹都是其类的实例，位于世界的 `projectiles` 列表中，带有 `id` 和 `position`，字段原样保存。
- 自定义类继承 `server/projectiles/Projectile` 中的 `Projectile` 或 `server/projectiles/MowingProjectile` 中的 `MowingProjectile`，并覆写 `canHit`（能否击中该目标）、`strike`（击中时做什么）和 `speedScale`（本逻辑步的速度倍数）。
- 用 `registry.projectiles.register(assets.id, kind, Class)` 注册，然后在子弹定义中写上 `kind`。
- `projectile` 类型必须有 `damage`，`mowing` 则不能有。射手的 `shooter.projectile` 覆盖也不能写其子弹类型不接受的字段。关卡的 `lawnMower` 必须是会碾压的类型（`MowingProjectile` 或其子类）。
- 停在每行末端待命的小推车是另一个类 `Mower`（`server/mowers/Mower.ts`），出动时发射一颗关卡 `lawnMower` 类型的子弹，自身从该行消失。

### 视图

自定义的植物或僵尸视图继承 `PlantView` 或 `ZombieView`，用 `host.get('client/views').plants.registerView(kind, Class)` 注册（僵尸用 `zombies`）。之后表现定义的 `view` 指定这个类型，其 `viewConfig` 提供视图的参数。

```ts
const { PlantView } = host.get('client/plants/PlantView')
class BeaconView extends PlantView {
    onBoard(plant, world, ...rest) {
        super.onBoard(plant, world, ...rest)
        // 只处理关卡内的效果；场外只运行 `pose`
    }
}
host.get('client/views').plants.registerView('example:beacon', BeaconView)
```

基础游戏的僵尸视图类型有 `zombie`（默认）、`flag`、`polevaulter`、`newspaper` 和 `dancer`（`FlagZombieView`、`PoleVaulterView`、`NewspaperView`、`DancerView`，都继承自 `ZombieView`）。

两个基础视图为子类提供相同的成员：

| 成员 | 用途 |
| --- | --- |
| `onBoard(entity, world)` | 每帧在场上绘制实体本身；先调用 `super.onBoard`。 |
| `pose` | 摆放各图层的姿势，场外同样使用。 |
| `shown(layer, entity)` | 决定某个图层显示哪个片段。 |
| `playable()` | 列出需要预先加载的 Reanim。 |
| `presentation` | 表现定义。 |
| `animation` | 玩法定义中的动画定义。 |
| `body` | 主体的播放器。 |
| `root` | 各图层所在的节点；移动它即移动整个画面。 |
| `clip(name)`、`ownFrames(reanimId)`、`particle(...)`、`flash` | 片段、帧、粒子和受击闪光的辅助成员。 |
| `own(entity, field, validate)` | 读取类型自己的快照数据（`snapshotOwn`）。 |

装饰效果应根据权威的逻辑步和快照计算，而不是依赖视图自己的时钟，这样暂停时就不会继续发射粒子。

### 实体数据

世界（`server/state/World`）是一组按类型分开的列表：`plants`、`zombies`、`projectiles`、`mowers`、`gridItems` 和 `items`。每个列表按 id 保存对象本身，并按 id 顺序遍历，没有 ECS 组件。

要在实体上保存自己的数据，把它放在实体的 `extensions[id]`（一个 JSON 对象）中，其中 `id` 是自己命名空间中的限定 ID，需先用 `registry.extensions.register(id, validate?)` 注册（`pvz:` 下的 ID 会被拒绝）。

- 已注册的数据随实体一起保存和读取，出现在快照的 `extensions[id][entityId]` 中，每次都会经过 `validate` 校验并复制。
- 未注册的数据既不保存也不发送。
- 类型自己的数据直接写成它的字段即可；`extensions` 用于附加在其他类型实体上的数据。示例模组的 `example:charge` 就以这种方式保存在植物上。

## 修改服务端规则

服务端规则按职责导出为对象，每个函数的第一个参数都是游戏的 `session`（包含 `world`、`definitions`、`gameplayTick` 等）。宿主内部也通过这些对象调用自身，因此包装对内部调用同样生效。

| 模块 | 对象与方法 |
| --- | --- |
| `server/seeds/planting` | `planting.seedAvailability`、`rejectSeed`、`selectSeed`、`selectConveyorPacket`、`placePlant`、`placeZombie`、`createPlant`、`findPlantAt` |
| `server/seeds/tools` | `tools.owned`、`available`、`select`、`use` |
| `server/items/items` | `items.collectAt`、`collect` |
| `server/session/commands` | `commands.execute`，执行所有玩家命令。协议中的 `{ type: 'mod', id, data }` 命令由基础游戏回复 `unsupported-command`；模组通过包装 `execute` 处理自己的命令。 |
| `server/session/snapshot` | `snapshot.build`，模组在此把自己的状态加入 `extensions` |
| `server/seeds/seedChooser` | `seedChooser.entries(definitions, owned)`（见下文） |
| `shared/protocol` | 两侧都能获取：客户端与服务端之间的数据格式及其辅助函数，如 `chooserEntryKey`（选卡界面卡片的唯一键；同一种子在两个阵营的卡片算作两张） |

```ts
const { planting } = host.get('server/seeds/planting')
host.around(planting, 'seedAvailability', function (next, session, seedId, ...rest) {
    const availability = next(session, seedId, ...rest)
    return availability.reason || seedId !== 'my-mod:plant' || ready(session.world)
        ? availability : { reason: 'seed-not-available', warningKey: 'my-mod:not_ready' }
})
```

**选卡界面的卡片**：`seedChooser.entries(definitions, owned)` 根据玩家拥有的种子，在基础选卡网格之外提供额外的卡片。它返回 `{ seedId, team? }` 条目，`team` 可以把卡片移到另一方阵营。基础游戏不提供任何额外卡片。

- 开启 `/cheatseed` 时，这些卡片排在基础游戏的分页卡片之后，重复的卡片只计一次。
- 它们与拥有的种子一样，计入卡片槽数量以及是否打开选卡界面：只有卡片多于卡片槽时才会打开选卡界面，否则全部直接放入种子栏。
- 选卡快照的 `entries` 列出这些卡片，`chooseSeed` 用相同的 `team` 选取其中一张。
- 在客户端，选卡界面用 `showCards` 决定网格显示哪些卡片；当一张卡片从种子栏退回而网格中没有它时，会调用 `onCardHidden`。
- 翻页按钮是选卡界面的 `pageTurners`（`{ button, step }`）。模组可以重绘它们，翻页仍由基础游戏处理。

## 扩展调试指令

用 `host.around` 包装现有的指令对象即可，没有单独的指令注册接口。两侧都能获取 `shared/debug/DebugCli`；解析、指令名补全、参数提示和静态参数值补全都读取它的 `specs.list()`。

### 声明语法

指令的语法为 `{ name, parameters, minimum, values? }`：

- `parameters` 给出参数提示和最大参数个数，`minimum` 给出最小个数。
- 可选的 `values: { 0: ['a', 'b'] }` 同时为第一个参数提供校验和补全。
- 指令名为小写，可以带模组命名空间。
- 使用现有的解析器即可保留引号参数等语法。

语法通过包装 `specs.list` 扩展，从不直接修改列表。

### 客户端指令

客户端入口添加 `/example:hello {name}`：

```ts
export function register({ host }) {
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:hello', parameters: ['{name}'], minimum: 1 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some(entry => entry.name === spec.name) ? entries : [...entries, spec]
    })

    const { executor } = host.get('platform/debug/DebugCliCommands')
    host.around(executor, 'execute', function (next, input, ...rest) {
        const parsed = cli.parseDebugCliCommand(input)
        if (!('name' in parsed)) return parsed
        if (parsed.name === spec.name) return cli.debugSuccess(`Hello ${parsed.args[0]}`)
        return next(input, ...rest)
    })
}
```

### 返回结果

- `debugSuccess` 和 `debugSyntax` 的消息只输出到控制台，因此直接写文本即可。
- `debugCondition` 表示条件不满足：调试窗口关闭，消息以提示的形式显示在屏幕上。它的第一个参数是文本键，其余参数依次填入文本中的 `%s`/`%d`。例如 `"example:cli_need_level": "Start a playing level first"`，写在模组注册的 `pvz:strings` 文本资源中（见[文本](#文本)）。
- 客户端用 `ui.format(key, args)` 查找该键；翻译包和模组文本都可以覆盖它，服务端从不需要文本表。

### 服务端指令

改变游戏状态的指令在服务端处理：

- 两侧入口使用相同的 `specs.list` 包装（可以放进模组两侧共用的源文件中），客户端不添加对应的执行包装。
- 有关卡时，正常的客户端入口会把原始指令转发给服务端。
- 集成运行时，两侧共用同一个语法对象，上面的同名检查可以避免补全重复出现。独立运行的服务端也必须声明语法。

服务端使用 `server/debug/debugCommands` 中的 `executor`。`execute(session, command)` 接收游戏的 `session`（包含 `world`、`definitions`、`gameplayTick` 等）以及经服务端解析和校验后的指令。种植等规则来自 `server/seeds/planting` 等模块，它们的第一个参数同样是 `session`。例如，要由服务端返回上面那条指令的消息，保留语法包装，把执行包装移到服务端入口：

```ts
const cli = host.get('shared/debug/DebugCli')
const { executor } = host.get('server/debug/debugCommands')
host.around(executor, 'execute', function (next, session, command) {
    if (command.name === 'example:hello') {
        return cli.debugSuccess(`Hello ${command.args[0]}, tick: ${session.gameplayTick}`)
    }
    return next(session, command)
})
```

- 服务端指令仍经过现有的调试权限和命令队列，暂停时也可以执行。模组需自行检查其操作所需的世界状态。
- 执行包装只处理自己的指令，其他指令交给 `next`。
- 注册失败时，加载器会随 `host.dispose()` 一起撤销语法包装和执行包装，不会留下失效的指令或补全。

## 开发与打包

```sh
npm run mod:init -- my-mod             # 从模板创建 mods/my-mod
npm run mod:pack -- mods/my-mod        # 编译并打包到 dist/mods/my-mod/ 和 dist/mods/my-mod.zip
npm run mod:test -- dist/mods/my-mod   # 检查打包后模组的服务端注册
npm run mod:hosts                      # 重新生成宿主模块列表
```

| 命令 | 选项 |
| --- | --- |
| `mod:init -- <name>` | `--out <directory>`，代替 `mods/<name>` |
| `mod:pack -- <name-or-directory>` | `--out <directory>`，代替 `dist/mods/<name>`；`--publish <zip-file>` |
| `mod:test -- <name-or-directory>` | |

只给名称时表示 `mods/<name>`。

示例模组 [Mod Lab](../mods/example/README.zh-CN.md) 演示了玩法类型与 mixin、实体上和存档中的模组数据、修改基础关卡、新增与覆盖资源、自定义视图、双端指令、菜单扩展以及生命周期清理。其功能表指向每项功能的实际实现。

### 打包

只有 `mod:pack` 会编译，源码目录中不会生成编译产物。它会：

- 从模组根目录复制 `manifest.json`、LICENSE、NOTICE 或 COPYING 文件以及 `conversion.json`（README 不打进包里），并复制 `assets/` 目录（定义表文件除外）；
- 把按类别拆分的定义合并为 `assets/gameplay.json` 和 `assets/presentation.json`。打包后的 `content.json` 保留资源映射，其 `gameplay` 和 `presentation` 指向生成的合并 JSON；
- 收集每个已声明的资源文件和每个字体图集；
- 把 `src/server/index.ts` 编译两次，分别输出到 `gameplay.nodeModule`（ES 模块，供 Node 使用）和 `gameplay.cocosModule`（SystemJS，供游戏使用），并把 `src/client/index.ts` 编译到 `client.module`（SystemJS）。`client.bundle` 目录不会被构建，它必须已经位于包内（例如 `assets/` 下）；
- 生成内容哈希；
- 输出 `dist/mods/<name>/`，并在旁边生成 ZIP。ZIP 把包放在顶层的 `<name>/` 文件夹中，其中 PNG 和 MP3 文件不压缩存储。

`--publish <zip-file>`：打包成功后，以原子方式用完整的 ZIP 替换指定位置；失败时保留之前发布的文件。

### 测试

`mod:test` 检查打包目录的真实服务端注册，不会重新编译：它像导入时一样检查包内文件，把模组的玩法定义注册到基础内容之上，运行服务端入口（`nodeModule`），并校验和冻结结果。给出模组的源码目录时（如 `npm run mod:test -- example`），它会先打包到临时目录，再检查该打包结果。

它不能代替在真机上检查客户端和画面。修改后需要重新打包、安装并重启。

## 基础内容包

基础游戏的 `assets/resources/base.zip` 与模组共用 `manifest.json`、`content.json`、定义解析器和资源解析器，没有单独的内容索引。

- 基础内容包总是最先加载，不能禁用或卸载。
- 其源码 `mods/pvz-base/content.json` 像模组一样索引按类别拆分的 JSON，打包时合并为 `assets/gameplay.json` 和 `assets/presentation.json`。
- 基础玩法还提供 `settings`（schemaVersion、阳光与金钱上限 `economy`、种子栏 `seedBank`、旗帜波的 `flagWave` 和休闲花园的 `zenGarden`）、全部关卡、默认文本和种子目录。之后加载的模组在各自的命名空间中添加内容。
- 每个资源（包括粒子）都在源码 `content.json` 的 `resources` 中显式登记；打包时不会扫描遗漏的资源。

打包与发布：

```sh
npm run mod:pack -- pvz-base                                       # dist/mods/pvz-base.zip
npm run mod:pack -- pvz-base --publish assets/resources/base.zip   # 同时发布内置 ZIP
```

两者都使用通用的模组打包器，哈希覆盖统一索引和每个文件。把原版资源转换到 `mods/pvz-base/` 的方法见[开发](DEVELOPMENT.zh-CN.md)。
