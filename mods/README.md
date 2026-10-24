# Mod 项目结构

每个子目录是一份独立的 Mod 项目，源码与运行资源分开放置：

```text
my-mod/
├── mod.json                 # ID、版本、依赖和打包后的模块入口
├── README.md
├── src/
│   ├── client/              # 客户端展示，入口 index.ts
│   └── server/              # 服务端玩法，入口 index.ts
└── assets/
    ├── images/              # 图片
    └── bundles/             # 可选的 Cocos Asset Bundle
```

只创建需要的模块和资源目录。宽屏 Mod 只有 `src/client/` 和 `assets/images/`。

`mod.json` 声明的是打包后的 JS 入口：客户端使用 `client/index.js`，`gameplay` 字段声明服务端模块，分别输出 `gameplay/node/index.js` 和 `gameplay/cocos/index.js`，与源码目录名独立。`assets/` 原样复制进 ZIP，例如客户端通过 `assets.sprite('assets/images/left.png')` 加载图片。

```sh
npm run mod:pack -- mods/widescreen
npm run mod:test -- dist/mods/widescreen
```

仅打包时编译。生成的 JS、资源和清单放在 `dist/mods/<目录名>/`，ZIP 位于旁边的 `<目录名>.zip`；源码目录不存编译产物。`mod:test` 直接验证打包目录。游戏使用 `/mod install` 安装 ZIP，详见[安装与管理](../docs/MODS.md)。

入口统一为 `register({ host, assets })`。配置经 `host.get('content/definitions')` 注册；玩法和视图直接使用宿主注册表，修改既有方法使用 `host.around()`。不再提供各类专用 Mod API。

- [corn](corn/README.md)：独立玉米投手与双格升级的玉米加农炮，自带资源、瞄准和炮弹机制。
- [example-plant](example-plant/README.md)：复用原版资源的植物、僵尸和回血行为。
- [widescreen](widescreen/README.md)：视口与主界面资源、动画扩展。
