# Debug CLI

Debug 构建中按 `/` 打开；移动模式下，双击屏幕右下角 100 CSS 像素区域打开。启动加载期间不可打开。

沿用旧版操作：Tab 循环补全命令和已安装内容，↑/↓ 浏览最近 64 条历史，Enter 执行，Esc／Cancel 关闭。命令可省略 `/`；名称忽略大小写，实体名兼容空格、下划线和连字符。行列从 1 开始，调试命令允许使用整个棋盘范围，不受关卡激活行限制；省略僵尸行号时仍按关卡出怪行选择。

打开时暂停关卡及全局演出时间，关闭后恢复先前的暂停状态。`/gamespeed` 设置会保留，0 倍速也能输入、执行和关闭 CLI。语法错误闪红并保留窗口；条件不满足关闭窗口并显示原因。

| 用途 | 命令 |
| --- | --- |
| 页面跳转 | `/home`、`/help`、`/menu`、`/shop`、`/almanac`、`/zengarden` |
| 关卡入口 | `/level 1-1`、`/restart`；跳过旧存档提示 |
| 应用 | `/reload`、`/quit` |
| 倍速 | `/gamespeed {0-10}`，作用于统一游戏时钟 |
| 胜负／波次 | `/win`、`/lose`、`/nextwave` |
| 植物 | `/plant {plant_name} {row} {col}`、`/removeplant {row} {col}` |
| 僵尸 | `/zombie {zombie_name} [row] [col]`、`/damage {damage}`、`/kill` |
| 掉落 | `/item {item_name} [row col]`，当前支持 `sun`、`award` |
| 数值 | `/sun {add|set} {number}`、`/money {add|set} {number}` |
| 小推车 | `/lawnmower {trigger|reset} [row]` |
| 规则 | `/cooldown {true|false}`、`/suncost {true|false}`、`/sunspawning {true|false}` |
| 收集 | `/collect {auto|click|move}`，自动／移动收集仅处理普通掉落 |
| 快捷键 | `/hotkeys {true|false}`；当前 `1` 选择种子包，`D` 切换 0 倍速 |
| 碰撞框 | `/hitboxes {true|false}` |
| 高清种子包／头像 | `/hdseed {true|false}`，同时控制高清背景、植物渲染和僵尸头像渲染 |
| 超分字体 | `/hdfont {true|false}`，切换原字体与 4× 超分字体，像素字体保留原图 |
| 性能 | `/perf {plants|zombies|particles|sfx|logic} {true|false}` |
| 平台 | `/mobile {true|false}`、`/fullscreen {true|false}` |
| 音量 | `/music {0-100}`、`/sfx {0-100}`，通过设置 API 保存 |

`/hdseed true` 同时启用普通和紫卡种子包的 100×140 高清背景、全部 49 种图鉴植物的真实 Reanim 渲染，以及图鉴左侧全部 26 种僵尸的静态 Reanim 头像。也覆盖已实现植物的手持预览和半透明落点预览，保留静态姿态、缩放、透明度和明暗状态。`false` 恢复原图集背景和缓存头像。当前画面立即切换，包括放大的领奖种子包。覆盖种子栏、掉落奖励、领奖页、图鉴和商店；开关偏好保存在本地。模仿者种子包保留原来的专用背景样式。

`/hdfont true` 按需加载 4× 超分字图，菜单和关卡文字即时切换；`false` 恢复原字体。默认关闭，偏好保存在本地；两种模式共用原字号、字距和基线。`Pico129`、`Pix118Bold` 保持像素风格，不参与切换，Mod 字体也不替换。

当前内容包提供 `peashooter`、`repeater`、`normal` 和 1-1；植物、僵尸、物品、关卡补全来自后端已安装内容。`/nextflag`、`/background` 及尚未迁移的实体和关卡会提示不可用。

窗口复用 `UI.dialog`、`UI.input`；关卡修改通过 `debugCommand`／`debugResult` 通道执行，由后端验证并返回结果，不直接修改前端快照。规则开关作用于后端会话；冷却、阳光消耗、收集方式同时保存调试偏好，在新会话中重新应用。
