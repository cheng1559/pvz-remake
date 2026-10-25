import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

/** Mod content.json combines definition indexes with resource mappings. */
export function readModContent(file, sourceFiles = new Set()) {
    const { gameplay, presentation, resources = {} } = readJson(file)
    const content = { resources }
    for (const [kind, tables] of Object.entries({ gameplay, presentation })) {
        if (tables !== undefined) content[kind] = readTables(file, tables, sourceFiles)
    }
    return content
}

/** Expand authoring table references; ordinary runtime JSON is already complete. */
export function readContentJson(file) {
    const source = readJson(file)
    if (!source || typeof source !== 'object' || !Object.hasOwn(source, 'tables')) return source
    const { tables, ...settings } = source
    const resolved = readTables(file, tables)
    for (const kind of Object.keys(resolved)) {
        if (Object.hasOwn(settings, kind)) throw new Error(`Duplicate table ${kind}: ${file}`)
    }
    return { ...settings, ...resolved }
}

function readTables(file, tables, sourceFiles = new Set()) {
    if (!tables || typeof tables !== 'object' || Array.isArray(tables)) throw new Error(`Invalid tables index: ${file}`)
    const resolved = {}
    for (const [kind, path] of Object.entries(tables)) {
        if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error(`Invalid table path: ${path}`)
        const input = resolve(dirname(file), path)
        resolved[kind] = readJson(input)
        sourceFiles.add(input)
    }
    return resolved
}
