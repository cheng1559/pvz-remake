# Mod 与内容包

所有扩展统一是 Mod，纯资源包无需代码入口。安装、依赖、优先级、启用状态和卸载均由同一个管理器处理。

## 安装与管理

```text
/mod
```

`/mod` 是唯一管理命令，不接受子命令。窗口中点 Import 选择 ZIP，可一次选择多个包；勾选启用，箭头调整资源优先级，越靠上优先级越高。依赖先加载；同 ID 资源由后加载的 Mod 覆盖，游戏定义的重复 ID 会报错（整体替换定义需显式写在 `overrides` 中）。`pvz` 是内置基础包的保留 ID，不允许导入。

Mod 按玩家隔离：每个玩家有自己安装的 Mod、版本、启用状态和顺序，`/mod` 只显示和修改当前玩家的。ZIP 按“ID + 内容哈希”存一份，内容相同的 ZIP 在玩家间共用；没有玩家引用的 ZIP 在启动时清理，删除玩家时其 Mod 记录随档案一并删除。新建玩家时，若原玩家装有 Mod，会询问是否同步给新玩家（第一个玩家直接接手此前安装的 Mod）。切换玩家时，若对方启用的 Mod 或版本与正在运行的不同，提示重启后切换；取消则留在原玩家。旧版全设备共用的安装记录升级后直接丢弃。

导入时校验 ZIP，将压缩文件原样写入独立暂存区，不覆盖已安装的 Mod；Cancel/ESC 会丢弃草稿并删除暂存文件，包括新包和已有 Mod 的更新。更新已有 Mod 保留原位置。

Apply 后若涉及导入、卸载、启用或已启用项排序，确认重启后先显示 `Restarting...` 并锁住管理窗口，保存当前关卡及待应用清单，再重启。Apply 不重新解压 ZIP 或安装、删除 Mod；下次启动期间只显示原有 PopCap Logo，后台校验依赖、安装和卸载，完成后加载游戏资源并进入标题页。任务失败会保留清单和暂存 ZIP，错误记入日志，点击 Logo 重试；运行中的代码、音频和图片继续使用原归档快照。仅调整未启用项的排序直接保存，无需重启。

只有 ZIP 安装方式。Web 使用 IndexedDB；Native 使用应用可写目录的 `mods/`。损坏或缺少依赖的归档会停用并在窗口显示错误，不阻止打开管理窗口。

管理窗口先显示 `Loading...`，读取完成后显示列表。

## 文件定义

源码和 ZIP 都使用根目录 `manifest.json`、`content.json`：

```json
{
  "schemaVersion": 1,
  "id": "example",
  "version": "1.0.0",
  "apiVersion": 1,
  "contentHash": "generated-on-pack",
  "dependencies": []
}
```

纯资源 Mod 只需以上信息。需要脚本时，在清单添加 `gameplay`（`nodeModule`、`cocosModule`）或 `client`（`module`，可选 `bundle`）。源码入口为 `src/server/index.ts`、`src/client/index.ts`，编译产物路径由清单指定。

`content.json` 统一索引游戏定义、表现定义和资源：

```json
{
  "gameplay": {
    "plants": "assets/gameplay/plants.json",
    "seeds": "assets/gameplay/seeds.json"
  },
  "presentation": {
    "plants": "assets/presentation/plants.json"
  },
  "resources": {
    "sprites": {
      "example:plant": { "file": "assets/sprites/plant.png", "width": 80, "height": 80 }
    },
    "audio": { "example:launch": "assets/audio/launch.mp3" }
  }
}
```

定义索引的路径相对于根目录 `content.json`。`plants.json`、`seeds.json` 等是 ID 到配置的对象。每个种子必须写 `position`，即它在自己所属分组里的格子序号：按 8 列从左到右、从上到下数，从 0 开始，一页 48 格，同一分组里不能重号。分组有三类，依次是原版、各 Mod、隐藏卡：本体的种子属于原版组，就是选卡格子，序号即原版的植物种子编号，只能是 0–47 的植物（平时 5 排 0–39，拥有 40–47 号即原版升级植物中任一张时按原版 `Has7Rows` 改成 6 排，行距 70、首排 y=123；48 号是原版的模仿者）；本体种子写 `"hidden": true` 的属于隐藏卡组（爆炸坚果、两种保龄球坚果、各僵尸卡、墓碑卡和弹坑卡）；Mod 的种子一律属于这个 Mod 自己的一组，从 0 自行编号，不会和本体或其他 Mod 冲突，也不能标 `hidden`。Mod 的种子不进选卡格子：开启 `/cheatseed` 时，选卡界面和图鉴在原版页之后按 Mod 的加载顺序给每个 Mod 单独排页，最后是隐藏卡页；平时由 `seedChooser.entries` 提供。没有卡的序号留作空位。和其他定义表一样，Mod 只能登记自己命名空间的种子；要挪动本体或其他 Mod 的卡，用 `overrides.seeds` 整条替换那颗种子的定义。配置按类别分文件。表现定义和玩法定义一样严格：每个对象只接受它自己的字段，多写、拼错或已经搬走的字段（例如僵尸表现里的 `vault`）都报 `… is not supported`；植物开火后跟着的粒子写在植物表现的 `fireParticle: {id, x, y, delayTicks}`（大喷菇的烟）。植物、僵尸、子弹、物品和格子物品的表现都可以写 `viewConfig`：一个任意的 JSON 对象，原样保留，给 `view` 指定的视图（通常是 Mod 自己注册的）读取和校验，本体只检查它是对象。关卡规则的表现（`rules`）里除 `graveRise` 外的字段归该规则自己的视图读取和校验。掉落物的点击范围是玩法：物品定义的 `clickPadding` 和关卡的 `itemClickPadding`，由服务端判断点中了哪个。

