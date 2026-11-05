# 开发说明

冒险日间关卡已接通至 1-10，关卡数据对照 `PvZ-Portable` 的 `Challenge.h`、`Board::PickZombieWaves`、`Challenge::UpdateConveyorBelt` 和 `LawnApp::GetAwardSeedForLevel`：1-6／1-7／1-8／1-9／1-10 分别为 10／20／10／20／20 波，每 10 波一面旗帜。1-6 引入撑杆；1-8 引入铁桶且不出现撑杆；最终波包含当前关卡全部普通出怪类型。1-6、1-7 带上全部可用种子（5、6 张，种子栏放得下），1-8、1-9 从同一选卡目录选择 6 张；可用种子是玩家已拥有的种子（`LawnApp::HasSeedType`）：档案的 `seeds` 记录它们，通关时加入该关奖励的种子，商店里 `seed` 类购买项加入所卖的植物，玩法设置的 `seedBank.startingSeeds`（豌豆射手）开局即有；关卡由开局包的 `ownedSeeds` 拿到这份列表并存入关卡存档，没有玩家时选卡目录全部可用。选卡和存档中未确认的选卡只接受这些，已确认的种子栏可以是任意已安装种子（`/seed`），服务端统一校验选卡与存档；奖励卡显示的价格就是种子本身的价格。

1-6 至 1-8 的奖励依次为寒冰射手、大嘴花、双发射手。1-9 使用独立的 `note` 奖励：原版小纸条掉落、原地淡出、500 tick 黑色转场，以及来信贴图和翻纸音效；奖励表现的 `pageImages` 负责页面排布。1-10 不选卡、不掉落天空阳光，100 tick 出第一波，200 tick 后开始七种植物的免费传送带；供卡重复降权和上一张卡片随存档恢复，通关奖励为小喷菇。领取奖励后进入 2-1。

冒险 2-1 复用通用选卡和关卡流程：夜间棋盘、50 初始阳光、6 张选卡、10 波，首次冒险先播放戴夫 201–207 对话；夜间不安排天空阳光。小喷菇按原版随机偏移 x=-5…4、y=-3…2，偏移随实体位置存档；影子使用夜间贴图，在原图中心缩放至 0.5 倍。小喷菇免费、750 tick 冷却，射程在植物攻击起点前方 230px，孢子在第 75 tick 碰撞前消失；白天睡眠。读报僵尸在第 6 波和最后一波固定出现；报纸有 150 耐久，撕裂后播放 8fps 的惊讶动作，随后按 0.89–0.91 的速度行走，仅在带头且场上带头僵尸不超过 10 只时怒吼；寒冷同样减慢惊讶动作。植物与僵尸仍使用共用的射击、伤害、动画和存档通道。

阳光菇、大喷菇和墓碑吞噬者已安装（分别从 2-2、2-3、2-4 开始解锁），图鉴改用它们的关卡动画。阳光菇 25 阳光，先产出半尺寸、价值 15 的小阳光；醒着累计 12000 tick 后播放 100 tick 的成长动画，期间不产出，之后产出普通阳光；白天睡眠时既不成长也不产出。大喷菇 75 阳光，每 136–150 tick 攻击一次，50 tick 前摇后对同行攻击起点前方 340px 内的全部僵尸各造成 20 伤害；伤害穿过报纸并完整作用于身体（`hitsShieldAndBody`），烟雾在攻击开始 35 tick 后出现。墓碑吞噬者 75 阳光，只能种在墓碑上，种错时显示原版提示；僵尸会啃食它，但铲子铲不掉。它先落地 47–70 tick（`anim_land` 按身体随机的 10–15 fps 播放），再啃食 400 tick，期间下沉 30px、墓碑从顶部被逐渐吃掉，最后连同墓碑一起消失。阳光菇成长和墓碑吞噬者进度属于植物能力状态，随存档保存。

墓碑按关卡配置在第 7／8／9 列随机放置 1／1／2 座，阻挡普通种植并显示原版提示，墓碑格不显示落点预览或移动端辅助线。开场镜头移回草坪后墓碑升起，伴随泥土粒子和音效，割草机与 Ready-Set-Plant 相应顺延 100 tick。位置、外观、出土延迟与最终波后的 200 tick 出怪计时一起存档；每座墓碑按关卡 `graveZombies` 的权重生成一只僵尸，先经过 150 tick 出土；若奖励已在此前掉落，墓碑不再出怪。客户端 `LevelGraves` 使用原版墓碑／土堆图集绘制出土，`ZombieView` 裁剪钻出的身体。读档立即同步墓碑可见高度，暂停状态下也无需等待下一帧游戏推进。通关奖励为阳光菇，领取后进入 2-2。夜间音乐沿用同一 `MusicSystem`，按原版 scheme 2 在下一乐句切入鼓轨、淡出主旋律，并保存独立鼓轨相位。

冒险 2-2 复用 2-1 的夜间流程：20 波（第 10、20 波为旗帜波），出现普通、路障、铁桶、读报和旗帜僵尸，墓碑布局同 2-1，最终波后墓碑按 4000:4000 出普通或路障僵尸；首次冒险播放戴夫 1401–1402 对话，`{MONEY}`、`{UPGRADE_COST}` 分别替换为当前金币和下一次卡槽升级价格。通关奖励为大喷菇，领取后进入 2-3。选卡警告按关卡脚本的 `chooserWarnings` 依次弹出：2-1 首次冒险未带小喷菇先提示，未带产阳光植物时使用夜间专用文案，任何一次选择重新挑选都会中止开始。

选卡阶段鼠标移到预览僵尸上显示名字提示框，光标保持箭头。玩家有了图鉴（档案 `unlocks.almanac`）后，图鉴里有的僵尸（按 `nameKey` 对应）提示框多一行“click to view”，点击播放点击音效并在暂停的关卡上打开僵尸页、定位到它，关闭后回到选卡（`SeedChooserScreen::MouseDown`、`AlmanacDialog::ShowZombie`）。选卡面板在 (560, 572)、(680, 572) 显示原版的“图鉴”“商店”按钮，分别在图鉴、商店解锁后出现；从这里打开的商店返回按钮显示“回到游戏”。

冒险 2-3 沿用夜间流程和墓碑，10 波，出现普通、路障和铁栅门僵尸。铁栅门僵尸（`pvz:screendoor`）的门有 1100 耐久，出怪点数 4、权重 3500、第 5 波起出现，在第 6 波和最后一波固定出现。门是盾牌：`Board::TotalZombiesHealthInWave` 按 0.2f 计入，僵尸死亡时门掉落但不播放撕报纸声（`DropShield(1U)`），被割草机碾压时先掉落头盔和盾牌（`Zombie::MowDown`）。首次冒险时，若金币够买第一次卡槽升级、还没买过、拒绝不到两次（`CutScene::CanGetPacketUpgrade`），戴夫说 1501–1503 推销；1503 在 `pvz:dialog` 中带有 `question`（价格和升级后的格数），由“是/否”对话框回答：选“是”扣钱、这一关的选卡立即多一格，接着说 1510–1511；选“否”接着说 1520。回答和回答后的金币通过一次 `recordPacketUpgradeOffer` 写入档案，推销状态随存档保存。通关奖励为墓碑吞噬者。

冒险 2-4 沿用夜间流程，20 波（第 10、20 波为旗帜波），出现普通、路障、撑杆和铁栅门僵尸（`gZombieAllowedLevels`），没有新引入的僵尸。墓碑按 `Board::InitLevel` 在第 5／6／7／8 列放置 1／1／2／3 座。卡槽升级推销与 2-3 共用 `packetUpgradeOffer` 脚本（原版在 13–24 关推销，第 15、20、21 关除外）。通关奖励是图鉴（`COIN_ALMANAC`），使用 `unlock` 奖励：掉落、拾取箭头和领奖页与工具奖励相同，但不加入关卡工具。奖励的 `unlocks: "almanac"` 在通关时把图鉴记入档案的 `unlocks`，此后主菜单和游戏内选项显示图鉴入口（对应原版第 15 关，`LawnApp::CanShowAlmanac`）；商店和禅境花园同理，使用 `"store"`、`"garden"`（对应 3-4 的车钥匙和 5-4 的水壶，尚未实现）；通关冒险后三者全部开放。奖励的 `opens` 让领奖页按钮显示 `VIEW_ALMANAC_BUTTON` 并打开图鉴，从领奖页打开的图鉴关闭后直接进入下一关（`AwardScreen::StartButtonPressed`）。关闭图鉴后进入 2-5。

