import type { EntityId, World } from '@/server/state/World'
import { DeterministicRng } from '../state/DeterministicRng'
import { cellPosition, type GameplayDefinitions, zombieRowY } from '@/shared/content/gameplay'
import { GRAVE, GRAVE_MAX_RISE_DELAY, GRAVE_RISEN_COUNTER, GRAVE_VARIANTS, graveAt, graveRiseCounter } from '@/shared/content/graves'
import { holdsCell } from '@/shared/content/planting'
import type { GraveSnapshot } from '@/shared/protocol'
import { pickWeighted } from '@/shared/random'
import { BoardSeedResource, LevelStateResource, RandomResource, WaveResource } from '../state/resources'
import { spawnZombie } from '../zombies/spawn'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { levelAwardDropped } from '../level/levelAward'
import { lawnPlants } from '../level/lawn'
import { gridItems } from './gridItems'

/** A grave (GraveSnapshot), a grid item. */
export type Grave = Omit<GraveSnapshot, 'entityId'> & { id: EntityId }

/** Mix the cell coordinates with the saved seed, then use MurmurHash3's 32-bit finalizer. */
export function graveCellLook(seed: number, row: number, column: number): Pick<Grave, 'variant' | 'offsetX' | 'offsetY'> {
    let hash = seed ^ Math.imul(row, 0x9e3779b1) ^ Math.imul(column, 0x85ebca77)
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
    const value = (hash ^ (hash >>> 16)) >>> 0
    const offsets = Math.floor(value / GRAVE_VARIANTS)
    return { variant: value % GRAVE_VARIANTS, offsetX: offsets % 10 - 5, offsetY: Math.floor(offsets / 10) % 10 - 5 }
}

/** The graves on the lawn, in the order they were made. */
export function graves(world: World): Grave[] {
    return [...world.gridItems].filter((item): item is Grave => item.typeId === GRAVE)
}

/** Board::AddAGraveStone: a grave in the cell, with its look and how late it rises. `more`: what it has besides. */
export function createGrave(world: World, row: number, column: number, more: Pick<Grave, 'riseAtTick' | 'team'> = {}): EntityId {
    const random = world.resources.get(RandomResource)
    const entity = world.createEntity()
    const look = graveCellLook(world.resources.get(BoardSeedResource), row, column)
    world.insert(world.gridItems, { id: entity, typeId: GRAVE, column, row, ...look,
        riseDelay: random.integer(0, GRAVE_MAX_RISE_DELAY), ...more })
    return entity
}

/**
 * Challenge::GraveDangerSpawnGraveAt, and WhackAZombiePlaceGraves for each grave it picks: a grave rises in the cell
 * from `riseAtTick` (one without rises with the level's own, in the intro), and every plant holding the cell dies
 * (Plant::Die, silently). A grave already there is replaced and rises again, which the original's CanAddGraveStoneAt
 * would not pick. The original kills every plant whose mPlantCol and row are the cell's; a rolling nut keeps the
 * column it was planted in but holds no cell (holdsCell), so here it rolls on. `team`: a grave on the plants' side,
 * whose zombies rise on that side.
 */
export function placeGrave(world: World, definitions: GameplayDefinitions, row: number, column: number, riseAtTick: number | undefined,
    team?: 'plants'): EntityId {
    for (const plant of lawnPlants(world)) if (holdsCell(definitions.plants, plant, row, column)) world.destroyEntity(plant.id)
    const old = graveAt(gridItems(world), row, column)
    if (old) world.destroyEntity(old.entityId)
    return createGrave(world, row, column, { ...(riseAtTick === undefined ? {} : { riseAtTick }), ...(team ? { team } : {}) })
}

/** Board::AddGraveStones retries inactive and occupied rows using its own level RNG (1096, 0x40c4c0). */
export function createGraves(world: World): void {
    const { definition: level, board } = world.resources.get(LevelStateResource)
    const seed = world.resources.get(BoardSeedResource)
    const random = new DeterministicRng((seed + level.adventureIndex) >>> 0)
    const rowCount = Math.max(6, board.rows) // 1096 also draws the reserved sixth row on five-row lawns.
    for (const { column, count } of level.graves ?? []) {
        const available = new Set(level.activeRows)
        for (let placed = 0; placed < count;) {
            const row = random.integer(0, rowCount - 1)
            if (available.delete(row)) {
                createGrave(world, row, column)
                placed++
            }
        }
    }
}

/** Board::PickSpecialGraveStone runs once after all opening graves, including Whack-a-Zombie's, are in place. */
export function pickSpecialGrave(world: World): void {
    const opening = graves(world)
    if (opening.length) opening[world.resources.get(RandomResource).integer(0, opening.length - 1)].special = true
}

/**
 * Zombie::RiseFromGrave: a zombie comes up out of a grave over `riseTicks`, on the grave's side: one of the plants' side
 * raises its zombies on that side. Every zombie a grave raises comes this way.
 */
export function raiseZombieFromGrave(world: World, definitions: GameplayDefinitions, grave: Pick<Grave, 'row' | 'column' | 'team'>,
    typeId: string, riseTicks: number): EntityId {
    const { board } = world.resources.get(LevelStateResource)
    const entityId = spawnZombie(world, definitions, typeId, grave.row,
        cellPosition(board, grave.row, grave.column).x - 25, zombieRowY(board, grave.row))
    const zombie = world.zombies.get(entityId)!
    zombie.riseTicks = riseTicks
    if (grave.team) zombie.team = grave.team
    emitServerEvent(world.resources.get(EventQueueResource), 'zombieRoseFromGrave', { entityId, row: grave.row })
    return entityId
}

/** The last wave schedules a second group, 200 ticks later; none rises once the award has dropped. Never rerolled on restore. */
export function updateGraveSpawns(world: World, definitions: GameplayDefinitions, tick: number): void {
    const waves = world.resources.get(WaveResource)
    if (waves.graveRiseAtTick === undefined || tick < waves.graveRiseAtTick) return
    waves.graveRiseAtTick = undefined
    if (levelAwardDropped(world)) return
    // The final wave opens only fully risen graves. The level's starting graves rose during the intro.
    const risen = graves(world).filter(grave => (graveRiseCounter(grave, tick) ?? GRAVE_RISEN_COUNTER) >= GRAVE_RISEN_COUNTER)
    spawnZombiesFromGraves(world, definitions, risen)
}

/** Board::SpawnZombiesFromGraves, on the final wave's timer or immediately for /gravezombies. */
export function spawnZombiesFromGraves(world: World, definitions: GameplayDefinitions, from = graves(world)): number {
    const choices = world.resources.get(LevelStateResource).definition.graveZombies
    if (!choices?.length) return 0
    const random = world.resources.get(RandomResource)
    for (const grave of from) {
        raiseZombieFromGrave(world, definitions, grave, pickWeighted(choices, random).id, 150)
    }
    return from.length
}