成就写在玩法定义的 `achievements` 表里，ID 到 `{ titleKey, descriptionKey, icon: { sprite, index } }`，图标取 `sprite` 中按 70×70、每行 7 格切出的第 `index` 格。成就页和领奖页按本体在前、各 Mod 依次在后的顺序列出。服务端脚本通过宿主模块 `server/achievements/achievements` 的 `grantAchievement(world, id, announce)` 发放：玩家已有的不重复发放；`announce` 为 true 时在关卡里立即提示，否则留到过关后的领奖页列出。档案由客户端转交菜单接口保存。成就怎么获得写在它的 `trigger: { kind, ...设置 }` 里：游戏代码只发服务端事件，成就模块观察每个事件，按 `kind` 对应的触发类型判定。本体的触发类型有 `pvz:blast`（`plants`、`kills`）、`pvz:bowling`（`plants`、`hits`）、`pvz:coin-streak`（`items`、`coins`）、`pvz:sun-held`（`sun`）、`pvz:win-planting`（`boards`、`skipRules`、`only` / `never`）和 `pvz:mind-controlled`（`zombies`），详见 `docs/ACHIEVEMENTS.zh-CN.md`。Mod 的新成就可以直接用这些类型；需要新的判定方式时，用 `registry.achievementTriggers.register(ownerId, kind, { validate, observe })` 注册（`registry` 是宿主模块 `gameplay/registry`，即 `server/registry/GameplayRegistry` 的实例），`observe` 收到事件、设置和这个成就在关卡里的状态（随存档保存）。要让本体成就认到 Mod 的植物，用 `overrides` 改它的 `trigger`。关卡定义写 `achievements: false` 时，这一关不发放任何成就，适合测试关卡。

商店、图鉴和工具也是玩法定义表，和其他表一样，Mod 用自己的命名空间新增条目、用 `overrides` 改任何人的。`store` 按物品 ID 写商店物品：`{ page, place, cost 或 prices, message 或 messages, purchase, level?, completed?, requires?, effect?, unlockChallenge? }`。物品 ID 同时是档案里购买计数的键，各 Mod 的物品互不占用。`page` 指向 `storePages` 表里的一页（`{ level? }` 或 `{ completed: true }`，即原版 `StoreScreen::IsPageShown`；页按登记顺序排列，本体四页在前，各 Mod 的依次在后），`place` 是这一页上下两排共 8 格中的第几格（0–7），同页同格只能有一件：Mod 可以放进本体页的空格，也可以登记自己的页。`prices`、`messages` 按已买次数取档；`requires` 里的 `anyPurchases`、`allPurchases` 写物品 ID。`purchase.kind` 为 `set`、`count`、`stock`、`timestamp`、`plant`（往禅境花园放一盆 `settings` 里 `zenGarden.template` 的植物）或 `seed`（卖一颗种子，可以是还没安装的升级植物）。全店必须恰好一件 `effect: "seedSlots"`（显示的槽位数按 `seedBank` 的 `baseSlots` 每买一次加一算，不超过 `maxSlots`），即戴夫在关卡里推销的卡槽升级。物品的外观写在表现定义的 `store` 表（同一 ID：`sprite`、`offset`、`highlight`；`stock` 类一次卖几个时写的“x5”来自玩法数据的 `amount`；没有 `sprite` 时画所卖种子的卡包），商店界面的时间和戴夫的闲聊写在表现定义的 `storeDialogue`。

图鉴的植物页就是选卡格子（原版 `AlmanacDialog::GetSeedPosition`），不用写条目；`almanac` 表按僵尸 ID 写僵尸页的窗口 `{ place, startingLevel, spawnedOnly?, afterAdventure? }`，`place` 是每行 5 个从 0 数的位置，不能重复，键必须是已有的僵尸。植物或僵尸在图鉴里站的地面写在表现定义的 `almanac` 表，按植物或僵尸 ID：`ground` 为 `day`、`night`、`pool`、`nightpool`、`roof` 或 `ice`，植物可加 `upgrade: true`（升级植物的卡包底色）；没有条目时站在白天的地面上。

工具写在 `tools` 表里，ID 到 `{ kind }`，`kind` 说明它做什么，目前只有 `shovel`（铲起格子里的植物）。关卡的 `tools` 和 `kind: "tool"` 的奖励都必须指向已有的工具，每个工具还要有表现定义 `tools` 里的外观，缺了就是加载失败。

教程脚本和关卡规则一样是服务端登记项：用 `registry.tutorials.register(ownerId, id, script)` 登记（`server/tutorials` 的 `TutorialScript`），关卡写 `tutorial: id` 使用它。加载时检查每关的 `tutorial` 都已登记，写错或没登记的名字让加载失败，不会当作没有教程；没有教程的关卡不写 `tutorial`。脚本自己的步骤（`TutorialResource.step`）用自己的命名空间，如 `example:dig`，随存档保存。

