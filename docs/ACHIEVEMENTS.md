# Achievements (checked against 1096)

The achievement triggers, granting and display of the original 1.2.0.1096 (Steam GOTY), checked by disassembling `pvz-original-exe/PlantsVsZombies_1.2.0.1096_steam_unwrapped.exe`; every address is a 1096 virtual address. 1073 already has 20 of them; 1096 adds Disco is Undead (id 20) and two catch-up grants, and the rest of the trigger logic is the same in both versions. PvZ-Portable's achievement code was rewritten by the port's author, and its conditions and display both differ from the original's, so it is not used as a reference.

## Implementation status

The general flow is done, and the triggers that the existing content can reach are wired in:

- Definitions: the gameplay definitions' `achievements` table (`mods/pvz-base/gameplay/definitions/achievements.json`, IDs such as `pvz:sunny-days`), which Mods may extend. The profile records which IDs are earned and which are shown.
- Granting: the server's `grantAchievement(world, id, announce)` (`server/achievements/achievements.ts`). The start packet carries the achievements the player already has, and only a newly earned one emits the `achievementEarned` event; from it the client shows the level message, plays the sound and writes it into the profile through the menu API `earnAchievement`. A save does not hold achievements; when one is loaded, the packet still decides. A level definition's `achievements: false` makes that level grant no achievements at all (the original has no such level; it is for debug levels such as the stress test level and the seed chooser test level).
- Display: the level message is `AdviceWidget`'s `achievement` style; a win does not clear messages (the original clears them only on a loss), so an achievement earned during the fade-out is announced as usual. On completing a level, `completeLevel` takes the earned but not yet shown achievements and marks them shown; the award page first shows the achievement list (`AwardAchievements`), and after "Continue" is clicked shows the usual award.
- Debugging: `/achievement give|reset`.
- Judging: gameplay code only emits events and never calls into achievements. The session sets the achievement module as the event queue's observer (`EventQueue.observer`); as each event is emitted, every achievement the player does not have yet is judged by its own `trigger`, at the same moments as where the original calls `GiveAchievement`. Every trigger condition is written in `achievements.json` as `trigger: { kind, ...settings }`, where `kind` is a trigger type registered in `server/achievements/triggers.ts` (`AchievementTriggerRegistry`; Mods may register new types); loading content validates the settings and the IDs they reference. Each achievement's judging state within a level (`progress`) is saved with the level (`achievementProgress`).

  | Trigger type | Event | Settings | Achievements |
  | --- | --- | --- | --- |
  | `pvz:blast` | `plantExploded`'s `kills` (the return value of `explode`, i.e. `KillAllZombiesInRadius`'s count: the zombies burned, and those dead, falling over or crushed by a lawn mower after the blast) | `plants`, `kills` | SPUDOW (Potato Mine, 1), Explodonator (Cherry Bomb, 10) |
  | `pvz:bowling` | `bowlingImpact`'s `plantTypeId` and `hits` (the nut's own impact count; not counted on the first adventure's level 10 or earlier) | `plants`, `hits` | Roll Some Heads (plain Wall-nut, 5) |
  | `pvz:coin-streak` | Counts `itemScored` (collected, `Coin::ScoreCoin`), `itemExpired` (faded away) resets the count, granted on reaching the number exactly | `items`, `coins` | Penny Pincher (silver and gold coins, 30) |
  | `pvz:sun-held` | `sunAdded` (the sun held after `Board::AddSun`) | `sun` | Sunny Days (8000) |
  | `pvz:mind-controlled` | `mindControlled` (`Zombie::StartMindControlled`): a zombie coming over to the `plants` side; a plant that swallowed a Hypno-shroom, or a zombie brought over to the `zombies` side, does not count | `zombies` | Disco is Undead (the Dancing Zombie, not its backup dancers) |
  | `pvz:win-planting` | `plantPlaced` (not `/plant`'s, which carry `debug`) records whether a plant that does not fit was planted; on `levelWon` it grants on the listed boards, with no announcement in the level | `boards`, `skipRules` (bowling, Whack-a-Zombie), `only` / `never` (`{ nocturnal, plants }`: nocturnal plants, the original's mushrooms, plus the plants listed) | Good Morning (day, `only` nocturnal plants), No Fungus Among Us (night, `never` nocturnal plants) |

- To wire in once their content is implemented: Don't Pea in the Pool (`pvz:win-planting`, the pool board, `never` pea shooters), Grounded (the roof board, `never` pults, and conveyor-belt levels left out as well), Cryptozombologist (the Yeti), Popcorn Party (the Gargantuar, the Cob Cannon), Home Lawn Security (5-10), Beyond the Grave, Nobel Peas Prize, Better Off Dead, China Shop, Immortal (mini-games, Puzzle, Survival), Towering Wisdom (the Tree of Wisdom), Morticulturalist (the store's plants), Mustache Mode (Mustache Mode).

