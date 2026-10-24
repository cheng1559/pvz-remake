import type { Component, EntityId, GameSystem, SystemContext } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { isQualifiedId } from '@/shared/mod'
import { assertJsonValue, jsonRoundTrip, type JsonObject, type EntityBehaviorState } from '@/shared/protocol'
import { LevelStateResource, PositionComponent, type Position } from './components'

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
    createState(definition: Readonly<Definition>): State
    tick(context: EntityBehaviorContext<Key, Data, Definition, State>): void
    /** Throw on an incompatible state; no save migration is performed. */
    validateState?(state: State, definition: Readonly<Definition>): void
}

/** Shared registration, per-entity state and simulation dispatch for gameplay entities. */
export class EntityBehaviorRegistry<Key extends string, Data extends BehaviorEntity, Definition extends BehaviorDefinition> {
    private readonly entries = new Map<string, { ownerId: string, behavior: EntityBehavior<Key, Data, Definition> }>()
    private frozen = false

    constructor(
        private readonly kind: Key,
        private readonly component: Component<Data>,
        private readonly definitions: (definitions: GameplayDefinitions) => Record<string, Definition>,
        private readonly active: (data: Data) => boolean,
    ) {}

    register<State extends JsonObject>(ownerId: string, typeId: string, behavior: EntityBehavior<Key, Data, Definition, State>): void {
        if (this.frozen) throw new Error(`${this.kind} behaviors are frozen`)
        if (!isQualifiedId(ownerId) || !isQualifiedId(typeId) || !behavior ||
            typeof behavior.createState !== 'function' || typeof behavior.tick !== 'function' ||
            behavior.validateState !== undefined && typeof behavior.validateState !== 'function') {
            throw new Error(`Invalid ${this.kind} behavior: ${typeId}`)
        }
        const existing = this.entries.get(typeId)
        if (existing) throw new Error(`${this.kind} behavior ${typeId} is already registered by ${existing.ownerId}`)
        this.entries.set(typeId, { ownerId, behavior: Object.freeze(behavior) as unknown as EntityBehavior<Key, Data, Definition> })
    }

    validate(definitions: GameplayDefinitions): void {
        const table = this.definitions(definitions)
        for (const id of this.entries.keys()) if (!table[id]) throw new Error(`Behavior targets unknown ${this.kind}: ${id}`)
        for (const [id, definition] of Object.entries(table)) {
            if (definition.behavior !== undefined && !this.entries.has(id)) throw new Error(`${this.kind} behavior is not installed: ${id}`)
        }
    }

    freeze(definitions: GameplayDefinitions): void { this.validate(definitions); this.frozen = true }

    checkpoint(): () => void {
        const keys = new Set(this.entries.keys()), frozen = this.frozen
        return () => {
            for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key)
            this.frozen = frozen
        }
    }

    createState(typeId: string, definition: Definition): JsonObject | undefined {
        const behavior = this.entries.get(typeId)?.behavior
        if (!behavior) return undefined
        const state = jsonRoundTrip(behavior.createState(definition))
        this.validateState({ typeId, behaviorState: state }, definition)
        return state
    }

    validateState(data: BehaviorEntity, definition: Definition): void {
        const behavior = this.entries.get(data.typeId)?.behavior
        const state = data.behaviorState
        if (!behavior && state === undefined) return
        if (!behavior || !state || typeof state !== 'object' || Array.isArray(state)) {
            throw new Error(`Invalid ${this.kind} behavior state: ${data.typeId}`)
        }
        assertJsonValue(state)
        behavior.validateState?.(state, definition)
    }

    system(definitions: GameplayDefinitions): GameSystem {
        const table = this.definitions(definitions)
        return {
            id: `pvz:${this.kind}-behaviors`,
            run: context => {
                const { world } = context
                const level = world.resources.get(LevelStateResource)
                if (this.entries.size === 0 || level.phase !== 'gameplay' || level.paused || level.result !== 'playing') return
                for (const entity of world.query(this.component, PositionComponent)) {
                    const data = world.get(entity, this.component)!
                    const behavior = this.entries.get(data.typeId)?.behavior
                    if (!behavior || !this.active(data)) continue
                    behavior.tick({
                        ...context, entity, definitions, [this.kind]: data,
                        position: world.get(entity, PositionComponent)!,
                        definition: table[data.typeId], state: data.behaviorState!,
                    } as EntityBehaviorContext<Key, Data, Definition>)
                }
            },
        }
    }
}
