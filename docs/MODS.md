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

`/mod install` 不接受路径参数，打开与 `/pack install` 相同的 ZIP 文件选择器，可一次多选 ZIP（Web、macOS、iOS）。文件逐个读取、安装，共用一个标题为 `Installing...` 的窗口；单个失败会继续处理其他文件，最后汇总失败文件名与原因。批量新装 Mod 先保存，再一起校验依赖并启用，不要求先选依赖包；安装成功后只提示一次重启，确认后立即重启整个游戏，运行中的关卡先保存。安装会启用 Mod，同 ID 安装会更新它。管理窗口的 Import 同样支持多选，勾选状态仍在 Apply 后生效。重新启用或停用同一个状态不会提示重启；卸载停用的 Mod 不需要重启。`/mod list` 显示当前保存的启用列表，变更在重启后执行。

加载页也可以按 `/` 打开 CLI；Mod 导致启动失败时，可用 `/mod install` 更新 ZIP，或用 `/mod unload <id>` 停用后重启。更新工作区中的 ZIP 不会自动替换已经安装的副本。启动日志会显示实际加载的 Mod ID 和版本。

模块导入、`register()`（含异步注册）或注册后配置校验失败时，只跳过该 Mod 及依赖它的 Mod，本体和其他 Mod 继续启动。两端新增的定义、行为、视图、资源和 JSON 组件登记会一起回滚，`host.around()`／`replace()` 安装的方法包装也会撤销；失败 Mod 不加入本轮运行内容与存档身份集合。管理窗口显示 `[Error]`，悬停查看原因，控制台保留 Mod ID、出错阶段和完整异常。安装文件和保存的启用状态不自动删除或改写，更新 ZIP 或停用后重启生效。该边界覆盖初始化阶段，不是任意运行时代码的沙箱。

ZIP 内必须恰好有一份 `mod.json`，可以位于根目录或外包一层文件夹，并包含清单声明的 Cocos SystemJS 模块与可选 Asset Bundle。安装前检查文件、依赖版本和依赖环；不能停用或卸载其他启用 Mod 仍然依赖的 Mod。`/mod unload all` 可以一起停用。

Web 与 CLI 预览使用当前站点的 IndexedDB；Native 使用应用可写目录的 `mods/`，由安装器管理，无需手动复制目录。启动时清除安装文件已不存在的启用记录；已安装 Mod 的内容损坏或依赖不满足仍会报错。删除原 ZIP 不影响安装结果。旧目录扫描与 `mods.json` 配置入口已移除。

运行时从已安装 ZIP 快照加载模块和资源，变更在重启后生效。模块支持相对 JS 依赖，纯代码或原始资源 Mod 不需要 Cocos Asset Bundle。Native 的 `mod-runtime/` 是运行中的资源临时快照，下次启动清理。

## 开发与打包

源码使用 `src/server/`、`src/client/`，配置和原始资源放在 `assets/`。只有 `mod:pack` 编译，输出到 `dist/mods/`，源码目录不写入 JS。ZIP 不含 TypeScript 源码。

```sh
npm run mod:pack -- mods/corn
npm run mod:test -- dist/mods/corn
```

`mod:test` 验证已打包目录的文件与服务端注册，使用真实服务端宿主，不重新编译，也不代替客户端画面验收。`contentHash` 根据编译产物、资源与清单自动计算；改动后需要重新打包、安装并重启。

## 宿主访问

所有入口统一为 `register({ host, assets })`。服务端和客户端分别取得自己的宿主，不向服务端暴露 Cocos 对象。

```ts
export function register({ host, assets }) {
    host.get('content/definitions').register(assets.id, assets.json('assets/gameplay.json'))
    const { ProjectileSystem } = host.get('server/projectiles')
    host.around(ProjectileSystem.prototype, 'update', function (next, context, entity) {
        // 在这里筛选自己的组件，处理自己的弹道；其他实例继续原来的方法。
        return next(context, entity)
    })
}
```

- `host.get(moduleId)` 返回真实导出对象或注册表；可用模块见 [服务端表](../assets/scripts/server/createModHost.ts) 和 [客户端表](../assets/scripts/client/content/createModHost.ts)。未暴露的模块会报错，不按文件路径任意导入。TypeScript 类型在运行时不存在。
- `host.around(target, method, handler)` 包装真实方法，保留 `this`。`next()` 传入当前参数，`next(...args)` 替换参数；可返回 Promise。后安装的包装在外层，可决定是否执行原方法。
- `host.replace(target, method, implementation)` 完整替换方法。两种操作均返回撤销函数；加载失败时宿主撤销本次安装的包装。正常启停仍通过重启生效。
- `assets.id`／`manifest` 为安装清单，`json(path)`／`bytes(path)`／`url(path)` 读取自己的 ZIP 文件；客户端另有 `await assets.sprite(path)`。路径相对 `mod.json`，不能越出安装包。

