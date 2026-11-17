# 阵营与魅惑菇

原版用僵尸的 `mMindControlled` 一个布尔值表示“被魅惑”，散落在二十多个函数里分别判断。重制版改成阵营：植物和僵尸各属一个阵营，不同阵营互相敌对，魅惑菇把咬它的僵尸改到植物阵营。判定统一走“是否敌对”，不再有针对魅惑的分支。原版依据来自 PvZ-Portable（1073 源码）；1096 在这部分只多了 Disco is Undead 成就（见 [成就](ACHIEVEMENTS.zh-CN.md)）。

## 原版行为

### 魅惑菇被咬（`Zombie::AnimateChewSound`）

僵尸啃咬时（咀嚼动画的音效帧），咬到的若是醒着的魅惑菇（`!mIsAsleep`，白天睡着无效）：

1. 播放 `FOLEY_FLOOP`，魅惑菇死亡（`Plant::Die`）。
2. `StartMindControlled`：播放 `SOUND_MINDCONTROLLED`，`mMindControlled = true`；舞王清空伴舞、伴舞脱离舞王，其他僵尸断开关联僵尸（雪橇队等）。
3. 在僵尸上方一层（`mRenderOrder + 1`）放 `PARTICLE_MIND_CONTROL`，位置 `(mPosX + 60, mPosY + 40)`。
4. `TrySpawnLevelAward`：它若是场上最后一个敌对僵尸，奖励从它身上掉落。
5. 速度设为 `mVelX = 0.17`，动画 `mAnimTicksPerFrame = 18`。但它这时正在啃，下一次找不到可啃的东西时 `StopEating` → `StartWalkAnim` → `PickRandomSpeed` 又按僵尸类型重新随机速度（每只僵尸停嘴再走时都这样），所以 0.17 实际不起作用，被魅惑的僵尸以它那一类的普通速度往右走。

被魅惑的僵尸咬僵尸时用 `FOLEY_CHOMP_SOFT`。

### 被魅惑后

| 原版函数 | 行为 |
| --- | --- |
| `IsWalkingBackwards` | 往右走（`mPosX += 速度`），绘制镜像 |
| `GetZombieAttackRect` | 攻击范围镜像到右侧：`x = mWidth − x − width` |
| `UpdateEating` | 每次啃咬先找敌对僵尸（`FindZombieTarget`），有就啃它；被魅惑的不啃植物 |
| `FindZombieTarget` | 同一行、阵营不同、未死亡、不在空中或地下，与攻击范围重叠 ≥ 20（对方正在吃时 ≥ 0） |
| `EatZombie` | 对方 `TakeDamage(DAMAGE_PER_EAT, 9)`，开始吃；对方身体血量归零时播放 `SOUND_GULP` |
| `EffectedByDamage` | 植物的伤害（子弹、爆炸、啃咬）不打被魅惑的僵尸，只有带 `DAMAGES_ONLY_MINDCONTROLLED` 的攻击才打（本体暂无） |
| `CanBeChilled` | 不会被冰冻（本项目改为冰冻跟着敌对攻击走，见下文“冰冻”） |
| `CheckForBoardEdge` | 往右走超过 `x = 850` 时无声消失（`DieNoLoot`） |
| `DrawReanim`、`DrawZombiePart` | 颜色 `(128, 64, 192)` 相乘再加同色叠加（`ZOMBIE_MINDCONTROLLED_COLOR`） |
| `OverrideParticleColor` | 掉落的头、手臂等粒子同样上色并叠加 |
| `AreEnemyZombiesOnScreen`、`CountZombiesOnScreen`、`TotalZombiesHealthInWave` | 不计入：不影响过关判断、刷波的血量阈值 |
| 小推车 | 不碾被魅惑的僵尸（`EffectedByDamage(127)`） |

其余只涉及特殊僵尸或植物的分支（巨人、雪人、梯子、舞王召唤伴舞、窝瓜头和辣椒头僵尸、胆小菇、磁力菇等），等对应内容实现时再按阵营接入。

## 设计

### 阵营

- 两个固定阵营：`plants`、`zombies`。玩家是 `plants`。
- 植物、僵尸的组件带 `team`，默认分别是 `plants`、`zombies`；随存档保存，快照发给客户端。
- 子弹、爆炸带发起者的阵营。
- 敌对规则只有一条：阵营不同即敌对（`isHostile`），所有判定都调用它。
- 阵营决定朝向：`zombies` 阵营朝左，`plants` 阵营朝右。僵尸往朝向走：`zombies` 进屋判负，`plants` 超过 `x = 850` 无声消失。植物的攻击范围、爆炸中心、子弹方向和保龄球滚动方向按朝向镜像（跨 `Plant::mWidth = 80` 镜像）。

