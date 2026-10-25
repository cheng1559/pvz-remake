import { deepFreeze, isQualifiedId, Registry } from '@/shared/mod'
import { jsonRoundTrip } from '@/shared/protocol'
import { parseGameplayDefinitions, parseGameplayLevels, parseGameplayStrings } from './gameplay'
import { parsePresentationDefinitions } from './presentation'

export interface DefinitionSource { readonly ownerId: string; readonly data: unknown }

export class DefinitionSources {
    readonly sources: DefinitionSource[] = []
    checkpoint(): () => void {
        const length = this.sources.length
        return () => { this.sources.length = length }
    }
    register(ownerId: string, data: unknown): void {
        if (!isQualifiedId(ownerId)) throw new Error(`Invalid definition owner: ${ownerId}`)
        const copy = jsonRoundTrip(data)
        deepFreeze(copy)
        this.sources.push(Object.freeze({ ownerId, data: copy }))
    }
}

const GAMEPLAY_TABLES = ['boards', 'seeds', 'plants', 'zombies', 'zombieGaits', 'projectiles', 'items', 'lawnMowers'] as const

/** Base content and Mods register into the same tables before references are checked. */
class DefinitionRegistry {
    private readonly tables = new Map<string, Registry<unknown>>()

    constructor(kinds: readonly string[]) {
        for (const kind of kinds) this.tables.set(kind, new Registry())
    }

    register(ownerId: string, data: unknown, base = false): void {
        if (!isQualifiedId(ownerId)) throw new Error(`Invalid definition owner: ${ownerId}`)
        const namespace = ownerId.slice(0, ownerId.indexOf(':') + 1)
        for (const [kind, entries] of Object.entries(object(data, ownerId))) {
            const table = this.tables.get(kind)
            if (!table) throw new Error(`${ownerId} registers unknown definition table: ${kind}`)
            for (const [id, value] of Object.entries(object(entries, `${ownerId}.${kind}`))) {
                if (!base && !id.startsWith(namespace)) throw new Error(`${ownerId} cannot register ${id}`)
                table.register(id, jsonRoundTrip(value))
            }
        }
    }

    values(kind: string): Record<string, unknown> {
        return Object.fromEntries(this.tables.get(kind)!.entries())
    }
}

export function buildGameplayContent(
    definitionsValue: unknown, levelsValue: unknown, stringsValue: unknown, seedCatalogValue: unknown, sources: readonly DefinitionSource[] = [],
) {
    const definitions = object(definitionsValue, 'gameplay definitions')
    const levels = object(levelsValue, 'gameplay levels')
    const registry = new DefinitionRegistry([...GAMEPLAY_TABLES, 'levels'])
    registry.register('pvz:base', {
        ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, definitions[kind]])), levels: levels.levels,
    }, true)
    const patches: DefinitionSource[] = []
    if (!Array.isArray(seedCatalogValue)) throw new Error('seed catalog must be an array')
    const seedCatalog = [...seedCatalogValue]
    for (const source of sources) {
        const { levelPatches, seedCatalog: additions, ...tables } = object(source.data, source.ownerId)
        registry.register(source.ownerId, tables)
        if (additions !== undefined) {
            if (!Array.isArray(additions)) throw new Error(`${source.ownerId}.seedCatalog must be an array`)
            seedCatalog.push(...additions)
        }
        if (levelPatches !== undefined) patches.push({ ownerId: source.ownerId, data: levelPatches })
    }
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
        strings: parseGameplayStrings(stringsValue),
    }
    deepFreeze(result)
    return result
}

export function buildPresentationDefinitions(value: unknown, sources: readonly DefinitionSource[] = []) {
    const base = object(jsonRoundTrip(value), 'presentation definitions')
    const kinds = ['plants', 'zombies', 'projectiles', 'boards']
    const registry = new DefinitionRegistry(kinds)
    registry.register('pvz:base', Object.fromEntries(kinds.map(kind => [kind, base[kind] ?? {}])), true)
    for (const source of sources) {
        const { strings: _strings, ...tables } = object(source.data, source.ownerId)
        registry.register(source.ownerId, tables)
    }
    buildModStrings(sources)
    const result = parsePresentationDefinitions({ ...base, ...Object.fromEntries(kinds.map(kind => [kind, registry.values(kind)])) })
    deepFreeze(result)
    return result
}

export function buildModStrings(sources: readonly DefinitionSource[]): Readonly<Record<string, string>> {
    const registry = new DefinitionRegistry(['strings'])
    for (const source of sources) {
        const strings = object(source.data, source.ownerId).strings
        if (strings !== undefined) registry.register(source.ownerId, { strings })
    }
    const result = registry.values('strings')
    for (const [id, value] of Object.entries(result)) if (typeof value !== 'string' || !value) throw new Error(`Invalid Mod string: ${id}`)
    return Object.freeze(result) as Readonly<Record<string, string>>
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}
