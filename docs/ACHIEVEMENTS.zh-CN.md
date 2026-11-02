# 成就（1096 核对记录）

原版 1.2.0.1096（Steam GOTY）的成就触发、发放和展示，从 `pvz-original-exe/PlantsVsZombies_1.2.0.1096_steam_unwrapped.exe` 反汇编核对，地址均为 1096 的虚拟地址。1073 已有其中 20 个，1096 新增 Disco is Undead（id 20）和两处补发；其余触发逻辑两版相同。PvZ-Portable 的成就代码是移植作者重写的，条件和展示都与原版有出入，不作依据。

## 实现状态

已完成通用流程，并接入了现有内容能达成的触发条件：

- 定义：玩法定义的 `achievements` 表（`mods/pvz-base/gameplay/definitions/achievements.json`，ID 如 `pvz:sunny-days`），Mod 可追加。档案按 ID 记录已获得和已展示。
- 发放：服务端 `grantAchievement(world, id, announce)`（`server/achievements/achievements.ts`）。开局数据包带上玩家已有的成就，只有新获得时才发出 `achievementEarned` 事件；客户端据此显示关卡消息、播放音效，并通过菜单接口 `earnAchievement` 写入档案。存档不保存成就，读档时仍以数据包为准。关卡定义的 `achievements: false` 让这一关不发放任何成就（原版没有这类关卡；用于压测关、选卡测试关这些调试关卡）。
- 展示：关卡消息为 `AdviceWidget` 的 `achievement` 样式；胜利后不清消息（原版只在失败时清），淡出期间获得的成就照常提示。过关时 `completeLevel` 取出已获得未展示的成就并标记已展示，领奖页先显示成就列表（`AwardAchievements`），点“继续”后再显示原有奖励。
- 调试：`/achievement give|reset`。
- 判定：游戏代码只发事件，不调用成就。会话把成就模块设为事件队列的观察者（`EventQueue.observer`），每个事件发出时，玩家还没有的成就按自己的 `trigger` 判定，时机与原版调用 `GiveAchievement` 的位置一致。触发条件全部写在 `achievements.json` 的 `trigger: { kind, ...设置 }` 里，`kind` 对应 `server/achievements/triggers.ts` 中注册的触发类型（`AchievementTriggerRegistry`，Mod 可注册新的类型）；加载内容时校验设置和引用的 ID。各成就在关卡内的判定状态（`progress`）随关卡存档（`achievementProgress`）。

  | 触发类型 | 事件 | 设置 | 成就 |
  | --- | --- | --- | --- |
  | `pvz:blast` | `plantExploded` 的 `kills`（`explode` 的返回值，即 `KillAllZombiesInRadius` 的计数：被灼烧的，以及爆炸后已死、倒下或被小推车碾压的僵尸） | `plants`、`kills` | SPUDOW（土豆雷 1）、Explodonator（樱桃炸弹 10） |
  | `pvz:bowling` | `bowlingImpact` 的 `plantTypeId`、`hits`（坚果自己的撞击计数，首次冒险第 10 关及以前不计） | `plants`、`hits` | Roll Some Heads（普通坚果 5） |
  | `pvz:coin-streak` | `itemScored`（入账，`Coin::ScoreCoin`）计数，`itemExpired`（淡出消失）清零，恰好达到时发放 | `items`、`coins` | Penny Pincher（银币、金币，30） |
  | `pvz:sun-held` | `sunAdded`（`Board::AddSun` 后的持有量） | `sun` | Sunny Days（8000） |
  | `pvz:win-planting` | `plantPlaced`（不含 `/plant` 的 `debug`）记下是否种过不符合的植物；`levelWon` 时在指定场地发放，不在关卡里提示 | `boards`、`skipRules`（保龄球、打僵尸）、`only` / `never`（`{ nocturnal, plants }`：夜间植物即原版的蘑菇，加上列出的植物） | Good Morning（白天，`only` 夜间植物）、No Fungus Among Us（夜间，`never` 夜间植物） |

