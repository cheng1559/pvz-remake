import type { EntityId, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { SUN_SHROOM_PHASES, type SunShroomPhase } from '@/shared/content/plantKinds'
import { RandomResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { Producer } from './Producer'


export interface SunShroom {
    /** Plant::mState of its growth. */
    phase: SunShroomPhase
    /** The ticks left of its phase. */
    phaseTicks: number
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
        this.phase = 'small'
        this.phaseTicks = this.growth.ticks
    }

    private get growth(): NonNullable<NonNullable<PlantDefinition['producer']>['growth']> { return this.producer.growth! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, ...rest } = fields
        this.phase = oneOf(phase, SUN_SHROOM_PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string {
        return this.phase
    }

    protected holdsProduction(): boolean {
        return this.phase === 'growing'
    }

    protected producedItem(): string {
        return this.phase === 'small' ? this.growth.smallItem : super.producedItem()
    }

    act({ world }: SystemContext, entity: EntityId): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        const random = world.resources.get(RandomResource)
        if (this.phase === 'small') {
            // Plant::UpdateSunShroom: anim_grow, then the big sun-shroom.
            if (this.phaseTicks > 0) return
            this.phase = 'growing'
            this.phaseTicks = this.growth.growingTicks
            this.playPhase(this.phase, random)
            emitServerEvent(world.resources.get(EventQueueResource), 'plantGrew', { entityId: entity, typeId: this.typeId })
        } else if (this.phase === 'growing' && this.phaseTicks === 0) {
            this.phase = 'big'
            this.playPhase(this.phase, random)
        }
    }

    protected snapshotOwn(tick?: number): JsonObject {
        return { ...super.snapshotOwn(tick), phase: this.phase }
    }
}
