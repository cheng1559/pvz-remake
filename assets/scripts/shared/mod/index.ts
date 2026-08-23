export interface ModDependency {
    id: string
    version: string
}

export interface ModManifest {
    schemaVersion: 1
    id: string
    version: string
    apiVersion: 1
    contentHash: string
    dependencies: ModDependency[]
    gameplay?: {
        nodeModule: string
        cocosModule: string
    }
    client?: {
        module: string
        bundle: string
    }
}

const qualifiedIdPattern = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$/
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/

export function isQualifiedId(value: unknown): value is string {
    return typeof value === 'string' && qualifiedIdPattern.test(value)
}

export function parseModManifest(value: unknown): ModManifest {
    const manifest = object(value, 'manifest')
    if (manifest.schemaVersion !== 1) throw new Error('manifest.schemaVersion must be 1')
    if (!isQualifiedId(manifest.id)) throw new Error('manifest.id must be a qualified ID')

    const version = semanticVersion(manifest.version, 'manifest.version')
    if (manifest.apiVersion !== 1) throw new Error('manifest.apiVersion must be 1')
    const contentHash = string(manifest.contentHash, 'manifest.contentHash')

    const dependencyIds = new Set<string>()
    const dependencies = array(manifest.dependencies, 'manifest.dependencies').map((entry, index) => {
            const dependency = object(entry, `manifest.dependencies[${index}]`)
            if (!isQualifiedId(dependency.id)) {
                throw new Error(`manifest.dependencies[${index}].id must be a qualified ID`)
            }
            if (dependencyIds.has(dependency.id)) throw new Error(`duplicate dependency: ${dependency.id}`)
            dependencyIds.add(dependency.id)
            const range = string(dependency.version, `manifest.dependencies[${index}].version`)
            semanticVersion(range.startsWith('>=') ? range.slice(2) : range, `manifest.dependencies[${index}].version`)
            return { id: dependency.id, version: range }
        })

    const gameplay = manifest.gameplay === undefined ? undefined : parseGameplay(manifest.gameplay)
    const client = manifest.client === undefined ? undefined : parseClient(manifest.client)
    if (!gameplay && !client) throw new Error('manifest must define gameplay or client')

    return {
        schemaVersion: 1,
        id: manifest.id,
        version,
        apiVersion: 1,
        contentHash,
        dependencies,
        gameplay,
        client,
    }
}

export function sortModManifests(manifests: readonly ModManifest[]): ModManifest[] {
    const byId = new Map<string, ModManifest>()
    for (const manifest of manifests) {
        if (byId.has(manifest.id)) throw new Error(`duplicate mod ID: ${manifest.id}`)
        byId.set(manifest.id, manifest)
    }

    const dependants = new Map<string, string[]>()
    const remaining = new Map<string, number>()
    for (const manifest of manifests) {
        remaining.set(manifest.id, manifest.dependencies.length)
        for (const dependency of manifest.dependencies) {
            const installed = byId.get(dependency.id)
            if (!installed) throw new Error(`${manifest.id} requires missing mod ${dependency.id}`)
            if (!versionSatisfies(installed.version, dependency.version)) {
                throw new Error(`${manifest.id} requires ${dependency.id} ${dependency.version}, found ${installed.version}`)
            }
            const list = dependants.get(dependency.id) ?? []
            list.push(manifest.id)
            dependants.set(dependency.id, list)
        }
    }

    let ready = [...byId.keys()].filter(id => remaining.get(id) === 0).sort()
    const sorted: ModManifest[] = []
    while (ready.length > 0) {
        const next: string[] = []
        for (const id of ready) {
            sorted.push(byId.get(id)!)
            for (const dependant of dependants.get(id)?.sort() ?? []) {
                const count = remaining.get(dependant)! - 1
                remaining.set(dependant, count)
                if (count === 0) next.push(dependant)
            }
        }
        ready = next.sort()
    }

    if (sorted.length !== manifests.length) throw new Error('mod dependency cycle')
    return sorted
}

export class Registry<T> {
    private readonly values = new Map<string, T>()
    private isFrozen = false

    register(id: string, value: T): void {
        if (this.isFrozen) throw new Error('registry is frozen')
        if (!isQualifiedId(id)) throw new Error(`invalid qualified ID: ${id}`)
        if (this.values.has(id)) throw new Error(`duplicate registration: ${id}`)
        this.values.set(id, value)
    }

    get(id: string): T | undefined {
        return this.values.get(id)
    }

    entries(): IterableIterator<[string, T]> {
        return this.values.entries()
    }

    freeze(): void {
        this.isFrozen = true
        for (const value of this.values.values()) deepFreeze(value)
    }
}

function versionSatisfies(version: string, range: string): boolean {
    if (!range.startsWith('>=')) return version === range
    const actual = version.match(versionPattern)!.slice(1).map(Number)
    const minimum = range.slice(2).match(versionPattern)!.slice(1).map(Number)
    for (let index = 0; index < 3; index++) {
        if (actual[index] !== minimum[index]) return actual[index] > minimum[index]
    }
    return true
}

function parseGameplay(value: unknown): ModManifest['gameplay'] {
    const gameplay = object(value, 'manifest.gameplay')
    return {
        nodeModule: relativePath(gameplay.nodeModule, 'manifest.gameplay.nodeModule'),
        cocosModule: relativePath(gameplay.cocosModule, 'manifest.gameplay.cocosModule'),
    }
}

function parseClient(value: unknown): ModManifest['client'] {
    const client = object(value, 'manifest.client')
    return {
        module: relativePath(client.module, 'manifest.client.module'),
        bundle: relativePath(client.bundle, 'manifest.client.bundle'),
    }
}

function relativePath(value: unknown, name: string): string {
    const path = string(value, name)
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
    const version = string(value, name)
    const match = version.match(versionPattern)
    if (!match) throw new Error(`${name} must use x.y.z`)
    if (match.slice(1).some(part => !Number.isSafeInteger(Number(part)))) {
        throw new Error(`${name} parts must be safe integers`)
    }
    return version
}

function deepFreeze(value: unknown, seen = new WeakSet<object>()): void {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return
    const target = value as object
    if (seen.has(target)) return
    seen.add(target)
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(target))) {
        if ('value' in descriptor) deepFreeze(descriptor.value, seen)
    }
    Object.freeze(target)
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}

function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
    return value
}

function string(value: unknown, name: string): string {
    if (!nonEmptyString(value)) throw new Error(`${name} must be a non-empty string`)
    return value
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
}
