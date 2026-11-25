import type { JsonObject } from '@/shared/protocol'
import type { GridItem } from '../gridItems/gridItems'
import type { Item } from '../items/items'
import type { Projectile } from '../projectiles/Projectile'
import type { Mower } from '../mowers/Mower'
import type { Plant } from '../plants/Plant'
import type { Zombie } from '../zombies/Zombie'

export type EntityId = number

export interface Position {
    x: number
    y: number
    row: number
}

/** Removes entities; systems pass their command buffer so queries stay consistent. */
export interface EntityRemover { destroyEntity(entity: number): unknown }

/** The world's lists, each a DataArray of the original (Board::mCoins, mGridItems, mPlants, mProjectiles, mLawnMowers, mZombies). */
export const ENTITY_LISTS = ['items', 'gridItems', 'plants', 'projectiles', 'mowers', 'zombies'] as const
export type EntityListKey = typeof ENTITY_LISTS[number]

export interface EntityAllocatorSnapshot {
    nextEntity: EntityId
    /** Each list's slots (EntityList). */
    slots: Record<EntityListKey, EntitySlotsSnapshot>
}

export interface Resource<T> {
    readonly name: string
    readonly __value?: T
}

const qualifiedNamePattern = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/

export function assertQualifiedName(name: string): void {
    if (!qualifiedNamePattern.test(name)) {
        throw new Error(`Invalid qualified name: ${name}`)
    }
}

export function defineResource<T>(name: string): Resource<T> {
    assertQualifiedName(name)
    return Object.freeze({ name }) as Resource<T>
}

/**
 * What a typed list holds: an object that is its entity, by its id, with what Mods keep on it (`extensions`, by
 * their registered ids: EntityExtensions), saved and sent with it.
 */
export interface Entity {
    id: EntityId
    extensions?: Record<string, JsonObject>
}

/**
 * A list's slots as a save keeps them (EntityList): the entity in each slot or `null` for one no entity holds, the
 * free slots as a stack (the next to be taken last), those freed this tick, free as the next starts, and those
 * reserved (EntityList.reserve).
 */
export interface EntitySlotsSnapshot {
    slots: Array<EntityId | null>
    free: number[]
    freeing: number[]
    reserved: number[]
}

/**
 * The world's entities of one type, each an object with its id, in slots as the original's DataArray holds them
 * (mPlants, mZombies and the others): one put in takes the slot freed last, or a new one after the rest; one taken out
 * leaves its slot until the next tick starts (Board::ProcessDeleteQueue, World.freeSlots), which frees them in slot
 * order, so of those the highest is taken first. The list is iterated in slot order, as the original goes over its
 * arrays, and what looks for one takes the first it meets: what a zombie bites first, which zombie a plant aims at of
 * two alike, who acts first in a tick. An iteration keeps the ones there as it started: one removed meanwhile (or on
 * its way out, World.markDestroy) is passed over, one added meanwhile waits for the next.
 */
export class EntityList<T extends Entity> implements Iterable<T> {
    /** The slots (DataArray::mBlock), each holding one or none (free, freeing or reserved); as many as have been taken (mMaxUsedCount). */
    private slots: Array<T | undefined> = []
    /** Each one's slot, by its id. */
    private readonly slotOf = new Map<EntityId, number>()
    /** The free slots, the one taken next last (DataArray::mFreeListHead's list). */
    private free: number[] = []
    /** The slots of those taken out this tick, which freeSlots frees. */
    private freeing: number[] = []
    /** The slots taken by what the world does not keep (reserve). */
    private reserved: number[] = []
    /** The slots as the last iteration found them, until one is put in or taken out. */
    private iterated: Array<T | undefined> | undefined

    constructor(private readonly world: World) {}

    /** The one of `id`, unless it is gone or on its way out. */
    get(id: EntityId): T | undefined {
        const slot = this.slotOf.get(id)
        return slot === undefined || this.world.leaving(id) ? undefined : this.slots[slot]
    }

    has(id: EntityId): boolean {
        return this.get(id) !== undefined
    }

    *[Symbol.iterator](): Iterator<T> {
        for (const value of this.iterated ??= this.slots.slice()) if (value && this.get(value.id) === value) yield value
    }

    /** World.insert and CommandBuffer.insert put one in, a new one in a slot (DataArray::DataArrayAlloc); World.destroyEntity takes it out. */
    set(value: T): void {
        let slot = this.slotOf.get(value.id)
        if (slot === undefined) this.slotOf.set(value.id, slot = this.free.pop() ?? this.slots.length)
        this.slots[slot] = value
        this.iterated = undefined
    }

    delete(id: EntityId): boolean {
        const slot = this.slotOf.get(id)
        if (slot === undefined) return false
        this.slotOf.delete(id)
        this.slots[slot] = undefined
        this.freeing.push(slot)
        this.iterated = undefined
        return true
    }

