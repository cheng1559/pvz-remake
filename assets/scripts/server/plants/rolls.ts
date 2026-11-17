import type { GameSystem } from '@/ecs/index'
import { LevelStateResource, PlantComponent, PositionComponent } from '../state/components'
import { plantSkipsTick } from './chill'

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
            for (const entity of world.query(PositionComponent, PlantComponent)) {
                // An earlier nut's blow may have taken this one out.
                const plant = world.get(entity, PlantComponent)
                if (plant && plant.health > 0 && !plantSkipsTick(plant)) plant.roll(context, entity)
            }
        },
    }
}
