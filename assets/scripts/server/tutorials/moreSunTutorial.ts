import type { World } from '@/server/state/World'
import { displayAdviceOnce } from './advice'
import { TutorialResource, WaveResource } from '../state/resources'
import { sunflowerReady, sunflowerTutorial } from './sunflowerTutorial'
import type { TutorialScript } from './index'
import { plantsInPlay } from '../level/lawn'

const sunflowerCount = (world: World) => [...plantsInPlay(world)].filter(plant => plant.typeId === 'pvz:sunflower').length

function advice(world: World, key: string, stay = false): void {
    displayAdviceOnce(world, key, stay ? 'tutorial-later-stay' : 'tutorial-later')
}

/** Board::UpdateTutorial's optional reminder after wave five; it never delays spawning. */
export const moreSunTutorial: TutorialScript = {
    initialize(world, firstAdventure) {
        world.resources.get(TutorialResource).step = firstAdventure ? 'waiting-for-sunflowers' : 'complete'
    },
    seedSelected: sunflowerTutorial.seedSelected,
    seedCanceled: sunflowerTutorial.seedCanceled,
    seedReady: sunflowerTutorial.seedReady,
    update(world, definitions, tick) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'waiting-for-sunflowers' && world.resources.get(WaveResource).index >= 5 &&
            sunflowerReady(world, definitions, tick) && sunflowerCount(world) < 3) {
            tutorial.step = 'pick-sunflower'
            tutorial.promptAtTick = tick + 500
            advice(world, 'ADVICE_PLANT_SUNFLOWER4', true)
        } else if (tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
            tutorial.promptAtTick = undefined
            advice(world, 'ADVICE_PLANT_SUNFLOWER5')
        }
    },
    plantPlaced(world, definitions, tick) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step !== 'plant-sunflower') return
        if (sunflowerCount(world) >= 3) {
            tutorial.step = 'complete'
            tutorial.promptAtTick = undefined
            advice(world, 'ADVICE_PLANT_SUNFLOWER5')
        } else tutorial.step = sunflowerReady(world, definitions, tick) ? 'pick-sunflower' : 'refresh-sunflower'
    },
}