- 等内容实现后再接：Don't Pea in the Pool（`pvz:win-planting`，泳池场地，`never` 豌豆类）、Grounded（屋顶场地，`never` 投手类，还要排除传送带关）、Cryptozombologist（雪人）、Popcorn Party（巨人、玉米加农炮）、Disco is Undead（舞王、魅惑菇的能力）、Home Lawn Security（5-10）、Beyond the Grave、Nobel Peas Prize、Better Off Dead、China Shop、Immortal（小游戏、解谜、生存）、Towering Wisdom（智慧树）、Morticulturalist（商店植物）、Mustache Mode（胡子模式）。

与原版的差别：

- 原版成就消息遇到大波僵尸的提示时排队，这里的大波提示是另一个节点，两者同时显示（位置不重叠）。
- 只有成就的领奖页（AWARD_ACHIEVEMENTONLY）未实现：目前的关卡都有奖励。
- 主菜单和读档时的补发不实现（见“补发”）。

## 定义

21 条，顺序即 id，也是图集 `IMAGE_ACHEESEMENTS_ICONS`（每格 70×70，每行 7 个）的位置。表在 `0x7290d0`，每条为标题键、说明键、Steam 名称。现有 `achievementCatalog.ts` 的顺序与此一致。

| id | 键 | Steam 名称 |
| --- | --- | --- |
| 0 | HOME_SECURITY | finished_adventure |
| 1 | NOBEL_PEAS_PRIZE | gold_sunflower_trophy |
| 2 | BETTER_OFF_DEAD | izombie_streak |
| 3 | CHINA_SHOP | vasebreaker_streak |
| 4 | SPUDOW | potato_mine |
| 5 | EXPLODONATOR | cherry_bomb |
| 6 | MORTICULTURALIST | all_plants |
| 7 | DONT_PEA_IN_POOL | pea_pool |
| 8 | ROLL_SOME_HEADS | roll_heads |
| 9 | GROUNDED | grounded |
| 10 | ZOMBOLOGIST | secret_zombie |
| 11 | PENNY_PINCHER | penny_pincher |
| 12 | SUNNY_DAYS | sunny_days |
| 13 | POPCORN_PARTY | popcorn |
| 14 | GOOD_MORNING | good_morning |
| 15 | NO_FUNGUS_AMONG_US | no_fungus |
| 16 | BEYOND_THE_GRAVE | minigames |
| 17 | IMMORTAL | survival_streak |
| 18 | TOWERING_WISDOM | tall_tree |
| 19 | MUSTACHE_MODE | mustache_mode |
| 20 | DISCO_IS_UNDEAD | hypnotize_dancer |

## 发放

`GiveAchievement`（`0x45bc00`）：参数为 id 和“立即展示”。

1. 已获得则直接返回 false（Steam 上报除外，与本项目无关）。
2. 记为已获得，返回 true。
3. 只有“立即展示”且正在关卡中（`app->mBoard` 存在）时，才同时记为已展示，并：
   - 在关卡消息栏显示 `[ACHIEVEMENT_ACHIEVED]`（`{ACHIEVEMENT}` 换成标题）；
   - 清掉当前提示的 `mHelpIndex`（设为 ADVICE_NONE）；
   - 播放 `SOUND_ACHIEVEMENT`（发放时就播，消息排队也照播）。

“立即展示”但不在关卡里（商店、主菜单），以及“不立即展示”的发放，都只记为已获得，留到之后的领奖页列出。

关卡里的辅助函数 `Board::GrantAchievement`（`0x421830`）：未获得时以“立即展示”发放。

## 触发条件

“局内”= 立即展示，在关卡消息栏提示；“领奖页”= 只记已获得，下一次领奖页列出。

### 关卡内

