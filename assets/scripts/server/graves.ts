import type { World } from '@/ecs'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { GRAVE_MAX_RISE_DELAY, GRAVE_VARIANTS, type GraveSnapshot } from '@/shared/protocol'
import { LevelStateResource, RandomResource, ZombieComponent } from './components'
import { ItemComponent, WaveResource } from './levelState'
import { spawnZombie } from './zombies/spawn'
import { emitServerEvent, EventQueueResource } from './events'

export function createGrave(world: World, row: number, column: number): GraveSnapshot {
    const random = world.resources.get(RandomResource)
    return { column, row, variant: random.integer(0, GRAVE_VARIANTS - 1), riseDelay: random.integer(0, GRAVE_MAX_RISE_DELAY), offsetX: random.integer(-5, 4), offsetY: random.integer(-5, 4) }
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
        let roll = random.integer(0, choices.reduce((sum, entry) => sum + entry.weight, 0) - 1)
        const typeId = choices.find(entry => (roll -= entry.weight) < 0)!.id
        const entityId = spawnZombie(world, definitions, typeId, grave.row,
            board.origin.x + grave.column * board.cell.width - 25,
            board.origin.y + grave.row * board.cell.height - 30)
        world.get(entityId, ZombieComponent)!.riseTicks = 150
        emitServerEvent(world.resources.get(EventQueueResource), 'zombieRoseFromGrave', { entityId, row: grave.row })
    }
}
