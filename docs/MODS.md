# Mod 安装与管理

Mod 统一通过游戏内 `/mod` 命令管理：

```text
/mod
/mod install
/mod list
/mod load local:widescreen
/mod unload local:widescreen
/mod unload all
/mod uninstall local:widescreen
```

`/mod` 不带参数时打开 Mod 管理窗口，与[资源包管理窗口](RESOURCE_PACKS.md#管理窗口)的操作相同：列出全部已安装 Mod 及版本，支持导入、每行卸载、勾选启用和 Apply 后确认重启。Mod 的加载顺序由依赖关系和 ID 决定，因此没有优先级按钮；Apply 时会检查依赖，不满足时提示原因并保留草稿。

`/mod install` 不接受路径参数，打开与 `/pack install` 相同的 ZIP 文件选择器。安装时只显示标题 `Installing...`；安装完成后提示重启，确认后立即重启整个游戏，运行中的关卡先保存。安装会启用 Mod，同 ID 安装会更新它。重新启用或停用同一个状态不会提示重启；卸载停用的 Mod 不需要重启。`/mod list` 显示当前保存的启用列表，变更在重启后执行。

加载页也可以按 `/` 打开 CLI；Mod 导致启动失败时，可用 `/mod install` 更新 ZIP，或用 `/mod unload <id>` 停用后重启。更新工作区中的 ZIP 不会自动替换已经安装的副本。启动日志会显示实际加载的 Mod ID 和版本。

ZIP 内必须恰好有一份 `mod.json`，可以位于根目录或外包一层文件夹，并包含清单声明的 Cocos SystemJS 模块与可选 Asset Bundle。安装前检查文件、依赖版本和依赖环；不能停用或卸载其他启用 Mod 仍然依赖的 Mod。`/mod unload all` 可以一起停用。

Web 与 CLI 预览使用当前站点的 IndexedDB；Native 使用应用可写目录的 `mods/`，由安装器管理，无需手动复制目录。启动时清除安装文件已不存在的启用记录；已安装 Mod 的内容损坏或依赖不满足仍会报错。删除原 ZIP 不影响安装结果。旧目录扫描与 `mods.json` 配置入口已移除。

运行时从已安装 ZIP 的快照加载模块和资源。停用、更新或卸载后，当前执行的代码及资源保持到重启；Native 的 `mod-runtime/` 是运行中客户端资源的临时快照，下次启动时清理。模块可以使用相对 JS 依赖，无需额外 HTTP 服务。纯代码 Mod 可以省略 `client.bundle`；客户端也可通过 `await api.loadSprite('assets/images/example.png')` 直接加载 ZIP 中的 PNG，路径相对于 `mod.json`，返回 `SpriteFrame`。

开发目录统一使用 `src/client/`、`src/server/` 和 `assets/`，见 [Mod 项目结构](../mods/README.md)。制作示例：[主界面宽屏](../mods/widescreen/README.md)。直接执行 `npm run mod:pack -- mods/widescreen`，工具会在 `dist/mods/widescreen/` 编译代码、复制资源，再生成 `dist/mods/widescreen.zip`。只在打包时编译，不向源码目录写入 JS；ZIP 不包含开发源码。`mod:test` 接收已打包的目录，如 `npm run mod:test -- dist/mods/widescreen`，不会重新编译。

客户端 Mod 可调用 `api.expandViewport({ minAspect, maxAspect })` 启用全局视口并指定比例范围，原有内容居中；低于最小比例时居中裁剪左右，超过最大比例时保持完整高度、左右补黑边。全部页面和关卡的全屏输入/遮罩区域使用实际可见内容范围，排除黑边。宽屏示例的范围是 4:3～32:9；原生桌面窗口也使用该范围，关闭 Mod 后恢复 4:3。`api.enhanceScreen(targetId, context => dispose)` 负责单个页面的资源与动画扩展；页面销毁时调用返回的清理函数。两者相互独立，关闭页面不会撤销全局视口。宽屏示例把主界面贴图替换、云轨迹延长和花的淡出放在 Mod 中，宿主没有该示例专用的显示逻辑。
