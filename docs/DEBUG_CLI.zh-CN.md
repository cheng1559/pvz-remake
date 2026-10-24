# Debug CLI

Debug 和 Release 构建中均可按 `/` 打开；移动模式下，双击屏幕右下角 100 CSS 像素区域打开。启动加载期间不可打开。

沿用旧版操作：Tab 循环补全命令和已安装内容，↑/↓ 浏览最近 64 条历史，Enter 执行，Esc／Cancel 关闭。命令可省略 `/`；名称忽略大小写，实体名兼容空格、下划线和连字符。行列从 1 开始，调试命令允许使用整个棋盘范围，不受关卡激活行限制；省略僵尸行号时仍按关卡出怪行选择。

打开时暂停关卡及全局演出时间，关闭后恢复先前的暂停状态。`/gamespeed` 设置会保留，0 倍速也能输入、执行和关闭 CLI。语法错误闪红并保留窗口；条件不满足关闭窗口并显示原因。

`/plant {plant_name} {row} {col}` 直接创建已安装的植物，支持 Mod 植物，例如 `/plant corn:cob_cannon 3 1`。不受占格、升级前置、种子栏、阳光、冷却、教程和关卡阶段／结算状态限制；保留当前手持种子，并正常初始化植物注册的行为状态。仅要求 ID 已安装、行列在棋盘范围内，重叠植物也可正常存档。鼠标／触屏种植仍按正常规则校验。

| 用途 | 命令 |
| --- | --- |
| 页面跳转 | `/home`、`/help`、`/menu`、`/shop`、`/almanac`、`/zengarden` |
| 关卡入口 | `/level 1-1`、`/restart`；跳过旧存档提示 |
| 应用 | `/reload`、`/quit` |
| 倍速 | `/gamespeed {0-10}`，作用于统一游戏时钟 |
| 胜负／波次 | `/win`、`/lose`、`/nextwave` |
| 植物 | `/plant {plant_name} {row} {col}`、`/removeplant {row} {col}` |
| 替换种子包 | `/seed {槽位} {种子名}`，如 `/seed 1 snowpea` |
| 僵尸 | `/zombie {zombie_name} [row] [col]`、`/damage {damage}`、`/kill` |
| 掉落 | `/item {item_name} [row col]`，当前支持 `sun`、`award` |
| 数值 | `/sun {add|set} {number}`、`/money {add|set} {number}` |
| 小推车 | `/lawnmower {trigger|reset} [row]` |
| 规则 | `/cooldown {true|false}`、`/suncost {true|false}`、`/sunspawning {true|false}` |
| 收集 | `/collect {auto|click|move}`，自动／移动收集仅处理普通掉落 |
| 快捷键 | `/hotkeys {true|false}`；当前 `1` 选择种子包，`D` 切换 0 倍速 |
| 震动 | `/haptics {true|false}`，默认开启，立即生效并保存到本地 |
| 碰撞框 | `/hitboxes {true|false}` |
| 实时植物／僵尸头像 | `/hdseed {true|false}`，控制真实 Reanim 渲染，与背景清晰度独立 |
| 种子包风格 | `/seedstyle {standard|rendered|tilted}`，标准／实际渲染／放大右倾 |
| 材质包 | `/pack`（管理窗口）、`/pack install`、`/pack load {已安装ID}`、`/pack unload {ID或all}`、`/pack uninstall {ID}`、`/pack list` |
| Mod | `/mod`（管理窗口）、`/mod install`、`/mod load {已安装ID}`、`/mod unload {ID或all}`、`/mod uninstall {ID}`、`/mod list` |
| 性能 | `/perf {plants|zombies|particles|sfx|logic} {true|false}` |
| 平台 | `/mobile {true|false}`、`/fullscreen {true|false}` |
| 音量 | `/music {0-100}`、`/sfx {0-100}`，通过设置 API 保存 |

`/seed` 的槽位从左侧的 1 开始，替换为已安装的种子包，立即可用，并使用新种子的费用和冷却。替换正在拿取的种子包会清空光标；不允许与其他槽位重复。暂停和 0 倍速时也可执行，替换结果随关卡存档保存。

`/hdseed true` 启用图鉴植物和僵尸头像的真实 Reanim 渲染，以及已实现植物的手持与半透明落点预览，同时将种子包设为 `rendered`。`false` 使用缓存头像并将种子包设为 `standard`。按开关选择后才加载、创建对应图像，失败直接报错，不回退；偏好保存在本地。种子包背景清晰度由材质包独立控制。

`/seedstyle standard|rendered|tilted` 单独切换种子包风格并保存到本地：`standard` 为标准缓存图，`rendered` 为原比例实际渲染，`tilted` 在实际渲染基础上放大并顺时针旋转。植物仅按内部图片区的左侧和底部内边框裁剪，上方与右侧允许溢出。背景、费用和点击区域保持原尺寸；实际渲染与右倾风格之间切换时复用已加载的植物。此命令不影响图鉴僵尸头像和手持／落点预览。

`/pack install` 不带参数，在网页和 macOS 中弹出文件选择窗口，选择本机 ZIP 安装。安装弹窗只显示 `Installing...`；安装、更新或启用状态变化后提示重启，确认后立即重启整个游戏，运行中的关卡先保存。安装结果保存在本机，重启不依赖原 ZIP。`/pack load hd` 启用已安装包；`/pack unload hd` 停用；`/pack uninstall hd` 删除已安装包，删除已启用包也会提示重启；`/pack list` 查看启用列表。重复启用或停用不会弹窗，重启前保留当前资源。资源包只通过 ZIP 安装，游戏不内置 HD 素材。后启用的包优先覆盖同 ID 资源，也可覆盖 Mod ID；包内没有该 ID 时使用原资源，已声明资源加载失败不回退。原 `/hdfont` 已移除；`Pico129`、`Pix118Bold` 不在 HD 包中。包格式与安装方式见[材质包说明](RESOURCE_PACKS.md)。

`/pack`、`/mod` 不带参数时分别打开资源包或 Mod 管理窗口，见 [材质包说明](RESOURCE_PACKS.md#管理窗口)。`/mod` 与 `/pack` 共用 ZIP 选择、`Installing...` 和确认重启流程。`/mod install` 不带参数，其他操作使用 `local:widescreen` 等带命名空间的 Mod ID。安装结果保存在本地，检查依赖后在重启时执行；主界面宽屏可通过独立 Mod 启用。见 [Mod 安装与管理](MODS.md)。

当前内容包提供 1-1、1-2，植物有豌豆射手、向日葵、双发射手、樱桃炸弹、坚果墙、土豆雷、寒冰射手、大嘴花和爆炸坚果（`explodenut`，仅调试种植），僵尸有普通、旗帜、路障（`conehead`）、铁桶（`buckethead`）和撑杆（`pole_vaulter`）僵尸；植物、僵尸、物品、关卡补全来自后端已安装内容。`/background` 及尚未迁移的实体和关卡会提示不可用。

窗口复用 `UI.dialog`、`UI.input`；关卡修改通过 `debugCommand`／`debugResult` 通道执行，由后端验证并返回结果，不直接修改前端快照。规则开关作用于后端会话；冷却、阳光消耗、收集方式同时保存调试偏好，在新会话中重新应用。
