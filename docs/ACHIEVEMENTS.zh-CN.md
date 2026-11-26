[English](ACHIEVEMENTS.md)

# 成就

本项目还原《植物大战僵尸》年度版 Steam 1.2.0.1096 版本的 21 个成就。

## 基本规则

- 成就属于玩家档案。每个成就在同一档案中只能获得一次，不会重复授予；关卡存档不保存成就。
- 成就分两种显示方式：**关卡内提示**和**奖励页面列出**。
  - *关卡内提示*：条件达成的一刻，草坪底部的提示栏显示获得成就的消息，并播放成就音效。消息在正常速度下停留 2.5 秒（250 逻辑步），没有淡入淡出。如果屏幕上正显示“一大波”提示，成就消息会等它离开后再显示。
  - *奖励页面列出*：在关卡胜利时判定的成就（种植类成就）不在关卡内提示。关卡结束后，奖励页面先列出所有已获得但尚未显示过的成就，点击**继续**后再显示本关的奖励。
- 关卡胜利不会清除提示栏，因此在奖励掉落后收集阳光或金币而获得的成就，仍会在关卡淡出时正常提示。
- 主菜单进入的成就页面显示全部成就，已获得的完整显示，未获得的半透明显示。成就页面只看成就是否已获得，不看是否已显示过。
- 测试关卡 `pvz:stress-test`、`pvz:teams-demo`、`pvz:sandbox-day` 和 `pvz:sandbox-night` 不授予任何成就。

## 成就一览

“显示”一列说明成就在哪里提示；“本项目”一列说明本项目目前能否获得该成就：多数条件依赖尚未实现的内容（冒险模式 2-10 之后的关卡、迷你游戏、益智模式、生存模式、商店植物和休闲花园）。

| # | 成就 | 条件 | 显示 | 本项目 |
| --- | --- | --- | --- | --- |
| 0 | 庭院无忧 | 通关冒险模式（冒险模式第 50 关，即 5-10）。冒险模式通关后关卡编号回到 1 时，冒险模式的奖励页面也会补发此成就。 | 奖励页面 | 尚未实现 |
| 1 | 葵花宝典 | 获得黄金向日葵奖杯：通关冒险模式，并获得全部 48 个奖杯（生存模式 10 个、迷你游戏 20 个、益智模式 18 个）。在打开非冒险模式的奖励页面时判定。 | 下一个奖励页面 | 尚未实现 |
| 2 | 头脑风暴 | 在僵尸公敌（无限）中，以恰好 10 的连胜开始下一轮。 | 关卡内 | 尚未实现 |
| 3 | 瓷器太厚 | 在花瓶终结者（无限）中，以恰好 15 的连胜摆放花瓶。 | 关卡内 | 尚未实现 |
| 4 | 土豆泥 | 土豆地雷的爆炸至少消灭 1 只僵尸。已在死亡过程中的僵尸不计。 | 关卡内 | 已实现 |
| 5 | 火爆兄弟 | 一颗樱桃炸弹的一次爆炸消灭至少 10 只僵尸。任何种类都计入，包括小鬼僵尸和飞贼僵尸；爆炸时已在死亡过程中的僵尸也计入。末日菇和火爆辣椒不授予此成就。 | 关卡内 | 已实现 |
| 6 | 植物猎人 | 拥有商店出售的全部 9 种植物（机枪射手到变身茄子）。不检查 40 种基础植物。在商店购买植物时判定。 | 下一个奖励页面 | 尚未实现 |
| 7 | 豌豆先生的假期 | 在白天泳池通关一关，期间不种植豌豆射手、寒冰射手、双重射手、三重射手、双向射手或机枪射手。 | 奖励页面 | 尚未实现 |
| 8 | 五颗星 | 在坚果保龄球中，同一颗普通坚果第 5 次撞击僵尸（撞到防具也算；爆炸坚果和巨型坚果不计）。首周目冒险第 10 关及之前（即 1-5）不计撞击次数。 | 关卡内 | 已接入，目前无法获得（见下文） |
| 9 | 空中管制 | 在屋顶（白天或夜晚）通关一关，期间不种植卷心菜投手、玉米投手、西瓜投手或冰西瓜（可以种玉米加农炮）。传送带关卡不计。 | 奖励页面 | 尚未实现 |
| 10 | 僵尸学家 | 在冒险模式 4-10 中，某一波生成了雪人僵尸。不需要看到或消灭它。 | 关卡内 | 尚未实现 |
| 11 | 铁公鸡 | 在一关中连续收集 30 枚银币或金币。钻石和阳光不计。只有未被收集、自行消失的银币或金币会让计数归零；被磁力菇吸走的金币既不增加计数，也不让计数归零。计数恰好达到 30 时授予。 | 关卡内 | 已实现 |
| 12 | 阳光满屋 | 同时持有至少 8000 阳光，在阳光增加时判定（阳光上限为 9990）。与本关累计收集的阳光无关。 | 关卡内 | 已实现 |
| 13 | 爆米花派对 | 在一关中用玉米加农炮消灭 2 只巨人僵尸（普通或红眼）；多次发射的结果累计。 | 关卡内 | 尚未实现 |
| 14 | 全日无休 | 在白天场景（白天、白天泳池、白天屋顶、休闲花园（温室）、智慧树）通关一关，期间只种植蘑菇和咖啡豆；什么都不种也算。种植任何其他植物都会失去资格，包括咬咬碑、莲叶、花盆和南瓜头。 | 奖励页面 | 已实现（白天关卡） |
| 15 | 无菇之夜 | 在夜晚场景（黑夜、浓雾、夜晚屋顶、蘑菇园、水族馆）通关一关，期间不种植蘑菇（咬咬碑和咖啡豆不算蘑菇）。僵尸公敌关卡不计。 | 奖励页面 | 已实现（黑夜关卡） |
| 16 | 狂热死忠 | 通关前 20 个迷你游戏中的每一个。 | 奖励页面 | 尚未实现 |
| 17 | 无懈可击 | 在生存模式的无限关卡中完成 20 面旗帜：在第 11 轮开始、选完种子之后授予。 | 关卡内 | 尚未实现 |
| 18 | 天天向上 | 智慧树生长后恰好为 100 英尺。 | 关卡内 | 尚未实现 |
| 19 | 大胡子模式 | 输入 `mustache` 或 `moustache`。在关卡中输入会开启或关闭大胡子模式，两种情况都授予；在主菜单输入也会授予。 | 关卡内；主菜单输入时为下一个奖励页面 | 尚未实现 |
| 20 | 舞者精神 | 让舞者僵尸（不是伴舞僵尸）被迷糊菇控制。唯一的途径是舞者僵尸啃食清醒的迷糊菇。 | 关卡内 | 已实现 |

