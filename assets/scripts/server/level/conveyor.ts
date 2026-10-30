import type { GameSystem, World } from '@/ecs/index'
import { LevelStateResource, RandomResource, SeedBankResource } from '../state/components'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'

export function canPlantConveyorAt(world: World, column: number): boolean {
    const rules = world.resources.get(LevelStateResource).definition.bowling
    if (!rules || column <= rules.lineColumn) return true
    const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
    if (!displayed.includes('ADVICE_NOT_PASSED_LINE')) {
        displayed.push('ADVICE_NOT_PASSED_LINE')
        emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key: 'ADVICE_NOT_PASSED_LINE', style: 'hint' })
    }
    return false
}

export function startConveyor(world: World): void {
    const level = world.resources.get(LevelStateResource)
    const rules = level.definition.conveyor
    if (!rules) return
    const conveyor = world.resources.get(SeedBankResource).conveyor!
    if (rules.initialSeed) conveyor.packets.push({ id: conveyor.nextId++, seedId: rules.initialSeed, x: rules.entryX })
    conveyor.spawnAtTick = rules.initialDelayTicks ?? rules.spawnDelay[0].ticks
    world.resources.get(WaveResource).nextWaveAtTick = level.definition.firstWaveTicks
}

/** SeedBank::UpdateConveyorBelt and Challenge's weighted packet supply. */
export function createConveyorSystem(): GameSystem {
    return { id: 'pvz:conveyor', run({ world, tick }) {
        const level = world.resources.get(LevelStateResource)
        const rules = level.definition.conveyor
        if (!rules || level.paused || level.result !== 'playing') return
        if ([...world.query(ItemComponent)].some(id => world.get(id, ItemComponent)!.typeId === level.definition.award.id)) return
        const conveyor = world.resources.get(SeedBankResource).conveyor!
        if (++conveyor.moveTicks % rules.moveTicks === 0) {
            conveyor.packets.forEach((packet, index) => { packet.x = Math.max(index * rules.spacing, packet.x - 1) })
        }
        if (tick < conveyor.spawnAtTick) return
        const count = conveyor.packets.length
        conveyor.spawnAtTick = tick + rules.spawnDelay.filter(entry => count >= entry.minPackets).at(-1)!.ticks
        if (count >= rules.capacity) return
        // Challenge::UpdateConveyorBelt reduces duplicates in a multi-plant supply.
        const choices = rules.seeds.map(seed => {
            const count = conveyor.packets.filter(packet => packet.seedId === seed.id).length
            const weight = rules.seeds.length <= 2 ? seed.weight : count >= 4 ? 1 : count >= 3 ? 5
                : seed.id === conveyor.lastSeedId ? Math.trunc(seed.weight / 2) : seed.weight
            return { ...seed, weight }
        })
        let roll = world.resources.get(RandomResource).integer(0, choices.reduce((sum, seed) => sum + seed.weight, 0) - 1)
        const seed = choices.find(seed => (roll -= seed.weight) < 0)!
        const previousOffset = count ? conveyor.packets[count - 1].x - (count - 1) * rules.spacing : 0
        let offset = rules.entryX - (rules.spacing + rules.removalGap) * count
        if (count && offset < previousOffset) offset = previousOffset + rules.insertionGap
        conveyor.packets.push({ id: conveyor.nextId++, seedId: seed.id, x: count * rules.spacing + offset })
        conveyor.lastSeedId = seed.id
    } }
}
