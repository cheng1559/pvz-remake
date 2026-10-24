# PvZ Remake — 客户端／服务端重构版

当前 worktree 仅保留新架构，主场景从启动页进入主菜单，以简易按钮连接挑战分类、图鉴、商店、花园、成就、帮助／设置及新版冒险 1-1。旧战斗循环和后续关卡实现已移除；工作区中的 `../pvz-remake` 保留完整旧版，供开发时参考。

## 运行

```sh
npm install
npm run preview:debug
```

使用本机 Cocos CLI 和 Cocos 4.0.0-alpha.35。通过主菜单进入冒险 1-1；Escape 打开／关闭暂停菜单，其他页面按 Escape 返回。胜利或失败后按 R 重新开始。进入冒险时自动读取当前玩家的 存档，游戏隐藏时保存。

## 目录

- `assets/scripts/app`：场景入口、客户端／服务端组装和存档协调。
- `assets/scripts/server`：权威战斗逻辑、固定步长、确定性随机和服务端存档。
- `assets/scripts/shared`、`ecs`：通信协议、资源格式、通道和 ECS。
- `assets/scripts/client`：输入、渲染、音频、资源加载和 1-1 展示逻辑。
- `assets/scripts/core`：新版展示层仍在使用的粒子、精灵工具。
- `tools/content/pvz-base`：手动维护的玩法和表现 JSON。
- `tools/generated`：转换后的图片、动画和其他打包输入。
- `assets/resources/base.zip`：生成的内置基础包，与外部资源包使用相同的 `pack.json` 格式。
- `tools`：共用资源转换和 Mod 工具。

基础内容和外部资源包共用 ZIP 解码、缓存和资源 ID，仅引导场景、关卡布局 Prefab 和编译 shader 保留为 Cocos 资源。修改配置后执行 `npm run build:base-pack`；完整转换命令 `npm run build:content` 也会生成 ZIP。资源准备、检查和构建见[开发说明](docs/DEVELOPMENT.zh-CN.md)。源码采用 [MIT](LICENSE) 许可证，原版游戏资源的权利归各自所有者。
