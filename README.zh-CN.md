# PvZ Remake — 客户端／服务端重构版

当前 worktree 仅保留新架构，主场景直接启动冒险 1-1。旧战斗循环、主菜单和后续关卡实现已移除；工作区中的 `../pvz-remake` 保留完整旧版，供开发时参考。

## 运行

```sh
npm install
npm run preview:debug
```

使用本机 Cocos CLI 和 Cocos 4.0.0-alpha.35。Escape 暂停／继续，胜利或失败后按 R 重新开始。启动时自动读取当前玩家的 v2 存档，游戏隐藏时保存。

## 目录

- `assets/scripts/app`：场景入口、客户端／服务端组装和存档协调。
- `assets/scripts/server`：权威战斗逻辑、固定步长、确定性随机和服务端存档。
- `assets/scripts/shared`、`ecs`：通信协议、资源格式、通道和 ECS。
- `assets/scripts/client`：输入、渲染、音频、资源加载和 1-1 展示逻辑。
- `assets/scripts/core`：新版展示层仍在使用的粒子、精灵工具。
- `assets/bundles/pvz-base`：Content v2 资源和 1-1 预制体。
- `tools`：共用资源转换和 Mod 工具。

新版仍复用部分基于 resources 的音频和粒子工具，不再回退到旧战斗流程。资源准备、检查和构建见[开发说明](docs/DEVELOPMENT.zh-CN.md)。源码采用 [MIT](LICENSE) 许可证，原版游戏资源的权利归各自所有者。
