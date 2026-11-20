[简体中文](ACHIEVEMENTS.zh-CN.md)

# Achievements

The remake follows the 21 achievements of the original *Plants vs. Zombies* GOTY edition, Steam version 1.2.0.1096.

## Basic rules

- Achievements belong to the player profile. Each one is earned once per profile and is never granted again; level saves do not hold achievements.
- An achievement is either announced **in the level** or listed **on the award page**:
  - *In the level*: a message reading that the achievement was earned appears in the bar at the bottom of the lawn, with the achievement sound, at the moment the condition is met. The message stays for 2.5 seconds at normal speed (250 ticks) and does not fade. If the "huge wave" message is on screen, the achievement message waits until it has left.
  - *On the award page*: achievements judged when the level is won (the planting achievements) are not announced in the level. After the level, the award page first lists every achievement earned but not yet shown, then shows the usual award once **Continue** is clicked.
- Winning a level does not clear the message bar, so an achievement earned from sun or coins collected after the award has dropped is still announced during the fade-out.
- The Achievements page, opened from the main menu, shows every achievement; earned ones are drawn in full and the others faded. It looks only at whether an achievement is earned, not at whether it has been shown.
- The test levels `pvz:stress-test`, `pvz:seed-chooser-test` and `pvz:teams-demo` grant no achievements.

## Achievement list

