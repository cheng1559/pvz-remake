import { assetManager, native, sys } from 'cc'
import {
    isQualifiedId,
    parseModManifest,
    Registry,
    sortModManifests,
    type ModManifest,
} from '@/shared/mod'
import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'

interface Registration {
    id: string
    kind: string
    path?: string
}

export interface LoadedClientContent extends Registration {
    ownerId: string
    ownerVersion: string
    contentHash: string
    bundle: string
}

export type LoadedGameplaySystemMod = Readonly<{
    ownerId: string
    targetId: string
    mode: 'enhance' | 'replace'
    apply: unknown
}>

export type LoadedPlantUpgrade = Readonly<{
    ownerId: string
    seedId: string
    targetPlantId: string
    resultSeedId: string
}>

export type LoadedClientAnimationMod = Readonly<{
    ownerId: string
    targetId: string
    mode: 'enhance' | 'replace'
    value: unknown
}>

interface GameplayModApi {
    registerDefinition(value: Registration): void
    enhanceSystem(targetId: string, enhancer: unknown): void
    replaceSystem(targetId: string, replacement: unknown): void
    registerPlantUpgrade(value: unknown): void
}

interface ClientModApi {
    registerContent(value: Registration): void
    enhanceAnimation(targetId: string, patch: unknown): void
    replaceAnimation(targetId: string, definition: unknown): void
}

interface ModModule {
    register(api: GameplayModApi | ClientModApi): void | Promise<void>
}

interface LocatedMod {
    manifest: ModManifest
    root: string
}

export interface LoadedMods {
    manifests: readonly ModManifest[]
    gameplayDefinitions: Registry<Registration>
    clientContent: Registry<LoadedClientContent>
    gameplaySystems: readonly LoadedGameplaySystemMod[]
    plantUpgrades: readonly LoadedPlantUpgrade[]
    clientAnimations: readonly LoadedClientAnimationMod[]
}

let installedMods: Promise<LoadedMods> | undefined

export function loadInstalledMods(): Promise<LoadedMods> {
    return installedMods ??= loadMods()
}

async function loadMods(): Promise<LoadedMods> {
    const locations = await findManifestLocations()
    const located = await Promise.all(locations.map(loadManifest))
    const byId = new Map(located.map(mod => [mod.manifest.id, mod]))
    const manifests = sortModManifests(located.map(mod => mod.manifest))
    const gameplayDefinitions = new Registry<Registration>()
    const clientContent = new Registry<LoadedClientContent>()
    const gameplaySystems: LoadedGameplaySystemMod[] = []
    const plantUpgrades: LoadedPlantUpgrade[] = []
    const clientAnimations: LoadedClientAnimationMod[] = []

    for (const manifest of manifests) {
        const mod = byId.get(manifest.id)!
        if (manifest.gameplay) {
            const gameplay = await loadModule(resolvePath(mod.root, manifest.gameplay.cocosModule))
            await gameplay.register({
                registerDefinition: value => registerOwned(gameplayDefinitions, manifest, value),
                enhanceSystem: (targetId, apply) => gameplaySystems.push(
                    gameplaySystemRegistration(manifest, targetId, 'enhance', apply),
                ),
                replaceSystem: (targetId, apply) => gameplaySystems.push(
                    gameplaySystemRegistration(manifest, targetId, 'replace', apply),
                ),
                registerPlantUpgrade: value => plantUpgrades.push(plantUpgradeRegistration(manifest, value)),
            })
        }
        if (manifest.client) {
            const bundle = await loadBundle(resolvePath(mod.root, manifest.client.bundle))
            const client = await loadModule(resolvePath(mod.root, manifest.client.module))
            await client.register({
                registerContent: value => registerClientContent(clientContent, manifest, bundle, value),
                enhanceAnimation: (targetId, value) => clientAnimations.push(
                    clientAnimationRegistration(manifest, targetId, 'enhance', value),
                ),
                replaceAnimation: (targetId, value) => clientAnimations.push(
                    clientAnimationRegistration(manifest, targetId, 'replace', value),
                ),
            })
        }
    }

    gameplayDefinitions.freeze()
    clientContent.freeze()
    Object.freeze(gameplaySystems)
    Object.freeze(plantUpgrades)
    Object.freeze(clientAnimations)
    if (manifests.length > 0) console.info(`[Mods] Loaded ${manifests.map(mod => mod.id).join(', ')}`)
    return { manifests, gameplayDefinitions, clientContent, gameplaySystems, plantUpgrades, clientAnimations }
}