Differences from the original:

- The original queues an achievement message behind a huge wave's message; here the huge wave's message is another node, and the two show at the same time (in places that do not overlap).
- The achievement-only award page (AWARD_ACHIEVEMENTONLY) is not implemented: every current level has an award.
- The catch-up grants at the main menu and on loading a profile are not implemented (see "Catch-up grants").

## Definitions

21 entries; their order is the id, and also the position in the atlas `IMAGE_ACHEESEMENTS_ICONS` (70×70 cells, 7 a row). The table is at `0x7290d0`, each entry a title key, a description key and a Steam name. The base game's gameplay `achievements` table (`mods/pvz-base/gameplay/definitions/achievements.json`) lists them in the same order, and an icon's `index` is the id here.

| id | Key | Steam name |
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

## Granting

`GiveAchievement` (`0x45bc00`) takes the id and "show now".

1. If it is already earned, it returns false at once (apart from the Steam report, which does not concern this project).
2. It marks it earned and returns true.
3. Only with "show now" and in a level (`app->mBoard` exists) does it also mark it shown, and:
   - show `[ACHIEVEMENT_ACHIEVED]` in the level message bar (`{ACHIEVEMENT}` replaced by the title);
   - clear the current advice's `mHelpIndex` (set it to ADVICE_NONE);
   - play `SOUND_ACHIEVEMENT` (as it is granted, even when the message is queued).

A grant with "show now" outside a level (the store, the main menu), and a grant without "show now", only mark it earned, leaving it for a later award page to list.

The level's helper `Board::GrantAchievement` (`0x421830`) grants it with "show now" when it is not earned yet.

## Triggers

"In level" = show now, announced in the level message bar; "award page" = only marked earned, listed on the next award page.

### In the level

| id | Achievement | Where | Condition | Shown |
| --- | --- | --- | --- | --- |
| 4 | SPUDOW | `Plant::DoSpecial` Potato Mine `0x46cf01` | Its radius-60 blast in its own row actually kills ≥1 zombie (1800 damage, range flags 0x4D, not counting those already dying) | In level |
| 5 | EXPLODONATOR | `Plant::DoSpecial` Cherry Bomb `0x46cc53` | One blast (radius 115, a row above and below, burning) counts ≥10; size does not matter, imps, Bungee Zombies and the rest all count. What counts is the zombies dead or in DYING/BURNED/MOWERED after the blast, so ones already dying, and charred ones not yet gone, are counted again. The Doom-shroom and the Jalapeno run the same code but do not grant it | In level |
| 8 | ROLL_SOME_HEADS | `Plant::UpdateBowling` `0x4694d7` | The 5th and every later zombie impact of the same plain Wall-nut (not the Explode-o-nut or the Giant Wall-nut); it counts impacts, and hitting armor counts too. Not counted on the first adventure's level 10 or earlier (i.e. 1-5) | In level |
| 10 | ZOMBOLOGIST | `Board::AddZombieInRow` `0x4112ef` | Adventure level 40 (4-10), the Yeti spawned from a wave (fromWave ≥ 0); it need not be seen or killed | In level |
| 11 | PENNY_PINCHER | `Coin::ScoreCoin` `0x4347e3` | The level's "coins collected in a row" count, after +1, is exactly 30. Only silver and gold coins count (not diamonds or sun); only a silver or gold coin that fades away uncollected resets it. A coin pulled in by a Magnet-shroom neither adds to it nor resets it | In level |
| 12 | SUNNY_DAYS | `Board::AddSun` `0x41f52a` | After sun is added (capped at 9990), the sun held is ≥ 8000; this is what is held at that moment, not the level's total | In level |
| 13 | POPCORN_PARTY | `Projectile` Cob Cannon landing `0x47589d` | The level's "Gargantuars killed by Cob Cannon" count reaches ≥ 2; each cannon shot adds the difference in living Gargantuars (plain and red-eye) before and after it | In level |
| 20 | DISCO_IS_UNDEAD | `Zombie::StartMindControlled` `0x54452a` | A Dancing Zombie (not a backup dancer) is mind-controlled; the only way is chewing an awake Hypno-shroom | In level |
| 19 | MUSTACHE_MODE | `Board::DoTypingCheck` `0x41e77b` | Typing `mustache` or `moustache` in a level (turns Mustache Mode on or off; both grant it) | In level |

### Level completion

`0x41f200`, called by the level-complete flow only when the level is complete (`mLevelComplete`); in Survival it is called only when the last round is complete, and the counts accumulate across rounds. It returns "newly earned", which decides whether the award page shows the achievement list.