植物的 `visual.nameKey`（必填）、`visual.tooltipKey` 分别指定名称和选卡说明的文本键，文本写在 Mod 的 `pvz:strings` 资源里。未指定 `tooltipKey` 时沿用原版的 `名称键_TOOLTIP` 约定。种子包默认画植物自己；`visual.packetPlant` 写另一株植物的完整 ID 时画那一株（如保龄球坚果画普通坚果）。卡包里植物图的位置和大小写在植物的 `packet.placement`（`{ scale, offsetX, offsetY }`，原版 `SeedPacket::DrawSeedPacket` 的偏移），不写时用 `seedPackets.defaultPlacement`；`packet` 的其余字段是原版 `Plant::DrawSeedType` 的偏移和姿势，`packet.phase` 指定图里植物所处的阶段（小阳光菇、亮灯的土豆雷），不写时与场外相同（玩法动画的 `offBoard`）。

每个僵尸定义都必须写 `wave: { points, weight, firstWave? }`，即原版 `ZombieDefinition` 的分值 `mZombieValue`、出怪权重 `mPickWeight` 和最早出现的波次 `mFirstAllowedWave`。分值既是出怪时花的点数，也决定它死亡时掉钱的概率（`Zombie::DropLoot`），所以只在列出的波次、墓碑或调试命令里出现的僵尸也要写；不想被出怪池随机选中就把 `weight` 写成 0。关卡 `zombiePool` 的条目可以覆盖这些值。缺少 `wave` 的僵尸在加载时报错。

所有文字只存在一张按键合并的文本表 `pvz:strings` 中：本体一层是原版文本（含关卡提示语；服务端只发送提示的键）加上本体新增的界面文本（手写在 `tools/pvz/ui-strings.json`，生成 pvz-base 时合并进来，键不得与原版重复）。Mod 在 `content.json` 的 `json` 类资源里登记自己的 `pvz:strings` 文件作为一层：新增的键必须带自己的命名空间（如 `example:menu`），已有的键（本体或任何 Mod 的）都可以改写，按启用优先级后面的生效，所以翻译包只需列出要改的条目，也能翻译其他 Mod 的文字；不符合规则的新键会被忽略并在控制台报错。背景音乐每首是一个 `music` 资源，ID 为 `pvz:曲目名`（如 `pvz:night_moongrains`），格式见 `shared/content/music.ts`（schemaVersion 3：时长、循环点、以音频资源 ID 表示的分轨，可选原版爆发段落）。音乐 Mod 用同一 ID 登记要替换的曲目即可，其余曲目沿用本体。字体只按 ID 覆盖，没有“只读本体”的特例：快捷键字母使用独立的 `pvz:hotkey`（与 `pvz:houseofterror16` 同一份文件），文字包只覆盖后者，快捷键保持原版字形；高清包需同时登记 `pvz:hotkey` 才会重绘它。`ui.text(key)` 只接受键，不带默认值；缺失的键显示键名并在控制台报错。翻译包在 `manifest.json` 的 `locale` 写明文字语言（如 `zh-CN`，最后一个声明了 locale 的已启用 Mod 生效，默认 en-US）；本体通过 `ui.locale` 提供该值，图片里带文字的素材据此选择版本（例如宽屏 Mod 的成就页顶部）。

射手的 `shooter.initialDelayTicks` 和 `shooter.cadenceTicks` 均使用整数范围，例如初始等待 `{ "min": 0, "max": 150 }`、周期 `{ "min": 136, "max": 150 }`（周期最小值必须大于零）。服务端使用局内 RNG 抽取初始等待和每次周期；没有目标时也推进周期，当前时钟与 RNG 状态随存档保存。固定间隔使用相同的 `min`、`max`。射手可以带一个 `fright` 能力（胆小菇，`Plant::UpdateScaredyShroom`）：`{ center, radius, rowRange, lowerTicks, raiseTicks }`，敌对僵尸的身体进入植物左上角加 `center` 周围 `radius` 以内、相差不超过 `rowRange` 行时，依次经过 `calm`、`lowering`（`lowerTicks`）、`scared`、`raising`（`raiseTicks` 范围）四个状态，不在 `calm` 时不射击，回到 `calm` 后隔一个完整周期（`cadenceTicks.max`）才射；它不能和引线、地雷、大嘴花、墓碑吞噬者或生长能力同时写。引线 `fuse: { ticks, explosion 或 freeze }` 二选一：`explosion` 是樱桃炸弹的爆炸，可再加 `crater: { ticks }`，爆炸后在植物的格子留下一个持续 `ticks` 的弹坑（毁灭菇），弹坑属于植物那一方；`freeze: { ticks, coldTicks, chillTicks, damage, boardTicks }` 是寒冰菇的冰冻，引线烧完冻住所有敌对的植物和僵尸 `ticks` 范围内的时长（已经被减速或被冻的用 `coldTicks`），减速 `chillTicks`，造成 `damage` 点伤害（穿过僵尸的盾），场地记下被冻的一方 `boardTicks`；夜行植物睡着时引线不烧，僵尸照常啃它。植物和僵尸的定义都可以写 `unchillable` 和 `unfreezable`：植物只能写 `true`（任何时候；某些状态下才免疫由它的类决定，如土豆雷升起时，`PotatoMine.keptFromIce`），僵尸写 `true` 或僵尸状态列表（如撑杆的 `["airborne"]`）：`unchillable` 不受任何减速（寒冰射手和寒冰菇都无效，也就不会被冻），`unfreezable` 不会被寒冰菇冻住，只减速、不掉冰冻的伤害。植物的 `mindControl: true`（魅惑菇）让醒着时啃它的敌对僵尸、或一口咬住它的敌对植物（这一口不算吞下）转到它那一方；僵尸停嘴再走时按自己的类型重新随机速度。僵尸的 `scale` 是画面大小（舞者 0.8，以 Reanim 的 (30, 120) 为中心缩放），走路按这个尺寸走过地面轨迹、动画相应加快。僵尸的 `dance` 让它跟着场上统一的节拍跳舞（`DANCE_BEAT`：前 12 拍走 `walk`，其余拍子按 `raise` 举手站着），需要 `raise` 片段；同组（领舞和它召唤的伴舞）有一个在啃或被冻就整组站住，有一个被减速就整组减速。`dance.lead: { moonwalkTicks, backup, troupe, holdTicks, summonTicks, summonBeforeX, riseTicks }` 是领舞：先用 `moonwalk` 片段（有 `fps` 和按移动方向记的 `ground`）按片段自己的速度太空步 `moonwalkTicks`（减速不影响它，太空步时被冻住的解冻后原地停到太空步结束），再播 `point`（有 `fps`、`hold`）打响指，把 `backup`（必须是带 `dance`、不带 `lead` 的僵尸）召唤到 `troupe` 的每个位置 `{ row, x }`（相对领舞的行和横坐标，植物方左右翻转），伴舞在 `riseTicks` 内从地下升起；之后定住 `holdTicks`，缺伴舞时等 `summonTicks`，到抬手那一拍且横坐标在 `summonBeforeX` 以内再召唤。弹坑卡是 `"kind": "crater"` 的种子，写弹坑持续的 `craterTicks`。弹丸的射程上限 `lifetimeTicks` 写在弹丸定义里对所有发射者生效，只对某种植物生效时写在它的 `shooter.projectile` 里（如小喷菇的 `{ "id": "pvz:spore", "lifetimeTicks": 75 }`，胆小菇射同一种孢子但不限射程）。

