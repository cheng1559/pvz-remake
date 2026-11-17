import type { EntityId, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { graveAt } from '@/shared/content/graves'
import { plantTeam } from '@/shared/content/teams'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { gridItems } from '../gridItems/gridItems'
import { dropGraveLoot } from '../level/loot'
import type { DeterministicRng } from '../state/DeterministicRng'
import { RandomResource } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { Plant, type PlantConfig } from './Plant'

const PHASES = ['landing', 'eating'] as const
type BusterPhase = typeof PHASES[number]

export interface GraveBuster {
    /** Plant::mState of the buster. */
    phase: BusterPhase
    /** The ticks left of its phase. */
    phaseTicks: number
}

/**
 * The grave buster (the definition's `graveBuster`, Plant::UpdateGraveBuster): it lands on its grave (its landing clip
 * once at its body's random 10-15 fps, `landTicks`), eats it for `eatTicks`, and is gone with it, paying the player
 * the grave's loot. Its snapshot shows how long it has left eating, which its view sinks it by and the grave's is
 * eaten by.
 */
export class GraveBuster extends Plant {
    static readonly config: readonly PlantConfig[] = ['graveBuster']

    /** One comes landing. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.phase = 'landing'
        this.phaseTicks = 0
    }

    private get buster(): NonNullable<PlantDefinition['graveBuster']> { return this.definition.graveBuster! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, ...rest } = fields
        this.phase = oneOf(phase, PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        super.restoreOwn(rest, name)
    }

    /** It lands for its `landTicks`. */
    start(random: DeterministicRng, tick: number): void {
        super.start(random, tick)
        const land = this.buster.landTicks
        this.phaseTicks = random.integer(land.min, land.max)
    }

    animationPhase(): string {
        return this.phase
    }

    /** Its landing clip lasts as long as it lands. */
    fitTicks(): number {
        return this.phaseTicks
    }

    act({ world, commands }: SystemContext, entity: EntityId): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        if (this.phase === 'landing') {
            if (this.phaseTicks > 0) return
            this.phase = 'eating'
            this.phaseTicks = this.buster.eatTicks
            this.playPhase(this.phase, world.resources.get(RandomResource))
            return
        }
        // Plant::UpdateGraveBuster: the grave and the buster disappear together.
        if (this.phaseTicks > 0) return
        const position = this.position
        const grave = graveAt(gridItems(world), position.row, this.column), ate = grave !== undefined
        if (grave) world.destroyEntity(grave.entityId)
        commands.destroyEntity(entity)
        // The buster as it stood, for its draw order (Plant::CalcRenderOrder); `team`: a buster of the zombies' side,
        // facing left, whose dirt turns round with it.
        emitServerEvent(world.resources.get(EventQueueResource), 'graveBusted', {
            entityId: entity, typeId: this.typeId, row: position.row, column: this.column, x: position.x, y: position.y,
            ...(plantTeam(this) === 'zombies' ? { team: 'zombies' } : {}),
        })
        // The original drops its loot piece even without a grave, which planting never allows but `/plant` does; here
        // only a grave eaten by the plants' side pays the player.
        if (ate && plantTeam(this) === 'plants') dropGraveLoot(world, this.definitions, position.x, position.y)
    }

    protected snapshotOwn(): JsonObject {
        return { phase: this.phase, ticks: this.phaseTicks }
    }
}