1. Mini-games (modes 16–50): it records this level in the profile's "first 20 mini-games completed" flags (new in 1096, `PlayerInfo+0x646c`), and once all 20 are set grants **16 BEYOND_THE_GRAVE**.
2. Whack-a-Zombie, Vasebreaker (4-5 included) and Wall-nut Bowling (1-5 included) levels: it ends here. The other mini-games end here too; only Adventure, Puzzle and Survival go on.
3. Adventure level 50: **0 HOME_SECURITY**.
4. By scene (`mBackground`):
   - the day pool, with no pea shooter planted → **7 DONT_PEA_IN_POOL**;
   - the roof (day or night), not a conveyor-belt level, with no pult planted → **9 GROUNDED**;
   - night scenes (night, fog, the roof at night, the mushroom garden, the aquarium), not an I, Zombie level, with no mushroom planted → **15 NO_FUNGUS_AMONG_US**;
   - other scenes (day, the day pool, the day roof, the greenhouse, the Tree of Wisdom), with only mushrooms and Coffee Beans planted → **14 GOOD_MORNING**.

All of these are shown on the award page.

The counts are updated in `Board::AddPlant` (`0x4105a0`); the Imitater counts as the plant it imitates:

| Count | Initial value | Condition |
| --- | --- | --- |
| Pea shooter planted | No | Peashooter, Snow Pea, Repeater, Threepeater, Split Pea, Gatling Pea |
| Pult planted | No | Cabbage-pult, Kernel-pult, Melon-pult, Winter Melon (not the Cob Cannon) |
| Mushroom planted | No | Puff-shroom, Sun-shroom, Fume-shroom, Hypno-shroom, Scaredy-shroom, Ice-shroom, Doom-shroom, Sea-shroom, Magnet-shroom, Gloom-shroom (the Grave Buster does not count) |
| Only mushrooms and Coffee Beans planted | Yes | Planting any plant other than the mushrooms above and the Coffee Bean (the Grave Buster, Lily Pad, Flower Pot and Pumpkin included) makes it no |

Only plantings that go through `AddPlant` count: the player planting from a seed slot or the conveyor belt, items such as It's Raining Seeds' seeds, the Imitater turning, Beghouled upgrades, Column, and the nuts the Shovel and Squirrel mini-games place beforehand. Plants preset by the level, placed by a cutscene, and I, Zombie's starting plants do not count.

The level counts (the four planting flags, coins collected in a row, Gargantuars killed by Cob Cannon) are all initialised when a new level is created and are saved with the level.

### Modes and profile

| id | Achievement | Where | Condition | Shown |
| --- | --- | --- | --- | --- |
| 17 | IMMORTAL | `Board::StartLevel` `0x40f2a9` | At the start of each round of endless Survival (modes 11–15) (after choosing seeds), with ≥ 20 flags completed, i.e. as round 11 starts | In level |
| 2 | BETTER_OFF_DEAD | `Challenge::IZombieInitLevel` `0x42ec76` | Endless I, Zombie, starting the next round with a streak of exactly 10 | In level |
| 3 | CHINA_SHOP | `Challenge::ScaryPotterPopulate` `0x42d0fd` | Endless Vasebreaker, setting out the vases with a streak of exactly 15 | In level |
| 18 | TOWERING_WISDOM | `Challenge::TreeOfWisdomGrow` `0x4310bd` | The Tree of Wisdom is exactly 100 feet after it grows | In level |
| 6 | MORTICULTURALIST | `StoreScreen::PurchaseItem` `0x49bb58` | After a store plant is bought, all 9 of the store's plants (Gatling Pea to Imitater) are owned; the 40 basic ones are not looked at | Not in a level, left for the award page |
| 1 | NOBEL_PEAS_PRIZE | `AwardScreen` constructor `0x4082de` | A non-adventure award page, with Adventure completed and all 48 trophies won (Survival 10, mini-games 20, Puzzle 18) | Next award page |
| 0 | HOME_SECURITY | `AwardScreen` constructor `0x40818d` | An adventure award page, with the level number back at 1 and Adventure completed (a fallback for the level-50 completion check above) | Next award page |
| 19 | MUSTACHE_MODE | `GameSelector::KeyChar` `0x4507ec` | Typing `mustache` or `moustache` at the main menu | Next award page |

### Catch-up grants

Syncing the profile at the main menu (the end of `GameSelector::SyncProfile`, `0x44eed0`; on entering the main menu and on switching, creating or renaming a user) grants from the profile's data, with no announcement since it is not in a level:

