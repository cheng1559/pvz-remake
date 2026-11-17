import type { Component, EntityId, World } from '@/server/state/World'
import { isQualifiedId, Registry } from '@/shared/mod'
import { jsonRoundTrip, type JsonObject, type JsonValue } from '@/shared/protocol'

export type SavedComponents = Record<string, JsonObject>
export class JsonComponents {
    private readonly entries = new Registry<{ component: Component<JsonObject>, validate?: (value: any) => void }>('JSON component')

    register<T extends JsonObject>(component: Component<T>, validate?: (value: T) => void): void {
        if (!isQualifiedId(component.name) || component.name.startsWith('pvz:')) throw new Error(`Invalid Mod component: ${component.name}`)
        this.entries.register(component.name, { component: component as Component<JsonObject>, validate })
    }
    freeze(): void { this.entries.freeze() }
    checkpoint(): () => void { return this.entries.checkpoint() }
    capture(world: World, entity: EntityId): SavedComponents {
        const result: SavedComponents = {}
        for (const [id, entry] of this.entries.entries()) {
            const value = world.get(entity, entry.component)
            if (value === undefined) continue
            result[id] = this.copy(id, value)
        }
        return result
    }
    restore(world: World, entity: EntityId, values: SavedComponents): void {
        for (const [id, value] of Object.entries(values)) {
            const entry = this.entries.get(id)
            if (!entry) throw new Error(`Saved Mod component is not installed: ${id}`)
            world.add(entity, entry.component, this.copy(id, value))
        }
    }
    snapshot(world: World): Record<string, JsonValue> {
        const result: Record<string, JsonValue> = {}
        for (const [id, entry] of this.entries.entries()) {
            const values: JsonObject = {}
            for (const entity of world.query(entry.component)) values[entity] = this.copy(id, world.get(entity, entry.component)!)
            result[id] = values
        }
        return result
    }
    private copy(id: string, value: JsonObject): JsonObject {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Mod component must be a JSON object: ${id}`)
        const copy = jsonRoundTrip(value)
        this.entries.get(id)!.validate?.(copy)
        return copy
    }
}
