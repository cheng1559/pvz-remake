# 开发说明

冒险 1-5 使用 `ShovelTutorial` 保存戴夫两段对话和三株豌豆射手的铲除进度，客户端 `CrazyDaveView` 只播放动画、显示原版文案并发出交互指令。教程结束后进入 8 波坚果保龄球，传送带按 85:15 提供普通／爆炸保龄球，通关奖励为土豆雷。

`pvz:bowling-wallnut`、`pvz:bowling-explodenut` 是独立植物和种子定义，配置放在 gameplay／presentation JSON。服务端通过现有 `PlantBehaviorRegistry` 注册 `bowling` 行为，状态存入 `behaviorState`；客户端通过 `PlantViewRegistry` 注册 `BowlingNutView`。只复用坚果的美术资源，普通坚果不参与保龄球判断。`occupiesCell: false` 声明移动植物不占格、不作为啃食目标；`rowOrder` 控制行内表现顺序。

关卡设置 `seedBankSlots` 时，`seedPackets` 表示可选种子池；未设置则保持固定种子栏。`server/seedChooser.ts` 校验选择、移除和确认，顺序与初始冷却随服务端存档保存。`LevelSeedChooser` 读取初始快照并提交 `chooseSeed`／`confirmSeeds` 命令，只负责卡片飞行、补位、面板和提示；演出与全局时钟一致。测试入口为 `/level pvz:seed-chooser-test`，不改变正式关卡的选卡规则。

图鉴首页和详情已接入全部 49 种植物、26 种僵尸的 Reanim 展示动画，包含独立头部、眨眼、旗帜、装备及僵尸博士驾驶员；左侧缩略图沿用原版静态展示。`AlmanacEntityView` 只负责动画播放和裁剪，不创建后端实体，不实现攻击、产出、移动或受伤逻辑。全部动画使用全局时钟。资源配置由 `python tools/build_pvz_base.py --almanac-only --raw-root <raw目录>` 生成，完整构建也会包含这些资源。

主场景挂载 `app/GameApp.ts`，协调菜单页面，并通过 `app/LevelController.ts` 启动 `LocalIntegratedGame`。战斗逻辑在 `server` 中运行，客户端处理协议快照和事件。`server`、`shared`、`ecs` 不应引入引擎依赖。

菜单数据按 `screens → client/api/MenuApi → MenuTransport → server/menu/MenuService` 流转，`shared/menu` 定义请求和响应 DTO。后端负责用户档案与名称校验、商店目录／价格／库存／购买、挑战成绩、图鉴条目、成就条目／解锁状态和设置持久化。页面只渲染 API 返回的数据、提交 ID 和操作，不导入仓库或修改档案；确认购买时由后端重新校验当前用户、价格、库存和余额。请求与响应经过 JSON 往返，前端修改副本不会影响后端状态。

商店响应通过 `highlight` 指定不高亮、种子包闪光或带透明度的图片叠加高亮，`seedSlots`／`quantity` 指定可选的槽位／数量文字。前端按字段渲染，不根据商品 ID 推断样式；升级种子包和模仿者的特殊高亮在后端目录中配置。

`app/LocalMenuApi.ts` 接入项目现有的进程内本地后端，`GameApp` 启动时注入 Cocos 存储适配器；后端不依赖 Cocos 或 client。用户、设置和各用户存档继续沿用原键名。贴图、位图字体、本地化文案、布局、音效和实际全屏操作由前端负责。以后可替换同一 `MenuTransport` 接入网络服务，目前使用本地传输。

当前仅接通冒险 1-1。Debug 和 Release 构建均可按 `/` 打开调试 CLI；移动模式双击右下角打开，命令见 [Debug CLI](DEBUG_CLI.zh-CN.md)。主菜单已使用原版图片按钮和 Reanim 入场动画，Options 已接通设置与游戏内操作，图鉴和商店已接入内容与交互；后续关卡及其他模式玩法尚未实现。迁移行为时可参考工作区的 `pvz-remake` 仓库。

