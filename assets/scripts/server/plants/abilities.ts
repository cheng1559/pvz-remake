import type { GameSystem } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/components'
import { plantSkipsTick } from './chill'
import { plantsInPlay } from '../level/lawn'

/**
 * Plant::UpdateAbilities: what each plant does of its own (Plant.act: a fuse, a mine, a chomper, a sun-shroom's growth,
 * a grave buster, a scaredy-shroom's fright), by its kind. Plant::Update returns early while it is asleep, and a plant
 * chilled or frozen sits out the ticks it does (chill.ts).
 */
export function createPlantAbilitySystem(_definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-abilities',
        run(context) {
            const { world } = context
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            // An earlier plant's blast or bite may take one out: it is passed over.
            for (const plant of plantsInPlay(world)) {
                if (plantSkipsTick(plant) || plant.asleep(world)) continue
                plant.act(context, plant.id)
            }
        },
    }
}
