# Tick rewind (planned, not implemented)

Rewinding and single-stepping combat for debugging: taking the level back to an earlier tick, or moving it forward a given number of ticks. The planned commands are `/rewind {ticks}` and `/step {ticks}`. Discussed and measured on 2026-11-01; not developed yet.

## Current state

For now the game can only go forward: `/gamespeed {0-10}` (0 freezes it), and the pause while the debug CLI is open. There is no single-step command.

What is already in place:

- The server is deterministic: a fixed tick of 0.01 seconds, with the random number state saved in the save. The same save plus the same commands gives exactly the same result.
- `IntegratedGameServer.save()`, and `start()` given that save (`restoreSession`), can fully save and restore the world between ticks.
- The client can rebuild the picture from a save: `LevelScene`'s `snapshotPresentation` / `restorePresentation`; particles save their seed and age, and the kernel replays them.

## Approach

Save server snapshots at intervals, and record every player command (its tick and the command). To rewind, load the nearest snapshot before the target tick and recompute up to the target tick from the command record; stepping is simply recomputing further forward. The denser the snapshots, the more space they take and the faster the recomputing.

Suggested starting point: a snapshot about every 1000 ticks plus the command record. For debugging, dense snapshots (one every 10 ticks, for example) of only the last minute or two can also be kept in memory, with the older ones dropped.

## Measurements

Node, on a desktop machine; `drainEvents()` is called every tick, as the client takes the events every frame. Without taking the events, the event queue backs up and the save is about 5 times as large.

| Scene | Save JSON | Compressed (deflate) | Save + compress | Compute per tick |
| --- | --- | --- | --- | --- |
| 1-1, one Peashooter | 1.6 KB on average | 0.8 KB | 0.09 ms | 0.014 ms |
| Stress test level (40 plants, 160 zombies, about 241 entities) | 72 KB on average, 98 KB at peak | 8.8 KB, 11.5 KB at peak | 1.5 ms | 0.21 ms |

A save is about "entities × 400 bytes + a fixed part of 1–2 KB". Recomputing 1000 ticks takes about 14 ms on 1-1 and about 0.2 seconds on the stress test level.

## Endless mode estimate

There is no endless mode or pool content yet, so the following is extrapolated at 400 bytes per entity. The original's endless mode has 20 waves a round (two flags), the points per wave grow linearly with the round, and later on every wave reaches the cap of 50 zombies (`MAX_ZOMBIES_IN_WAVE`).

Take the round that holds the 100th flag: a full lawn has about 300–650 entities (about 100–130 plants, Lily Pads and Pumpkins, about 100–200 zombies and imps, about 100–300 projectiles), each snapshot's JSON is about 120–260 KB, and about 15–30 KB compressed. This round lasts about 5–10 minutes (30,000–60,000 ticks):

| Method | Total for one round |
| --- | --- |
| One every 10 ticks, compressed as they are | About 45–180 MB |
| One every 1000 ticks + command record | About 1–2 MB |

## Client and profile

A server snapshot restores only the world; two other things have to be handled along with it:

- **Picture**: `restorePresentation` needs a presentation snapshot taken asynchronously at the same moment as the server snapshot. Rewinding either stores a presentation snapshot beside each server snapshot, or adds a path that rebuilds the picture from the server snapshot alone (particles and music starting over).
- **Profile**: coin changes and seed slot upgrades in a level are written back to the player profile at once (`setCoins`, `recordPacketUpgradeOffer`). These writes must be paused while rewinding and recomputing, and once the rewind is done the coins at the target tick written back once; otherwise recomputing counts them twice or leaves the coins from before the rewind.

## Notes

- The compression library the game runs, fflate, has only a 32 KB deflate window, so delta compression against the previous snapshot is not possible; that needs comparing the JSON ourselves and storing only the changes, or bringing in a compression library with a larger window.
- On a full lawn each save plus compression takes several milliseconds. Saving every 10 ticks would stutter noticeably on iOS (JS without JIT, interpreted).
- Once there is endless mode and pool content, measure again the way described above (taking the events).