已经移除原有的定义、植物/僵尸行为、植物/僵尸视图、系统、页面、动画专用 Mod API，以及升级规则转发层。现在直接使用真实注册表或包装方法；旧入口不保留兼容层。已有宽屏和示例植物已迁移，需要安装本轮重新打包的 ZIP。

## 新增植物与内容注册

服务端注册 `assets/gameplay.json`，客户端注册 `assets/presentation.json`，均使用 `host.get('content/definitions').register(assets.id, data)`。

| 入口 | JSON 顶层表 |
| --- | --- |
| 服务端 | `boards`、`seeds`、`plants`、`zombies`、`zombieGaits`、`projectiles`、`items`、`lawnMowers`、`levels`、`levelPatches` |
| 客户端 | `plants`、`zombies`、`projectiles`、`strings` |

基础内容和 Mod 共用注册与引用校验。新增 ID 使用自己的命名空间，重复 ID、缺失引用会报错，合并后冻结。`levelPatches` 按已有关卡的顶层字段整体替换；同字段重复补丁报冲突。新增完整关卡登记到 `levels`，已有 `/level`、`/plant`、`/zombie` 命令识别新 ID。

客户端的 `visual.nameKey` 引用 `strings`；复用原版卡图时可以提供 `visual.preview`，独立资源不必填写它。植物与僵尸 JSON 的 `view` 选择表现工厂，`animationTarget` 选择动画定义。实际注册表位于 `host.get('client/views').plants` 和 `.zombies`，均通过 `register(kind, factory)` 登记。

工厂返回对应 [PlantView](../assets/scripts/client/plants/PlantView.ts) 或 [ZombieViewInstance](../assets/scripts/client/zombies/ZombieView.ts)，负责同步、表现存档恢复与清理。Mod 可复用已有视图，也可包装其原型；不要把客户端表现定义当作服务端碰撞依据。

## 自定义玩法和状态

```ts
const { registry } = host.get('server/GameplayRegistry')
registry.plantBehaviors.register(assets.id, 'example:rapid_pea', behavior)
registry.zombieBehaviors.register(assets.id, 'example:regenerating_zombie', behavior)
```

两类行为共用 [EntityBehaviorRegistry](../assets/scripts/server/EntityBehaviorRegistry.ts)：`createState(definition)` 创建独立 JSON 状态，`tick(context)` 推进逻辑，`validateState(state, definition)` 校验创建与存档。JSON 的 `behavior` 保存配置，实例的 `behaviorState` 自动同步、保存与恢复。读档不重新创建状态；暂停、零倍速和结算不运行这些行为。现有移动、伤害、碰撞等系统可复用或通过 `host.around()` 包装。

跨实体效果或自定义投射物状态使用普通 ECS 组件：

```ts
const { defineComponent } = host.get('ecs')
const Flight = defineComponent('my:flight')
registry.components.register(Flight, state => { /* 校验 JSON 状态，错误则抛出 */ })
```

登记后组件自动跟随实体保存、恢复，并同步为 `world.extensions['my:flight']['实体ID']`。客户端只读该快照；实体删除后组件一并删除。可变状态必须留在行为状态或已登记的组件中，不放在模块全局变量。未安装组件或格式不兼容时拒绝存档，不做旧格式转换。

自定义交互发送 `{ type: 'mod', id: 'my:action', data: { ... } }`，`data` 必须是 JSON 对象。服务端可包装 `IntegratedGameServer.executeCommand`，处理自己的指令并校验阶段、暂停和参数，其他指令继续原方法。与种植指令一样，零倍速仍会处理交互，模拟计时不推进；本体不认识的 Mod 指令会拒绝。

## 独立资源

```ts
host.get('content/resources').register(assets, assets.json('assets/content.json'))
```

资源表是 `{ "reanim": { "my:idle": "assets/reanim/idle.json" }, "sprites": { ... }, "particles": { ... }, "sounds": { ... } }`。资源使用自己的命名空间，经现有 ContentRegistry 与仓库加载，支持同 ID 资源包覆盖。原始 Reanim/粒子 JSON 和 PNG 可直接放进 ZIP；AudioClip 使用引擎支持的音频格式。序列化的 Cocos Prefab 等复杂资源仍应使用可选 Asset Bundle。

## 可运行示例

- [corn](../mods/corn/README.md)：玉米投手与玉米加农炮，包含抛投/黄油、双格升级、瞄准与范围爆炸，使用自己的资源和测试关卡。
- [example-plant](../mods/example-plant/README.md)：复用原版资源，植物与僵尸共享回血行为工厂。
- [widescreen](../mods/widescreen/README.md)：直接调用真实视口模块，包装主界面初始化和节点销毁，保留原有宽屏与动画扩展。
