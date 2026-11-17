import type { Component, Entity, EntityId, EntityList, GameSystem, SystemContext, World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { isModId, isQualifiedId, Registry } from '@/shared/mod'
import { assertJsonValue, jsonRoundTrip, type JsonObject, type EntityBehaviorState } from '@/shared/protocol'
import { LevelStateResource, PositionComponent, type Position } from '../state/components'

interface BehaviorEntity extends EntityBehaviorState { typeId: string }
interface BehaviorDefinition { readonly behavior?: JsonObject }

export type EntityBehaviorContext<Key extends string, Data, Definition, State extends JsonObject = JsonObject> = SystemContext & {
    readonly entity: EntityId
    readonly position: Position
    readonly definition: Readonly<Definition>
    readonly state: State
    readonly definitions: Readonly<GameplayDefinitions>
} & Readonly<Record<Key, Data>>

export interface EntityBehavior<Key extends string, Data, Definition, State extends JsonObject = JsonObject> {
    readonly tickAfterWin?: boolean
    createState(definition: Readonly<Definition>): State
    tick(context: EntityBehaviorContext<Key, Data, Definition, State>): void
    /** Throw on an incompatible state; no save migration is performed. */
    validateState?(state: State, definition: Readonly<Definition>): void
    /**
     * Throw on a definition's `behavior` the behaviour does not take (an unknown key included), so content is rejected
     * as it is loaded, before any of its entities exists: run for each type the behaviour is registered for.
     */
    validateConfig?(definition: Readonly<Definition>, definitions: Readonly<GameplayDefinitions>, name: string): void
}

/** Shared registration, per-entity state and simulation dispatch for gameplay entities. */
export class EntityBehaviorRegistry<Key extends string, Data extends BehaviorEntity, Definition extends BehaviorDefinition> {
    private readonly behaviors: Registry<EntityBehavior<Key, Data, Definition>>
    has(typeId: string): boolean { return this.behaviors.has(typeId) }

    constructor(
        private readonly kind: Key,
        /** Where the world holds them: a component of each entity, or a typed list of them (World.zombies). */
        private readonly source: Component<Data> | ((world: World) => EntityList<Data & Entity & { position: Position }>),
        private readonly definitions: (definitions: GameplayDefinitions) => Record<string, Definition>,
        private readonly active: (data: Data) => boolean,
    ) {
        this.behaviors = new Registry(`${kind} behavior`)
    }

    register<State extends JsonObject>(ownerId: string, typeId: string, behavior: EntityBehavior<Key, Data, Definition, State>): void {
        if (!isModId(ownerId) || !isQualifiedId(typeId) || !behavior ||
            typeof behavior.createState !== 'function' || typeof behavior.tick !== 'function' ||
            behavior.validateState !== undefined && typeof behavior.validateState !== 'function' ||
            behavior.validateConfig !== undefined && typeof behavior.validateConfig !== 'function') {
            throw new Error(`Invalid ${this.kind} behavior: ${typeId}`)
        }
        this.behaviors.register(typeId, Object.freeze(behavior) as unknown as EntityBehavior<Key, Data, Definition>, ownerId)
    }

    /** Every behaviour targets a definition and takes its `behavior`, and every definition with one has its behaviour. */
    validate(definitions: GameplayDefinitions): void {
        const table = this.definitions(definitions)
        for (const [id, behavior] of this.behaviors.entries()) {
            if (!table[id]) throw new Error(`Behavior targets unknown ${this.kind}: ${id}`)
            behavior.validateConfig?.(table[id], definitions, `${this.kind}s.${id}.behavior`)
        }
        for (const [id, definition] of Object.entries(table)) {
            if (definition.behavior !== undefined && !this.behaviors.has(id)) throw new Error(`${this.kind} behavior is not installed: ${id}`)
        }
    }

    freeze(): void { this.behaviors.freeze() }

    checkpoint(): () => void { return this.behaviors.checkpoint() }

    createState(typeId: string, definition: Definition): JsonObject | undefined {
        const behavior = this.behaviors.get(typeId)
        if (!behavior) return undefined
        const state = jsonRoundTrip(behavior.createState(definition))
        this.validateState({ typeId, behaviorState: state }, definition)
        return state
    }

    validateState(data: BehaviorEntity, definition: Definition): void {
        const behavior = this.behaviors.get(data.typeId)
        const state = data.behaviorState
        if (!behavior && state === undefined) return
        if (!behavior || !state || typeof state !== 'object' || Array.isArray(state)) {
            throw new Error(`Invalid ${this.kind} behavior state: ${data.typeId}`)
        }
        assertJsonValue(state)
        behavior.validateState?.(state, definition)
    }

    /** Each entity of the kind in id order, as it stands; an earlier one's blow may have taken one out during the run. */
    private *entries(world: World): Iterable<{ entity: EntityId, data: Data, position: Position }> {
        const source = this.source
        if (typeof source === 'function') {
            for (const data of source(world)) yield { entity: data.id, data, position: data.position }
            return
        }
        for (const entity of world.query(source, PositionComponent)) {
            const data = world.get(entity, source)
            if (data) yield { entity, data, position: world.get(entity, PositionComponent)! }
        }
    }

    system(definitions: GameplayDefinitions): GameSystem {
        const table = this.definitions(definitions)
        return {
            id: `pvz:${this.kind}-behaviors`,
            run: context => {
                const { world } = context
                const level = world.resources.get(LevelStateResource)
                if (this.behaviors.size === 0 || level.phase !== 'gameplay' || level.paused || level.result === 'lost') return
                for (const { entity, data, position } of this.entries(world)) {
                    const behavior = this.behaviors.get(data.typeId)
                    if (!behavior || !this.active(data) || level.result === 'won' && !behavior.tickAfterWin) continue
                    behavior.tick({
                        ...context, entity, definitions, [this.kind]: data, position,
                        definition: table[data.typeId], state: data.behaviorState!,
                    } as EntityBehaviorContext<Key, Data, Definition>)
                }
            },
        }
    }
}
