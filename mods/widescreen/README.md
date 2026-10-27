# 宽屏 Mod

同一个 ZIP 分成两部分：

1. **全屏视口与交互**：入口调用 `host.get('client/view/ClientViewport').expandViewport({ minAspect: 4 / 3, maxAspect: 21 / 9 })`，应用到全部页面、弹窗和关卡。逻辑高度保持 600，宽度限制在 800～1400，原有内容居中及等比缩放。4:3～21:9 内自适应；更窄时按宽度等比缩小，上下补黑边，超过 21:9 时保持完整高度，左右补黑边。页面遮罩、输入区域、弹窗拖动边界和转场覆盖层使用实际可见内容范围，黑边不参与交互；切换页面不恢复固定比例。草坪网格及局部滚动列表保留自己的尺寸。
2. **界面动画与资源**：`src/client/menu.ts` 替换主界面入场和待机的左右/中央背景，`animations.ts` 延长云的轨迹。最左侧花保留原动画；右侧两朵沿原来的速度和旋转多飞 180px，再边飞边淡出。保留原轨道节点及其上的按钮和用户名；天空留在主界面层级内，跟随页面显隐和成就转场。`startup.ts` 替换加载背景，保留 Logo、进度条动画及点击开始区域；`pages.ts` 替换四个花园、商店、图鉴三页及小游戏／解谜／生存的背景，保留居中的操作按钮。

原生窗口约束在 UI 和 Mod 初始化完成后确定：宽屏 Mod 已拓展视口时保留它的约束，否则锁定原始 4:3。重启清理只还原逻辑视口和移除监听，不修改原生窗口尺寸，避免每次重启先缩回 4:3。此行为需要更新游戏本体代码。

主界面、加载页与动态草丛保留 Ultimate 素材；白天草坪及商店背景使用 PvZ-TV-115 素材，四种花园背景和商店车辆与 `widescreen-pvz` 使用相同的 PvZ 宽屏版高清素材，来源见 `conversion.json`。未在本轮替换的资源沿用原有处理方式。

左右背景复用项目的 Real-ESRGAN `realesr-general-x4v3` 超分流程，输出高度分别对齐 HD 包：左图 1173×1360，右图 3060×1120；透明通道使用现有黑白背景合成还原。显示尺寸仍为 928×1076、1530×560，通过 `Sprite.SizeMode.CUSTOM` 保持原来的坐标、覆盖范围与锚点。中央背景保持原图。

加载背景取自 `LoaderBar_600` 组的 `IMAGES\600\LOADERBAR\NOATLAS\TITLESCREEN.PTX`，原图为 1680×720（21:9），同模型超分到 2800×1200，高度与英文 HD 的 `titlescreen` 一致。通过 Cocos 已注册的 `StartupScreen` 类包装 `render`，在首次绘制前替换背景，覆盖已经开始的异步加载；无需新增宿主接口或重建原生客户端。背景逻辑高度固定为 600，保持原图比例并居中；较窄视口裁左右，超过素材宽度时两侧留黑，不拉伸图片。图片尺寸和位置不随窗口变化，无需尺寸监听。

温室、蘑菇园、水族馆及智慧树背景改用 `widescreen-pvz` 同款，四张 PNG 字节、逻辑尺寸 1066×600、2× 密度及透明度声明保持一致，按 600 高居中显示。较窄视口裁掉左右部分，超过图片宽度时露出页面底色，不再放大到 21:9。来源与哈希位于 `conversion.json.gardenBackgrounds`，显示逻辑位于 `pages.ts`。

智慧树的树体、树根、草地、叶片和云层也使用 `widescreen-pvz` 同款十四张 2× 图片，保留相同的逻辑尺寸、透明度及动画限定声明。沿用本体 `pvz:tree_grow50` 和 `pvz:tree_cloud1`～`tree_cloud6` 的分层与播放方式，共用云图的替换仅在智慧树动画内生效。来源与最终图片哈希位于 `conversion.json.tree`。

