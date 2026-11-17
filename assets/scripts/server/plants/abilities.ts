import type { GameSystem } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, PlantComponent, PositionComponent } from '../state/components'
import { plantSkipsTick } from './chill'

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
            for (const entity of world.query(PositionComponent, PlantComponent)) {
                // An earlier plant's blast or bite may have taken this one out.
                const plant = world.get(entity, PlantComponent)
                if (!plant || plantSkipsTick(plant) || plant.asleep(world)) continue
                plant.act(context, entity)
            }
        },
    }
}
