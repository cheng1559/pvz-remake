export type EntityId = number

export interface EntityAllocatorSnapshot {
    nextEntity: EntityId
}

export interface Component<T> {
    readonly name: string
    readonly __value?: T
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

function namedToken<T>(name: string): T {
    assertQualifiedName(name)
    return Object.freeze({ name }) as T
}

export function defineComponent<T>(
    name: string,
    _options?: Readonly<Record<string, unknown>>,
): Component<T> {
    return namedToken<Component<T>>(name)
}

export function defineResource<T>(name: string): Resource<T> {
    return namedToken<Resource<T>>(name)
}

export class SparseSet<T> {
    readonly denseEntities: EntityId[] = []
    readonly denseValues: T[] = []
    readonly sparseIndices: number[] = []

    get size(): number {
        return this.denseEntities.length
    }

    has(entity: EntityId): boolean {
        const index = this.sparseIndices[entity] ?? -1
        return index >= 0 && this.denseEntities[index] === entity
    }

    get(entity: EntityId): T | undefined {
        const index = this.sparseIndices[entity] ?? -1
        return index >= 0 && this.denseEntities[index] === entity
            ? this.denseValues[index]
            : undefined
    }

    set(entity: EntityId, value: T): void {
        const index = this.sparseIndices[entity] ?? -1
        if (index >= 0 && this.denseEntities[index] === entity) {
            this.denseValues[index] = value
            return
        }

        this.sparseIndices[entity] = this.denseEntities.length
        this.denseEntities.push(entity)
        this.denseValues.push(value)
    }

    delete(entity: EntityId): boolean {
        if (!this.has(entity)) return false

        const index = this.sparseIndices[entity]
        const last = this.denseEntities.length - 1
        if (index !== last) {
            const movedEntity = this.denseEntities[last]
            this.denseEntities[index] = movedEntity
            this.denseValues[index] = this.denseValues[last]
            this.sparseIndices[movedEntity] = index
        }
        this.denseEntities.pop()
        this.denseValues.pop()
        this.sparseIndices[entity] = -1
        return true
    }
}

type AnyComponent = Component<unknown>
const addBuffered = Symbol('addBuffered')

export class Query implements Iterable<EntityId> {
    constructor(
        private readonly world: World,
        private readonly components: readonly AnyComponent[],
    ) {}

    *[Symbol.iterator](): Iterator<EntityId> {
        if (this.components.length === 0) {
            yield* this.world.queryableEntities()
            return
        }

        const stores = this.components.map(component => this.world.store(component))
        const candidate = stores.reduce((smallest, store) =>
            store.size < smallest.size ? store : smallest,
        )
        const entities = candidate.denseEntities
            .filter(entity => this.world.isQueryable(entity) && stores.every(store => store.has(entity)))
            .sort((a, b) => a - b)
        yield* entities
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

export class World {
    readonly resources = new ResourceStore()

    private nextEntity = 1
    private readonly entities = new Set<EntityId>()
    private readonly pendingDestroy = new Set<EntityId>()
    private readonly stores = new Map<string, { token: AnyComponent, store: SparseSet<unknown> }>()
    private readonly queries = new Map<string, Query>()

    createEntity(): EntityId {
        const entity = this.allocateEntity()
        this.activateEntity(entity)
        return entity
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
        if ([...this.entities].some(entity => entity >= nextEntity)) {
            throw new Error('Entity allocator nextEntity must exceed every active entity')
        }
        this.nextEntity = nextEntity
    }

    destroyEntity(entity: EntityId): boolean {
        if (!this.entities.delete(entity)) return false
        this.pendingDestroy.delete(entity)
        for (const { store } of this.stores.values()) store.delete(entity)
        return true
    }

    hasEntity(entity: EntityId): boolean {
        return this.isQueryable(entity)
    }

    add<T>(entity: EntityId, component: Component<T>, value: T): void {
        this.assertEntity(entity)
        this.store(component).set(entity, value)
    }

    [addBuffered]<T>(entity: EntityId, component: Component<T>, value: T): void {
        if (!this.entities.has(entity)) throw new Error(`Unknown entity: ${entity}`)
        this.store(component).set(entity, value)
    }

    remove<T>(entity: EntityId, component: Component<T>): boolean {
        return this.store(component).delete(entity)
    }

    has<T>(entity: EntityId, component: Component<T>): boolean {
        return this.isQueryable(entity) && this.store(component).has(entity)
    }

    get<T>(entity: EntityId, component: Component<T>): T | undefined {
        return this.isQueryable(entity)
            ? this.store(component).get(entity) as T | undefined
            : undefined
    }

    query(...components: readonly AnyComponent[]): Query {
        const unique = [...new Set(components)].sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        )
        for (const component of unique) this.store(component)
        const key = unique.map(component => component.name).join('|')
        let query = this.queries.get(key)
        if (!query) {
            query = new Query(this, unique)
            this.queries.set(key, query)
        }
        return query
    }

    store<T>(component: Component<T>): SparseSet<T> {
        const existing = this.stores.get(component.name)
        if (existing) {
            if (existing.token !== component) {
                throw new Error(`Duplicate component name: ${component.name}`)
            }
            return existing.store as SparseSet<T>
        }

        const store = new SparseSet<T>()
        this.stores.set(component.name, { token: component as AnyComponent, store })
        return store
    }

    queryableEntities(): EntityId[] {
        return [...this.entities]
            .filter(entity => !this.pendingDestroy.has(entity))
            .sort((a, b) => a - b)
    }

    isQueryable(entity: EntityId): boolean {
        return this.entities.has(entity) && !this.pendingDestroy.has(entity)
    }

    allocateEntity(): EntityId {
        return this.nextEntity++
    }

    activateEntity(entity: EntityId): void {
        this.entities.add(entity)
    }

    markDestroy(entity: EntityId): void {
        if (this.entities.has(entity)) this.pendingDestroy.add(entity)
    }

    private assertEntity(entity: EntityId): void {
        if (!this.isQueryable(entity)) throw new Error(`Unknown entity: ${entity}`)
    }
}

type Command =
    | { type: 'create', entity: EntityId }
    | { type: 'destroy', entity: EntityId }
    | { type: 'add', entity: EntityId, component: AnyComponent, value: unknown }
    | { type: 'remove', entity: EntityId, component: AnyComponent }

export class CommandBuffer {
    private commands: Command[] = []

    constructor(private readonly world: World) {}

    createEntity(): EntityId {
        const entity = this.world.allocateEntity()
        this.commands.push({ type: 'create', entity })
        return entity
    }

    destroyEntity(entity: EntityId): void {
        this.world.markDestroy(entity)
        this.commands.push({ type: 'destroy', entity })
    }

    add<T>(entity: EntityId, component: Component<T>, value: T): void {
        this.commands.push({ type: 'add', entity, component, value })
    }

    remove<T>(entity: EntityId, component: Component<T>): void {
        this.commands.push({ type: 'remove', entity, component })
    }

    flush(): void {
        const commands = this.commands
        this.commands = []
        for (const command of commands) {
            switch (command.type) {
                case 'create': this.world.activateEntity(command.entity); break
                case 'destroy': this.world.destroyEntity(command.entity); break
                case 'add': this.world[addBuffered](command.entity, command.component, command.value); break
                case 'remove': this.world.remove(command.entity, command.component); break
            }
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
    'seed',
    'tutorial',
    'spawn',
    'plant',
    'zombie',
    'projectile',
    'mower',
    'item',
    'progress',
    'cleanup',
    'snapshot',
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