僵尸表现的 `shadow` 可以写 `scale`（以影子中心缩放，舞者 0.8）；`held: { x, y, scale }` 是手持时缓存图再缩放 `scale`、再挪 (`x`, `y`)（原版 `Plant::DrawSeedType`，舞王 0.8、(20, 42)）；`portrait` 可以写 `clip`，图鉴小窗画这个片段的第一帧（默认 `idle`，按僵尸的 `scale` 画；种子包的 `packet.clip` 和手持则按 Reanim 原尺寸画）；`drops` 里的部件可以写 `behind: true`，掉落时画在僵尸身后一层（舞王的头）；可以写 `scale`，在特效和僵尸尺寸之外再放大（伴舞的头 1.3125：原版把它的粒子缩放从僵尸的 0.8 换成 1.05）。带 `dance` 的僵尸表现可以写 `dance: { music?, spotlight?, rise? }`：`music` 是领舞第一次打响指时（场上僵尸不多于 15 只）播的音乐，场上没有带头的舞者时停；`spotlight: { floor, floorOffset, beam, beamOffset, scale, colors, colorsFrom, colorTicks, colorStep }` 是领舞第一次响指后的聚光灯，`floor` 画在身下、`beam` 画在身上，颜色从 `colors` 里按年龄轮换；`rise` 是伴舞从地下升起的样子，字段同墓碑僵尸的升起（`depth`、`riseTicks`、`clip`），另加升起开始时的 `particle` 和 `sounds`。僵尸表现可以写 `steps: { effect, marks: [{ at, x, y }] }`：走路动画每到 `at`（片段长度的比例）就在僵尸位置加 (`x`, `y`) 处、比它低一层放一次 `effect`，往右走时左右镜像（橄榄球僵尸的扬尘）。植物表现可以写 `shake: { clip, tracks }`：身体播 `clip` 时，`tracks` 里的每条轨道每 tick 在各方向随机偏移，不超过对应的数值（毁灭菇引线燃烧时的头部抖动）。植物表现可以写 `muzzle: { effect, x, y }`：每射出一发，在子弹出发点（弹丸左上角）加 (`x`, `y`) 处、该行推车层之上放一次 `effect`，僵尸阵营的植物按弹丸判定框左右镜像（小喷菇、胆小菇和寒冰射手的枪口烟）。植物表现的 `freeze: { effect, layer }` 和 `freezeSounds` 是冰冻引线生效时在植物中心放的效果和声音（寒冰菇）。表现定义 `iceTrap` 是被冻住的植物或僵尸脚下的冰块：`back`（身后）、`front`（身前）两张图、碎冰粒子 `release`，以及 `zombie`、`plant` 两类各自的 `{ x, y, scale?, releaseAt }`（从实体左上角算的原版 Y 向下像素）；某个植物或僵尸的表现可以用自己的 `iceTrap: { x, y, scale? }` 换掉所属那类的位置（原版 `Zombie::DrawIceTrap` 给撑杆跳跳僵尸、巨人等写的偏移）。

弹丸表现可配置 `shadow`：`sprite`、单行图集的 `columns`/`cell`、`offset` 和 `scale`。影子独立绘制在地面层，X 跟随弹丸，Y 为行起点加 `offset.y`，通过同一资源加载器保留高清包的逻辑尺寸。页面动画写在表现定义的 `screens` 表中，以 `pvz:tree` 等页面 ID 索引有序图层；每层指定 `name`、`reanimId`、`x`、`y`、`rate` 和 `playback`（`loop` 或 `last`），可选 `visibleTracks` 前缀和循环的 `randomPhase`。它们复用 `ReanimPlayer`，不包含服务端养成逻辑。

