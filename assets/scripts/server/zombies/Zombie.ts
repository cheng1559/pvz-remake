import { defineResource, type EntityId, type SystemContext, type World } from '@/ecs/index'
import { type AnimationClip, type GameplayDefinitions, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, type LayerState, pacedLayers } from '@/shared/content/animation'
import type { ZombieState } from '@/shared/content/zombieStates'
import { jsonRoundTrip, type JsonObject, type Team, type ZombieSnapshot } from '@/shared/protocol'
import type { Position } from '../state/components'
import { pickWalkClip, startWalk, zombiePace } from './animation'

/** What any zombie is: the fields of every zombie, which its save and its snapshot have; its kind's own go beside them. */
export interface ZombieFields {
    typeId: string
    health: number
    maxHealth: number
    state: ZombieState
    /** Walking speed; while vaulting, the horizontal jump speed. */
    speedPerTick: number
    biteTicks: number
    /** Also counts down a burned zombie. */
    deathTicksRemaining: number
    /** The clip it walks on, drawn as it comes (`walk` or `walk2`). */
    walkClip: string
    /**
     * What its body plays now (ZombieDefinition.animation), its one layer; see zombies/animation.ts. The rates are
     * those of an unchilled zombie: a chilled one's animation goes at half of them (zombiePace).
     */
    animations: Record<string, LayerState>
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    /** Zombie::mDroppedLoot: the one loot roll has happened. */
    droppedLoot?: true
    groanCounter: number
    /** Zombie::mHelmHealth and mShieldHealth; 0 once dropped or without one. */
    helmHealth: number
    shieldHealth: number
    chilledTicks: number
    /**
     * Zombie::mIceTrapCounter: ticks left frozen by a hostile ice-shroom (see combat/freeze.ts), standing still in its
     * block of ice; absent when not frozen.
     */
    frozenTicks?: number
    /** Grave emergence progress. */
    riseTicks: number
    /**
     * Zombie::IsMovingAtChilledSpeed without its own chill: it goes at a chilled one's pace (zombiePace), not tinted (a
     * dancer whose troupe has one chilled). Its kind sets it as the zombies' tick starts.
     */
    slowed?: true
    /** Its side when not the zombies': `plants` when mind-controlled or put down on that side (see teams.ts). */
    team?: Team
    /**
     * Zombie::mMindControlled: brought over to a plant's side by a plant that mind-controls (the hypno-shroom), which
     * tints it; one put down on the plants' side is not.
     */
    mindControlled?: true
    /** A Mod's behavior's state (ZombieBehavior). */
    behaviorState?: JsonObject
}

/** Every zombie's fields by name, those a zombie may be without last: what else its save has is its kind's own. */
export const ZOMBIE_FIELDS = [
    'typeId', 'health', 'maxHealth', 'state', 'speedPerTick', 'biteTicks', 'deathTicksRemaining', 'walkClip', 'animations', 'hasHead',
    'hasTongue', 'hasArm', 'groanCounter', 'helmHealth', 'shieldHealth', 'chilledTicks', 'riseTicks',
    'droppedLoot', 'frozenTicks', 'slowed', 'team', 'mindControlled', 'behaviorState',
] as const satisfies readonly (keyof ZombieFields)[]

/** A zombie as its save has it: every zombie's fields, and its kind's own beside them (Zombie.restore). */
export type SavedZombie = ZombieFields & { readonly [own: string]: unknown }

/** The plant a zombie's attack reaches on its row, a rolling nut by `rollingAttack` (ZombieSystem's findPlantTarget). */
export type PlantFinder = (attack: { x: number, width: number }, rollingAttack?: { x: number, width: number }) =>
    { entity: EntityId, position: Position, rolling: boolean } | undefined

/** A type's own definition fields, each taken by the kinds that say so (`config`): a pole vaulter's `vault`, ... */
export type ZombieConfig = 'vault' | 'dance' | 'enrage'

/** Each zombie's type, which its save does not keep: it is its type's again as it is restored. */
const TYPES = new WeakMap<Zombie, { definition: ZombieDefinition, definitions: GameplayDefinitions }>()

export interface Zombie extends ZombieFields {}

