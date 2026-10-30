import type { Component, EntityId, World } from '@/ecs/index'
import { isQualifiedId } from '@/shared/mod'
import { jsonRoundTrip, type JsonObject, type JsonValue } from '@/shared/protocol'

export type SavedComponents = Record<string, JsonObject>
export class JsonComponents {
    private readonly entries = new Map<string, { component: Component<JsonObject>, validate?: (value: any) => void }>()
    private frozen = false

    register<T extends JsonObject>(component: Component<T>, validate?: (value: T) => void): void {
        if (this.frozen) throw new Error('JSON components are frozen')
        if (!isQualifiedId(component.name) || component.name.startsWith('pvz:')) throw new Error(`Invalid Mod component: ${component.name}`)
        if (this.entries.has(component.name)) throw new Error(`Duplicate JSON component: ${component.name}`)
        this.entries.set(component.name, { component, validate })
    }
    freeze(): void { this.frozen = true }
    checkpoint(): () => void {
        const keys = new Set(this.entries.keys()), frozen = this.frozen
        return () => {
            for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key)
            this.frozen = frozen
        }
    }
    capture(world: World, entity: EntityId): SavedComponents {
        const result: SavedComponents = {}
        for (const [id, entry] of this.entries) {
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
        for (const [id, entry] of this.entries) {
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
