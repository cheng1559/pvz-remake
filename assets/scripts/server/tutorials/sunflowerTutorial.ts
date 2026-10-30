import type { World } from '@/ecs/index'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { EconomyStateResource, PlantComponent, SeedBankResource } from '../state/components'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import type { TutorialScript } from './index'
import { selectedSeedId } from '../seeds/seedBank'

export function sunflowerReady(world: World, tick: number): boolean {
    const packet = world.resources.get(SeedBankResource).packets.find(packet => packet.seedId === 'pvz:sunflower')
    const economy = world.resources.get(EconomyStateResource)
    const pending = [...world.query(ItemComponent)].reduce((sum, entity) => {
        const item = world.get(entity, ItemComponent)!
        return sum + (item.state === 'collecting' && item.typeId === 'pvz:sun' ? item.value : 0)
    }, 0)
    return !!packet && packet.readyAtTick <= tick && economy.sun - economy.pendingSunSpend + pending >= 50
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

function noteSeedCanceled(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'plant-sunflower' || tutorial.step === 'refresh-sunflower') {
        tutorial.step = sunflowerReady(world, tick) ? 'pick-sunflower' : 'refresh-sunflower'
    }
}

function noteSeedReady(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'refresh-sunflower' &&
        selectedSeedId(world.resources.get(SeedBankResource)) !== 'pvz:sunflower' && sunflowerReady(world, tick)) {
        tutorial.step = 'pick-sunflower'
    }
}

function notePlantPlaced(world: World, tick: number, plantId: string): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'complete') return
    const count = [...world.query(PlantComponent)].filter(entity => world.get(entity, PlantComponent)!.typeId === 'pvz:sunflower').length
    if (plantId === 'pvz:sunflower' && count === 2) advice(world, 'ADVICE_MORE_SUNFLOWERS')
    if (count >= 3) {
        tutorial.step = 'complete'
        tutorial.promptAtTick = undefined
        const waves = world.resources.get(WaveResource)
        if (waves.index === 0) waves.nextWaveAtTick = tick + 999
    } else tutorial.step = sunflowerReady(world, tick) ? 'pick-sunflower' : 'refresh-sunflower'
}

function update(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (tutorial.step === 'complete') return
    if (tick === 1) advice(world, 'ADVICE_PLANT_SUNFLOWER1')
    if (tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
        advice(world, 'ADVICE_PLANT_SUNFLOWER2')
        tutorial.promptAtTick = undefined
    }
    const waves = world.resources.get(WaveResource)
    if (!tutorial.zombieWarningShown && waves.index === 0 && tick >= (waves.nextWaveAtTick ?? 5000) - 750) {
        tutorial.zombieWarningShown = true
        advice(world, 'ADVICE_PLANT_SUNFLOWER3')
    }
}

export const sunflowerTutorial: TutorialScript = {
    initialize,
    update,
    seedSelected: noteSeedSelected,
    seedCanceled: noteSeedCanceled,
    plantPlaced: notePlantPlaced,
    seedReady(world, tick, seedId) {
        if (seedId === 'pvz:sunflower') noteSeedReady(world, tick)
    },
}
