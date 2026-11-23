[简体中文](GAMEPLAY.zh-CN.md)

# Gameplay

Every level and unit follows the original *Plants vs. Zombies* (Steam Game of the Year edition, 1.2.0.1096), and each rule names where it comes from in the original; deliberate changes are marked.

## Scope

- Adventure mode is playable and connected from 1-1 through 2-10: every Day and Night level. The levels after 2-10 are not implemented.
- The main menu uses the original's image buttons and its Reanim entrance animation. Options has working settings and in-game actions.
- The Almanac and the Store have their own content and interactions. The other game modes (mini-games, puzzles, survival) are not implemented.
- The debug console is available in Debug and Release builds: press `/`, or double-tap the bottom-right corner in mobile mode. See [Debug Console](DEBUG_CLI.md).

## Conventions

- **Ticks.** Play advances in ticks of 1/100 s, the original's logic rate. An animation rate in fps is frames per second.
- **Rows and columns** are counted from 1, from the top and from the left, as the debug console counts them. The original's code and this project's level data count from 0; a value quoted from them says so.
- **Coordinates** are pixels of the original 800 × 600 screen, x to the right and y downwards.
- **First adventure** means play before the player profile has finished Adventure mode once (the original's `LawnApp::IsFirstTimeAdventureMode`; here the profile's `finishedAdventure` is 0). Crazy Dave's dialogues, the tutorials and some limits apply only then.
- **Names.** `Class::Method` and `UPPER_CASE` names are the original's functions and constants. Lower-camel names, paths and JSON keys are this project's: code under `assets/scripts/` (`server/`, `client/`, `shared/`), gameplay data under `mods/pvz-base/gameplay/` and presentation data under `mods/pvz-base/presentation/`.
- **Differs from the original** marks a deliberate difference; everything else follows the original. [Differences from the original](#differences-from-the-original) collects them.

## Adventure

### Level overview

Every level has lawn mowers. Waves are numbered from 1; a flag wave also brings the Flag Zombie and plain Zombies (see [Waves](#waves)). The "introduced" zombie is placed on the listed waves before the random picks.

| Level | Lawn | Rows | Starting sun | Sky sun | First wave (ticks) | Waves | Flag waves | Zombie pool | Introduced | Award |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-1 | Day | 3 | 150 | Yes | 1800 | 4 | none | Zombie | — | Sunflower |
| 1-2 | Day | 2–4 | 50 | Yes | 1800 | 6 | 6 | Zombie | — | Cherry Bomb |
| 1-3 | Day | 2–4 | 50 | Yes | 1800 | 8 | 8 | Zombie, Conehead | Conehead (5, 8) | Wall-nut |
| 1-4 | Day | 1–5 | 50 | Yes | 1800 | 10 | 10 | Zombie, Conehead | — | Shovel |
| 1-5 | Day | 1–5 | 0 | No | 200 | 8 | 8 | Zombie, Conehead | — | Potato Mine |
| 1-6 | Day | 1–5 | 50 | Yes | 1800 | 10 | 10 | Zombie, Conehead, Pole Vaulting | Pole Vaulting (6, 10) | Snow Pea |
| 1-7 | Day | 1–5 | 50 | Yes | 1800 | 20 | 10, 20 | Zombie, Conehead, Pole Vaulting | — | Chomper |
| 1-8 | Day | 1–5 | 50 | Yes | 1800 | 10 | 10 | Zombie, Conehead, Buckethead | Buckethead (6, 10) | Repeater |
| 1-9 | Day | 1–5 | 50 | Yes | 1800 | 20 | 10, 20 | Zombie, Conehead, Pole Vaulting, Buckethead | — | Zombie note |
| 1-10 | Day | 1–5 | 0 | No | 100 | 20 | 10, 20 | Zombie, Conehead, Pole Vaulting, Buckethead | — | Puff-shroom |
| 2-1 | Night | 1–5 | 50 | No | 1800 | 10 | 10 | Zombie, Newspaper | Newspaper (6, 10) | Sun-shroom |
| 2-2 | Night | 1–5 | 50 | No | 1800 | 20 | 10, 20 | Zombie, Conehead, Buckethead, Newspaper | — | Fume-shroom |
| 2-3 | Night | 1–5 | 50 | No | 1800 | 10 | 10 | Zombie, Conehead, Screen Door | Screen Door (6, 10) | Grave Buster |
| 2-4 | Night | 1–5 | 50 | No | 1800 | 20 | 10, 20 | Zombie, Conehead, Pole Vaulting, Screen Door | — | Suburban Almanac |
| 2-5 | Night | 1–5 | 0 | No | 200 | 8 | — | Whack a Zombie's own | — | Hypno-shroom |
| 2-6 | Night | 1–5 | 50 | No | 1800 | 10 | 10 | Zombie, Conehead, Football | Football (6, 10) | Scaredy-shroom |
| 2-7 | Night | 1–5 | 50 | No | 1800 | 20 | 10, 20 | Zombie, Conehead, Screen Door, Football | — | Ice-shroom |
| 2-8 | Night | 1–5 | 50 | No | 1800 | 10 | 10 | Zombie, Conehead, Dancing | Dancing (6, 10) | Doom-shroom |
| 2-9 | Night | 1–5 | 50 | No | 1800 | 20 | 10, 20 | Zombie, Conehead, Screen Door, Dancing | — | Zombie note |
| 2-10 | Night | 1–5 | 50 | No | 100 | 20 | 10, 20 | Zombie, Conehead, Screen Door, Football, Dancing | — | Lily Pad |

The night levels' graves, by column (counted from 1):

| Levels | Graves | Columns 4 / 5 / 6 / 7 / 8 / 9 |
| --- | --- | --- |
| 2-1, 2-2, 2-3 | 4 | – / – / – / 1 / 1 / 2 |
| 2-4, 2-6, 2-8 | 7 | – / – / 1 / 1 / 2 / 3 |
| 2-7, 2-9 | 11 | – / 1 / 2 / 2 / 3 / 3 |
| 2-10 | 13 | 1 / 2 / 2 / 2 / 3 / 3 |
| 2-5 | 9, its own (see [2-5](#2-5-whack-a-zombie)) | from column 4 |

These are `Board::InitLevel`'s layouts for levels 11–20 in Steam 1096, whose columns count from 0 (1/1/2 from column 6, 1/1/2/3 from column 5, 1/2/2/3/3 from column 4 for levels 17 and 19, 1/2/2/2/3/3 from column 3).

### Waves

The adventure rule (`server/rules/adventure.ts`) builds the waves as `Board::PickZombieWaves` does; Wall-nut Bowling and the conveyor levels use it with a multiplier, and Whack a Zombie has its own.

1. **Points.** A wave's points are its index from 0 divided by 3, plus 1: waves 1–3 have 1, waves 4–6 have 2, and so on up to 7 for waves 19–20. (The original's `wave * 2 / 5 + 1` after a finished adventure is not used.)
2. **Flag waves** are the last of every ten waves, or the last wave of a level with fewer than ten; 1-1 has none (`Board::IsFlagWave`, `GetNumWavesPerFlag`). A flag wave first gets min(points, 8) plain Zombies and the Flag Zombie, paid out of its points multiplied by 2.5 (the settings' `flagWave`, `maxPlain` 8).
3. **Level multiplier** (`pointsScale`): ×4 on Wall-nut Bowling (1-5), ×3 on the conveyor levels 1-10 and 2-10.
4. **Introduced zombies** (`fixedZombies`) are put on their waves: the middle wave and the last.
5. **The final wave** gets one of each weighted zombie in the level's pool that it does not have yet (`PutInMissingZombies`).
6. **The rest** of the points is spent at random by the pool's weights, among the zombies that cost no more than what is left and are allowed on that wave (`firstWave`).

A zombie costs its `zombiePool` entry's points, otherwise its own `wave.points` (table in [Zombies](#zombies)). Each zombie of a wave picks its row as the original does: the last two picks are smoothed out, and a row whose lawn mower has just gone off is picked far less often for the next wave and half as often for the one after.

Timing (`server/level/waves.ts`, `Board::UpdateZombieSpawning`):

- The first wave comes at the level's `firstWaveTicks`, 1800 when none is given (`ZOMBIE_COUNTDOWN_FIRST_WAVE`).
- The next wave comes 2500–3099 ticks after the last, or 4500 before a flag wave.
- From 400 ticks after a wave comes, once its zombies are worn down to 50–65 % of their starting health (rolled for each wave), the next wave comes within 200 ticks; before a flag wave, only once they are all gone. A wave's health counts the body and the helm in full and a shield at 0.2 (`Board::TotalZombiesHealthInWave`), for its zombies on the zombies' side that are walking, eating or in the air.
- A flag wave's huge-wave warning appears 5 ticks before it is due and then holds it for 751 ticks; its sound plays 25 ticks in, and the music bursts with 700 ticks left at night and 400 by day.
- Each wave is announced 5 ticks ahead (`Board::NextWaveComing`): the first with the "awooga", a flag wave with the siren, and the last wave with its banner.
- After the last wave, the graves open (see [Graves](#graves)) and the award drops from the last zombie of the zombies' side to go; zombies on the plants' side do not hold it back (`Board::AreEnemyZombiesOnScreen`). As it drops, every other zombie not dead or dying vanishes (`Board::RemoveAllZombies`). **Differs from the original:** with no zombie to drop it, the award comes down in the middle of the lawn, 40 px right of and below the corner of the cell at row 3, column 5 (where `Challenge::SpawnLevelAward` puts one); the original drops none.

### Day: 1-1 to 1-10

#### 1-1 to 1-4

- **1-1** is played on row 3 alone with four waves of Zombies. On a first adventure the planting tutorial (`plantingTutorial`) holds the first wave and the sky sun back until the first plant. Award: Sunflower.
- **1-2** uses rows 2–4. On a first adventure the Sunflower tutorial (`sunflowerTutorial`) prompts the player to plant Sunflowers. Award: Cherry Bomb.
- **1-3** uses rows 2–4 and introduces the Conehead on waves 5 and 8. Award: Wall-nut.
- **1-4** uses all five rows. Award: the Shovel, a tool award.
- On 1-3, 1-4, 1-6 and 1-7, on a first adventure, the more-sun reminder (`moreSunTutorial`, `Board::UpdateTutorial`) asks for more Sunflowers once five waves have come, while fewer than three are planted and a Sunflower packet is ready. It never delays the waves.

#### 1-5: Wall-nut Bowling

- **Intro.** Crazy Dave's two dialogues and the shovel lesson come from `shovelTutorial`. On a first adventure Dave says lines 2400–2406; three Peashooters stand on the lawn (row 2 column 6, row 3 column 8, row 4 column 7), the shovel is up during the intro and the player digs them up; Dave then says 2410–2415. A replay goes straight to 2411–2415. The client's `CrazyDaveView` only plays Dave's animation, shows the original's lines and sends the interaction commands.
- **Play.** Eight waves of Zombies and Coneheads at four times the points; no starting sun and no sky sun; the first wave at tick 200. The red line keeps planting to columns 1–3 (`plantingLine`).
- **Conveyor.** It starts with a Wall-nut and supplies bowling Wall-nuts and Explode-o-nuts 85:15 (see [Conveyor belt](#conveyor-belt) and [Bowling nuts](#bowling-nuts)).
- **No money** drops on Wall-nut Bowling (`Board::DropLootPiece`).
- **Award:** Potato Mine.

#### 1-6 to 1-9

These levels follow the reference `Challenge.h`, `Board::PickZombieWaves`, `Challenge::UpdateConveyorBelt` and `LawnApp::GetAwardSeedForLevel`:

| Level | Waves | New | Award |
| --- | --- | --- | --- |
| 1-6 | 10 | Pole Vaulting Zombie (waves 6 and 10) | Snow Pea |
| 1-7 | 20 | — | Chomper |
| 1-8 | 10 | Buckethead Zombie (waves 6 and 10), without Pole Vaulting Zombies | Repeater |
| 1-9 | 20 | — | the zombie note |

1-6 and 1-7 take every available seed into the bank, five and six, which fit it; 1-8 and 1-9 open the seed chooser to choose six from the shared catalog (see [When the chooser opens](#bank-size-and-when-the-chooser-opens)).

**Available seeds** are the ones the player owns (`LawnApp::HasSeedType`):

- The profile keeps them in `seeds`. A won level adds its award seed, and a store purchase of kind `seed` adds the plant it sells.
- The gameplay settings' `seedBank.startingSeeds` (the Peashooter) are owned from the start.
- The level gets the list as `ownedSeeds` in its start packet and keeps it in its save. Without a player, every catalog seed is available.
- The chooser, and a chooser left open in a save, accept only those seeds. A confirmed bank may hold any installed seed (`/seed`). An award's packet shows the seed's own cost.

**The zombie note** (1-9's award) uses its own dropped image, fades in place, and leads to the award page through a 500-tick black transition (other awards take 600 ticks and fade to white), with the paper sound and the `pageImages` layout (the day lawn, the note and its text).

#### 1-10: conveyor belt

- The existing conveyor with seven free plant types, weighted Peashooter 20, Cherry Bomb 20, Wall-nut 15, Repeater 20, Snow Pea 10, Chomper 5 and Potato Mine 10.
- No starting sun and no sky sun. The first wave comes at tick 100, the first packet at tick 200. Waves have three times the points.
- The duplicate and repeat weights and the last seed supplied survive saves.
- Award: the Puff-shroom, which leads on to 2-1.

### Night: 2-1 to 2-10

The night levels reuse the shared level and chooser flow on the night lawn. No sun falls from the sky. The night music uses the same `MusicSystem`, reproducing scheme 2's next-order drum entry and melody crossfade, and keeps the separate drum phase in presentation saves.

#### Graves

**Placement.**

- Each level's graves stand in the columns listed in the [overview](#level-overview), each on a different random row.
- The opening graves draw their rows from their own seeded random stream over all six row indices, retrying inactive or occupied rows (`Board::AddGraveStones`; 1096 also draws the reserved sixth row on five-row lawns).
- A hash of the board seed, the row and the column gives each cell its stone variant (0–19) and pixel offsets (−5 to 4 on each axis), so a grave that comes back in the same cell looks the same, also after loading a save.
- One opening grave, picked at random, is the level's special grave (`Board::PickSpecialGraveStone`) and is drawn with the atlas's special stones; graves in row 1 use that row's own stones.

**On the lawn.**

- Ordinary planting on a grave is refused with the original's advice. Grave cells show no placement preview and no mobile guide.
- The graves rise with dirt particles and the rumble once the intro has panned back to the lawn, which delays the lawn mowers and "Ready, Set, Plant" by 100 ticks.
- A save puts the graves back at their height at once, a paused save included.

**After the last wave.**

- 200 ticks after the final wave, every fully risen grave on the lawn (not only the level's own) raises one zombie, picked by the level's `graveZombies` weights, over 150 ticks. None rises once the award has dropped. A grave raises its zombies on its own side.
- `graveZombies` names the zombies at their wave weights; with none given, the pool's zombies that can rise from graves (`graveRise`: Zombie, Conehead, Buckethead) are used.
- `GraveView` draws the original stone and mound atlases, and `ZombieView` clips the emerging body by the presentation's `graves.zombie`: how deep it starts and its clip, the original's `Zombie::UpdateZombieRiseFromGrave`, `GetDrawPos` and `DrawReanim` values. The clip is in board pixels whatever the zombie's size. A resource pack may change these values.

#### 2-1

- Night lawn, 50 starting sun, six chosen packets, ten waves.
- On a first adventure, Dave says lines 201–207 before the chooser opens (`CutScene::StartLevelIntro`).
- Introduces the Newspaper Zombie on waves 6 and 10. The graves raise plain Zombies.
- The first adventure's money rules start here (see [Coins](#coins)): a first coin with the pickup arrow after wave 5, a cap on savings, and the coin advice the first time a silver or gold coin is picked up.
- Chooser warnings: on a first adventure, a bank without the Puff-shroom warns first (`SEED_CHOOSER_PUFFSHROOM_WARNING`), and a bank without a sun producer gets the night wording (`SEED_CHOOSER_NIGHT_SUN_WARNING`); see [Chooser warnings](#the-chooser).
- Award: the Sun-shroom, which leads to 2-2.

#### 2-2

- Twenty waves (flags on 10 and 20) of Zombies, Coneheads, Bucketheads, Newspaper and Flag Zombies, on 2-1's graves, which raise Zombies or Coneheads 4000:4000 after the final wave.
- On a first adventure Dave says lines 1401–1402, with `{MONEY}` and `{UPGRADE_COST}` replaced by the current coins and the price of the next seed-slot upgrade.
- Award: the Fume-shroom, which leads to 2-3.

#### 2-3

- Ten waves of Zombies, Coneheads and Screen Door Zombies, on 2-1's graves. Introduces the Screen Door Zombie on waves 6 and 10.
- **Seed-slot offer.** On a first adventure where the player can afford the first seed-slot upgrade, owns none and has declined it fewer than twice (`CutScene::CanGetPacketUpgrade`), Dave pitches it in lines 1501–1503 (`packetUpgradeOffer`).
  - Line 1503 carries a `question` in the snapshot's `dialog` with the price and the slot count, and the Yes/No dialog answers it.
  - Yes takes the coins, adds the slot to this level's chooser at once, and continues with 1510–1511. No continues with 1520.
  - The answer and the coins after it reach the profile together in one `recordPacketUpgradeOffer`, and the offer survives saves.
  - While Dave is out, the coin bank stands beside him.
- Award: the Grave Buster.

#### 2-4

- Twenty waves (flags on 10 and 20) of Zombies, Coneheads, Pole Vaulting and Screen Door Zombies (`gZombieAllowedLevels`); no new zombie. Seven graves.
- The seed-slot pitch reuses 2-3's `packetUpgradeOffer`. The original pitches it on levels 13–24 except 15, 20 and 21.
- **Award: the Suburban Almanac** (`COIN_ALMANAC`), an `unlock` award.
  - It drops, gets the pickup arrow and shows the award page like a tool award, but adds no level tool.
  - Its `unlocks: "almanac"` records the almanac in the profile's `unlocks` when the level is won; from then on the main menu and the in-game options show the almanac (the original's level 15, `LawnApp::CanShowAlmanac`). The store and the Zen Garden work the same way with `"store"` and `"garden"` (the 3-4 car keys and the 5-4 watering can, not implemented yet), and a finished adventure opens all three.
  - Its `opens` labels the award page's button `VIEW_ALMANAC_BUTTON` and opens the almanac; closing an almanac opened from the award page goes on to the next level, 2-5 (`AwardScreen::StartButtonPressed`).

#### 2-5: Whack a Zombie

Zombies rise from graves and the player knocks them down with a mallet (`LawnApp::IsWhackAZombieLevel`).

**The level.**

- No starting sun and no shovel (`tools: []`). The bank is fixed: Potato Mine, Grave Buster and Cherry Bomb, ready at the start (`openingRecharge: false`); planting still recharges a packet (`SeedPacket::WasPlanted`).
- A seed put where it cannot go (on a plant, on a grave, or off a grave for the Grave Buster) is dropped with the drop sound instead of staying in hand (`Board::MouseDownWithPlant`, the `seedDropped` event).
- On a first adventure Dave opens with lines 401–406, holding the mallet. In every game, 1500 ticks after the first sun appears, the packets flash for 400 ticks or until a seed is picked (`whackTutorial`, `Challenge::WhackAZombieUpdate`).
- Items take clicks 15 px further around them and 30 more below (`Coin::MouseHitTest`): the level's gameplay `itemClickPadding`, which the server's hit test (`itemAt`, shared) reads as the client does. Elsewhere only the sun takes clicks 15 px around (its item's `clickPadding`).
- Award: the Hypno-shroom, whose ability works from 2-6.

**The rule.** The level writes `rules: {kind: "pvz:whack-a-zombie", count: 8, zombies, sun}`: eight empty waves, the plain, cone and pail zombies the groups use, and the sun item a knocked-down zombie may drop. The first wave's countdown is the level's usual `firstWaveTicks` (200). The mechanism's numbers are settings of the rule too; the base level writes none of them, a variant level may, and the rule rejects unknown keys and settings that do not fit the lawn or the waves. Where a level writes none, the original's apply (`NUMBERS` and `CHANCES` in `server/rules/whackAZombie.ts`):

| Setting | Value | Meaning |
| --- | --- | --- |
| `graves` | 9 | Graves at the start |
| `firstGraveColumn` | 3 | First column for graves, counted from 0 (column 4) |
| `refillGraves` | 5 | Graves topped up to before each later wave (at least one is added) |
| `refillTicks` | 100 | How long before the wave the graves are topped up |
| `waveTicks` | 2000 | Length of each wave |
| `spawnCutoffTicks` | 300 | No group rises when the next wave is closer than this |
| `finalGroup` | 20 | Zombies in the final group |
| `finalGroupDelayTicks` | 300 | Ticks into the last wave the final group rises |
| `riseTicks` | 50 | How long a zombie takes to rise |
| `hammerRadius` | 45 | Radius of the mallet's blow |
| `hammerDamage` | 900 | Damage of the mallet's blow |
| `chances` | `{double, triple, pail, cone}` | Chances out of 100 for each of the 6 phases |

`server/rules/whackAZombie.ts` raises the zombies as `Challenge::WhackAZombieSpawning` does, on the waves' own countdown (`wave.nextWaveAtTick`, the shared `mZombieCountDown`, which the progress meter follows); the rule's `spawnsZombies` keeps the normal wave system out.

- **Opening graves.** Nine graves from column 4 (`WhackAZombiePlaceGraves`), on random cells that have no grave or crater, strongly preferring cells without a plant; a grave put on a plant's cell kills the plant. One of them is marked special.
- **Waves.** The first wave comes after 200 ticks and the next every 2000. 100 ticks before each later wave, the graves are topped up to five, adding at least one.
- **Groups.** While the next wave is at least 300 ticks away, groups rise one after another; each wave's first group comes at once. A group is one zombie type, rising from random graves; a grave that a Grave Buster is eating raises nothing. Each zombie rises for 50 ticks and walks at a speed from 0.5 up to a cap that rises with the wave number on an ease-in curve from 1 (wave 1) towards 3 (wave 12). The gap to the next group is 100–200 ticks on wave 1, shrinking along a curve towards 30–60 on wave 12.
- **Phases.** The chances depend on the phase, (wave − 1) × 6 / 12 rounded down, so the base level's eight waves use phases 0–3:

  | Waves | Phase | Group of 2 | Group of 3 | Buckethead | Conehead |
  | --- | --- | --- | --- | --- | --- |
  | 1–2 | 0 | 0 % | 0 % | 0 % | 0 % |
  | 3–4 | 1 | 30 % | 0 % | 0 % | 0 % |
  | 5–6 | 2 | 10 % | 0 % | 0 % | 30 % |
  | 7–8 | 3 | 10 % | 0 % | 10 % | 30 % |
  | (9–10) | 4 | 15 % | 10 % | 15 % | 30 % |
  | (11+) | 5 | 18 % | 13 % | 15 % | 30 % |

  A group of three that rolls a Buckethead gets Coneheads instead.
- **Final group.** 300 ticks into the last wave, 20 Coneheads or Bucketheads rise at speeds up to 2, as many as there are graves free to raise them.
- **Announcements.** Each wave is announced 5 ticks ahead by the shared `nextWaveComing` (`Board::NextWaveComing`), whose siren here goes before the last wave.
- **Award.** No award drops before the final group has risen (the countdown is then unset). **Differs from the original:** if no zombie could rise in the final group (every grave being eaten) and none is left on the lawn, the award drops at once; the original never drops it and the level cannot end.

**The mallet.** A click on the board is the generic `boardClick` command, which goes to the rule (`Challenge::MouseDown`, `MouseDownWhackAZombie`):

- It hits the front zombie whose body overlaps a circle of 45 px around a point 20 px above the click. It passes over the player's own side: mind-controlled zombies and the player's plants.
- A zombie with a helm takes 900 to the helm only (`helmOnly` in `damageZombie`).
- Otherwise a zombie with no more than 900 health dies at once with its loot, and the cursor is cleared (`Board::ClearCursor`). Every zombie of the original dies this way; a zombie with more health only takes the blow, past its shield.
- **Differs from the original:** a plant of the zombies' side under the mallet takes the same blow; the original's mallet never meets plants.
- The loot of a knocked-down zombie may be three suns instead of a coin (`Board::DropLootPiece`, rarer the more sun the player has: the roll just past the silver coin's range, up to 5000 per point of value with 200 sun or less, 3700 over 200, 3100 over 350, 2800 over 500).
- An emptied cursor is the mallet again only until the award drops; then the mallet is put away (`Challenge::ClearCursor`, the rule's `cursorCleared`; the snapshot's `extensions["pvz:whack-a-zombie"].hammer`). It disappears with the blow that kills the last zombie and cannot swing again.

**On the client**, `client/level/rules/WhackAZombieView` draws:

- the mallet cursor (`pvz:hammer` at 24 fps, restarting at 0.2 of its clip on a click, `swingTime`), hiding the system cursor under it when nothing clickable is hovered (`Board::UpdateCursor`, `UIHoverManager.setIdleCursor`);
- the blows' sounds and the POW;
- the seed bank coming down 2 px a tick once there is sun, after the intro left it above the screen (`hiddenSeedBank`).

These presentation settings are `pvz:whack-a-zombie` in `presentation/definitions/rules.json`; the generic view reads its `graveRise`.

#### 2-6

- Ten waves (the last a flag wave) of Zombies, Coneheads and Football Zombies (`gZombieAllowedLevels` for level 16), on seven graves. Introduces the [Football Zombie](#football-zombie) on waves 6 and 10.
- **Second seed-slot offer** (`packetUpgradeOffers(2)`): from level 16, a player who owns the first extra slot and can afford the second hears 1551–1553, then 1560 after Yes or 1570 after No (`CutScene::CanGetSecondPacketUpgrade`). A player who owns none still hears the first pitch.
- The [Hypno-shroom](#hypno-shroom) works from here.
- Award: the [Scaredy-shroom](#scaredy-shroom).

#### 2-7

- Twenty waves (flags on 10 and 20) of Zombies, Coneheads, Screen Door and Football Zombies (`gZombieAllowedLevels` for level 17); no new zombie.
- Eleven graves, `Board::InitLevel`'s layout for levels 17 and 19 in Steam 1096.
- 2-6's seed-slot offers.
- Award: the [Ice-shroom](#ice-shroom).

#### 2-8

- Ten waves (the last a flag wave) of Zombies, Coneheads and Dancing Zombies (`gZombieAllowedLevels` for level 18), on seven graves, with 2-6's seed-slot offers.
- Introduces the [Dancing Zombie](#dancing-zombie-and-backup-dancer): one on wave 6 and one on the last.
- Award: the [Doom-shroom](#doom-shroom).

#### 2-9

- Twenty waves (flags on 10 and 20) of Zombies, Coneheads, Screen Door and Dancing Zombies.
- The same eleven graves as 2-7 and the same seed-slot offers as 2-8. The Doom-shroom won in 2-8 is in the chooser.
- Award: the second zombie note, shown over the night lawn.

#### 2-10: night conveyor belt

- Twenty waves (flags on 10 and 20) of Zombies, Coneheads, Screen Door, Football and Dancing Zombies, at three times the points. The first wave comes at tick 100 and the first packet at tick 200; 50 starting sun.
- Thirteen graves across columns 4 to 9.
- The belt supplies Grave Buster 20, Ice-shroom 15, Doom-shroom 15, Hypno-shroom 10, Scaredy-shroom 15, Fume-shroom 15 and Puff-shroom 10. Before each draw it counts the Grave Busters in play and on the belt; when they cover the graves left, the draw leaves Grave Busters out.
- No seed-slot pitch: the original makes none on level 20.
- **Award: the Lily Pad** (25 sun, 750-tick recharge). Its almanac entry uses the pool background. A land cell refuses the aquatic packet with the original's water-only advice; the installed lawns have only land cells.
- **End of the installed adventure.** On the last installed adventure level, both award-page buttons return to the main menu and show the completion dialog there. The level selector shows and opens the installed main-line level the profile's progress has reached; at the end of the chain it offers the last level for replay and keeps the next index in the profile for future levels.

### Conveyor belt

1-5, 1-10 and 2-10 deal their packets on a belt instead of a bank (`SeedBank::UpdateConveyorBelt`, `Challenge::UpdateConveyorBelt`; `server/level/conveyor.ts`):

- The belt holds up to 10 packets, 50 px apart, entering at x = 515 and moving 1 px every 4 ticks.
- A new packet is due 400 ticks after the last, 425 with five or more on the belt, 500 with seven or more, 1000 with nine or more. Packets cost no sun.
- The draw is weighted. With more than two seed types, a seed with four or more packets on the belt has weight 1, one with three has weight 5, and the seed supplied last has half its weight.
- The Grave Buster limit (2-10) is applied before those weights.
- The belt stops once the level award has dropped.

## Seeds and the seed chooser

### Seed definitions

- **Places.** Every seed has a `position`, its place in its group (`shared/content/seedGroups.ts`): 8 columns in reading order from 0, 48 places a page, unique in the group.
- **Groups**, in this order: the original seeds, each Mod's, then the hidden cards.
  - The base game's seeds are the original group, the chooser's grid (`SeedChooserScreen::GetSeedPositionInChooser`). Their places are the original's plant seed types, plants only, 0–47. The grid has five rows (places 0–39) until a seed at 40–47 (the upgrade plants) is offered, then six rows 70 px apart from y = 123 (`SeedChooserScreen::Has7Rows`). Place 48 is the Imitater's. A place no seed takes stays an empty silhouette.
  - Base seeds marked `"hidden": true` are the hidden cards: the Explode-o-nut, the two bowling nuts, every zombie seed, the grave seed and the crater seed.
  - A Mod's seeds are its own group, numbered from 0, never in the grid nor among the hidden cards. A Mod moves anyone's seed by writing its new `position` under its ID in its own `seeds`.
- **Kinds.** A seed's `kind` says what it puts down: `plant` (with its `placement`), `zombie` (the original's `SEED_ZOMBIE_*`), `grave` or `crater`. A plant or zombie seed puts down the plant or zombie of its own ID unless its `id` names another. A new kind of seed is one more definition with its own `kind`, leaving the others as they are.
- **The grid holds plant seeds only.** With `/cheatseed`, the chooser and the almanac turn past the grid to pages for each Mod's seeds and for the hidden cards, then the same again on the zombies' side (`shared/content/chooserPages.ts`). Mods may also offer cards beyond the grid by wrapping `seedChooser.entries` (`server/seeds/seedChooser.ts`).

### Zombie, grave and crater seeds

These seeds are project additions (see [Teams and the Hypno-shroom](TEAMS.md)); they work on any level, through `/seed` or a level's `seedPackets`, and have no recharge.

- **Zombie seeds.** Every zombie has one, of its own ID (`pvz:normal` for the plain Zombie). Costs: the plain, cone, pole vaulter, bucket, screen door and dancer ones cost what the original's do (50, 75, 75, 125, 100, 350); the Flag Zombie, Newspaper Zombie and Backup Dancer, which the original has none for, 50, 75 and 100; the Football Zombie's 175.
  - It goes into any cell of an active row, whatever stands there, 30 px left of the cell (`Challenge::IZombiePlaceZombie`); one on the plants' side stands its `facingRightOffsetX` further.
  - Its packet draws the zombie at its presentation `packet` offset, scale and pose `clip` (the Pole Vaulting Zombie on `walk`, as the original's cache does).
  - A Pole Vaulting Zombie facing right vaults right, the jump mirrored across both widths; one put down on a plant's cell does not vault back.
- **Grave seed** `pvz:grave` (`"kind": "grave"`, 0 sun). It puts a grave in any cell of an active row the way Grave Danger's come (`Challenge::GraveDangerSpawnGraveAt`): the plants there die and the grave rises from that tick. A cell that already has a grave refuses it (`/griditem grave` still replaces one), and so does a crater, as for a level's graves (`Board::CanAddGraveStoneAt`). It is the zombies' own; a packet of the plants' side gives the grave `team: "plants"`, and the zombies that rise from it after the last wave are on that side too.
- **Crater seed** `pvz:crater` (`"kind": "crater"`, its crater's `craterTicks` 18000). It puts a crater in any cell of an active row except one with a crater or a grave, the plants there dying. It is the plants' own (`seedTeam`); a packet of the zombies' side turns the crater's picture round. See [Craters](#craters).

### Bank size and when the chooser opens

- A level's `conveyor` gives a belt and its `seedPackets` a fixed bank. Otherwise the bank follows the original (`Board::InitLevel`): it takes every available seed when they fit, and the chooser opens when there are more.
- Slots are `settings.seedBank.baseSlots` (6) plus the seed-slot upgrades bought, capped at `maxSlots` (10) and at the number of available seeds (`Board::GetNumSeedsInBank`). Levels list no slot count or candidate pool.
- The client builds `maxSlots` packets up front, so a slot bought during the intro only shows one more.
- `server/seeds/seedChooser.ts` supplies the grid, validates the choices and the confirmation, and saves their order and opening recharges.
- A bank lists its slots in order, an empty one as `null`. While choosing, the chosen packets come one after another, and taking one out moves the rest up. `finishSeedChoice` starts the level and leaves the unchosen slots empty, which only happens when `/cheatseed`'s Let's Rock starts with fewer cards than slots; a short bank from an older save gets its empty slots back when loaded.
- An empty slot draws nothing and cannot be picked; `/seed` fills or empties any slot.
- A seed's opening recharge (`initialCooldownTicks`) applies when the level starts: a 5000-tick seed starts at 3500 and a 3000-tick one at 2000, as in the original; a level with `openingRecharge: false` starts them ready.

### The chooser

- **Shovel.** The shovel's bank follows the seed bank's width (`Board::GetSeedBankExtraWidth`): x = 456 for up to six slots, 516 for seven, 532 for eight, 568 for nine and 609 for ten. It stays hidden while seeds are chosen and shows once the intro is over.
- **Preview zombies.** Their tooltips reuse the shared button and tooltip controls and the presentation's localized `nameKey`, stay within the preview area, and hide once the choice is confirmed, the game is paused or a dialog is open. Once the player has the almanac (`unlocks.almanac`), a preview zombie listed in it (matched by `nameKey`) adds "click to view" to its tooltip; clicked, it plays the tap and opens the almanac's zombie page on its entry over the paused level, and Close returns to the chooser (`SeedChooserScreen::MouseDown`, `AlmanacDialog::ShowZombie`).
- **Almanac and Shop buttons.** The original buttons appear at (560, 572) and (680, 572) once the almanac and the store are unlocked. The store opened from the chooser says "Go back".
- **Warnings.** Before the level starts, the chooser warns as the level script's `chooserWarnings` lists, in order (`SeedChooserScreen::OnStartButton`); then, without a sun producer in the bank, it gives the sun warning (`SEED_CHOOSER_SUN_WARNING`, or the script's `sunWarning`). Choosing to repick at any warning stops the start.
- **Drawing order.** Chooser cards and their pictures are drawn in reading order, each over the one before, as `SeedChooserScreen::Draw` and `SeedBank::Draw` go left to right. `LevelSeedChooser` places each seed at its position, leaving the places of locked seeds empty, rather than by preview image indices, and runs its presentation on the shared clock.
- **Mouse wheel.** The wheel over the level turns the chooser's pages while it is out (`/cheatseed`'s pages). The level root listens for it, because a node of its own listening for any mouse event would take every press over it (`NodeEventProcessor._handleMouseDown`), such as the Menu button's. Mods may restyle the page buttons (`LevelSeedChooser.pageTurners`) and wrap `LevelView.attachSeedChooser` to add to every chooser.
- Use `/level pvz:seed-chooser-test` to test the chooser.

### Repick

`/repick` (`startRepick`) chooses the bank again during play, while the level stands still. It is a project addition, not available on conveyor levels or without a bank.

**On the server.**

- A repick and the pause are two separate states. A pause also stops the chooser, and the player ends it; a repick stops only the level, and its Let's Rock ends it; both can hold at once. To the board they are one: what the client shows and allows on the lawn goes by `levelStandsStill(snapshot)`, never by `paused` or `repick` alone.
- The bank's cards stay chosen, closed up over empty slots, with Survival's repick recharges (`CutScene::IsSurvivalRepick`): a card chosen again takes its old packet's recharge back, and any other is ready (`SeedPacket::SetPacketType`). No chooser warning is given.
- While `choosing`, the bank keeps `repick` (its size, whether the level had opened the chooser, and the packets it held); the server runs no gameplay ticks and refuses everything but the choice (`choosing-seeds`). A slot bought meanwhile waits for the next level.
- After a repick's Let's Rock, `finishSeedChoice` marks it `confirmed`, and the level keeps standing still until the client, its chooser lifted out and the bank back in place, sends `finishRepick`, which puts the bank back to the level's own, chosen or dealt.
- A repick is never saved (`SeedRepick` keeps the bank from before it). A save made during one holds that bank, or, once confirmed, the bank chosen, with the chooser state the level had, and loads into play. The client part holds none either: its frame is the server's world as the save holds it (`IntegratedGameServer.savedSnapshot`, from the same `savedSeedBank` as the save), so loading shows no chooser.

**On the client.**

- The client drops the chooser in and lifts it out on its own ticks (`LevelSeedChooser.repickTick`) without moving the camera.
- The bank moves to its choosing place at x = 0 as the chooser drops, and back to 10 as it lifts (`SEED_BANK_OFFSET_X`, `SEED_BANK_OFFSET_X_END`; 25 ticks each way, on the original's slide times, `SEED_CHOOSER_SLIDE` in `LevelSeedChooser`). The chooser's cards resting in the bank ride with it (`setBankShift`).
- Meanwhile the bank is lifted into the HUD right under the chooser, with the level award's layer under the bank (over the lawn's entities, the coins and the award, which would otherwise come between the bank and the chooser's cards in it; over the chooser it would hide them); then it goes back under the entities.
- Space leaves a repick alone, as it does the intro's chooser, while the menu still opens (`LevelController.isRepicking`).
- The repick hides the Almanac and Shop buttons and the shovel, pauses the music (`LevelAudioPresenter.holdMusic`, which the pause menu's resume leaves paused), stands the lawn's animations still, and builds a chooser the first time on a level that opened none.

## Plants

### Plant table

Costs and recharges are the seed definitions' `sunCost` and `cooldownTicks`; the opening recharge is `initialCooldownTicks`. Every plant has 300 health except the nuts (4000).

| Plant | Sun | Recharge | Opening recharge | Notes |
| --- | --- | --- | --- | --- |
| Peashooter | 100 | 750 | — | Peas of 20 every 136–150 ticks |
| Sunflower | 50 | 750 | — | 25-sun sun about every 2350–2500 ticks |
| Cherry Bomb | 150 | 5000 | 3500 | 100-tick fuse; 1800 within 115 px, one row each way; burns |
| Wall-nut | 50 | 3000 | 2000 | 4000 health |
| Potato Mine | 25 | 3000 | 2000 | Arms after 1500 ticks; 1800 within 60 px in its row |
| Snow Pea | 175 | 750 | — | Peas of 20 that chill for 1000 ticks |
| Chomper | 150 | 750 | — | Chews for 4000 ticks |
| Repeater | 200 | 750 | — | Two peas a shot |
| Puff-shroom | 0 | 750 | — | Night; range 230 px |
| Sun-shroom | 25 | 750 | — | Night; small sun, then grows |
| Fume-shroom | 75 | 750 | — | Night; 20 to every zombie within 340 px |
| Grave Buster | 75 | 750 | — | Planted on graves only |
| Hypno-shroom | 75 | 3000 | 2000 | Night; mind control |
| Scaredy-shroom | 25 | 750 | — | Night; hides from near zombies |
| Ice-shroom | 75 | 5000 | 3500 | Night; freezes every hostile zombie |
| Doom-shroom | 125 | 5000 | 3500 | Night; 1800 within 250 px, three rows each way; crater |
| Lily Pad | 25 | 750 | — | Water only |
| Explode-o-nut (hidden) | 150 | 3000 | 2000 | Blows up as it dies: 1800 within 90 px, one row each way |
| Bowling Wall-nut, Explode-o-nut (hidden) | 0 | 0 | — | Wall-nut Bowling's rolling nuts |

### Shared rules

- **Sleep.** A night plant (`nocturnal`, the mushrooms) on a lawn that is not at night sleeps (`Plant::mIsAsleep`, `isPlantAsleep`, the server's one test of a plant asleep): it does nothing, its blink waits, and zombies eat it as any plant, even one whose awake form they would leave alone.
- **Shots leave a puff at the mouth** (`Plant::Fire`): the Scaredy-shroom's `PARTICLE_PUFFSHROOM_MUZZLE` at 27 and 13 from the shot's corner, the Puff-shroom's at 18 and 13, the Snow Pea's `PARTICLE_SNOWPEA_PUFF` at 8 and 13, drawn just over the row's lawn mowers. This is the plant presentation's `muzzle`, placed where `projectileFired` says the shot set off.
- **Producers on the zombies' side** (the Sunflower, the Sun-shroom) make no sun. Each time they would, they take what that sun is worth (25, or a small Sun-shroom's 15) from the player's bank, down to 0 (the `sunDrained` event), glowing as they would and flashing the sun counter red with the buzzer. **Differs from the original**, where plants have no side (see [Teams and the Hypno-shroom](TEAMS.md)).
- **Saves.** Ability states such as the Sun-shroom's growth and the Grave Buster's progress are saved.
- **Almanac and level share their look.** Installed plants use their level animations in the almanac, with the same body coordinates, scale and shadow.

### Puff-shroom

- 0 sun, 750-tick recharge. Sleeps by day.
- It is put down at a random offset in its cell, the original's x = −5…4 and y = −3…2, kept in its position, and has a centred half-size night shadow.
- It attacks zombies within 230 px beyond its attack origin. Its spores expire at age 75, before reaching anything further (its own `overrides` of the spore projectile).
- It uses the existing shooting, damage and save systems.

### Sun-shroom

- 25 sun. Awarded by 2-1, so available from 2-2. Sleeps by day, and asleep it neither grows nor produces.
- While small it drops 15-sun small sun at half scale. After 12000 awake ticks it grows through the 100-tick `anim_grow`, producing nothing meanwhile, and then drops normal 25-sun sun.

### Fume-shroom

- 75 sun. Awarded by 2-2, so available from 2-3.
- It fires every 136–150 ticks after a 50-tick windup, dealing 20 to every zombie within 340 px of its attack origin in its row.
- The fumes pass a shield: a zombie's shield takes the damage and its body still takes it in full (`hitsShieldAndBody`).
- The fume cloud appears 35 ticks into the shot.

### Grave Buster

- 75 sun. Awarded by 2-3, so available from 2-4.
- It can only be planted on a grave, otherwise with the original's advice, and only on one of the other side: a plants' Grave Buster on the zombies' graves, a zombies' one on the plants' side's. On a grave of its own side it is refused (`cell-has-own-grave`) without advice.
- Zombies can eat it, but the shovel cannot dig it.
- It lands for 47–70 ticks (`anim_land` at the body's random 10–15 fps), then eats for 400 ticks, sinking 30 px while the stone is eaten from the top, and finally removes itself and its grave.
- **Loot.** It drops a loot piece at 12 times a plain zombie's chances (`DropLootPiece` at factor 12) only when it ate a grave and is on the plants' side. **Differs from the original**, which drops one even with no grave; only `/plant` can reach that case.

### Hypno-shroom

Awarded by 2-5; its ability works from 2-6. See [Teams and the Hypno-shroom](TEAMS.md) for the full rules.

- A hostile zombie that chews an awake Hypno-shroom comes over to its side at that chew (the plant's `mindControl`, the `mindControlled` event). The plant is gone at once.
- The zombie walks right, at a speed of its kind picked as it stops eating, and is tinted (128, 64, 192) together with the parts it drops (`entityTint`). Chewing other zombies, it uses the soft chomp sound.
- If it was the last zombie against the player, it drops the level award.
- **Differs from the original:** a zombie both mind-controlled and chilled or frozen is drawn halfway to the chill's blue, (102, 70, 224); the original's mind-controlled zombies are never chilled.
- **Differs from the original:** a plant that bites an awake hostile Hypno-shroom (a Chomper) comes over the same way, tinted too, and does not swallow it: its bite goes on as one that missed.
- Particles turn by their spin the original's way (`TodScaleRotateTransformMatrix` on the Y-down screen), so the mind-control rays point out of their ring.

### Scaredy-shroom

- `pvz:scaredyshroom`: 25 sun, 750-tick recharge. Awarded by 2-6. Sleeps by day.
- It shoots spores along the whole row every 136–150 ticks after a 25-tick windup.
- **Fright** (`Plant::UpdateScaredyShroom`): while the body of a hostile zombie that is not dead or dying is within 120 px of its corner plus (0, 20), on its row or the next, it goes down (`anim_scared`, 130 ticks), stays down (`anim_scaredidle`), and comes up once none is near (`anim_grow` at 7–12 fps, 84–143 ticks). It finishes a shot it has begun first.
- It holds its shots the whole time it is down or rising, and shoots a whole cadence after it is up.

### Ice-shroom

- `pvz:iceshroom`: 75 sun, 5000-tick recharge starting at 3500. Awarded by 2-7.
- **Asleep** by day it is eaten as any plant.
- **Awake**, its fuse (`fuse`) burns 100 ticks, during which zombies chew it without harm; then it freezes and is gone. The fuse's `freeze` (`Plant::IceZombies`) plays `FOLEY_FROZEN` and shows `PARTICLE_ICE_TRAP` over everything from its middle: its snowflakes and its IceFlash, a cyan flash over the whole screen (a `fullScreen` emitter; the `plantFroze` event, the plant presentation's `freeze` and `freezeSounds`).
- **Effect on zombies.** Every zombie hostile to it, off the screen too, is chilled for 2000 ticks, frozen for 400–600 (300–400 if it was chilled or frozen already), and takes 20 damage past its shield (`Zombie::HitIceTrap`).
  - A zombie dying or rising from a grave is spared.
  - A zombie its type keeps from the ice is only chilled (`unfreezable`; the Pole Vaulting Zombie's `["airborne"]`, in mid-vault; `Zombie::CanBeFrozen`).
  - A type that is `unchillable` takes neither a Snow Pea's chill nor the ice (`server/combat/cold.ts`).
- **A frozen zombie** (`frozenTicks`, the snapshot's `frozen`) neither moves nor eats; a headless one goes on dying. Its body stands still (`zombiePace` 0) while what it carries goes on. It is drawn blue in a block of ice: `IMAGE_ICETRAP2` behind it and `IMAGE_ICETRAP` over it at (46, 92) (the presentation's `iceTrap`, `IceTrapView`).
- **Thaw.** The ice breaks off with `PARTICLE_ICE_TRAP_RELEASE` at (75, 106) when it runs out, the zombie acting again on that tick, or when the zombie dies in it (the `iceReleased` event). A mowed or burned zombie loses it without the effect.
- The board keeps the side frozen for 300 ticks (`LevelState.iceTrap`, `Board::mIceTrapCounter`, saved and in the snapshot), for what waits on it in the original: the pool's and the sky's zombies, not in yet.
- **Differs from the original:** a zombies' Ice-shroom freezes the plants' side, its plants too (see [Teams and the Hypno-shroom](TEAMS.md)). Of the plants, the Cherry Bomb, the Ice-shroom, the Doom-shroom, the bowling nuts, the Grave Buster and a Potato Mine that is rising are `unfreezable` and only chilled.

### Doom-shroom

- `pvz:doomshroom`: 125 sun, 5000-tick recharge starting at 3500. Awarded by 2-8.
- A night plant whose blast burns zombies to ash; `unfreezable`.
- It idles as any plant (10–15 fps, also off the board). Awake, it goes down with its fuse lit: its animation's `fuse` state plays `explode` at 23 fps as it is planted (`Plant::UpdateDoomShroom`).
- The fuse burns 100 ticks, the three parts of its head shaking by up to 1, 2 and 2 px each tick (`Reanimation::SetShakeOverride`; the plant presentation's `shake`, drawn by `ReanimPlayer.setTrackOffset`).
- It then deals 1800 within 250 px, three rows each way, and leaves a [crater](#craters) in its cell for 18000 ticks (`fuse.crater`).

### Craters

- A crater (`pvz:crater`; `shared/content/craters.ts`, `server/gridItems/craters.ts`) is a grid item. No plant can go in its cell, of either side (`cell-has-crater`, `ADVICE_PLANT_NOT_ON_CRATER`), nor a grave; a zombie seed can.
- It counts its `ticks` down during play, is drawn worn below 9000 and fading over its last 25 (`CraterView`, the day's or the night's picture), and is gone at 0.
- Its `team` only turns its picture round.
- The crater seed's packet draws it as the Beghouled crater button does (0.46 at (4, 17), `SEED_BEGHOULED_BUTTON_CRATER`'s `IMAGE_SEEDS` cel). In the almanac (with `/cheatseed`) the crater card shows the crater on the day ground where it lies relative to a plant in the level (its presentation `cell`).

### Lily Pad

- 25 sun, 750-tick recharge, water only (`placement: "water"`). Awarded by 2-10.
- The installed lawns have no water, so a land cell refuses it with the original's water-only advice. Its almanac entry uses the pool background.

### Bowling nuts

Wall-nut Bowling's rules are in [1-5](#1-5-wall-nut-bowling).

- `pvz:bowling-wallnut` and `pvz:bowling-explodenut` are plants and seeds of their own, configured in the gameplay and presentation JSON. Only the Wall-nut's art is reused; the plain Wall-nut takes no part in bowling.
- Their kind is `bowlingnut` (`BowlingNut` on the server, `BowlingNutView` on the client), whose fields `direction` and `hits` are the way it rolls and the strikes so far.
- Their `bowling` must give the attack rect `attack` (`Plant::GetPlantAttackRect`). `bounceSpeed` (2), `damage` (1800), `helmDamage` (900) and `shieldDamage` (400) take `Plant::UpdateBowling`'s values unless a plant gives its own. `bouncedBreaks` lists the shields a full strike breaks through after a bounce (the plain nut's `["door"]`) and is empty unless given.
- The explosive nut goes off at the first touch and deals no strike of its own.
- The settings are checked by exact keys as the content loads, not when a nut is planted.
- A nut rolls by the `ground` of its body layer's rolling clip (`wallnut_roll`'s `_ground`), with the same `groundStep` zombies walk by (`Reanimation::GetTrackVelocity`).
- Rolling down a row, a nut is drawn with the row above (`BowlingNutView.drawnRow`, `Plant::UpdateBowling`). Its rolling sound when put down (`SOUND_BOWLING` in `Board::MouseDownWithPlant`) is the nut's own `plantedSounds`.
- Flags: `occupiesCell: false` makes a moving plant hold no cell and be nothing to bite; `low: true` makes a low plant that hostile projectiles fly over (see [Teams and the Hypno-shroom](TEAMS.md)); the presentation's `layer: "projectile"` draws a rolling nut on its row's projectile layer (`Plant::CalcRenderOrder` on bowling levels).

## Zombies

### Zombie table

From `mods/pvz-base/gameplay/definitions/zombies.json`. Health is the body's; armor is listed separately. Speeds are `speedPerTick` ranges. "House edge" is the x at which a zombie reaches the house (`boardEdgeX`).

| Zombie | Health | Armor | Speed | Points | Weight | From wave | House edge | Seed cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zombie | 270 | — | 0.23–0.37 | 1 | 4000 | 1 | −100 | 50 |
| Flag Zombie | 270 | — | 0.45 | 1 | 0 | flag waves | −100 | 50 |
| Conehead Zombie | 270 | cone 370 | 0.23–0.37 | 2 | 4000 | 1 | −100 | 75 |
| Pole Vaulting Zombie | 500 | — | runs 0.66–0.68, then 0.23–0.37 | 2 | 2000 | 5 | −150 | 75 |
| Buckethead Zombie | 270 | bucket 1100 | 0.23–0.37 | 4 | 3000 | 1 | −100 | 125 |
| Newspaper Zombie | 270 | newspaper 150 | 0.23–0.37, then 0.89–0.91 | 2 | 1000 | 1 | −100 | 75 |
| Screen Door Zombie | 270 | screen door 1100 | 0.23–0.37 | 4 | 3500 | 5 | −100 | 100 |
| Football Zombie | 270 | football helmet 1400 | 0.66–0.68 | 7 | 2000 | 5 | −175 | 175 |
| Dancing Zombie | 500 | — | 0.45 | 5 | 1000 | 5 | −130 | 350 |
| Backup Dancer | 270 | — | 0.45 | 1 | 0 | called up only | −130 | 100 |

A zombie looks for something to eat on every 4th tick of its age, every 8th while chilled (`bite.cadenceTicks`, `Zombie::CheckIfPreyCaught`):

- It looks only with its head on. A zombie without one goes on eating or walking as it was.
- It looks for an enemy zombie first, then a plant. Its attack rect reaches from where it stood as the tick began, in whole pixels (`Zombie::mX`), and takes the first plant put down that it overlaps by 20.
- Finding one, it starts eating in that tick and bites it at once, for 4 (`bite.damage`). An awake Hypno-shroom is bitten without harm.
- Finding nothing while it eats, it stops and walks on from the next tick. Between the ticks it looks on, it goes on as it was.
- At each chew of its eat clip it looks again for the plant it chews, which flashes (`Zombie::AnimateChewSound`).

### Armor

- Zombies have the original's two armor slots: the **helm** (`mHelmType`: cone 370, bucket 1100, football helmet 1400) and the **shield** (`mShieldType`: newspaper 150, screen door 1100), each written `{type, health}`. A zombie may wear both.
- Damage follows `Zombie::TakeDamage`: the shield first, then the helm, then the body.
- A chilling hit that the shield absorbs, even one that exactly breaks it, does not chill the zombie. A shield counts 0.2 towards a wave's health. The Fume-shroom's fumes pass it to hit the body as well.
- A helm or a shield that runs out sends `zombieHelmDropped` or `zombieShieldDropped`. A mowed zombie drops whatever it wears first (`Zombie::MowDown`).

### Animation, chill and burning

- The gameplay `animation` gives each clip's frames, the walk's ground track and the frames that mark bites and the fall; `from` takes another zombie's clips. `vault` describes the Pole Vaulting Zombie's run, jump and landing.
- A projectile's `chillTicks` halves a zombie's animation, walk and bites, as the original's `ApplyAnimRate` does.
- Burning blasts (`burn: true`: the Cherry Bomb, the Explode-o-nut and its bowling version, the Doom-shroom) char a zombie whose body has less health than the blast into `pvz:zombie_charred`; a tougher one only takes the damage. A headless zombie turns black and stands for 300 ticks instead, without its shadow, as charred remains have none; the original's `Zombie::HasShadow` keeps it (see the README's [Bug Fixes](../README.md#bug-fixes)).
- A zombie a lawn mower runs over is drawn into it by `pvz:lawnmowered_zombie`'s `locator` track, at its size, and its shadow stays where it stood (`Zombie::HasShadow`). Its body sets off from where it was drawn. The original's `Zombie::UpdateReanim` loses the body's own offset as it is mowed, so its zombie first jumps 14 px left, a dancer about 20 (see the README's [Bug Fixes](../README.md#bug-fixes)).
- New combat animations are registered in the `exports` of `tools/pvz/anim-defs.json`. `npm run build:content -- --pak /path/to/main.pak` converts them into `mods/pvz-base/assets/` and repacks the built-in ZIP, leaving the authored gameplay and presentation tables as they are.

### Walking on after eating

Every zombie that stops eating sets off as `StartWalkAnim` does (`Zombie.walkAgain`; also after its vault and out of the Newspaper Zombie's gasp):

- its speed is picked again (`PickRandomSpeed`, `Zombie.pickSpeed`, which also gives it its first);
- then its walk clip (`Rand(2)`, `walk2Chance`). The Flag Zombie's variant is fixed at 0, so it always takes `anim_walk2`.

This is why the original's `mVelX = 0.17` for a mind-controlled zombie never shows: the zombie picks its speed again as it stops eating the Hypno-shroom.

### Newspaper Zombie

- Introduced in 2-1, on waves 6 and 10.
- Its newspaper (a shield) absorbs 150 damage. When it is gone, the zombie gasps for 163 ticks on its 8 fps clip, standing, then walks on enraged at 0.89–0.91 on its own walk. Chill also slows the gasp.
- It roars only with its head on and at most ten zombies of the zombies' side with their heads, not dying, on the lawn (`Board::CountZombiesOnScreen`).

### Screen Door Zombie

- `pvz:screendoor`. Introduced in 2-3, on waves 6 and 10; costs 4 points at weight 3500 from wave 5.
- Its 1100-health door is a shield: `Board::TotalZombiesHealthInWave` counts it at 0.2f; it falls without the newspaper's rip when the zombie dies (`DropShield(1U)`); and a mowed zombie drops it first (`Zombie::MowDown`).

### Football Zombie

- `pvz:football`. Introduced in 2-6, on waves 6 and 10; costs 7 points at weight 2000 from wave 5; reaches the house at x = −175.
- 270 health under a 1400-health `football` helm. Its hair is hidden until the helm drops; the helm is dented below 2/3 and 1/3, makes the plastic hit sound and drops as `PARTICLE_ZOMBIE_HELMET`. A bowled nut striking it makes no sound.
- It runs at 0.66–0.68 on its own walk, eats at 36 fps, and falls at a fixed 24 fps (down at 0.52 of the clip).
- It drops its own head and hand (`IMAGE_ZOMBIEFOOTBALLHEAD`, from `zombie_football_leftarm_hand`).
- It is drawn 16 px higher (`GetDrawPos`), its shadow 41 px ahead (11 behind when it walks right), and its walk kicks up `PARTICLE_DUST_FOOT` under its feet at 0.03 and 0.61 of the clip, just below it (`Zombie::UpdateZombieWalking`; the zombie presentation's `steps`).
- Its hidden zombie seed costs 175.

### Dancing Zombie and Backup Dancer

The dancers are the zombies with a `dance`, of the `dancer` kind (`Dancer`, `server/zombies/Dancer.ts`). The Dancing Zombie (`pvz:dancer`) leads (`dance.lead`); the Backup Dancers (`pvz:backup_dancer`) it calls up form its troupe.

**Size.** Their art is a quarter larger than the other zombies', and the original draws both at 0.8 (`Zombie::mScaleZombie`) about the point (30, 120) of their Reanim. The base has that 0.8 in its converted art instead (`tools/pvz/oversized.py`): their images are shrunk to 0.8, and their Reanims' frames, ground tracks with them, are moved and scaled to match, so they are drawn at 1 where the original draws them. Turned round, they are drawn 6 px further left than other zombies (their presentation's `turnedOffsetX`), as the original's 0.8 puts them. Their shadows are as large as the other zombies', where the original puts them, and a lawn mower draws them in as it does other zombies, up to 6 px from the original's path at 0.8. The Dancing Zombie is drawn above the other zombies of its row (its presentation's `renderOffset` 4), so its head shows over its Backup Dancers'.

**Entrance.**

- The leader enters moonwalking for 300–311 ticks (its `moonwalk` clip, at its own 24 fps, moving by its ground track counted the way it goes, the body drawn facing backwards).
- The original's starting speed has no effect: `ZombieInitialize`'s `mVelX = 0.5` goes nowhere, because the moonwalk's `_ground` runs backwards and `UpdateAnimSpeed` sets no rate for a clip whose ground distance is below 1e-6. So:
  - a chill does not slow the moonwalk; the leader is only tinted (`Dancer.chillSlows`);
  - a leader frozen in its moonwalk keeps the rate of 0 `HitIceTrap` gave it, and once thawed stands still until its moonwalk time is through (`RemoveIceTrap`'s `UpdateAnimSpeed`; `Dancer.count`); the moonwalk's time does not run while it is frozen.
- A plant in its way ends the moonwalk without being bitten (`Zombie::EatPlant`).
- A leader that stops eating during its moonwalk (an enemy zombie in its way) walks on its walk clip until its moonwalk time is through, facing the way it goes. The original draws it turned round all that while, and for one frame even when that time is already up, since it stops eating after its dance has been updated (`Zombie::UpdatePlaying`; see the README's [Bug Fixes](../README.md#bug-fixes)).
- It then snaps its fingers (`point`), its speed picked as it does, and as the snap ends calls up its `backup` into each place of its `troupe`: a row above and a row below, and 100 px behind and ahead in its own row (turned round on the plants' side). No dancer is called up into a row zombies do not walk.
- Each Backup Dancer comes up out of the ground over 150 ticks, standing still and untouchable as a grave's zombie is (`riseTicks`), with `PARTICLE_DANCER_RISE` and the rumble (`dancerCalledUp`, the backup's `dance.rise` presentation).
- The leader holds the pose for 200 ticks.

**Music.** The first snap starts the disco music when at most 15 zombies are about (`dancerSnapped`, `FOLEY_DANCER`). It stops once no dancer with its head is dancing, by the client's `frame` handler. It pauses with the game and stops as the level ends (`FOLEYFLAGS_MUTE_ON_PAUSE`: `pauseWithGame`, `pauseGameSounds`, `stopGameSounds`).

**The beat.** After the hold, every dancer on the lawn goes by one shared beat (`DANCE_BEAT`, `Zombie::GetDancerFrame`): a cycle of 23 beats of 20 ticks each.

| Beats | What the dancers do |
| --- | --- |
| 1–12 | Walk, at the rate their speed gives |
| 13 | Raise the arm, from 0.6 of the `raise` clip |
| 14–19 | Stand with the arm up |
| 20–23 | Raise it again from the start of the clip, standing |

- **Differs from the original:** the beat is counted in the level's ticks. The original counts the app's updates (`mAppCounter`), which go on while the game is paused, so pausing could steer the dance; here the beat keeps to the level and its saves.
- From beat to beat a dancer's body blends over 0.1 s (`PlayZombieReanim`'s 10 ticks), and into its other clips over 0.2 s as any zombie's does (`DancerView.bodyBlend`).

**The troupe moves together.** It stands still while any of it eats or is frozen, and goes at a chilled one's pace, the others untinted, while any of it is chilled (`Zombie::ZombieNotWalking`, `IsMovingAtChilledSpeed`).

**Calling up again.** A leader with its head that is missing some of its troupe waits 100 ticks, then calls them up again on the beat its arm goes up, if it is left of x = 700 (`resummon`, without the music; on the plants' side, as far from the right edge).

**Sides.**

- The dancers a leader calls up are on its side and mind-controlled as it is. They count against no wave (`Board::TotalZombiesHealthInWave` leaves out one with a leader).
- A mind-controlled leader empties its troupe's places and calls up its own. Those it let go keep it as their leader (`mRelatedZombieID`, which `StartMindControlled` leaves them), so they still stand and go slowed with it and its new troupe.
- A Backup Dancer that is mind-controlled leaves its troupe.
- A mind-controlled Dancing Zombie, not a Backup Dancer, earns Disco is Undead (`pvz:mind-controlled`; see [Achievements](ACHIEVEMENTS.md)).

**After eating.** A dancer that stops eating walks on with its walk clip whatever phase of the dance it is on (`Zombie::StopEating`'s `StartWalkAnim`), until the beat brings the next phase (`UpdateZombieDancer` plays a phase's clip only as its phase changes). On a beat it stands on, it walks in place at its raised arm's 18 fps (`UpdateAnimSpeed`'s `mOriginalAnimRate`).

**Spotlight.** Its snapshot's `own` carries its phase and age (`Dancer.snapshotOwn`, read by `DancerView`).

- A leader past its first snap stands in its spotlight (`DancePresentation.spotlight`: `IMAGE_SPOTLIGHT2` under it and `IMAGE_SPOTLIGHT` over it at 4×), in one of five colours that change every 100 ticks once it is 700 ticks old.
- Mowed, or burned where it stands without its head, it shines on whatever phase it was in (`DrawDancerReanim` leaves out only the moonwalk, the first snap, falling, and the zombies' win).
- **Differs from the original:** on the plants' side the spotlight turns round with the body, so the dancer stands in the middle of it; the original draws it unturned.
- Mowed or falling during its moonwalk, a dancer is drawn the way its side faces.

**Into the house.**

- **Differs from the original:** a dancer that reaches the house walks in on its walk, whatever phase it was in (`Dancer.intoHouse`). One called up past the edge may reach it standing with its arm up, where the original's would stand at the door. Its body changes to the walk at once, as every winner's does, a Pole Vaulting Zombie that arrives holding its pole too (`Zombie::WalkIntoHouse`'s `StartWalkAnim(0)`); the original's dancer keeps its clip.
- A blend a winner was in when the zombies won (one that had just stopped eating) goes on by the game over's ticks while the lawn stands still (`ZombieView.syncGameOverWalk`, `ReanimPlayer.advanceBlend`). A Pole Vaulting Zombie's landing changes at once too.

**Drops.** A dancer's head falls just under it (`drops.head.behind`), as its own image, and what falls off it is at its size. The Backup Dancer's head falls at the size it was on its body, where the original's `Zombie::DropHead` puts its effect at 1.05 instead of the zombie's 0.8 (in 1073 and 1096), so that it falls a little larger than the body's head, of the same picture (see the README's [Bug Fixes](../README.md#bug-fixes)).

**Pictures in packets and the almanac.**

- The dancers' Reanims are made at 24 fps (their Reanims' own `fps`).
- Their cached picture, used for a packet and the almanac's small window, is the Reanim's first frame (`ReanimatorCache::MakeCachedZombieFrame` asks for `anim_idle`, which their Reanim lacks): a moonwalk frame for the Dancing Zombie and a walk frame for the Backup Dancer (`packet.clip`, `portrait.clip`).
- In a packet and in hand they are drawn at the Reanim's own size, since the cache draws no zombie and so no `mScaleZombie` (`ZombieDraw.ownSize`); in the almanac's window, at the zombie's.
- The original's Dancing Zombie packet is its 0.375 at (−19, −40) combined with `Plant::DrawSeedType`'s 0.8 and (20, 42). With that 0.8 in the base's art, the packet is 0.375 at (−4.25, −10), and in hand it is (6, 10) further off (the presentation's `held`), drawn as the original draws it. The original has no Backup Dancer seed: its packet and the zombie in hand are drawn as the other zombies' are, its packet at 0.35 at (−5, −8), its feet and middle where theirs are.
- **Differs from the original:** in their small almanac windows the dancers are drawn at their lawn size, where the original draws its cached frame of them unscaled, a quarter larger, the Dancing Zombie 15 px and the Backup Dancer 20 px lower and 4 px left. They stand where v0.1.1's cached pictures put them (0.8 about the cache's middle, 16 px lower in it, the Backup Dancer a further (−8, 5)), a place with no counterpart in the original: `portrait` (24, 14.9) and (16, 19.9).

## Coins

Coins follow `Board::DropLootPiece`.

- **Roll.** Each zombie rolls 0–29999 once, when it loses its head or is mowed, burned or instantly killed. The chances scale with its value (`zombieValue`: its `zombiePool` points, otherwise the zombie's own `wave.points`, so a zombie the level does not pick drops by its value too; every zombie has a `wave`). For a zombie of value *v*:

| Roll below | Drop | Worth | Plain Zombie's chance |
| --- | --- | --- | --- |
| 14 × *v* | Diamond (gold coin until the first seed-slot upgrade) | 100 coins, shown as $1000 | about 0.05 % |
| 250 × *v* | Gold coin | 5 coins, shown as $50 | about 0.8 % |
| 2500 × *v* | Silver coin | 1 coin, shown as $10 | 7.5 % |

- **When coins drop.** Nothing drops once the award has. During the first adventure, coins drop from level 11 (2-1) on; after the adventure is finished, on every level (`Board::CanDropLoot`). Wall-nut Bowling drops none. No level setting is involved.
- **2-1's first-adventure rules.** Its script adds `loot.firstCoinAfterWave`, which guarantees a first coin with a pickup arrow after wave 5, and `loot.savingsCap` (75 coins, the first slot's price), which stops any drop that would bring the coins, counting the ones in flight and a gold coin for each lawn mower still on the lawn, to the upgrade price.
- **Collecting.** Coins are `kind: "money"` items that spin once landed and fly to the bottom-left coin bank. The bank shows for 1000 ticks and fades over its last 15; it also shows when the game is paused (not by the debug console's pause) and stands beside Crazy Dave while he is out.
- **Lawn mowers.** From 200 ticks after the award, each unused lawn mower turns into a gold coin every 40 ticks, from the bottom row up, with a rising note.
- **The purse.** The profile owns it: starting and restoring a level take the coins and seed-slot upgrades from it, and every change in the level (including `/money`) is written back at once.
- The `items` presentation table supplies the items' visuals, animations and sounds.

## Almanac

- **Shared look.** Installed plants and zombies share their almanac animation, body coordinates, scale and shadow with the level presentation definitions. The chooser's preview zombies also use their idle clip's coordinates directly.
- **Plant page.** It is the chooser's grid (`AlmanacDialog::GetSeedPosition`): a plant's place is its seed's `position`, its name its presentation's `visual.nameKey`. A plant's cost and recharge are its seed definition's `sunCost` and `cooldownTicks`, as the original's almanac reads `gPlantDefs`.
- **Zombie page.** Its windows are the gameplay `almanac` table, by zombie ID: `{place, startingLevel, spawnedOnly?, afterAdventure?}`; a zombie's name is its presentation's `nameKey`.
- **Grounds.** The presentation's `almanac` table gives the ground each plant or zombie stands on (`ground`: `day`, `night`, `pool`, `nightpool`, `roof` or `ice`; the day's without an entry) and an upgrade plant's packet (`upgrade`).
- **Data.** Like the store's, the tables are read with the rest of the gameplay definitions, Mods' included, and the app builds the backend's catalogs from them; `server/menu/almanacCatalog` only applies the unlock rules.
- **What the player sees.** The almanac follows the current profile:
  - It lists only the installed plants whose seeds the player owns (the profile's `seeds` plus `seedBank.startingSeeds`, as for the chooser), and leaves the others undrawn.
  - A zombie shows from its `gZombieDefs` `mStartingLevel` (`ZombieIsShown`; the Backup Dancer, the Zombie Bobsled Team and the Imp only after that level); otherwise its window is blank and cannot be clicked. It is described only after that level (`ZombieHasDescription`); before then the description box centres `NOT_ENCOUNTERED_YET`.
  - A finished adventure shows every zombie.
  - With `/cheatseed` it shows and describes everything, and adds pages for the other seed groups: a card shows what its seed puts down where a plant stands, a zombie 30 px left of and above the cell (10 px lower here), a grave or crater at its presentation `cell`.
- **Not yet implemented.** The original also describes a zombie defeated since the player was selected (`gZombieDefeated`), and draws the Zombie Yeti as a silhouette before it can spawn; here the Yeti stays hidden until then.

## Differences from the original

Each is described in its section above. The README's [Bug Fixes](../README.md#bug-fixes) lists the original's problems the project fixes.

- Teams: a zombies' side exists for plants too; its producers drain sun, its Ice-shroom freezes plants, and the Whack a Zombie mallet hits its plants. Zombie, grave and crater seeds and `/repick` are additions.
- A Chomper that bites an awake Hypno-shroom of the other side is mind-controlled instead of swallowing it.
- A zombie both mind-controlled and chilled is drawn in a tint between purple and blue.
- The Grave Buster drops loot only when it ate a grave and is on the plants' side.
- With no zombie to drop it, the level award comes down in the middle of the lawn.
- Whack a Zombie drops its award when its final group cannot rise and the lawn is empty, so the level always ends.
- The dance beat follows the level's ticks, not the app's updates, so pausing cannot steer it.
- A dancer that reaches the house switches to its walk; on the plants' side its spotlight turns round with it.
- The dancers' almanac windows are drawn at their lawn size.
