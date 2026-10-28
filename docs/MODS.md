# Mod 与内容包

所有扩展统一是 Mod，纯资源包无需代码入口。安装、依赖、优先级、启用状态和卸载均由同一个管理器处理。

## 安装与管理

```text
/mod
```

`/mod` 是唯一管理命令，不接受子命令。窗口中点 Import 选择 ZIP，可一次选择多个包；勾选启用，箭头调整资源优先级，越靠上优先级越高。依赖先加载；同 ID 资源由后加载的 Mod 覆盖，游戏定义的重复 ID 会报错。`pvz:base` 是内置基础包的保留 ID，不允许导入。

导入时校验 ZIP，将压缩文件原样写入独立暂存区，不覆盖已安装的 Mod；Cancel/ESC 会丢弃草稿并删除暂存文件，包括新包和已有 Mod 的更新。更新已有 Mod 保留原位置。

Apply 后若涉及导入、卸载、启用或已启用项排序，确认重启后先显示 `Restarting...` 并锁住管理窗口，保存当前关卡及待应用清单，再重启。Apply 不重新解压 ZIP 或安装、删除 Mod；下次启动期间只显示原有 PopCap Logo，后台校验依赖、安装和卸载，完成后加载游戏资源并进入标题页。任务失败会保留清单和暂存 ZIP，错误记入日志，点击 Logo 重试；运行中的代码、音频和图片继续使用原归档快照。仅调整未启用项的排序直接保存，无需重启。

只有 ZIP 安装方式。Web 使用 IndexedDB；Native 使用应用可写目录的 `mods/`。损坏或缺少依赖的归档会停用并在窗口显示错误，不阻止打开管理窗口。

管理窗口先显示 `Loading...`，读取完成后显示列表。

## 文件定义

源码和 ZIP 都使用根目录 `manifest.json`、`content.json`：

```json
{
  "schemaVersion": 1,
  "id": "example:showcase",
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

射手的 `shooter.initialDelayTicks` 和 `shooter.cadenceTicks` 均使用整数范围，例如初始等待 `{ "min": 0, "max": 150 }`、周期 `{ "min": 136, "max": 150 }`（周期最小值必须大于零）。服务端使用局内 RNG 抽取初始等待和每次周期；没有目标时也推进周期，当前时钟与 RNG 状态随存档保存。固定间隔使用相同的 `min`、`max`。

弹丸表现可配置 `shadow`：`sprite`、单行图集的 `columns`/`cell`、`offset` 和 `scale`。影子独立绘制在地面层，X 跟随弹丸，Y 为行起点加 `offset.y`，通过同一资源加载器保留高清包的逻辑尺寸。页面动画写在表现定义的 `screens` 表中，以 `pvz:tree` 等页面 ID 索引有序图层；每层指定 `name`、`reanimId`、`x`、`y`、`rate` 和 `playback`（`loop` 或 `last`），可选 `visibleTracks` 前缀和循环的 `randomPhase`。它们复用 `ReanimPlayer`，不包含服务端养成逻辑。

资源类别共用一套定义：`sprites`、`fonts`、`audio`、`json`、`text`、`reanim`、`particles`、`music`、`prefabs`。图片使用对象，其他类别使用 ID 到文件路径的映射；`audio` 支持 MP3/WAV。新动画、粒子、音乐配置使用对应类别，普通 JSON 使用 `json`。替换已有资源只需使用其原 ID；新增游戏定义使用 Mod 自身命名空间。

图片可通过 `alphaMode: "premultiplied"` 标记预乘透明度的源 PNG，未标记或 `"straight"` 时沿用普通 RGBA。该标记按 PNG 文件生效，共用同一文件的裁片不能声明冲突格式；`assets.sprite(path)` 原始路径也读取这份清单。本体加载器统一解码非交错 RGBA8 PNG、还原颜色并向紧邻的全透明像素延展边缘 RGB，避免线性采样产生黑边。Web 和 Native 使用同一路径，动画、淡入淡出及普通 Sprite 都保持默认混合，无需 Mod 单独设置混合因子。

图片的 `width`、`height` 是逻辑尺寸，`scale` 是纹理分辨率倍数，例如逻辑 50×70、实际 100×140 时配置 `scale: 2`。可选 `rect`、`offset`、`borders` 分别控制裁剪、偏移和九宫格，`animations` 限制替换所适用的动画 ID。字体 JSON 通过 `layers[].image` 引用同目录 PNG，`textureScale` 决定字形纹理密度，保持原始排版。

## 开发与打包

```sh
npm run mod:init -- my-mod
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

仓库只跟踪 `mods/example/` 示例；其余 `mods/` 子目录用于本地开发并由 Git 忽略。

[Mod 实验场](../mods/example/README.md) 展示玩法行为、ECS 组件与存档、关卡补丁、资源新增与覆盖、自定义视图、两端命令、菜单扩展和生命周期清理。可按其中的能力表查找实际实现。

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

## 扩展 CLI 命令