| id | 成就 | 位置 | 条件 | 展示 |
| --- | --- | --- | --- | --- |
| 4 | SPUDOW | `Plant::DoSpecial` 土豆雷 `0x46cf01` | 本行半径 60 的爆炸实际炸死 ≥1 个僵尸（伤害 1800，范围标记 0x4D，不含已在死亡中的） | 局内 |
| 5 | EXPLODONATOR | `Plant::DoSpecial` 樱桃炸弹 `0x46cc53` | 一次爆炸（半径 115，上下各一行，灼烧）计入 ≥10 个；不分体型，小鬼、蹦极等都算。计入的是爆炸后已死或处于 DYING/BURNED/MOWERED 的僵尸，所以已经在死亡中、焦黑未消失的也会再算一次。毁灭菇、火爆辣椒同代码但不发 | 局内 |
| 8 | ROLL_SOME_HEADS | `Plant::UpdateBowling` `0x4694d7` | 同一颗普通坚果（不含爆炸坚果、巨型坚果）撞击僵尸第 5 次及以后；计的是撞击次数，打到护具也算。首次冒险的第 10 关及以前（即 1-5）不计 | 局内 |
| 10 | ZOMBOLOGIST | `Board::AddZombieInRow` `0x4112ef` | 冒险模式第 40 关（4-10），雪人从波次刷出（fromWave ≥ 0）；不用看到或打死 | 局内 |
| 11 | PENNY_PINCHER | `Coin::ScoreCoin` `0x4347e3` | 关卡计数“连拾金币”+1 后恰好等于 30。只计银币、金币（钻石、阳光不计）；只有银币或金币没捡到淡出消失才清零。磁力菇吸走的金币既不加也不清零 | 局内 |
| 12 | SUNNY_DAYS | `Board::AddSun` `0x41f52a` | 加阳光（上限 9990）后手中阳光 ≥ 8000；是当时持有量，不是全关累计 | 局内 |
| 13 | POPCORN_PARTY | `Projectile` 玉米加农炮落地 `0x47589d` | 关卡计数“加农炮击杀巨人”累计 ≥ 2；每发加农炮前后存活巨人（普通、红眼）数之差计入 | 局内 |
| 20 | DISCO_IS_UNDEAD | `Zombie::StartMindControlled` `0x54452a` | 舞王僵尸（不含伴舞）被魅惑；唯一途径是啃醒着的魅惑菇 | 局内 |
| 19 | MUSTACHE_MODE | `Board::DoTypingCheck` `0x41e77b` | 关卡里输入 `mustache` 或 `moustache`（开关胡子模式，开和关都发） | 局内 |

### 过关结算

`0x41f200`，只在关卡完成（`mLevelComplete`）时由过关流程调用；生存模式只在最后一轮完成时调用，计数在各轮之间累积。返回“是否有新获得”，决定是否显示领奖页的成就列表。

1. 小游戏（模式 16–50）：在档案的“前 20 个小游戏已通关”标记里记下本关（1096 新增，`PlayerInfo+0x646c`），20 个都有则发 **16 BEYOND_THE_GRAVE**。
2. 打僵尸、砸罐子（含 4-5）、保龄球（含 1-5）关卡：到此结束。其他小游戏也到此结束；之后只有冒险、解谜、生存继续。
3. 冒险第 50 关：**0 HOME_SECURITY**。
4. 按场景（`mBackground`）：
   - 白天泳池，且没种过豌豆类 → **7 DONT_PEA_IN_POOL**；
   - 屋顶（白天或夜晚），不是传送带关，且没种过投手类 → **9 GROUNDED**；
   - 夜间类场景（夜晚、雾夜、屋顶夜晚、蘑菇园、水族馆），不是我是僵尸关，且没种过蘑菇 → **15 NO_FUNGUS_AMONG_US**；
   - 其他场景（白天、白天泳池、白天屋顶、温室、智慧树），只种过蘑菇和咖啡豆 → **14 GOOD_MORNING**。

均为领奖页展示。

计数在 `Board::AddPlant`（`0x4105a0`）里更新，模仿者按它模仿的植物计：

