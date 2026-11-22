import { record } from '@/shared/validate'
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

const GAMEPLAY_TABLES = ['boards', 'seeds', 'plants', 'zombies', 'projectiles', 'items', 'achievements', 'tools', 'store', 'storePages', 'almanac'] as const

/**
 * Base content and Mods register into the same tables before references are checked. A Mod registers new IDs only in
 * its own namespace; what it writes under anyone else's ID changes what is defined there (modDefinitions).
 */
class DefinitionRegistry {
    private readonly tables = new Map<string, Registry<unknown>>()

    constructor(kinds: readonly string[]) {
        for (const kind of kinds) this.tables.set(kind, new Registry())
    }

    register(ownerId: string, data: unknown, base = false): void {
        if (!isModId(ownerId)) throw new Error(`Invalid definition owner: ${ownerId}`)
        for (const [kind, entries] of Object.entries(record(data, ownerId))) {
            const table = this.tables.get(kind)
            if (!table) throw new Error(`${ownerId} registers unknown definition table: ${kind}`)
            for (const [id, value] of Object.entries(record(entries, `${ownerId}.${kind}`))) {
                if (!base && !isOwnId(ownerId, id)) throw new Error(`${ownerId} cannot register ${id}`)
                table.register(id, jsonRoundTrip(value))
            }
        }
    }

    values(kind: string): Record<string, unknown> {
        return Object.fromEntries(this.tables.get(kind)!.entries())
    }
}

/**
 * A Mod's definitions, as they are used: the entries of its own namespace are new and registered; the entries under
 * anyone else's IDs, and the blocks of settings outside the tables, are JSON merge patches (RFC 7386) on what is defined.
 */
function modDefinitions(source: DefinitionSource, tables: readonly string[], settings: readonly string[]) {
    const { ownerId } = source, own: Record<string, Record<string, unknown>> = {}, patches: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record(source.data, ownerId))) {
        if (settings.includes(key)) { patches[key] = value; continue }
        if (!tables.includes(key)) throw new Error(`${ownerId} registers unknown definition table: ${key}`)
        for (const [id, entry] of Object.entries(record(value, `${ownerId}.${key}`))) {
            const into = isOwnId(ownerId, id) ? own : patches as Record<string, Record<string, unknown>>
            ;(into[key] ??= {})[id] = entry
        }
    }
    return { own, patches: { ownerId, data: patches } }
}

/**
 * The Mods' changes, in load order, once every Mod has registered its own: each block (a table, the levels, or a
 * block of settings) gets its merge patch, a table's entries named by ID, each of which must be there. A later Mod's
 * value of a field wins, and what comes of it is checked as everything else is.
 */
function applyPatches(blocks: Record<string, unknown>, tables: readonly string[], patches: readonly DefinitionSource[]): Record<string, unknown> {
    const result = { ...blocks }
    for (const { ownerId, data } of patches) for (const [block, patch] of Object.entries(record(data, ownerId))) {
        const entries = record(patch, `${ownerId}.${block}`)
        if (tables.includes(block)) for (const id of Object.keys(entries)) {
            if (!Object.hasOwn(record(result[block], block), id)) throw new Error(`${ownerId} changes unknown ${block} entry: ${id}`)
        }
        result[block] = merged(result[block], entries)
    }
    return result
}

/**
 * `value` with the merge patch on it, `value` itself unchanged: an object's fields are patched in turn, a null removes
 * its field, and any other value replaces what was there.
 */
function merged(value: unknown, patch: unknown): unknown {
    const isObject = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
    if (!isObject(patch)) return jsonRoundTrip(patch)
    const result: Record<string, unknown> = isObject(value) ? { ...value } : {}
    for (const [field, fieldPatch] of Object.entries(patch)) {
        if (fieldPatch === null) delete result[field]
        else result[field] = merged(result[field], fieldPatch)
    }
    return result
}

export function buildGameplayContent(value: unknown, sources: readonly DefinitionSource[] = []) {
    const { settings, levels: levelEntries, ...tables } = record(value, 'base gameplay')
    const registry = new DefinitionRegistry([...GAMEPLAY_TABLES, 'levels'])
    registry.register(BASE_MOD_ID, {
        ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, tables[kind]])), levels: record(levelEntries, 'gameplay levels'),
    }, true)
    const tableKinds = [...GAMEPLAY_TABLES, 'levels'], mods = sources.map(source => modDefinitions(source, tableKinds, ['settings']))
    for (const mod of mods) registry.register(mod.patches.ownerId, mod.own)
    // Changes may be to any Mod's IDs, so they wait for every registration.
    const blocks = applyPatches({
        settings: record(settings, 'gameplay settings'), ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, registry.values(kind)])),
        levels: registry.values('levels'),
    }, tableKinds, mods.map(mod => mod.patches))
    const definitions = record(blocks.settings, 'gameplay settings')
    const resultDefinitions = parseGameplayDefinitions({
        ...definitions, ...tables, ...Object.fromEntries(GAMEPLAY_TABLES.map(kind => [kind, blocks[kind]])),
    })
    const result = {
        definitions: resultDefinitions,
        levels: parseGameplayLevels({ schemaVersion: definitions.schemaVersion, levels: blocks.levels }, resultDefinitions),
    }
    deepFreeze(result)
    return result
}

export function buildPresentationDefinitions(value: unknown, sources: readonly DefinitionSource[] = []) {
    const base = record(jsonRoundTrip(value), 'presentation definitions')
    // The tables a Mod adds to or changes, all by qualified ID: `awards` by the level award's, `rules` by the rule's kind,
    // `store` by the store item's, `almanac` by the plant or zombie the almanac shows.
    const kinds = ['plants', 'zombies', 'projectiles', 'gridItems', 'items', 'awards', 'tools', 'foley', 'boards', 'screens', 'clips', 'levels', 'rules', 'challenges',
        'store', 'almanac']
    const registry = new DefinitionRegistry(kinds)
    registry.register(BASE_MOD_ID, Object.fromEntries(kinds.map(kind => [kind, base[kind] ?? {}])), true)
    // The presentation's settings are every block of the base outside the tables: its `settings`, `mainMenu`, `conveyor`...
    const settings = Object.keys(base).filter(key => !kinds.includes(key))
    const mods = sources.map(source => modDefinitions(source, kinds, settings))
    for (const mod of mods) registry.register(mod.patches.ownerId, mod.own)
    // Changes wait for every registration.
    const blocks = { ...base, ...Object.fromEntries(kinds.map(kind => [kind, registry.values(kind)])) }
    const result = parsePresentationDefinitions(applyPatches(blocks, kinds, mods.map(mod => mod.patches)))
    deepFreeze(result)
    return result
}
