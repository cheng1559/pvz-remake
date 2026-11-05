import type { World } from '@/ecs'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { GRAVE_MAX_RISE_DELAY, GRAVE_RISEN_COUNTER, GRAVE_VARIANTS, graveRiseCounter, type GraveSnapshot } from '@/shared/protocol'
import { LevelStateResource, PlantComponent, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { ItemComponent, WaveResource } from '../state/levelState'
import { spawnZombie } from '../zombies/spawn'
import { emitServerEvent, EventQueueResource } from '../state/events'

export function createGrave(world: World, row: number, column: number): GraveSnapshot {
    const random = world.resources.get(RandomResource)
    return { column, row, variant: random.integer(0, GRAVE_VARIANTS - 1), riseDelay: random.integer(0, GRAVE_MAX_RISE_DELAY), offsetX: random.integer(-5, 4), offsetY: random.integer(-5, 4) }
}

/**
 * Challenge::GraveDangerSpawnGraveAt: a grave rises in the cell from `tick`, and every plant there dies (Plant::Die,
 * silently). A grave already there is replaced and rises again, which the original's CanAddGraveStoneAt would not pick.
 * Rolling nuts keep the column they were planted in but hold no cell (planting.findPlantAt), so they roll on. `team`:
 * a grave on the plants' side, whose zombies rise on that side.
 */
export function placeGrave(world: World, definitions: GameplayDefinitions, row: number, column: number, tick: number, team?: 'plants'): GraveSnapshot {
    for (const entity of [...world.query(PositionComponent, PlantComponent)]) {
        const plant = world.get(entity, PlantComponent)!
        if (definitions.plants[plant.typeId].occupiesCell !== false && world.get(entity, PositionComponent)!.row === row
            && plant.column === column) world.destroyEntity(entity)
    }
    const wave = world.resources.get(WaveResource)
    wave.graves = (wave.graves ?? []).filter(grave => grave.row !== row || grave.column !== column)
    const grave: GraveSnapshot = { ...createGrave(world, row, column), riseAtTick: tick, ...(team ? { team } : {}) }
    wave.graves.push(grave)
    return grave
}

/** Board::AddGraveStones: each column picks distinct rows (columns are unique per level). Keep the look stable on restore. */
export function createGraves(world: World): GraveSnapshot[] {
    const level = world.resources.get(LevelStateResource).definition
    const random = world.resources.get(RandomResource)
    const graves: GraveSnapshot[] = []
    for (const { column, count } of level.graves ?? []) {
        const rows = [...level.activeRows]
        for (let i = 0; i < count; i++) {
            const [row] = rows.splice(random.integer(0, rows.length - 1), 1)
            graves.push(createGrave(world, row, column))
        }
    }
    // Board::PickSpecialGraveStone, right after placing them: one stone looks different.
    if (graves.length) graves[random.integer(0, graves.length - 1)].special = true
    return graves
}

/** The last wave schedules a second group, 200 ticks later; none rises once the award has dropped. Never rerolled on restore. */
export function updateGraveSpawns(world: World, definitions: GameplayDefinitions, tick: number): void {
    const waves = world.resources.get(WaveResource)
    if (waves.graveRiseAtTick === undefined || tick < waves.graveRiseAtTick) return
    waves.graveRiseAtTick = undefined
    const { board, definition } = world.resources.get(LevelStateResource)
    // Board::UpdateGame stops the rise counter after HasLevelAwardDropped.
    if ([...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === definition.award.id)) return
    const choices = definition.graveZombies!, random = world.resources.get(RandomResource)
    for (const grave of waves.graves ?? []) {
        // Board::SpawnZombiesFromGraves skips a grave still rising, before picking its zombie. The level's own graves
        // rose in the intro.
        if ((graveRiseCounter(grave, tick) ?? GRAVE_RISEN_COUNTER) < GRAVE_RISEN_COUNTER) continue
        let roll = random.integer(0, choices.reduce((sum, entry) => sum + entry.weight, 0) - 1)
        const typeId = choices.find(entry => (roll -= entry.weight) < 0)!.id
        const entityId = spawnZombie(world, definitions, typeId, grave.row,
            board.origin.x + grave.column * board.cell.width - 25,
            board.origin.y + grave.row * board.cell.height - 30)
        const zombie = world.get(entityId, ZombieComponent)!
        zombie.riseTicks = 150
        // A grave on the plants' side raises its zombie on that side.
        if (grave.team) zombie.team = grave.team
        emitServerEvent(world.resources.get(EventQueueResource), 'zombieRoseFromGrave', { entityId, row: grave.row })
    }
}
