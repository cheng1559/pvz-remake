# Mod 与内容包

所有扩展统一是 Mod，纯资源包无需代码入口。安装、依赖、优先级、启用状态和卸载均由同一个管理器处理。

## 安装与管理

```text
/mod
/mod install
/mod list
/mod load local:hd
/mod unload local:hd
/mod unload all
/mod uninstall local:hd
```

`/mod install` 打开 ZIP 选择器，可一次选择多个包。`/mod` 打开管理窗口：勾选启用，箭头调整资源优先级，越靠上优先级越高。依赖先加载；同 ID 资源由后加载的 Mod 覆盖，游戏定义的重复 ID 会报错。

启用、完整列表排序（包括未启用项）和卸载在 Apply 后保存；Cancel/ESC 提示未应用的更改将被丢弃。仅移动未启用项无需重启；启用状态或已启用项优先级改变时，重启后生效。安装文件立即保存，更新已有 Mod 保留原位置；运行中的代码、音频和图片继续使用原归档快照。安装失败不会覆盖原文件。

只有 ZIP 安装方式。Web 使用 IndexedDB；Native 使用应用可写目录的 `mods/`。损坏或缺少依赖的归档会停用并在窗口显示错误，不阻止打开管理窗口。

## 文件定义

源码和 ZIP 都使用根目录 `manifest.json`、`content.json`：

```json
{
  "schemaVersion": 1,
  "id": "example:plants",
  "version": "1.0.0",
  "apiVersion": 1,
  "contentHash": "generated-on-pack",
  "dependencies": []
}
```

纯资源 Mod 只需以上信息。需要脚本时，在清单添加 `gameplay`（`nodeModule`、`cocosModule`）或 `client`（`module`，可选 `bundle`）。源码入口为 `src/server/index.ts`、`src/client/index.ts`，编译产物路径由清单指定。

`content.json` 统一索引游戏定义、表现定义和资源：

```json
{
  "gameplay": {
    "plants": "assets/gameplay/plants.json",
    "seeds": "assets/gameplay/seeds.json",
    "seedCatalog": "assets/gameplay/seed-catalog.json"
  },
  "presentation": {
    "plants": "assets/presentation/plants.json"
  },
  "resources": {
    "sprites": {
      "example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80 }
    },
    "audio": { "example:launch": "assets/audio/launch.mp3" }
  }
}
```

定义索引的路径相对于根目录 `content.json`。`plants.json`、`seeds.json` 等是 ID 到配置的对象；`seed-catalog.json` 是有序种子 ID 数组，可引用本体或 Mod 中已注册的种子。配置按类别分文件，自定义视图参数放在相应植物、子弹定义的 `viewConfig` 中。

植物的 `visual.nameKey`、`visual.tooltipKey` 分别指定名称和选卡说明的文本键，文本写在表现定义的 `strings` 表中。未指定 `tooltipKey` 时沿用原版的 `名称键_TOOLTIP` 约定。

资源类别共用一套定义：`sprites`、`fonts`、`audio`、`json`、`text`、`reanim`、`particles`、`music`、`prefabs`。图片使用对象，其他类别使用 ID 到文件路径的映射；`audio` 支持 MP3/WAV。新动画、粒子、音乐配置使用对应类别，普通 JSON 使用 `json`。替换已有资源只需使用其原 ID；新增游戏定义使用 Mod 自身命名空间。

图片的 `width`、`height` 是逻辑尺寸，`scale` 是纹理分辨率倍数，例如逻辑 50×70、实际 100×140 时配置 `scale: 2`。可选 `rect`、`offset`、`borders` 分别控制裁剪、偏移和九宫格，`animations` 限制替换所适用的动画 ID。字体 JSON 通过 `layers[].image` 引用同目录 PNG，`textureScale` 决定字形纹理密度，保持原始排版。

## 开发与打包

```sh
npm run mod:init -- my-mod
npm run mod:pack -- mods/corn
npm run mod:test -- dist/mods/corn
```

只有 `mod:pack` 编译。它合并分类定义、收集资源和字体图集、生成内容哈希，输出 `dist/mods/<name>/` 与旁边的 ZIP；源码目录不产生编译文件。ZIP 的 `content.json` 保留资源映射，`gameplay`、`presentation` 则指向生成的合并 JSON。安装器验证清单、模块、文件路径、PNG 尺寸及字体图集。

加载器自动注册静态游戏定义、表现定义和新增资源；入口无需再次注册这些文件。入口统一为 `register({ host, assets })`，通过真实宿主注册自定义植物/僵尸行为、视图或包装方法：

```ts
export function register({ host, assets }) {
    const registry = host.get('server/GameplayRegistry').registry
    registry.plantBehaviors.register(assets.id, 'example:rapid_pea', behavior)
}
```

`ModAssets.json()` 读取归档配置；客户端 `assets.sprite()` 直接读取图片时也复用统一资源解码与缓存。纯资源、数据和脚本 Mod 使用同一个加载入口；注册失败会撤销该 Mod 的注册和方法包装，并跳过依赖它的 Mod。

`mod:test` 校验已打包目录的真实服务端注册，不重新编译，不代替客户端或真机画面验收。修改后需要重新打包、安装并重启。

## 现有资源 Mod

`dist/mods/` 包含 `hd.zip`、`hd-2.zip`、`zh-cn.zip`、`zh-cn-hd.zip` 和 `jiangnan-pvz2.zip`，ID 分别为 `local:hd`、`local:hd-2`、`local:zh-cn`、`local:zh-cn-hd`、`local:jiangnan-pvz2`。资源字节沿用原包，没有重新超分。

旧 `mod.json`、`pack.json` ZIP 不再作为安装格式，需要安装重新打包后的版本。`/pack` 命令及独立资源包管理器已移除。本体 `assets/resources/base.zip` 也使用相同归档格式，额外包含默认内容索引 `base-content.json`。
