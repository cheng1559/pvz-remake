import type { Entity, World } from '@/server/state/World'
import { isQualifiedId, Registry } from '@/shared/mod'
import { jsonRoundTrip, type JsonObject, type JsonValue } from '@/shared/protocol'

/** What Mods keep on an entity, by their registered ids, as saved (Entity.extensions). */
export type SavedExtensions = Record<string, JsonObject>

/**
 * The Mods' data on the world's entities: each Mod registers its own by a qualified id of its namespace, with how to
 * check it, and keeps it on an entity as `entity.extensions[id]`. It is saved, restored and sent (the snapshot's
 * `extensions`) with the entity, checked and copied as JSON each time; what no Mod registered is neither.
 */
export class EntityExtensions {
    private readonly entries = new Registry<{ validate?: (value: JsonObject) => void }>('entity extension')

    register(id: string, validate?: (value: JsonObject) => void): void {
        if (!isQualifiedId(id) || id.startsWith('pvz:')) throw new Error(`Invalid entity extension: ${id}`)
        this.entries.register(id, { validate })
    }

    freeze(): void { this.entries.freeze() }

    checkpoint(): () => void { return this.entries.checkpoint() }

    /** An entity's data of the registered ids, as its save keeps it; none when it has none. */
    capture(entity: Entity): SavedExtensions | undefined {
        const result: SavedExtensions = {}
        for (const [id] of this.entries.entries()) {
            const value = entity.extensions?.[id]
            if (value !== undefined) result[id] = this.copy(id, value)
        }
        return Object.keys(result).length ? result : undefined
    }

    /** A saved entity's data back on it, each of an installed id. */
    restore(entity: Entity, values: SavedExtensions): void {
        const extensions: Record<string, JsonObject> = {}
        for (const [id, value] of Object.entries(values)) {
            if (!this.entries.get(id)) throw new Error(`Saved entity extension is not installed: ${id}`)
            extensions[id] = this.copy(id, value)
        }
        if (Object.keys(extensions).length) entity.extensions = extensions
    }

    /** The snapshot's `extensions` of the Mods' data: by id, each entity's by its id. */
    snapshot(world: World): Record<string, JsonValue> {
        const result: Record<string, JsonValue> = {}
        for (const [id] of this.entries.entries()) {
            const values: JsonObject = {}
            for (const list of world.lists()) for (const entity of list) {
                const value = entity.extensions?.[id]
                if (value !== undefined) values[entity.id] = this.copy(id, value)
            }
            result[id] = values
        }
        return result
    }

    private copy(id: string, value: JsonObject): JsonObject {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Entity extension must be a JSON object: ${id}`)
        const copy = jsonRoundTrip(value)
        this.entries.get(id)!.validate?.(copy)
        return copy
    }
}
