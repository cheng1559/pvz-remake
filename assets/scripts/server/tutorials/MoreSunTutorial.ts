import type { World } from '@/ecs/index'
import { PlantComponent } from '../components'
import { emitServerEvent, EventQueueResource } from '../events'
import { TutorialResource, WaveResource } from '../levelState'
import { sunflowerReady, sunflowerTutorial } from './SunflowerTutorial'
import type { TutorialScript } from './index'

const sunflowerCount = (world: World) => [...world.query(PlantComponent)]
    .filter(entity => world.get(entity, PlantComponent)!.typeId === 'pvz:sunflower').length

function advice(world: World, key: string, stay = false): void {
    const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
    if (displayed.includes(key)) return
    displayed.push(key)
    emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key, style: stay ? 'tutorial-later-stay' : 'tutorial-later' })
}

/** Board::UpdateTutorial's optional reminder after wave five; it never delays spawning. */
export const moreSunTutorial: TutorialScript = {
    initialize(world, firstAdventure) {
        world.resources.get(TutorialResource).step = firstAdventure ? 'waiting-for-sunflowers' : 'complete'
    },
    seedSelected: sunflowerTutorial.seedSelected,
    seedCanceled: sunflowerTutorial.seedCanceled,
    seedReady: sunflowerTutorial.seedReady,
    update(world, tick) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'waiting-for-sunflowers' && world.resources.get(WaveResource).index >= 5 &&
            sunflowerReady(world, tick) && sunflowerCount(world) < 3) {
            tutorial.step = 'pick-sunflower'
            tutorial.promptAtTick = tick + 500
            advice(world, 'ADVICE_PLANT_SUNFLOWER4', true)
        } else if (tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
            tutorial.promptAtTick = undefined
            advice(world, 'ADVICE_PLANT_SUNFLOWER5')
        }
    },
    plantPlaced(world, tick) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step !== 'plant-sunflower') return
        if (sunflowerCount(world) >= 3) {
            tutorial.step = 'complete'
            tutorial.promptAtTick = undefined
            advice(world, 'ADVICE_PLANT_SUNFLOWER5')
        } else tutorial.step = sunflowerReady(world, tick) ? 'pick-sunflower' : 'refresh-sunflower'
    },
}
