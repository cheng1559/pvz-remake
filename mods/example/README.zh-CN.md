[English](README.md)

# Mod Lab

这是仓库维护的唯一一个示例模组。它演示从配置、资源到双端脚本的完整扩展流程，并带有一个可玩的测试关卡。它不依赖其他模组，既不需要修改基础游戏，也不需要 Cocos 编辑器。其中的贴图和提示音是为示例制作的小型资源。

## 功能与代码

| 功能 | 可观察到的效果 | 入口 |
| --- | --- | --- |
| 新植物、种子、子弹 | Rapid Pea 每 75 逻辑步射击一次，花费 75 阳光；它的子弹造成 30 点伤害 | `assets/gameplay/{plants,seeds,projectiles}.json` |
| 新僵尸与 mixin | Regenerating Zombie 每 100 逻辑步回复 10 点生命；Rapid Pea 也会回复，两者使用同一个 mixin | `src/server/index.ts` 中的 `regenerating()` |
| 自定义植物与视图 | Pulse Beacon 每 200 逻辑步增加 25 阳光，并用自己的动画循环发光 | `src/server/index.ts`、`src/client/beacon.ts` |
| 实体、快照与存档中的模组数据 | `example:charge` 把剩余时间保存在植物的 `extensions` 中；客户端通过 `world.extensions` 读取 | `registry.extensions.register()` |
| 自定义关卡 | `/level example:testing` 提供新的种子和僵尸 | `assets/gameplay/levels.json`、`assets/presentation/levels.json` |
| 修改已有内容 | 1-1 的种子列表加入两株示例植物 | `assets/gameplay/levels.json` |
| 新增资源 | 自带的 PNG、WAV、Reanim、粒子、JSON 和文本随 ZIP 发布 | `content.json` 中的 `resources` |
| 覆盖基础资源 | 普通豌豆也改用青色能量球贴图 | `resources.sprites["pvz:projectilepea"]` |
| 表现与文本 | 新子弹、粒子命中效果、发射音效和菜单文本 | `assets/presentation/` |
| 客户端指令 | `/example:hello` 显示帮助并播放自己的提示音；在主菜单也可使用 | `src/client/index.ts` |
| 服务端指令 | `/example:charge 3 1` 为指定格子中的示例植物充能 | `src/server/index.ts` |
| 方法包装与替换 | `around()` 保留菜单原有的初始化后再添加一个按钮；`replace()` 替换该按钮的按下音效 | `src/client/menu.ts` |
| 生命周期 | 再次初始化不会重复添加按钮；卸载或回滚时释放它创建的界面和方法包装 | `src/client/menu.ts` |

新关卡必须同时登记到玩法定义的 `levels` 和表现定义的 `levels`：前者控制规则和波次，后者提供开场、草坪和提示。只在后端添加的关卡无法进入实际场景。

`content.json` 按类别索引配置；打包时生成 `assets/gameplay.json` 和 `assets/presentation.json`。`src/server/` 和 `src/client/` 分别编译；双端共用的数据放在 `assets/settings.json`，通过 `assets.json()` 读取，不导入宿主源码，也不导入另一端的脚本。

## 打包与安装

在游戏项目根目录运行：

```sh
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

输出为 `dist/mods/example/` 和 `dist/mods/example.zip`。只在打包时编译，源码目录中不会生成 JS。`mod:test` 检查真实的服务端注册；仓库的集成测试还会加载实际打包出的双端 Cocos 模块，验证自定义视图、指令和清理。

在游戏中执行 `/mod`，导入 ZIP，应用并重启。安装后，主菜单左上区域会出现 **Mod Lab** 按钮，点击打开示例的帮助。停用该模组同样要在管理器中应用并重启。

## 试用

1. 点击主菜单的 Mod Lab 按钮，或执行 `/example:hello`，检查提示音和帮助文本。
2. 执行 `/level example:testing`，开场结束后种下 Rapid Pea 和 Pulse Beacon。也可以用 `/plant example:beacon 3 2` 放置信标，用 `/zombie example:regenerating_zombie 3 9` 生成示例僵尸。
3. 执行 `/example:charge 3 2`。行和列都从 1 开始计数，且只对 Rapid Pea 和 Pulse Beacon 有效。充能持续 300 逻辑步，使回复速度或信标的阳光产量变为三倍，信标还会变色。
4. 充能期间暂停、保存并重新进入关卡：剩余时间、回复和信标的计时以及之后的结果保持一致；暂停不消耗充能，也不再发射粒子。
5. 在普通关卡中观察基础豌豆的外观覆盖。新的能量球资源是 `example:orb`，`pvz:projectilepea` 的映射演示了覆盖已有 ID；删掉第二个映射即可取消覆盖。

原版资源仍然来自基础内容包。Rapid Pea 的本体和示例僵尸复用原版动画，信标只使用示例自带的 PNG 和 Reanim。标准种子包的 `visual.preview` 使用原版图片；渲染式种子包模式则按植物表现定义的 `clips`（其 `from` 可以借用其他植物的片段）和 `packet` 姿势绘制实际的植物。

## 状态与生命周期

- 玩法上的改动都在服务端进行。客户端的充能指令只声明语法；指令仍走正常的指令队列和游戏已有的调试权限检查。客户端从不直接修改世界。
- Rapid Pea、Pulse Beacon 和示例僵尸各是一个类型（通过 `registry.plants`/`registry.zombies` 注册，定义中带 `kind`）：它们的配置是定义中的 `example:regeneration` 和 `example:beacon` 字段，周期计时器是实体上同名的字段，随存档保存，并在读取时校验。回复写成 mixin `regenerating(Base)`，同时用在 `Shooter` 和 `Zombie` 上；信标覆盖 `produce`，与基础游戏的产出一样，在暂停、关卡结束或奖励掉落后停止。`example:charge` 是植物上的 `extensions` 数据，经过校验后写入快照和存档，用完即删除。
- 客户端根据权威的逻辑步和扩展快照计算粒子与色调，不使用 `setInterval`，也没有自己的模拟时钟。信标继承宿主的 `PlantView`：动画由玩法定义的 `animation` 驱动，视图只在 `onBoard` 中添加关卡内的色调和粒子；关卡外的显示（例如种子包图片）只通过 `pose`。
- 指令语法通过包装 `specs.list()` 声明，而不是修改全局数组。两端都会检查同名语法，因此一体化运行时不会重复注册。
- `host.dispose()` 撤销方法包装；本示例还包装了这个方法，用来销毁它创建的按钮和对话框。实体视图随宿主的实体节点一起销毁；注册失败时，加载器会回滚注册表。正常的启用和停用会重启游戏，以加载完整的模组集合。
- 存档只支持当前的模组版本和内容哈希。示例不转换旧存档。

需要进一步扩展时，按同样的方式添加更多视图和玩法。字体、音乐和预制体的格式以及宿主模块列表见[模组](../../docs/MODS.zh-CN.md)；预制体仍有引擎导入方面的要求。manifest 中的 `dependencies` 声明对其他模组 ID 和版本的依赖；本示例保持自包含。