`StartupScreen` 自动播放 PopCap Logo 的 200 tick 淡入停留淡出，再进入标题／加载页：标题下落、草皮卷展开，在原版五个进度点播放新版 `ReanimPlayer` 小花／僵尸头动画和音效。计时使用全局时钟的 100Hz 游戏 tick。进度来自主菜单图片和动画的实际准备，预加载的主菜单保持隐藏，点击进入时复用并开始入场。资源全部就绪后，加载条内按按钮规则响应左右键，背景按下、触摸或任意键也可进入；返回标题页不重播 PopCap Logo。新增动画可用 `python tools/build_pvz_base.py --startup-only --raw-root <raw目录>` 单独生成，再重新打包内置 ZIP。

Release 在加载页准备全部资源和动画贴图，图鉴与种子包预览复用 `EntityDisplay` 的内容注册表；`ReanimRepository` 按注册表共享动画数据与贴图，失败后可重试。资源已在引擎缓存时直接读取，图鉴页面等待头像与详情的首帧就绪后再显示。动画节点仍随页面创建和销毁，不常驻整套图鉴。

音效和音乐统一使用 MP3，沿用现有 `copy_sounds.py`／`convert_music.py` 转换流程，兼容 Web、iOS、macOS、Windows 和 Android 的音频加载器。旧工作区可执行 `python3 tools/compress_audio.py` 将导入的 WAV 转为 MP3，保留 UUID、原声道和资源路径；PCM 原件备份到不参与打包的 `tools/raw/audio-pcm`。音乐使用 LAME VBR q2，音效使用 q4，采样率统一为 44.1kHz；动态鼓点各轨不裁剪静音、不单独归一化，循环与节拍数据保持不变。压缩减少下载和包体大小，解码后的 PCM 内存不会按同样比例减少。

关卡触摸种植沿用旧版 `pvz-remake`：轻点种子包保留选中，拖出后显示植物预览和行列辅助线，松手提交种植；拖回原种子包或落点无效则取消，也可直接点选另一张可用卡。`LevelInputPresenter` 捕获同一根手指的完整操作，暂停时清理；滑动收集按每 24px 采样，选卡高亮复用 `SeedPacketView` 的移动模式，仍调用现有后端指令。

页面不再显示临时黑色标题条。`MenuPages.heading` 声明原版标题的字体、基线和颜色，文案从 `lawnstrings` 读取；商店使用原版招牌。`ChallengeScreen` 绘制 Mini-games／Puzzle／Survival 的 20／20／11 个缩略图按钮和档案奖杯计数，复用 `UI.button` 的捕获、hover 与按下状态，点击尚未接通的模式显示未开放提示。`MenuPageControls` 提供花园切换／商店入口和成就返回按钮；领奖页使用原版按钮贴图，目前仍提供重玩 1-1。

`AlmanacScreen` 提供植物种子包、僵尸静态缩略图、条目选择、详情卡、费用、冷却说明和彩色位图介绍。`AlmanacEntityView` 播放 49 种植物和 26 种僵尸的详情动画，不创建战斗实体；部件组装通过 `EntityDisplay` 与种子包静态姿态复用。绘制偏移、缩放和阴影对应原版 `Plant::UpdateReanim`／`Zombie::GetDrawPos`；蹦极绳索使用原贴图随身体挂点移动，计时接全局时钟。资源用 `python tools/build_pvz_base.py --almanac-only --raw-root <raw目录>` 生成。`AlmanacText` 保留原文格式标签，在 `UI.scroll` 的内容容器中排版；通用的 `UIScroll` 和 `ScrollGesture` 复用上一版 `pvz-remake` TypeScript 的滚轮、滑块拖动和移动端触摸滚动，惯性使用全局时钟。`StoreScreen` 提供汽车、招牌入场、四页货架、悬停说明、金币和 0.5 秒车门翻页，动画使用全局时钟。`server/menu/StoreCatalog` 根据当前档案的进度和购买槽位计算开放条件、价格、库存和确认购买，金币沿用原版单位（存档的 1 金币显示为 $10）；API 确认时重新读取档案后扣款，在后端保存。戴夫动画暂不创建；购买道具在战斗内的具体效果由对应系统接入。