| 计数 | 初值 | 条件 |
| --- | --- | --- |
| 种过豌豆类 | 否 | 豌豆射手、寒冰射手、双发射手、三线射手、裂荚射手、机枪射手 |
| 种过投手类 | 否 | 卷心菜、玉米、西瓜、冰瓜投手（不含玉米加农炮） |
| 种过蘑菇 | 否 | 小喷菇、阳光菇、大喷菇、魅惑菇、胆小菇、寒冰菇、毁灭菇、水兵菇、磁力菇、忧郁菇（墓碑吞噬者不算） |
| 只种蘑菇和咖啡豆 | 是 | 种了上面蘑菇和咖啡豆以外的任何植物（含墓碑吞噬者、睡莲、花盆、南瓜头）即为否 |

只统计经过 `AddPlant` 的种植：玩家从卡槽或传送带种下、雨中种子等道具、模仿者变身、Beghouled 升级、Column 和铲子/松鼠小游戏预置的坚果。关卡预置、剧情摆放、我是僵尸的初始植物不算。

关卡计数（四项种植标记、连拾金币、加农炮击杀巨人）都在新建关卡时初始化，随关卡存档。

### 模式与档案

| id | 成就 | 位置 | 条件 | 展示 |
| --- | --- | --- | --- | --- |
| 17 | IMMORTAL | `Board::StartLevel` `0x40f2a9` | 无尽生存（模式 11–15）每轮开始（选卡之后）时，已完成旗数 ≥ 20，即第 11 轮开始时 | 局内 |
| 2 | BETTER_OFF_DEAD | `Challenge::IZombieInitLevel` `0x42ec76` | 无尽我是僵尸，连胜数恰好为 10 时开始下一轮 | 局内 |
| 3 | CHINA_SHOP | `Challenge::ScaryPotterPopulate` `0x42d0fd` | 无尽砸罐子，连胜数恰好为 15 时摆罐 | 局内 |
| 18 | TOWERING_WISDOM | `Challenge::TreeOfWisdomGrow` `0x4310bd` | 智慧树长高后恰好 100 英尺 | 局内 |
| 6 | MORTICULTURALIST | `StoreScreen::PurchaseItem` `0x49bb58` | 买了商店植物后，商店的 9 种植物（机枪射手到模仿者）都已拥有；不看基础 40 种 | 不在关卡，留到领奖页 |
| 1 | NOBEL_PEAS_PRIZE | `AwardScreen` 构造 `0x4082de` | 非冒险的领奖页，且已通关冒险并拿到全部 48 个奖杯（生存 10、小游戏 20、解谜 18） | 下一次领奖页 |
| 0 | HOME_SECURITY | `AwardScreen` 构造 `0x40818d` | 冒险领奖页，关卡数已回到 1 且已通关冒险（上面第 50 关结算的兜底） | 下一次领奖页 |
| 19 | MUSTACHE_MODE | `GameSelector::KeyChar` `0x4507ec` | 主菜单输入 `mustache` 或 `moustache` | 下一次领奖页 |

### 补发

主菜单同步档案（`GameSelector::SyncProfile` 末尾 `0x44eed0`，进入主菜单和切换、新建、改名用户时）按档案数据补发，不在关卡所以不提示：

- 0：已通关冒险；
- 1：同上金向日葵奖杯条件；
- 10：雪人已经能出现（通关冒险 ≥2 次，或通关 1 次且当前关卡 ≥ 40）；
- 18：智慧树 ≥ 100 英尺；
- 6：商店 9 种植物都已拥有。

读档时（每个档案每次运行一次，`0x470b40`）：前 20 个小游戏的成绩都大于 0 则补发 16。

两处都是为旧版档案补成就；本项目没有旧档案，可以不做。

## 展示

### 关卡消息

样式 0x12（`MESSAGE_STYLE_ACHIEVEMENT`），各项与 HINT_TALL/TUTORIAL_LEVEL2 相同：

- 显示 250 tick（暂停时不计时），到时直接消失，没有淡入淡出；
- 字体 HOUSEOFTERROR28，颜色 (253, 245, 173)，透明度按 `TodAnimateCurve(75, 0, mMainCounter % 75, 192, 255, BOUNCE_SLOW_MIDDLE)` 闪动；
- 底条 `FillRect(0, 476, 800, 100)`，颜色 (0, 0, 0, 128)；文字在此矩形内换行居中，向上偏 4；
- 没有图标。