资源类别共用一套定义：`sprites`、`fonts`、`audio`、`json`、`text`、`reanim`、`particles`、`music`、`prefabs`。图片使用对象，其他类别使用 ID 到文件路径的映射；`audio` 支持 MP3/WAV。新动画、粒子、音乐配置使用对应类别，普通 JSON 使用 `json`。替换已有资源只需使用其原 ID；新增游戏定义使用 Mod 自身命名空间。Mod ID 是不带冒号的名字（如 `widescreen`），它同时就是这个 Mod 的命名空间：自己新增的资源和定义都写作 `名字:…`，例如 `widescreen:background1`。两个 Mod 的 ID 不会相同，所以命名空间也不会重叠；以其他命名空间写的资源都算替换，不算自己的。内置本体的 ID 为 `pvz`。表现配置里的音效（`{ "audio", "foley", "pitchRange"? }`）的 `audio` 同样写完整的音频资源 ID，例如 `pvz:splat`、`corn:shoop`；不带命名空间的 ID 会在校验时报错。

要整体替换已有定义（本体或其他 Mod 的），在 `gameplay` 或 `presentation` 下加 `"overrides": "assets/gameplay/overrides.json"`，文件按表分组写完整定义，例如 `{ "plants": { "pvz:peashooter": { ... } } }`。覆盖在所有 Mod 登记完后执行，可覆盖任意已存在的 ID，不受加载顺序影响；同一 ID 只能被一个 Mod 覆盖，否则报冲突；目标 ID 不存在时报错；覆盖后的定义照常校验引用。关卡也可覆盖，`levelPatches` 在覆盖之后按字段生效。覆盖只替换数据：按 ID 登记的代码行为（`plantBehaviors.register`）不会随定义转移，旧存档中实体状态与新定义不符时按不兼容存档处理。

表现定义里 Mod 可以新增或覆盖的表有 `plants`、`zombies`、`projectiles`、`gridItems`、`items`、`awards`、`tools`、`foley`、`boards`、`screens`、`levels`、`rules`、`challenges`、`store`、`almanac`，规则和其他定义表相同：新 ID 只能用自己的命名空间，改已有的走 `overrides`。`items` 按掉落物 ID、`awards` 按关卡奖励的 ID、`rules` 按关卡规则的 `kind`、`store` 按商店物品 ID、`almanac` 按图鉴里显示的植物或僵尸 ID 索引。内容组装时检查玩法里的每个植物、僵尸、弹丸和掉落物都有表现且视图已安装，每个工具都有外观，每关的奖励都有图（种子奖励用它的植物表现，`note` 还要有 `pageImages`）；缺了就是这个 Mod 加载失败，而不是等到它出现在关卡里才报错。

图片可通过 `alphaMode: "premultiplied"` 标记预乘透明度的源 PNG，未标记或 `"straight"` 时沿用普通 RGBA。该标记按 PNG 文件生效，共用同一文件的裁片不能声明冲突格式；`assets.sprite(path)` 原始路径也读取这份清单。本体加载器统一解码非交错 RGBA8 PNG 并还原颜色。所有图片（无论哪种 `alphaMode`、来自本体还是 Mod）加载时都会像原版一样“补色”：每个全透明像素取上下两行相邻可见像素的平均色，没有则为黑色，透明度不变，避免线性采样在边缘混入黑边；因此图片里全透明像素自带的 RGB 不会被保留。Web 和 Native 使用同一路径，动画、淡入淡出及普通 Sprite 都保持默认混合，无需 Mod 单独设置混合因子。

图片的 `width`、`height` 是逻辑尺寸，`scale` 是纹理分辨率倍数，例如逻辑 50×70、实际 100×140 时配置 `scale: 2`。可选 `rect`、`offset`、`borders` 分别控制裁剪、偏移和九宫格，`animations` 限制替换所适用的动画 ID。字体 JSON 通过 `layers[].image` 引用同目录 PNG，`textureScale` 决定字形纹理密度，保持原始排版。

## 开发与打包

```sh
npm run mod:init -- my-mod
npm run mod:pack -- mods/example
npm run mod:test -- dist/mods/example
```

仓库只跟踪 `mods/example/` 示例；其余 `mods/` 子目录用于本地开发并由 Git 忽略。

[Mod 实验场](../mods/example/README.md) 展示玩法行为、ECS 组件与存档、关卡补丁、资源新增与覆盖、自定义视图、两端命令、菜单扩展和生命周期清理。可按其中的能力表查找实际实现。

只有 `mod:pack` 编译。它合并分类定义、收集资源和字体图集、生成内容哈希，输出 `dist/mods/<name>/` 与旁边的 ZIP；源码目录不产生编译文件。ZIP 的 `content.json` 保留资源映射，`gameplay`、`presentation` 则指向生成的合并 JSON。安装器验证清单、模块、文件路径、PNG 尺寸及字体图集。