`AchievementScreen` 进入时通过 `getAchievements()` 一次读取 21 条定义和当前用户的存档解锁标记，`server/menu/AchievementCatalog` 保留上一版标记／图标的索引顺序。页面沿用两列坐标、70px 图集单元的 0.8 倍图标、绿色标题、位图换行说明，以及已解锁／未解锁图标的 255／32 透明度。复用 `UIScroll` 实现原滚轮每步 435px／0.35 秒、More／Top 每次 230px、触摸惯性和方向键每次 15px，滚动动画接全局时钟。地下平铺背景和返回按钮随内容移动；滚动不请求数据，页面也不授予成就。

主菜单由 `MainMenuScreen` 组合新版 `ReanimPlayer`，`MainMenuConfig` 保留原版按钮贴图、轨道偏移和多边形区域。入场按 `open → sign` 播放并停在末帧，另有独立云层、草和可点击的花。设置、用户、退出确认、商店、图鉴和成就保留调用页面，关闭后不重播主菜单入场；进入帮助、挑战、花园、标题或战斗会销毁原菜单，返回时创建新实例并重新入场。`MenuPages.retainPrevious` 显式声明保留调用页面的入口，商店从花园打开时也保留原花园。Options 等弹层使用同一个动态菜单背景并阻断下层输入。冒险入口根据当前档案切换开始／继续贴图和关卡数字，点击后播放 4.5 秒闪烁、僵尸手和音效，再进入已有 1-1。人物形象编辑入口目前显示未开放提示。

页面由 `MenuScreen.prepare()` 在后台准备，再通过 `ScreenTransition` 切换。主菜单与成就页沿用旧版 0.75 秒上下滑动和双 S 曲线，主菜单在滑动后继续保留于屏幕外。`PageFade` 跟随页面激活和销毁：普通领奖从白色渐显，帮助从黑色渐显，按原版 180 个 10ms 游戏 tick 递减 alpha（1 倍速为 1.8 秒）。渐变节点只绘图，不阻断鼠标、触摸或键盘；页面渐变开始后立即释放导航锁，可中途返回，帮助页的 Enter／Space／Escape 均返回主菜单。仅资源准备、页面提交和成就滑动期间阻止重复操作。其余页面和弹层直接切换，不额外添加通用淡入淡出；加载失败保留原页面和返回历史。

`core/GameClock.ts` 提供统一的 `gameClock`。转场、主菜单计时、Reanim、粒子和本地战斗入口共同应用其倍率；`startGameTween()` 复用 Cocos Tween 并同步运行期间的倍率变化，完成或所属节点销毁后取消订阅。只在帧时间入口缩放一次，服务端固定步长仍为 0.01 秒，显式 `advance()`／存档恢复使用传入的游戏时间。Debug 预览可调用 `pvzTime.setSpeed(2)` 设置 2 倍速，`setSpeed(1)` 恢复，`setSpeed(0)` 冻结游戏时间。Options 的战斗暂停独立于全局时钟，菜单和转场仍可正常操作；音频播放速率保持原样。

## 植物与僵尸

植物和僵尸的数值都在 `tools/content/pvz-base/gameplay/definitions.json`，与 PvZ-Portable 和上一版一致。植物最多带一种能力：`shooter`（射手）、`producer`（向日葵）、`fuse`（樱桃炸弹，100 tick 后 3x3 烧焦）、`mine`（土豆雷，1500 tick 出土、106 tick 升起，炸 1800 且不留尸体）、`chomper`（大嘴花，70 tick 咬合、吞下后消化 4000 tick），没有能力的植物只阻挡（坚果墙）；`deathExplosion` 让爆炸坚果被吃掉时爆炸。`server/plants/abilities.ts` 的 `pvz:plant-abilities` 系统按 `Plant.ability` 状态推进，客户端 `client/plants` 下的视图按该状态切换动画，并负责眨眼、裂纹和土豆雷红灯。

