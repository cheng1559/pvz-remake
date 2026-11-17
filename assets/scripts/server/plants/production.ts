import type { GameSystem } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/resources'
import { levelAwardDropped } from '../level/levelAward'
import { plantsInPlay } from '../level/lawn'

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
            for (const plant of plantsInPlay(world)) plant.produce(context, plant.id, stopped)
        },
    }
}
