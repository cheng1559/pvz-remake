# 玉米植物 Mod

独立实现玉米投手 `corn:kernel_pult` 和玉米加农炮 `corn:cob_cannon`，配置、玩法与表现均放在 Mod 内。

```sh
npm run mod:pack -- mods/corn
npm run mod:test -- dist/mods/corn
```

安装 `dist/mods/corn.zip`：游戏中 `/mod install` 选择 ZIP，确认重启。在 Debug 构建执行 `/level corn:testing`，可以通过种子包种植；也可在现有关卡 `/plant corn:kernel_pult 3 1`。测试关卡初始有 500 阳光。

加农炮测试关卡为 `/level corn:cannon_testing`，初始 2000 阳光，包含两种玉米种子包。在同一行相邻两格种玉米投手，再用加农炮种子包点击任意一株升级。炮弹装好后点击炮身进入瞄准，再点击草坪发射；右键取消，也可直接操作顶部种子包和 Menu。

移动端与种植共用触摸手势：轻点炮身选中，再按住草坪拖动瞄准，松手发射；也可从炮身直接拖到目标后松手。瞄准时显示与种植相同的行、列十字高亮，松手、暂停或移出有效格后隐藏。再次轻点选中的炮身，或拖出后移回炮身松手，均取消瞄准。放开时使用最后跟踪的位置，额外手指不会打断操作，暂停会丢弃当前手势。瞄准选择和发射仍由服务端处理。

iOS 选中炮身、确认发射和炮弹爆炸分别触发轻、中、持续爆炸触感，复用本体 `platform/Haptics`；需要包含原生振动支持的新版客户端。

没有符合条件的一对投手时，加农炮卡片置灰，点击会响拒绝音效并提示种植条件；服务端同时拒绝选卡。选卡成功后，两株可升级投手按原版 90 tick 周期闪动。可升级实体 ID 由服务端快照的 `corn:cob_upgrade.targets` 下发，前端只负责显示。

Tooltip 使用原版短提示 `requires 2 kernel-pults`，优先显示冷却、阳光不足。缺少底座的点击提示为 `Plant a pair of kernel-pults first!`，持续 1500 tick；放置位置不符时为 `Can only be planted on a pair of kernel-pults`，持续 500 tick。两种 advice 在本关各显示一次，记录随存档保存。灰置种子包每次点击播放 buzzer；非法种植位置静音。手持预览跟随指针，只有落点虚影对齐格子。瞄准图只在合法目标区域显示，移到区域外恢复默认光标。

- 加农炮费用 500、种子包冷却 5000 tick，占用横向两格。升级失败不消耗阳光、不移除投手；成功后沿用本体扣费与冷却。两格占用在读档后仍生效。
- 对照 Portable 的 `Plant::UpdateCobCannon/CobCannonFire` 和 `Projectile::UpdateLobMotion`：首次装填 500 tick，再播 125 tick 装填动画；射击后第 205 tick 出弹，射击动画 350 tick，随后等待 3000 tick 并再次装填。瞄准的前 30 tick 保留原版 100px 防误触距离。爆炸半径 115、行距最多 1、燃烧伤害 1800，复用本体爆炸判定。
- `src/server/cobCannon.ts` 处理升级、瞄准、装填和炮弹；瞄准与飞行分别保存在 `corn:cob_aim`、`corn:cob_flight`，随服务端存档。`src/client/cobCannon.ts` 处理四种主体动画、眨眼、就绪闪光、瞄准图、紫色种子包、双格预览、爆炸残痕和震屏。瞄准图使用原版完整图片，位置包含 `CursorObject::Update/Draw` 的两段偏移。
- 就绪玉米使用动画播放器的轨道颜色，按 75 tick 周期更新，避免重新绘制姿势时失去颜色。爆米花与残痕均保持到生命周期的 80% 再淡出，分别持续 50 和 100 tick。

- 费用 100、冷却 750 tick，玉米粒伤害 20，黄油伤害 40，黄油概率 25%，眩晕 400 tick。参数放在 `assets/gameplay.json`，1 tick = 0.01 秒。
- `src/server/index.ts` 直接注册自己的植物行为，包装真实 `ProjectileSystem.update` 和 `ZombieSystem.updateActive`，其余实体继续原方法。按 Portable 的 `Plant::UpdateShooter/Fire`、`Projectile::UpdateLobMotion` 实现：首次随机 0–300 tick；周期 286–300 tick，无目标时也重置；50 tick 预判；逐 tick 重力 0.115，下降高度决定命中，失去目标仍向默认位置出手。飞行与定身分别保存在 `corn:lob`、`corn:buttered` 组件中，统一同步与存档。
- `src/client/index.ts` 注册自己的视图、待机/投射/眨眼动画、子弹、命中粒子和音效；两个主体动画预先加载，投射姿势按服务端 tick 对齐。种子包支持标准、实际渲染和倾斜风格，种植预览使用自己的待机姿势。黄油按 `Zombie::DrawButter` 使用独立糊脸贴图，跟随头部中心；定身期间动作停住，死亡和碾压正常继续。子弹按服务端保存的角度旋转，玉米粒/黄油分别以 0.95/0.8 缩放。表现参数在 `assets/visuals.json`。
- `assets/content.json` 映射自己的资源 ID；`presentation.json` 保存表现配置。动画、PNG、粒子来自项目现有 PvZ 解包素材，以 `corn:` 命名空间独立打包；不引用原版玉米投手图鉴 ID 或第 34 个种子图。音效由解包 OGG 转为 MP3，以兼容现有 Web/Native 音频链路。

当前战斗支持本体已有的普通、旗帜、路障、铁桶、撑杆僵尸。抛投可以击中跳跃中的撑杆，但黄油不能定住正在跳跃的僵尸或无头尸体；重复命中重置 400 tick。未实现的冰车、潜水等僵尸机制不在此 Mod 内补写。

服务端碰撞、伤害、概率和计时均在 Mod 中；宿主没有玉米专用字段。瞄准通过通用 `mod` 指令发给服务端，零倍速仍能选择、取消和发射，动画与炮弹推进继续受游戏时钟和暂停控制。每份安装内容的版本与哈希参与存档校验，更新 ZIP 后旧关卡存档按不兼容处理。已构建客户端需更新本体，以包含本轮通用指令与宿主模块导出。

玉米炮的选卡条件挂钩服务端 `seedAvailability`，快照与普通／传送带选卡命令使用同一判断。客户端直接使用快照中的可用状态、警告文本键和公共选卡音效，无需再挂钩置灰或点击方法。额外 advice 由服务端 `rejectSeed` 挂钩发送。读取选中种子使用 `host.get('server/seedBank').selectedSeedId(bank)`；服务端选择状态保存在互斥的 `bank.selection` 中。
