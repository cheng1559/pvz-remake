import type { EntityId, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { plantTeam } from '@/shared/content/teams'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger } from '@/shared/validate'
import type { DeterministicRng } from '../state/DeterministicRng'
import { EconomyStateResource, RandomResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { spawnItem } from '../items/itemSpawn'
import { Plant, type PlantConfig } from './Plant'

export interface Producer {
    /** Plant::mLaunchCounter: the tick its next sun (or coin) is due. */
    readyAtTick: number
}

/**
 * A plant that produces on a rhythm (the definition's `producer`, Plant::UpdateProductionPlant): every `cadenceTicks` or
 * a little sooner it throws its item, or, on the zombies' side, takes what its sun is worth from the player. It holds
 * its count while asleep and while nothing is produced (the award dropped). Its snapshot shows how far its next is, for
 * the glow its view draws over the last 100 ticks.
 */
export class Producer extends Plant {
    static readonly config: readonly PlantConfig[] = ['producer']

    /** A producer that grows is a sun-shroom. */
    static validate(definition: PlantDefinition, id: string): void {
        if (definition.producer?.growth) throw new Error(`${id}.producer.growth needs the sunshroom kind`)
    }

    /** Ready to produce, until it is put down (start). */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.readyAtTick = 0
    }

    protected get producer(): NonNullable<PlantDefinition['producer']> { return this.definition.producer! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { readyAtTick, ...rest } = fields
        this.readyAtTick = nonNegativeInteger(readyAtTick, `${name}.readyAtTick`)
        super.restoreOwn(rest, name)
    }

    /** Its first is its `initialDelayTicks` away. */
    start(random: DeterministicRng, tick: number): void {
        super.start(random, tick)
        const delay = this.producer.initialDelayTicks
        this.readyAtTick = tick + random.integer(delay.min, delay.max)
    }

    sitOut(): void {
        this.readyAtTick++
    }

    /** It holds its count, as UpdateProductionPlant skips it (a growing sun-shroom). */
    protected holdsProduction(): boolean {
        return false
    }

    /** What it produces now. */
    protected producedItem(): string {
        return this.producer.item
    }

    produce({ world, commands, tick }: SystemContext, entity: EntityId, stopped: boolean): void {
        // A sleeping mushroom and a growing sun-shroom skip UpdateProductionPlant, holding the launch counter.
        if (stopped || this.asleep(world) || this.holdsProduction()) { this.readyAtTick++; return }
        if (this.readyAtTick - tick > 0) return
        const random = world.resources.get(RandomResource), producer = this.producer
        this.readyAtTick = tick + random.integer(Math.max(1, producer.cadenceTicks - 150), producer.cadenceTicks)
        const position = this.position
        const itemId = this.producedItem(), item = this.definitions.items[itemId]
        const events = world.resources.get(EventQueueResource)
        if (plantTeam(this) === 'zombies') {
            // An enemy producer takes from the player instead: what its sun is worth leaves the bank, down to 0. One
            // producing money gives nothing.
            if (item.kind === 'money') return
            const economy = world.resources.get(EconomyStateResource)
            const drained = Math.min(economy.sun, item.value)
            economy.sun -= drained
            emitServerEvent(events, 'sunDrained', { entityId: entity, sun: drained })
            return
        }
        // It comes out small and grows to its size as it rises (Coin::Update).
        const spawned = spawnItem(world, commands, { typeId: itemId, value: item.value, width: item.width, scale: 0.4 * (item.scale ?? 1) },
            position.x, position.y, 'plant')
        emitServerEvent(events, 'sunProduced', { entityId: entity, itemId: spawned })
    }

    /** The ticks to its next, held while its production is (ProducerView's glow). */
    protected snapshotOwn(tick?: number): JsonObject | undefined {
        return tick === undefined ? undefined : { produceTicks: Math.max(0, this.readyAtTick - tick) }
    }
}