### 判定改动

- 植物的目标搜索（射手、大喷菇范围攻击、大嘴花、土豆雷、保龄球）、子弹命中、爆炸：对敌对阵营的僵尸和植物生效，不碰己方。默认阵营下植物只会遇到敌对僵尸，和原版一致（原版植物攻击跳过被魅惑的僵尸，`EffectedByDamage`）。
- 打敌对植物属于扩展（原版没有僵尸方的植物），规则参照原版僵尸豌豆（`Projectile::DoImpact`）：直接扣植物血量并闪白 25 tick，不看植物状态；血量归零时按被吃掉处理（爆炸坚果照样爆）。子弹命中植物要求重叠大于 8（`FindCollisionTargetPlant`），植物身体即 `Plant::GetPlantRect`；子弹飞过植物定义里 `low: true` 的低矮植物（原版僵尸豌豆跳过的小喷菇、阳光菇、土豆雷等），发射子弹的射手也不把它们当目标，范围攻击照打。土豆雷对敌对植物的判定向前多伸半格（`targeting.plantReach: 40`）：触发范围和爆炸对植物的判定都往前挪 40，所以隔壁格的敌对植物会引爆它并被炸掉；对僵尸的判定和爆炸特效位置不变。大嘴花把敌对植物整个吞掉（状态记 `ability.prey: 'plant'`，客户端在咀嚼、吞咽时隐藏动画里僵尸手臂的两条轨道，即表现定义的 `parts.prey`）；僵尸咬不动的植物（点燃的樱桃、正在出土或已出土的土豆雷）大嘴花也咬不动，会扑空。出土的土豆雷碰到前方半格内的敌对植物就会自己引爆；爆炸按伤害值扣血，`kills` 只算僵尸；保龄球撞植物不计入 `hits`；两颗敌对的滚动坚果相撞时双方同时结算，各掉对方的撞击伤害并反弹，爆炸坚果引爆，结果与结算先后无关。`/plantinvincible` 同样挡住这些伤害。
- 僵尸啃咬：先找前方的敌对僵尸（规则同 `FindZombieTarget`），再找敌对植物；僵尸不啃己方植物。
- 僵尸移动、攻击范围按阵营方向镜像。
- 刷波、过关、掉落关卡奖励：只统计 `zombies` 阵营的僵尸。
- 冰冻：只作用于敌对阵营，跟着攻击走（寒冰豌豆只打敌对目标）。原版 `CanBeChilled` 写死被魅惑的僵尸不能冻，只是因为原版只有植物会冰冻；这里去掉了这条，敌方的寒冰豌豆能减速 `plants` 阵营的僵尸，既被魅惑又被减速或冻住的僵尸和植物（原版不会出现，被魅惑的僵尸不能被冻）取两种颜色的平均 (102, 70, 224)，两种状态都看得出（`client/view/tints.ts` 的 `entityTint`），掉落的部件同样。寒冰菇只冻敌对阵营（见下一条）。敌对的寒冰豌豆打中植物也会冻住它（扩展，原版植物不会被冻）：时长同冻僵尸并取较长者，期间植物每两个 tick 跳过一个，射击、蓄力、产阳光、能力计时（引线、土豆雷准备、大嘴花消化等）、眨眼倒计时和保龄球滚动都按一半速度；动画和冰冻僵尸的身体一样由服务端每个 tick 按一半速率推进（`plantPace`，`CHILLED_ANIMATION_FACTOR`），快照里发的就是减半后的速率，客户端照着播放；刚被冻上时播放冰冻音效（`FOLEY_FROZEN`，同 `Zombie::ApplyChill`）；客户端和冰冻僵尸走同一条路径变蓝（`ReanimPlayer.setTint`，`plants/chill.ts`，事件 `plantChilled`，存档字段 `chilledTicks`）。`/plantinvincible` 只挡伤害，不挡冰冻。
- 冷不冷得到看类型（`server/combat/cold.ts`，植物和僵尸同一套）：定义里的 `unchillable: true` 或 `[状态…]` 表示任何时候或在这些状态下不减速，因此也不冻，寒冰射手的减速同样无效（火炬树桩；原版的冰车、拉着雪橇的雪橇队等）；`unfreezable: true` 或 `[状态…]` 表示不冻，只减速，也不受冰冻的那 20 点伤害（原版 `HitIceTrap` 先减速、`CanBeFrozen` 为假就返回）。植物的状态是技能状态，僵尸的是僵尸状态。本体里`unfreezable` 的有樱桃炸弹、寒冰菇、两种保龄球坚果、墓碑吞噬者、出土中（`rising`）的土豆雷，以及在空中（`airborne`）的撑杆僵尸；毁灭菇也是；已经索敌的倭瓜、三叶草和火爆辣椒实现时照此加上，火炬树桩写 `unchillable`。正在死亡、被烧焦、被压扁、正从墓碑爬出的僵尸，和已被摧毁的植物，任何类型都不减速、不冻。
- 寒冰菇：冻住与它敌对的全部僵尸和全部植物（`combat/freeze.ts` 的 `freezeHostiles`）。原版的冰冻放过被魅惑的僵尸（`CanBeChilled`），那正是原版里唯一和它同一方的僵尸；这里放过的是它自己这一方。`zombies` 阵营的寒冰菇冻住 `plants` 阵营的僵尸，也冻住 `plants` 阵营的植物（扩展，原版没有冻植物）：植物和僵尸一样减速 2000 tick、冻住 400–600 tick（已经被减速或被冻的 300–400）、受 20 点伤害（`damagePlant`，会闪一下），冻住期间每个 tick 都跳过（`plantSkipsTick`），射击、产阳光、能力计时和眨眼全部暂停，动画停住（`plantPace` 为 0），挂在它身上的粒子也停在原处（墓碑吞噬者的啃食，`ParticlePlayer.setPaused`），樱桃炸弹也不再抖动，仍然可以被啃、被打；冰块按植物的默认位置画在格子中间、顶边和植物影子的顶边齐平（表现 `iceTrap.plant`，(13, 51)，和僵尸的冰块顶边对齐它影子的 92 一样；植物比同一行的僵尸站得高，影子在 51），碎冰粒子在 (40, 65)，跟着植物一起左右镜像。冻着时被消灭（`destroyEatenPlant`）冰块碎开，被小推车压则直接去掉。场地按被冻的一方记 300 tick（`LevelState.iceTrap`）。存档字段 `frozenTicks`（植物和僵尸）、`level.iceTrap`。
- 小推车：不碾 `plants` 阵营的僵尸（原版 `EffectedByDamage(127)`，同植物攻击）。
- 铲子：只能铲 `plants` 阵营的植物，`zombies` 阵营的植物不高亮、铲不掉（同墓碑吞噬者不能铲）。

