import { BASE_MOD_ID, deepFreeze, isModId, isOwnId, Registry } from '@/shared/mod'
import { jsonRoundTrip } from '@/shared/protocol'
import { parseGameplayDefinitions, parseGameplayLevels } from './gameplay'
import { parsePresentationDefinitions } from './presentation'

export interface DefinitionSource { readonly ownerId: string; readonly data: unknown }

export class DefinitionSources {
    readonly sources: DefinitionSource[] = []
    checkpoint(): () => void {
        const length = this.sources.length
        return () => { this.sources.length = length }
    }
    register(ownerId: string, data: unknown): void {
        if (!isModId(ownerId)) throw new Error(`Invalid definition owner: ${ownerId}`)
        const copy = jsonRoundTrip(data)
        deepFreeze(copy)
        this.sources.push(Object.freeze({ ownerId, data: copy }))
    }
}

const GAMEPLAY_TABLES = ['boards', 'seeds', 'plants', 'zombies', 'zombieGaits', 'projectiles', 'items', 'lawnMowers'] as const

/**
 * Base content and Mods register into the same tables before references are checked. A Mod registers new IDs only in
 * its own namespace; replacing an existing definition (the base game's or another Mod's) goes through `overrides`.
 */
class DefinitionRegistry {
    private readonly tables = new Map<string, Registry<unknown>>()
    private readonly replacements = new Map<string, Map<string, { ownerId: string, value: unknown }>>()

    constructor(kinds: readonly string[]) {
        for (const kind of kinds) this.tables.set(kind, new Registry())
    }

    register(ownerId: string, data: unknown, base = false): void {
        if (!isModId(ownerId)) throw new Error(`Invalid definition owner: ${ownerId}`)
        for (const [kind, entries] of Object.entries(object(data, ownerId))) {
            const table = this.tables.get(kind)
            if (!table) throw new Error(`${ownerId} registers unknown definition table: ${kind}`)
            for (const [id, value] of Object.entries(object(entries, `${ownerId}.${kind}`))) {
                if (!base && !isOwnId(ownerId, id)) throw new Error(`${ownerId} cannot register ${id}`)
                table.register(id, jsonRoundTrip(value))
            }
        }
    }

    /** Replaces whole existing definitions; one Mod per ID, applied once every Mod has registered its own. */
    override(ownerId: string, data: unknown): void {
        for (const [kind, entries] of Object.entries(object(data, `${ownerId}.overrides`))) {
            const table = this.tables.get(kind)
            if (!table) throw new Error(`${ownerId} overrides unknown definition table: ${kind}`)
            let replaced = this.replacements.get(kind)
            if (!replaced) this.replacements.set(kind, replaced = new Map())
            for (const [id, value] of Object.entries(object(entries, `${ownerId}.overrides.${kind}`))) {
                if (table.get(id) === undefined) throw new Error(`${ownerId} overrides unknown ${kind}: ${id}`)
                const previous = replaced.get(id)
                if (previous) throw new Error(`Conflicting override: ${kind}/${id} (${previous.ownerId}, ${ownerId})`)
                replaced.set(id, { ownerId, value: jsonRoundTrip(value) })
            }
        }
    }

    values(kind: string): Record<string, unknown> {
        const replaced = this.replacements.get(kind)
        return Object.fromEntries(Array.from(this.tables.get(kind)!.entries(), ([id, value]) => [id, replaced?.get(id)?.value ?? value]))
    }
}

export function buildGameplayContent(value: unknown, sources: readonly DefinitionSource[] = []) {
    const { settings, levels: levelEntries, seedCatalog: seedCatalogValue, ...tables } = object(value, 'base gameplay')
    const definitions = { ...object(settings, 'gameplay settings'), ...tables }
    const levels = { schemaVersion: definitions.schemaVersion, levels: object(levelEntries, 'gameplay levels') }
    const registry = new DefinitionRegistry([...GAMEPLAY_TABLES, 'levels'])
    registry.register(BASE_MOD_ID, {
        ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, definitions[kind]])), levels: levels.levels,
    }, true)
    const patches: DefinitionSource[] = [], overrides: DefinitionSource[] = []
    if (!Array.isArray(seedCatalogValue)) throw new Error('seed catalog must be an array')
    const seedCatalog = [...seedCatalogValue]
    for (const source of sources) {
        const { levelPatches, overrides: replacements, seedCatalog: additions, ...tables } = object(source.data, source.ownerId)
        registry.register(source.ownerId, tables)
        if (replacements !== undefined) overrides.push({ ownerId: source.ownerId, data: replacements })
        if (additions !== undefined) {
            if (!Array.isArray(additions)) throw new Error(`${source.ownerId}.seedCatalog must be an array`)
            seedCatalog.push(...additions)
        }
        if (levelPatches !== undefined) patches.push({ ownerId: source.ownerId, data: levelPatches })
    }
    // Overrides may target any Mod's IDs, so they wait for every registration; level patches then apply on top.
    for (const source of overrides) registry.override(source.ownerId, source.data)
    const installedLevels = registry.values('levels')
    const patchedFields = new Set<string>()
    for (const source of patches) for (const [id, value] of Object.entries(object(source.data, source.ownerId + '.levelPatches'))) {
        if (!Object.hasOwn(installedLevels, id)) throw new Error(`${source.ownerId} patches unknown level: ${id}`)
        const patch = object(value, `${source.ownerId}.levelPatches.${id}`)
        for (const field of Object.keys(patch)) {
            const key = `${id}/${field}`
            if (patchedFields.has(key)) throw new Error(`Conflicting level patch: ${key}`)
            patchedFields.add(key)
        }
        installedLevels[id] = { ...object(installedLevels[id], id), ...jsonRoundTrip(patch) }
    }
    const resultDefinitions = parseGameplayDefinitions({
        ...definitions, ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, registry.values(kind)])),
    }, seedCatalog)
    const result = {
        definitions: resultDefinitions,
        levels: parseGameplayLevels({ ...levels, levels: installedLevels }, resultDefinitions),
    }
    deepFreeze(result)
    return result
}

export function buildPresentationDefinitions(value: unknown, sources: readonly DefinitionSource[] = []) {
    const base = object(jsonRoundTrip(value), 'presentation definitions')
    const kinds = ['plants', 'zombies', 'projectiles', 'boards', 'screens', 'levels']
    const registry = new DefinitionRegistry(kinds)
    registry.register(BASE_MOD_ID, Object.fromEntries(kinds.map(kind => [kind, base[kind] ?? {}])), true)
    for (const source of sources) {
        const { overrides: _overrides, ...tables } = object(source.data, source.ownerId)
        registry.register(source.ownerId, tables)
    }
    for (const source of sources) {
        const { overrides } = object(source.data, source.ownerId)
        if (overrides !== undefined) registry.override(source.ownerId, overrides)
    }
    const result = parsePresentationDefinitions({ ...base, ...Object.fromEntries(kinds.map(kind => [kind, registry.values(kind)])) })
    deepFreeze(result)
    return result
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}