与其他消息：只有大波僵尸这类带动画的消息正在显示时才排队（当前消息时长改为 min(剩余, 滑出时间 + 101)，结束后显示成就消息）；其余情况直接替换当前提示，被替换的提示不再出现。

### 领奖页的成就列表

`AwardScreen(type, showAchievements)`：

- 构造时把**所有**已获得未展示的成就（不只本关的）按 id 顺序列出并标记已展示，随即保存档案。上面构造里的两处补发（0、1）发生在列表之后，所以要等下一次。
- 列表非空时先显示成就列表，代替原有领奖内容：
  - 背景 `IMAGE_CHALLENGE_BACKGROUND`；
  - 标题 `[ACHIEVEMENTS_TITLE]`，HOUSEOFTERROR28，(220, 220, 220)，以 x=400 居中，y=58；
  - 第 k 条（共 n 条）目标 y = 284 − 76n/2 + 76k，从 y=750 开始，在第 150 + 100k 到 250 + 100k tick 间按 EASE_IN_OUT 滑到目标位置；
  - 图标 70×70 画在 (220, y+10)；
  - 标题 `[ACHIEVEMENT_EARNED]`，DWARVENTODCRAFT15，(224, 187, 98)，以 x=450 居中，基线 y+25；
  - 说明 DWARVENTODCRAFT12，白色，在 (300, y+20, 300, 60) 内换行居中；
  - 白色淡入 180 tick（与普通领奖页相同）。
- 最后一条到位（第 150 + 100n tick）后显示“继续”按钮：SEEDCHOOSER_BUTTON 系列贴图，(324, 515, 156, 42)，DWARVENTODCRAFT15，文字颜色 (213, 159, 43)，文案 `[CONTINUE_BUTTON]`。原有的开始和菜单按钮在此期间隐藏。点击按钮以外的地方无效；空格、回车、Esc 直接执行“开始”，跳过列表。
- 点“继续”：恢复原有领奖内容和按钮。冒险通关后关卡数回到 1 时，改为进入片尾（CREDITS_ZOMBIENOTE）。

### 何时显示领奖页

过关流程 `0x4575c0`（参数“有新获得”= 过关结算的返回值）：

| 模式 | 情况 | 结果 |
| --- | --- | --- |
| 冒险 | 有奖励的关（首次冒险 50 关以前、第 9/19/29/39/49 关、第 50 关） | 领奖页，带成就列表 |
| 冒险 | 其他关，有新获得 | 只有成就的领奖页（AWARD_ACHIEVEMENTONLY） |
| 冒险 | 其他关，没有新获得 | 直接下一关 |
| 小游戏 | 解锁新内容且已通关冒险 | 领奖页，带成就列表 |
| 小游戏 | 否则，有新获得 | 只有成就的领奖页 |
| 解谜、生存 | 解锁新内容 | 领奖页，带成就列表 |
| 解谜、生存 | 否则 | 回到挑战页，不显示成就 |

“有新获得”只看过关结算，局内已经提示过的不算；局外获得的（商店、主菜单）在下一次显示成就列表的领奖页出现。成就页只看已获得，不区分是否已展示。

## 原版的问题

实现时不照搬：

- 只有成就的领奖页点“继续”无条件进入冒险（`PreNewGame(ADVENTURE)`），小游戏里获得也是如此；空格、回车走“开始”则回到挑战页。应回到来源页面。
- 解谜和生存不显示只有成就的领奖页，那里获得的结算成就要等以后的领奖页才出现。
- 樱桃炸弹会把已在死亡中的僵尸再算一次（见 EXPLODONATOR）。
- 说明文案与条件有出入：Roll Some Heads 计撞击次数，Cryptozombologist 只要雪人刷出，Morticulturalist 只看商店 9 种，Sunny Days 是持有量。