冒险 2-5 是锤僵尸（`LawnApp::IsWhackAZombieLevel`）。关卡规则 `rules: {kind: "pvz:whack-a-zombie", count: 8, ...}` 声明墓碑数量、补墓碑数、起始列、每波间隔、三种僵尸和掉落的阳光，只给出 8 个空波次（第一波的倒计时用关卡通用的 `firstWaveTicks`），由 `server/rules/whackAZombie.ts` 按 `Challenge::WhackAZombieSpawning` 现场出怪：开局在第 4 列起放 9 座墓碑（`WhackAZombiePlaceGraves`），第一波 200 tick 后到来、之后每波 2000 tick，每波前 100 tick 把墓碑补到 5 座；距下一波 300 tick 以上时按波数阶段成组出土（1～3 只，混入路障和铁桶），出土 50 tick、速度 0.5 到随波数增长的上限，最后一波 300 tick 后一次出 20 只路障或铁桶并响警报；倒计时归零前不掉奖励。规则声明 `spawnsZombies`，普通出怪系统就不运行。锤子由通用的 `boardClick` 指令交给规则执行（`Challenge::MouseDown` → `MouseDownWhackAZombie`）：点击处上方 20 像素、半径 45 内最靠前的僵尸，戴头盔的只伤头盔 900（`damageZombie` 的 `helmOnly`），否则带掉落立即死亡并清一次光标。光标清空后，奖品掉落前会变回锤子，掉落后就收起锤子（`Challenge::ClearCursor`，规则的 `cursorCleared`；快照 `extensions["pvz:whack-a-zombie"].hammer`），所以锤死最后一只僵尸后锤子随即消失，之后也不能再锤。被锤死的僵尸可能改为掉 3 个阳光（`Board::DropLootPiece`，阳光越多越少）。开局 0 阳光，种子栏固定为土豆雷、墓碑吞噬者、樱桃炸弹且开局不充能（`openingRecharge: false`；种下后照常冷却，`SeedPacket::WasPlanted`），没有铲子（`tools: []`）；种在不能种的格子（有植物、有墓碑、墓碑吞噬者不在墓碑上）时直接放下手里的卡并播放放下音效（`Board::MouseDownWithPlant`，`seedDropped` 事件）。首次冒险戴夫说 401–406；之后每局有阳光后 1500 tick 让种子包闪 400 tick，选卡即结束（`whackTutorial`）。客户端 `client/level/rules/WhackAZombieView` 绘制锤子光标（`pvz:hammer`，24 fps，点击从 0.2 处重播），显示锤子且鼠标没悬停在可点的东西上时隐藏系统光标（`Board::UpdateCursor`，`UIHoverManager.setIdleCursor`）和锤击音效、POW，种子栏开场藏在屏幕上方（开场 `hiddenSeedBank`），有阳光后每 tick 下移 2 像素；锤僵尸关的掉落物点击范围放宽 15、向下再加 30。这些表现参数在 `presentation/definitions/rules.json` 的 `pvz:whack-a-zombie` 中，其中出土效果 `graveRise` 和掉落物点击放宽 `itemPadding` 由通用代码读取。通关奖励是催眠菇：目前只作为可领取的种子（`mushroom` 视图只有待机和睡眠），玩法随 2-6 实现。

金币沿用原版 `Board::DropLootPiece`：每只僵尸在掉头、被碾压、烧焦或被瞬杀时掷一次 0–29999，概率乘以僵尸分值（关卡 `zombiePool` 的 `points`，未写时取僵尸的 `wave.points`），银币（价值 1，显示 $10）、金币（5）、钻石（100，买过第一次卡槽升级前改为金币）；奖励掉落后不再掉金币。重玩关卡始终掉落，首次冒险从第 11 关（2-1）起掉落，无需逐关配置；2-1 脚本的 `loot.firstCoinAfterWave` 保证第 5 波后掉出带拾取箭头的第一枚金币，`loot.savingsCap` 让金币（含剩余割草机的金币）够买卡槽升级前不再掉落。金币是 `kind: "money"` 的掉落物，落地后改为旋转动画，点击后飞向左下角钱袋，钱袋显示 1000 tick 并淡出，游戏暂停时也显示（调试 CLI 的暂停除外）。领奖 200 tick 后，剩余割草机每 40 tick 自下而上变成一枚金币，提示音逐个升调。金币以档案为准：开局和读档都从档案取当前金币和卡槽升级次数，关卡内金额变化（含 `/money`）立即写回档案；掉落物外观、动画和音效由表现定义 `items` 提供。

铲子随种子栏宽度右移（`Board::GetSeedBankExtraWidth`）：6 格以内 x=456，10 格 x=609；选卡时隐藏，开场结束后出现。选卡僵尸预览复用 `UIButton` 悬停与 `UITooltip`，名称读取表现定义的 `nameKey`，提示限制在右侧预览区域；确认选卡、暂停或打开弹窗时隐藏。1-8／1-9 尚未获得原版图鉴，因此提示只显示名称。

冒险 1-5 使用 `ShovelTutorial` 保存戴夫两段对话和三株豌豆射手的铲除进度，客户端 `CrazyDaveView` 只播放动画、显示原版文案并发出交互指令。教程结束后进入 8 波坚果保龄球，传送带按 85:15 提供普通／爆炸保龄球，通关奖励为土豆雷。

`pvz:bowling-wallnut`、`pvz:bowling-explodenut` 是独立植物和种子定义，配置放在 gameplay／presentation JSON。服务端通过现有 `PlantBehaviorRegistry` 注册 `bowling` 行为，状态存入 `behaviorState`；客户端通过 `PlantViewRegistry` 注册 `BowlingNutView`，放下时的滚动声（原版 `MouseDownWithPlant` 的 `SOUND_BOWLING`）是坚果自己的 `plantedSounds`。只复用坚果的美术资源，普通坚果不参与保龄球判断。`occupiesCell: false` 声明移动植物不占格、不作为啃食目标；`low: true` 声明低矮植物，敌对子弹从上面飞过（见 [阵营](TEAMS.zh-CN.md)）；表现定义的 `layer: "projectile"` 让滚动的坚果画在本行的弹道层（原版保龄球关卡的 `Plant::CalcRenderOrder`）。

关卡实体的绘制顺序照搬原版 `Board::MakeRenderOrder`：`行 × 10000 + 图层 + 偏移`，从小到大画。图层是 `shared/content/renderOrder.ts` 里与原版 `RenderLayer` 同名同值的常量（`ground`、`graveStone`、`plant`、`zombie`、`projectile`、`lawnMower`、`particle`、`top` 等），`top` 及以上不分行。植物偏移为 `5 − x + 800`（越靠左越在上），僵尸偏移为 4，阴影在 `ground` 层偏移 3（压在所有行的植物和僵尸下面），掉落的头、手臂和头盔在僵尸之上一层，其余粒子按原版各自的图层或所属实体的层级加偏移。层级相同时实体按创建顺序，挂在实体层级上的粒子画在实体之后。表现数据里用图层名（植物的 `layer`、爆炸的 `layer`），不写数字。