    /** Board::ProcessDeleteQueue: the slots of those taken out are free, freed in slot order (the highest taken next). */
    freeSlots(): void {
        if (!this.freeing.length) return
        this.free.push(...this.freeing.sort((a, b) => a - b))
        this.freeing = []
    }

    /**
     * `count` slots are taken, as by ones put in, for what the original keeps in its list and the world does not: the
     * street's zombies of the intro (CutScene::PlaceStreetZombies), which only the client draws.
     */
    reserve(count: number): void {
        for (let i = 0; i < count; i++) {
            const slot = this.free.pop() ?? this.slots.length
            this.slots[slot] = undefined
            this.reserved.push(slot)
        }
    }

    /** What the slots were reserved for is gone (Board::RemoveCutsceneZombies): they are freed as the next tick starts. */
    release(): void {
        this.freeing.push(...this.reserved)
        this.reserved = []
    }

    snapshotSlots(): EntitySlotsSnapshot {
        return { slots: this.slots.map(value => value?.id ?? null), free: [...this.free], freeing: [...this.freeing], reserved: [...this.reserved] }
    }

    /**
     * A restored list's slots, its entities in it already: each in its saved slot, the others as they were. A save
     * edited by hand may lack some of its entities, whose slots are freed as the next tick starts, as if taken out, or
     * have others, which take theirs as one put in does.
     */
    restoreSlots({ slots, free, freeing, reserved }: EntitySlotsSnapshot): void {
        const listed = new Map<EntityId, T>()
        for (const value of this.slots) if (value) listed.set(value.id, value)
        const ids = slots.filter((id): id is EntityId => id !== null)
        if (new Set(ids).size !== ids.length) throw new Error('Entity slots must hold each entity once')
        const restored = slots.map(id => id === null ? undefined : listed.get(id))
        const gone = slots.flatMap((id, slot) => id !== null && !restored[slot] ? [slot] : [])
        const released = [...free, ...freeing, ...reserved, ...gone], empty = restored.filter(value => !value).length
        if (released.length !== empty || new Set(released).size !== empty || released.some(slot => !(slot in restored) || restored[slot])) {
            throw new Error('Entity slots must each be held, reserved, free or freeing once')
        }
        this.slots = restored
        this.slotOf.clear()
        restored.forEach((value, slot) => { if (value) this.slotOf.set(value.id, slot) })
        this.free = [...free]
        this.freeing = [...freeing, ...gone]
        this.reserved = [...reserved]
        for (const value of listed.values()) if (!this.slotOf.has(value.id)) this.set(value)
        this.iterated = undefined
    }

    /** Whether it holds `id`, even on its way out. */
    holds(id: EntityId): boolean {
        return this.slotOf.has(id)
    }
}

export class ResourceStore {
    private readonly values = new Map<string, { token: Resource<unknown>, value: unknown }>()

    set<T>(resource: Resource<T>, value: T): void {
        const existing = this.values.get(resource.name)
        if (existing && existing.token !== resource) {
            throw new Error(`Duplicate resource name: ${resource.name}`)
        }
        this.values.set(resource.name, { token: resource, value })
    }

    has<T>(resource: Resource<T>): boolean {
        return this.values.get(resource.name)?.token === resource
    }

    get<T>(resource: Resource<T>): T {
        const entry = this.values.get(resource.name)
        if (!entry || entry.token !== resource) {
            throw new Error(`Missing resource: ${resource.name}`)
        }
        return entry.value as T
    }
}

/**
 * A level's world: what is on the board, each of its type's list (an entity is the object in it, by its id), and the
 * level's state (`resources`). Ids are never reused; a list's slots are (EntityList).
 */
export class World {
    readonly resources = new ResourceStore()
    /** The sun, coins and the level's award (Coin). */
    readonly items = new EntityList<Item>(this)
    /** The things of a cell: graves and craters (GridItem). */
    readonly gridItems = new EntityList<GridItem>(this)
    /** The plants, of their kinds (Plant), a mowed one too until it is squashed (Plant.state; lawn.plantsInPlay). */
    readonly plants = new EntityList<Plant>(this)
    /** What flies, of its kind (Projectile): a mower set off runs as one (MowingProjectile). */
    readonly projectiles = new EntityList<Projectile>(this)
    /** The rows' lawn mowers waiting at their house ends (Mower). */
    readonly mowers = new EntityList<Mower>(this)
    /** The zombies, each of its kind (Zombie). */
    readonly zombies = new EntityList<Zombie>(this)
    /** Its lists, in ENTITY_LISTS' order, made once: after them, which they are made of. */
    private readonly allLists: readonly EntityList<Entity>[] = ENTITY_LISTS.map(key => this[key] as EntityList<Entity>)

    private nextEntity = 1
    /** Those on their way out (markDestroy), which no list shows any more. */
    private readonly pendingDestroy = new Set<EntityId>()

