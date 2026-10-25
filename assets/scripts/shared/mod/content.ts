export interface ResourceSprite {
    file: string
    width: number
    height: number
    scale?: number
    rect?: [number, number, number, number]
    offset?: [number, number]
    borders?: [number, number, number, number]
    animations?: string[]
}

export const RESOURCE_FILES = ['fonts', 'audio', 'json', 'text', 'reanim', 'particles', 'music', 'prefabs'] as const
export type ResourceManifest = { sprites: Record<string, ResourceSprite> } & Record<typeof RESOURCE_FILES[number], Record<string, string>>
export interface ModContent { resources: ResourceManifest; gameplay?: string; presentation?: string }
export type ContentFiles = Readonly<Record<string, Uint8Array>>

export function relativeFile(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value || /^(?:[\\/]|[a-z][a-z0-9+.-]*:)/i.test(value)
        || value.split(/[\\/]/).includes('..')) throw new Error(`Invalid content file: ${value}`)
}

export function contentJson(files: ContentFiles, file: string): any {
    relativeFile(file)
    const bytes = files[file]
    if (!bytes) throw new Error(`Missing ZIP file: ${file}`)
    return JSON.parse(new TextDecoder('utf-8').decode(bytes))
}

export function parseModContent(value: unknown, files: ContentFiles): ModContent {
    const source = record(value, 'content')
    for (const key of Object.keys(source)) if (!['resources', 'gameplay', 'presentation'].includes(key)) throw new Error(`Unknown content field: ${key}`)
    const raw = record(source.resources ?? {}, 'resources')
    for (const key of Object.keys(raw)) if (!['sprites', ...RESOURCE_FILES].includes(key)) throw new Error(`Unknown resource category: ${key}`)
    const resources = Object.fromEntries(['sprites', ...RESOURCE_FILES].map(kind => [kind, { ...record(raw[kind] ?? {}, kind) }])) as ResourceManifest
    for (const [id, sprite] of Object.entries(resources.sprites)) {
        qualifiedId(id)
        if (!sprite || typeof sprite !== 'object') throw new Error(`Invalid sprite: ${id}`)
        const [width, height] = pngSize(files, sprite.file)
        if (![sprite.width, sprite.height, sprite.scale ?? 1].every(v => Number.isFinite(v) && v > 0)
            || width !== sprite.width * (sprite.scale ?? 1) || height !== sprite.height * (sprite.scale ?? 1)) throw new Error(`Sprite dimensions do not match: ${id}`)
        for (const [values, length] of [[sprite.rect, 4], [sprite.offset, 2], [sprite.borders, 4]] as const) {
            if (values !== undefined && (!Array.isArray(values) || values.length !== length || !values.every(Number.isFinite))) throw new Error(`Invalid sprite geometry: ${id}`)
        }
        if (sprite.animations !== undefined && (!Array.isArray(sprite.animations) || sprite.animations.some(id => typeof id !== 'string'))) throw new Error(`Invalid sprite animations: ${id}`)
    }
    for (const kind of RESOURCE_FILES) for (const [id, file] of Object.entries(resources[kind])) {
        qualifiedId(id)
        relativeFile(file)
        if (!files[file]) throw new Error(`Missing ZIP file: ${file}`)
        if (kind === 'audio' && !/\.(mp3|wav)$/i.test(file)) throw new Error(`Mod audio must be MP3 or WAV: ${id}`)
        if (['json', 'reanim', 'particles', 'music'].includes(kind)) contentJson(files, file)
        if (kind === 'fonts') {
            const config = contentJson(files, file)
            if (!Array.isArray(config.layers) || !config.layers.length) throw new Error(`Invalid font: ${id}`)
            const directory = file.slice(0, file.lastIndexOf('/') + 1)
            for (const layer of config.layers) { relativeFile(layer.image); pngSize(files, `${directory}${layer.image}.png`) }
        }
    }
    const result: ModContent = { resources }
    for (const kind of ['gameplay', 'presentation'] as const) {
        if (source[kind] !== undefined) {
            relativeFile(source[kind])
            contentJson(files, source[kind])
            result[kind] = source[kind]
        }
    }
    return result
}

export function pngSize(files: ContentFiles, file: string): [number, number] {
    relativeFile(file)
    const bytes = files[file]
    if (!bytes) throw new Error(`Missing ZIP file: ${file}`)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452) throw new Error(`Invalid PNG: ${file}`)
    return [view.getUint32(16), view.getUint32(20)]
}

function record(value: unknown, name: string): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`)
    return value as Record<string, any>
}

function qualifiedId(id: string): void {
    // Extracted art IDs preserve original spelling, including spaces and uppercase letters.
    if (!/^[a-z0-9][a-z0-9._-]*:.+$/i.test(id)) throw new Error(`Invalid resource ID: ${id}`)
}
