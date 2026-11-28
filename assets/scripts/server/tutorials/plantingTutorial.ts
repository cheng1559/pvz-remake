import type { World } from '@/server/state/World'
import { LevelStateResource, SkySunResource, TutorialResource, WaveResource } from '../state/resources'
import { adviceShown, displayAdviceOnce } from './advice'
import type { TutorialScript } from './index'
import { levelAwardDropped } from '../level/levelAward'
import { plantsInPlay } from '../level/lawn'
import { bankLacks } from '../seeds/seedBank'

const FIRST_SUN_DELAY_TICKS = 400
const FIRST_WAVE_DELAY_TICKS = 99
const SECOND_SEED_PROMPT_DELAY_TICKS = 400
const PEASHOOTER = 'pvz:peashooter'

function canUpdate(world: World): boolean {
    const level = world.resources.get(LevelStateResource)
    return level.result === 'playing' && !level.paused && !levelAwardDropped(world)
}

/**
 * The Peashooters on the lawn: the first lets the sky sun fall, the second starts the waves. The original counts every
 * plant (Board::MouseDownWithPlant's mPlants.mSize >= 2), where the bank has only the Peashooter.
 */
const peashooters = (world: World) => [...plantsInPlay(world)].filter(plant => plant.typeId === PEASHOOTER).length

function letSunFall(world: World, tick: number): void {
    world.resources.get(TutorialResource).step = 'first-plant-done'
    world.resources.get(SkySunResource).atTick = tick + FIRST_SUN_DELAY_TICKS
}

function startWaves(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    tutorial.step = 'complete'
    tutorial.promptAtTick = undefined
    world.resources.get(WaveResource).nextWaveAtTick = tick + FIRST_WAVE_DELAY_TICKS
}

function notePlantPlaced(world: World, tick: number, seedId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure || tutorial.step === 'complete' || seedId !== PEASHOOTER) return
    const count = peashooters(world)
    if (count === 1) letSunFall(world, tick)
    else if (count >= 2) startWaves(world, tick)
}

/** The Peashooter picked up; another card picked up puts a held Peashooter back, as it does not count. */
function noteSeedSelected(world: World, seedId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (seedId !== PEASHOOTER) {
        if (tutorial.step === 'plant-first-seed') tutorial.step = 'pick-first-seed'
        else if (tutorial.step === 'plant-second-seed') tutorial.step = 'pick-second-seed'
    } else if (tutorial.step === 'pick-first-seed') tutorial.step = 'plant-first-seed'
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
    skips: world => bankLacks(world, PEASHOOTER),
    skipped(world, tick) {
        // What the Peashooters would let go: the sky sun, unless the first is down, and the waves.
        const step = world.resources.get(TutorialResource).step
        if (step === 'pick-first-seed' || step === 'plant-first-seed') letSunFall(world, tick)
        startWaves(world, tick)
    },
    initialize(world, firstAdventure) {
        const tutorial = world.resources.get(TutorialResource)
        if (firstAdventure && !tutorial.skipped) tutorial.step = 'pick-first-seed'
    },
    beforeSun(world, tick) {
        if (!canUpdate(world)) return
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'pick-first-seed' && peashooters(world) >= 1) letSunFall(world, tick)
    },
    sunSpawned(world) {
        const tutorial = world.resources.get(TutorialResource)
        displayAdviceOnce(world, 'ADVICE_CLICK_ON_SUN')
        if (tutorial.step === 'first-plant-done') tutorial.step = 'collect-first-sun'
    },
    seedRejected(world, reason) {
        if (!adviceShown(world, 'ADVICE_CLICK_ON_SUN')) return
        displayAdviceOnce(world, reason === 'seed-not-ready' ? 'ADVICE_SEED_REFRESH' : 'ADVICE_CANT_AFFORD_PLANT', 'tutorial-level1')
    },
    update(world, _definitions, tick) {
        if (!canUpdate(world)) return
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'enough-sun' && tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
            tutorial.step = 'pick-second-seed'
            tutorial.promptAtTick = undefined
        }
        if (tutorial.step !== 'complete' && peashooters(world) >= 2) startWaves(world, tick)
    },
    seedSelected: noteSeedSelected,
    seedCanceled: (world, _definitions, tick) => noteSeedCanceled(world, tick),
    seedReady(world, _definitions, tick, seedId) {
        if (seedId === PEASHOOTER) noteSeedReady(world, tick)
    },
    sunCollected(world, tick, seedId, canAfford) {
        if (seedId === PEASHOOTER) noteSunCollected(world, tick, canAfford)
    },
    plantPlaced(world, _definitions, tick, seedId) { notePlantPlaced(world, tick, seedId) },
}