补充说明：

- 全日无休、无菇之夜、豌豆先生的假期和空中管制只在冒险模式、益智模式和生存模式的关卡中判定。打僵尸、花瓶终结者和坚果保龄球关卡（包括冒险模式 2-5、4-5 和 1-5）以及其他迷你游戏都不计。
- 种植类成就只统计玩家种下的植物：从卡片槽或传送带种下的植物；原版中还包括种子雨等道具种子、变身茄子变成的植物（按其模仿的植物计算）、僵尸迷阵的升级、排山倒海，以及铁铲（Shovel）与松鼠两个迷你游戏预先放置的坚果。关卡开始时预置的植物、过场动画放置的植物、僵尸公敌的初始植物以及 `/plant` 创建的植物都不计。
- 五颗星：目前唯一的坚果保龄球关卡是冒险模式 1-5，而冒险模式尚不能通关，每次游玩都属于首周目，因此撞击次数不计。
- 游戏内的成就描述与实际条件不完全一致：五颗星统计的是撞击次数，僵尸学家只要求雪人僵尸出现，植物猎人只检查商店的 9 种植物，阳光满屋要求的是某一时刻持有的阳光。

## 实现

### 流程

1. **定义。** 玩法定义的 `achievements` 表（`mods/pvz-base/gameplay/definitions/achievements.json`）把 `pvz:sunny-days` 等 ID 映射到 `{ titleKey, descriptionKey, icon: { sprite, index }, trigger? }`。基础内容包按原版的 id 顺序列出 21 个成就，图标的 `index` 就是该 id（见[定义](#定义)）。模组可以新增成就，也可以按 ID 修改已有成就（见[模组](MODS.zh-CN.md)）；成就页面和奖励页面先列基础游戏的成就，再依次列各模组的成就。
2. **判定。** 玩法代码只发出服务端事件，从不调用成就模块。会话把成就模块设为事件队列的观察者（`EventQueue.observer`，在 `server/session/session.ts` 中设置），因此 `observeAchievements` 会在每个事件发出时看到它（`achievementEarned` 本身除外）。对玩家尚未获得的每个成就，由其 `trigger.kind` 指定的触发类型判定该事件；判定时机与原版调用 `GiveAchievement` 的位置一致。
3. **授予。** `grantAchievement(world, id, announce)`（`server/achievements/achievements.ts`）遇到未知 ID 时抛出错误；玩家已拥有该成就或关卡定义为 `achievements: false` 时返回 false；否则加入已获得集合并发出 `achievementEarned`（`id`、`titleKey`、`announce`）。已获得集合来自玩家档案，随开始数据包下发（`startSession.earnedAchievements`，在 `IntegratedGameServer.start` 中写入）；存档不保存它，因此读取存档时仍以数据包为准。
4. **写入玩家档案。** 收到 `achievementEarned` 后，客户端（`LevelView.onAchievementEarned`，仅在存在玩家档案时由 `app/LevelController.ts` 接上）调用菜单 API `earnAchievement(id, shown)`，`shown` 即 `announce`。`MenuService` 把 ID 加入档案的 `earnedAchievements`，已提示的同时加入 `shownAchievements`，然后保存档案（`server/menu/profileStore.ts`）。
5. **关卡内显示。** 对需要提示的成就，`LevelHudPresenter` 以 `AdviceWidget` 的 `achievement` 样式显示 `[ACHIEVEMENT_ACHIEVED]`（其中 `{ACHIEVEMENT}` 替换为成就名称），`LevelAudioPresenter` 播放成就音效。该样式采用原版的 250 逻辑步、位置和闪烁颜色。“一大波”提示显示期间收到的消息会像原版一样等待（`AdviceWidget.show` 把它保存为下一条消息，即原版的 `mLabelNext`，并把“一大波”提示的剩余时间缩短到不超过其滑出时间 + 101 逻辑步）；等待中的消息随关卡存档保存。关卡失败时立即清除提示栏；胜利时不清除（`Board::FadeOutLevel`），因此淡出期间获得的成就仍会显示。
6. **奖励页面。** 完成关卡时，菜单 API `completeLevel` 按定义顺序取出所有已获得但尚未显示的成就（不只是本关的），标记为已显示并保存档案；奖励视图携带这些成就。随后 `MenuScreen` 在奖励页面上方显示 `AwardAchievements`（`client/screens/AwardAchievements.ts`），奖励页面的控件暂时禁用，点击**继续**后恢复为正常奖励。临时关卡（`persistent: false`：压力测试关和阵营演示关）不调用 `completeLevel`，直接回到主菜单。
7. **成就页面。** `AchievementScreen` 通过 `getAchievements()` 读取定义和档案中已获得的 ID（见 [UI](UI.zh-CN.md)）。

关卡定义的 `achievements: false` 使该关卡不授予任何成就，包括 `/achievement give`。原版没有这样的关卡；它用于调试关卡，如[基本规则](#基本规则)中列出的测试关卡。

### 触发类型

每个触发条件都以 `trigger: { kind, ...settings }` 的形式写在 `achievements.json` 中。`kind` 是在 `server/achievements/triggers.ts` 中通过 `AchievementTriggerRegistry`（`GameplayRegistry.achievementTriggers`）注册的触发类型；模组可以用 `registry.achievementTriggers.register(ownerId, kind, { validate, observe })` 注册新类型。加载内容时会校验每个触发条件的设置及其引用的 ID：`kind` 未安装、植物、物品、僵尸或场地 ID 不存在，或计数不是正整数，内容都会加载失败。每个成就在一关之内的判定状态（`progress`，每个成就一个 JSON 对象）随关卡存档保存为 `achievementProgress`。

| 触发类型 | 判定的事件 | 设置 | 成就 |
| --- | --- | --- | --- |
| `pvz:blast` | `plantExploded` 的 `typeId` 和 `kills`。`kills` 是 `explode`（`server/combat/explosions.ts`）的返回值，即本项目的 `KillAllZombiesInRadius` 计数：被烧焦的僵尸，以及爆炸后已死亡、正在倒下或被小推车碾压的僵尸。 | `plants`、`kills` | 土豆泥（`pvz:potatomine`，1）、火爆兄弟（`pvz:cherrybomb`，10） |
| `pvz:bowling` | `bowlingImpact` 的 `plantTypeId` 和 `hits`：坚果自身对僵尸的撞击计数（`BowlingNut.ts`），首周目冒险第 10 关及之前不增加，撞到植物也不增加 | `plants`、`hits` | 五颗星（`pvz:bowling-wallnut`，普通坚果，5） |
| `pvz:coin-streak` | 统计所列物品的 `itemScored`（物品到达计数栏，`Coin::ScoreCoin`）；这些物品的 `itemExpired`（自行消失）让计数归零；计数恰好等于设定值时授予 | `items`、`coins` | 铁公鸡（`pvz:coin_silver`、`pvz:coin_gold`，30） |
| `pvz:sun-held` | `sunAdded`：`Board::AddSun` 之后持有的阳光 | `sun` | 阳光满屋（8000） |
| `pvz:mind-controlled` | `mindControlled`（`Zombie::StartMindControlled`）：所列类型的僵尸转入 `plants` 阵营。吞下迷糊菇的植物，或转入 `zombies` 阵营的僵尸都不算 | `zombies` | 舞者精神（`pvz:dancer`；伴舞僵尸是另一种类型） |
| `pvz:win-planting` | 不带 `debug` 的 `plantPlaced` 事件记录是否种过不符合条件的植物（`progress.broken`）；收到 `levelWon` 时，若条件未被破坏、关卡的场景在 `boards` 中、所在时段在 `times` 中（不写即不限）且关卡规则未被跳过，则授予，不在关卡内提示 | `boards` 和/或 `times`、`skipRules`，以及 `only` 和/或 `never`，各为 `{ nocturnal, plants }` | 全日无休（`day`，`only` 夜行植物）、无菇之夜（`night`，`never` 夜行植物）；两者都跳过 `pvz:bowling` 和 `pvz:whack-a-zombie` |

触发条件读取的事件细节：

- `{ nocturnal, plants }` 选择器在 `nocturnal` 为 true 时匹配定义中带 `nocturnal: true` 的植物（原版的 `Plant::IsFungus`：蘑菇类，不含咬咬碑），另外匹配 `plants` 中列出的植物 ID。
- 全日无休的 `only.plants` 目前为空，因为咖啡豆还不在内容中；加入后应列在此处，使触发条件与原版一致（只种蘑菇和咖啡豆，或什么都不种）。什么都不种时 `broken` 不会被设置，因此在对应时段什么都不种并取胜，会获得全日无休或无菇之夜。
- 全日无休和无菇之夜按时段判断，不按场景，和原版判断任意白天或黑夜背景一样。
- `plantPlaced` 由玩家从卡片槽或传送带种植时发出（`server/seeds/planting.ts`）。关卡的 `initialPlants` 和教程的 `introPlants` 创建时不发出该事件，`/plant` 发出时带 `debug: true`，因此都不计入。
- `levelWon` 在收集关卡奖励时发出（`server/items/items.ts`），`/win` 也会发出。
- `sunAdded` 只在收集的阳光到达计数栏时发出；`/sun` 直接设定阳光而不发出该事件，因此 `/sun set 8000` 之后要再收集一次阳光才会获得阳光满屋。
- `explode` 在计数前跳过已烧焦（`burned`）的僵尸，因此不会重复计入它们；燃烧爆炸仍会像原版一样把已在死亡过程中的僵尸再计一次。普通爆炸（土豆地雷）只作用于可被瞄准的僵尸，不包括正在死亡的僵尸。对敌对植物造成的伤害不计入 `kills`。

### 尚未接入

以下成就依赖尚未实现的内容，待内容实现后再接入：

- 豌豆先生的假期（`pvz:win-planting`，泳池场地，`never` 豌豆类射手）；
- 空中管制（`pvz:win-planting`，屋顶场地，`never` 投手类植物，并排除传送带关卡）；
- 僵尸学家（雪人僵尸）；
- 爆米花派对（巨人僵尸、玉米加农炮）；
- 庭院无忧（冒险模式 5-10）；
- 狂热死忠、葵花宝典、头脑风暴、瓷器太厚、无懈可击（迷你游戏、益智模式、生存模式）；
- 天天向上（智慧树）；
- 植物猎人（商店植物）；
- 大胡子模式（大胡子模式）。

## 原版的实现

1.2.0.1073 版本已有其中 20 个成就。1096 新增了舞者精神（id 20）和两处补发，其余触发逻辑两个版本相同。

### 定义

原版 1.2.0.1096 的成就表共 21 项。顺序即 id，也是在图集 `IMAGE_ACHEESEMENTS_ICONS`（70×70 格，每行 7 格）中的位置。每项包含名称键、描述键和 Steam 名称。基础内容包的 `achievements` 表以相同顺序列出它们，ID 见下表。

| id | 键名 | Steam 名称 | 本项目 ID |
| --- | --- | --- | --- |
| 0 | HOME_SECURITY | finished_adventure | `pvz:home-security` |
| 1 | NOBEL_PEAS_PRIZE | gold_sunflower_trophy | `pvz:nobel-peas-prize` |
| 2 | BETTER_OFF_DEAD | izombie_streak | `pvz:better-off-dead` |
| 3 | CHINA_SHOP | vasebreaker_streak | `pvz:china-shop` |
| 4 | SPUDOW | potato_mine | `pvz:spudow` |
| 5 | EXPLODONATOR | cherry_bomb | `pvz:explodonator` |
| 6 | MORTICULTURALIST | all_plants | `pvz:morticulturalist` |
| 7 | DONT_PEA_IN_POOL | pea_pool | `pvz:dont-pea-in-pool` |
| 8 | ROLL_SOME_HEADS | roll_heads | `pvz:roll-some-heads` |
| 9 | GROUNDED | grounded | `pvz:grounded` |
| 10 | ZOMBOLOGIST | secret_zombie | `pvz:zombologist` |
| 11 | PENNY_PINCHER | penny_pincher | `pvz:penny-pincher` |
| 12 | SUNNY_DAYS | sunny_days | `pvz:sunny-days` |
| 13 | POPCORN_PARTY | popcorn | `pvz:popcorn-party` |
| 14 | GOOD_MORNING | good_morning | `pvz:good-morning` |
| 15 | NO_FUNGUS_AMONG_US | no_fungus | `pvz:no-fungus-among-us` |
| 16 | BEYOND_THE_GRAVE | minigames | `pvz:beyond-the-grave` |
| 17 | IMMORTAL | survival_streak | `pvz:immortal` |
| 18 | TOWERING_WISDOM | tall_tree | `pvz:towering-wisdom` |
| 19 | MUSTACHE_MODE | mustache_mode | `pvz:mustache-mode` |
| 20 | DISCO_IS_UNDEAD | hypnotize_dancer | `pvz:disco-is-undead` |

### 授予

`GiveAchievement`接收 id 和“立即显示”标志：

1. 若成就已获得，立即返回 false（另有 Steam 上报，与本项目无关）。
2. 否则标记为已获得并返回 true。
3. 只有带“立即显示”且处于关卡中（`app->mBoard` 存在）时，才同时标记为已显示，并且：
   - 在关卡提示栏显示 `[ACHIEVEMENT_ACHIEVED]`，其中 `{ACHIEVEMENT}` 替换为成就名称；
   - 清除当前提示的 `mHelpIndex`（设为 `ADVICE_NONE`）；
   - 在授予时播放 `SOUND_ACHIEVEMENT`，即使消息需要排队也会立即播放。

在关卡外（商店、主菜单）带“立即显示”的授予，以及所有不带“立即显示”的授予，都只标记为已获得，留给之后的奖励页面列出。

关卡的辅助函数 `Board::GrantAchievement`在成就尚未获得时以“立即显示”授予。

### 触发

“关卡内”指立即显示并在关卡提示栏提示；“奖励页面”指只标记为已获得，在下一个奖励页面列出。

#### 关卡内

| id | 成就 | 位置 | 条件 | 显示 |
| --- | --- | --- | --- | --- |
| 4 | SPUDOW | `Plant::DoSpecial`，土豆地雷 | 其所在行半径 60 的爆炸（1800 伤害，范围标志 0x4D）实际消灭至少 1 只僵尸，已在死亡过程中的不计 | 关卡内 |
| 5 | EXPLODONATOR | `Plant::DoSpecial`，樱桃炸弹 | 一次爆炸（半径 115，上下各一行，燃烧）计数至少 10。与体型无关：小鬼僵尸、飞贼僵尸等都计入。计入的是爆炸后已死亡或处于 DYING、BURNED、MOWERED 状态的僵尸，因此已在死亡过程中的僵尸，以及尚未消失的焦黑僵尸，都会被再计一次。末日菇和火爆辣椒执行同一段代码，但不授予此成就 | 关卡内 |
| 8 | ROLL_SOME_HEADS | `Plant::UpdateBowling` | 同一颗普通坚果（不含爆炸坚果和巨型坚果）对僵尸的第 5 次及之后每次撞击。统计的是撞击次数，撞到防具也算。首周目冒险第 10 关及之前（即 1-5）不计 | 关卡内 |
| 10 | ZOMBOLOGIST | `Board::AddZombieInRow` | 冒险模式第 40 关（4-10）：某一波生成了雪人僵尸（`fromWave` ≥ 0）。不需要看到或消灭它 | 关卡内 |
| 11 | PENNY_PINCHER | `Coin::ScoreCoin` | 本关“连续收集金币”计数加 1 后恰好为 30。只计银币和金币（不计钻石和阳光）；只有未被收集、自行消失的银币或金币会让计数归零。被磁力菇吸走的金币既不增加计数，也不让计数归零 | 关卡内 |
| 12 | SUNNY_DAYS | `Board::AddSun` | 增加阳光（上限 9990）后，持有的阳光至少为 8000。判定的是此刻持有的阳光，而不是本关累计 | 关卡内 |
| 13 | POPCORN_PARTY | `Projectile`，玉米加农炮落地 | 本关“玉米加农炮消灭的巨人僵尸”计数达到至少 2。每次炮击累加炮击前后存活巨人僵尸（普通和红眼）数量之差 | 关卡内 |
| 20 | DISCO_IS_UNDEAD | `Zombie::StartMindControlled` | 舞者僵尸（不是伴舞僵尸）被迷糊菇控制；唯一的途径是啃食清醒的迷糊菇 | 关卡内 |
| 19 | MUSTACHE_MODE | `Board::DoTypingCheck` | 在关卡中输入 `mustache` 或 `moustache`（开启或关闭大胡子模式，两者都授予） | 关卡内 |

#### 关卡完成

关卡完成判定只在关卡完成时（`mLevelComplete`）由关卡完成流程调用。生存模式中只在最后一轮完成时调用，各项计数在轮次之间累计。它返回“是否有新获得”，决定奖励页面是否显示成就列表。

1. 迷你游戏（模式 16–50）：在档案的“前 20 个迷你游戏已完成”标志中记录本关（1096 新增，`PlayerInfo+0x646c`），20 个标志全部设置后授予 **16 BEYOND_THE_GRAVE**。
2. 打僵尸、花瓶终结者（包括 4-5）和坚果保龄球（包括 1-5）关卡到此结束。其他迷你游戏也到此结束；只有冒险模式、益智模式和生存模式继续判定。
3. 冒险模式第 50 关：**0 HOME_SECURITY**。
4. 按场景（`mBackground`）：
   - 白天泳池，未种豌豆类射手：**7 DONT_PEA_IN_POOL**；
   - 屋顶（白天或夜晚），非传送带关卡，未种投手类植物：**9 GROUNDED**；
   - 夜晚场景（黑夜、浓雾、夜晚屋顶、蘑菇园、水族馆），非僵尸公敌关卡，未种蘑菇：**15 NO_FUNGUS_AMONG_US**；
   - 其他场景（白天、白天泳池、白天屋顶、休闲花园（温室）、智慧树），只种了蘑菇和咖啡豆，或什么都没种：**14 GOOD_MORNING**。

以上成就都在奖励页面显示。

这些计数在 `Board::AddPlant` 中更新；变身茄子按其模仿的植物计算。

| 计数 | 初始值 | 条件 |
| --- | --- | --- |
| 种过豌豆类射手 | 否 | 豌豆射手、寒冰射手、双重射手、三重射手、双向射手、机枪射手 |
| 种过投手类植物 | 否 | 卷心菜投手、玉米投手、西瓜投手、冰西瓜（不含玉米加农炮） |
| 种过蘑菇 | 否 | 小喷菇、阳光菇、大喷菇、迷糊菇、胆小菇、冰川菇、末日菇、水兵菇、磁力菇、多嘴小蘑菇（咬咬碑不算） |
| 只种了蘑菇和咖啡豆 | 是 | 种植上述蘑菇和咖啡豆以外的任何植物（包括咬咬碑、莲叶、花盆和南瓜头）都会使其变为否 |

只有经过 `AddPlant` 的种植才计入；哪些种植计入、哪些不计入，见[成就一览](#成就一览)的补充说明。

这些关卡计数（四个种植标志、连续收集金币数、玉米加农炮消灭的巨人僵尸数）都在新建关卡时初始化，并随关卡存档保存。

#### 模式与档案

| id | 成就 | 位置 | 条件 | 显示 |
| --- | --- | --- | --- | --- |
| 17 | IMMORTAL | `Board::StartLevel` | 生存模式无限关卡（模式 11–15）每一轮开始时（选完种子之后），已完成至少 20 面旗帜，即第 11 轮开始时 | 关卡内 |
| 2 | BETTER_OFF_DEAD | `Challenge::IZombieInitLevel` | 僵尸公敌（无限），以恰好 10 的连胜开始下一轮 | 关卡内 |
| 3 | CHINA_SHOP | `Challenge::ScaryPotterPopulate` | 花瓶终结者（无限），以恰好 15 的连胜摆放花瓶 | 关卡内 |
| 18 | TOWERING_WISDOM | `Challenge::TreeOfWisdomGrow` | 智慧树生长后恰好为 100 英尺 | 关卡内 |
| 6 | MORTICULTURALIST | `StoreScreen::PurchaseItem` | 购买商店植物后，已拥有商店全部 9 种植物（机枪射手到变身茄子）；不检查 40 种基础植物 | 不在关卡内，留给奖励页面 |
| 1 | NOBEL_PEAS_PRIZE | `AwardScreen` 构造函数 | 非冒险模式的奖励页面，且已通关冒险模式并获得全部 48 个奖杯（生存模式 10 个、迷你游戏 20 个、益智模式 18 个） | 下一个奖励页面 |
| 0 | HOME_SECURITY | `AwardScreen` 构造函数 | 冒险模式的奖励页面，且关卡编号回到 1、冒险模式已通关（作为上述第 50 关完成判定的补充） | 下一个奖励页面 |
| 19 | MUSTACHE_MODE | `GameSelector::KeyChar` | 在主菜单输入 `mustache` 或 `moustache` | 下一个奖励页面 |

#### 补发

在主菜单同步档案时（`GameSelector::SyncProfile` 末尾；进入主菜单以及切换、新建、重命名用户时执行），按档案数据补发以下成就；由于不在关卡中，不会提示：

- 0：已通关冒险模式；
- 1：与上文相同的黄金向日葵奖杯条件；
- 10：雪人僵尸已可出现（冒险模式通关至少 2 次，或通关 1 次且当前关卡至少为 40）；
- 18：智慧树至少 100 英尺；
- 6：已拥有全部 9 种商店植物。

读取玩家档案时（每次运行中每个档案一次），若前 20 个迷你游戏的成绩都大于 0，则授予 16。

两者都是为了给旧档案补发成就。本项目没有旧档案，可以不实现。

### 显示

#### 关卡提示

样式 0x12（`MESSAGE_STYLE_ACHIEVEMENT`）在各方面都与 `HINT_TALL` / `TUTORIAL_LEVEL2` 相同：

- 显示 250 逻辑步（暂停时不计），然后立即消失，没有淡入淡出；
- 字体 `HOUSEOFTERROR28`，颜色 (253, 245, 173)，透明度按 `TodAnimateCurve(75, 0, mMainCounter % 75, 192, 255, BOUNCE_SLOW_MIDDLE)` 闪烁；
- 底条 `FillRect(0, 476, 800, 100)`，颜色 (0, 0, 0, 128)；文字在该矩形内换行并居中，上移 4 像素；
- 没有图标。

与其他消息的关系：只有当带动画的消息（如“一大波”提示）正在显示时才排队。当前消息的持续时间变为 min(剩余时间, 滑出时间 + 101)，结束后显示成就消息。其他情况下立即替换当前提示，被替换的提示不会再出现。

#### 奖励页面的成就列表

`AwardScreen(type, showAchievements)`：

- 构造时按 id 顺序列出**所有**已获得但尚未显示的成就（不只是本关的），标记为已显示并立即保存档案。构造函数中的两处授予（上文的 0 和 1）在列表之后执行，因此要等到下一个奖励页面才列出。
- 列表非空时先显示列表，代替正常的奖励内容：
  - 背景 `IMAGE_CHALLENGE_BACKGROUND`；
  - 标题 `[ACHIEVEMENTS_TITLE]`，`HOUSEOFTERROR28`，(220, 220, 220)，以 x = 400、y = 58 居中；
  - 第 k 项（共 n 项）的目标 y = 284 − 76n/2 + 76k；从 y = 750 出发，在第 150 + 100k 到 250 + 100k 逻辑步之间以 `EASE_IN_OUT` 滑到目标位置；
  - 70×70 图标绘制在 (220, y + 10)；
  - 名称 `[ACHIEVEMENT_EARNED]`，`DWARVENTODCRAFT15`，(224, 187, 98)，以 x = 450 居中，基线 y + 25；
  - 描述 `DWARVENTODCRAFT12`，白色，在 (300, y + 20, 300, 60) 内换行居中；
  - 与普通奖励页面一样，有 180 逻辑步的白色淡入。
- 最后一项到位后（第 150 + 100n 逻辑步），显示**继续**按钮：`SEEDCHOOSER_BUTTON` 图片，位于 (324, 515, 156, 42)，`DWARVENTODCRAFT15`，文字颜色 (213, 159, 43)，文字 `[CONTINUE_BUTTON]`。期间隐藏正常的开始按钮和菜单按钮。点击按钮以外的位置没有反应；空格、回车和 Esc 直接执行“开始”，跳过列表。
- 点击**继续**后恢复正常的奖励内容和按钮。若冒险模式通关后关卡编号回到 1，则改为进入制作人员名单（`CREDITS_ZOMBIENOTE`）。

#### 奖励页面何时出现

关卡完成流程的“是否有新获得”参数来自关卡完成判定的返回值：

| 模式 | 情况 | 结果 |
| --- | --- | --- |
| 冒险模式 | 有奖励的关卡（首周目第 50 关之前；第 9、19、29、39、49 关；第 50 关） | 奖励页面，带成就列表 |
| 冒险模式 | 其他关卡，有新获得 | 仅成就的奖励页面（`AWARD_ACHIEVEMENTONLY`） |
| 冒险模式 | 其他关卡，没有新获得 | 直接进入下一关 |
| 迷你游戏 | 解锁了新内容且冒险模式已通关 | 奖励页面，带成就列表 |
| 迷你游戏 | 其他情况，有新获得 | 仅成就的奖励页面 |
| 益智模式、生存模式 | 解锁了新内容 | 奖励页面，带成就列表 |
| 益智模式、生存模式 | 其他情况 | 回到挑战页面，不显示成就 |

“是否有新获得”只看关卡完成判定，已在关卡内提示过的成就不算。在关卡外（商店、主菜单）获得的成就，出现在下一个带成就列表的奖励页面上。

## 与原版的差异

- 未实现仅成就的奖励页面（`AWARD_ACHIEVEMENTONLY`）：目前所有进入奖励页面的关卡都有奖励，而不进入奖励页面的临时关卡不授予成就。
- 未实现主菜单和读取玩家档案时的补发（见[补发](#补发)）。
- 樱桃炸弹的爆炸不会把已烧焦的僵尸再计一次（见[触发类型](#触发类型)）；已在死亡过程中的僵尸仍会像原版一样再计一次。

## 原版的问题

实现时不应照搬：

- 仅成就的奖励页面上，**继续**总是进入冒险模式（`PreNewGame(ADVENTURE)`），即使成就是在迷你游戏中获得的；空格和回车则执行“开始”，回到挑战页面。应当回到来时的页面。
- 益智模式和生存模式从不显示仅成就的奖励页面，因此在这些模式中通过关卡完成判定获得的成就，要等到之后的某个奖励页面才列出。
- 樱桃炸弹会把已在死亡过程中的僵尸再计一次（见 EXPLODONATOR）。本项目的处理见[与原版的差异](#与原版的差异)。
- 描述与条件不符，见[成就一览](#成就一览)的补充说明。

## 调试指令

- `/achievement give {成就}` 按 ID 授予成就（可以省略 `pvz:`，如 `/achievement give sunny-days`）。在关卡中由关卡授予，并像正常获得一样显示消息、播放音效；在关卡外只写入玩家档案，等待下一个奖励页面列出。在不授予成就的关卡中执行会失败。
- `/achievement reset [成就]` 在玩家档案和当前关卡中重置指定成就，省略时重置全部，之后可以再次获得。
- 两条指令都需要玩家档案。详见[调试指令](DEBUG_CLI.zh-CN.md)。
