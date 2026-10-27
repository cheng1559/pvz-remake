import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { readModContent } from './content_source.mjs'

export function readBaseContent(directory = 'tools/content/pvz-base') {
    return readModContent(join(directory, 'content.json'))
}

/** Headless tools and tests read the same authoring files as the pack builder. */
export function readGameplaySource(name: string, directory = 'tools/content/pvz-base/gameplay'): any {
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

export function readPresentationSource(directory = 'tools/content/pvz-base/presentation'): any {
    return readBaseContent(dirname(directory)).presentation
}