选卡目录全局共用：独立的 `gameplay/seed-catalog.json` 是从种子 ID 到 `{ "position" }` 的定义表，`position` 是种子在选卡格子里的位置（`SeedChooserScreen::GetSeedPositionInChooser`，8 列，从左到右、从上到下数，从 0 开始），即原版的植物种子编号；选卡界面显示 0–47 号：平时 5 排（0–39），提供 40–47 号（原版的升级植物）中任一张时按原版 `SeedChooserScreen::Has7Rows` 改成 6 排，行距 70、首排 y=123；48 号是原版的模仿者，48 号起都不出现在选卡界面。没人占的位置显示空阴影，两张卡不能同号。种子定义不包含目录属性；隐藏卡登记在格子之外：爆炸坚果 49（原版 `SEED_EXPLODE_O_NUT`）、坚果保龄球 50、爆炸坚果保龄球 51。种子定义用 `kind` 说明种下什么：`plant`（种植物，带 `placement`）、`zombie`（放僵尸，原版 `SEED_ZOMBIE_*`）或 `grave`（放墓碑）；植物和僵尸种子默认种出与种子同 ID 的植物或僵尸，不同时用 `id` 指定。新增一类种子只需新增一种 `kind` 的定义，已有定义不用改。每种僵尸都有和僵尸同 ID 的僵尸种子（如普通僵尸的 `pvz:normal`）：普通、路障、撑杆、铁桶、铁门的价格照原版（50、75、75、125、100），原版没有的旗帜僵尸 50、读报僵尸 75；冷却为 0，任何关卡都能用（`/seed` 或关卡的 `seedPackets`），放在开放行的任意格、不看格子里的植物和墓碑，生成在格子左 30 处（`Challenge::IZombiePlaceZombie`），种子包里按僵尸表现定义的 `packet`（偏移、0.35 倍和姿势 `clip`，撑杆僵尸照原版缓存用 `walk`）画僵尸。墓碑卡 `pvz:grave`（`"kind": "grave"`，0 阳光、无冷却，原版没有）在开放行的任意格子放一块墓碑，照原版 Grave Danger 刷墓碑（`Challenge::GraveDangerSpawnGraveAt`）：格子里的植物死掉，墓碑从种下的这一刻冒出来；已有墓碑的格子不能种（`/grave` 仍会替换）；它默认属于僵尸方，卡片换到植物方时墓碑带 `team: "plants"`，最后一波后从它冒出的僵尸也在植物方。朝右的撑杆僵尸往右撑杆跳（跳跃距离按两者宽度镜像），放在植物格子上的不会往回跳。选卡目录只能列植物种子。和其他定义表一样，Mod 通过顶层 `seedCatalog` 表登记自身命名空间的种子，通过 `overrides.seedCatalog` 移动任何种子的位置。关卡的 `conveyor` 表示传送带，`seedPackets` 表示固定种子栏；其余关卡按原版 `Board::InitLevel`：可用种子放得下时全部带上，多于槽位时打开选卡。槽位数为 `settings.seedBank.baseSlots`（6）加已买的卡槽升级数，不超过 `maxSlots`（10）和可用种子数（`Board::GetNumSeedsInBank`）；关卡不写槽位数和候选池。客户端一开始就建好 `maxSlots` 个卡片，开场买的槽位只是多显示一张。`server/seeds/seedChooser.ts` 统一生成目录并校验选择、移除和确认，顺序与初始冷却随服务端存档保存。`LevelSeedChooser` 按目录里的位置排卡，未解锁的卡留出空位，不使用预览图编号决定位置，只负责卡片飞行、补位、面板和提示；演出与全局时钟一致。测试入口为 `/level pvz:seed-chooser-test`。

图鉴首页和详情已接入全部 49 种植物、26 种僵尸的 Reanim 展示动画，包含独立头部、眨眼、旗帜、装备及僵尸博士驾驶员；左侧缩略图沿用原版静态展示。`AlmanacEntityView` 只负责动画播放和裁剪，不创建后端实体，不实现攻击、产出、移动或受伤逻辑。全部动画使用全局时钟。资源配置由 `npm run build:content -- --pak /path/to/main.pak` 生成，完整构建也会包含这些资源。

图鉴条目（植物的名称键、卡包图片编号和种子 ID、背景地面，僵尸的首次出场关卡等；植物的费用和冷却取自其种子定义的 `sunCost`、`cooldownTicks`，与原版图鉴读取 `gPlantDefs` 一致）配置在 `mods/pvz-base/gameplay/almanac.json`，登记为 `pvz:gameplay/almanac`，和商店一样由应用加载后注入后端；`server/menu/almanacCatalog` 只负责校验和解锁规则。图鉴按当前档案显示：植物只列出种子已拥有且已安装的（档案的 `seeds` 加 `seedBank.startingSeeds`，与选卡相同），其余格子不绘制；僵尸按 `gZombieDefs` 的 `mStartingLevel`，到达首次出场关卡才显示（`ZombieIsShown`，伴舞、雪橇队和小鬼要过了该关），否则画空白窗口且不可点；过了首次出场关卡才有说明（`ZombieHasDescription`），之前说明框居中显示 `NOT_ENCOUNTERED_YET`。通关冒险后僵尸全部显示。尚未实现：原版在本次选定玩家后击败过的僵尸也会提前显示说明（`gZombieDefeated`），以及雪人可出现前的剪影，目前雪人在可出现前直接隐藏。

已实现实体的图鉴动画、身体坐标、缩放和影子来自统一表现定义；选卡预览也直接使用待机动画的坐标。生成器按身体动画资源自动匹配已有定义，目录只保留图鉴专用的布局、缩略图及种子包姿态参数。`almanac.py` 的类型绘制偏移表仅用于尚无动画定义的展示条目。

主场景挂载 `app/GameApp.ts`，协调菜单页面，并通过 `app/LevelController.ts` 启动 `LocalIntegratedGame`。战斗逻辑在 `server` 中运行，客户端处理协议快照和事件。`server`、`shared`、`ecs` 不应引入引擎依赖。

本地战斗通道的服务端响应通过 `copyServerPacket` 在一次遍历中检查 JSON 安全性并深拷贝，再做协议结构校验；避免每帧安全扫描后再次 JSON 序列化和解析。嵌套 Mod 状态、扩展数据和事件同样复制、校验，客户端修改副本不会影响服务端或其他快照。客户端请求、外部协议解析与存档格式保持原有规则。

菜单数据按 `screens → client/api/MenuApi → MenuTransport → server/menu/MenuService` 流转，`shared/menu` 定义请求和响应 DTO。后端负责用户档案与名称校验、商店目录／价格／库存／购买、挑战成绩、图鉴条目、成就条目／解锁状态和设置持久化。页面只渲染 API 返回的数据、提交 ID 和操作，不导入仓库或修改档案；确认购买时由后端重新校验当前用户、价格、库存和余额。请求与响应经过 JSON 往返，前端修改副本不会影响后端状态。

商店响应通过 `highlight` 指定不高亮、种子包闪光或带透明度的图片叠加高亮，`seedSlots`／`quantity` 指定可选的槽位／数量文字。前端按字段渲染，不根据商品 ID 推断样式；升级种子包和模仿者的特殊高亮在后端目录中配置。

`app/LocalMenuApi.ts` 接入项目现有的进程内本地后端，`GameApp` 启动时注入 Cocos 存储适配器；后端不依赖 Cocos 或 client。用户、设置和各用户存档继续沿用原键名。贴图、位图字体、本地化文案、布局、音效和实际全屏操作由前端负责。以后可替换同一 `MenuTransport` 接入网络服务，目前使用本地传输。

当前接通冒险 1-1 至 2-5。Debug 和 Release 构建均可按 `/` 打开调试 CLI；移动模式双击右下角打开，命令见 [Debug CLI](DEBUG_CLI.zh-CN.md)。主菜单已使用原版图片按钮和 Reanim 入场动画，Options 已接通设置与游戏内操作，图鉴和商店已接入内容与交互；2-6 起的后续关卡及其他模式玩法尚未实现。迁移行为时可参考工作区的 `pvz-remake` 仓库。

`StartupScreen` 自动播放 PopCap Logo 的 200 tick 淡入停留淡出，再进入标题／加载页：标题下落、草皮卷展开，在原版五个进度点播放新版 `ReanimPlayer` 小花／僵尸头动画和音效。计时使用全局时钟的 100Hz 游戏 tick。进度来自主菜单图片和动画的实际准备，预加载的主菜单保持隐藏，点击进入时复用并开始入场。资源全部就绪后，加载条内按按钮规则响应左右键，背景按下、触摸或任意键也可进入；返回标题页不重播 PopCap Logo。新增动画可用 `npm run build:content -- --pak /path/to/main.pak` 单独生成，再重新打包内置 ZIP。

Release 在加载页准备全部资源和动画贴图，图鉴与种子包预览复用 `EntityDisplay` 的内容注册表；`ReanimRepository` 按注册表共享动画数据与贴图，失败后可重试。资源已在引擎缓存时直接读取，图鉴页面等待头像与详情的首帧就绪后再显示。动画节点仍随页面创建和销毁，不常驻整套图鉴。

音效和音乐统一使用 MP3，沿用现有 `tools/pvz/audio.py`／`tools/pvz/music/convert.py` 转换流程，兼容 Web、iOS、macOS、Windows 和 Android 的音频加载器。音乐使用 LAME VBR q2，音效使用 q4，采样率统一为 44.1kHz；动态鼓点各轨不裁剪静音、不单独归一化，循环与节拍数据保持不变。压缩减少下载和包体大小，解码后的 PCM 内存不会按同样比例减少。