加载器自动注册静态游戏定义、表现定义和新增资源；入口无需再次注册这些文件。入口统一为 `register({ host, assets })`，通过真实宿主注册自定义植物/僵尸行为、视图或包装方法。`host.get(id)` 能取到该端的每一个模块，ID 就是模块在 `assets/scripts` 下的路径（不带扩展名，目录的 `index` 用目录名），如 `client/plants/PlantView`、`server/seeds/planting`、`shared/protocol`；客户端另有 `cc`（引擎）、`content/definitions`（定义来源）、`client/views`（视图注册表），服务端另有 `content/definitions` 和 `gameplay/registry`（玩法注册表）。自定义植物或僵尸视图继承 `PlantView` 或 `ZombieView`，用 `host.get('client/views').plants.registerView(类别, 类)`（僵尸用 `zombies`）注册，再在表现定义的 `view` 写这个类别、`viewConfig` 写它的参数。本体的僵尸视图类别有 `zombie`（缺省）、`flag`、`polevaulter`、`newspaper`、`dancer`（`FlagZombieView`、`PoleVaulterView`、`NewspaperView`、`DancerView`，都继承 `ZombieView`）；Mod 用 `overrides` 整条替换这些僵尸的表现定义时要保留 `view`，否则只按普通僵尸画。两者给子类开出同样的成员：`onBoard(实体, world)` 在场上每帧画实体本身（先调 `super.onBoard`），`pose` 摆出各层（场外也走它），`shown(层, 实体)` 决定一层显示哪个剪辑，`playable()` 列出要先载入的 Reanim；可用的有 `presentation`、`animation`（玩法里的动画定义）、`body`（主体的播放器）、`root`（各层所在的节点，移动它就移动整个画面）、`clip(名字)`、`ownFrames(reanimId)`、`particle(…)` 和 `flash`。模块挪了位置，ID 也随之改变。模块清单由 `npm run mod:hosts` 生成（`client/content/hostModules.ts`、`server/session/hostModules.ts`），新增、移动或删除模块后需重新生成，测试会检查。

```ts
export function register({ host, assets }) {
    const registry = host.get('gameplay/registry')
    registry.plantBehaviors.register(assets.id, 'example:rapid_pea', behavior)
}
```

行为对象有 `createState`、`tick`，可选 `validateState(state, definition)` 检查种下和读档时的状态，以及 `validateConfig(definition, definitions, name)` 检查定义里的 `behavior` 配置：后者在内容加载时（`GameplayRegistry.validate`）对行为注册的每个类型各运行一次，早于任何实体，配置错误或含未知键就让加载失败。保龄球坚果不是行为，是植物的类 `bowlingnut`：它的 `bowling` 配置的数值缺省取原版 `Plant::UpdateBowling`，植物只写要改的项。

僵尸的做法按玩法定义的 `kind` 分类（缺省 `zombie`，本体还有 `flag`、`polevaulter`、`newspaper`、`dancer`），和表现定义的 `view` 一一对应：服务端一个类对应客户端一个视图类（`Zombie` 和 `ZombieView`、`PoleVaulter` 和 `PoleVaulterView` ……）。自定义的类继承 `server/zombies/Zombie` 的 `Zombie` 或某个本体的类（如 `host.get('server/zombies/PoleVaulter').PoleVaulter`），重写要改的方法，例如 `dodgesBite()` 返回 `true` 时大嘴花这一口咬空，`evades(key)` 返回 `true` 时键为 `key` 的植物索敌（植物 `targeting.insetKey`，如土豆雷的 `pvz:mine`）不选它；用 `registry.zombies.register(assets.id, 类别, 类)` 注册，再在僵尸定义里写 `kind`。要给客户端看自己的东西，重写 `snapshotOwn()` 返回一个 JSON 对象，它出现在快照的 `own` 里，客户端对应的视图类用 `this.own(zombie, 字段, 校验函数)` 读取。每只僵尸是它的类的一个实例，也就是它的组件本身：实例的字段原样存档，所以字段只能是纯数据（引用别的僵尸用实体 id）；子类自己的字段在构造函数里给初值，并重写 `restoreOwn(fields, name)` 从存档读回（取走自己的、校验，再把其余的交给 `super.restoreOwn`）。类自己的定义字段（`vault`、`dance`、`enrage`）只能和取它的类一起写，类的静态 `config` 列出它取哪些；撑杆的 `vault.evades` 列出它拿着杆时排除它的索敌键。

植物也一样按玩法定义的 `kind` 分类（缺省 `plant`，本体还有 `shooter`、`scaredyshroom`、`producer`、`sunshroom`、`fuse`、`potatomine`、`chomper`、`gravebuster`、`hypnoshroom`、`wallnut`、`bowlingnut`），和表现定义的 `view` 一一对应（`Shooter` 和 `ShooterView`、`Chomper` 和 `ChomperView` ……）。每株植物是它的类的一个实例，也就是它的 `PlantComponent`，字段原样存档：射手下一发的时刻 `readyAtTick`、大嘴花的阶段 `phase` 等都是类的字段。自定义的类继承 `server/plants/Plant` 的 `Plant` 或某个本体的类，重写要改的方法：`attack`（射击）、`produce`（生产）、`act`（自己的能力）、`roll`（滚动），`inedible(world)` 返回 `true` 时僵尸啃它不掉血，`mindControls(world)` 返回 `true` 时啃它的僵尸被魅惑，`keptFromCold()` / `keptFromIce()` 决定此刻是否不受减速 / 冰冻，`sitOut()` 在它被冻住的 tick 把自己的计时往后推；用 `registry.plants.register(assets.id, 类别, 类)` 注册，再在植物定义里写 `kind`。种下时先 `start(random, tick)`（抽初始等待等随机值），子类自己的字段在构造函数里给初值、重写 `restoreOwn` 从存档读回，`snapshotOwn(tick?)` 给客户端看的内容出现在快照的 `own` 里，客户端视图用 `this.own(plant, 字段, 校验函数)` 读取。类自己的定义字段（`shooter`、`fright`、`producer`、`fuse`、`mine`、`chomper`、`graveBuster`、`mindControl`、`bowling`）只能和取它的类一起写；动画的 `phases`、`offBoard.phase`、`blink.phases` 和表现定义的 `packet.phase`、`shadow.phases` 只能写它的类有的阶段（`shared/content/plantKinds.ts`）。