僵尸的 `helm` 先吸收伤害（路障 370、铁桶 1100），耗尽时发出 `zombieHelmDropped`；`gait` 引用共用步态表，提供走路地面轨迹、啃食与死亡帧数；`vault` 描述撑杆僵尸的奔跑、跳跃和落地。投射物的 `chillTicks` 让僵尸动画、行走和啃食减半，与原版 `ApplyAnimRate` 相同。樱桃炸弹和爆炸坚果的爆炸会把僵尸烧成 `pvz:zombie_charred`，无头僵尸则变黑停住 300 tick。新增战斗动画由 `python3 tools/build_pvz_base.py --plants-zombies-only --raw-root <raw目录>` 合并进现有转换输出，同步玩法数据并重新打包内置 ZIP。

## 服务端关卡结构

`server/level.ts` 负责通用关卡初始化和进度更新。`components.ts` 定义战斗实体、经济与关卡状态，`levelState.ts` 定义掉落物、波次与教程状态。天空阳光、掉落物、波次与奖励、僵尸呻吟分别由 `sun.ts`、`items.ts`、`waves.ts`、`zombieGroans.ts` 处理，所有关卡共用。波次和呻吟系统的 Mod ID 分别为 `pvz:waves`、`pvz:zombie-groans`，关卡进度系统为 `pvz:level-progress`。

战斗逻辑按职责组织：`plants/shooter.ts` 处理射击，`plants/production.ts` 处理植物产出，`plants/abilities.ts` 推进特殊能力，`plants/damage.ts` 处理植物被吃与死亡爆炸；`zombies/system.ts` 调度僵尸生命周期，`animation.ts` 计算地面轨迹与动画时间，`damage.ts` 处理受伤与死亡，`poleVault.ts` 实现撑杆跳，`flag.ts` 处理旗帜掉落，`spawn.ts` 共用出生规则。`projectiles.ts` 处理子弹，`explosions.ts` 处理范围爆炸，`collision.ts` 只提供几何计算。模块直接导入各自依赖，不保留统一转发入口；tick 阶段、系统 ID 和 Mod 调度仍由 `IntegratedGameServer` 管理；`GameplayRegistry` 只保留行为注册表和 JSON 组件存档。

`server/tutorials/index.ts` 按关卡定义的 `tutorial` ID 选择脚本，统一接收选种、取消、种植、冷却完成和收集阳光回调；`PlantingTutorial.ts` 与 `SunflowerTutorial.ts` 只保留对应的特殊引导。没有教程脚本的关卡直接使用通用流程。普通关卡通过 `tools/content/pvz-base/gameplay/levels.json` 配置行数、初始阳光、种子、波次和奖励，无需新增按关卡编号命名的服务端文件。新增特殊教程时只登记教程脚本，主服务器不增加关卡分支。

## 关卡展示结构

`client/level/LevelScene` 负责通用的开场 → 战斗 → 领奖／失败流程、全局时钟倍率、输入挂起和表现存档，只依赖 `LevelGame` 客户端接口。`LevelView` 组合 HUD、输入、实体、粒子、音频和结算 presenter；`LevelSeedBank` 按关卡配置创建种子包，分别处理费用、冷却、闪光和按钮输入。棋盘行列、可种行、种子费用和关卡编号均读取现有后端关卡定义。

`LevelPresentation` 按后端 tutorial ID 选择开场和教程提示配置。已验收的 1-1 铺草坪、预览僵尸和引导步骤位于 `level/adventure/Adventure11*`；通用流程不包含 1-1 时序。`level/boards/DayBoard` 保存白天背景、音乐和进屋门框参数；`tools/content/pvz-base/presentation/definitions.json` 集中维护植物和僵尸的动画、种子包图集位置、视图类型、阴影和掉落图片，打包生成内容包内的 `presentation/definitions.json`。类型和校验统一位于 `shared/content/presentation.ts`，与玩法定义 `shared/content/gameplay.ts` 对应。后续关卡新增后端内容，并添加或复用 presentation 配置；新场景补充对应 board 展示配置，无需复制关卡流程、输入、HUD 或存档控制器。目前仍只安装了 1-1 内容。

客户端存档统一写入 `level` 字段，读取时兼容原 `adventure11` 字段；开场专属的状态校验放在各自的实现中。共用关卡布局为 `assets/resources/ui/level.prefab`，资源 ID 为 `pvz:level`，保留原 Prefab 和脚本 UUID。`client/showcase` 仅保留独立资源预览探针。