关卡触摸种植沿用旧版 `pvz-remake`：轻点种子包保留选中，拖出后显示植物预览和行列辅助线，松手提交种植；拖回原种子包或落点无效则取消，也可直接点选另一张可用卡。`LevelInputPresenter` 捕获同一根手指的完整操作，暂停时清理；滑动收集按每 24px 采样，选卡高亮复用 `SeedPacketView` 的移动模式，仍调用现有后端指令。

页面不再显示临时黑色标题条。`MenuPages.heading` 声明原版标题的字体、基线和颜色，文案从 `pvz:strings` 读取；商店使用原版招牌。`ChallengeScreen` 绘制 Mini-games／Puzzle／Survival 的 20／20／11 个缩略图按钮和档案奖杯计数，复用 `UI.button` 的捕获、hover 与按下状态，点击尚未接通的模式显示未开放提示。`MenuPageControls` 提供花园切换／商店入口和成就返回按钮；领奖页使用原版按钮贴图，目前仍提供重玩 1-1。

`AlmanacScreen` 提供植物种子包、僵尸静态缩略图、条目选择、详情卡、费用、冷却说明和彩色位图介绍。`AlmanacEntityView` 播放 49 种植物和 26 种僵尸的详情动画，不创建战斗实体；部件组装通过 `EntityDisplay` 与种子包静态姿态复用。绘制偏移、缩放和阴影对应原版 `Plant::UpdateReanim`／`Zombie::GetDrawPos`；蹦极绳索使用原贴图随身体挂点移动，计时接全局时钟。资源用 `npm run build:content -- --pak /path/to/main.pak` 生成。`AlmanacText` 保留原文格式标签，在 `UI.scroll` 的内容容器中排版；通用的 `UIScroll` 和 `ScrollGesture` 复用上一版 `pvz-remake` TypeScript 的滚轮、滑块拖动和移动端触摸滚动，惯性使用全局时钟。`StoreScreen` 提供汽车、招牌入场、四页货架、悬停说明、金币和 0.5 秒车门翻页，动画使用全局时钟。`server/menu/StoreCatalog` 根据当前档案的进度和购买槽位计算开放条件、价格、库存和确认购买，金币沿用原版单位（存档的 1 金币显示为 $10）；API 确认时重新读取档案后扣款，在后端保存。戴夫动画暂不创建；购买道具在战斗内的具体效果由对应系统接入。

`AchievementScreen` 进入时通过 `getAchievements()` 一次读取成就定义（玩法定义的 `achievements` 表，本体 21 条按原版顺序，Mod 可追加）和当前用户已获得的成就 ID。触发、发放和领奖页展示见 [成就](ACHIEVEMENTS.zh-CN.md)。页面沿用两列坐标、70px 图集单元的 0.8 倍图标、绿色标题、位图换行说明，以及已解锁／未解锁图标的 255／32 透明度。复用 `UIScroll` 实现原滚轮每步 435px／0.35 秒、More／Top 每次 230px、触摸惯性，滚动动画接全局时钟。方向键按 GOTY：每次按下把速度设为 30，每 10ms 减 1 并移动对应像素，单次约 435px，连发只重置速度、不叠加。地下平铺背景和返回按钮随内容移动；滚动不请求数据，页面也不授予成就。

主菜单由 `MainMenuScreen` 组合新版 `ReanimPlayer`，`MainMenuConfig` 保留原版按钮贴图、轨道偏移和多边形区域。入场按 `open → sign` 播放并停在末帧，另有独立云层、草和可点击的花。商店、图鉴和成就保留调用页面，关闭后不重播主菜单入场；进入帮助、挑战、花园、标题或战斗会销毁原菜单，返回时创建新实例并重新入场。`MenuPages.retainPrevious` 显式声明保留调用页面的入口，商店从花园打开时也保留原花园。设置、玩家列表、退出确认、暂停、失败和局内设置不是页面，而是菜单弹窗（`client/dialogs/MenuDialog`），对应原版的 Dialog：`GameApp.openDialog` 一次只打开一个，盖在当前页面或已暂停的关卡上，下层保持不变，关闭前不接收输入。主菜单按钮用同一个 `target` 指定页面或弹窗。冒险入口根据当前档案切换开始／继续贴图和关卡数字，点击后播放 4.5 秒闪烁、僵尸手和音效，再进入已有 1-1。人物形象编辑入口目前显示未开放提示。

页面由 `MenuScreen.prepare()` 在后台准备，再通过 `ScreenTransition` 切换。主菜单与成就页沿用旧版 0.75 秒上下滑动和双 S 曲线，主菜单在滑动后继续保留于屏幕外。`PageFade` 跟随页面激活和销毁：普通领奖从白色渐显，帮助从黑色渐显，按原版 180 个 10ms 游戏 tick 递减 alpha（1 倍速为 1.8 秒）。渐变节点只绘图，不阻断鼠标、触摸或键盘；页面渐变开始后立即释放导航锁，可中途返回，帮助页的 Enter／Space／Escape 均返回主菜单。仅资源准备、页面提交和成就滑动期间阻止重复操作。其余页面和弹窗直接切换，不额外添加通用淡入淡出；加载失败保留原页面和返回历史。

`core/GameClock.ts` 提供统一的 `gameClock`。转场、主菜单计时、Reanim、粒子和本地战斗入口共同应用其倍率；`startGameTween()` 复用 Cocos Tween 并同步运行期间的倍率变化，完成或所属节点销毁后取消订阅。只在帧时间入口缩放一次，服务端固定步长仍为 0.01 秒，显式 `advance()`／存档恢复使用传入的游戏时间。Debug 预览可调用 `pvzTime.setSpeed(2)` 设置 2 倍速，`setSpeed(1)` 恢复，`setSpeed(0)` 冻结游戏时间。Options 的战斗暂停独立于全局时钟，菜单和转场仍可正常操作；音频播放速率保持原样。计划中的战斗回退与单步见[回退 tick](TICK_REWIND.zh-CN.md)。

## 植物与僵尸

玩法配置按类别拆分在 `mods/pvz-base/gameplay/definitions/`：`plants.json`、`zombies.json`、`seeds.json` 等；`gameplay/settings.json` 保存全局默认参数，根目录 `content.json` 索引所有分类文件；打包时和 Mod 一样合并为 `assets/gameplay.json`，不增加资源请求。植物和僵尸的数值与 PvZ-Portable 和上一版一致。植物最多带一种能力：`shooter`（射手）、`producer`（向日葵）、`fuse`（樱桃炸弹，100 tick 后 3x3 烧焦）、`mine`（土豆雷，1500 tick 出土、106 tick 升起，炸 1800 且不留尸体）、`chomper`（大嘴花，70 tick 咬合、吞下后消化 4000 tick），没有能力的植物只阻挡（坚果墙）；`deathExplosion` 让爆炸坚果被吃掉时爆炸。`server/plants/abilities.ts` 的 `pvz:plant-abilities` 系统按 `Plant.ability` 状态推进，客户端 `client/plants` 下的视图按该状态切换动画，并负责眨眼、裂纹和土豆雷红灯。

僵尸有两个防具位，与原版一致：一类防具 `helm`（`mHelmType`：路障 370、铁桶 1100）和二类防具 `shield`（`mShieldType`：报纸 150、铁栅门 1100），都写作 `{type, health}`，可以同时装备。伤害按 `Zombie::TakeDamage` 先打盾、再打头盔、最后打本体；盾不吃减速、算波次血量时按 0.2 计入，大喷菇穿过盾同时打本体；头盔、盾耗尽时分别发出 `zombieHelmDropped`、`zombieShieldDropped`；被割草机碾压时，戴着的头盔和盾牌先掉落（`Zombie::MowDown`）；`gait` 引用共用步态表，提供走路地面轨迹、啃食与死亡帧数；`vault` 描述撑杆僵尸的奔跑、跳跃和落地。投射物的 `chillTicks` 让僵尸动画、行走和啃食减半，与原版 `ApplyAnimRate` 相同。樱桃炸弹和爆炸坚果的爆炸会把僵尸烧成 `pvz:zombie_charred`，无头僵尸则变黑停住 300 tick。新增战斗动画由 `npm run build:content -- --pak /path/to/main.pak` 合并进现有转换输出，同步玩法数据并重新打包内置 ZIP。

