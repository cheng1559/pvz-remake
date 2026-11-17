import type { EntityId, World } from '@/server/state/World'
import { cellPosition, type GameplayDefinitions, zombieRowY } from '@/shared/content/gameplay'
import { GRAVE, GRAVE_MAX_RISE_DELAY, GRAVE_RISEN_COUNTER, GRAVE_VARIANTS, graveAt, graveRiseCounter } from '@/shared/content/graves'
import { holdsCell } from '@/shared/content/planting'
import type { GraveSnapshot } from '@/shared/protocol'
import { pickWeighted } from '@/shared/random'
import { LevelStateResource, RandomResource, WaveResource } from '../state/resources'
import { spawnZombie } from '../zombies/spawn'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { levelAwardDropped } from '../level/levelAward'
import { lawnPlants } from '../level/lawn'
import { gridItems } from './gridItems'

/** A grave (GraveSnapshot), a grid item. */
export type Grave = Omit<GraveSnapshot, 'entityId'> & { id: EntityId }

/** The graves on the lawn, in the order they were made. */
export function graves(world: World): Array<{ entity: EntityId, grave: Grave }> {
    return [...world.gridItems].flatMap(grave => grave.typeId === GRAVE ? [{ entity: grave.id, grave }] : [])
}

/** Board::AddAGraveStone: a grave in the cell, with its look and how late it rises. `more`: what it has besides. */
export function createGrave(world: World, row: number, column: number, more: Pick<Grave, 'riseAtTick' | 'team'> = {}): EntityId {
    const random = world.resources.get(RandomResource)
    const entity = world.createEntity()
    world.insert(world.gridItems, { id: entity, typeId: GRAVE, column, row, variant: random.integer(0, GRAVE_VARIANTS - 1),
        riseDelay: random.integer(0, GRAVE_MAX_RISE_DELAY), offsetX: random.integer(-5, 4), offsetY: random.integer(-5, 4), ...more })
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
    for (const plant of lawnPlants(world)) if (holdsCell(definitions.plants, plant, row, column)) world.destroyEntity(plant.entity)
    const old = graveAt(gridItems(world), row, column)
    if (old) world.destroyEntity(old.entityId)
    return createGrave(world, row, column, { ...(riseAtTick === undefined ? {} : { riseAtTick }), ...(team ? { team } : {}) })
}

/** Board::AddGraveStones: each column picks distinct rows (columns are unique per level). Keep the look stable on restore. */
export function createGraves(world: World): void {
    const level = world.resources.get(LevelStateResource).definition
    const random = world.resources.get(RandomResource)
    const made: EntityId[] = []
    for (const { column, count } of level.graves ?? []) {
        const rows = [...level.activeRows]
        for (let i = 0; i < count; i++) {
            const [row] = rows.splice(random.integer(0, rows.length - 1), 1)
            made.push(createGrave(world, row, column))
        }
    }
    // Board::PickSpecialGraveStone, right after placing them: one stone looks different.
    const special = made.length ? world.gridItems.get(made[random.integer(0, made.length - 1)]) : undefined
    if (special?.typeId === GRAVE) special.special = true
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
    const { definition } = world.resources.get(LevelStateResource)
    // Board::UpdateGame stops the rise counter after HasLevelAwardDropped.
    if (levelAwardDropped(world)) return
    const choices = definition.graveZombies!, random = world.resources.get(RandomResource)
    for (const { grave } of graves(world)) {
        // Board::SpawnZombiesFromGraves skips a grave still rising, before picking its zombie. The level's own graves
        // rose in the intro.
        if ((graveRiseCounter(grave, tick) ?? GRAVE_RISEN_COUNTER) < GRAVE_RISEN_COUNTER) continue
        raiseZombieFromGrave(world, definitions, grave, pickWeighted(choices, random).id, 150)
    }
}