## UI 组件

关卡右上角 Menu 使用原版 (681, 10) 的 117×46 石头按钮，入场完成后显示；手持植物时先取消，随后点击打开游戏内 Options，复用设置、确认重开和保存后返回主菜单的逻辑。空格打开独立的 `GAME PAUSED` 弹窗，保留 Escape 暂停快捷键；Resume／Enter／Space／Escape 返回同一局，长按空格不会反复开关。暂停时保存当前局，冻结服务端逻辑、关卡 Reanim／粒子／Tween 和音乐，不修改全局时钟；恢复时只启用原先开启的动画组件。暂停框保留原版标题下方间距，报纸僵尸动画暂不创建。

`client/ui/UI.ts` 统一创建 label、button、input、checkbox、select、slider、scroll、dialog。坐标相对父节点，x 向右、y 向下；文字复用 `FontRenderer`，默认使用原版位图字形与控件贴图。创建后修改控件值不触发 `onChange`，用户操作才触发回调。

```ts
const ui = await UI.load()
const label = ui.label(parent, { text: 'Music', x: 20, y: 30 })
const button = ui.button(parent, { text: 'OK', x: 20, y: 80, onClick: close })
const slider = ui.slider(parent, { x: 220, y: 30, value: 0.85, onChange: setVolume })
const checkbox = ui.checkbox(parent, { x: 220, y: 80, value: true, onChange: setChecked })
const select = ui.select(parent, { x: 20, y: 140, items: ['A', 'B'], value: 0, onChange: selectItem })
const input = ui.input(parent, { x: 20, y: 190, width: 300, maxLength: 12, onSubmit: saveName })
const confirmed = await ui.dialog(parent, { title: 'Continue?', cancelText: 'CANCEL' }).result
```

`ui.scroll(parent, { x, y, width, height, contentHeight, wheelStep?, bottomPadding?, scrollbar?, wheelDuration? })` 创建纵向 `UIScroll`。文字、图片等节点添加到 `scroll.content`，按 `scroll.contentWidth` 排版；`scroll.offset` 以像素读写滚动位置，内容变化后调用 `scroll.setContentHeight(height)`。组件负责裁剪、滚动条自动显隐、旧版滑块绘制和拖动、触摸惯性及监听清理，计时接全局时钟。图鉴传入 0.6 行的滚轮步长和底部留白。`scrollbar: false` 保留完整内容宽度；`wheelDuration` 开启原双 S 缓动，`scroll.scrollTo(offset, seconds)` 提供程序控制的平滑滚动。

label 通过 `text`／`color` 和 `setPosition(x, y)` 更新；button 提供 `setText()` 和 `interactable`；其余输入控件通过 `value` 读写。dialog 支持模态遮挡、拖动和顶层键盘处理：Enter／Space 确认、Escape 取消，关闭也可调用 `close()`。

`UI.label` 的 `font` 可传字体预设或已加载的 `BitmapFontAssets`，`node` 可绑定已有预制体文字节点，不重复添加渲染器；`pixelAlign` 将最终位置对齐整数像素。1-1 的阳光数、关卡文字、房屋名称和教程提示均复用 Label，字体仍从关卡内容注册表读取，保留 Mod 覆盖。种子包复用 `UIButton` 的按下、捕获和模态处理，输入挂起时禁用组件；冷却、选中、闪光、提示动画和关卡进度条保留专用绘制。

`UIInput` 提供 `value`、`interactable`、`focus()`、`blur()`、`selectAll()`，以及 `onChange`／`onSubmit`／`onCancel`；`filter` 过滤用户输入，`maxLength` 限制长度。Cocos `EditBox` 负责键盘、输入法和剪贴板，画面仍由原版位图字体、编辑框贴图、选区和光标绘制；Web 只在组件内部读取输入元素的选区。鼠标可定位和拖选、双击全选，输入框使用 I 型光标。聚焦时空格作为输入，不触发对话框确认；打开上层弹窗会释放焦点，校验提示关闭后恢复。

