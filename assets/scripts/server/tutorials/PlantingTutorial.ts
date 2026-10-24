import type { World } from '@/ecs/index'
import { LevelStateResource, PlantComponent } from '../components'
import { ItemComponent, TutorialResource, WaveResource } from '../levelState'
import { emitServerEvent, EventQueueResource } from '../events'
import type { TutorialScript } from './index'

const FIRST_SUN_DELAY_TICKS = 400
const FIRST_WAVE_DELAY_TICKS = 99
const SECOND_SEED_PROMPT_DELAY_TICKS = 400

function canUpdate(world: World): boolean {
    const level = world.resources.get(LevelStateResource)
    return level.result === 'playing' && !level.paused &&
        ![...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)
}

function notePlantPlaced(world: World, tick: number, upgraded = false): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure || tutorial.step === 'complete') return
    const plantCount = [...world.query(PlantComponent)].length + (upgraded ? 1 : 0)
    if (plantCount === 1) {
        tutorial.step = 'first-plant-done'
        tutorial.sunAtTick = tick + FIRST_SUN_DELAY_TICKS
    } else if (plantCount >= 2) {
        tutorial.step = 'complete'
        tutorial.promptAtTick = undefined
        world.resources.get(WaveResource).nextWaveAtTick = tick + FIRST_WAVE_DELAY_TICKS
    }
}

function noteSeedSelected(world: World): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'pick-first-seed') tutorial.step = 'plant-first-seed'
    else if (tutorial.step === 'enough-sun' || tutorial.step === 'pick-second-seed') {
        tutorial.step = 'plant-second-seed'
        tutorial.promptAtTick = undefined
    }
}

function noteSeedCanceled(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'plant-first-seed') tutorial.step = 'pick-first-seed'
    else if (tutorial.step === 'plant-second-seed') {
        tutorial.step = 'enough-sun'
        tutorial.promptAtTick = tick + SECOND_SEED_PROMPT_DELAY_TICKS
    }
}

function noteSunCollected(world: World, tick: number, canAfford: boolean): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'collect-first-sun') tutorial.step = 'collect-more-sun'
    if (tutorial.step === 'collect-more-sun' && canAfford) noteSeedReady(world, tick)
}

function noteSeedReady(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'first-plant-done' || tutorial.step === 'collect-first-sun' || tutorial.step === 'collect-more-sun') {
        tutorial.step = 'enough-sun'
        tutorial.promptAtTick = tick + SECOND_SEED_PROMPT_DELAY_TICKS
    }
}

export const plantingTutorial: TutorialScript = {
    blocksStart: true,
    initialize(world, firstAdventure) {
        if (firstAdventure) world.resources.get(TutorialResource).step = 'pick-first-seed'
    },
    beforeSun(world, tick) {
        if (!canUpdate(world)) return
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'pick-first-seed' && [...world.query(PlantComponent)].length >= 1) {
            tutorial.step = 'first-plant-done'
            tutorial.sunAtTick = tick + FIRST_SUN_DELAY_TICKS
        }
    },
    sunSpawned(world) {
        const tutorial = world.resources.get(TutorialResource)
        const displayed = tutorial.displayedAdvice ??= []
        if (!displayed.includes('ADVICE_CLICK_ON_SUN')) displayed.push('ADVICE_CLICK_ON_SUN')
        if (tutorial.step === 'first-plant-done') tutorial.step = 'collect-first-sun'
    },
    seedRejected(world, reason) {
        const tutorial = world.resources.get(TutorialResource)
        if (!tutorial.displayedAdvice?.includes('ADVICE_CLICK_ON_SUN')) return
        const flag = reason === 'seed-not-ready' ? 'seedRefreshAdviceShown' : 'cantAffordAdviceShown'
        if (tutorial[flag]) return
        tutorial[flag] = true
        emitServerEvent(world.resources.get(EventQueueResource), 'advice', {
            key: reason === 'seed-not-ready' ? 'ADVICE_SEED_REFRESH' : 'ADVICE_CANT_AFFORD_PLANT',
            style: 'tutorial-level1',
        })
    },
    update(world, tick) {
        if (!canUpdate(world)) return
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'enough-sun' && tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
            tutorial.step = 'pick-second-seed'
            tutorial.promptAtTick = undefined
        }
        if (tutorial.step !== 'complete' && [...world.query(PlantComponent)].length >= 2) {
            tutorial.step = 'complete'
            tutorial.promptAtTick = undefined
            world.resources.get(WaveResource).nextWaveAtTick = tick + FIRST_WAVE_DELAY_TICKS
        }
    },
    seedSelected: noteSeedSelected,
    seedCanceled: noteSeedCanceled,
    seedReady(world, tick, seedId) {
        if (seedId === 'pvz:peashooter') noteSeedReady(world, tick)
    },
    sunCollected(world, tick, seedId, canAfford) {
        if (seedId === 'pvz:peashooter') noteSunCollected(world, tick, canAfford)
    },
    plantPlaced(world, tick, _plantId, upgraded) { notePlantPlaced(world, tick, upgraded) },
}
