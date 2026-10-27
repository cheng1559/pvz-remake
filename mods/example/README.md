# Mod 实验场

仓库只维护这一个示例。它演示从配置、资源到两端脚本的完整扩展流程，包含一个可玩的测试关卡，不依赖其他 Mod，不需要修改游戏本体或启动 Cocos 编辑器。贴图和提示音为示例自制的小资源。

## 能力与代码

| 能力 | 可观察的效果 | 入口 |
| --- | --- | --- |
| 新植物、种子、子弹 | Rapid Pea 每 75 tick 射击，费用 75，子弹伤害 30 | `assets/gameplay/{plants,seeds,projectiles}.json` |
| 新僵尸与自定义行为 | Regenerating Zombie 每 100 tick 回复 10 生命；植物有独立回血计时 | `src/server/index.ts` 的 `regeneration()` |
| 自定义植物与视图 | Pulse Beacon 每 200 tick 增加 25 阳光，用自有动画循环发光 | `src/server/index.ts`、`src/client/beacon.ts` |
| ECS 扩展、快照、存档 | `example:charge` 保存剩余时间，客户端通过 `world.extensions` 读取 | `registry.components.register()` |
| 自定义关卡 | `/level example:testing` 提供新增种子和僵尸 | `assets/gameplay/levels.json`、`assets/presentation/levels.json` |
| 修改已有内容 | 1-1 的种子列表增加两种示例植物 | `assets/gameplay/level-patches.json` |
| 新增资源 | 自有 PNG、WAV、Reanim、粒子、JSON、文本随 ZIP 分发 | `content.json` 的 `resources` |
| 覆盖基础资源 | 普通豌豆也使用青色能量球贴图 | `resources.sprites["pvz:projectilepea"]` |
| 表现与文本 | 新子弹、粒子命中效果、发射音和菜单文字 | `assets/presentation/` |
| 客户端命令 | `/example:hello` 显示帮助并播放自有提示音，在主菜单也可执行 | `src/client/index.ts` |
| 服务端命令 | `/example:charge 3 1` 为指定格子的示例植物充能 | `src/server/index.ts` |
| 方法包装与替换 | `around()` 保留菜单初始化，再添加按钮；`replace()` 替换该按钮的按下音效 | `src/client/menu.ts` |
| 生命周期 | 重复初始化不重复添加按钮，销毁或回滚时释放自建界面和方法包装 | `src/client/menu.ts` |

新增关卡要同时登记玩法 `levels` 和表现 `levels`：前者控制规则与波次，后者提供开场、草地和提示。只添加后端关卡无法进入实际场景。

`content.json` 按类别索引配置，打包时生成 `assets/gameplay.json`、`assets/presentation.json`。`src/server/` 与 `src/client/` 分别编译；两端共用的数据放在 `assets/settings.json`，通过 `assets.json()` 读取，不导入宿主源码或跨端脚本。

## 打包和安装

在游戏项目根目录运行：

```sh
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

输出为 `dist/mods/example/` 和 `dist/mods/example.zip`。编译只在打包时发生，源码目录不生成 JS。`mod:test` 检查真实服务端注册；仓库中的集成测试还会加载实际打包的 Cocos 两端模块，并验证自定义视图、命令和清理。

游戏内执行 `/mod`，Import 该 ZIP，Apply 后重启。安装后主菜单左上区域出现 **Mod Lab** 按钮，可以打开示例帮助。关闭 Mod 同样通过管理器 Apply 后重启。

## 体验步骤

1. 点击主菜单的 Mod Lab 按钮，或执行 `/example:hello`，检查提示音与帮助文字。
2. 执行 `/level example:testing`，完成开场后种植 Rapid Pea 和 Pulse Beacon。也可以用 `/plant example:beacon 3 2` 放置信标，用 `/zombie example:regenerating_zombie 3 9` 生成示例僵尸。
3. 执行 `/example:charge 3 2`。行、列均从 1 开始，只对 Rapid Pea 和 Pulse Beacon 生效。充能维持 300 个逻辑 tick，回血或信标产阳光变为 3 倍，信标改变颜色。
4. 在充能中暂停、保存并重新进入关卡：剩余时间、行为计时和后续结果继续保持一致；暂停不消耗充能，也不继续发射粒子。
5. 在普通关卡观察基础豌豆的外观覆盖。新增能量球资源是 `example:orb`，`pvz:projectilepea` 的映射演示覆盖已有 ID；删除后一个映射即可取消这项覆盖。

原版资源仍由基础包提供。Rapid Pea 的身体和示例僵尸复用原版动画，信标则完全使用示例自己的 PNG 和 Reanim。标准种子包的 `visual.preview` 使用原版图像；渲染种子包模式通过 `animationTarget` 绘制实际植物。

## 状态与生命周期

- 玩法变化在服务端发生。客户端的充能命令只声明语法，仍通过正常命令队列转发，并接受游戏现有的调试权限校验；客户端不会直接改世界。
- `behaviorState` 保存实体自己的周期计时。`example:charge` 是额外的 JSON ECS 组件，经过校验进入快照及存档，耗尽后移除。两个行为系统都遵守游戏阶段、暂停、死亡和结算规则。
- 客户端根据权威 tick 和扩展快照计算粒子与着色，不使用 `setInterval` 或另建模拟时钟。信标继承宿主 `AnimatedPlantView` 的动画快照与恢复逻辑。
- 命令语法通过包装 `specs.list()` 声明，不直接修改全局数组。两端会检查同名语法，避免集成运行时重复注册。
- `host.dispose()` 撤销方法包装；本示例也包装该方法，销毁自己创建的按钮和对话框。实体视图随宿主实体节点销毁；注册失败时，加载器负责回滚注册表。正常启停通过重启加载完整 Mod 集合。
- 存档只支持当前 Mod 版本及内容哈希。示例不转换旧存档。

继续扩展时，可按同样方式加入更多视图和玩法。字体、音乐和预制体的格式以及宿主模块列表见 [Mod 文档](../../docs/MODS.md)；预制体仍有引擎导入要求。清单中的 `dependencies` 用于声明其他 Mod 的 ID 和版本依赖，本示例保持自包含。
