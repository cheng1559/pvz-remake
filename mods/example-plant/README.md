# 新植物示例

这个 Mod 新增 `example:rapid_pea`，复用原版豌豆射手的能力、视图和动画资源。费用 75、射击间隔 75 tick，独立子弹 `example:pea` 的伤害为 30。基础内容文件不需要修改。

配置按类别放在 `assets/gameplay/` 和 `assets/presentation/`，统一由根目录 `content.json` 的 `gameplay`、`presentation` 字段索引。`mod:pack` 自动合并为入口读取的两份 JSON，不向源码目录写入合并产物。

```sh
npm run mod:pack -- mods/example-plant
npm run mod:test -- dist/mods/example-plant
```

安装 `dist/mods/example-plant.zip`：游戏内执行 `/mod`，在管理窗口点 Import 选择 ZIP，Apply 后确认重启。进入 1-1 可以看到新增种子包；Debug 构建也可以执行 `/level example:testing` 进入测试关卡，或在关卡内执行 `/plant example:rapid_pea 3 1`。

- 加载器自动注册玩法与表现配置；`src/server/index.ts` 直接通过 `GameplayRegistry.plantBehaviors.register` 和 `zombieBehaviors.register` 绑定植物、僵尸的行为；两者复用同一个回血工厂，每 100 tick 恢复 10 点生命。间隔和数值来自 JSON 的 `behavior`，每个实体的计时独立保存、恢复。
- `assets/presentation/` 保存植物、僵尸动画、视图、子弹表现和名称文本；本示例无需客户端脚本。
- `visual.preview: 0` 指定标准种子包使用的原版豌豆图像与布局；真实渲染模式读取新植物自己的 `animationTarget`。`visual.seedType` 保留完整 Mod ID，`nameKey` 对应名称文本。

Mod 只使用已有资源，因此不需要 Cocos Asset Bundle。替换外观时可通过 `content/resources` 注册自己的 ZIP 资源或可选 Bundle，再在表现定义中引用它们。定义注册规则及自定义视图接口见 [Mod 文档](../../docs/MODS.md#新增植物与内容注册)。

`example:testing` 的波次包含 `example:regenerating_zombie`，也可在关卡内执行 `/zombie example:regenerating_zombie 3 9` 生成。

两个行为注册表都直接绑定类型 ID，无需增强全局系统再筛选。`createState` 只在创建新实体时调用，读档使用已有状态；`validateState` 校验初始状态和保存、恢复的状态，不做旧格式转换。暂停和结算后均不推进，死亡僵尸不会通过回血行为复活。重新打包并安装 ZIP 后生效。

0.2.0 入口统一为 `register({ host, assets })`，直接调用真实定义、行为和视图注册表，不使用旧 Mod API。重新安装当前 ZIP 后生效。
