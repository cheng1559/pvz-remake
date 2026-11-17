import { defineResource, type EntityId, type SystemContext, type World } from '@/ecs/index'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, type LayerState, pacedLayers } from '@/shared/content/animation'
import { jsonRoundTrip, type JsonObject, type PlantSnapshot, type Team } from '@/shared/protocol'
import type { DeterministicRng } from '../state/DeterministicRng'
import { LevelStateResource } from '../state/components'
import { plantPhaseAnimation } from './animation'
import { plantPace } from './chill'
import { isPlantAsleep } from './sleep'

/** What any plant is: the fields of every plant, which its save and its snapshot have; its kind's own go beside them. */
export interface PlantFields {
    typeId: string
    /** The seed it came from. */
    seedId: string
    column: number
    health: number
    maxHealth: number
    /** Ticks since the last bite, from Plant::mRecentlyEatenCountdown; wall-nuts freeze while it runs. */
    recentlyEatenCounter: number
    /** Its side when not the plants' (see teams.ts). */
    team?: Team
    /** Brought over to the other side by swallowing a plant that mind-controls (see zombies/mindControl.ts), which tints it. */
    mindControlled?: true
    /** Ticks left slowed by a hostile snow pea (see plants/chill.ts); 0 when not chilled. */
    chilledTicks: number
    /** Ticks left frozen by a hostile ice-shroom, doing nothing (see combat/freeze.ts); absent when not frozen. */
    frozenTicks?: number
    /** What each layer of its animation plays now (PlantDefinition.animation); see plants/animation.ts. */
    animations?: Record<string, LayerState>
    /** Ticks to its next blink (Plant::mBlinkCountdown). */
    blinkTicks?: number
    /** A Mod's behavior's state (PlantBehavior). */
    behaviorState?: JsonObject
}

/** Every plant's fields by name, those a plant may be without last: what else its save has is its kind's own. */
export const PLANT_FIELDS = [
    'typeId', 'seedId', 'column', 'health', 'maxHealth', 'recentlyEatenCounter', 'chilledTicks',
    'team', 'mindControlled', 'frozenTicks', 'animations', 'blinkTicks', 'behaviorState',
] as const satisfies readonly (keyof PlantFields)[]

/** A plant as its save has it: every plant's fields, and its kind's own beside them (Plant.restore). */
export type SavedPlant = PlantFields & { readonly [own: string]: unknown }

/** A type's own definition fields, each taken by the kinds that say so (`config`): a shooter's `shooter`, ... */
export type PlantConfig = 'shooter' | 'fright' | 'producer' | 'fuse' | 'mine' | 'chomper' | 'graveBuster' | 'mindControl' | 'bowling'

/** Each plant's type, which its save does not keep: it is its type's again as it is restored. */
const TYPES = new WeakMap<Plant, { definition: PlantDefinition, definitions: GameplayDefinitions }>()

export interface Plant extends PlantFields {}

/**
 * A plant on the lawn, the plant component itself: its fields are all there is to it, which its save keeps as they are
 * and its snapshot shows. Its class is its kind (the gameplay definition's `kind`, `plant` when it names none), as its
 * view's is on the client (the presentation's `view`, the same): what any plant does, which a kind that does something
 * of its own overrides (Shooter, Producer, FusePlant, PotatoMine, Chomper, GraveBuster, ...), keeping what only it has in
 * fields of its own. The plant systems ask it what only its kind knows, knowing no kind, each at its time in the tick:
 * whether it shoots or produces, what it does of its own, how it rolls; and so do the zombies and the other plants:
 * whether it can be eaten or chilled, whether it mind-controls. A field is saved as it is, so it holds plain data alone.
 */
export class Plant {
    /** The definition fields its kind takes: a type of it has them all, and none another kind takes. */
    static readonly config: readonly PlantConfig[] = []

    /** What else its kind needs of a type's definition, checked as the content loads. */
    static validate(_definition: PlantDefinition, _id: string): void {}