/**
 * A zombie on the lawn, the zombie component itself: its fields are all there is to it, which its save keeps as they
 * are and its snapshot shows. Its class is its kind (the gameplay definition's `kind`, `zombie` when it names none),
 * as its view's is on the client (the presentation's `view`): what any zombie does, which a kind that does something of
 * its own overrides (PoleVaulter, Dancer, Newspaper), keeping what only it has in fields of its own. The game asks it
 * what only its kind knows, knowing no kind: how it comes on and sets off walking, what it does each tick of its own,
 * whether it eats, what plants can do to it, how it walks into the house, what it saves and shows. A field is saved as
 * it is, so it holds plain data alone (another zombie by its entity ID). A Mod's kind extends one of these.
 */
export class Zombie {
    /** The definition fields its kind takes: a type of it has them all, and none another kind takes. */
    static readonly config: readonly ZombieConfig[] = []

    /** What else its kind needs of a type's definition, checked as the content loads (the flag zombie's flag layer). */
    static validate(_definition: ZombieDefinition, _id: string): void {}

    /** A zombie of `typeId` as it comes on, whole and walking, before it is set off (spawnZombie) or restored (restore). */
    constructor(typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions) {
        TYPES.set(this, { definition, definitions })
        this.typeId = typeId
        this.health = this.maxHealth = definition.maxHealth
        this.state = 'walking'
        this.speedPerTick = 0
        this.biteTicks = 0
        this.deathTicksRemaining = 0
        this.walkClip = ZOMBIE_CLIPS.walk
        this.animations = {}
        this.hasHead = true
        this.hasTongue = false
        this.hasArm = true
        this.groanCounter = 0
        this.helmHealth = definition.helm?.health ?? 0
        this.shieldHealth = definition.shield?.health ?? 0
        this.chilledTicks = 0
        this.riseTicks = 0
    }

    /** Its type's gameplay definition. */
    protected get definition(): ZombieDefinition { return TYPES.get(this)!.definition }

    /** Every type's, for one it calls up (a leader's troupe). */
    protected get definitions(): GameplayDefinitions { return TYPES.get(this)!.definitions }

