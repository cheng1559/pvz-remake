import { record, nonEmptyString } from '@/shared/validate'
export interface ModManifest {
    schemaVersion: 1
    id: string
    version: string
    apiVersion: 1
    contentHash: string
    /** The language of the text this Mod supplies (BCP 47, e.g. zh-CN); the last running Mod that declares one wins. */
    locale?: string
    /** Who made the Mod, shown in the Mod list. */
    author?: string
    gameplay?: {
        nodeModule: string
        cocosModule: string
    }
    client?: {
        module: string
        bundle?: string
    }
}

const qualifiedIdPattern = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$/
const modIdPattern = /^[a-z0-9][a-z0-9._-]*$/
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/

/** The built-in base game's Mod ID; its namespace holds every original resource and definition. */
export const BASE_MOD_ID = 'pvz'

export function isQualifiedId(value: unknown): value is string {
    return typeof value === 'string' && qualifiedIdPattern.test(value)
}

/** A Mod ID is a bare name, and that name is the Mod's namespace: `widescreen` owns `widescreen:...`. */
export function isModId(value: unknown): value is string {
    return typeof value === 'string' && modIdPattern.test(value)
}

/**
 * An ID as content writes it: one without a namespace names the base's (`peashooter` is `pvz:peashooter`), the one rule
 * the client reads resource IDs and view kinds by.
 */
export function baseQualified(id: string): string {
    return id.includes(':') ? id : `${BASE_MOD_ID}:${id}`
}

/** Whether a qualified ID is in this Mod's own namespace (added by it, not a replacement of another's). */
export function isOwnId(modId: string, id: string): boolean {
    return id.startsWith(`${modId}:`)
}

export function parseModManifest(value: unknown): ModManifest {
    const manifest = record(value, 'manifest')
    if (manifest.schemaVersion !== 1) throw new Error('manifest.schemaVersion must be 1')
    if (!isModId(manifest.id)) throw new Error('manifest.id must be a Mod name such as widescreen (its namespace)')

    const version = semanticVersion(manifest.version, 'manifest.version')
    if (manifest.apiVersion !== 1) throw new Error('manifest.apiVersion must be 1')
    const contentHash = nonEmptyString(manifest.contentHash, 'manifest.contentHash')

    if (manifest.locale !== undefined && (typeof manifest.locale !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(manifest.locale))) {
        throw new Error('manifest.locale must be a language tag such as zh-CN')
    }
    if (manifest.author !== undefined && (typeof manifest.author !== 'string' || !manifest.author.trim() || manifest.author.length > 64)) {
        throw new Error('manifest.author must be a non-empty name of at most 64 characters')
    }
    const gameplay = manifest.gameplay === undefined ? undefined : parseGameplay(manifest.gameplay)
    const client = manifest.client === undefined ? undefined : parseClient(manifest.client)

    return {
        schemaVersion: 1,
        id: manifest.id,
        version,
        apiVersion: 1,
        contentHash,
        ...(manifest.locale === undefined ? {} : { locale: manifest.locale as string }),
        ...(manifest.author === undefined ? {} : { author: (manifest.author as string).trim() }),
        gameplay,
        client,
    }
}

/**
 * Qualified IDs to values, each with the Mod that registered it when one is given. A checkpoint undoes whatever was
 * registered after it (freezing too); freezing ends registration and freezes the values.
 */
export class Registry<T> {
    private readonly values = new Map<string, { value: T, ownerId?: string }>()
    private isFrozen = false

    /** `name` is what it holds, for its errors: "level rule". */
    constructor(private readonly name?: string) {}

    register(id: string, value: T, ownerId?: string): void {
        if (this.isFrozen) throw new Error(this.name ? `${this.name} registry is frozen` : 'registry is frozen')
        if (!isQualifiedId(id)) throw new Error(`invalid qualified ID: ${id}`)
        if (ownerId !== undefined && !isModId(ownerId)) throw new Error(`invalid Mod ID: ${ownerId}`)
        const existing = this.values.get(id)
        if (existing) {
            throw new Error(existing.ownerId === undefined ? `duplicate registration: ${id}`
                : `${this.name ?? 'registration'} ${id} is already registered by ${existing.ownerId}`)
        }
        this.values.set(id, { value, ownerId })
    }

    has(id: string): boolean {
        return this.values.has(id)
    }

    get(id: string): T | undefined {
        return this.values.get(id)?.value
    }

    get size(): number {
        return this.values.size
    }

    *entries(): IterableIterator<[string, T]> {
        for (const [id, { value }] of this.values) yield [id, value]
    }

    checkpoint(): () => void {
        const keys = new Set(this.values.keys()), frozen = this.isFrozen
        return () => {
            for (const key of [...this.values.keys()]) if (!keys.has(key)) this.values.delete(key)
            this.isFrozen = frozen
        }
    }

    freeze(): void {
        this.isFrozen = true
        for (const { value } of this.values.values()) deepFreeze(value)
    }
}

function parseGameplay(value: unknown): ModManifest['gameplay'] {
    const gameplay = record(value, 'manifest.gameplay')
    return {
        nodeModule: relativePath(gameplay.nodeModule, 'manifest.gameplay.nodeModule'),
        cocosModule: relativePath(gameplay.cocosModule, 'manifest.gameplay.cocosModule'),
    }
}

function parseClient(value: unknown): ModManifest['client'] {
    const client = record(value, 'manifest.client')
    return {
        module: relativePath(client.module, 'manifest.client.module'),
        ...(client.bundle === undefined ? {} : { bundle: relativePath(client.bundle, 'manifest.client.bundle') }),
    }
}

function relativePath(value: unknown, name: string): string {
    const path = nonEmptyString(value, name)
    let decoded: string
    try {
        decoded = decodeURIComponent(path)
    } catch {
        throw new Error(`${name} must be a relative path inside the mod`)
    }
    if (/^(?:[A-Za-z]:|[\\/]|[a-z][a-z0-9+.-]*:)/i.test(decoded) || decoded.split(/[\\/]/).indexOf('..') >= 0) {
        throw new Error(`${name} must be a relative path inside the mod`)
    }
    return path
}

function semanticVersion(value: unknown, name: string): string {
    const version = nonEmptyString(value, name)
    const match = version.match(versionPattern)
    if (!match) throw new Error(`${name} must use x.y.z`)
    if (match.slice(1).some(part => !Number.isSafeInteger(Number(part)))) {
        throw new Error(`${name} parts must be safe integers`)
    }
    return version
}

export function deepFreeze(value: unknown, seen = new WeakSet<object>()): void {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return
    const target = value as object
    if (seen.has(target)) return
    seen.add(target)
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(target))) {
        if ('value' in descriptor) deepFreeze(descriptor.value, seen)
    }
    Object.freeze(target)
}