图鉴首页、植物页、僵尸页及 Challenge 背景使用工作区 PvZ 宽屏版的原始 1066×600 PNG，按原尺寸居中显示，不放大到 21:9。Challenge 背景同时用于小游戏、解谜和生存页面，三页共享一张已加载的贴图。标题、角色预览、卡片、文字和按钮沿用本体布局；更宽视口露出两侧页面底色。来源与哈希位于 `conversion.json.menuBackgrounds`。

```sh
# 导入 PvZ 宽屏版图鉴三张背景和 Challenge 背景（需要 Pillow）
python mods/widescreen/import_menu_backgrounds.py /Users/cheng/Downloads/pvz
```

商店背景使用 TV115 的 `Store_Background.jpg`（1280×720），原像素导出为 PNG，恢复为原始 1280×720 居中显示，不再放大到 21:9。商店车辆使用 `widescreen-pvz` 同款；车辆、按钮和种植交互坐标保持不变。

`store.ts` 与 `widescreen-pvz` 使用相同实现，复制其完整开门／关门车身（逻辑 788×495，2× 贴图）和抬起的后盖（逻辑 406×173，2× 贴图），PNG 字节、逻辑尺寸、密度和透明度设置完全一致。车辆原点 `(196,138)`、商品、按钮、页码与翻页抖动使用本体原有流程，移除 TV 独立关门图层和布局包装。来源与哈希位于 `conversion.json.storeCar`；重新导入背景时也会从相邻 `widescreen-pvz` 源码目录复制同款车辆。

`battle.ts` 使用 PvZ-TV-115 的白天完整／未铺草坪背景（1880×720）、单行草坪（771×127）、三行草坪（771×355）及配套进屋遮挡图。背景在原版 1400×600 场景四周增加左右各 240px、上下各 60px，按原始像素显示并抵消留白；草坪、种植网格及铺草动画沿用本体坐标。完整草坪采样起点由 232 调整为 472，单行／三行草坪不再使用 Ultimate 的 1.6 倍密度与偏移。铺草仍使用原矩形滚动遮罩，完成后切换整张背景。TV PNG 保持源文件字节，JPG 无损导出为 PNG；七张 TV 背景声明普通透明度，详情和输入／输出哈希保存在 `conversion.json.tv115`。镜头继续按背景边缘限制起止点，保留缓动和战斗原点；进屋门口贴图使用本体原始坐标。

```sh
npm run mod:pack -- mods/widescreen
```

源码放在 `src/client/`，图片放在 `assets/images/`，沿用统一的 [Mod 项目结构](../README.md)。打包时将源码编译为 `dist/mods/widescreen/client/` 中的 JS，原样复制 `assets/`，再生成 `dist/mods/widescreen.zip`；不向 Mod 源码目录写入 JS。游戏执行 `/mod` 打开管理窗口，点 Import 选择 ZIP，Apply 后确认重启；修改工作区文件不会更新已安装的 ZIP。此版本需要包含全屏视口及 Reanim 替换接口的游戏代码。

在 `/mod` 窗口中查看列表、勾选启用／停用或卸载，Apply 后确认重启生效。Web、Native 和 CLI 预览使用同一种安装方式；未启用时沿用原版比例。

入口统一使用 `register({ host, assets })`。视口直接访问真实模块；`host.around(MainMenuScreen.prototype, 'initialize', ...)` 在原初始化完成后替换贴图和延长轨迹，直接读取页面的 `node`、`background`。图片通过 `assets.sprite(path)` 读取，节点销毁事件清理监听并恢复动画。没有宽屏专用宿主接口。

`dave.ts` 在戴夫每次入场或出场前，按当前视口左侧增加的宽度调整横向速度：入场从新左边缘外移动到原待机位置，出场从原待机位置移动到新左边缘外。新增距离按下身轨道 `Dave_innerpants` 的原始位移进度分配，沿用原动作的整体移动曲线；入场下身停住后不再追加位移，保留上身和头部回摆的原始幅度。所有轨道采用相同的横向偏移，不改变肢体形状、关键帧数量、时间或动画总时长，保留原末帧停留时间。4:3 下不修改动画。每次播放都从原始动画重新计算，重复对话不会累积偏移，也能适配两次播放之间的窗口调整。