    /**
     * Its fields from its save: every zombie's, then its kind's own (restoreOwn), each kind taking those it has and
     * leaving none it does not.
     */
    restore(saved: SavedZombie, name: string): void {
        const fields: readonly string[] = ZOMBIE_FIELDS, own: Record<string, unknown> = {}
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

    /** Zombie::ZombieInitialize, once it has set off walking as it comes on: a dancer's dance. */
    start(_random: AnimationRandom): void {}

    /** Zombie::PickRandomSpeed's range as it sets off walking: its own walk's. */
    protected speedRange(): { min: number, max: number } {
        return this.definition.speedPerTick
    }

    /** Zombie::PickRandomSpeed, which StartWalkAnim calls each time it sets off walking. */
    pickSpeed(random: AnimationRandom): number {
        const speed = this.speedRange()
        return speed.min + random.nextFloat() * (speed.max - speed.min)
    }

    /** Zombie::StartWalkAnim's `Rand(2)`: it takes which of its walks it goes on anew as it sets off. */
    protected picksWalk(): boolean {
        return true
    }

    /** The clip it sets off on: the walk it took (`walkClip`). */
    setOffClip(): string {
        return this.walkClip
    }

    /**
     * Zombie::StartWalkAnim, as it sets off walking again (after eating, after a vault, out of a gasp): its speed picked
     * again, then which of its walks it takes (picksWalk), then off on its clip (setOffClip).
     */
    walkAgain(random: AnimationRandom): void {
        this.speedPerTick = this.pickSpeed(random)
        if (this.picksWalk()) this.walkClip = pickWalkClip(this.definition, random)
        startWalk(this, this.definition, this.setOffClip(), random)
    }

    /** As the zombies' tick starts, before any of them acts (a dancer's troupe's pace). */
    beforeTick(_world: World, _entity: EntityId): void {}

    /** Zombie::Update's counters, each tick it is on the lawn whatever it does (a dancer's age). */
    count(): void {}

    /** A tick it spends on its own before it would act, true if it did (the newspaper zombie's gasp). */
    pauses(_context: SystemContext, _entity: EntityId): boolean {
        return false
    }

    /**
     * Zombie::UpdateActions: what it does of its own each tick it acts, true if it took the tick so, neither walking nor
     * eating (a pole vaulter's vault); `plants` finds the plant an attack reaches on its row.
     */
    act(_context: SystemContext, _entity: EntityId, _plants: PlantFinder): boolean {
        return false
    }

    /** Zombie::CheckIfPreyCaught: it looks for something to eat: with its head on, or going on eating without it. */
    eats(): boolean {
        return this.hasHead || this.state === 'eating'
    }

    /** Zombie::GetZombieAttackRect: what it eats with, facing left. */
    attackRect(): ZombieDefinition['attack'] {
        return this.definition.attack
    }

    /** Zombie::EatPlant: a plant in its way it does not bite, true if so (a leader's moonwalk ends there). */
    passesPlant(): boolean {
        return false
    }

    /** Zombie::StopEating: it walks on (StartWalkAnim). */
    stopEating(random: AnimationRandom): void {
        this.walkAgain(random)
    }

    /** Zombie::ZombieNotWalking: it walks this tick; otherwise it stands, its body going on. */
    walks(_world: World, _entity: EntityId): boolean {
        return true
    }

    /**
     * Zombie::ApplyAnimRate: its body goes at a chilled one's pace (zombiePace) while it is chilled, or `slowed` by its
     * kind; a kind whose clip UpdateAnimSpeed sets no rate for goes on at its own (a dancer's moonwalk).
     */
    chillSlows(): boolean {
        return this.chilledTicks > 0 || this.slowed === true
    }

    /** Zombie::DropFlag and the like: it lets go of what it carries, as it loses its head, falls or is mowed (a flag). */
    dropCarried(_world: World, _entity: EntityId): void {}

    /** Zombie::WalkIntoHouse: as it wins, how it walks into the house. */
    intoHouse(_random: AnimationRandom): void {}

    /** Its shield is gone (Zombie::UpdateZombieNewspaper's paper). */
    shieldDropped(_random: AnimationRandom): void {}

    /** Zombie::StartMindControlled: it has come over to a plant's side (mindControl). */
    changedSides(_world: World, _entity: EntityId): void {}

    /** Plant::UpdateChomper's doMiss: a chomper's bite misses it now. */
    dodgesBite(): boolean {
        return false
    }

    /** Plant::FindTargetZombie: a plant's targeting known as `key` (PlantTargeting.insetKey) passes it over now. */
    evades(_key: string): boolean {
        return false
    }

    /** What the client is shown of it, beside its entity and its place, with what only its kind shows (snapshotOwn). */
    snapshot(): Omit<ZombieSnapshot, 'entityId' | 'x' | 'y' | 'row'> {
        const own = this.snapshotOwn()
        return {
            typeId: this.typeId,
            state: this.state,
            health: this.health,
            maxHealth: this.maxHealth,
            // The rates a view plays them at: a chilled zombie's body's is halved, a frozen one's stopped.
            animations: pacedLayers(this.animations, layer => zombiePace(this, layer)),
            alpha: this.state === 'dying' ? Math.min(255, Math.trunc(255 * this.deathTicksRemaining / 10)) : 255,
            hasHead: this.hasHead,
            hasTongue: this.hasTongue,
            hasArm: this.hasArm,
            helmHealth: this.helmHealth,
            shieldHealth: this.shieldHealth,
            chilled: this.chilledTicks > 0,
            ...(this.frozenTicks !== undefined ? { frozen: true as const } : {}),
            ...(this.team === 'plants' ? { team: 'plants' as const } : {}),
            ...(this.mindControlled ? { mindControlled: true as const } : {}),
            ...(this.riseTicks ? { riseTicks: this.riseTicks } : {}),
            ...(this.behaviorState ? { behaviorState: jsonRoundTrip(this.behaviorState) } : {}),
            ...(own ? { own } : {}),
        }
    }

    /** What only its kind shows its view (ZombieSnapshot.own), none when nothing: a pole vaulter's pole, ... */
    protected snapshotOwn(): JsonObject | undefined {
        return undefined
    }

    /**
     * Whether the level can run it as it was saved, `body` the clip its body is on: none is in the air, and one walking
     * walks on a clip with ground.
     */
    validSaved(body: AnimationClip): boolean {
        return this.state !== 'airborne' && (this.state !== 'walking' || body.ground !== undefined)
    }
}

/** How a level's world makes its zombies (ZombieRegistry.factory): each of its type's kind. */
export class ZombieFactory {
    constructor(private readonly make: (typeId: string) => Zombie) {}

    /** A zombie of `typeId` as it comes on, before it is set off (spawnZombie). */
    create(typeId: string): Zombie {
        return this.make(typeId)
    }

    /** A zombie as it was saved, of its kind (`name` names it in errors). */
    restore(saved: SavedZombie, name: string): Zombie {
        const zombie = this.make(saved.typeId)
        zombie.restore(saved, name)
        return zombie
    }
}

export const ZombieFactoryResource = defineResource<ZombieFactory>('pvz:zombie-factory')
