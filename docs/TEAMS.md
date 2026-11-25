[简体中文](TEAMS.zh-CN.md)

# Teams and the Hypno-shroom

Every plant and zombie belongs to the plants' side or the zombies' side, different sides are hostile to each other, and the Hypno-shroom moves the zombie that bites it to its own side. By default plants are on the plants' side and zombies on the zombies' side, which plays exactly as the original.

## Teams

### What teams are

- There are two sides: the **plants' side**, which is the player's, and the **zombies' side**.
- Every plant and zombie belongs to one of them. Projectiles and blasts belong to the side of whatever launched them, and graves and craters have a side too.
- Things on different sides are hostile and attack each other; things on the same side never harm each other.
- Plants start on the plants' side and zombies on the zombies' side. Hypno-shrooms, debug commands, seed packets with a side and level data can put them on the other side (see [Seed packets and setting a side](#seed-packets-and-setting-a-side)).

### Facing and movement

- The zombies' side faces left, toward the house, and the plants' side faces right. A plant on the zombies' side faces left, and its attack range, blast, projectiles and bowling direction are mirrored with it.
- Zombies walk the way they face. A zombie on the zombies' side that gets into the house loses the level, as in the original. A zombie on the plants' side walks right and disappears silently once it is past the right edge of the lawn, dropping nothing.
- A Pole Vaulting Zombie on the plants' side vaults right over a hostile plant.

### Data model

- Two fixed teams, `plants` and `zombies` (`Team`, `TEAMS` in `shared/protocol`). The player is `plants`.
- Plant and zombie components carry `team`, by default `plants` and `zombies` respectively (`plantTeam`, `zombieTeam`). The field is written only when it differs from the default; it is saved and sent to the client in snapshots.
- Projectiles and blasts carry the team of whoever launched them (`projectileTeam`, `plants` by default).
- Graves are on the `zombies` team unless placed on the `plants` team (`graveTeam`); craters are on the `plants` team unless marked `zombies`.
- There is only one hostility rule: different teams are hostile (`isHostile`), and every check calls it, with no branches for mind control. Counting checks use `isEnemyZombie`, a zombie of the `zombies` team.
- The team decides facing (`teamDirection`): the `zombies` team faces left, the `plants` team right. Zombies walk the way they face: a `zombies` zombie that gets into the house loses the level, and a `plants` one past `x = 850` disappears silently. Zombies' body and attack rects are mirrored across `Zombie::mWidth = 120` (`zombieFacingRect`). Plants' attack ranges, blast centers, projectile directions and bowling directions are mirrored by facing across `Plant::mWidth = 80` (`plantFacingRect`, `plantFacingX`).

All of this lives in `shared/content/teams.ts`, shared by the client and the server.

## How the sides interact

| Situation | Rule |
| --- | --- |
| Plant attacks | They act only on hostile zombies and plants, never on their own side. |
| Projectiles hitting plants | A projectile takes the plant's health straight off, but projectiles fly over low plants. |
| Chomper | Swallows a hostile plant whole. |
| Potato Mine | Its checks against hostile plants reach half a cell further forward. |
| Bowling nuts | A rolling nut that hits a hostile plant damages it; two hostile rolling nuts that meet strike each other. |
| Zombie bites | Zombies bite hostile zombies and plants, never their own side's plants. |
| Sun producers | A Sunflower or Sun-shroom on the zombies' side makes no sun and takes the player's sun instead. |
| Chill | Snow Pea peas chill only the hostile side, plants included. |
| Freeze | An Ice-shroom freezes every hostile zombie and plant on the board, off the screen too. |
| Lawn mowers | They belong to the plants' side; a running mower crushes zombies and plants of the zombies' side. |
| Shovel | Digs up only the plants' side's plants. |
| Graves | Zombies rise from a grave on the grave's side. |
| Craters | A crater's side only decides which way it is drawn. |
| Backup dancers | Backup dancers called up by a Dancing Zombie take its side. |
| Waves and winning | Only zombies of the zombies' side count for the waves, the level-complete check and the level award. |
| `/plantinvincible` | Keeps plants from all damage, hostile attacks and mowers included, but not from chill and freeze. |

### Plant targets, projectiles and blasts

- Plants' target searches (shooters, the Fume-shroom's area attack, the Chomper, the Potato Mine, bowling), projectile hits and blasts act on zombies and plants of a hostile team and never touch their own. With the default teams, plants only ever meet hostile zombies, as in the original, whose plant attacks pass over mind-controlled zombies (`EffectedByDamage`).
- Hitting hostile plants is an extension (the original has no plants on the zombies' side). Its rules follow the original's zombie peas (`Projectile::DoImpact`): a hit takes the plant's health straight off and flashes it white for 25 ticks, whatever state the plant is in; at zero health the plant is handled as eaten (`destroyEatenPlant`; an Explode-o-nut still explodes). The event is `plantHit`; `projectileImpact` and `bowlingImpact` carry `target: 'plant'` when they hit a plant.
- A projectile hits a plant it overlaps by more than 8 (`FindCollisionTargetPlant`), the plant's body being `Plant::GetPlantRect`; of plants stacked on one cell it hits the one in the highest slot that it can hit (`Board::GetTopPlantAt`). Projectiles fly over the low plants marked `low: true` in their plant definitions (the Puff-shroom, the Sun-shroom, the Potato Mine and the others the original's zombie peas skip), and shooters that fire projectiles do not target them either, while area attacks still hit them.
- The Potato Mine's checks against hostile plants reach half a cell further forward (`targeting.plantReach: 40`): its trigger range and its blast's check against plants both move 40 forward, so a hostile plant in the next cell sets it off and is blown up. A risen Potato Mine sets itself off when a hostile plant is within half a cell in front of it. Its checks against zombies and the position of the blast effect are unchanged.
- The Chomper swallows a hostile plant whole. Its own state records `prey: 'plant'` (saved, sent in its snapshot's own data and cleared when it is ready again), and while it chews and swallows, the client hides the two tracks of the zombie's arm in its animation (the presentation definition's `parts.prey`). A plant zombies cannot bite (a lit Cherry Bomb, a Potato Mine rising or risen) the Chomper cannot bite either, and it misses. `chomperBit` carries `plantId` when it swallows a plant.
- Blasts take hostile plants' health by their damage; `kills` counts only zombies.
- A bowled nut hitting a plant does not count toward `hits`. When two hostile rolling nuts collide, both are resolved at once: each takes the other's impact damage and bounces off, an Explode-o-nut goes off, and the result does not depend on which is resolved first.
- `/plantinvincible` blocks this damage too.

### Zombie bites and movement

- A zombie first looks for a hostile zombie in front (by the same rules as `FindZombieTarget`), then for a hostile plant; zombies do not bite their own team's plants.
- Zombies bite zombies through shields, with no white flash (events `zombieChewedZombie` and `zombieAteZombie`).
- Zombie movement and attack ranges are mirrored by their team's direction. A pole vaulter of the `plants` team vaults right over a hostile plant, and one put down from a seed in a plant's cell does not vault back over it.

### Waves, level completion and the level award

Only zombies of the `zombies` team are counted.

### Sun producers

An extension: a producer of the `zombies` team (`server/plants/Producer.ts`; the Sunflower, and the Sun-shroom, whose kind extends it) spawns nothing. Each time it would produce, it takes its item's sun value from the player's bank, down to 0, and emits `sunDrained` (`entityId`, `sun`); a producer of money gives nothing. The client plays the buzzer, flashes the sun counter red for 70 ticks and lights the producer as when it produces.

### Chill and freeze

- **Chill** acts only on a hostile team and follows the attack: a Snow Pea's pea only hits hostile targets. The original's `CanBeChilled` hard-codes that mind-controlled zombies cannot be chilled only because only plants chill in the original. That rule is dropped here, so an enemy Snow Pea's peas can slow zombies of the `plants` team.
- A zombie or plant that is both mind-controlled and chilled or frozen (which never happens in the original, where mind-controlled zombies cannot be frozen) takes the average of the two colors, (102, 70, 224), so that both states show (`entityTint` in `client/view/tints.ts`), and so do the parts it drops.
- **Chilled plants** (an extension; the original's plants are never chilled): a hostile Snow Pea's pea that hits a plant chills it for as long as it would chill a zombie, keeping the longer of the two. Meanwhile the plant skips one tick in two (`plantSkipsTick`), so shooting, charging, producing sun, ability timers (fuses, the Potato Mine arming, the Chomper digesting and so on), the blink countdown and bowling all run at half speed. Its animation, like a chilled zombie's body, is advanced by the server every tick at half rate (`plantPace`, `CHILLED_ANIMATION_FACTOR`); the snapshot carries the halved rate and the client plays it as sent. It plays the chill sound as it is first chilled (`FOLEY_FROZEN`, as `Zombie::ApplyChill` does). The client turns it blue down the same path as a chilled zombie (`ReanimPlayer.setTint`, `plants/chill.ts`, the `plantChilled` event, the save field `chilledTicks`). `/plantinvincible` blocks only damage, not the chill.
- **Who can be chilled or frozen** depends on the type (`server/combat/cold.ts`, one set of rules for plants and zombies):
  - `unchillable` in a definition means it is not slowed, and so not frozen either, and a Snow Pea's slowing does nothing to it (the Torchwood; the original's Zomboni, the bobsled team pulling its sled, and so on);
  - `unfreezable` means it is not frozen, only slowed, and does not take the freeze's 20 damage either (the original's `HitIceTrap` slows first and returns when `CanBeFrozen` is false);
  - a plant's definition writes either only as `true`, at all times; where a plant is kept from the cold or the ice only at times, its kind decides (`Plant.keptFromCold`, `Plant.keptFromIce`: a Potato Mine rising);
  - a zombie's definition writes `true` or a list of zombie states (`[states…]`), and the zombie is kept from it only in those states;
  - in the base game the `unfreezable` ones are the Cherry Bomb, the Ice-shroom, the Doom-shroom, both bowling nuts, the Grave Buster, a Potato Mine rising (`rising`) and a pole vaulter in the air (`airborne`). The Squash, the Blover and the Jalapeno, once they have locked on, get the same when they are implemented, and the Torchwood gets `unchillable`;
  - zombies that are dying, charred, squashed or rising from a grave, and plants already destroyed, are never slowed or frozen, whatever their type.
- **The Ice-shroom** freezes every zombie and every plant hostile to it (`freezeHostiles` in `server/combat/freeze.ts`). The original's freeze spares mind-controlled zombies (`CanBeChilled`), which are exactly the only zombies on its side in the original; what it spares here is its own side. A `zombies`-team Ice-shroom freezes the zombies of the `plants` team, and the `plants` team's plants too (an extension; the original freezes no plants):
  - plants, like zombies, are slowed for 2000 ticks, frozen for 400–600 ticks (300–400 if already slowed or frozen) and take 20 damage (`damagePlant`, with a flash);
  - while frozen they skip every tick (`plantSkipsTick`), so shooting, producing sun, ability timers and blinking all pause; the animation stands still (`plantPace` is 0), the particles on the plant stay where they are (the Grave Buster's chewing, `ParticlePlayer.setPaused`), and a Cherry Bomb stops shaking; the plant can still be eaten and hit;
  - the ice is drawn by the plant's default position, in the middle of the cell, its top edge level with the top edge of the plant's shadow (the presentation's `iceTrap.plant`, (13, 51)), just as a zombie's ice lines its top edge up with the zombie's shadow at 92; plants stand higher than the zombies of the same row, their shadow at 51. The ice shard particles come out at (40, 65), mirrored left and right along with the plant;
  - if the plant is destroyed while frozen (`destroyEatenPlant`), the ice shatters; if a lawn mower crushes it, the ice is simply removed;
  - the board records 300 ticks for the frozen side (`LevelState.iceTrap`);
  - save fields: `frozenTicks` (plants and zombies), `level.iceTrap`.

### Lawn mowers

A row's mower is on the `plants` team. Only a zombie of the `zombies` team that still has its head sets it off (`server/mowers/mowers.ts`). A running mower (`MowingProjectile`) does not crush zombies of the `plants` team (the original's `EffectedByDamage(127)`, the same as plant attacks). It crushes hostile plants too: the plant is out of play at once (`mowered`) and is squashed as a mowed zombie is, tipped the way the mower runs, with `plantMowered`; an Explode-o-nut does not go off, and `/plantinvincible` keeps plants from it.

### The shovel

The shovel can dig up only plants of the `plants` team (`canShovel` in `shared/content/planting.ts`); plants of the `zombies` team are not highlighted and cannot be dug up, as the Grave Buster cannot be dug up.

### Graves, craters and backup dancers

- A grave raises its zombies on its own team (`raiseZombieFromGrave`). A grave-placed plant (the Grave Buster) needs a grave of a hostile team to eat; a grave of its own team refuses it (`cell-has-own-grave`). Only a Grave Buster of the `plants` team drops the grave's loot.
- A crater's team only decides which way it is drawn (`CraterView`). No side's plants can be planted on a crater (`Board::CanPlantAt`). The crater card belongs to the plants by default, and a crater a Doom-shroom leaves belongs to that Doom-shroom's side.
- The backup dancers a Dancing Zombie calls up take on its team and its mind-control flag (the original copies only the mind-control flag), and their places flip left and right with its facing. A mind-controlled Dancing Zombie lets its old backup dancers go and from then on calls up its own side's, and a mind-controlled backup dancer leaves its old Dancing Zombie (`Zombie.changedSides`, `server/zombies/Dancer.ts`).

## The Hypno-shroom

- When a hostile zombie chews an awake Hypno-shroom, the Hypno-shroom vanishes at that bite and the zombie joins its side at once. The bite does no damage. The zombie turns purple, with the original's sounds and particles.
- A Hypno-shroom asleep in the day does nothing and is eaten like any other plant.
- A hostile Chomper that bites an awake Hypno-shroom comes over to its side the same way and turns purple; it does not swallow it, and its bite counts as a miss. Plants never eat plants in the original, so this is an addition. A Chomper that bites a sleeping Hypno-shroom simply eats it.
- A mind-controlled zombie walks at the ordinary speed of its kind.
- If the zombie that comes over was the last hostile zombie on the lawn, the level award drops from it at once.
- Mind-controlled zombies bite hostile zombies with a soft chewing sound, and a gulp plays when the other falls.
- A mind-controlled Dancing Zombie lets its old backup dancers go and from then on calls up dancers of its new side; a mind-controlled backup dancer leaves its Dancing Zombie. Mind-controlling a Dancing Zombie earns Disco is Undead (see [Achievements](ACHIEVEMENTS.md)).
- Only units controlled by a Hypno-shroom are purple. Units placed on the other side by other means keep their colors and only face the other way.

### The original's behaviour

The original marks a zombie fighting for the player with a single "mind-controlled" flag on the zombie, `mMindControlled`, checked separately in more than twenty functions. This behaviour is the same in 1073 and 1096, except that 1096 adds the Disco is Undead achievement (see [Achievements](ACHIEVEMENTS.md)).

#### The Hypno-shroom bitten (`Zombie::AnimateChewSound`)

When a zombie bites (on the sound frame of its chewing animation) and what it bites is an awake Hypno-shroom (`!mIsAsleep`; asleep in the day it does nothing):

1. It plays `FOLEY_FLOOP`, and the Hypno-shroom dies (`Plant::Die`).
2. `StartMindControlled` plays `SOUND_MINDCONTROLLED` and sets `mMindControlled = true`. A Dancing Zombie empties its backup dancers and a backup dancer leaves its Dancing Zombie, while other zombies let go of their related zombie (the bobsled team and so on).
3. It puts `PARTICLE_MIND_CONTROL` one layer above the zombie (`mRenderOrder + 1`), at `(mPosX + 60, mPosY + 40)`.
4. `TrySpawnLevelAward`: if it is the last hostile zombie on the lawn, the award drops from it.
5. It sets the speed `mVelX = 0.17` and the animation `mAnimTicksPerFrame = 18`. But the zombie is eating at that moment, and the next time it finds nothing to eat, `StopEating` → `StartWalkAnim` → `PickRandomSpeed` picks a random speed for its zombie type again, as every zombie does when it stops eating and walks on. The 0.17 therefore has no effect in practice, and the mind-controlled zombie walks right at the ordinary speed of its kind.

A mind-controlled zombie biting a zombie uses `FOLEY_CHOMP_SOFT`.

#### Once mind-controlled

| The original's function | Behaviour |
| --- | --- |
| `IsWalkingBackwards` | Walks right (`mPosX += speed`), drawn mirrored |
| `GetZombieAttackRect` | The attack range is mirrored to the right: `x = mWidth − x − width` |
| `UpdateEating` | Each bite first looks for a hostile zombie (`FindZombieTarget`) and bites it if there is one; a mind-controlled zombie does not bite plants |
| `FindZombieTarget` | In the same row, on a different team, not dead, not in the air or underground, overlapping the attack range by ≥ 20 (≥ 0 when the other is eating) |
| `EatZombie` | The other takes `TakeDamage(DAMAGE_PER_EAT, 9)` and it starts eating; when the other's body health reaches zero it plays `SOUND_GULP` |
| `EffectedByDamage` | Plant damage (projectiles, blasts, bites) does not hit mind-controlled zombies; only attacks with `DAMAGES_ONLY_MINDCONTROLLED` do (none in the base game yet) |
| `CanBeChilled` | Cannot be chilled (the remake makes the chill follow hostile attacks instead; see [Chill and freeze](#chill-and-freeze)) |
| `CheckForBoardEdge` | Disappears silently once it walks right past `x = 850` (`DieNoLoot`) |
| `DrawReanim`, `DrawZombiePart` | The color `(128, 64, 192)` multiplied, then the same color added on top (`ZOMBIE_MINDCONTROLLED_COLOR`) |
| `OverrideParticleColor` | The head, arm and other particles that fall off are tinted and overlaid the same way |
| `AreEnemyZombiesOnScreen`, `CountZombiesOnScreen`, `TotalZombiesHealthInWave` | Not counted: no effect on the level-complete check or on the waves' health threshold |
| Lawn mower | Does not crush mind-controlled zombies (`EffectedByDamage(127)`) |

The other branches concern only special zombies or plants (the Gargantuar, the Yeti, the ladder, the Squash and Jalapeno zombies, the Magnet-shroom and so on). They will be wired to teams once the content they concern is implemented.

### Mind control

- The Hypno-shroom is a plant kind, `hypnoshroom` (`server/plants/HypnoShroom.ts`), chosen by the plant definition's `kind` and taking its `mindControl: true`; it is not decided by the plant's ID. `Plant.mindControls(world)` says whether a plant mind-controls now: the Hypno-shroom does while awake.
- When a hostile zombie bites it while it is awake (on the sound frame of the chewing animation, `Zombie::AnimateChewSound`), that bite does not count as a bite, the plant vanishes at once (its health cleared, so no other zombie bites it in the same tick), and the zombie that bit it changes to the plant's team.
- An extension (the original's plants do not eat plants): when a plant bites an awake hostile Hypno-shroom (the Chomper, where it swallows plants in `server/plants/Chomper.ts`), the plant that bit it likewise changes to the Hypno-shroom's team. That bite does not count as swallowing: it is drawn as a miss (`missed`), goes back to `ready` afterwards, and neither chews nor digests (`chomperBit`'s `ate` is false). A Hypno-shroom asleep in the day is eaten as usual.
- Zombies and plants go through the same `mindControl` (`server/zombies/mindControl.ts`).
- On changing team:
  - the speed does not change; it is picked again at random when the zombie stops eating and walks on, as for every zombie (`Zombie.pickSpeed`, that is, `PickRandomSpeed`);
  - the zombie or plant records `mindControlled` (saved, and sent to the client in snapshots). Only mind-controlled ones are tinted; ones planted or placed on the other side do not count;
  - a zombie is told through `Zombie.changedSides` (a dancer leaves its troupe);
  - it emits the `mindControlled` event (`entityId`, `plantId`, `typeId`, `team`);
  - if a mind-controlled zombie was the last hostile zombie, the level award drops from it (`tryDropLevelAward`).
- The Disco is Undead achievement observes `mindControlled` through the `pvz:mind-controlled` trigger type, set to the Dancing Zombie (`zombies: ["pvz:dancer"]`). A zombie of a listed type coming over to the `plants` side earns it; a plant that swallowed a Hypno-shroom, or a zombie brought over to the `zombies` side, does not.

## Seed packets and setting a side

Seed packets carry a team too, meaning "which side what it puts down belongs to".

- The project adds zombie, grave and crater seeds, which go in seed slots like plants. They are hidden: they appear in the chooser with `/cheatseed`, or can be put in a slot with `/seed`, such as `/seed 1 normal`. A zombie seed puts its zombie into any cell of an active row; a grave or crater seed goes into any cell of an active row without a grave or crater, and the plants there die.
- Plant and crater seeds default to `plants`, zombie and grave seeds to `zombies` (`seedTeam`). Only a team that differs from the default is written (`packetTeam`): into `seedBank.packets[].team` (saved), the snapshot's `seedPackets[].team` and `conveyorPackets[].team`, and the held `cursor.team`.
- A `zombies` packet of a plant seed plants a plant of the zombies' team, and a `plants` packet of a zombie seed puts down a zombie of the plants' team. The client draws what is in the packet, in hand and in the placement preview the other way round (`PlantPreview` / `ZombiePreview`'s `setMirrored`).
- A plant from a zombies' side packet costs sun, recharges and follows the planting rules as usual, but cannot be shoveled.
- A packet of another team is swapped in with `/seed {slot} {seed} {team}`, such as `/seed 1 snowpea zombies`, also on conveyor-belt levels. With `/cheatseed` on, the chooser's pages list every seed on the plants' side and then the same seeds on the zombies' side (`shared/content/chooserPages.ts`). Mods can offer further cards of either team through `seedChooser.entries` (`server/seeds/seedChooser.ts`).

Besides seed packets, these also set a side:

- **The Hypno-shroom**, as [above](#the-hypno-shroom).
- **Debug commands** with a side argument:
  - `/plant {plant} {row} {col} zombies` plants a plant of the zombies' side, such as `/plant peashooter 3 9 zombies`;
  - `/zombie {zombie} [row] [col] plants` places a zombie of the plants' side, such as `/zombie normal 3 1 plants`;
  - `/griditem grave {row} {col} plants` places a grave whose zombies rise on the plants' side, and `/griditem crater {row} {col} zombies` a crater drawn turned round.
- **Level data**: a level's `initialPlants` can give `"team": "zombies"` to preset plants of the zombies' side.

See [Debug Console](DEBUG_CLI.md) for the full commands.

## Presentation

- **Zombies facing right.** Zombies of the `plants` team are mirrored as in the original's `Zombie::UpdateReanim`: the body moves right 90 and then flips, whatever the clip's offsets, so zombies that face right in the original (mind-controlled ones, and later the Digger, the Yeti and so on) all look as they do in the original.
- **Put down facing right.** Being put down facing right, which the original does not have, is corrected separately so that it lines up with the other zombies: a zombie gameplay definition's `facingRightOffsetX` makes it stand further right when put down, and the held zombie and the cell preview move by the same amount. Mind-controlled zombies keep their place.
  - The pole vaulter's value comes from the original's data: its `GetDrawPos` is −6 horizontally, and its seed packet x is 5 pixels left of the plain zombie's (−8 against −3, at scale 0.35, so its body is 14.29 further right in its own coordinates). Put down, it stands 6 + 14.29 = 20.29 further right.
  - The Football Zombie's seed packet scale (0.33) differs from the plain zombie's (0.35), so its value is worked out by lining the two bodies up on the seed packet's center line (x = 25 of its 50 width). Its `GetDrawPos` only moves it up, its seed packet x is −7, and in its own coordinates its body is (25 + 7) / 0.33 − (25 + 3) / 0.35 = 16.97 further right than the plain zombie's, so it stands 16.97 further right when put down. At the same scale this works out the same as the pole vaulter's.
  - The dancers are drawn turned round 6 further left than other zombies (their presentation's `turnedOffsetX`, the original's place for them), which they take back when put down. By the same packet reckoning, the Dancing Zombie's body is (25 + 4.25) / 0.375 − (25 + 3) / 0.35 = −2 from the plain zombie's, so it stands −2 + 6 = 4 further right; the Backup Dancer's is (25 + 6) / 0.35 − (25 + 3) / 0.35 = 8.57, so 8.57 + 6 = 14.57.
- **Seed packets.** A zombie's packet picture is drawn facing left and, for the other side, turned round whole about the packet's middle, together with its tilt and clipping, as plant and grave packets are (`mirrorInPacket` in `client/hud/packetPicture.ts`). Only in hand and over the cell does the body itself flip and take `facingRightOffsetX` (`ZombiePreview`).
- **Shadows and dropped parts.** The shadow uses the presentation definition's `shadow.backwardsX`. The head, arm, flag and armor particles that fall off, and the charred zombie after burning, also flip to face right. For mind-controlled zombies the original mirrors only the position and does not flip the particles, which is fixed here as a bug. The crumbs from chewing a Wall-nut flip as well.
- **The mind-controlled look** comes with the Hypno-shroom: the color `(128, 64, 192)` multiplied and overlaid (`ReanimPlayer.setTint`), the heads, arms, flags and helmets that fall off tinted the same, and a soft chewing sound for biting zombies; the original decides all of these by `mMindControlled`. Mind-controlled plants are tinted the same color (`entityTint`, shared by plants and zombies). `plants`-team zombies put down from a seed packet or with `/zombie ... plants`, and plants planted on the `zombies` team from the start, are not mind-controlled and are not tinted; such zombies look like ordinary zombies, only facing right.
- **Sounds and particles.** The team-change event plays `FOLEY_FLOOP`, `SOUND_MINDCONTROLLED` and `PARTICLE_MIND_CONTROL` one layer above what changed (`StageEventRegistry`'s `mindControlled`: a zombie's at (60, 40), a plant's at its center (40, 40)). Mind-controlled zombies biting zombies use the soft chewing sound, and the gulp sound plays when the other falls.
- **Plants of the `zombies` team** are mirrored, and so are their projectiles; a `zombies`-team projectile's shadow is mirrored with it (`ProjectileView`). Plants hit by a hostile projectile flash white.

## The teams demo level and debugging

`/level pvz:teams-demo` opens a temporary level on the day lawn. It does not overwrite the Adventure save, cannot be saved, grants no achievements and returns to the main menu when it ends.

- In each row the player has a Sunflower and a shooter in the two left columns (Peashooters, a Repeater and a Snow Pea).
- The three right-most columns hold 9 plants of the zombies' side, facing left: three Peashooters, a Repeater, a Snow Pea, a Wall-nut, a Chomper, a Potato Mine and an Explode-o-nut.
- The player starts with 1000 sun and a fixed seed bank of 8: Peashooter, Repeater, Snow Pea, Wall-nut, Cherry Bomb, Chomper, Potato Mine and Sunflower.
- Four waves of Zombies, Conehead Zombies and Buckethead Zombies come from the right, through the zombies' side plants; the fourth is a flag wave.

The other debug commands for teams:

- `/zombie {zombie} [row] [col] plants` spawns a zombie of the `plants` team.
- `/plant {plant} {row} {col} zombies` spawns a plant of the `zombies` team.
- `/seed {slot} {seed} zombies` swaps in a seed packet of the `zombies` team (`plants` for a zombie seed of the plants' side).
- `/griditem {grave|crater} {row} {col} [team]` places a grave or crater of a team.

See [Debug Console](DEBUG_CLI.md).

## Implementation and tests

| Area | Code |
| --- | --- |
| Team data, `isHostile`, facing and mirroring helpers | `shared/content/teams.ts` |
| Mind control | `server/zombies/mindControl.ts`, `server/plants/HypnoShroom.ts`, `server/plants/Chomper.ts` |
| Zombie bites and movement | `server/zombies/system.ts`, `server/zombies/Dancer.ts` |
| Chill and freeze | `server/combat/cold.ts`, `server/plants/chill.ts`, `server/combat/freeze.ts` |
| Blasts | `server/combat/explosions.ts`, `server/plants/damage.ts` |
| Planting rules and the shovel | `shared/content/planting.ts`, `server/seeds/planting.ts` |
| Seed chooser | `server/seeds/seedChooser.ts`, `shared/content/chooserPages.ts` |
| Lawn mowers | `server/mowers/mowers.ts`, `server/projectiles/MowingProjectile.ts` |
| Producers | `server/plants/Producer.ts` |
| Tints, stage events, previews | `client/view/tints.ts`, `client/level/StageEventRegistry.ts`, `client/hud/ZombiePreview.ts`, `client/hud/PlantPreview.ts` |

`tests/server/teams.test.ts` covers:

- a `plants`-team zombie walking right, out of the plants' reach, and leaving the lawn;
- zombies of the two sides biting each other through shields, and the team surviving a save;
- plants of the two sides shooting each other, the zombies' side firing left; a projectile finishing a hostile plant; peas flying over low plants, and a shooter with only low plants ahead holding its fire;
- blasts and the Chomper taking out hostile plants only, and the Chomper remembering a plant it chews;
- zombies biting only hostile plants;
- the teams demo level placing plants of both sides that fight;
- a hostile Snow Pea chilling a plant (half speed, the animation at half rate, the chill reported once) and a `plants`-team zombie;
- the Potato Mine's reach against hostile plants, two hostile bowling nuts meeting, and the shovel refusing a `zombies`-team plant;
- seed packets of the `zombies` team from `/seed` surviving a save, zombie seeds and their placement, every zombie having a seed, and `facingRightOffsetX`;
- a pole vaulter facing right vaulting right, and a charred `plants`-team zombie crumbling facing right;
- an enemy Sunflower draining sun;
- mind control: the team change, tint and speed, saving, `plants`-team zombies that were put down not counting as mind-controlled, no effect in the day, the award dropping when the last zombie is mind-controlled, and a Chomper turned by an awake Hypno-shroom or eating a sleeping one.