    /** Every list of the world. */
    lists(): readonly EntityList<Entity>[] {
        return this.allLists
    }

    /** A new entity's id, for the object it will be in its list (insert). */
    createEntity(): EntityId {
        return this.nextEntity++
    }

    /** Board::ProcessDeleteQueue, as each tick starts: the slots of what was taken out are free (EntityList.freeSlots). */
    freeSlots(): void {
        for (const list of this.lists()) list.freeSlots()
    }

    snapshotEntityAllocator(): EntityAllocatorSnapshot {
        return {
            nextEntity: this.nextEntity,
            slots: Object.fromEntries(ENTITY_LISTS.map(key => [key, this[key].snapshotSlots()])) as Record<EntityListKey, EntitySlotsSnapshot>,
        }
    }

    restoreEntityAllocator(snapshot: EntityAllocatorSnapshot): void {
        const { nextEntity } = snapshot
        if (!Number.isSafeInteger(nextEntity) || nextEntity < 1) {
            throw new Error('Entity allocator nextEntity must be a positive safe integer')
        }
        if (this.nextEntity !== 1) {
            throw new Error('Entity allocator can only be restored before allocating entities')
        }
        if (this.lists().some(list => [...list].some(entity => entity.id >= nextEntity))) {
            throw new Error('Entity allocator nextEntity must exceed every active entity')
        }
        // Its entities restored, each list takes back its slots.
        for (const key of ENTITY_LISTS) this[key].restoreSlots(snapshot.slots[key])
        this.nextEntity = nextEntity
    }

    /** `value` goes into `list`, as the entity it is (its id, createEntity's). */
    insert<T extends Entity>(list: EntityList<T>, value: T): void {
        list.set(value)
    }

    /** It is gone from its list. */
    destroyEntity(entity: EntityId): boolean {
        this.pendingDestroy.delete(entity)
        let held = false
        for (const list of this.lists()) held = list.delete(entity) || held
        return held
    }

    hasEntity(entity: EntityId): boolean {
        return !this.leaving(entity) && this.lists().some(list => list.holds(entity))
    }

    /** It is on its way out: no list shows it from now on, and the command buffer takes it out as it is flushed. */
    markDestroy(entity: EntityId): void {
        if (this.hasEntity(entity)) this.pendingDestroy.add(entity)
    }

    /** Whether it is on its way out (markDestroy). */
    leaving(entity: EntityId): boolean {
        return this.pendingDestroy.has(entity)
    }
}

type Command =
    | { type: 'destroy', entity: EntityId }
    | { type: 'insert', list: EntityList<Entity>, value: Entity }

/** What a system does to the world's lists that waits for the end of its phase: a new entity put in, one taken out. */
export class CommandBuffer {
    private commands: Command[] = []

    constructor(private readonly world: World) {}

    createEntity(): EntityId {
        return this.world.createEntity()
    }

    destroyEntity(entity: EntityId): void {
        this.world.markDestroy(entity)
        this.commands.push({ type: 'destroy', entity })
    }

    /** World.insert, once the buffer is flushed. */
    insert<T extends Entity>(list: EntityList<T>, value: T): void {
        this.commands.push({ type: 'insert', list: list as unknown as EntityList<Entity>, value })
    }

    flush(): void {
        const commands = this.commands
        this.commands = []
        for (const command of commands) {
            if (command.type === 'destroy') this.world.destroyEntity(command.entity)
            else this.world.insert(command.list, command.value)
        }
    }
}

export interface GameSystem {
    readonly id: string
    run(context: SystemContext): void
}

export interface SystemContext {
    world: World
    commands: CommandBuffer
    tick: number
}

export const GAME_PHASES = [
    'command',
    'tutorial',
    'spawn',
    'plant',
    'zombie',
    'mower',
    'projectile',
    'item',
] as const

export type GamePhase = typeof GAME_PHASES[number]

export class Schedule {
    private readonly phases = new Map<GamePhase, GameSystem[]>()
    private readonly systemIds = new Set<string>()
    private frozen = false

    add(phase: GamePhase, system: GameSystem): void {
        if (this.frozen) throw new Error('Schedule is frozen')
        assertQualifiedName(system.id)
        if (this.systemIds.has(system.id)) {
            throw new Error(`Duplicate system id: ${system.id}`)
        }
        let systems = this.phases.get(phase)
        if (!systems) {
            systems = []
            this.phases.set(phase, systems)
        }
        systems.push(system)
        this.systemIds.add(system.id)
    }

    freeze(): void {
        this.frozen = true
    }

    run(world: World, tick = 0): void {
        this.freeze()
        for (const phase of GAME_PHASES) {
            const systems = this.phases.get(phase)
            if (!systems) continue
            const commands = new CommandBuffer(world)
            for (const system of systems) system.run({ world, commands, tick })
            commands.flush()
        }
    }
}
