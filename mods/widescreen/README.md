# 宽屏 Mod

同一个 ZIP 分成两部分：

1. **全屏视口与交互**：入口调用 `host.get('client/view/ClientViewport').expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })`，应用到全部页面、弹窗和关卡。逻辑高度保持 600，宽度限制在 800～2133⅓，原有内容居中及等比缩放。4:3～32:9 内自适应；更窄时按宽度等比缩小，上下补黑边，超过 32:9 时保持完整高度，左右补黑边。页面遮罩、输入区域、弹窗拖动边界和转场覆盖层使用实际可见内容范围，黑边不参与交互；切换页面不恢复固定比例。草坪网格及局部滚动列表保留自己的尺寸。
2. **界面动画与资源**：`src/client/menu.ts` 替换主界面入场和待机的左右/中央背景，`animations.ts` 延长云的轨迹。最左侧花保留原动画；右侧两朵沿原来的速度和旋转多飞 180px，再边飞边淡出。保留原轨道节点及其上的按钮和用户名；天空留在主界面层级内，跟随页面显隐和成就转场。`startup.ts` 替换加载背景，保留 Logo、进度条动画及点击开始区域；`garden.ts` 替换四个花园页面的背景，保留居中的操作按钮。

原生窗口约束在 UI 和 Mod 初始化完成后确定：宽屏 Mod 已拓展视口时保留它的约束，否则锁定原始 4:3。重启清理只还原逻辑视口和移除监听，不修改原生窗口尺寸，避免每次重启先缩回 4:3。此行为需要更新游戏本体代码。

背景来自本机 PvZ Ultimate 2.4.3 解包还原；资源来源及还原方法见[资源记录](../../art/reference/pvz-ultimate/README.md)。八张 PNG 随 ZIP 安装；主界面天空继续使用当前资源（支持材质包替换）。左侧贴图通过锚点还原裁剪前的原点，避免移动依附轨道的按钮。云根据当前视口和图片尺寸向两端延长，新增段保持端点移动速度，旋转从端点速度逐渐减缓，额外偏转不超过 8°；原动画区间保持不变。调整窗口和横竖屏切换时重新计算。

左右背景复用项目的 Real-ESRGAN `realesr-general-x4v3` 超分流程，输出高度分别对齐 HD 包：左图 1173×1360，右图 3060×1120；透明通道使用现有黑白背景合成还原。显示尺寸仍为 928×1076、1530×560，通过 `Sprite.SizeMode.CUSTOM` 保持原来的坐标、覆盖范围与锚点。中央背景保持原图。

加载背景取自 `LoaderBar_600` 组的 `IMAGES\600\LOADERBAR\NOATLAS\TITLESCREEN.PTX`，原图为 1680×720（21:9），同模型超分到 2800×1200，高度与英文 HD 的 `titlescreen` 一致。通过 Cocos 已注册的 `StartupScreen` 类包装 `render`，在首次绘制前替换背景，覆盖已经开始的异步加载；无需新增宿主接口或重建原生客户端。背景逻辑高度固定为 600，保持原图比例并居中；较窄视口裁左右，超过素材宽度时两侧留黑，不拉伸图片。图片尺寸和位置不随窗口变化，无需尺寸监听。

花园同样使用 `realesr-general-x4v3` 处理，输出高度对齐英文 HD 的 1200 像素：温室 `2216×1228 → 2165×1200`，蘑菇园、水族馆 `2200×1228 → 2150×1200`，智慧树渐变底图 `800×600 → 1600×1200`。前三张来自对应花园资源组的独立 PTX；智慧树底图按清单从 `DelayLoad_ZenGarden_600` 图集的 `(1,477,800,600)` 裁出，原图没有额外两侧内容。通过 Cocos 已注册的 `MenuScreen.prepare` 在页面显示前替换背景，加载页和花园统一复用 `background.ts`，逻辑高度固定为 600，保持比例，超宽时两侧留黑，不拉伸或裁上下，不改按钮和页面生命周期。

```sh
npm run mod:pack -- mods/widescreen
```

源码放在 `src/client/`，图片放在 `assets/images/`，沿用统一的 [Mod 项目结构](../README.md)。打包时将源码编译为 `dist/mods/widescreen/client/` 中的 JS，原样复制 `assets/`，再生成 `dist/mods/widescreen.zip`；不向 Mod 源码目录写入 JS。游戏执行 `/mod install` 选择 ZIP，更新安装后确认重启；修改工作区文件不会更新已安装的 ZIP。此版本需要包含全屏视口及 Reanim 替换接口的游戏代码。

`/mod list` 查看启用列表；`/mod unload local:widescreen` 停用，`/mod load local:widescreen` 启用，`/mod uninstall local:widescreen` 卸载。状态变化确认重启生效。Web、Native 和 CLI 预览使用同一种安装方式；未启用时沿用原版比例。

入口统一使用 `register({ host, assets })`。视口直接访问真实模块；`host.around(MainMenuScreen.prototype, 'initialize', ...)` 在原初始化完成后替换贴图和延长轨迹，直接读取页面的 `node`、`background`。图片通过 `assets.sprite(path)` 读取，节点销毁事件清理监听并恢复动画。没有宽屏专用宿主接口。

`ReanimPlayer.getAnimation()` 返回动画副本，`replaceAnimation(data)` 替换相同 ID、轨道及已加载贴图的动画，保留节点和播放状态。Mod 无需 Cocos 编辑器或 Asset Bundle。0.3.4 的加载和花园背景在超宽时保持比例、两侧留黑；更新安装 ZIP 并重启即可生效。
