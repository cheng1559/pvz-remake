import type { EntityId, SystemContext } from '@/ecs/index'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { RandomResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { Producer } from './Producer'

const STATES = ['small', 'growing', 'big'] as const
type GrowthState = typeof STATES[number]

export interface SunShroom {
    /** Plant::mState of its growth. */
    state: GrowthState
    /** The ticks left of its state. */
    stateTicks: number
}

/**
 * The sun-shroom (the definition's `producer.growth`, Plant::UpdateSunShroom): it produces small suns (`smallItem`)
 * while small, grows (anim_grow) after `ticks`, holding its production while it does (`growingTicks`), and produces
 * its producer's own item once big.
 */
export class SunShroom extends Producer {
    /** It grows. */
    static validate(definition: PlantDefinition, id: string): void {
        if (!definition.producer?.growth) throw new Error(`${id} of kind sunshroom needs producer.growth`)
    }

    /** One comes small, its growth `ticks` away. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.state = 'small'
        this.stateTicks = this.growth.ticks
    }

    private get growth(): NonNullable<NonNullable<PlantDefinition['producer']>['growth']> { return this.producer.growth! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { state, stateTicks, ...rest } = fields
        this.state = oneOf(state, STATES, `${name}.state`)
        this.stateTicks = nonNegativeInteger(stateTicks, `${name}.stateTicks`)
        super.restoreOwn(rest, name)
    }

    animationState(): string {
        return this.state
    }

    protected holdsProduction(): boolean {
        return this.state === 'growing'
    }

    protected producedItem(): string {
        return this.state === 'small' ? this.growth.smallItem : super.producedItem()
    }

    act({ world }: SystemContext, entity: EntityId): void {
        if (this.stateTicks > 0) this.stateTicks--
        const random = world.resources.get(RandomResource)
        if (this.state === 'small') {
            // Plant::UpdateSunShroom: anim_grow, then the big sun-shroom.
            if (this.stateTicks > 0) return
            this.state = 'growing'
            this.stateTicks = this.growth.growingTicks
            this.playState(this.state, random)
            emitServerEvent(world.resources.get(EventQueueResource), 'plantGrew', { entityId: entity, typeId: this.typeId })
        } else if (this.state === 'growing' && this.stateTicks === 0) {
            this.state = 'big'
            this.playState(this.state, random)
        }
    }

    protected snapshotOwn(tick?: number): JsonObject {
        return { ...super.snapshotOwn(tick), state: this.state }
    }
}