### 魅惑菇

- 通用的植物能力 `mindControl: true`：醒着时被敌对僵尸啃到（咀嚼动画的音效帧，`Zombie::AnimateChewSound`），这一下不算啃咬，植物立即消失（血量清零，同一 tick 其他僵尸不会再啃到它），啃它的僵尸改到植物的阵营。数据写在植物定义里，不按植物 ID 判断。
- 扩展（原版植物不吃植物）：植物一口咬住醒着的敌对魅惑菇时（大嘴花，`plants/abilities.ts` 吞植物的那一处），咬它的植物同样改到魅惑菇的阵营；这一口不算吞下，按咬空（`missed`）收回，咬完回到 `ready`，不嚼不消化（`chomperBit` 的 `ate` 为 false）；白天睡着的魅惑菇照常被吃掉。僵尸和植物走同一个 `mindControl`（`zombies/mindControl.ts`，是否生效看 `mindControls`）。
- 换阵营时：速度不变，停嘴再走时和所有僵尸一样重新随机（`Zombie.pickSpeed`，即 `PickRandomSpeed`）；僵尸或植物记上 `mindControlled`（随存档保存、快照发给客户端，只有被魅惑的才染色，种下或放下就在另一方的不算）；发出 `mindControlled` 事件（`entityId`、`plantId`、`typeId`、`team`）；被魅惑的僵尸若是最后一个敌对僵尸，关卡奖励从它身上掉落（`tryDropLevelAward`）。
- 成就 Disco is Undead 以后用一个触发类型观察 `mindControlled`（舞王实现后再配）。

### 表现

