import type { EntityId, World } from '@/ecs'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { GRAVE, GRAVE_MAX_RISE_DELAY, GRAVE_RISEN_COUNTER, GRAVE_VARIANTS, graveRiseCounter } from '@/shared/content/graves'
import { type Grave, GridItemComponent, LevelStateResource, PlantComponent, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { WaveResource } from '../state/levelState'
import { spawnZombie } from '../zombies/spawn'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { levelAwardDropped } from './levelAward'

/** The graves on the lawn, in the order they were made. */
export function graves(world: World): Array<{ entity: EntityId, grave: Grave }> {
    return [...world.query(GridItemComponent)].flatMap(entity => {
        const grave = world.get(entity, GridItemComponent)!
        return grave.typeId === GRAVE ? [{ entity, grave }] : []
    })
}

export function graveAt(world: World, row: number, column: number): { entity: EntityId, grave: Grave } | undefined {
    return graves(world).find(({ grave }) => grave.row === row && grave.column === column)
}

/** Board::AddAGraveStone: a grave in the cell, with its look and how late it rises. `more`: what it has besides. */
export function createGrave(world: World, row: number, column: number, more: Pick<Grave, 'riseAtTick' | 'team'> = {}): EntityId {
    const random = world.resources.get(RandomResource)
    const entity = world.createEntity()
    world.add(entity, GridItemComponent, { typeId: GRAVE, column, row, variant: random.integer(0, GRAVE_VARIANTS - 1),
        riseDelay: random.integer(0, GRAVE_MAX_RISE_DELAY), offsetX: random.integer(-5, 4), offsetY: random.integer(-5, 4), ...more })
    return entity
}

/**
 * Challenge::GraveDangerSpawnGraveAt: a grave rises in the cell from `tick`, and every plant there dies (Plant::Die,
 * silently). A grave already there is replaced and rises again, which the original's CanAddGraveStoneAt would not pick.
 * Rolling nuts keep the column they were planted in but hold no cell (planting.findPlantAt), so they roll on. `team`:
 * a grave on the plants' side, whose zombies rise on that side.
 */
export function placeGrave(world: World, definitions: GameplayDefinitions, row: number, column: number, tick: number, team?: 'plants'): EntityId {
    for (const entity of [...world.query(PositionComponent, PlantComponent)]) {
        const plant = world.get(entity, PlantComponent)!
        if (definitions.plants[plant.typeId].occupiesCell !== false && world.get(entity, PositionComponent)!.row === row
            && plant.column === column) world.destroyEntity(entity)
    }
    const old = graveAt(world, row, column)
    if (old) world.destroyEntity(old.entity)
    return createGrave(world, row, column, { riseAtTick: tick, ...(team ? { team } : {}) })
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
    if (made.length) world.get(made[random.integer(0, made.length - 1)], GridItemComponent)!.special = true
}

/**
 * Zombie::RiseFromGrave: a zombie comes up out of a grave over `riseTicks`, on the grave's side: one of the plants' side
 * raises its zombies on that side. Every zombie a grave raises comes this way.
 */
export function raiseZombieFromGrave(world: World, definitions: GameplayDefinitions, grave: Pick<Grave, 'row' | 'column' | 'team'>,
    typeId: string, riseTicks: number): EntityId {
    const { board } = world.resources.get(LevelStateResource)
    const entityId = spawnZombie(world, definitions, typeId, grave.row,
        board.origin.x + grave.column * board.cell.width - 25,
        board.origin.y + grave.row * board.cell.height - 30)
    const zombie = world.get(entityId, ZombieComponent)!
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
        let roll = random.integer(0, choices.reduce((sum, entry) => sum + entry.weight, 0) - 1)
        raiseZombieFromGrave(world, definitions, grave, choices.find(entry => (roll -= entry.weight) < 0)!.id, 150)
    }
}
