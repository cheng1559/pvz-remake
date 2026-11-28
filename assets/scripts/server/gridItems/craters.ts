import type { EntityId, GameSystem, World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { CRATER, craterAt } from '@/shared/content/craters'
import { holdsCell } from '@/shared/content/planting'
import type { Team } from '@/shared/content/teams'
import type { CraterSnapshot } from '@/shared/protocol'
import { LevelStateResource } from '../state/resources'
import { lawnPlants } from '../level/lawn'

/** A crater (CraterSnapshot), a grid item. */
export type Crater = Omit<CraterSnapshot, 'entityId'> & { id: EntityId }

/** The craters on the lawn. */
export function craters(world: World): Crater[] {
    return [...world.gridItems].filter((item): item is Crater => item.typeId === CRATER)
}

/**
 * Board::AddACrater, as Plant::DoSpecial makes one for a doom-shroom (KillAllPlantsNearDoom first) and a crater seed
 * puts one down: a crater in the cell for `ticks`, and every plant holding the cell is gone, as a grave seed's are
 * (placeGrave). A crater already there is replaced, its time starting over, as a grave is: one goes down there only
 * with `/plantanywhere` (a crater seed, or a doom-shroom planted on a crater). `team`: the side it was made by, which
 * only turns it round (CraterSnapshot.team).
 */
export function placeCrater(world: World, definitions: GameplayDefinitions, row: number, column: number, ticks: number, team: Team): EntityId {
    for (const plant of lawnPlants(world)) if (holdsCell(definitions.plants, plant, row, column)) world.destroyEntity(plant.id)
    const old = craterAt(craters(world), row, column)
    if (old) world.destroyEntity(old.id)
    const entity = world.createEntity()
    world.insert(world.gridItems, { id: entity, typeId: CRATER, column, row, ticks, ...(team === 'zombies' ? { team } : {}) })
    return entity
}

/** Board::UpdateGridItems: in play, a crater's count runs down, and it is gone at 0 (GridItemDie). */
export function createCraterSystem(): GameSystem {
    return {
        id: 'pvz:craters',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            for (const crater of craters(world)) if (--crater.ticks <= 0) commands.destroyEntity(crater.id)
        },
    }
}
