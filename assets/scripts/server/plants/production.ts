import type { GameSystem } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, PlantComponent, PositionComponent } from '../state/components'
import { levelAwardDropped } from '../level/levelAward'

/**
 * Plant::UpdateProductionPlant: each plant produces by its kind (Plant.produce: a producer's, Producer.ts), none once
 * the level is decided, paused, or its award has dropped.
 */
export function createProductionSystem(_definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-production',
        run(context) {
            const { world } = context
            const level = world.resources.get(LevelStateResource)
            const stopped = level.result !== 'playing' || level.paused || levelAwardDropped(world)
            for (const entity of world.query(PlantComponent, PositionComponent)) world.get(entity, PlantComponent)!.produce(context, entity, stopped)
        },
    }
}