## 服务端关卡结构

`server/` 按职责分目录，根目录不放文件：

| 目录 | 内容 |
| --- | --- |
| `session/` | 一局游戏的生命周期：`IntegratedGameServer`、`IntegratedGameHost`、`session`、`commands`、`snapshot`、`persistence`、`save`、`createModHost` |
| `state/` | 组件与资源定义（`components`、`levelState`）、事件队列 `events`、随机数 `DeterministicRng` |
| `registry/` | Mod 注册入口：`GameplayRegistry`、`EntityBehaviorRegistry`、`JsonComponents` |
| `level/` | 关卡流程：`level`、`levelAward`、`waves`、`graves`、`conveyor`、`mower`、`loot`、`sun`、`items` |
| `rules/` | 关卡规则：注册表与扩展点 `registry`，内置的 `adventure`、`bowling`、`whackAZombie` |
| `seeds/` | 种子栏与手持物：`seedBank`、`seedChooser`、`planting`、`tools` |
| `combat/` | `projectiles`、`explosions`、`collision` |
| `plants/`、`zombies/` | 植物、僵尸各自的行为 |
| `tutorials/`、`debug/`、`menu/` | 教程、调试指令、菜单后端 |

Mod 通过 `host.get('server/components')` 等固定名称取用模块，名称不随目录变化。

`level/level.ts` 负责通用关卡初始化和进度更新。`state/components.ts` 定义战斗实体、经济与关卡状态，`state/levelState.ts` 定义掉落物、波次与教程状态。天空阳光、掉落物、波次与奖励、僵尸呻吟分别由 `level/sun.ts`、`level/items.ts`、`level/waves.ts`、`zombies/groans.ts` 处理，所有关卡共用。波次和呻吟系统的 Mod ID 分别为 `pvz:waves`、`pvz:zombie-groans`，关卡进度系统为 `pvz:level-progress`。

战斗逻辑按职责组织：`plants/shooter.ts` 处理射击，`plants/production.ts` 处理植物产出，`plants/abilities.ts` 推进特殊能力，`plants/damage.ts` 处理植物被吃与死亡爆炸；`zombies/system.ts` 调度僵尸生命周期，`animation.ts` 计算地面轨迹与动画时间，`damage.ts` 处理受伤与死亡，`poleVault.ts` 实现撑杆跳，`flag.ts` 处理旗帜掉落，`spawn.ts` 共用出生规则。`combat/projectiles.ts` 处理子弹，`combat/explosions.ts` 处理范围爆炸，`combat/collision.ts` 只提供几何计算。模块直接导入各自依赖，不保留统一转发入口；`GameplayRegistry` 只保留行为注册表和 JSON 组件存档。

一局游戏是 `session/session.ts` 中的 `Session`：世界、时钟、指令队列和本局内容定义，`createSession` 同时排好 tick 阶段和系统顺序，`startSession` 开新局。`IntegratedGameServer` 只做调度：开局／读档、排队指令、推进 tick、输出快照与事件。玩家操作规则按职责拆开：`seeds/planting.ts`（选卡可用性、选卡、种植、生成植物、按格查植物）、`seeds/tools.ts`（铲子等工具）、`level/items.ts`（捡阳光、钱币和关卡奖励）、`session/commands.ts`（逐条分发指令，以及哪些指令在 tick 之间执行）、`session/snapshot.ts`（生成 `WorldSnapshot`）、`session/persistence.ts`（世界与存档互转；存档格式与校验在 `session/save.ts`）。规则函数都以 `Session` 为第一个参数，并经由导出的对象（`planting`、`tools`、`items`、`commands`、`snapshot`）互相调用，Mod 用 `host.around` 包装这些对象的方法即可同时影响内部调用。

`server/tutorials/index.ts` 按关卡定义的 `tutorial` ID 选择脚本，统一接收选种、取消、种植、冷却完成和收集阳光回调；`plantingTutorial.ts` 与 `sunflowerTutorial.ts` 只保留对应的特殊引导。没有教程脚本的关卡直接使用通用流程。普通关卡通过 `mods/pvz-base/gameplay/levels.json` 配置行数、初始阳光、种子、波次和奖励，无需新增按关卡编号命名的服务端文件。新增特殊教程时只登记教程脚本，主服务器不增加关卡分支。

## 关卡展示结构

`client/level/LevelScene` 负责通用的开场 → 战斗 → 领奖／失败流程、全局时钟倍率、输入挂起和表现存档，只依赖 `LevelGame` 客户端接口。`LevelView` 组合 HUD、输入、实体、粒子、音频和结算 presenter；`LevelSeedBank` 按关卡配置创建种子包，分别处理费用、冷却、闪光和按钮输入。棋盘行列、可种行、种子费用和关卡编号均读取现有后端关卡定义。

`LevelGameOverPresenter` 使用失败后的前 150 tick，让获胜僵尸保持可见并从当前行走到门口，再衔接进屋行走和镜头移动。靠近门口时保留在门框前方的普通实体层，进入门口后才转入遮挡层；撑杆僵尸等越界位置已在门后方的对象，会在靠近过程中平滑移动到门口裁剪边缘再进入。`ZombieView` 连续推进两段动作的步态，不重新开始动画；服务端快照保持冻结。场上其余动画暂停，获胜僵尸挂件清单 `EntityAttachments`（对应原版 `mAttachmentID`）中的旗帜、惊叹号等继续播放。植物和僵尸外观都从上下文的 `attachments.add(node, type?)` 登记挂件，可按种类移除（如死亡时移除惊叹号）。挂在身体轨道上的动画（`attachToTrack`）自动继承身体的颜色和受击闪光，对应原版 `PropogateColorToAttachments`；清单挂件不继承颜色。失败演出仍持续 1100 tick，音效时序沿用原流程。

`LevelPresentation` 按后端 tutorial ID 选择开场和教程提示配置。已验收的 1-1 铺草坪、预览僵尸和引导步骤位于 `level/adventure/Adventure11*`；通用流程不包含 1-1 时序。`level/boards/DayBoard` 保存白天背景、音乐和进屋门框参数；`mods/pvz-base/presentation/definitions/` 按类别维护植物和僵尸的动画、种子包图集位置、视图类型、阴影和掉落图片，根目录 `mods/pvz-base/content.json` 和 Mod 使用相同的分类索引，打包时合并生成归档内的 `assets/presentation.json`。类型和校验统一位于 `shared/content/presentation.ts`，与玩法定义 `shared/content/gameplay.ts` 对应。后续关卡新增后端内容，并添加或复用 presentation 配置；新场景补充对应 board 展示配置，无需复制关卡流程、输入、HUD 或存档控制器。目前安装了 1-1 至 2-5 内容。

客户端存档统一写入 `level` 字段，读取时兼容原 `adventure11` 字段；开场专属的状态校验放在各自的实现中。共用关卡布局为 `assets/resources/ui/level.prefab`，资源 ID 为 `pvz:level`，保留原 Prefab 和脚本 UUID。`client/showcase` 仅保留独立资源预览探针。

## UI 组件

关卡右上角 Menu 使用原版 (681, 10) 的 117×46 石头按钮，入场完成后显示；手持植物时先取消，随后点击打开游戏内 Options，复用设置、确认重开和保存后返回主菜单的逻辑。空格打开独立的 `GAME PAUSED` 弹窗，保留 Escape 暂停快捷键；Resume／Enter／Space／Escape 返回同一局，长按空格不会反复开关。暂停时保存当前局，冻结服务端逻辑、关卡 Reanim／粒子／Tween 和音乐，不修改全局时钟；恢复时只启用原先开启的动画组件。暂停框保留原版标题下方间距，报纸僵尸动画暂不创建。

`client/ui/UI.ts` 统一创建 label、button、input、checkbox、select、slider、scroll、dialog。坐标相对父节点，x 向右、y 向下；文字复用 `FontRenderer`，默认使用原版位图字形与控件贴图。创建后修改控件值不触发 `onChange`，用户操作才触发回调。

```ts
const ui = await UI.load()
const label = ui.label(parent, { text: 'Music', x: 20, y: 30 })
const button = ui.button(parent, { text: 'OK', x: 20, y: 80, onClick: close })
const slider = ui.slider(parent, { x: 220, y: 30, value: 0.85, onChange: setVolume })
const checkbox = ui.checkbox(parent, { x: 220, y: 80, value: true, onChange: setChecked })
const select = ui.select(parent, { x: 20, y: 140, items: ['A', 'B'], value: 0, onChange: selectItem })
const input = ui.input(parent, { x: 20, y: 190, width: 300, maxLength: 12, onSubmit: saveName })
const confirmed = await ui.dialog(parent, { title: 'Continue?', cancelText: 'CANCEL' }).result
```

