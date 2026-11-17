import type { EntityId, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { RandomResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { destroyZombie } from '../zombies/damage'
import { mindControl } from '../zombies/mindControl'
import { destroyEatenPlant } from './damage'
import { Plant, type PlantConfig } from './Plant'
import { findAbilityTarget } from './targeting'
import { plantInPlay } from '../level/lawn'

const PHASES = ['ready', 'biting', 'got-one', 'missed', 'digesting', 'swallowing'] as const
type ChomperPhase = typeof PHASES[number]

export interface Chomper {
    /** Plant::mState of the chomper. */
    phase: ChomperPhase
    /** The ticks left of its phase. */
    phaseTicks: number
    /** Chewing a plant rather than a zombie, until it is ready again: its view hides the eaten zombie's arm. */
    prey?: 'plant'
}

/**
 * The chomper (the definition's `chomper`, Plant::UpdateChomper): ready, it bites what comes into its reach after
 * `biteDelayTicks`, swallowing a zombie (or a hostile plant) whole unless it slips away, then chews for `digestTicks`
 * and swallows; a missed bite goes back to ready.
 */
export class Chomper extends Plant {
    static readonly config: readonly PlantConfig[] = ['chomper']

    /** One comes ready. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.phase = 'ready'
        this.phaseTicks = 0
    }

    private get chomper(): NonNullable<PlantDefinition['chomper']> { return this.definition.chomper! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, prey, ...rest } = fields
        this.phase = oneOf(phase, PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        if (prey !== undefined) this.prey = oneOf(prey, ['plant'] as const, `${name}.prey`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string {
        return this.phase
    }

    act({ world, commands }: SystemContext, entity: EntityId): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        const definitions = this.definitions, chomper = this.chomper
        const random = world.resources.get(RandomResource), position = this.position
        const next = (phase: ChomperPhase, ticks: number) => {
            this.phase = phase
            this.phaseTicks = ticks
            if (phase === 'ready') delete this.prey
            this.playPhase(phase, random)
        }
        switch (this.phase) {
            case 'ready':
                if (findAbilityTarget(world, definitions, position, this, chomper) !== undefined) next('biting', chomper.biteDelayTicks)
                break
            case 'biting': {
                if (this.phaseTicks > 0) break
                const target = findAbilityTarget(world, definitions, position, this, chomper, true)
                // A zombie that dodges the bite slips away, as in Plant::UpdateChomper (its kind says so: a pole vaulter
                // holding its pole, not frozen). A hostile plant is swallowed whole, unless zombies could not hurt it
                // either (a lit cherry bomb, a rising or armed potato mine): it slips away.
                const zombie = target === undefined ? undefined : world.zombies.get(target)
                const prey = target === undefined || zombie ? undefined : plantInPlay(world, target)!
                const bit = target !== undefined && (zombie ? !zombie.dodgesBite() : !prey!.inedible(world))
                // An awake hypno-shroom bitten turns the plant to its side, as a zombie that chews one, and is gone; it
                // is not swallowed, so the bite goes on as one that missed, with nothing to chew.
                const turned = bit && !zombie && prey!.mindControls(world), ate = bit && !turned
                if (ate && zombie) destroyZombie(world, definitions, target!, commands)
                else if (turned) mindControl(world, definitions, entity, target!, commands)
                else if (ate) destroyEatenPlant(world, definitions, target!, commands)
                next(ate ? 'got-one' : 'missed', chomper.biteTicks - chomper.biteDelayTicks)
                // The client hides the eaten zombie's arm while it chews a plant.
                if (ate && !zombie) this.prey = 'plant'
                emitServerEvent(world.resources.get(EventQueueResource), 'chomperBit', {
                    entityId: entity, ate, ...(ate ? zombie ? { zombieId: target } : { plantId: target } : {}),
                })
                break
            }
            case 'got-one':
                if (this.phaseTicks === 0) next('digesting', chomper.digestTicks)
                break
            case 'digesting':
                if (this.phaseTicks === 0) next('swallowing', chomper.swallowTicks)
                break
            case 'missed':
            case 'swallowing':
                if (this.phaseTicks === 0) next('ready', 0)
                break
        }
    }

    protected snapshotOwn(): JsonObject {
        return { phase: this.phase, ...this.prey ? { prey: this.prey } : {} }
    }
}
