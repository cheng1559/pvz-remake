import { isQualifiedId } from '@/shared/mod/index'

export const CONTENT_CATEGORIES = [
    'sprites',
    'reanim',
    'particles',
    'fonts',
    'sounds',
    'music',
    'prefabs',
] as const

export type ContentCategory = typeof CONTENT_CATEGORIES[number]
export type ContentEntries = Readonly<Record<string, string>>

export interface ContentManifestV2 {
    schemaVersion: 2
    id: string
    version: string
    contentHash: string
    gameplay: {
        definitions: string
        levels: string
        strings: string
    }
    client: {
        bundle: string
        sprites: ContentEntries
        reanim: ContentEntries
        particles: ContentEntries
        fonts: ContentEntries
        sounds: ContentEntries
        music: ContentEntries
        prefabs: ContentEntries
    }
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

export function parseContentManifestV2(value: unknown): ContentManifestV2 {
    const manifest = exactObject(
        value,
        ['schemaVersion', 'id', 'version', 'contentHash', 'gameplay', 'client'],
        'content manifest',
    )
    if (manifest.schemaVersion !== 2) throw new Error('content manifest.schemaVersion must be 2')
    if (!isQualifiedId(manifest.id)) throw new Error('content manifest.id must be a qualified ID')

    const id = manifest.id
    const version = semanticVersion(manifest.version, 'content manifest.version')
    const contentHash = nonEmptyString(manifest.contentHash, 'content manifest.contentHash')
    const gameplay = exactObject(
        manifest.gameplay,
        ['definitions', 'levels', 'strings'],
        'content manifest.gameplay',
    )
    const client = exactObject(
        manifest.client,
        ['bundle', ...CONTENT_CATEGORIES],
        'content manifest.client',
    )
    const namespace = id.slice(0, id.indexOf(':') + 1)

    return {
        schemaVersion: 2,
        id,
        version,
        contentHash,
        gameplay: {
            definitions: relativePath(gameplay.definitions, 'content manifest.gameplay.definitions'),
            levels: relativePath(gameplay.levels, 'content manifest.gameplay.levels'),
            strings: relativePath(gameplay.strings, 'content manifest.gameplay.strings'),
        },
        client: {
            bundle: nonEmptyString(client.bundle, 'content manifest.client.bundle'),
            sprites: contentEntries(client.sprites, namespace, 'sprites'),
            reanim: contentEntries(client.reanim, namespace, 'reanim'),
            particles: contentEntries(client.particles, namespace, 'particles'),
            fonts: contentEntries(client.fonts, namespace, 'fonts'),
            sounds: contentEntries(client.sounds, namespace, 'sounds'),
            music: contentEntries(client.music, namespace, 'music'),
            prefabs: contentEntries(client.prefabs, namespace, 'prefabs'),
        },
    }
}

function contentEntries(value: unknown, namespace: string, category: ContentCategory): ContentEntries {
    const record = object(value, `content manifest.client.${category}`)
    const entries: Record<string, string> = {}
    for (const id of Object.keys(record).sort()) {
        if (!isQualifiedId(id)) throw new Error(`${category} key must be a qualified ID: ${id}`)
        if (!id.startsWith(namespace)) throw new Error(`${category} ID ${id} is outside ${namespace}`)
        entries[id] = relativePath(record[id], `content manifest.client.${category}.${id}`)
    }
    return entries
}

function relativePath(value: unknown, name: string): string {
    const path = nonEmptyString(value, name)
    let decoded: string
    try {
        decoded = decodeURIComponent(path)
    } catch {
        throw new Error(`${name} must be a relative path`)
    }
    if (
        /^(?:[A-Za-z]:|[\\/]|[a-z][a-z0-9+.-]*:)/i.test(decoded) ||
        decoded.split(/[\\/]/).indexOf('..') >= 0
    ) {
        throw new Error(`${name} must be a relative path`)
    }
    return path
}

function semanticVersion(value: unknown, name: string): string {
    const version = nonEmptyString(value, name)
    const match = version.match(VERSION_PATTERN)
    if (!match) throw new Error(`${name} must use x.y.z`)
    if (match.slice(1).some(part => !Number.isSafeInteger(Number(part)))) {
        throw new Error(`${name} parts must be safe integers`)
    }
    return version
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    const record = object(value, name)
    const expected = new Set(keys)
    for (const key of Object.keys(record)) {
        if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    }
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    }
    return record
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${name} must be an object`)
    }
    return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}
