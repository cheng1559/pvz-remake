[English](TEAMS.md)

# 阵营与迷糊菇

每株植物和每只僵尸都属于植物方或僵尸方，不同阵营互为敌对，迷糊菇会把啃咬它的僵尸转入自己的阵营。默认情况下，植物属于植物方，僵尸属于僵尸方，游戏表现与原版完全一致。

## 阵营

### 阵营是什么

- 共有两个阵营：**植物方**（即玩家）和**僵尸方**。
- 每株植物和每只僵尸都属于其中之一。子弹和爆炸属于发射者的阵营，墓碑和弹坑也有阵营。
- 不同阵营的单位互为敌对、互相攻击；同一阵营的单位从不互相伤害。
- 植物默认属于植物方，僵尸默认属于僵尸方。迷糊菇、调试指令、带阵营的种子包和关卡数据可以把它们放到另一方（见[种子包与设定阵营](#种子包与设定阵营)）。

### 朝向与移动

- 僵尸方朝左（朝向房屋），植物方朝右。僵尸方的植物朝左，其攻击范围、爆炸、子弹和保龄球方向随之镜像。
- 僵尸沿朝向行进。僵尸方的僵尸进入房屋则关卡失败，与原版相同。植物方的僵尸向右行进，越过草坪右边缘后无声消失，不掉落任何物品。
- 植物方的撑杆僵尸会向右跳过敌对植物。

### 数据模型

- 两个固定阵营：`plants` 和 `zombies`（`shared/protocol` 中的 `Team`、`TEAMS`）。玩家属于 `plants`。
- 植物和僵尸组件带有 `team`，默认分别为 `plants` 和 `zombies`（`plantTeam`、`zombieTeam`）。只有与默认值不同时才写入该字段；它随存档保存，并通过快照发送给客户端。
- 子弹和爆炸带有发射者的阵营（`projectileTeam`，默认 `plants`）。
- 墓碑默认属于 `zombies`，放在 `plants` 一方时除外（`graveTeam`）；弹坑默认属于 `plants`，标记为 `zombies` 时除外。
- 只有一条敌对规则：不同阵营互为敌对（`isHostile`），所有判定都调用它，不再为被控制的僵尸单独分支。计数类判定使用 `isEnemyZombie`，即 `zombies` 阵营的僵尸。
- 阵营决定朝向（`teamDirection`）：`zombies` 阵营朝左，`plants` 阵营朝右。僵尸沿朝向行进：`zombies` 阵营的僵尸进入房屋则关卡失败，`plants` 阵营的僵尸越过 `x = 850` 后无声消失。僵尸的身体和攻击矩形以 `Zombie::mWidth = 120` 为宽度镜像（`zombieFacingRect`）。植物的攻击范围、爆炸中心、子弹方向和保龄球方向按朝向以 `Plant::mWidth = 80` 为宽度镜像（`plantFacingRect`、`plantFacingX`）。

以上内容都在客户端与服务端共用的 `shared/content/teams.ts` 中。

## 双方的交互

| 场景 | 规则 |
| --- | --- |
| 植物攻击 | 只作用于敌对的僵尸和植物，从不伤害己方。 |
| 子弹击中植物 | 子弹直接扣除植物的生命值，但会越过低矮植物。 |
| 大嘴花 | 可以整株吞下敌对植物。 |
| 土豆地雷 | 对敌对植物的判定向前延伸半格。 |
| 保龄球坚果 | 滚动的坚果撞到敌对植物会对其造成伤害；两颗敌对的滚动坚果相遇时互相撞击。 |
| 僵尸啃食 | 僵尸啃食敌对的僵尸和植物，从不啃食己方植物。 |
| 产阳光的植物 | 僵尸方的向日葵或阳光菇不产生阳光，而是扣除玩家的阳光。 |
| 减速 | 寒冰射手的豌豆只减速敌对阵营，植物也会被减速。 |
| 冰冻 | 冰川菇冰冻场上所有敌对的僵尸和植物，包括屏幕外的。 |
| 小推车 | 小推车属于植物方，启动后碾压僵尸方的僵尸和植物。 |
| 铁铲 | 只能铲除植物方的植物。 |
| 墓碑 | 墓碑召唤的僵尸属于墓碑的阵营。 |
| 弹坑 | 弹坑的阵营只决定它的绘制方向。 |
| 伴舞 | 舞者僵尸召唤的伴舞僵尸属于舞者僵尸的阵营。 |
| 波次与胜负 | 只有僵尸方的僵尸计入波次、关卡完成判定和关卡奖励。 |
| `/plantinvincible` | 植物不受任何伤害（包括敌对攻击和小推车），但仍会被减速和冰冻。 |

### 植物目标、子弹与爆炸

- 植物的目标搜索（射手、大喷菇的范围攻击、大嘴花、土豆地雷、保龄球）、子弹命中和爆炸只作用于敌对阵营的僵尸和植物，从不触及己方。在默认阵营下，植物遇到的都是敌对僵尸，与原版一致（原版植物的攻击会越过被控制的僵尸，`EffectedByDamage`）。
- 命中敌对植物是扩展功能（原版没有僵尸方的植物），规则沿用原版僵尸豌豆（`Projectile::DoImpact`）：无论植物处于什么状态，命中都直接扣除其生命值并闪白 25 逻辑步；生命值归零时按被吃掉处理（`destroyEatenPlant`；爆炸坚果仍会爆炸）。对应事件为 `plantHit`；`projectileImpact` 和 `bowlingImpact` 命中植物时带 `target: 'plant'`。
- 子弹与植物重叠超过 8 时才命中（`FindCollisionTargetPlant`），植物的身体为 `Plant::GetPlantRect`。子弹会越过植物定义中标记为 `low: true` 的低矮植物（小喷菇、阳光菇、土豆地雷，以及原版僵尸豌豆会越过的其他植物），发射子弹的射手也不会以它们为目标，但范围攻击仍可命中。
- 土豆地雷对敌对植物的判定向前延伸半格（`targeting.plantReach: 40`）：触发范围和爆炸对植物的判定都前移 40，因此相邻格的敌对植物会引爆它并被炸毁。已出土的土豆地雷在前方半格内出现敌对植物时自行引爆。它对僵尸的判定和爆炸特效的位置不变。
- 大嘴花可以整株吞下敌对植物。它自身的状态记录 `prey: 'plant'`（随存档保存，通过快照中该植物自己的数据发送，回到就绪状态时清除）；咀嚼和吞咽期间，客户端隐藏其动画中僵尸手臂的两条轨道（表现定义的 `parts.prey`）。僵尸无法啃咬的植物（已点燃的樱桃炸弹、正在出土或已出土的土豆地雷），大嘴花同样咬不到，会咬空。吞下植物时 `chomperBit` 带 `plantId`。
- 爆炸按其伤害扣除敌对植物的生命值；`kills` 只统计僵尸。
- 保龄球坚果撞到植物不计入 `hits`。两颗敌对的滚动坚果相撞时同时结算：各自承受对方的撞击伤害并弹开，爆炸坚果会爆炸，结果与先结算哪一颗无关。
- `/plantinvincible` 同样阻挡这些伤害。

### 僵尸啃食与移动

- 僵尸先寻找前方的敌对僵尸（规则与 `FindZombieTarget` 相同），再寻找敌对植物；僵尸不啃食己方植物。
- 僵尸之间的啃咬穿透盾牌，不闪白（事件 `zombieChewedZombie` 和 `zombieAteZombie`）。
- 僵尸的移动和攻击范围按其阵营方向镜像。`plants` 阵营的撑杆僵尸会向右跳过敌对植物；用种子放在植物所在格子的撑杆僵尸不会反向跳回。

### 波次、关卡完成与关卡奖励

只统计 `zombies` 阵营的僵尸。

### 产阳光的植物

扩展功能：`zombies` 阵营的产出类植物（`server/plants/Producer.ts`；向日葵，以及类型继承自它的阳光菇）不生成物品。每次本应产出时，它从玩家的阳光中扣除其产物的阳光值，最低扣到 0，并发出 `sunDrained`（`entityId`、`sun`）；产金币的植物不产生任何东西。客户端播放蜂鸣音效，阳光计数栏闪红 70 逻辑步，并像产出时一样让该植物发光。

### 减速与冰冻

- **减速**只作用于敌对阵营，并跟随攻击：寒冰射手的豌豆只命中敌对目标。原版的 `CanBeChilled` 写死被控制的僵尸不能被减速，只是因为原版中只有植物会减速。本项目去掉了这条规则，因此敌方寒冰射手的豌豆可以减速 `plants` 阵营的僵尸。
- 同时被迷糊菇控制且被减速或冰冻的僵尸和植物（原版不会出现，因为被控制的僵尸不能被冰冻）取两种颜色的平均值 (102, 70, 224)，使两种状态都能看出（`client/view/tints.ts` 的 `entityTint`），掉落的部件也一样。
- **被减速的植物**（扩展功能；原版的植物从不被减速）：敌对寒冰射手的豌豆命中植物时，按减速僵尸的时长减速它，与已有减速取较长者。期间植物每两个逻辑步跳过一个（`plantSkipsTick`），因此射击、蓄力、产阳光、能力计时（引信、土豆地雷出土、大嘴花消化等）、眨眼倒计时和保龄球都减半。它的动画与被减速僵尸的身体一样，由服务端每个逻辑步按一半速率推进（`plantPace`、`CHILLED_ANIMATION_FACTOR`）；快照携带减半后的速率，客户端照此播放。首次被减速时播放减速音效（`FOLEY_FROZEN`，与 `Zombie::ApplyChill` 相同）。客户端沿用被减速僵尸的同一路径把它染成蓝色（`ReanimPlayer.setTint`、`plants/chill.ts`、`plantChilled` 事件、存档字段 `chilledTicks`）。`/plantinvincible` 只阻挡伤害，不阻挡减速。
- **能否被减速或冰冻**由类型决定（`server/combat/cold.ts`，植物和僵尸共用一套规则）：
  - 定义中的 `unchillable` 表示不会被减速，因此也不会被冰冻，寒冰射手的减速对它无效（火炬树桩；原版的雪橇车僵尸、拉雪橇的雪橇车僵尸小队等）；
  - `unfreezable` 表示不会被冰冻，只会被减速，也不承受冰冻的 20 点伤害（原版的 `HitIceTrap` 先减速，`CanBeFrozen` 为 false 时返回）；
  - 植物定义中这两个字段只能写 `true`，表示始终如此；植物只在某些时候免疫减速或冰冻时，由其类型决定（`Plant.keptFromCold`、`Plant.keptFromIce`：正在出土的土豆地雷）；
  - 僵尸定义中可以写 `true` 或僵尸状态列表（`[states…]`），只在这些状态下免疫；
  - 基础游戏中 `unfreezable` 的有樱桃炸弹、冰川菇、末日菇、两种保龄球坚果、咬咬碑、正在出土的土豆地雷（`rising`）和空中的撑杆僵尸（`airborne`）。窝瓜、三叶草和火爆辣椒实现后，锁定目标之后也同样如此，火炬树桩则为 `unchillable`；
  - 正在死亡、焦黑、被压扁或正从墓碑中爬出的僵尸，以及已被摧毁的植物，无论类型如何都不会被减速或冰冻。
- **冰川菇**冰冻所有与它敌对的僵尸和植物（`server/combat/freeze.ts` 的 `freezeHostiles`）。原版的冰冻放过被控制的僵尸（`CanBeChilled`），而它们恰好是原版中唯一与冰川菇同阵营的僵尸；本项目放过的是冰川菇自己的阵营。`zombies` 阵营的冰川菇会冰冻 `plants` 阵营的僵尸，以及 `plants` 阵营的植物（扩展功能；原版不冰冻植物）：
  - 植物与僵尸一样减速 2000 逻辑步，冰冻 400–600 逻辑步（已被减速或冰冻时为 300–400），并受到 20 点伤害（`damagePlant`，带闪白）；
  - 冰冻期间植物跳过每一个逻辑步（`plantSkipsTick`），因此射击、产阳光、能力计时和眨眼全部暂停；动画静止（`plantPace` 为 0），植物身上的粒子也停在原处（咬咬碑的啃咬，`ParticlePlayer.setPaused`），樱桃炸弹停止抖动；植物仍可被啃食和击中；
  - 冰块按植物的默认位置绘制在格子中央，上边缘与植物影子的上边缘对齐（表现定义的 `iceTrap.plant`，(13, 51)），与僵尸的冰块上边缘对齐其影子的 92 相同；植物比同一行的僵尸站得更高，影子在 51。碎冰粒子在 (40, 65) 处放出，随植物左右镜像；
  - 植物在冰冻中被摧毁时（`destroyEatenPlant`）冰块碎裂；被小推车碾压时冰块直接移除；
  - 场地为被冰冻的阵营记录 300 逻辑步（`LevelState.iceTrap`）；
  - 存档字段：`frozenTicks`（植物和僵尸）、`level.iceTrap`。

### 小推车

每行的小推车属于 `plants` 阵营。只有仍有头部的 `zombies` 阵营僵尸才会触发它（`server/mowers/mowers.ts`）。启动后的小推车（`MowingProjectile`）不碾压 `plants` 阵营的僵尸（原版的 `EffectedByDamage(127)`，与植物攻击相同）。它也会碾压敌对植物：植物立即退出战斗（`mowered`），像被碾压的僵尸一样被压扁，朝小推车行进的方向倾倒，并发出 `plantMowered`；爆炸坚果不会爆炸，`/plantinvincible` 可以保护植物不被碾压。

### 铁铲

铁铲只能铲除 `plants` 阵营的植物（`shared/content/planting.ts` 的 `canShovel`）；`zombies` 阵营的植物不会高亮，也不能被铲除，与咬咬碑不能被铲除相同。

### 墓碑、弹坑与伴舞

- 墓碑召唤的僵尸属于墓碑自己的阵营（`raiseZombieFromGrave`）。种在墓碑上的植物（咬咬碑）需要敌对阵营的墓碑；己方阵营的墓碑会拒绝种植（`cell-has-own-grave`）。只有 `plants` 阵营的咬咬碑会掉落墓碑的物品。
- 弹坑的阵营只决定它的绘制方向（`CraterView`）。任何阵营的植物都不能种在弹坑上（`Board::CanPlantAt`）。弹坑卡默认属于植物方，末日菇留下的弹坑属于该末日菇的阵营。
- 舞者僵尸召唤的伴舞继承它的阵营和被控制标记（原版只复制被控制标记），站位随它的朝向左右翻转。被控制的舞者僵尸放弃原来的伴舞，之后召唤己方阵营的伴舞；被控制的伴舞僵尸离开原来的舞者僵尸（`Zombie.changedSides`、`server/zombies/Dancer.ts`）。

## 迷糊菇

- 敌对僵尸啃食清醒的迷糊菇时，迷糊菇在这一口时消失，该僵尸立即转入迷糊菇的阵营。这一口不造成伤害。僵尸变为紫色，并播放原版的音效和粒子。
- 白天睡着的迷糊菇没有作用，会像普通植物一样被吃掉。
- 敌对的大嘴花咬到清醒的迷糊菇时同样会倒戈并变为紫色；它不会吞下迷糊菇，这一口按咬空处理。原版中植物不会吃植物，因此这是本项目的扩展。大嘴花咬到睡着的迷糊菇时则直接吃掉。
- 被迷糊菇控制的僵尸以其种类的正常速度行进。
- 若倒戈的僵尸是场上最后一只敌对僵尸，关卡奖励随即从它身上掉落。
- 被迷糊菇控制的僵尸啃咬敌对僵尸时使用轻柔的啃咬音效，对方倒下时播放吞咽音效。
- 被迷糊菇控制的舞者僵尸会放弃原来的伴舞，之后召唤新阵营的伴舞；被迷糊菇控制的伴舞僵尸会离开原来的舞者僵尸。让舞者僵尸被迷糊菇控制可获得成就舞者精神（见[成就](ACHIEVEMENTS.zh-CN.md)）。
- 只有被迷糊菇控制的单位显示为紫色。通过其他方式放到另一阵营的单位保持原色，只改变朝向。

### 原版行为

原版只在僵尸身上用一个“被控制”标记 `mMindControlled` 区分为玩家作战的僵尸，并在二十多个函数中分别判断。这部分行为在 1073 和 1096 中相同，只是 1096 新增了舞者精神成就（见[成就](ACHIEVEMENTS.zh-CN.md)）。

#### 迷糊菇被啃咬（`Zombie::AnimateChewSound`）

僵尸啃咬时（在啃咬动画的音效帧上），若被咬的是清醒的迷糊菇（`!mIsAsleep`；白天睡着时没有作用）：

1. 播放 `FOLEY_FLOOP`，迷糊菇死亡（`Plant::Die`）。
2. `StartMindControlled` 播放 `SOUND_MINDCONTROLLED` 并设置 `mMindControlled = true`。舞者僵尸清空它的伴舞，伴舞僵尸离开它的舞者僵尸，其他僵尸则放开与之关联的僵尸（雪橇车僵尸小队等）。
3. 在僵尸上方一层（`mRenderOrder + 1`）的 `(mPosX + 60, mPosY + 40)` 处放出 `PARTICLE_MIND_CONTROL`。
4. `TrySpawnLevelAward`：若它是场上最后一只敌对僵尸，关卡奖励从它身上掉落。
5. 设置速度 `mVelX = 0.17` 和动画 `mAnimTicksPerFrame = 18`。但此时僵尸正在啃食，下一次找不到可吃的目标时会经过 `StopEating` → `StartWalkAnim` → `PickRandomSpeed`，重新按其僵尸类型随机速度，与每只僵尸停止啃食、继续前进时一样。因此 0.17 实际上不起作用，被控制的僵尸以其种类的正常速度向右行进。

被控制的僵尸啃咬僵尸时使用 `FOLEY_CHOMP_SOFT`。

#### 被控制之后

| 原版函数 | 行为 |
| --- | --- |
| `IsWalkingBackwards` | 向右行进（`mPosX += speed`），镜像绘制 |
| `GetZombieAttackRect` | 攻击范围向右镜像：`x = mWidth − x − width` |
| `UpdateEating` | 每次啃咬先寻找敌对僵尸（`FindZombieTarget`），有则啃咬；被控制的僵尸不啃食植物 |
| `FindZombieTarget` | 同一行、不同阵营、未死亡、不在空中或地下，且与攻击范围重叠 ≥ 20（对方正在啃食时 ≥ 0） |
| `EatZombie` | 对方受到 `TakeDamage(DAMAGE_PER_EAT, 9)`，自己开始啃食；对方身体生命值归零时播放 `SOUND_GULP` |
| `EffectedByDamage` | 植物的伤害（子弹、爆炸、啃咬）不作用于被控制的僵尸；只有带 `DAMAGES_ONLY_MINDCONTROLLED` 的攻击才会（基础游戏中暂无） |
| `CanBeChilled` | 不能被减速（本项目改为减速跟随敌对攻击，见[减速与冰冻](#减速与冰冻)） |
| `CheckForBoardEdge` | 向右越过 `x = 850` 后无声消失（`DieNoLoot`） |
| `DrawReanim`、`DrawZombiePart` | 先乘以颜色 `(128, 64, 192)`，再叠加同一颜色（`ZOMBIE_MINDCONTROLLED_COLOR`） |
| `OverrideParticleColor` | 掉落的头、手臂等粒子以同样方式着色和叠加 |
| `AreEnemyZombiesOnScreen`、`CountZombiesOnScreen`、`TotalZombiesHealthInWave` | 不计入：不影响关卡完成判定和波次的生命值阈值 |
| 小推车 | 不碾压被控制的僵尸（`EffectedByDamage(127)`） |

其他分支只涉及特殊僵尸或植物（巨人僵尸、雪人僵尸、梯子、窝瓜僵尸和火爆辣椒僵尸、磁力菇等），待相关内容实现后再接入阵营。

### 迷糊菇控制

- 迷糊菇是一种植物类型 `hypnoshroom`（`server/plants/HypnoShroom.ts`），由植物定义的 `kind` 选择，并接收定义中的 `mindControl: true`；不按植物 ID 判断。`Plant.mindControls(world)` 表示该植物此刻是否能控制对方：迷糊菇在清醒时能。
- 敌对僵尸在迷糊菇清醒时啃咬它（在啃咬动画的音效帧上，`Zombie::AnimateChewSound`），这一口不算啃咬，植物立即消失（生命值清零，同一逻辑步内其他僵尸不会再咬到它），咬它的僵尸转入植物的阵营。
- 扩展功能（原版的植物不吃植物）：植物咬到清醒的敌对迷糊菇时（大嘴花，在 `server/plants/Chomper.ts` 中吞下植物的位置），咬它的植物同样转入迷糊菇的阵营。这一口不算吞下：按咬空（`missed`）绘制，之后回到 `ready`，既不咀嚼也不消化（`chomperBit` 的 `ate` 为 false）。白天睡着的迷糊菇照常被吃掉。
- 僵尸和植物都经过同一个 `mindControl`（`server/zombies/mindControl.ts`）。
- 转换阵营时：
  - 速度不变；僵尸停止啃食、继续前进时重新随机速度，与每只僵尸相同（`Zombie.pickSpeed`，即 `PickRandomSpeed`）；
  - 僵尸或植物记录 `mindControlled`（随存档保存，并通过快照发送给客户端）。只有被控制的单位会着色，种植或放置在另一阵营的单位不算；
  - 通过 `Zombie.changedSides` 通知僵尸（舞者僵尸离开它的伴舞队伍）；
  - 发出 `mindControlled` 事件（`entityId`、`plantId`、`typeId`、`team`）；
  - 若被控制的僵尸是最后一只敌对僵尸，关卡奖励从它身上掉落（`tryDropLevelAward`）。
- 舞者精神成就通过 `pvz:mind-controlled` 触发类型观察 `mindControlled`，设置为舞者僵尸（`zombies: ["pvz:dancer"]`）。所列类型的僵尸转入 `plants` 阵营时获得；吞下迷糊菇的植物，或转入 `zombies` 阵营的僵尸都不算。

## 种子包与设定阵营

种子包也带阵营，表示“它放下的东西属于哪一方”。

- 本项目新增了僵尸卡、墓碑卡和弹坑卡，可以像植物一样放入卡槽。它们是隐藏卡片：开启 `/cheatseed` 后出现在选卡界面中，也可以用 `/seed` 放入卡槽，如 `/seed 1 normal`。僵尸卡可以把僵尸放进有效行的任意格子；墓碑卡和弹坑卡可以放进有效行中没有墓碑或弹坑的任意格子，格内的植物随之死亡。
- 植物卡和弹坑卡默认属于 `plants`，僵尸卡和墓碑卡默认属于 `zombies`（`seedTeam`）。只有与默认值不同的阵营才会写入（`packetTeam`）：`seedBank.packets[].team`（随存档保存）、快照的 `seedPackets[].team` 和 `conveyorPackets[].team`，以及手持的 `cursor.team`。
- 植物卡的 `zombies` 种子包种下僵尸方的植物，僵尸卡的 `plants` 种子包放下植物方的僵尸。客户端在种子包中、手持时和种植预览中都把内容反向绘制（`PlantPreview` / `ZombiePreview` 的 `setMirrored`）。
- 僵尸方种子包种下的植物照常消耗阳光、进入冷却并遵守种植规则，但不能被铁铲铲除。
- 用 `/seed {卡槽} {种子} {阵营}` 换入另一阵营的种子包，如 `/seed 1 snowpea zombies`，传送带关卡同样适用。开启 `/cheatseed` 后，选卡界面的分页先列出植物方的全部种子，再列出僵尸方的同一批种子（`shared/content/chooserPages.ts`）。模组可以通过 `seedChooser.entries`（`server/seeds/seedChooser.ts`）提供任一阵营的更多卡片。

除了种子包，以下方式也可以设定阵营：

- **迷糊菇**，见[上文](#迷糊菇)。
- **带阵营参数的调试指令**：
  - `/plant {植物} {行} {列} zombies` 种下僵尸方的植物，如 `/plant peashooter 3 9 zombies`；
  - `/zombie {僵尸} [行] [列] plants` 放置植物方的僵尸，如 `/zombie normal 3 1 plants`；
  - `/griditem grave {行} {列} plants` 放置召唤植物方僵尸的墓碑，`/griditem crater {行} {列} zombies` 放置反向绘制的弹坑。
- **关卡数据**：关卡的 `initialPlants` 可以写 `"team": "zombies"`，预置僵尸方的植物。

完整指令见[调试指令](DEBUG_CLI.zh-CN.md)。

## 表现

- **朝右的僵尸。** `plants` 阵营的僵尸按原版 `Zombie::UpdateReanim` 的方式镜像：无论动画片段的偏移如何，身体先右移 90 再翻转，因此原版中朝右的僵尸（被控制的僵尸，以及之后的矿工僵尸、雪人僵尸等）都与原版的样子一致。
- **朝右放下。** 原版没有朝右放下僵尸的情况，本项目单独修正，使其与其他僵尸对齐：僵尸玩法定义的 `facingRightOffsetX` 让它放下时向右多站一段距离，手持的僵尸和格子预览也移动同样的距离。被控制的僵尸保持原位。
  - 撑杆僵尸的数值来自原版数据：其 `GetDrawPos` 水平方向为 −6，种子包 x 比普通僵尸靠左 5 像素（−8 对 −3，缩放 0.35，即在自身坐标中身体靠右 14.29）。放下时它向右多站 6 + 14.29 = 20.29。
  - 橄榄球僵尸的种子包缩放（0.33）与普通僵尸（0.35）不同，因此改为把两者的身体对齐到种子包的中线（宽 50 中的 x = 25）来计算。它的 `GetDrawPos` 只向上移动，种子包 x 为 −7，在自身坐标中身体比普通僵尸靠右 (25 + 7) / 0.33 − (25 + 3) / 0.35 = 16.97，因此放下时向右多站 16.97。在相同缩放下，这种算法与撑杆僵尸的结果一致。
- **种子包。** 僵尸种子包的插图朝左绘制；属于另一阵营时，整幅插图连同倾斜和裁剪绕种子包中线翻转，与植物和墓碑的种子包相同（`client/hud/packetPicture.ts` 的 `mirrorInPacket`）。只有在手持和格子预览中，身体本身才会翻转并应用 `facingRightOffsetX`（`ZombiePreview`）。
- **影子与掉落部件。** 影子使用表现定义的 `shadow.backwardsX`。掉落的头、手臂、旗子和防具粒子，以及烧焦后的僵尸，也翻转为朝右。原版对被控制的僵尸只镜像位置、不翻转粒子，本项目将其作为缺陷修正。啃食坚果时掉落的碎屑同样翻转。
- **被控制的外观**随迷糊菇而来：乘以并叠加颜色 `(128, 64, 192)`（`ReanimPlayer.setTint`），掉落的头、手臂、旗子和头盔同样着色，啃咬僵尸时使用轻柔的啃咬音效；原版以 `mMindControlled` 决定这些表现。被控制的植物也着同样的颜色（`entityTint`，植物和僵尸共用）。通过种子包或 `/zombie ... plants` 放下的 `plants` 阵营僵尸，以及一开始就种在 `zombies` 阵营的植物，都不算被控制，不会着色；这样的僵尸看起来与普通僵尸相同，只是朝右。
- **音效与粒子。** 阵营转换事件播放 `FOLEY_FLOOP`、`SOUND_MINDCONTROLLED`，并在转换对象上方一层放出 `PARTICLE_MIND_CONTROL`（`StageEventRegistry` 的 `mindControlled`：僵尸在 (60, 40)，植物在其中心 (40, 40)）。被控制的僵尸啃咬僵尸时使用轻柔的啃咬音效，对方倒下时播放吞咽音效。
- **`zombies` 阵营的植物**及其子弹镜像绘制；`zombies` 阵营子弹的影子随之镜像（`ProjectileView`）。被敌对子弹击中的植物闪白。

## 阵营演示关与调试

`/level pvz:teams-demo` 进入一个使用白天草坪的临时关卡。它不覆盖冒险存档、不能存档、不授予成就，结束后回到主菜单。

- 每行左侧两列是玩家的一株向日葵和一株射手（豌豆射手、双重射手和寒冰射手）。
- 最右侧三列预置 9 株朝左的僵尸方植物：三株豌豆射手、一株双重射手、一株寒冰射手、一颗坚果、一株大嘴花、一颗土豆地雷和一颗爆炸坚果。
- 玩家初始有 1000 阳光和固定的 8 张卡片：豌豆射手、双重射手、寒冰射手、坚果、樱桃炸弹、大嘴花、土豆地雷和向日葵。
- 4 波普通僵尸、路障僵尸和铁桶僵尸从右侧穿过僵尸方的植物进攻，第 4 波是旗帜波。

其他与阵营有关的调试指令：

- `/zombie {僵尸} [行] [列] plants` 生成 `plants` 阵营的僵尸。
- `/plant {植物} {行} {列} zombies` 生成 `zombies` 阵营的植物。
- `/seed {卡槽} {种子} zombies` 换入 `zombies` 阵营的种子包（僵尸卡用 `plants` 表示植物方）。
- `/griditem {grave|crater} {行} {列} [阵营]` 放置指定阵营的墓碑或弹坑。

详见[调试指令](DEBUG_CLI.zh-CN.md)。

## 实现与测试

| 方面 | 代码 |
| --- | --- |
| 阵营数据、`isHostile`、朝向与镜像工具 | `shared/content/teams.ts` |
| 迷糊菇控制 | `server/zombies/mindControl.ts`、`server/plants/HypnoShroom.ts`、`server/plants/Chomper.ts` |
| 僵尸啃食与移动 | `server/zombies/system.ts`、`server/zombies/Dancer.ts` |
| 减速与冰冻 | `server/combat/cold.ts`、`server/plants/chill.ts`、`server/combat/freeze.ts` |
| 爆炸 | `server/combat/explosions.ts`、`server/plants/damage.ts` |
| 种植规则与铁铲 | `shared/content/planting.ts`、`server/seeds/planting.ts` |
| 选卡界面 | `server/seeds/seedChooser.ts`、`shared/content/chooserPages.ts` |
| 小推车 | `server/mowers/mowers.ts`、`server/projectiles/MowingProjectile.ts` |
| 产出类植物 | `server/plants/Producer.ts` |
| 着色、场景事件、预览 | `client/view/tints.ts`、`client/level/StageEventRegistry.ts`、`client/hud/ZombiePreview.ts`、`client/hud/PlantPreview.ts` |

`tests/server/teams.test.ts` 覆盖：

- `plants` 阵营的僵尸向右行进、不受植物攻击并离开草坪；
- 两个阵营的僵尸隔着盾牌互相啃咬，阵营在存档后保持；
- 两个阵营的植物互相射击，僵尸方向左开火；子弹消灭敌对植物；豌豆越过低矮植物，前方只有低矮植物时射手不开火；
- 爆炸和大嘴花只消灭敌对植物，大嘴花记住它正在咀嚼的植物；
- 僵尸只啃食敌对植物；
- 阵营演示关放置两个阵营的植物并互相战斗；
- 敌对寒冰射手减速植物（行为减半、动画半速、减速只报告一次）和 `plants` 阵营的僵尸；
- 土豆地雷对敌对植物的延伸范围、两颗敌对保龄球坚果相遇、铁铲拒绝 `zombies` 阵营的植物；
- `/seed` 换入的 `zombies` 阵营种子包在存档后保持、僵尸卡及其放置、每种僵尸都有种子、`facingRightOffsetX`；
- 朝右的撑杆僵尸向右跳跃，烧焦的 `plants` 阵营僵尸朝右碎裂；
- 敌方向日葵扣除阳光；
- 迷糊菇控制：阵营转换、着色与速度、存档、放下的 `plants` 阵营僵尸不算被控制、白天无效、最后一只僵尸被控制时掉落奖励，以及大嘴花被清醒的迷糊菇转换或吃掉睡着的迷糊菇。
