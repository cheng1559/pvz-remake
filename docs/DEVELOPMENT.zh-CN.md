# 开发说明

主场景挂载 `app/GameApp.ts`，通过已有的 1-1 控制器启动 `LocalIntegratedGame`。战斗逻辑在 `server` 中运行，客户端处理协议快照和事件。`server`、`shared`、`ecs` 不应引入引擎依赖。

当前仅接通冒险 1-1。旧主菜单、Debug CLI 和后续关卡不再属于本 worktree；迁移行为时可参考工作区的 `pvz-remake` 仓库。

## 资源

新版资源 Bundle 位于 `assets/bundles/pvz-base`。展示层还复用 `assets/resources` 中的音频、粒子定义和粒子图片，运行时需要保留这些资源。

将自己游戏副本的 `main.pak` 放到 `tools/main.pak`，在项目根目录执行：

```sh
python3 tools/process_pak.py
```

现有管线会准备共用资源并构建 v2 Bundle，需要 Python 3.10+、Pillow、ffmpeg 和音乐转换器使用的 libopenmpt 后端。若原始文件和共用资源已经准备好，仅重建 v2 Bundle 可执行 `npm run build:content-v2`。

## 检查与构建

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

对改动涉及的关键逻辑优先复用已有测试。除非需要验证实际画面或交互，避免使用浏览器自动化。Windows 和 Android 构建命令仍然保留；Web 验证不代表已通过原生编译或真机检查。

Debug 构建保留 `pvzPhase0`、`pvzPhase2`、`pvzPhase4` 调试入口；Mod 示例见 [Phase 0 说明](../spikes/phase0/README.md)。