"Shown" says where the achievement is announced. "Remake" says whether the remake can grant it yet: most conditions need content that is not implemented (the levels after Adventure 2-10, the mini-games, Puzzle, Survival, the store's plants and the Zen Garden).

| # | Achievement | Condition | Shown | Remake |
| --- | --- | --- | --- | --- |
| 0 | Home Lawn Security | Complete Adventure (Adventure level 50, 5-10). An award page after Adventure, with the level number back at 1, also grants it as a fallback. | Award page | Not yet |
| 1 | Nobel Peas Prize | Win the Gold Sunflower Trophy: Adventure completed and all 48 trophies won (Survival 10, mini-games 20, Puzzle 18). Checked when an award page that is not Adventure's opens. | Next award page | Not yet |
| 2 | Better Off Dead | In endless I, Zombie, start the next round with a streak of exactly 10. | In the level | Not yet |
| 3 | China Shop | In endless Vasebreaker, set out the vases with a streak of exactly 15. | In the level | Not yet |
| 4 | SPUDOW! | A Potato Mine's blast kills at least one zombie. Zombies already dying do not count. | In the level | Yes |
| 5 | Explodonator | A single Cherry Bomb blast takes out at least 10 zombies. Every kind counts, Imps and Bungee Zombies included, and zombies already dying when it goes off are counted too. The Doom-shroom and the Jalapeno do not grant it. | In the level | Yes |
| 6 | Morticulturalist | Own all 9 plants sold in the store (Gatling Pea through Imitater). The 40 basic plants are not checked. Checked when a store plant is bought. | Next award page | Not yet |
| 7 | Don't Pea in the Pool | Complete a level in the day pool without planting a Peashooter, Snow Pea, Repeater, Threepeater, Split Pea or Gatling Pea. | Award page | Not yet |
| 8 | Roll Some Heads | In Wall-nut Bowling, one plain Wall-nut makes its 5th impact on zombies (hitting armor counts; the Explode-o-nut and the Giant Wall-nut do not count). Impacts are not counted on the first play-through of Adventure up to level 10, that is, in 1-5. | In the level | Wired, not reachable yet (see below) |
| 9 | Grounded | Complete a roof level, day or night, without planting a Cabbage-pult, Kernel-pult, Melon-pult or Winter Melon (the Cob Cannon is allowed). Conveyor-belt levels do not count. | Award page | Not yet |
| 10 | Cryptozombologist | In Adventure 4-10, a wave spawns the Zombie Yeti. It need not be seen or killed. | In the level | Not yet |
| 11 | Penny Pincher | Collect 30 silver or gold coins in a row in one level. Diamonds and sun do not count. Only a silver or gold coin that fades away uncollected starts the count over; a coin pulled in by a Magnet-shroom neither adds to it nor resets it. Granted when the count reaches exactly 30. | In the level | Yes |
| 12 | Sunny Days | Hold at least 8000 sun at once, checked as sun is added (the bank holds at most 9990). The sun collected over the level does not matter. | In the level | Yes |
| 13 | Popcorn Party | Kill 2 Gargantuars (plain or Giga) with the Cob Cannon in one level; the count adds up across shots. | In the level | Not yet |
| 14 | Good Morning | Complete a level on a day scene (day, day pool, day roof, the greenhouse, the Tree of Wisdom) planting only mushrooms and Coffee Beans; planting nothing at all also counts. Any other plant breaks it, the Grave Buster, Lily Pad, Flower Pot and Pumpkin included. | Award page | Yes, on day levels |
| 15 | No Fungus Among Us | Complete a level on a night scene (night, fog, night roof, the mushroom garden, the aquarium) without planting a mushroom (the Grave Buster and the Coffee Bean are not mushrooms). I, Zombie levels do not count. | Award page | Yes, on night levels |
| 16 | Beyond the Grave | Complete each of the first 20 mini-games. | Award page | Not yet |
| 17 | Immortal | In endless Survival, complete 20 flags: granted as round 11 starts, after the seeds are chosen. | In the level | Not yet |
| 18 | Towering Wisdom | The Tree of Wisdom is exactly 100 feet tall after it grows. | In the level | Not yet |
| 19 | Mustache Mode | Type `mustache` or `moustache`. In a level it turns Mustache Mode on or off, and either way grants it; typed at the main menu it also grants it. | In the level; from the main menu, next award page | Not yet |
| 20 | Disco is Undead | Mind-control a Dancing Zombie (not a Backup Dancer). The only way is a Dancing Zombie chewing an awake Hypno-shroom. | In the level | Yes |

Notes on the table:

- Good Morning, No Fungus Among Us, Don't Pea in the Pool and Grounded count only Adventure, Puzzle and Survival levels. Whack-a-Zombie, Vasebreaker and Wall-nut Bowling levels (Adventure 2-5, 4-5 and 1-5 included) and the other mini-games do not count.
- For the planting achievements, only plants the player puts down count: from a seed slot or the conveyor belt, and in the original also seeds from items such as It's Raining Seeds, the Imitater turning into its plant (it counts as that plant), Beghouled upgrades, Column Like You See 'Em, and the nuts the Shovel and Squirrel mini-games place beforehand. Plants the level puts down at the start, plants placed by a cutscene, I, Zombie's starting plants and plants created with `/plant` do not count.
- Roll Some Heads: Adventure 1-5 is the only Wall-nut Bowling level so far, and Adventure cannot be completed yet, so every play is the first play-through and its impacts are not counted.
- The in-game descriptions do not always match the conditions: Roll Some Heads counts impacts, Cryptozombologist needs only the Yeti to spawn, Morticulturalist looks only at the store's 9 plants, and Sunny Days is the sun held at one moment.

## Implementation

### Flow

1. **Definitions.** The gameplay definitions' `achievements` table (`mods/pvz-base/gameplay/definitions/achievements.json`) maps IDs such as `pvz:sunny-days` to `{ titleKey, descriptionKey, icon: { sprite, index }, trigger? }`. The base game lists the 21 achievements in the original's id order, and an icon's `index` is that id (see [Definitions](#definitions)). Mods may add achievements and change existing ones through `overrides` (see [Mods](MODS.md)); the achievements page and the award page list the base game's first, then each Mod's.
2. **Judging.** Gameplay code only emits server events and never calls into achievements. The session sets the achievement module as the event queue's observer (`EventQueue.observer`, set in `server/session/session.ts`), so `observeAchievements` sees each event as it is emitted, except `achievementEarned` itself. For every achievement the player does not have yet, the trigger type named by its `trigger.kind` judges the event; this happens at the same moments as the original's calls to `GiveAchievement`.
3. **Granting.** `grantAchievement(world, id, announce)` (`server/achievements/achievements.ts`) throws on an unknown ID, returns false when the player already has the achievement or the level definition has `achievements: false`, and otherwise adds it to the earned set and emits `achievementEarned` (`id`, `titleKey`, `announce`). The earned set is the profile's, sent in the start packet (`startSession.earnedAchievements`, applied in `IntegratedGameServer.start`); a save does not hold it, so when a save is loaded the packet still decides.
4. **Saving to the profile.** On `achievementEarned` the client (`LevelView.onAchievementEarned`, wired in `app/LevelController.ts` only when there is a player profile) calls the menu API `earnAchievement(id, shown)` with `shown` = `announce`. `MenuService` adds the ID to the profile's `earnedAchievements`, and to `shownAchievements` when it was announced, then saves the profile (`server/menu/profileStore.ts`).
5. **Display in the level.** For an announced achievement, `LevelHudPresenter` shows `[ACHIEVEMENT_ACHIEVED]` with `{ACHIEVEMENT}` replaced by the title in `AdviceWidget`'s `achievement` style, and `LevelAudioPresenter` plays the achievement sound. The style has the original's 250 ticks, placement and pulsing color. A message given while the huge wave's message is showing waits for it, as in the original (`AdviceWidget.show` keeps it as the next message, the original's `mLabelNext`, and the huge wave's message's remaining time becomes at most its slide-out time + 101 ticks); the waiting message is kept in the level save. A loss clears the message bar at once; a win does not (`Board::FadeOutLevel`), so messages earned during the fade-out still show.
6. **Award page.** On completing a level, the menu API `completeLevel` takes every achievement that is earned but not yet shown (not only this level's), in definition order, marks them shown and saves the profile; the award view carries them. `MenuScreen` then shows `AwardAchievements` (`client/screens/AwardAchievements.ts`) over the award page with the award's controls disabled, and **Continue** brings the usual award back. Temporary levels (`persistent: false`: the stress test and the teams demo) skip `completeLevel` and return to the main menu.
7. **Achievements page.** `AchievementScreen` reads the definitions and the profile's earned IDs through `getAchievements()` (see [UI](UI.md)).

A level definition's `achievements: false` makes the level grant no achievements at all, `/achievement give` included. The original has no such level; it is meant for debug levels such as the three test levels listed under [Basic rules](#basic-rules).

### Trigger types

Every trigger condition is written in `achievements.json` as `trigger: { kind, ...settings }`. `kind` names a trigger type registered in `server/achievements/triggers.ts` through `AchievementTriggerRegistry` (`GameplayRegistry.achievementTriggers`); Mods may register new types with `registry.achievementTriggers.register(ownerId, kind, { validate, observe })`. Loading content validates each trigger's settings and the IDs they reference: an uninstalled `kind`, an unknown plant, item, zombie or board ID, or a count that is not a positive integer stops the content from loading. Each achievement's judging state within a level (`progress`, a JSON object per achievement) is saved with the level as `achievementProgress`.

| Trigger type | Event judged | Settings | Achievements |
| --- | --- | --- | --- |
| `pvz:blast` | `plantExploded`'s `typeId` and `kills`. `kills` is the return value of `explode` (`server/combat/explosions.ts`), the remake's `KillAllZombiesInRadius` count: the zombies it burned, and those left dead, falling over or crushed by a lawn mower after the blast. | `plants`, `kills` | SPUDOW! (`pvz:potatomine`, 1), Explodonator (`pvz:cherrybomb`, 10) |
| `pvz:bowling` | `bowlingImpact`'s `plantTypeId` and `hits`: the nut's own count of zombie impacts (`BowlingNut.ts`), not increased on the first Adventure up to level 10 or by hits on plants | `plants`, `hits` | Roll Some Heads (`pvz:bowling-wallnut`, the plain Wall-nut, 5) |
| `pvz:coin-streak` | Counts `itemScored` (the item reached its bank, `Coin::ScoreCoin`) of the listed items; their `itemExpired` (faded away) resets the count; granted when the count is exactly the number | `items`, `coins` | Penny Pincher (`pvz:coin_silver`, `pvz:coin_gold`, 30) |
| `pvz:sun-held` | `sunAdded`: the sun held after `Board::AddSun` | `sun` | Sunny Days (8000) |
| `pvz:mind-controlled` | `mindControlled` (`Zombie::StartMindControlled`): a zombie of a listed type coming over to the `plants` side. A plant that swallowed a Hypno-shroom, or a zombie brought over to the `zombies` side, does not count | `zombies` | Disco is Undead (`pvz:dancer`; its backup dancers are another type) |
| `pvz:win-planting` | `plantPlaced` events without `debug` record whether a plant that does not fit was planted (`progress.broken`); on `levelWon`, if nothing broke it, the level's board is listed and its rule is not skipped, it grants without an announcement in the level | `boards`, `skipRules`, and `only` and/or `never`, each `{ nocturnal, plants }` | Good Morning (`pvz:day`, `only` nocturnal plants), No Fungus Among Us (`pvz:night`, `never` nocturnal plants); both skip `pvz:bowling` and `pvz:whack-a-zombie` |

Details of the events the triggers read:

- A `{ nocturnal, plants }` selector matches the plants whose definition has `nocturnal: true` (the original's `Plant::IsFungus`: the mushrooms, not the Grave Buster) when `nocturnal` is true, plus the plant IDs listed in `plants`.
- Good Morning's `only.plants` is empty because the Coffee Bean is not in the content yet; it belongs in that list once it is, so that the trigger matches the original (only mushrooms and Coffee Beans, or nothing at all). Planting nothing never sets `broken`, so a win with nothing planted grants Good Morning and No Fungus Among Us on their boards.
- The day and night lawns (`pvz:day`, `pvz:night`) are the only boards so far, so Good Morning and No Fungus Among Us list only those.
- `plantPlaced` is emitted by the player's planting from a seed slot or the conveyor belt (`server/seeds/planting.ts`). A level's `initialPlants` and a tutorial's `introPlants` are created without it, and `/plant` emits it with `debug: true`, so none of them count.
- `levelWon` is emitted when the level award is collected (`server/items/items.ts`) and by `/win`.
- `sunAdded` is emitted only when collected sun reaches the bank; `/sun` sets the bank without it, so the next sun collected after `/sun set 8000` grants Sunny Days.
- `explode` skips zombies already charred (`burned`) before counting, so they are not counted again; a burning blast still counts zombies already dying, as the original does. A plain blast (the Potato Mine) reaches only zombies that can be targeted, which excludes dying ones. Damage to hostile plants never adds to `kills`.

### Not wired in yet

These need content that is not implemented; each is to be wired in once it is:

- Don't Pea in the Pool (`pvz:win-planting`, the pool board, `never` the pea shooters);
- Grounded (`pvz:win-planting`, the roof boards, `never` the pults, with conveyor-belt levels left out as well);
- Cryptozombologist (the Yeti);
- Popcorn Party (the Gargantuar and the Cob Cannon);
- Home Lawn Security (Adventure 5-10);
- Beyond the Grave, Nobel Peas Prize, Better Off Dead, China Shop and Immortal (mini-games, Puzzle, Survival);
- Towering Wisdom (the Tree of Wisdom);
- Morticulturalist (the store's plants);
- Mustache Mode (Mustache Mode).

## The original's implementation

Version 1.2.0.1073 already has 20 of the achievements. 1096 adds Disco is Undead (id 20) and two catch-up grants; the rest of the trigger logic is the same in both versions.

### Definitions

The original 1.2.0.1096 has 21 entries in its achievement table. Their order is the id, and also the position in the atlas `IMAGE_ACHEESEMENTS_ICONS` (70×70 cells, 7 to a row). Each entry holds a title key, a description key and a Steam name. The base game's `achievements` table lists them in the same order under the remake IDs below.

| id | Key | Steam name | Remake ID |
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

### Granting

`GiveAchievement` takes the id and a "show now" flag:

1. If the achievement is already earned, it returns false at once (apart from the Steam report, which does not concern this project).
2. Otherwise it marks it earned and returns true.
3. Only with "show now" and in a level (`app->mBoard` exists) does it also mark it shown, and:
   - show `[ACHIEVEMENT_ACHIEVED]` in the level message bar, with `{ACHIEVEMENT}` replaced by the title;
   - clear the current advice's `mHelpIndex` (set it to `ADVICE_NONE`);
   - play `SOUND_ACHIEVEMENT`, as it is granted, even when the message is queued.

A grant with "show now" outside a level (the store, the main menu), and any grant without "show now", only marks it earned, leaving it for a later award page to list.

The level's helper `Board::GrantAchievement` grants it with "show now" when it is not earned yet.

### Triggers

"In the level" means shown at once and announced in the level message bar; "award page" means only marked earned and listed on the next award page.

#### In the level

| id | Achievement | Where | Condition | Shown |
| --- | --- | --- | --- | --- |
| 4 | SPUDOW | `Plant::DoSpecial`, Potato Mine | Its radius-60 blast in its own row (1800 damage, range flags 0x4D) actually kills at least 1 zombie, not counting those already dying | In the level |
| 5 | EXPLODONATOR | `Plant::DoSpecial`, Cherry Bomb | One blast (radius 115, a row above and below, burning) counts at least 10. Size does not matter: Imps, Bungee Zombies and the rest all count. What counts is the zombies dead or in DYING, BURNED or MOWERED after the blast, so zombies already dying, and charred ones not yet gone, are counted again. The Doom-shroom and the Jalapeno run the same code but do not grant it | In the level |
| 8 | ROLL_SOME_HEADS | `Plant::UpdateBowling` | The 5th and every later zombie impact of the same plain Wall-nut (not the Explode-o-nut or the Giant Wall-nut). It counts impacts, and hitting armor counts too. Not counted on the first Adventure's level 10 or earlier (that is, 1-5) | In the level |
| 10 | ZOMBOLOGIST | `Board::AddZombieInRow` | Adventure level 40 (4-10): the Yeti spawned from a wave (`fromWave` ≥ 0). It need not be seen or killed | In the level |
| 11 | PENNY_PINCHER | `Coin::ScoreCoin` | The level's count of coins collected in a row, after +1, is exactly 30. Only silver and gold coins count (not diamonds or sun); only a silver or gold coin that fades away uncollected resets it. A coin pulled in by a Magnet-shroom neither adds to it nor resets it | In the level |
| 12 | SUNNY_DAYS | `Board::AddSun` | After sun is added (capped at 9990), the sun held is at least 8000. This is what is held at that moment, not the level's total | In the level |
| 13 | POPCORN_PARTY | `Projectile`, Cob Cannon landing | The level's count of Gargantuars killed by the Cob Cannon reaches at least 2. Each cannon shot adds the difference in living Gargantuars (plain and red-eye) before and after it | In the level |
| 20 | DISCO_IS_UNDEAD | `Zombie::StartMindControlled` | A Dancing Zombie (not a backup dancer) is mind-controlled; the only way is chewing an awake Hypno-shroom | In the level |
| 19 | MUSTACHE_MODE | `Board::DoTypingCheck` | Typing `mustache` or `moustache` in a level (turns Mustache Mode on or off; both grant it) | In the level |

#### Level completion

The level-completion check is called by the level-complete flow only when the level is complete (`mLevelComplete`). In Survival it is called only when the last round is complete, and the counts accumulate across rounds. It returns "newly earned", which decides whether the award page shows the achievement list.

1. Mini-games (modes 16–50): it records this level in the profile's "first 20 mini-games completed" flags (new in 1096, `PlayerInfo+0x646c`), and once all 20 are set grants **16 BEYOND_THE_GRAVE**.
2. Whack-a-Zombie, Vasebreaker (4-5 included) and Wall-nut Bowling (1-5 included) levels end here. The other mini-games end here too; only Adventure, Puzzle and Survival go on.
3. Adventure level 50: **0 HOME_SECURITY**.
4. By scene (`mBackground`):
   - the day pool, with no pea shooter planted: **7 DONT_PEA_IN_POOL**;
   - the roof (day or night), not a conveyor-belt level, with no pult planted: **9 GROUNDED**;
   - night scenes (night, fog, the roof at night, the mushroom garden, the aquarium), not an I, Zombie level, with no mushroom planted: **15 NO_FUNGUS_AMONG_US**;
   - other scenes (day, the day pool, the day roof, the greenhouse, the Tree of Wisdom), with only mushrooms and Coffee Beans planted, or nothing planted at all: **14 GOOD_MORNING**.

All of these are shown on the award page.

The counts are updated in `Board::AddPlant`; the Imitater counts as the plant it imitates.

| Count | Initial value | Condition |
| --- | --- | --- |
| Pea shooter planted | No | Peashooter, Snow Pea, Repeater, Threepeater, Split Pea, Gatling Pea |
| Pult planted | No | Cabbage-pult, Kernel-pult, Melon-pult, Winter Melon (not the Cob Cannon) |
| Mushroom planted | No | Puff-shroom, Sun-shroom, Fume-shroom, Hypno-shroom, Scaredy-shroom, Ice-shroom, Doom-shroom, Sea-shroom, Magnet-shroom, Gloom-shroom (the Grave Buster does not count) |
| Only mushrooms and Coffee Beans planted | Yes | Planting any plant other than the mushrooms above and the Coffee Bean (the Grave Buster, Lily Pad, Flower Pot and Pumpkin included) makes it no |

Only plantings that go through `AddPlant` count; the notes under [Achievement list](#achievement-list) say which plantings count and which do not.

The level counts (the four planting flags, the coins collected in a row and the Gargantuars killed by the Cob Cannon) are all initialised when a new level is created and are saved with the level.

#### Modes and profile

| id | Achievement | Where | Condition | Shown |
| --- | --- | --- | --- | --- |
| 17 | IMMORTAL | `Board::StartLevel` | At the start of each round of endless Survival (modes 11–15), after the seeds are chosen, with at least 20 flags completed, that is, as round 11 starts | In the level |
| 2 | BETTER_OFF_DEAD | `Challenge::IZombieInitLevel` | Endless I, Zombie, starting the next round with a streak of exactly 10 | In the level |
| 3 | CHINA_SHOP | `Challenge::ScaryPotterPopulate` | Endless Vasebreaker, setting out the vases with a streak of exactly 15 | In the level |
| 18 | TOWERING_WISDOM | `Challenge::TreeOfWisdomGrow` | The Tree of Wisdom is exactly 100 feet after it grows | In the level |
| 6 | MORTICULTURALIST | `StoreScreen::PurchaseItem` | After a store plant is bought, all 9 of the store's plants (Gatling Pea to Imitater) are owned; the 40 basic ones are not looked at | Not in a level; left for the award page |
| 1 | NOBEL_PEAS_PRIZE | `AwardScreen` constructor | A non-Adventure award page, with Adventure completed and all 48 trophies won (Survival 10, mini-games 20, Puzzle 18) | Next award page |
| 0 | HOME_SECURITY | `AwardScreen` constructor | An Adventure award page, with the level number back at 1 and Adventure completed (a fallback for the level-50 completion check above) | Next award page |
| 19 | MUSTACHE_MODE | `GameSelector::KeyChar` | Typing `mustache` or `moustache` at the main menu | Next award page |

#### Catch-up grants

Syncing the profile at the main menu (the end of `GameSelector::SyncProfile`; run on entering the main menu and on switching, creating or renaming a user) grants from the profile's data, with no announcement since it is not in a level:

- 0: Adventure completed;
- 1: the same Gold Sunflower Trophy condition as above;
- 10: the Yeti can already appear (Adventure completed at least twice, or completed once with the current level at least 40);
- 18: the Tree of Wisdom is at least 100 feet;
- 6: all 9 store plants owned.

On loading a profile (once per profile per run), if every one of the first 20 mini-games has a score above 0, it grants 16.

Both exist to give old profiles their achievements. This project has no old profiles, so they can be left out.

### Display

#### Level message

Style 0x12 (`MESSAGE_STYLE_ACHIEVEMENT`) is the same in every respect as `HINT_TALL` / `TUTORIAL_LEVEL2`:

- shown for 250 ticks (not counted while paused), then gone at once, with no fade in or out;
- font `HOUSEOFTERROR28`, color (253, 245, 173), its alpha pulsing by `TodAnimateCurve(75, 0, mMainCounter % 75, 192, 255, BOUNCE_SLOW_MIDDLE)`;
- a backing bar `FillRect(0, 476, 800, 100)` in (0, 0, 0, 128); the text wraps and is centered in this rectangle, 4 pixels higher;
- no icon.

With other messages: it queues only while a message with an animation, such as the huge wave's, is showing. The current message's duration becomes min(remaining, slide-out time + 101), and the achievement message shows once it ends. Otherwise it replaces the current advice at once, and the advice it replaces does not come back.

#### The award page's achievement list

`AwardScreen(type, showAchievements)`:

- On construction it lists **every** earned but unshown achievement (not only this level's) in id order, marks them shown and saves the profile right away. The two grants in the constructor (0 and 1, above) come after the list, so they wait for the next award page.
- When the list is not empty it shows first, in place of the usual award content:
  - background `IMAGE_CHALLENGE_BACKGROUND`;
  - title `[ACHIEVEMENTS_TITLE]`, `HOUSEOFTERROR28`, (220, 220, 220), centered on x = 400, y = 58;
  - entry k of n has the target y = 284 − 76n/2 + 76k; it starts at y = 750 and slides to its target with `EASE_IN_OUT` between ticks 150 + 100k and 250 + 100k;
  - the 70×70 icon is drawn at (220, y + 10);
  - title `[ACHIEVEMENT_EARNED]`, `DWARVENTODCRAFT15`, (224, 187, 98), centered on x = 450, baseline y + 25;
  - description `DWARVENTODCRAFT12`, white, wrapped and centered in (300, y + 20, 300, 60);
  - a 180-tick fade in from white, as on an ordinary award page.
- Once the last entry is in place (tick 150 + 100n), the **Continue** button shows: the `SEEDCHOOSER_BUTTON` images at (324, 515, 156, 42), `DWARVENTODCRAFT15`, text color (213, 159, 43), text `[CONTINUE_BUTTON]`. The usual start and menu buttons are hidden meanwhile. Clicking anywhere but the button does nothing; Space, Enter and Esc perform "start" directly, skipping the list.
- Clicking **Continue** brings back the usual award content and buttons. When the level number has gone back to 1 after Adventure is completed, it goes to the credits instead (`CREDITS_ZOMBIENOTE`).

#### When the award page shows

The level-complete flow takes "newly earned" from the return value of the level-completion check:

| Mode | Case | Result |
| --- | --- | --- |
| Adventure | Levels with an award (before level 50 on the first Adventure; levels 9, 19, 29, 39 and 49; level 50) | Award page, with the achievement list |
| Adventure | Other levels, something newly earned | Achievement-only award page (`AWARD_ACHIEVEMENTONLY`) |
| Adventure | Other levels, nothing newly earned | Straight to the next level |
| Mini-game | New content unlocked and Adventure completed | Award page, with the achievement list |
| Mini-game | Otherwise, something newly earned | Achievement-only award page |
| Puzzle, Survival | New content unlocked | Award page, with the achievement list |
| Puzzle, Survival | Otherwise | Back to the challenge page, no achievements shown |

"Newly earned" looks only at the level-completion check; achievements already announced in the level do not count. Achievements earned outside a level (the store, the main menu) appear on the next award page that shows the achievement list.

## Differences from the original

- The achievement-only award page (`AWARD_ACHIEVEMENTONLY`) is not implemented: every current level that goes to the award page has an award, and the temporary levels that do not grant no achievements.
- The catch-up grants at the main menu and on loading a profile are not implemented (see [Catch-up grants](#catch-up-grants)).
- A Cherry Bomb blast does not count zombies already charred a second time (see [Trigger types](#trigger-types)); zombies already dying are still counted again, as in the original.

## Problems in the original

Not to be copied in the implementation:

- **Continue** on the achievement-only award page always goes into Adventure (`PreNewGame(ADVENTURE)`), even when the achievement was earned in a mini-game, and Space and Enter take "start" and go back to the challenge page. It should go back to the page it came from.
- Puzzle and Survival never show the achievement-only award page, so completion achievements earned there wait for a later award page.
- The Cherry Bomb counts zombies already dying a second time (see EXPLODONATOR). For what the remake does, see [Differences from the original](#differences-from-the-original).
- The descriptions do not match the conditions; see the notes under [Achievement list](#achievement-list).

## Debug commands

- `/achievement give {achievement}` grants an achievement by ID (`pvz:` may be left out, as in `/achievement give sunny-days`). In a level it is granted by the level and announced with its message and sound; outside a level it goes into the profile and waits for the next award page. It fails in a level that grants no achievements.
- `/achievement reset [achievement]` forgets one achievement, or all of them, in the profile and in the running level, so it can be earned again.
- Both need a player profile. See [Debug Console](DEBUG_CLI.md).