`ui.scroll(parent, { x, y, width, height, contentHeight, wheelStep?, bottomPadding?, scrollbar?, wheelDuration? })` 创建纵向 `UIScroll`。文字、图片等节点添加到 `scroll.content`，按 `scroll.contentWidth` 排版；`scroll.offset` 以像素读写滚动位置，内容变化后调用 `scroll.setContentHeight(height)`。组件负责裁剪、滚动条自动显隐、旧版滑块绘制和拖动、触摸惯性及监听清理，计时接全局时钟。图鉴传入 0.6 行的滚轮步长和底部留白。`scrollbar: false` 保留完整内容宽度；`wheelDuration` 开启原双 S 缓动，`scroll.scrollTo(offset, seconds)` 提供程序控制的平滑滚动。

label 通过 `text`／`color` 和 `setPosition(x, y)` 更新；button 提供 `setText()` 和 `interactable`；其余输入控件通过 `value` 读写。dialog 支持模态遮挡、拖动和顶层键盘处理：Enter／Space 确认、Escape 取消，关闭也可调用 `close()`。

`UI.label` 的 `font` 可传字体预设或已加载的 `BitmapFontAssets`，`node` 可绑定已有预制体文字节点，不重复添加渲染器；`pixelAlign` 将最终位置对齐整数像素。1-1 的阳光数、关卡文字、房屋名称和教程提示均复用 Label，字体仍从关卡内容注册表读取，保留 Mod 覆盖。种子包复用 `UIButton` 的按下、捕获和模态处理，输入挂起时禁用组件；冷却、选中、闪光、提示动画和关卡进度条保留专用绘制。

`UIInput` 提供 `value`、`interactable`、`focus()`、`blur()`、`selectAll()`，以及 `onChange`／`onSubmit`／`onCancel`；`filter` 过滤用户输入，`maxLength` 限制长度。Cocos `EditBox` 负责键盘、输入法和剪贴板，画面仍由原版位图字体、编辑框贴图、选区和光标绘制；Web 只在组件内部读取输入元素的选区。鼠标可定位和拖选、双击全选，输入框使用 I 型光标。聚焦时空格作为输入，不触发对话框确认；打开上层弹窗会释放焦点，校验提示关闭后恢复。

`dialogs/UserDialog.ts` 通过 `MenuApi` 完成用户选择、新建、重命名和删除，由后端校验并保存。列表最多显示 8 个用户，当前用户置顶；单击选择、双击或 OK 提交，取消不更换当前用户。命名规则沿用原版的最多 12 个英文字母／数字／空格，提交时折叠多余空格，并提示空名和不区分大小写的重名。删除必须确认，同时清理该用户的旧存档与主／临时存档；删除最后一个用户或首次启动时要求创建用户。主菜单保留原实例并刷新姓名、冒险入口和关卡数字。用户对话框复用 `dialog` 的原版加高底部、额外尺寸和顶部正文布局。

按钮的动作写在 `onClick`，默认在按钮内松开时执行；设置 `clickOnPress` 后鼠标或触摸按下即执行。`pressSound` 在按下时播放，`clickSound` 随动作播放。花园切换使用 `clickOnPress`。配置 `tooltip: '提示文字'` 或 `tooltip: { text, font?, maxWidth?, gap?, offset? }` 即可显示上一版 Pico129 字体、浅黄底黑边的提示。`offset: [x, y]` 按 x 向右、y 向下微调，花园提示对齐上一版中心 x=599、顶部 y=52。提示跟随真实 hover，默认在按钮下方，底部空间不足时翻到上方，长文字换行并限制在所属视口／Canvas 内。也可用 `ui.tooltip(anchor, options)` 手动调用 `show()`／`hide()`；锚点禁用或销毁时自动隐藏和清理。

按钮通过 `skin` 选择原版样式，尺寸默认取原图（石头按钮默认 180×46）：

| skin | 样式 |
| --- | --- |
| `stone` | 默认石头按钮，横向平铺，悬停高亮字形 |
| `back` | Options 大返回按钮，360×100 |
| `seed` | 选卡大按钮，156×42，叠加发光和独立禁用贴图 |
| `seedSmall` | 选卡小按钮，111×26，悬停换图 |
| `almanacIndex` | 图鉴底部目录按钮，164×26，文字向右偏移 |
| `almanacClose` | 图鉴底部关闭按钮，89×26，文字向左偏移 |
| `image` | 自定义图片按钮，`text` 可省略；传入 `images` 时默认使用此样式 |

```ts
ui.button(parent, { skin: 'seed', text: 'Continue', x: 20, y: 80, onClick: next })
ui.button(parent, {
    x: 400, y: 100,
    images: { normal, hover, pressed, disabled }, // SpriteFrame，只有 normal 必填
    polygon: [[7, 1], [328, 30], [314, 125], [1, 78]],
    onClick: startAdventure,
})
```

图片通过现有 `modResources.asset(id, SpriteFrame)` 加载。缺失状态图回退到普通图，按下优先回退到悬停图；缺少禁用图时自动半透明。`font`、`color`、`pressOffset: [x, y]` 可覆盖文字和按下偏移，`pressSound`／`clickSound` 传 `null` 关闭对应音效，`rightClickTriggers: false` 关闭右键触发，`rightClickPressesVisual: false` 保留右键触发但不显示按下效果（图鉴底部按钮默认如此）。

自定义图片按钮可用 `imageBox: { x, y, width, height }` 将贴图布局与命中区域分开，`hoverSound` 设置悬停音效。主菜单底部按钮用此接口保留原版较大的交互区域，图片保持原始大小。

`UIButton` 沿用旧版统一捕获：左右键按下后由原按钮持有操作，拖出／移回只更新该按钮，释放前其他按钮不获得 hover；在原按钮内释放才触发一次点击，区域外释放取消。桌面使用鼠标事件，移动模式使用触摸事件，避免 Cocos 模拟触摸重复触发。`releaseToNormalOnPressOut` 控制拖出画面：原版预设默认恢复普通状态，`image` 默认保留高亮并撤回按下偏移；两者拖出后 cursor 均为默认箭头。`rightClickPressesVisual: false` 仍触发右键操作，但不显示按下画面。

`onHoverEnter` 与画面状态独立，只在真正进入命中区域时触发，`hoverSound` 通过它播放。`UIHoverManager` 统一处理顶层命中、弹窗／页面作用域和 cursor；关闭弹窗会按最后鼠标位置恢复 hover，禁用、销毁或切页会取消捕获。`refreshHoverOnEnable` 默认开启，主菜单按钮按旧版关闭此自动刷新。工厂先完成贴图、回调和多边形配置，再启用节点，避免初始化中提前产生 hover。

帮助页的返回按钮使用 `seed`，图鉴的目录／关闭按钮使用对应专用样式；这些按钮及图鉴首页的查看植物／僵尸按钮已按旧版位置接入页面导航。

`polygon` 使用按钮左上角为原点、x 向右、y 向下的局部像素坐标，范围位于按钮的 `width`／`height` 内。至少三个顶点生效，否则使用矩形；包含边界，支持凹多边形，并跟随节点缩放和旋转。悬停、左右键、触摸与拖出释放共用该命中区域，区域外可穿透至下层控件。按下偏移仅作用于画面。

Options 保留旧版位置和操作：音量实时保存（音效上限为 0.65），全屏在关闭时提交，3D 加速固定开启，原生移动端固定全屏。游戏内重开和返回菜单需要确认；返回菜单会保存关卡。设置沿用 `pvz-remake:settings:options` 存储键。Windows 和 macOS 原生端像原版的 `PreferredX`／`PreferredY` 一样记住窗口：`Game.cpp` 跟踪普通窗口（非全屏、最大化、最小化）的位置和大小，退出时写入可写目录的 `window.txt`，下次创建窗口前读取；位置已不在任何显示器上时退回默认的居中 800×600。

## 资源