    /** A plant of `typeId`, whole, before it is put down (planting.createPlant) or restored (restore). */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        TYPES.set(this, { definition, definitions })
        this.typeId = typeId
        this.seedId = typeId
        this.column = 0
        this.health = this.maxHealth = definition.maxHealth
        this.recentlyEatenCounter = 0
        this.chilledTicks = 0
    }

    /** Its type's gameplay definition. */
    protected get definition(): PlantDefinition { return TYPES.get(this)!.definition }

    /** Every type's. */
    protected get definitions(): GameplayDefinitions { return TYPES.get(this)!.definitions }

    /** Its fields from its save: every plant's, then its kind's own (restoreOwn), each kind taking those it has. */
    restore(saved: SavedPlant, name: string): void {
        const fields: readonly string[] = PLANT_FIELDS, own: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) continue
            if (fields.includes(key)) Object.assign(this, { [key]: jsonRoundTrip(value as JsonObject) })
            else own[key] = value
        }
        this.restoreOwn(own, name)
    }

    /** Its kind's own fields from its save: a kind takes its own and leaves the rest to the kind it extends. */
    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const [unknown] = Object.keys(fields)
        if (unknown !== undefined) throw new TypeError(`${name}.${unknown} is not supported`)
    }

    /** Plant::PlantInitialize, as it is put down at `tick`, before its animation starts: what its kind starts it on. */
    start(_random: DeterministicRng, _tick: number): void {}

    /** Asleep: a nocturnal plant on a board not at night (Plant::mIsAsleep), doing nothing. */
    asleep(world: World): boolean {
        return isPlantAsleep(this.definition, world.resources.get(LevelStateResource).board)
    }

    /** A tick it sits out, chilled or frozen (plants/chill.ts): what it counts to waits a tick (a shooter's next shot). */
    sitOut(): void {}

    /** Plant::UpdateShooter, in the plants' attacks (plants/shooter.ts): it shoots. */
    attack(_context: SystemContext, _entity: EntityId): void {}

    /** Plant::UpdateProductionPlant (plants/production.ts): it produces; `stopped` while none does (the award dropped). */
    produce(_context: SystemContext, _entity: EntityId, _stopped: boolean): void {}

    /** Plant::UpdateAbilities (plants/abilities.ts), awake and neither chilled nor frozen this tick: what it does of its own. */
    act(_context: SystemContext, _entity: EntityId): void {}

    /** Plant::UpdateBowling (plants/rolls.ts): it rolls, also once the level is won. */
    roll(_context: SystemContext, _entity: EntityId): void {}

    /** The phase of its kind its animation goes by (its definition's `animation.phases`, `blink.phases`; PLANT_KIND_PHASES), if any. */
    animationPhase(): string | undefined {
        return undefined
    }

    /** Plant::DoBlink: it misses a blink now, in a phase it does not blink in (a potato mine not armed). */
    blinkMisses(): boolean {
        const phases = this.definition.animation?.blink?.phases, phase = this.animationPhase()
        return !!phases && (phase === undefined || !phases.includes(phase))
    }

    /** Plant::PlantInitialize, once its layers have started (startPlantAnimations), `asleep` or not. */
    animationStarted(_asleep: boolean, _random: AnimationRandom): void {}

    /** It came to a phase of its kind: its layers play that phase's clips (Plant::PlayBodyReanim as mState changes). */
    protected playPhase(phase: string, random: AnimationRandom): void {
        plantPhaseAnimation(this, this.definition, phase, random)
    }

    /** Zombie::EatPlant: zombies chew it without hurting it now (a lit cherry bomb, a risen potato mine). */
    inedible(_world: World): boolean {
        return false
    }

    /** It mind-controls what eats it now (the hypno-shroom awake): its eater comes over to its side (mindControl). */
    mindControls(_world: World): boolean {
        return false
    }

    /** Kept from the cold now (its definition's `unchillable`): no chill reaches it, so no ice either (combat/cold.ts). */
    keptFromCold(): boolean {
        return this.definition.unchillable === true
    }

    /** Kept from an ice-shroom's ice now (its definition's `unfreezable`): it is only chilled (combat/cold.ts). */
    keptFromIce(): boolean {
        return this.definition.unfreezable === true
    }

    /**
     * What the client is shown of it, beside its entity and its place, with what only its kind shows (snapshotOwn);
     * `tick`, the gameplay tick, for one on the lawn (none for one a mower squashed).
     */
    snapshot(asleep: boolean, tick?: number): Omit<PlantSnapshot, 'entityId' | 'x' | 'y' | 'row'> {
        const own = this.snapshotOwn(tick)
        return {
            typeId: this.typeId,
            column: this.column,
            health: this.health,
            maxHealth: this.maxHealth,
            ...(asleep ? { asleep: true as const } : {}),
            ...(this.team === undefined ? {} : { team: this.team }),
            ...(this.mindControlled ? { mindControlled: true as const } : {}),
            ...(this.chilledTicks ? { chilledTicks: this.chilledTicks } : {}),
            ...(this.frozenTicks !== undefined ? { frozen: true as const } : {}),
            ...(this.animations ? { animations: pacedLayers(this.animations, () => plantPace(this)) } : {}),
            ...(this.behaviorState ? { behaviorState: jsonRoundTrip(this.behaviorState) } : {}),
            ...(own ? { own } : {}),
        }
    }

    /** What only its kind shows its view (PlantSnapshot.own), none when nothing. */
    protected snapshotOwn(_tick?: number): JsonObject | undefined {
        return undefined
    }

    /** Whether the level can run it as it was saved. */
    validSaved(): boolean {
        return true
    }
}

/** How a level's world makes its plants (PlantRegistry.factory): each of its type's kind. */
export class PlantFactory {
    constructor(private readonly make: (typeId: string) => Plant) {}

    /** A plant of `typeId`, before it is put down (planting.createPlant). */
    create(typeId: string): Plant {
        return this.make(typeId)
    }

    /** A plant as it was saved, of its kind (`name` names it in errors). */
    restore(saved: SavedPlant, name: string): Plant {
        const plant = this.make(saved.typeId)
        plant.restore(saved, name)
        return plant
    }
}

export const PlantFactoryResource = defineResource<PlantFactory>('pvz:plant-factory')
