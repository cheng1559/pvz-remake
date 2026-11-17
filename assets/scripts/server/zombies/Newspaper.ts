import type { EntityId, SystemContext } from '@/ecs/index'
import { type AnimationClip, type GameplayDefinitions, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import type { AnimationRandom } from '@/shared/content/animation'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeFinite } from '@/shared/validate'
import { RandomResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { playZombie, stepZombie, zombiePace } from './animation'
import { countZombiesOnScreen } from './damage'
import { Zombie, type ZombieConfig } from './Zombie'

export interface Newspaper {
    /** PHASE_NEWSPAPER_MADDENING: the ticks left of its gasp once its paper is gone; 0 otherwise. */
    gaspTicks: number
}

/**
 * The newspaper zombie (the definition's `enrage`, Zombie::UpdateZombieNewspaper): losing its paper (its shield), it
 * gasps for `pauseTicks` (PHASE_NEWSPAPER_MADDENING), standing, then roars and walks on enraged (PHASE_NEWSPAPER_MAD),
 * at its enraged speed on its own walk, without taking another.
 */
export class Newspaper extends Zombie {
    static readonly config: readonly ZombieConfig[] = ['enrage']

    constructor(typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.gaspTicks = 0
    }

    private get enrage(): NonNullable<ZombieDefinition['enrage']> { return this.definition.enrage! }

    /** Its paper is gone. */
    get enraged(): boolean {
        return this.shieldHealth === 0
    }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { gaspTicks, ...rest } = fields
        this.gaspTicks = nonNegativeFinite(gaspTicks, `${name}.gaspTicks`)
        super.restoreOwn(rest, name)
    }

    protected speedRange(): { min: number, max: number } {
        return this.enraged ? this.enrage.speedPerTick : super.speedRange()
    }

    /** PHASE_NEWSPAPER_MAD: its walk is its own, without the `Rand(2)`. */
    protected picksWalk(): boolean {
        return !this.enraged
    }

    /** It gasps, its body going on, then walks on enraged and roars, with its head on and at most 10 zombies on screen. */
    pauses({ world }: SystemContext, entity: EntityId): boolean {
        if (!this.gaspTicks) return false
        const random = world.resources.get(RandomResource)
        stepZombie(this, this.definition.animation, random)
        this.gaspTicks = Math.max(0, this.gaspTicks - zombiePace(this))
        if (this.gaspTicks === 0) {
            this.walkAgain(random)
            emitServerEvent(world.resources.get(EventQueueResource), 'zombieEnraged', {
                entityId: entity, typeId: this.typeId, roar: this.hasHead && countZombiesOnScreen(world) <= 10,
            })
        }
        return true
    }

    /** Losing its paper enrages it: it gasps, standing, whatever it was doing. */
    shieldDropped(random: AnimationRandom): void {
        this.gaspTicks = this.enrage.pauseTicks
        this.state = 'walking'
        playZombie(this, this.definition.animation, ZOMBIE_CLIPS.gasp, random)
        this.biteTicks = 0
    }

    /** Its rage once its paper is gone: NewspaperView draws its enraged clips and head. */
    protected snapshotOwn(): JsonObject | undefined {
        return this.enraged ? { enraged: true } : undefined
    }

    /** It gasps standing, on a clip with no ground. */
    validSaved(body: AnimationClip): boolean {
        return this.state === 'walking' && this.gaspTicks > 0 || super.validSaved(body)
    }
}
