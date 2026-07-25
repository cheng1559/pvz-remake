# Debug CLI 说明

Debug CLI 是项目内置的调试命令窗口，用来快速跳关、生成实体、调整关卡状态和切换调试选项。

## Synopsis

```text
/{command} [arguments]
```

命令可以带 `/`，也可以不带 `/`。文档统一使用 `/command` 写法。

## 目录

- [关卡和界面](#关卡和界面)
  - [`/level`](#level)
  - [`/restart`](#restart)
  - [`/reload`](#reload)
  - [`/home`](#home)
  - [`/quit`](#quit)
  - [`/help`](#help)
  - [`/menu`](#menu)
  - [`/shop`](#shop)
  - [`/almanac`](#almanac)
  - [`/zengarden`](#zengarden)
- [关卡控制](#关卡控制)
  - [`/win`](#win)
  - [`/lose`](#lose)
  - [`/nextwave`](#nextwave)
  - [`/nextflag`](#nextflag)
  - [`/damage`](#damage)
  - [`/kill`](#kill)
  - [`/gamespeed`](#gamespeed)
- [实体和资源](#实体和资源)
  - [`/plant`](#plant)
  - [`/removeplant`](#removeplant)
  - [`/zombie`](#zombie)
  - [`/item`](#item)
  - [`/sun`](#sun)
  - [`/money`](#money)
  - [`/lawnmower`](#lawnmower)
- [调试开关](#调试开关)
  - [`/hotkeys`](#hotkeys)
  - [`/cooldown`](#cooldown)
  - [`/suncost`](#suncost)
  - [`/sunspawning`](#sunspawning)
  - [`/collect`](#collect)
  - [`/hitboxes`](#hitboxes)
  - [`/background`](#background)
  - [`/mobile`](#mobile)
  - [`/fullscreen`](#fullscreen)
  - [`/music`](#music)
  - [`/sfx`](#sfx)
  - [`/perf`](#perf)

## 打开方式

- 桌面端：按 `/` 键打开，输入框会默认带上 `/`。
- 移动端：在移动模式下，双击屏幕右下角边长约 `100 * devicePixelRatio` 像素的区域打开。

输入框支持：

- `Tab` 补全命令或参数。
- `Up` / `Down` 浏览本次运行中的命令历史。
- `Enter` 执行命令。
- `Esc` 或 `Cancel` 关闭窗口。

## 通用规则

- 命令名和 `{true|false}` 大小写不敏感；文档使用小写作为规范写法。
- `row` 和 `col` 都从 `1` 开始。
- 实体 id 使用本文列出的规范写法；CLI 会对大小写、空格、下划线和连字符做归一化匹配。
- 无效语法会让输入框闪红并留在 CLI；条件不满足会关闭 CLI 并显示提示。

## Commands

### `/level`

强制进入指定关卡，并跳过已有存档提示。

**Usage**

```text
/level {level}
```

**Arguments**

- `level`: 支持 `1-1` 到 `1-10`、`stress`，也支持完整 id `adventure-1-1` 到 `adventure-1-10`、`adventure-stress`。

**Availability**

- 非启动加载界面。

**Side Effects**

- 正式冒险关卡会同步冒险进度到目标关卡，并删除该关卡存档。
- `stress` 不写入正式冒险进度。

**Notes**

- `stress` 是内部压测关卡，会以满草坪、无卡槽、无小推车、无天降阳光、跳过开场的配置生成高密度桶僵尸波。

---

### `/restart`

重开当前关卡。

**Usage**

```text
/restart
```

**Availability**

- 关卡界面。

**Side Effects**

- 删除当前冒险关卡存档。
- 以新游戏方式重开当前关卡。

---

### `/reload`

重新加载整个游戏运行时。

**Usage**

```text
/reload
```

**Availability**

- 非启动加载界面。

---

### `/home`

返回用户选择 / 主界面流程。

**Usage**

```text
/home
```

**Availability**

- 非启动加载界面。

**Side Effects**

- 如果当前在关卡中，会先保存关卡快照。

---

### `/quit`

调用当前平台的退出逻辑。

**Usage**

```text
/quit
```

**Availability**

- 非启动加载界面。

**Notes**

- 平台不允许关闭窗口时，可能没有可见效果。

---

### `/help`

打开帮助界面。

**Usage**

```text
/help
```

**Availability**

- 非启动加载界面。

---

### `/menu`

打开菜单。

**Usage**

```text
/menu
```

**Availability**

- 非启动加载界面。

**Behavior**

- 关卡内打开游戏菜单。
- 非关卡界面打开全局选项菜单。

---

### `/shop`

打开商店界面。

**Usage**

```text
/shop
```

**Availability**

- 非启动加载界面。

**Side Effects**

- 从正在运行的关卡打开时会暂停关卡，关闭后恢复。

---

### `/almanac`

打开图鉴界面。

**Usage**

```text
/almanac
```

**Availability**

- 非启动加载界面。

**Side Effects**

- 从正在运行的关卡打开时会暂停关卡，关闭后恢复。

---

### `/zengarden`

打开禅境花园界面。

**Usage**

```text
/zengarden
```

**Availability**

- 非启动加载界面。

---

### `/win`

直接触发当前关卡胜利流程。

**Usage**

```text
/win
```

**Availability**

- 运行中的关卡。

---

### `/lose`

直接触发当前关卡失败流程。

**Usage**

```text
/lose
```

**Availability**

- 运行中的关卡。

---

### `/nextwave`

立即生成下一波普通僵尸。

**Usage**

```text
/nextwave
```

**Availability**

- 运行中的关卡。

**Failure Conditions**

- 没有剩余波次时返回条件错误。

---

### `/nextflag`

立即生成下一次旗帜波。

**Usage**

```text
/nextflag
```

**Availability**

- 运行中的关卡。

**Failure Conditions**

- 没有剩余旗帜波时返回条件错误。

---

### `/damage`

对场上所有可受伤僵尸造成指定伤害。

**Usage**

```text
/damage {damage}
```

**Arguments**

- `damage`: 正整数。

**Availability**

- 运行中的关卡。

**Side Effects**

- 僵尸因此死亡时会走正常伤害 / 死亡处理。
- 可能生成金币或关卡奖励掉落。

---

### `/kill`

直接移除场上所有未死亡僵尸。

**Usage**

```text
/kill
```

**Availability**

- 运行中的关卡。

**Behavior**

- 直接标记并移除场上所有未死亡僵尸。
- 移除后检查关卡完成。

**Side Effects**

- 不走正常死亡动画、伤害结算或掉落逻辑。
- 不会生成金币或关卡奖励掉落。

---

### `/gamespeed`

设置全局游戏速度。

**Usage**

```text
/gamespeed {speed}
```

**Arguments**

- `speed`: 数字，范围 `0` 到 `10`。`0` 等价于冻结逻辑。

**Availability**

- 非启动加载界面。

**Persistence**

- 不写入本地设置。

---

### `/plant`

在指定格子放置植物。

**Usage**

```text
/plant {plant_name} {row} {col}
```

**Arguments**

- `plant_name`: `peashooter`、`sunflower`、`cherrybomb`、`wallnut`、`explodenut`、`snowpea`、`potatomine`、`chomper`、`repeater`、`puffshroom`、`bowling-wallnut`、`bowling-explodenut`。
- `row`: 当前棋盘范围内的行号。
- `col`: 当前棋盘范围内的列号。

**Availability**

- 运行中的关卡。

---

### `/removeplant`

移除指定格子的植物。

**Usage**

```text
/removeplant {row} {col}
```

**Arguments**

- `row`: 当前棋盘范围内的行号。
- `col`: 当前棋盘范围内的列号。

**Availability**

- 运行中的关卡。

**Failure Conditions**

- 目标格没有植物时返回条件错误。

---

### `/zombie`

召唤僵尸。

**Usage**

```text
/zombie {zombie_name}
/zombie {zombie_name} {row}
/zombie {zombie_name} {row} {col}
```

**Arguments**

- `zombie_name`: `normal`、`flag`、`traffic-cone`、`bucket`、`ducky-tube`、`pole-vaulting`。
- `row`: 当前棋盘范围内的行号。
- `col`: 当前棋盘范围内的列号。

**Availability**

- 运行中的关卡。

**Behavior**

- 不传位置时，按当前关卡的生成行逻辑召唤僵尸。
- 只传 `row` 时，在指定行右侧边缘召唤僵尸。
- 同时传 `row` / `col` 时，在指定格子召唤僵尸。

---

### `/item`

生成掉落物。

**Usage**

```text
/item {item_name}
/item {item_name} {row} {col}
```

**Arguments**

- `item_name`: `silver`、`gold`、`diamond`、`sun`、`small-sun`、`large-sun`、`award`。
- `row`: 当前棋盘范围内的行号。
- `col`: 当前棋盘范围内的列号。

**Availability**

- 运行中的关卡。

**Behavior**

- 不传位置时，在默认棋盘位置生成掉落物。
- 传 `row` / `col` 时，在指定格子生成掉落物。

**Notes**

- `award` 会按当前关卡奖励配置生成最终奖励物，例如植物卡、铲子或纸条。

---

### `/sun`

修改当前关卡阳光数量。

**Usage**

```text
/sun {add|set} {number}
```

**Arguments**

- `add`: 按整数增减当前阳光。
- `set`: 直接设置当前阳光。
- `number`: 整数。

**Availability**

- 运行中的关卡。

---

### `/money`

修改当前金币数量。

**Usage**

```text
/money {add|set} {number}
```

**Arguments**

- `add`: 按整数增减当前金币。
- `set`: 直接设置当前金币。
- `number`: 整数。

**Availability**

- 运行中的关卡。

---

### `/lawnmower`

触发或重置小推车。

**Usage**

```text
/lawnmower {trigger|reset}
/lawnmower {trigger|reset} {row}
```

**Arguments**

- `trigger`: 触发小推车。
- `reset`: 重置已触发的小推车。
- `row`: 当前棋盘范围内的行号。

**Availability**

- 运行中的关卡。

**Behavior**

- 不传 `row` 时，操作全部可操作小推车。
- 传 `row` 时，只操作指定行。

**Failure Conditions**

- 没有可操作目标时返回条件错误。

---

### `/hotkeys`

开关关卡键盘快捷键。

**Usage**

```text
/hotkeys {true|false}
```

**Availability**

- 非启动加载界面。

**Persistence**

- 写入本地调试设置。

**Notes**

- `1 2 3 4 q w e r a s` 选择第 1 到第 10 个卡槽或传送带卡片。
- `f` 选择 / 取消铲子。
- `d` 在当前速度和 `0` 速度之间切换。

---

### `/cooldown`

开关卡片冷却。

**Usage**

```text
/cooldown {true|false}
```

**Availability**

- 非启动加载界面。

**Side Effects**

- 关卡界面中立即生效。
- 其他界面只更新设置，下次进入关卡生效。

**Persistence**

- 写入本地调试设置。

---

### `/suncost`

开关种植阳光消耗。

**Usage**

```text
/suncost {true|false}
```

**Availability**

- 非启动加载界面。

**Side Effects**

- 关卡界面中立即生效。
- 其他界面只更新设置，下次进入关卡生效。

**Persistence**

- 写入本地调试设置。

---

### `/sunspawning`

开关当前关卡的自然阳光生成。

**Usage**

```text
/sunspawning {true|false}
```

**Availability**

- 运行中的关卡。

**Persistence**

- 不写入本地设置。

---

### `/collect`

设置阳光和钱币的收集模式；关卡奖励不受影响。

**Usage**

```text
/collect {auto|click|move}
```

**Arguments**

- `auto`: 自动收集阳光和钱币。
- `click`: 点击收集阳光和钱币。
- `move`: 鼠标经过时收集阳光和钱币。

**Availability**

- 非启动加载界面。

**Side Effects**

- 关卡界面中立即生效。
- 其他界面只更新设置，下次进入关卡生效。

**Persistence**

- 写入本地调试设置。

---

### `/hitboxes`

显示或隐藏关卡内碰撞调试框。

**Usage**

```text
/hitboxes {true|false}
```

**Availability**

- 非启动加载界面。

**Behavior**

- 绿色框表示本体区域。
- 植物的红色框表示索敌范围；远程植物不会显示红色框。
- 僵尸的红色框表示啃咬植物用的攻击范围。
- 子弹和小推车只有红色框，表示它们用于命中僵尸的碰撞 / 攻击范围。
- 调试框绘制在实体层上方，便于直接对照画面位置。

**Side Effects**

- 关卡界面中立即刷新。
- 其他界面只更新设置，下次进入关卡生效。

**Persistence**

- 写入本地调试设置。

**Notes**

- 已死亡植物、已死亡子弹和已死亡小推车不会绘制。
- 处于 `dying`、`mowered`、`charred`、`burned` 状态的僵尸不会绘制。
- 该命令只影响调试绘制，不改变实际碰撞判定。

---

### `/background`

显示或隐藏宽屏两侧背景。

**Usage**

```text
/background {true|false}
```

**Availability**

- 非启动加载界面。

**Persistence**

- 写入本地调试设置。

---

### `/mobile`

临时切换移动端交互模式。它不会伪装设备类型，只切换项目内部按移动端处理输入和 UI 的分支。

**Usage**

```text
/mobile {true|false}
```

**Availability**

- 非启动加载界面。

**Behavior**

- `true`: 使用触控输入路径，禁用鼠标悬停和右键取消逻辑。
- `true`: 种植和铲子操作改为触摸按住 / 拖动 / 松手确认的流程，并显示移动端格子引导。
- `true`: 移动端按钮、商店、图鉴等 UI 使用触控状态，不使用鼠标 hover 状态。
- `true`: 可以通过双击屏幕右下角区域唤出 Debug CLI。
- `false`: 使用桌面输入路径，恢复鼠标 hover、右键取消和鼠标移动收集等行为。

**Persistence**

- 不写入本地设置；刷新后回到平台默认值。

**Warning**

- 在真实移动设备上执行 `/mobile false` 会切到桌面输入路径，但设备没有可用鼠标输入，之后将无法通过屏幕触控操作游戏；需要重启或刷新游戏恢复。

---

### `/fullscreen`

切换全屏设置。

**Usage**

```text
/fullscreen {true|false}
```

**Availability**

- 非启动加载界面。

**Failure Conditions**

- 移动端原生环境不能关闭全屏。
- 浏览器不支持全屏 API 时返回条件错误。

**Persistence**

- 写入普通游戏设置。

---

### `/music`

设置音乐音量。

**Usage**

```text
/music {0-100}
```

**Arguments**

- `0-100`: 整数百分比。

**Availability**

- 非启动加载界面。

**Persistence**

- 写入普通游戏设置。

---

### `/sfx`

设置音效音量。

**Usage**

```text
/sfx {0-100}
```

**Arguments**

- `0-100`: 整数百分比。

**Availability**

- 非启动加载界面。

**Persistence**

- 写入普通游戏设置。

---

### `/perf`

临时开关指定的渲染、音效或逻辑路径。

**Usage**

```text
/perf {plants|zombies|particles|sfx|logic} {true|false}
```

**Arguments**

- `plants`: 显示或隐藏植物节点和子弹节点。设为 `false` 后，植物和子弹仍存在于游戏逻辑中，但不会继续同步渲染。
- `zombies`: 显示或隐藏僵尸节点。设为 `false` 后，僵尸仍存在于游戏逻辑中，但不会继续同步渲染。
- `particles`: 启用或禁用玩法粒子系统，包括战斗粒子和选卡教程箭头；也会影响暂停 / 恢复动画时粒子系统是否重新启用。
- `sfx`: 启用或禁用音效加载、播放、停止和音量更新路径；不影响背景音乐。
- `logic`: 启用或禁用关卡固定 tick 更新。设为 `false` 后，当前关卡的战斗逻辑停止推进，累计 tick 会被清空。

**Behavior**

- 如果当前在关卡中，执行后会立即刷新对应的渲染 / 粒子状态。
- `plants=false`、`zombies=false` 只是隐藏并跳过对应实体渲染同步，不删除实体。
- `logic=false` 不是暂停菜单状态；它只阻止关卡逻辑 tick 继续执行。

**Availability**

- 非启动加载界面。

**Persistence**

- 不写入本地设置。