`ReanimPlayer.getAnimation()` 返回动画副本，`replaceAnimation(data)` 替换相同 ID、轨道及已加载贴图的动画，保留节点和播放状态。Mod 无需 Cocos 编辑器或 Asset Bundle。0.3.18 撤回 1-4 只铺上下两行及调整已有草坪层级的改动，恢复原矩形滚动遮罩。保留本体统一透明边缘处理、主界面及车辆贴图声明、门框坐标和镜头边界修复。此版本需要同步更新游戏本体，重新安装 ZIP 并重启。


白天战场右侧草丛复用 Ultimate 的 `BUSHES3/4/5.REANIM` 原始 `anim_rustle` 轨道，通过本体 `ReanimPlayer` 播放叶片位移、旋转、缩放、透明度和飘落。每段保留全部 42 帧与原始 12fps 时间轴，按 Ultimate 的 `PlayReanim` 速率 10 播放，播放一次后停在末帧，未触发时停在初始姿态。五行的位置、变体选择和层级来自随应用附带的 `Board.InitCoverLayer`、`GameConstants.gCoverInfos`；坐标换算到本体原网格，沿用 `LevelEntityRenderer.collectLayerEntries` 的统一排序，绘制序为 `row*10+6`。原静态合成图和正弦平移逻辑已移除。

触发参考 Ultimate 的 `Board.AddZombieInRow`：收到 `zombieSpawned` 时重播对应行草丛，排除蹦极僵尸。同一行再次生成僵尸会从头重播；使用游戏时间，暂停时也暂停，读档不补播生成事件。草丛随场地镜头平移，不改变种植区域，PvZ 素材版也保留原有草丛，两套 Mod 各自独立提供资源与动画。原资源及随包托管代码的证据范围见 [资源记录](../../art/reference/pvz-ultimate/README.md) 和 `ultimate-bushes-conversion.json`。

铺草时的卷草动画和沙土粒子排在草坪遮罩之上、草丛所在的实体层之下，草卷到右侧时从草丛后面经过。首次创建的所有草卷与后续生成、恢复的铺草粒子都应用相同顺序；草丛与战斗实体仍按行排序。

草丛的十二张 PNG 保留迁移前的 2× 超分结果、逻辑尺寸及预乘透明度声明；三段动画及资源 ID 使用 `local:widescreen/` 命名空间。原导入记录和超分记录分别保存在 `ultimate-bushes-conversion.json`、`upscale-bushes.json`，随包的 `conversion.json` 汇总两者。

```sh
# 重新导入草丛并执行现有 2× 超分流程
python mods/widescreen/import_ultimate_bushes.py '/Applications/PvZ Ultimate.app' --upscale
```

0.3.19 为本 Mod 增加五行动态草丛、僵尸生成触发和铺草层级处理，需重新打包安装并重启。


0.3.20 将白天草坪、进屋遮挡及花园背景替换为本机 PvZ-TV-115 素材，保留现有五行草丛动画。

```sh
# 重新导入 TV115 草坪／商店背景，并同步 widescreen-pvz 花园背景／智慧树／车辆（需要 Pillow）
python mods/widescreen/import_tv_backgrounds.py /Users/cheng/Downloads/PvZ-TV-115
```


0.3.21 将商店背景、整车及开关门后盖替换为 TV115 原始素材，并按 TV 分层和翻页逻辑绘制；重新打包安装并重启后生效。


0.3.22 将车辆改为 `widescreen-pvz` 同款，并按原版背景校准禅境花园中央区域的尺寸和位置。


0.3.23 将最大视口比例限制为 21:9（逻辑宽度上限 1400），超过此比例时左右留黑边。

0.3.24 将商店和四种花园背景统一改为等比填满 21:9 宽度，上下居中裁剪，替代此前的原版中央区域匹配与水族馆补底。

0.3.25 将四种花园背景改为 `widescreen-pvz` 同款 1066×600，商店背景恢复为 TV 原始 1280×720 居中显示。

0.3.26 同步 `widescreen-pvz` 的十四张智慧树与云层素材，保留原动画及资源作用范围。

0.3.27 接入 PvZ 宽屏版图鉴三页及小游戏／解谜／生存的 Challenge 背景，保留原页面内容布局。