子弹也按玩法定义的 `kind` 分类（缺省 `projectile`，本体还有 `mowing`，即出发后的小推车），和表现定义的 `view` 一一对应（`Projectile` 和 `ProjectileView`、`MowingProjectile` 和 `MowingProjectileView`）。每颗子弹是它的类的一个实例，也就是它的 `ProjectileComponent`，字段原样存档。自定义的类继承 `server/combat/Projectile` 的 `Projectile` 或 `server/combat/MowingProjectile` 的 `MowingProjectile`，重写 `canHit`（打不打得到这个目标）、`strike`（打中后做什么）、`speedScale`（这个 tick 的速度倍数），用 `registry.projectiles.register(assets.id, 类别, 类)` 注册，再在子弹定义里写 `kind`。`projectile` 类别必须写 `damage`，`mowing` 不能写；射手的 `shooter.projectile` 覆盖也不能写它的子弹类别不取的字段；关卡的 `lawnMower` 必须是会碾压的类别（`MowingProjectile` 或它的子类）。行尾等待的小推车是另一个类 `Mower`（`server/level/Mower.ts`），出发时发射一颗关卡 `lawnMower` 类型的子弹，自己从这一行消失。

`ModAssets.json()` 读取归档配置；客户端 `assets.sprite(path)` 按路径直接读取本 Mod 的图片，复用统一资源解码与缓存，其他包无法替换；`assets.spriteResource(id)` 按资源 ID 读取，Mod 在自己的 `content.json` 登记 ID 后，优先级更高的包（如高清包）可用同一 ID 替换。纯资源、数据和脚本 Mod 使用同一个加载入口；注册失败会撤销该 Mod 的注册和方法包装，并跳过依赖它的 Mod。

`mod:test` 校验已打包目录的真实服务端注册，不重新编译；给它 Mod 源码（如 `npm run mod:test -- example`）时先打包到临时目录、校验那份包。它不代替客户端或真机画面验收。修改后需要重新打包、安装并重启。

## 修改服务端规则

服务端规则按职责导出为对象，函数第一个参数都是本局 `session`（含 `world`、`definitions`、`gameplayTick` 等）。宿主内部也经由这些对象互相调用，包装后对内部调用同样生效：

| 模块 | 对象与方法 |
| --- | --- |
| `server/seeds/planting` | `planting.seedAvailability`、`rejectSeed`、`selectSeed`、`selectConveyorPacket`、`placePlant`、`createPlant`、`findPlantAt` |
| `server/seeds/tools` | `tools.available`、`select`、`use` |
| `server/level/items` | `items.collect` |
| `server/session/commands` | `commands.execute`，处理 Mod 自己的 `mod` 指令 |
| `shared/protocol` | 两端都能访问；客户端与服务端之间的数据格式及其辅助函数，如 `chooserEntryKey`（选卡卡片的唯一 key，同一种卡的两方算两张） |
| `server/seeds/seedChooser` | `seedChooser.entries(definitions, owned)`，按玩家已拥有的种子，在本体选卡格子之外再提供卡（`{ seedId, team? }`，`team` 可让卡换到另一方）；开启 `/cheatseed` 时排在本体翻页的卡之后，重复的卡只算一次。这些卡和已拥有的种子一样计入卡槽数和是否打开选卡界面（多于卡槽数才打开，否则全部放进卡槽），选卡快照的 `entries` 列出它们，`chooseSeed` 带同样的 `team` 选择；客户端选卡界面用 `showCards` 决定格子里显示哪些卡，卡从卡槽退回而格子里没有它时调用 `onCardHidden`。翻页按钮是选卡界面的 `pageTurners`（`{ button, step }`），Mod 可以改画它们，翻页仍由本体处理 |
| `server/session/snapshot` | `snapshot.build`，向 `extensions` 加入 Mod 状态 |

```ts
const { planting } = host.get('server/seeds/planting')
host.around(planting, 'seedAvailability', function (next, session, seedId, ...rest) {
    const availability = next(session, seedId, ...rest)
    return availability.reason || seedId !== 'my-mod:plant' || ready(session.world)
        ? availability : { reason: 'seed-not-available', warningKey: 'my-mod:not_ready' }
})
```

## 扩展 CLI 命令

复用 `host.around` 包装现有命令对象，不需要另外的命令注册 API。两端都能访问 `shared/debug/DebugCli`；解析、命令名补全、参数提示和静态参数值补全均读取其中的 `specs.list()`。

例如客户端入口添加 `/example:hello {name}`：

```ts
export function register({ host }) {
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:hello', parameters: ['{name}'], minimum: 1 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some(entry => entry.name === spec.name) ? entries : [...entries, spec]
    })

    const { executor } = host.get('platform/debug/DebugCliCommands')
    host.around(executor, 'execute', function (next, input, ...rest) {
        const parsed = cli.parseDebugCliCommand(input)
        if (!('name' in parsed)) return parsed
        if (parsed.name === spec.name) return cli.debugSuccess(`Hello ${parsed.args[0]}`)
        return next(input, ...rest)
    })
}
```