复用 `host.around` 包装现有命令对象，不需要另外的命令注册 API。两端都能访问 `shared/debug/DebugCli`；解析、命令名补全、参数提示和静态参数值补全均读取其中的 `specs.list()`。

例如客户端入口添加 `/example:hello {name}`：

```ts
export function register({ host }) {
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:hello', parameters: ['{name}'], minimum: 1 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some(entry => entry.name === spec.name) ? entries : [...entries, spec]
    })

    const { executor } = host.get('platform/debug/DebugCliCommands')
    host.around(executor, 'execute', function (next, input, ...rest) {
        const parsed = cli.parseDebugCliCommand(input)
        if (!('name' in parsed)) return parsed
        if (parsed.name === spec.name) return cli.debugSuccess(`Hello ${parsed.args[0]}`)
        return next(input, ...rest)
    })
}
```

`parameters` 是提示和参数数量上限，`minimum` 是数量下限；可选 `values: { 0: ['a', 'b'] }` 同时提供第一个参数的校验和补全。名称使用小写，可带 Mod 命名空间。使用原解析器可以保留引号参数等语法。

修改游戏状态的命令在服务端处理：两端入口执行相同的 `specs.list` 包装（可以抽到 Mod 的共享源码文件），客户端不添加对应的执行包装，正常入口会在有关卡时转发原始命令。集成运行时两端共享语法对象，上面的同名检查可避免补全重复。独立服务端也必须声明语法。

服务端用 `server/debug/DebugCommands` 中的 `executor`，收到的是经过服务端解析校验的命令，并且可以访问当前世界、定义、tick 和种植函数。例如将上面命令改为服务端返回消息时，保留语法包装，将执行包装移到服务端入口：

```ts
const cli = host.get('shared/debug/DebugCli')
const { executor } = host.get('server/debug/DebugCommands')
host.around(executor, 'execute', function (next, world, definitions, tick, command, createPlant) {
    if (command.name === 'example:hello') {
        return cli.debugSuccess(`Hello ${command.args[0]}, tick: ${tick}`)
    }
    return next(world, definitions, tick, command, createPlant)
})
```

服务端命令仍经过原有调试权限和命令队列，支持暂停时执行；Mod 自行检查其操作所需的世界状态。执行包装只处理自己的命令，其他命令调用 `next`。语法也使用包装扩展，避免直接修改列表；注册失败时，加载器会随 `host.dispose()` 一起撤销语法和执行包装，不留下失效命令或补全。

旧 `mod.json`、`pack.json` ZIP 不再作为安装格式，需要安装重新打包后的版本。`/pack` 命令及独立资源包管理器已移除。

本体 `assets/resources/base.zip` 与 Mod 共用 `manifest.json`、`content.json`、定义和资源解析器，不再包含专用内容索引。基础包固定最先加载且不可禁用／卸载；其源码 `mods/pvz-base/content.json` 与 Mod 一样索引分类 JSON，打包时合并成 `assets/gameplay.json` 和 `assets/presentation.json`。基础玩法额外提供 `settings`（schemaVersion、tickSeconds）、完整关卡、默认文本和种子目录；后加载的 Mod 使用自己的命名空间添加内容。`npm run mod:pack -- pvz-base` 使用通用 Mod 打包器生成 `dist/mods/pvz-base.zip`，`npm run mod:pack -- pvz-base --publish assets/resources/base.zip` 将同一产物发布到内置位置，哈希覆盖统一索引及全部文件。所有资源（含粒子）均在源 `content.json` 的 `resources` 中显式登记，打包阶段不扫描补齐。

### 粒子资源

粒子统一登记在 `resources.particles`，JSON 使用 `schemaVersion: 3`、完整限定的 `id` 和 `emitters`。每个发射器的 `sprite` 也是限定 ID；图集使用 `columns`、`rows`、`firstFrame`、`frameCount`。可选属性覆盖原版的循环、生成额度、色调、旋转、碰撞和场，缺省值由公共解析器统一补全。

轨道使用 `{ "nodes": [{ "time": 0, "low": 1, "high": 1 }] }`；`time` 是寿命比例，`systemDuration` / `particleDuration` 的值以 0.01 秒的 tick 计。XML 转换统一通过 `tools/pvz/particles.py`，基础包从 PAK 临时解包，直接转换到 `mods/pvz-base/assets/particles/` 并登记资源清单，再由通用 Mod 打包器打包。原版曲线及随机分布在转换时保留，由公共粒子内核运算。

脚本通过 `ParticlePlayer.spawn({ parent, id: 'example:burst', x: 0, y: 0, seed: 123 })` 播放，所有平台使用同一 C++ 核心。`whenReady()` 等待加载；`snapshot()` 与 `ParticlePlayer.restore()` 使用同一种存档结构。旧粒子格式和旧粒子存档不再接受，已有 Mod 的粒子资源需要重新转换和打包。

`mod:pack` 支持 `--publish <zip-file>`：打包成功后将完整 ZIP 原子替换到指定位置；失败时保留此前发布的文件。基础包使用 `npm run mod:pack -- pvz-base --publish assets/resources/base.zip`。