`npm run build:content -- --pak /path/to/main.pak` 将原版 PAK 解包到临时目录，资源按 `images`、`fonts`、`audio`、`reanim`、`particles`、`music`、`json`、`text`、`prefabs` 直接转换到 `mods/pvz-base/assets/`，更新 `content.json` 的显式索引，再调用通用 Mod 打包器。转换资源由 Git 忽略；手工维护的玩法和表现配置保持不变。临时解包目录在成功或失败后都会清理，不再生成旧 Bundle 或持久化的 raw/generated 目录。引导场景、编译 Prefab 和 shader 继续由引擎管理。

将自己游戏副本的 `main.pak` 和 `PlantsVsZombies.exe` 放到 `tools/` 下，在项目根目录执行：

```sh
npm run build:content -- --pak /path/to/main.pak
```

完整导入需要 Python 3.10+、Pillow、ffmpeg 和 libopenmpt。`npm run build:content -- --pak /path/to/main.pak --exe /path/to/PlantsVsZombies.exe` 从原版 PAK 和程序转换并发布内置 ZIP；省略 `--pak`／`--exe` 时默认读取 `tools/main.pak`、`tools/PlantsVsZombies.exe`，缺少任一文件即报错。日常修改现有 Mod 资源或配置后，执行 `npm run mod:pack -- pvz-base --publish assets/resources/base.zip` 即可，无需重复转换。

应用图标来自原版游戏图标，同样不纳入 Git。`npm run build:icons -- --ico /path/to/game.ico` 生成 `build-templates/web-mobile/` 下的网页图标（`game.ico`、`icon-256.png`、`apple-touch-icon.png`），以及 `native/engine/` 下 macOS、iOS、Android、Windows 的图标，输出均由 Git 忽略；省略 `--ico` 时默认读取 `tools/game.ico`。图标即原版 `PlantsVsZombies.exe` 中的 `IDI_MAIN_ICON` 图标组，其中 16×16 一帧是窗口标题栏上的小花。

鼠标指针只存在于原版程序中，`main.pak` 里没有。转换开始前先从 exe 提取原版 `LawnApp::EnforceCursor` 使用的大箭头（程序的光标资源）和 SexyAppFramework 的手形、拖动手形（`CreateCursor` 的 32×32 遮罩），按内容哈希定位，不依赖资源编号或文件偏移；结果作为 `pvz:cursor_pointer`、`pvz:cursor_hand`、`pvz:cursor_dragging` 图片登记到 `content.json`，随内置 ZIP 发布，资源包可用同名 ID 替换。`CursorManager` 把 `default`／`pointer`／`grabbing` 分别对应到这三张图和原版热点（高密度替换图按 `scale` 放大热点），网页使用 CSS 光标，Windows 和 macOS 原生端通过引擎的 `jsb.setCursorImage` 创建 SDL 彩色光标；`/cursor false` 或图片加载失败时使用系统光标。


存档继续检查基础内容 ID、版本、哈希和玩法 Mod。ZIP 和 Mod 共用 `manifest.json`、`content.json`，玩法与表现定义直接由统一索引引用，哈希覆盖默认文件和资源映射；外部表现覆盖不会修改服务端玩法 JSON。

## 检查与构建

macOS 安装 Xcode 后，`npm run compile:ios:release` 会导出当前资源，再调用 `cocos make` 编译并生成用于自签的 `build/ios/pvz-remake-mobile-unsigned.ipa`。该 arm64 iPhone Release 构建不需要配置开发团队。Cocos 检查 ZIP 完整性并生成 `.ipa.sha256` 校验文件；中间 `.app` 保留在 `build/ios/proj/Release-iphoneos/`。

```sh
npm run typecheck:server
npm run test:server
npm run build:web:debug
```

### 测试规范

- 自动测试主要覆盖核心玩法、存档和恢复、Mod 加载与隔离、客户端与服务端边界，以及关键输入流程。优先验证可观察的行为和必要边界，复用或扩展现有用例，避免重复覆盖和依赖内部实现的断言。
- 简单、低风险改动采用最小必要验证；动画、布局、文案等细节通常通过针对性的人工检查验证，只有存在重要回归风险时才增加自动测试。不为固定美术坐标、颜色、播放速率单独建立用例，不用读取源码再匹配字符串的方式固定代码写法。
- 日常改动先运行直接相关的测试，必要时执行类型检查；跨模块改动或明确要求完整验证时运行 `npm run test:server`。该命令包含服务端类型检查和 `tests/**/*.test.ts` 的全部测试，无需再重复运行 `typecheck:server`。
- 例如，单独运行一个测试文件：`npx tsx --tsconfig tsconfig.server.json --test tests/server/save-restore.test.ts`。测试失败时保留有效检查，区分本次引入的问题与已有问题，不通过删除或跳过关键测试掩盖失败。
- 自动测试、构建和实际运行验证分别报告。画面、交互或平台问题需要时在对应环境检查；原生构建成功不等于已完成真机验证。除非需要验证实际画面或交互，避免使用浏览器自动化。

Windows 和 Android 构建命令仍然保留；Web 验证不代表已通过原生编译或真机检查。

### 预览的模块映射

Cocos 预览把每个脚本编译成 SystemJS 模块，导入写成 `__unresolved_N` 这样的占位名，再由 `temp/programming/packer-driver/targets/preview/import-map.json` 逐个模块对应到文件。修改被很多文件引用的模块（例如 `shared/protocol`）后，个别模块的编译代码和映射可能对不上，导入会悄悄取自别的模块。运行时表现为莫名的 `undefined`，例如 `Cannot read properties of undefined (reading 'name')`，而 Node 测试一切正常。

```sh
npm run check:preview            # 检查，并 touch 映射错位的源文件让预览重新编译
npm run check:preview -- --dry-run   # 只检查，不改文件
```

脚本（`tools/preview/check-imports.ts`）对每个模块导入的每个名字，检查映射指向的源文件是否确实导出了它，列出错位的导入。touch 之后等预览重新编译完再刷新页面。预览没有运行过时没有可检查的内容，脚本直接退出。预览模式下 `Error` 带着调用栈转发到 `temp/logs/cocos.log`，服务端出错时 `IntegratedGameHost` 也会打印原始错误，可以从那里看到出错位置。

### iOS 性能分析

iOS 禁止 JIT，V8 以解释模式运行，JS 开销远高于桌面，性能结论以真机为准。`PVZ_JS_PROFILE=1 npm run compile:ios:release` 在 Release 构建中打开 V8 调试端口（6086），不改变 `CC_DEBUG`。安装后用 `pymobiledevice3 usbmux forward 16086 6086` 转发端口，再运行 `npx tsx tools/profile/ios.ts http://127.0.0.1:16086 10 /tmp/pvz.cpuprofile` 采样并列出耗时最高的函数。`/level pvz:stress-test` 加 `/fps true` 用于高负载对比。

动画和粒子不再每个部件一个节点：`ReanimPlayer` 把动画的图片放进共享图集页（`AnimationAtlas`），每个实例用一两个 `ReanimBatch` 直接写顶点；只有 `getTrackNode` 用到的部件才建节点，并在该处切开批次以保持绘制顺序。关键帧采样、过渡、附着矩阵、写顶点只在 `native/engine/common/kernel/` 的 C++ 里实现一次：原生平台经 `KernelBindings.cpp` 直接调用（iOS 的 JS 引擎没有 JIT，也就没有 WebAssembly）；Web 和测试使用同一源码编译的 WebAssembly，由 `assets/scripts/shared/kernel/` 统一封装。修改 C++ 后运行 `npm run build:kernel`（需要 Emscripten）重新生成并提交 `binary.ts`，其他构建不需要 Emscripten。粒子统一使用 `shared/content/particle.ts` 的 schemaVersion 3 格式与 `client/particle/ParticlePlayer` 入口。随机数、生成、寿命、场、颜色和变换由同一 C++ 核心计算，每个发射器一个 `ParticleBatch`，直接接收核心生成的四边形；同一帧的多个模拟 tick 一次进入核心，仅渲染最后状态。存档继续保存种子和年龄，通过核心重放恢复，播放器销毁或重新播放时释放核心状态。达到固定生成上限且已无粒子的系统会合并等待到期的 tick，并跳过空渲染，原寿命和存档年龄保持一致。

Debug 构建保留 `pvzPhase4` 关卡调试入口；Mod 开发和安装见 [Mod 说明](MODS.md)。

### 植物与僵尸的客户端表现

