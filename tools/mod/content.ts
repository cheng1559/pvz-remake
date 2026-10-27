import { dirname, isAbsolute, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

export interface SourceContent {
    resources: Record<string, Record<string, any>>
    gameplay?: any
    presentation?: any
}

/** Every package uses content.json to index definition tables and resource mappings. */
export function readModContent(file: string, sourceFiles = new Set<string>()): SourceContent {
    const { gameplay, presentation, resources = {} } = JSON.parse(readFileSync(file, 'utf8'))
    const content: SourceContent = { resources }
    for (const [kind, tables] of Object.entries({ gameplay, presentation })) {
        if (tables !== undefined) content[kind as 'gameplay' | 'presentation'] = readTables(file, tables, sourceFiles)
    }
    return content
}

function readTables(file: string, tables: unknown, sourceFiles: Set<string>): Record<string, any> {
    if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw new Error(`Invalid tables index: ${file}`)
    const resolved: Record<string, any> = {}
    for (const [kind, path] of Object.entries(tables)) {
        if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error(`Invalid table path: ${path}`)
        const input = resolve(dirname(file), path)
        resolved[kind] = JSON.parse(readFileSync(input, 'utf8'))
        sourceFiles.add(input)
    }
    return resolved
}

export function readBaseContent(directory = 'mods/pvz-base') {
    return readModContent(join(directory, 'content.json'))
}

/** Headless tools and tests read the same authoring files as the pack builder. */
export function readGameplaySource(name: string, directory = 'mods/pvz-base/gameplay'): any {
    const content = readBaseContent(dirname(directory))
    const { settings, levels, strings, seedCatalog, ...definitions } = content.gameplay
    if (name === 'definitions') return { ...settings, ...definitions }
    if (name === 'levels') return { schemaVersion: settings.schemaVersion, levels }
    if (name === 'strings') return strings
    if (name === 'seed-catalog') return seedCatalog
    const file = content.resources.json?.[`pvz:gameplay/${name}`]
    if (!file) throw new Error(`Unknown gameplay source: ${name}`)
    return JSON.parse(readFileSync(join(dirname(directory), file), 'utf8'))
}

export function readPresentationSource(directory = 'mods/pvz-base/presentation'): any {
    return readBaseContent(dirname(directory)).presentation
}
