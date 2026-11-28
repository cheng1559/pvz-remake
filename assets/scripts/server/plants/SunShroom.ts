import type { SystemContext } from '@/server/state/World'
import type { AnimationRandom } from '@/shared/content/animation'
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

    /**
     * Plant::SetSleeping's anim_sleep is the small one's. Grown, it sleeps big (`bigsleep`, anim_bigsleep, which the
     * original draws off the board only: no board of its turns to day). One growing as it falls asleep is grown at once.
     */
    setSleeping(asleep: boolean, random: AnimationRandom): void {
        if (asleep && this.phase === 'growing') {
            this.phase = 'big'
            this.phaseTicks = 0
        }
        super.setSleeping(asleep, random)
        if (asleep && this.phase === 'big' && this.animations?.body) this.animations.body.clip = 'bigsleep'
    }

    protected holdsProduction(): boolean {
        return this.phase === 'growing'
    }

    protected producedItem(): string {
        return this.phase === 'small' ? this.growth.smallItem : super.producedItem()
    }

    act({ world }: SystemContext): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        const random = world.resources.get(RandomResource)
        if (this.phase === 'small') {
            // Plant::UpdateSunShroom: anim_grow, then the big sun-shroom.
            if (this.phaseTicks > 0) return
            this.phase = 'growing'
            this.phaseTicks = this.growth.growingTicks
            this.playPhase(this.phase, random)
            emitServerEvent(world.resources.get(EventQueueResource), 'plantGrew', { entityId: this.id, typeId: this.typeId })
        } else if (this.phase === 'growing' && this.phaseTicks === 0) {
            this.phase = 'big'
            this.playPhase(this.phase, random)
        }
    }

    protected snapshotOwn(tick?: number): JsonObject {
        return { ...super.snapshotOwn(tick), phase: this.phase }
    }
}
