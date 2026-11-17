import type { GameSystem } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, PlantComponent, PositionComponent } from '../state/components'

/** The plants' attacks, each plant by its kind (Plant.attack: a shooter's, Shooter.ts), while the level is played. */
export function createPlantAttackSystem(_definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-attacks',
        run(context) {
            const { world } = context
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            for (const entity of world.query(PositionComponent, PlantComponent)) {
                // An earlier plant's area attack may have taken this one out.
                const plant = world.get(entity, PlantComponent)
                if (plant && world.get(entity, PositionComponent)) plant.attack(context, entity)
            }
        },
    }
}
