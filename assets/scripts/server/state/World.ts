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

export interface EntityAllocatorSnapshot {
    nextEntity: EntityId
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
 * The world's entities of one type, each an object with its id: iterated in id order. An iteration keeps the ones
 * there as it started: one removed meanwhile (or on its way out, World.markDestroy) is passed over, one added
 * meanwhile waits for the next.
 */
export class EntityList<T extends Entity> implements Iterable<T> {
    private readonly values = new Map<EntityId, T>()
    private ordered: T[] | undefined

    constructor(private readonly world: World) {}

    /** The one of `id`, unless it is gone or on its way out. */
    get(id: EntityId): T | undefined {
        return this.world.leaving(id) ? undefined : this.values.get(id)
    }

    has(id: EntityId): boolean {
        return this.get(id) !== undefined
    }

    /**
     * Every system goes through its lists every tick: an iterator written out, which costs less than a generator, and
     * which looks an entity up only once the list has changed since the iteration began.
     */
    [Symbol.iterator](): Iterator<T> {
        const ordered = this.ordered ??= [...this.values.values()].sort((a, b) => a.id - b.id)
        const list = this, { values, world } = this
        let index = 0
        return {
            next(): IteratorResult<T> {
                while (index < ordered.length) {
                    const value = ordered[index++]
                    // Unchanged, the list still holds every one it had in order.
                    if ((list.ordered === ordered || values.get(value.id) === value) && !world.leaving(value.id)) return { done: false, value }
                }
                return { done: true, value: undefined }
            },
        }
    }

    /** World.insert and CommandBuffer.insert put one in; World.destroyEntity takes it out. */
    set(value: T): void {
        this.values.set(value.id, value)
        this.ordered = undefined
    }

    delete(id: EntityId): boolean {
        if (!this.values.delete(id)) return false
        this.ordered = undefined
        return true
    }

    /** Whether it holds `id`, even on its way out. */
    holds(id: EntityId): boolean {
        return this.values.has(id)
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
 * level's state (`resources`). Ids are never reused.
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

    private nextEntity = 1
    /** Those on their way out (markDestroy), which no list shows any more. */
    private readonly pendingDestroy = new Set<EntityId>()
    private readonly allLists: readonly EntityList<Entity>[] = [this.items, this.gridItems, this.plants, this.projectiles, this.mowers, this.zombies]

    /** Every list of the world. */
    lists(): readonly EntityList<Entity>[] {
        return this.allLists
    }

    /** A new entity's id, for the object it will be in its list (insert). */
    createEntity(): EntityId {
        return this.nextEntity++
    }

    snapshotEntityAllocator(): EntityAllocatorSnapshot {
        return { nextEntity: this.nextEntity }
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
        if (this.leaving(entity)) return false
        // A loop, not `some`: it runs for many entities every tick, and makes nothing.
        const lists = this.allLists
        for (let i = 0; i < lists.length; i++) if (lists[i].holds(entity)) return true
        return false
    }

    /** It is on its way out: no list shows it from now on, and the command buffer takes it out as it is flushed. */
    markDestroy(entity: EntityId): void {
        if (this.hasEntity(entity)) this.pendingDestroy.add(entity)
    }

    /** Whether it is on its way out (markDestroy). */
    leaving(entity: EntityId): boolean {
        return this.pendingDestroy.size > 0 && this.pendingDestroy.has(entity)
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