- `plants` 阵营的僵尸镜像，照原版 `Zombie::UpdateReanim`：身体右移 90 再翻转，不管片段偏移，所以原版里会朝右的僵尸（被魅惑的、以后的矿工和雪人等）都和原版一样。原版没有的“朝右放下”另外修正，让它和其他僵尸对齐：僵尸玩法定义的 `facingRightOffsetX` 让它放下时多站右一些，手持和格子预览同样挪；种子包里用僵尸表现定义 `packet.facingRightOffsetX`。撑杆僵尸的两个值都由原版数据推出：它的 `GetDrawPos` 横向 −6，种子包 x 比普通僵尸左 5 像素（−8 对 −3，缩放 0.35，即自身坐标里身体靠右 14.29），放下时为 6 + 14.29 = 20.29，种子包为 2 × 14.29 = 28.57。橄榄球僵尸的种子包缩放（0.33）和普通僵尸（0.35）不同，改为让两者的身体在种子包中线（50 宽的 x = 25）对齐来推：它的 `GetDrawPos` 只往上挪，种子包 x 为 −7，身体在自身坐标里比普通僵尸靠右 (25 + 7) / 0.33 − (25 + 3) / 0.35 = 16.97，放下时多站右 16.97；缩放相同时这个推法和撑杆僵尸的一样。影子用表现定义里的 `shadow.backwardsX`。掉落的头、手臂、旗帜和护具粒子，以及烧焦后的焦黑僵尸，也跟着朝右翻转；原版对被魅惑的僵尸只镜像位置、不翻转粒子方向，这里按 bug 修正。啃坚果时的碎屑同样翻转。
- 被魅惑的表现随魅惑菇一起做：颜色 `(128, 64, 192)` 相乘并叠加、掉落的肢体和头盔同样上色、啃僵尸用轻柔的咀嚼音（原版这些都看 `mMindControlled`）。用种子包或 `/zombie ... plants` 放出的植物阵营僵尸不算被魅惑，外观和普通僵尸一样，只是朝右。
- 换阵营事件播放 `FOLEY_FLOOP`、`SOUND_MINDCONTROLLED` 和 `PARTICLE_MIND_CONTROL`；僵尸啃僵尸用轻柔的咀嚼音，对方倒下时播放吞咽音。

## 步骤

1. 已完成：阵营数据、`isHostile`、存档和快照（`shared/content/teams.ts`，客户端和服务端共用）。
2. 已完成：现有判定（植物目标、子弹、爆炸、冰冻、刷波、过关、进屋）改为按阵营。
3. 已完成：僵尸啃僵尸（穿过盾牌、不闪白，事件 `zombieChewedZombie`、`zombieAteZombie`）、按阵营方向移动和离场。
4. 已完成：植物攻击敌对植物（事件 `plantHit`；`projectileImpact`、`bowlingImpact` 打到植物时带 `target: 'plant'`，`chomperBit` 吞植物时带 `plantId`）。
5. 已完成：魅惑菇能力、换阵营事件（`server/zombies/mindControl.ts`）。
6. 已完成：僵尸镜像、`zombies` 阵营植物和它的子弹镜像、植物受击闪白、啃咬和吞咽音效；被魅惑的僵尸和它掉落的头、手臂、旗帜染成魅惑色（`ReanimPlayer.setTint`，魅惑色先于冰冻色），被魅惑的僵尸啃僵尸用轻柔的咀嚼声，换阵营播放 `FOLEY_FLOOP`、`SOUND_MINDCONTROLLED` 和 `PARTICLE_MIND_CONTROL`（`StageEventRegistry` 的 `mindControlled`：僵尸在 (60, 40)，植物在中心 (40, 40)）。被魅惑的植物同样染成魅惑色（`client/view/tints.ts` 的 `entityTint`，植物和僵尸共用）。种下就在 `zombies` 阵营的植物没有上色；子弹影子没有镜像。
7. 已完成：`tests/server/teams.test.ts` 覆盖往右走、不被植物攻击、互啃、出右边界消失、存档恢复、两边植物互射、爆炸和大嘴花只打敌对植物、僵尸只啃敌对植物、魅惑（换阵营、速度、存档、放下的植物阵营僵尸不算被魅惑）、白天无效和最后一个僵尸被魅惑时掉落奖励。

种子包也带阵营，含义是“放出来的东西属于哪一方”：植物种子默认 `plants`，僵尸种子默认 `zombies`（`seedTeam`），只有和默认不同时才写进 `seedBank.packets[].team`（随存档保存，快照的 `seedPackets[].team` 和手持的 `cursor.team`）。植物种子的 `zombies` 包种下僵尸阵营的植物，僵尸种子的 `plants` 包放出植物阵营的僵尸；客户端把包里的东西和手持、落点预览画成反向（`PlantPreview` / `ZombiePreview` 的 `setMirrored`）。目前用 `/seed {槽位} {种子名} {team}` 换出。

演示关：`/level pvz:teams-demo`。关卡的 `initialPlants` 可以写 `"team": "zombies"` 预放僵尸阵营的植物。

舞王召唤的伴舞继承舞王的阵营和魅惑标记（原版只复制魅惑标记），伴舞的位置跟着朝向左右翻转；被魅惑的舞王放开原来的伴舞、之后召唤自己一方的，被魅惑的伴舞离开原来的舞王。弹坑的阵营只决定画面朝向：哪一方的植物都不能种在弹坑上，弹坑卡默认属于植物方，毁灭菇留下的弹坑属于毁灭菇那一方。

调试：`/zombie <type> <row> <col> plants` 生成 `plants` 阵营的僵尸，`/plant <type> <row> <col> zombies` 生成 `zombies` 阵营的植物，`/seed <slot> <type> zombies` 换出 `zombies` 阵营的种子包。