`screens/UserDialog.ts` 通过 `MenuApi` 完成用户选择、新建、重命名和删除，由后端校验并保存。列表最多显示 8 个用户，当前用户置顶；单击选择、双击或 OK 提交，取消不更换当前用户。命名规则沿用原版的最多 12 个英文字母／数字／空格，提交时折叠多余空格，并提示空名和不区分大小写的重名。删除必须确认，同时清理该用户的旧存档与主／临时存档；删除最后一个用户或首次启动时要求创建用户。主菜单保留原实例并刷新姓名、冒险入口和关卡数字。用户对话框复用 `dialog` 的原版加高底部、额外尺寸和顶部正文布局。

按钮支持 `onPress`（鼠标／触摸按下）与 `onClick`（在按钮内释放）；花园切换使用 `onPress`。配置 `tooltip: '提示文字'` 或 `tooltip: { text, font?, maxWidth?, gap?, offset? }` 即可显示上一版 Pico129 字体、浅黄底黑边的提示。`offset: [x, y]` 按 x 向右、y 向下微调，花园提示对齐上一版中心 x=599、顶部 y=52。提示跟随真实 hover，默认在按钮下方，底部空间不足时翻到上方，长文字换行并限制在所属视口／Canvas 内。也可用 `ui.tooltip(anchor, options)` 手动调用 `show()`／`hide()`；锚点禁用或销毁时自动隐藏和清理。

按钮通过 `skin` 选择原版样式，尺寸默认取原图（石头按钮默认 180×46）：

| skin | 样式 |
| --- | --- |
| `stone` | 默认石头按钮，横向平铺，悬停高亮字形 |
| `back` | Options 大返回按钮，360×100 |
| `seed` | 选卡大按钮，156×42，叠加发光和独立禁用贴图 |
| `seedSmall` | 选卡小按钮，111×26，悬停换图 |
| `almanacIndex` | 图鉴底部目录按钮，164×26，文字向右偏移 |
| `almanacClose` | 图鉴底部关闭按钮，89×26，文字向左偏移 |
| `image` | 自定义图片按钮，`text` 可省略；传入 `images` 时默认使用此样式 |

```ts
ui.button(parent, { skin: 'seed', text: 'Continue', x: 20, y: 80, onClick: next })
ui.button(parent, {
    x: 400, y: 100,
    images: { normal, hover, pressed, disabled }, // SpriteFrame，只有 normal 必填
    polygon: [[7, 1], [328, 30], [314, 125], [1, 78]],
    onClick: startAdventure,
})
```

图片通过现有 `SpriteLoader.load()` 加载。缺失状态图回退到普通图，按下优先回退到悬停图；缺少禁用图时自动半透明。`font`、`color`、`pressOffset: [x, y]` 可覆盖文字和按下偏移，`pressSound`／`clickSound` 传 `null` 关闭对应音效，`rightClickTriggers: false` 关闭右键触发，`rightClickPressesVisual: false` 保留右键触发但不显示按下效果（图鉴底部按钮默认如此）。

自定义图片按钮可用 `imageBox: { x, y, width, height }` 将贴图布局与命中区域分开，`hoverSound` 设置悬停音效。主菜单底部按钮用此接口保留原版较大的交互区域，图片保持原始大小。

`UIButton` 沿用旧版统一捕获：左右键按下后由原按钮持有操作，拖出／移回只更新该按钮，释放前其他按钮不获得 hover；在原按钮内释放才触发一次点击，区域外释放取消。桌面使用鼠标事件，移动模式使用触摸事件，避免 Cocos 模拟触摸重复触发。`releaseToNormalOnPressOut` 控制拖出画面：原版预设默认恢复普通状态，`image` 默认保留高亮并撤回按下偏移；两者拖出后 cursor 均为默认箭头。`rightClickPressesVisual: false` 仍触发右键操作，但不显示按下画面。

`onHoverEnter` 与画面状态独立，只在真正进入命中区域时触发，`hoverSound` 通过它播放。`UIHoverManager` 统一处理顶层命中、弹窗／页面作用域和 cursor；关闭弹窗会按最后鼠标位置恢复 hover，禁用、销毁或切页会取消捕获。`refreshHoverOnEnable` 默认开启，主菜单按钮按旧版关闭此自动刷新。工厂先完成贴图、回调和多边形配置，再启用节点，避免初始化中提前产生 hover。

