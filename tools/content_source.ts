import { join } from 'node:path'
import { readContentJson } from './content_source.mjs'

/** Headless tools and tests read the same authoring files as the pack builder. */
export function readGameplaySource(name: string, directory = 'tools/content/pvz-base/gameplay'): any {
    return readContentJson(join(directory, name + '.json'))
}

export function readPresentationSource(directory = 'tools/content/pvz-base/presentation'): any {
    return readContentJson(join(directory, 'definitions.json'))
}
