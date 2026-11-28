import type { World } from '@/server/state/World'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { SeedBankResource, TutorialResource, WaveResource } from '../state/resources'
import type { TutorialScript } from './index'
import { displayAdviceOnce } from './advice'
import { bankLacks, packetAvailability, selectedSeedId } from '../seeds/seedBank'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { plantsInPlay } from '../level/lawn'

/** The bank's sunflower packet can be picked up (SeedPacket::CanPickUp). */
export function sunflowerReady(world: World, definitions: GameplayDefinitions, tick: number): boolean {
    const packet = world.resources.get(SeedBankResource).packets.find(packet => packet?.seedId === 'pvz:sunflower')
    return !!packet && !packetAvailability(world, definitions, packet, tick).reason
}

function advice(world: World, key: string): void {
    emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key, style: 'tutorial-level2' })
}

function initialize(world: World, firstAdventure: boolean): void {
    const tutorial = world.resources.get(TutorialResource)
    tutorial.firstAdventure = firstAdventure
    tutorial.step = firstAdventure && !tutorial.skipped ? 'pick-sunflower' : 'complete'
    if (!firstAdventure) return
    if (!tutorial.skipped) tutorial.promptAtTick = 500
    // Board::InitZombieWaves: the first adventure's level 2 waits twice ZOMBIE_COUNTDOWN for its first wave, the
    // tutorial skipped too.
    world.resources.get(WaveResource).nextWaveAtTick = 5000
}

function noteSeedSelected(world: World, seedId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'pick-sunflower') {
        tutorial.step = seedId === 'pvz:sunflower' ? 'plant-sunflower' : 'refresh-sunflower'
    }
}

function noteSeedCanceled(world: World, definitions: GameplayDefinitions, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'plant-sunflower' || tutorial.step === 'refresh-sunflower') {
        tutorial.step = sunflowerReady(world, definitions, tick) ? 'pick-sunflower' : 'refresh-sunflower'
    }
}

function noteSeedReady(world: World, definitions: GameplayDefinitions, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'refresh-sunflower' &&
        selectedSeedId(world.resources.get(SeedBankResource)) !== 'pvz:sunflower' && sunflowerReady(world, definitions, tick)) {
        tutorial.step = 'pick-sunflower'
    }
}

function notePlantPlaced(world: World, tick: number, plantId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'complete') return
    const count = [...plantsInPlay(world)].filter(plant => plant.typeId === 'pvz:sunflower').length
    if (plantId === 'pvz:sunflower' && count === 2) advice(world, 'ADVICE_MORE_SUNFLOWERS')
    if (count >= 3) {
        tutorial.step = 'complete'
        tutorial.promptAtTick = undefined
        const waves = world.resources.get(WaveResource)
        if (waves.index === 0) waves.nextWaveAtTick = tick + 999
    }
}

/** Any card put down, a plant or not: back to picking the Sunflower, or to waiting for it. */
function noteSeedPlaced(world: World, definitions: GameplayDefinitions, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step !== 'complete') tutorial.step = sunflowerReady(world, definitions, tick) ? 'pick-sunflower' : 'refresh-sunflower'
}

function update(world: World, _definitions: GameplayDefinitions, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'complete') return
    if (tick === 1) advice(world, 'ADVICE_PLANT_SUNFLOWER1')
    if (tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
        advice(world, 'ADVICE_PLANT_SUNFLOWER2')
        tutorial.promptAtTick = undefined
    }
    const waves = world.resources.get(WaveResource)
    if (waves.index === 0 && tick >= waves.nextWaveAtTick! - 750) displayAdviceOnce(world, 'ADVICE_PLANT_SUNFLOWER3', 'tutorial-level2')
}

export const sunflowerTutorial: TutorialScript = {
    skips: world => bankLacks(world, 'pvz:sunflower'),
    initialize,
    update,
    seedSelected: noteSeedSelected,
    seedCanceled: noteSeedCanceled,
    plantPlaced: (world, _definitions, tick, plantId) => notePlantPlaced(world, tick, plantId),
    seedPlaced: (world, definitions, tick) => noteSeedPlaced(world, definitions, tick),
    seedReady(world, definitions, tick, seedId) {
        if (seedId === 'pvz:sunflower') noteSeedReady(world, definitions, tick)
    },
}