帮助页的返回按钮使用 `seed`，图鉴的目录／关闭按钮使用对应专用样式；这些按钮及图鉴首页的查看植物／僵尸按钮已按旧版位置接入页面导航。

`polygon` 使用按钮左上角为原点、x 向右、y 向下的局部像素坐标，范围位于按钮的 `width`／`height` 内。至少三个顶点生效，否则使用矩形；包含边界，支持凹多边形，并跟随节点缩放和旋转。悬停、左右键、触摸与拖出释放共用该命中区域，区域外可穿透至下层控件。按下偏移仅作用于画面。

Options 保留旧版位置和操作：音量实时保存（音效上限为 0.65），全屏在关闭时提交，3D 加速固定开启，原生移动端固定全屏。游戏内重开和返回菜单需要确认；返回菜单会保存关卡。设置沿用 `pvz-remake:settings:options` 存储键。

## 资源

转换中间产物位于 `tools/generated/pvz-base` 和 `tools/generated/resources`，运行时只加载生成的 `assets/resources/base.zip`。基础包与外部资源包使用相同的 `pack.json` 和资源解码缓存；仅引导场景、布局 Prefab 和编译 shader 保留在 Cocos 资源中。

将自己游戏副本的 `main.pak` 放到 `tools/main.pak`，在项目根目录执行：

```sh
python3 tools/process_pak.py
```

现有管线会准备共用资源并生成基础 ZIP，需要 Python 3.10+、Pillow、ffmpeg 和音乐转换器使用的 libopenmpt 后端。`npm run build:content` 运行转换并打包；`npm run build:base-pack` 直接使用已有转换产物和当前配置源文件重新打包，不重复转换动画。

只调整主菜单动画时，可执行 `python tools/build_pvz_base.py --main-menu-only`，复用现有转换器更新 13 个菜单片段和引用贴图，保留其他转换输出，再重新打包内置 ZIP。

存档继续检查基础内容 ID、版本、哈希和玩法 Mod。ZIP 中的普通 JSON 条目 `pvz:content` 提供内容索引，哈希覆盖默认文件和资源映射；外部表现覆盖不会修改服务端玩法 JSON。

## 检查与构建

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

对改动涉及的关键逻辑优先复用已有测试。除非需要验证实际画面或交互，避免使用浏览器自动化。Windows 和 Android 构建命令仍然保留；Web 验证不代表已通过原生编译或真机检查。

Debug 构建保留 `pvzPhase4` 关卡调试入口；Mod 开发和安装见 [Mod 说明](MODS.md)。

### 植物与僵尸的客户端表现

- `client/plants`：`ShooterView`、`SunflowerView`、`CherryBombView`、`WallNutView`、`PotatoMineView`、`ChomperView` 分别处理专属表现；`AnimatedPlantView` 复用身体动画加载、混合、眨眼和存档逻辑。
- `PlantView` 统一创建后的同步、射击事件和存档接口，`PlantViewRegistry` 注册并创建内建及 Mod 视图，`LevelEntityRenderer` 管理实体生命周期、图层和事件分发。
- `client/zombies/ZombieView` 读取僵尸表现定义，处理快照驱动的播放、受伤部件、寒冰颜色、旗帜和碾压；数值、移动和技能状态仍由服务端控制。
- `ClientAnimationRegistry` 从上述 JSON 初始化，保留 Mod 动画覆盖、参数校验和冻结逻辑。新增表现应在对应定义和专属视图中维护，避免向通用关卡渲染器追加类型 ID 分支。

玩法配置和表现配置分别命名为 `GameplayDefinitions` 和 `PresentationDefinitions`，均按“加载 → 校验 → 返回对象 → 注入使用方”流转。`loadIntegratedGameContent` 返回 `definitions` 与 `presentation`；UI 通过 `UIAssets.presentation` 持有自己的表现定义。`ClientAnimationRegistry` 显式接收表现定义，视图与种子包通过构造参数或上下文使用配置，不设置全局配置单例。