- `client/plants`：`ShooterView`、`SunflowerView`、`CherryBombView`、`WallNutView`、`PotatoMineView`、`ChomperView` 分别处理专属表现；`AnimatedPlantView` 复用身体动画加载、混合、眨眼和存档逻辑。
- `PlantView` 统一创建后的同步、射击事件和存档接口，`PlantViewRegistry` 注册并创建内建及 Mod 视图，`LevelEntityRenderer` 管理实体生命周期、图层和事件分发。
- `client/zombies/ZombieView` 读取僵尸表现定义，处理快照驱动的播放、受伤部件、寒冰颜色、旗帜和碾压；数值、移动和技能状态仍由服务端控制。
- `ClientAnimationRegistry` 从上述 JSON 初始化，保留 Mod 动画覆盖、参数校验和冻结逻辑。新增表现应在对应定义和专属视图中维护，避免向通用关卡渲染器追加类型 ID 分支。

玩法配置和表现配置分别命名为 `GameplayDefinitions` 和 `PresentationDefinitions`，均按“加载 → 校验 → 返回对象 → 注入使用方”流转。`loadIntegratedGameContent` 返回 `definitions` 与 `presentation`；UI 通过 `UIAssets.presentation` 持有自己的表现定义。`ClientAnimationRegistry` 显式接收表现定义，视图与种子包通过构造参数或上下文使用配置，不设置全局配置单例。

`shared/content/DefinitionRegistry` 使用现有通用 `Registry` 登记基础内容与 Mod JSON，登记结束后统一校验引用并冻结。服务端入口注册玩法表、关卡、显式关卡补丁和整体覆盖 `overrides`（任意已有 ID，同一 ID 仅限一个 Mod，在全部登记后、关卡补丁前生效），客户端入口注册表现表与名称文本；新的植物 ID、动画目标和视图工厂都经过注册表进入实际运行流程。UI 与战斗读取同一组 Mod 表现定义。新增植物示例及 API 见 [Mod 文档](MODS.md#新增植物与内容注册)。

僵尸通过 `gait` 引用玩法定义中的 `zombieGaits`，`tongueChance` 和 `walk2Chance` 独立声明动画变体；不能从是否配置步态推断其他能力。植物能力的 `targeting` 声明范围、持杆目标过滤和交互修正键，僵尸的 `targetingInsets` 提供对应修正；撑杆落地后的攻击框使用 `vault.landedAttack`。客户端土豆雷的距离计算直接读取玩法攻击框和僵尸身体框。

表现定义中的 `projectiles`、僵尸 `helm`/`shield`/`drops` 声明图片、轨道、特效、偏移和音效；音效的 `pitchRange` 是音高随机范围（负值表示降调，如撕报纸声的 -2）。防具的 `dropSounds` 在破碎时和 `dropReanim` 一起播放，绕过盾牌的伤害两者都不播放。`seedPackets` 保存图集格子和布局，`almanac` 保存绳索和浮动动画参数。新增同类内容应补定义，通用渲染器不按具体 ID 或数字编号分支。工厂按视图类型分派、专属技能状态机和单位换算常量仍保留在代码中。

普通与传送带种子包共用 `LevelSeedBank` 的视图、按钮、tooltip，以及 `LevelInputPresenter` 的鼠标、触摸和快捷键流程。选卡以当前槽位索引读取状态：普通卡发送 `selectSeed`，传送带卡发送 `selectConveyorPacket`，后者保留每张卡的独立 ID。`LevelBoardHud` 负责可选工具、戴夫和传送带布局，不另做种子包命中检测。

种子包快照的 `availability` 由服务端 `planting.seedAvailability` 计算，携带拒绝原因与 `warningKey`，普通卡与传送带选卡命令会调用同一方法重新验证。客户端直接读取结果显示置灰、tooltip、cursor 和选卡音效；Mod 扩展这一个计算方法即可，额外拒绝提示通过 `planting.rejectSeed` 发出，状态查询不产生音效或 advice。Corn 不再挂钩客户端选卡和置灰逻辑。

铲子也使用 `UIButton` 和同一触摸流程：按下拿起，拖动瞄准，松手执行，拖回来源按钮取消。教程阶段允许此流程；暂停会结束手势。服务端 `SeedBankState.selection` 只有未选择、普通卡、传送带卡、工具四种互斥状态；传送带只保存卡片 ID，通过 `server/seedBank.selectedSeedId` 查询其种子。存档使用同一结构，旧并列字段格式直接判为不兼容。

关卡玩法配置中，`conveyor` 声明容量、间距、移动周期、供卡权重和分档生成间隔；`plantingLine: {column}` 是关卡自己的种植线（坚果保龄球的红线）：玩家不能种在该列右边，第一次越线时提示 `ADVICE_NOT_PASSED_LINE`；红线的贴图、偏移和在哪些戴夫台词期间显示，写在关卡表现定义的 `plantingLine`（`{sprite, offset, dialogs}`）。任何关卡都能用，不依赖 `pvz:bowling` 规则。可用工具按原版推算：某关奖励的工具，首次冒险从下一关起可用，重玩时每关可用。只属于某一关的流程（Dave 对话、铲子教学的初始植物、2-1 的首枚金币和存钱上限、选卡提醒、卡槽升级推销）写在该关的教程脚本里（`server/tutorials`），关卡的 `tutorial` 只填脚本 ID。脚本的 `dave` 让戴夫出场，`dialogQuestion` 把当前台词标为“是/否”提问，由客户端通过 `answerDialog` 回答。教程的 `blocksIntro` 阻止入场结束，`blocksStart` 阻止出怪，二者独立。表现配置 `conveyor`、`shovel`、`dave` 保存布局、动画资源、速率和对话表现参数。

关卡波次可以逐波列出（`waves: [{ zombies, flagWave?, points? }]`，如 `mods/example`），也可以由已注册的关卡规则生成：`rules: { kind, count, ...settings }`，二者选一。关卡规则（`server/rules/registry.ts` 的 `LevelRuleDefinition`）除了生成波次，还可以在原版 `Board` 调用 `Challenge` 的固定位置改变玩法：`systems`、`spawnsZombies`、`initialize`、`boardClick`、`cursorCleared`、`dropsRefusedSeeds`、`canPlantAt`、`dropLoot`、`holdsAward`，自己的状态存在 `wave.ruleState`（由 `parseState` 校验），给客户端的状态放在快照的 `extensions[kind]`。通用代码只调这些扩展点，不按关卡或规则 ID 判断。客户端对应的视图在 `client/level/rules/`（`registerLevelRuleView`），表现参数在 `presentation/definitions/rules.json`。内置三种规则：`pvz:adventure`、`pvz:bowling`（冒险出怪、点数固定乘 4、不掉钱）、`pvz:whack-a-zombie`。内置的 `pvz:adventure` 按原版首次冒险的 `Board::PickZombieWaves`：每波点数、旗帜波的普通僵尸和旗帜僵尸、可选的点数倍率 `pointsScale`（1-10 为 3）、在随机挑选前放入的 `fixedZombies`（本关引入的僵尸，放在第 count/2+1 波和最终波），以及最终波按僵尸池顺序补齐还没出现的有权重类型（`PutInMissingZombies`）。规则自己校验参数。`zombiePool` 的条目可以只写僵尸 ID，`points`、`weight`、`firstWave` 取僵尸的 `wave`，也可以写对象覆盖。整局出怪计划在开局时生成并随存档保存。Mod 通过 `GameplayRegistry.levelRules.register(owner, kind, { validate, draft, ...扩展点 })` 注册新规则。

玩法 `boards.*.bounds` 决定场地水平边界，僵尸 `dropsFlag` 决定掉旗能力；表现 `boards` 保存背景、音乐和失败场景坐标。粒子的可选剩余时长随快照保存，种子闪光读取 `seedPackets.flash`，恢复不再按特效 ID 分支。商店数据位于 `mods/pvz-base/gameplay/store.json`，价格档位、购买条件、库存规则和购买结果均由服务端目录实例执行；应用只负责加载 JSON 并注入后端。

Mod 入口统一为 `register({ host, assets })`，通过 `host.get()` 访问真实宿主模块与注册表，`host.around()`／`host.replace()` 包装实际方法。不再提供系统、页面、动画的专用增强接口。额外 ECS 组件经 `GameplayRegistry.components` 登记后参与世界快照和存档。示例见 [Mod 能力示例](../mods/example/README.md) 和 [Mod 文档](MODS.md)。