async function findManifestLocations(): Promise<string[]> {
    if (sys.isNative) {
        const root = `${native.fileUtils.getWritablePath().replace(/\\/g, '/').replace(/\/*$/, '')}/mods/`
        if (!native.fileUtils.isDirectoryExist(root)) return []
        return native.fileUtils.listFiles(root)
            .map(path => path.replace(/\\/g, '/').replace(/\/*$/, ''))
            .filter(path => !path.endsWith('/.') && !path.endsWith('/..'))
            .filter(path => native.fileUtils.isFileExist(`${path}/mod.json`))
            .map(path => `${path}/mod.json`)
            .sort()
    }

    const indexUrl = new URL('mods.json', location.href).href
    const response = await fetch(indexUrl)
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Failed to load ${indexUrl}: HTTP ${response.status}`)
    const value: unknown = await response.json()
    if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
        throw new Error('mods.json must be an array of manifest URLs')
    }
    return value.map(entry => new URL(entry, indexUrl).href)
}

async function loadManifest(location: string): Promise<LocatedMod> {
    const value: unknown = sys.isNative && isAbsolutePath(location)
        ? JSON.parse(native.fileUtils.getStringFromFile(location))
        : await fetch(location).then(async response => {
            if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`)
            return response.json() as Promise<unknown>
        })
    return { manifest: parseModManifest(value), root: location.slice(0, location.lastIndexOf('/') + 1) }
}

async function loadModule(location: string): Promise<ModModule> {
    const moduleId = sys.isNative && isAbsolutePath(location)
        ? `no-schema:/${location.replace(/\\/g, '/')}`
        : location
    const loaded = await import(moduleId) as ModModule
    if (typeof loaded.register !== 'function') throw new Error(`${location} must export register(api)`)
    return loaded
}

function loadBundle(location: string): Promise<string> {
    return new Promise((resolve, reject) => {
        assetManager.loadBundle(location, (error, bundle) => error ? reject(error) : resolve(bundle.name))
    })
}

function resolvePath(root: string, relative: string): string {
    return /^https?:/i.test(root) ? new URL(relative, root).href : `${root}${relative}`
}

function isAbsolutePath(path: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
}

function registerOwned(registry: Registry<Registration>, manifest: ModManifest, value: Registration): void {
    if (!value || !isQualifiedId(value.id) || typeof value.kind !== 'string' || value.kind.length === 0) {
        throw new Error(`${manifest.id} registered invalid content`)
    }
    const namespace = manifest.id.slice(0, manifest.id.indexOf(':') + 1)
    if (!value.id.startsWith(namespace)) throw new Error(`${manifest.id} cannot register ${value.id}`)
    registry.register(value.id, value)
}

function gameplaySystemRegistration(
    manifest: ModManifest,
    targetId: string,
    mode: 'enhance' | 'replace',
    apply: unknown,
): LoadedGameplaySystemMod {
    if (!isQualifiedId(targetId)) throw new Error(`${manifest.id} targets invalid gameplay system ${targetId}`)
    if (typeof apply !== 'function') throw new Error(`${manifest.id} registered invalid gameplay system callback`)
    return Object.freeze({ ownerId: manifest.id, targetId, mode, apply })
}

function plantUpgradeRegistration(manifest: ModManifest, value: unknown): LoadedPlantUpgrade {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${manifest.id} registered invalid plant upgrade`)
    }
    const upgrade = value as Record<string, unknown>
    const fields = Object.keys(upgrade)
    if (fields.length !== 3 || fields.some(field =>
        field !== 'seedId' && field !== 'targetPlantId' && field !== 'resultSeedId') ||
        !isQualifiedId(upgrade.seedId) || !isQualifiedId(upgrade.targetPlantId) ||
        !isQualifiedId(upgrade.resultSeedId)) {
        throw new Error(`${manifest.id} registered invalid plant upgrade`)
    }
    return Object.freeze({
        ownerId: manifest.id,
        seedId: upgrade.seedId,
        targetPlantId: upgrade.targetPlantId,
        resultSeedId: upgrade.resultSeedId,
    })
}

function clientAnimationRegistration(
    manifest: ModManifest,
    targetId: string,
    mode: 'enhance' | 'replace',
    value: unknown,
): LoadedClientAnimationMod {
    if (!isQualifiedId(targetId)) throw new Error(`${manifest.id} targets invalid client animation ${targetId}`)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${manifest.id} registered invalid client animation ${targetId}`)
    }
    return Object.freeze({ ownerId: manifest.id, targetId, mode, value: freezeValue(value) })
}

function registerClientContent(
    registry: Registry<LoadedClientContent>,
    manifest: ModManifest,
    bundle: string,
    value: Registration,
): void {
    if (!value || !isQualifiedId(value.id) || typeof value.kind !== 'string' || value.kind.length === 0) {
        throw new Error(`${manifest.id} registered invalid client content`)
    }
    const namespace = manifest.id.slice(0, manifest.id.indexOf(':') + 1)
    if (!value.id.startsWith(namespace)) throw new Error(`${manifest.id} cannot register ${value.id}`)
    const category = CONTENT_CATEGORIES.indexOf(value.kind as ContentCategory) >= 0
    if (category && (typeof value.path !== 'string' || value.path.length === 0)) {
        throw new Error(`${manifest.id} client ${value.kind} ${value.id} must define path`)
    }
    if (category && !isRelativeContentPath(value.path!)) {
        throw new Error(`${manifest.id} client content path must stay inside its bundle`)
    }
    if (!category && value.path !== undefined) {
        throw new Error(`${manifest.id} client content ${value.id} uses unknown category ${value.kind}`)
    }
    registry.register(value.id, {
        ...value,
        ownerId: manifest.id,
        ownerVersion: manifest.version,
        contentHash: manifest.contentHash,
        bundle,
    })
}

function isRelativeContentPath(path: string): boolean {
    let decoded: string
    try {
        decoded = decodeURIComponent(path)
    } catch {
        return false
    }
    return !/^(?:[A-Za-z]:|[\\/]|[a-z][a-z0-9+.-]*:)/i.test(decoded) &&
        decoded.split(/[\\/]/).indexOf('..') < 0
}

function freezeValue(value: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value) || seen.has(value)) return value
    seen.add(value)
    for (const child of Object.values(value)) freezeValue(child, seen)
    return Object.freeze(value)
}
