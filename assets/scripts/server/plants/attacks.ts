import type { GameSystem } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/components'
import { plantsInPlay } from '../level/lawn'

/** The plants' attacks, each plant by its kind (Plant.attack: a shooter's, Shooter.ts), while the level is played. */
export function createPlantAttackSystem(_definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-attacks',
        run(context) {
            const { world } = context
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            // An earlier plant's area attack may take one out: it is passed over.
            for (const plant of plantsInPlay(world)) plant.attack(context, plant.id)
        },
    }
}