- 0: Adventure completed;
- 1: the same Gold Sunflower trophy condition as above;
- 10: the Yeti can already appear (Adventure completed ≥2 times, or completed once with the current level ≥ 40);
- 18: the Tree of Wisdom ≥ 100 feet;
- 6: all 9 store plants owned.

On loading a profile (once per profile per run, `0x470b40`): if every one of the first 20 mini-games has a score above 0, it grants 16.

Both exist to give old profiles their achievements; this project has no old profiles, so they can be left out.

## Display

### Level message

Style 0x12 (`MESSAGE_STYLE_ACHIEVEMENT`), the same in every respect as HINT_TALL/TUTORIAL_LEVEL2:

- shown for 250 ticks (not counted while paused), then gone at once, with no fade in or out;
- font HOUSEOFTERROR28, color (253, 245, 173), its alpha flashing by `TodAnimateCurve(75, 0, mMainCounter % 75, 192, 255, BOUNCE_SLOW_MIDDLE)`;
- a backing bar `FillRect(0, 476, 800, 100)`, color (0, 0, 0, 128); the text wraps and is centered in this rectangle, 4 higher;
- no icon.

With other messages: it queues only while a message with an animation, such as a huge wave's, is showing (the current message's duration becomes min(remaining, slide-out time + 101), and the achievement message shows once it ends); otherwise it replaces the current advice at once, and the advice it replaces does not come back.

### The award page's achievement list

`AwardScreen(type, showAchievements)`:

- On construction it lists **every** earned but unshown achievement (not only this level's) in id order, marks them shown, and saves the profile right away. The two catch-up grants in the constructor above (0, 1) come after the list, so they wait for the next time.
- When the list is not empty it shows first, in place of the usual award content:
  - background `IMAGE_CHALLENGE_BACKGROUND`;
  - title `[ACHIEVEMENTS_TITLE]`, HOUSEOFTERROR28, (220, 220, 220), centered on x=400, y=58;
  - entry k (of n) has the target y = 284 − 76n/2 + 76k; it starts from y=750 and slides to its target with EASE_IN_OUT between ticks 150 + 100k and 250 + 100k;
  - the 70×70 icon is drawn at (220, y+10);
  - title `[ACHIEVEMENT_EARNED]`, DWARVENTODCRAFT15, (224, 187, 98), centered on x=450, baseline y+25;
  - description DWARVENTODCRAFT12, white, wrapped and centered in (300, y+20, 300, 60);
  - a 180-tick fade in from white (as on an ordinary award page).
- Once the last entry is in place (tick 150 + 100n), the "Continue" button shows: the SEEDCHOOSER_BUTTON images, (324, 515, 156, 42), DWARVENTODCRAFT15, text color (213, 159, 43), text `[CONTINUE_BUTTON]`. The usual start and menu buttons are hidden meanwhile. Clicking anywhere but the button does nothing; Space, Enter and Esc perform "start" directly, skipping the list.
- Clicking "Continue" brings back the usual award content and buttons. When the level number has gone back to 1 after Adventure is completed, it goes to the credits instead (CREDITS_ZOMBIENOTE).

### When the award page shows

The level-complete flow `0x4575c0` (its "newly earned" argument = the return value of the level-completion check):

| Mode | Case | Result |
| --- | --- | --- |
| Adventure | Levels with an award (before level 50 on the first adventure, levels 9/19/29/39/49, level 50) | Award page, with the achievement list |
| Adventure | Other levels, something newly earned | Achievement-only award page (AWARD_ACHIEVEMENTONLY) |
| Adventure | Other levels, nothing newly earned | Straight to the next level |
| Mini-game | New content unlocked and Adventure completed | Award page, with the achievement list |
| Mini-game | Otherwise, something newly earned | Achievement-only award page |
| Puzzle, Survival | New content unlocked | Award page, with the achievement list |
| Puzzle, Survival | Otherwise | Back to the challenge page, no achievements shown |

"Newly earned" looks only at the level-completion check; ones already announced in the level do not count. Ones earned outside a level (the store, the main menu) appear on the next award page that shows the achievement list. The achievements page looks only at whether an achievement is earned, not at whether it has been shown.

## Problems in the original

Not to be copied in the implementation:

- "Continue" on the achievement-only award page always goes into Adventure (`PreNewGame(ADVENTURE)`), even when the achievement was earned in a mini-game; Space and Enter take "start" and go back to the challenge page. It should go back to the page it came from.
- Puzzle and Survival never show the achievement-only award page, so completion achievements earned there wait for a later award page.
- The Cherry Bomb counts zombies already dying a second time (see EXPLODONATOR).
- The descriptions do not match the conditions: Roll Some Heads counts impacts, Cryptozombologist needs only the Yeti to spawn, Morticulturalist looks only at the store's 9, and Sunny Days is the sun held.
