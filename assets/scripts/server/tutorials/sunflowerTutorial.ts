import type { World } from '@/server/state/World'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { PlantComponent, SeedBankResource } from '../state/components'
import { TutorialResource, WaveResource } from '../state/levelState'
import type { TutorialScript } from './index'
import { displayAdviceOnce } from './advice'
import { packetAvailability, selectedSeedId } from '../seeds/seedBank'
import type { GameplayDefinitions } from '@/shared/content/gameplay'

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
    tutorial.step = firstAdventure ? 'pick-sunflower' : 'complete'
    if (firstAdventure) tutorial.promptAtTick = 500
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

function notePlantPlaced(world: World, definitions: GameplayDefinitions, tick: number, plantId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'complete') return
    const count = [...world.query(PlantComponent)].filter(entity => world.get(entity, PlantComponent)!.typeId === 'pvz:sunflower').length
    if (plantId === 'pvz:sunflower' && count === 2) advice(world, 'ADVICE_MORE_SUNFLOWERS')
    if (count >= 3) {
        tutorial.step = 'complete'
        tutorial.promptAtTick = undefined
        const waves = world.resources.get(WaveResource)
        if (waves.index === 0) waves.nextWaveAtTick = tick + 999
    } else tutorial.step = sunflowerReady(world, definitions, tick) ? 'pick-sunflower' : 'refresh-sunflower'
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
    initialize,
    update,
    seedSelected: noteSeedSelected,
    seedCanceled: noteSeedCanceled,
    plantPlaced: notePlantPlaced,
    seedReady(world, definitions, tick, seedId) {
        if (seedId === 'pvz:sunflower') noteSeedReady(world, definitions, tick)
    },
}
