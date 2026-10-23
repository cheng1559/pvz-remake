import { assetManager, type SpriteFrame } from 'cc'
import {
    isQualifiedId,
    Registry,
    type ModManifest,
} from '@/shared/mod'
import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'
import type { ClientScreenEnhancer } from './ClientScreenMods'
import { expandViewport } from '@/client/view/ClientViewport'
import { modManager } from './ModManager'
import { clearModRuntimeCache, importModModule, loadModSprite, modFileUrl, mountMod } from './ModRuntime'

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
    expandViewport: typeof expandViewport
    loadSprite(path: string): Promise<SpriteFrame>
    registerContent(value: Registration): void
    enhanceAnimation(targetId: string, patch: unknown): void
    replaceAnimation(targetId: string, definition: unknown): void
    enhanceScreen(targetId: string, apply: ClientScreenEnhancer): void
}

interface ModModule {
    register(api: GameplayModApi | ClientModApi): void | Promise<void>
}

export interface LoadedMods {
    manifests: readonly ModManifest[]
    gameplayDefinitions: Registry<Registration>
    clientContent: Registry<LoadedClientContent>
    gameplaySystems: readonly LoadedGameplaySystemMod[]
    plantUpgrades: readonly LoadedPlantUpgrade[]
    clientAnimations: readonly LoadedClientAnimationMod[]
    clientScreens: readonly { ownerId: string, targetId: string, apply: ClientScreenEnhancer }[]
}

let installedMods: Promise<LoadedMods> | undefined

export function loadInstalledMods(): Promise<LoadedMods> {
    return installedMods ??= loadMods()
}

async function loadMods(): Promise<LoadedMods> {
    const installed = await modManager.ready()
    clearModRuntimeCache()
    const manifests = installed.map(mod => mod.manifest)
    const gameplayDefinitions = new Registry<Registration>()
    const clientContent = new Registry<LoadedClientContent>()
    const gameplaySystems: LoadedGameplaySystemMod[] = []
    const plantUpgrades: LoadedPlantUpgrade[] = []
    const clientAnimations: LoadedClientAnimationMod[] = []
    const clientScreens: Array<{ ownerId: string, targetId: string, apply: ClientScreenEnhancer }> = []

    for (const mod of installed) {
        const { manifest } = mod
        console.info(`[Mods] Loading ${manifest.id}@${manifest.version}`)
        await mountMod(mod)
        if (manifest.gameplay) {
            const gameplay = await importModModule(manifest.id, manifest.gameplay.cocosModule) as ModModule
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
            const bundle = manifest.client.bundle ? await loadBundle(modFileUrl(manifest.id, manifest.client.bundle)) : null
            const client = await importModModule(manifest.id, manifest.client.module) as ModModule
            await client.register({
                expandViewport,
                loadSprite: async path => {
                    if (typeof path !== 'string' || !path || !isRelativeContentPath(path)) {
                        throw new Error(`${manifest.id} sprite path must stay inside its ZIP`)
                    }
                    return loadModSprite(manifest.id, path)
                },
                registerContent: value => {
                    if (bundle === null) throw new Error(`${manifest.id} must define client.bundle to register content`)
                    registerClientContent(clientContent, manifest, bundle, value)
                },
                enhanceAnimation: (targetId, value) => clientAnimations.push(
                    clientAnimationRegistration(manifest, targetId, 'enhance', value),
                ),
                replaceAnimation: (targetId, value) => clientAnimations.push(
                    clientAnimationRegistration(manifest, targetId, 'replace', value),
                ),
                enhanceScreen: (targetId, apply) => {
                    if (!isQualifiedId(targetId) || typeof apply !== 'function') {
                        throw new Error(`${manifest.id} registered an invalid screen enhancement`)
                    }
                    clientScreens.push(Object.freeze({ ownerId: manifest.id, targetId, apply }))
                },
            })
        }
    }

    gameplayDefinitions.freeze()
    clientContent.freeze()
    Object.freeze(gameplaySystems)
    Object.freeze(plantUpgrades)
    Object.freeze(clientAnimations)
    Object.freeze(clientScreens)
    if (manifests.length > 0) console.info(`[Mods] Loaded ${manifests.map(mod => mod.id).join(', ')}`)
    return { manifests, gameplayDefinitions, clientContent, gameplaySystems, plantUpgrades, clientAnimations, clientScreens }
}

function loadBundle(location: string): Promise<string> {
    return new Promise((resolve, reject) => {
        assetManager.loadBundle(location, (error, bundle) => error ? reject(error) : resolve(bundle.name))
    })
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