`debugSuccess`、`debugSyntax` 的消息只输出到控制台，直接写文字。`debugCondition` 表示条件不满足：调试窗口关闭并以 advice 显示在屏幕上，所以它的第一个参数是文本键，其余参数按顺序填入文本里的 `%s`／`%d`（如 `"example:cli_need_level": "Start a playing level first"`，写在 Mod 登记的 `pvz:strings` 文本资源里，见上文“文件定义”）；客户端用 `ui.format(key, args)` 查表，翻译包和 Mod 文本都能覆盖，服务端无需访问文本表。

`parameters` 是提示和参数数量上限，`minimum` 是数量下限；可选 `values: { 0: ['a', 'b'] }` 同时提供第一个参数的校验和补全。名称使用小写，可带 Mod 命名空间。使用原解析器可以保留引号参数等语法。

修改游戏状态的命令在服务端处理：两端入口执行相同的 `specs.list` 包装（可以抽到 Mod 的共享源码文件），客户端不添加对应的执行包装，正常入口会在有关卡时转发原始命令。集成运行时两端共享语法对象，上面的同名检查可避免补全重复。独立服务端也必须声明语法。

服务端用 `server/debug/debugCommands` 中的 `executor`：`execute(session, command)` 收到本局 `session`（含 `world`、`definitions`、`gameplayTick` 等）和经过服务端解析校验的命令；种植等规则从 `server/seeds/planting` 等模块取用，第一个参数同样是 `session`。例如将上面命令改为服务端返回消息时，保留语法包装，将执行包装移到服务端入口：

```ts
const cli = host.get('shared/debug/DebugCli')
const { executor } = host.get('server/debug/debugCommands')
host.around(executor, 'execute', function (next, session, command) {
    if (command.name === 'example:hello') {
        return cli.debugSuccess(`Hello ${command.args[0]}, tick: ${session.gameplayTick}`)
    }
    return next(session, command)
})
```

服务端命令仍经过原有调试权限和命令队列，支持暂停时执行；Mod 自行检查其操作所需的世界状态。执行包装只处理自己的命令，其他命令调用 `next`。语法也使用包装扩展，避免直接修改列表；注册失败时，加载器会随 `host.dispose()` 一起撤销语法和执行包装，不留下失效命令或补全。


本体 `assets/resources/base.zip` 与 Mod 共用 `manifest.json`、`content.json`、定义和资源解析器，不再包含专用内容索引。基础包固定最先加载且不可禁用／卸载；其源码 `mods/pvz-base/content.json` 与 Mod 一样索引分类 JSON，打包时合并成 `assets/gameplay.json` 和 `assets/presentation.json`。基础玩法额外提供 `settings`（schemaVersion、阳光与金钱上限 `economy`、种子栏 `seedBank`）、完整关卡、默认文本和种子目录；后加载的 Mod 使用自己的命名空间添加内容。`npm run mod:pack -- pvz-base` 使用通用 Mod 打包器生成 `dist/mods/pvz-base.zip`，`npm run mod:pack -- pvz-base --publish assets/resources/base.zip` 将同一产物发布到内置位置，哈希覆盖统一索引及全部文件。所有资源（含粒子）均在源 `content.json` 的 `resources` 中显式登记，打包阶段不扫描补齐。

### 粒子资源

粒子统一登记在 `resources.particles`，JSON 使用 `schemaVersion: 3`、完整限定的 `id` 和 `emitters`。每个发射器的 `sprite` 也是限定 ID；图集使用 `columns`、`rows`、`firstFrame`、`frameCount`。可选属性覆盖原版的循环、生成额度、色调、旋转、碰撞和场，缺省值由公共解析器统一补全。

轨道使用 `{ "nodes": [{ "time": 0, "low": 1, "high": 1 }] }`；`time` 是寿命比例，`systemDuration` / `particleDuration` 的值以 0.01 秒的 tick 计。`clipTop`、`clipBottom`、`clipLeft`、`clipRight`（0–1）照原版 `RenderParticle` 从精灵格子各边裁掉相应比例，剩下的部分以粒子位置加上未取整的上、左裁切量为中心绘制（如出土粒子里伸出地面的手）。`fullScreen: true`（原版 `FullScreen`）的发射器不管粒子在哪、多大，都用粒子当前的颜色和透明度铺满整个屏幕（原版对整个画面 `FillRect`；寒冰菇和毁灭菇的闪光，图是 `pvz:whitepixel`），颜色和透明度仍由粒子内核算，客户端只把它的四边形拉到屏幕四角（`ParticlePlayer` 的 `fillScreen`）。XML 转换统一通过 `tools/pvz/particles.py`，基础包从 PAK 临时解包，直接转换到 `mods/pvz-base/assets/particles/` 并登记资源清单，再由通用 Mod 打包器打包。原版曲线及随机分布在转换时保留，由公共粒子内核运算。

脚本通过 `ParticlePlayer.spawn({ parent, id: 'example:burst', x: 0, y: 0, seed: 123 })` 播放，所有平台使用同一 C++ 核心。`whenReady()` 等待加载；`snapshot()` 与 `ParticlePlayer.restore()` 使用同一种存档结构。旧粒子格式和旧粒子存档不再接受，已有 Mod 的粒子资源需要重新转换和打包。

`mod:pack` 支持 `--publish <zip-file>`：打包成功后将完整 ZIP 原子替换到指定位置；失败时保留此前发布的文件。基础包使用 `npm run mod:pack -- pvz-base --publish assets/resources/base.zip`。