`shared/content/DefinitionRegistry` 使用现有通用 `Registry` 登记基础内容与 Mod JSON，登记结束后统一校验引用并冻结。服务端入口注册玩法表、关卡和显式关卡补丁，客户端入口注册表现表与名称文本；新的植物 ID、动画目标和视图工厂都经过注册表进入实际运行流程。UI 与战斗读取同一组 Mod 表现定义。新增植物示例及 API 见 [Mod 文档](MODS.md#新增植物与内容注册)。

僵尸通过 `gait` 引用玩法定义中的 `zombieGaits`，`tongueChance` 和 `walk2Chance` 独立声明动画变体；不能从是否配置步态推断其他能力。植物能力的 `targeting` 声明范围、持杆目标过滤和交互修正键，僵尸的 `targetingInsets` 提供对应修正；撑杆落地后的攻击框使用 `vault.landedAttack`。客户端土豆雷的距离计算直接读取玩法攻击框和僵尸身体框。

表现定义中的 `projectiles`、僵尸 `helm`/`drops` 声明图片、轨道、特效、偏移和音效；音效的 `pitchRange` 是音高随机范围。`seedPackets` 保存图集格子和布局，`almanac` 保存绳索和浮动动画参数。新增同类内容应补定义，通用渲染器不按具体 ID 或数字编号分支。工厂按视图类型分派、专属技能状态机和单位换算常量仍保留在代码中。

普通与传送带种子包共用 `LevelSeedBank` 的视图、按钮、tooltip，以及 `LevelInputPresenter` 的鼠标、触摸和快捷键流程。选卡以当前槽位索引读取状态：普通卡发送 `selectSeed`，传送带卡发送 `selectConveyorPacket`，后者保留每张卡的独立 ID。`LevelBoardHud` 负责可选工具、戴夫和传送带布局，不另做种子包命中检测。

种子包快照的 `availability` 由服务端 `seedAvailability` 计算，携带拒绝原因与 `warningKey`，普通卡与传送带选卡命令会调用同一方法重新验证。客户端直接读取结果显示置灰、tooltip、cursor 和选卡音效；Mod 扩展这一个计算方法即可，额外拒绝提示通过 `rejectSeed` 发出，状态查询不产生音效或 advice。Corn 不再挂钩客户端选卡和置灰逻辑。

铲子也使用 `UIButton` 和同一触摸流程：按下拿起，拖动瞄准，松手执行，拖回来源按钮取消。教程阶段允许此流程；暂停会结束手势。服务端 `SeedBankState.selection` 只有未选择、普通卡、传送带卡、工具四种互斥状态；传送带只保存卡片 ID，通过 `server/seedBank.selectedSeedId` 查询其种子。存档使用同一结构，旧并列字段格式直接判为不兼容。

关卡玩法配置中，`tools` 声明可用工具；`conveyor` 声明容量、间距、移动周期、供卡权重和分档生成间隔；`bowling` 只声明种植线；`shovelTutorial` 声明初始植物与首次、重玩、铲除后的对话序列。教程的 `blocksIntro` 阻止入场结束，`blocksStart` 阻止出怪，二者独立。表现配置 `conveyor`、`shovel`、`dave` 保存布局、动画资源、速率和对话表现参数。

玩法 `boards.*.bounds` 决定场地水平边界，僵尸 `dropsFlag` 决定掉旗能力；表现 `boards` 保存背景、音乐和失败场景坐标。粒子的可选剩余时长随快照保存，种子闪光读取 `seedPackets.flash`，恢复不再按特效 ID 分支。商店数据位于 `tools/content/pvz-base/gameplay/store.json`，价格档位、购买条件、库存规则和购买结果均由服务端目录实例执行；应用只负责加载 JSON 并注入后端。

Mod 入口统一为 `register({ host, assets })`，通过 `host.get()` 访问真实宿主模块与注册表，`host.around()`／`host.replace()` 包装实际方法。不再提供系统、页面、动画的专用增强接口。额外 ECS 组件经 `GameplayRegistry.components` 登记后参与世界快照和存档。示例见 [玉米投手 Mod](../mods/corn/README.md) 和 [Mod 文档](MODS.md)。
