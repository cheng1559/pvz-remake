import type { GameSystem } from '@/server/state/World'
import { LevelStateResource } from '../state/resources'
import { plantSkipsTick } from './chill'
import { plantsInPlay } from '../level/lawn'

/**
 * The plants that roll (Plant.roll: a bowling nut's, BowlingNut.ts), in play, also once the level is won; one chilled
 * sits out every other tick (chill.ts).
 */
export function createPlantRollSystem(): GameSystem {
    return {
        id: 'pvz:plant-rolls',
        run(context) {
            const { world } = context
            const level = world.resources.get(LevelStateResource)
            if (level.phase !== 'gameplay' || level.paused || level.result === 'lost') return
            // An earlier nut's blow may take one out: it is passed over.
            for (const plant of plantsInPlay(world)) if (plant.health > 0 && !plantSkipsTick(plant)) plant.roll(context, plant.id)
        },
    }
}
