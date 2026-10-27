import { DefinitionSources, buildGameplayContent, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { ModAssets } from '@/shared/mod/ModAssets'
import type { ModHost } from '@/shared/mod/ModHost'
import type { ModManifest } from '@/shared/mod'
import { contentJson } from '@/shared/mod/content'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { createServerModHost } from '@/server/createModHost'
import { PlantViewRegistry } from '@/client/plants/PlantViewRegistry'
import { ZombieViewRegistry } from '@/client/zombies/ZombieViewRegistry'
import { ArchiveContentRegistry } from '@/client/content/ArchiveContentRegistry'
import { modManager } from '@/client/content/ModManager'
import { clearModRuntimeCache, importModModule, mountMod } from '@/client/content/ModRuntime'

interface ModModule { register(context: { host: ModHost, assets: ModAssets }): void | Promise<void> }
let installedMods: Promise<LoadedMods> | undefined
export type LoadedMods = Awaited<ReturnType<typeof loadMods>>

export function loadInstalledMods(): Promise<LoadedMods> { return installedMods ??= loadMods() }

async function loadMods() {
    const installed = await modManager.ready().catch(error => {
        console.error('[Mods] Failed to read enabled Mods; starting without Mods', error)
        return []
    })
    clearModRuntimeCache()
    // Load only base data here. Resolving installed Mods from this read would await this same promise.
    const base = installed.length ? await loadBaseDefinitions() : undefined
    const gameplayDefinitions = new DefinitionSources()
    const presentationDefinitions = new DefinitionSources()
    const gameplay = new GameplayRegistry()
    const plantViews = new PlantViewRegistry()
    const zombieViews = new ZombieViewRegistry()
    const clientContent = new ArchiveContentRegistry()
    const manifests: ModManifest[] = []
    const loadedIds = new Set<string>()
    const fail = (id: string, stage: string, error: unknown) => {
        const message = `${stage}: ${error instanceof Error ? error.message : String(error)}`
        modManager.failures.set(id, message)
        console.error(`[Mods] Skipped ${id} for this session (${message})`, error)
    }
    for (const mod of installed) {
        const { manifest } = mod
        const missing = manifest.dependencies.find(dependency => !loadedIds.has(dependency.id))
        if (missing) { fail(manifest.id, 'dependencies', `Dependency failed to load: ${missing.id}`); continue }
        const rollback = [gameplayDefinitions.checkpoint(), presentationDefinitions.checkpoint(), gameplay.checkpoint(),
            plantViews.checkpoint(), zombieViews.checkpoint(), clientContent.checkpoint()]
        const hosts: ModHost[] = []
        let stage = 'mount'
        try {
            console.info(`[Mods] Loading ${manifest.id}@${manifest.version}`)
            if (manifest.gameplay || manifest.client) await mountMod(mod)
            stage = 'content'
            const assets = new ModAssets(manifest, mod.files)
            if (mod.content.gameplay) gameplayDefinitions.register(manifest.id, assets.json(mod.content.gameplay))
            if (mod.content.presentation) presentationDefinitions.register(manifest.id, assets.json(mod.content.presentation))
            clientContent.register(assets, mod.content.resources)
            if (manifest.gameplay) {
                stage = manifest.gameplay.cocosModule
                const module = await importModModule(manifest.id, stage) as ModModule
                const host = createServerModHost(manifest.id, gameplay, gameplayDefinitions)
                hosts.push(host)
                await module.register({ host, assets: new ModAssets(manifest, mod.files) })
            }
            if (manifest.client) {
                stage = manifest.client.module
                const module = await importModModule(manifest.id, stage) as ModModule
                // The host exposes game/UI modules that also consume this loader.
                const { ClientModAssets, createClientModHost } = await import('@/client/content/createModHost')
                const host = createClientModHost(manifest.id, presentationDefinitions, clientContent, plantViews, zombieViews)
                hosts.push(host)
                await module.register({ host, assets: new ClientModAssets(manifest, mod.files) })
            }
            stage = 'definitions'
            const content = buildGameplayContent(base!.gameplay, gameplayDefinitions.sources)
            const presentation = buildPresentationDefinitions(base!.presentation, presentationDefinitions.sources)
            gameplay.validate(content.definitions)
            new ClientAnimationRegistry(presentation)
            for (const id of Object.keys(content.definitions.plants)) {
                const view = presentation.plants[id]?.view
                if (!view || !plantViews.has(view)) throw new Error(`Plant presentation is not installed: ${id}`)
            }
            for (const id of Object.keys(content.definitions.zombies)) {
                const view = presentation.zombies[id]
                if (!view || !zombieViews.has(view.view ?? 'zombie')) throw new Error(`Zombie presentation is not installed: ${id}`)
            }
            for (const id of Object.keys(content.definitions.projectiles)) {
                if (!presentation.projectiles[id]) throw new Error(`Projectile presentation is not installed: ${id}`)
            }
            manifests.push(manifest)
            loadedIds.add(manifest.id)
        } catch (error) {
            for (const host of hosts.reverse()) host.dispose()
            for (const undo of rollback.reverse()) undo()
            fail(manifest.id, stage, error)
        }
    }
    clientContent.freeze()
    Object.freeze(gameplayDefinitions.sources)
    Object.freeze(presentationDefinitions.sources)
    if (manifests.length) console.info(`[Mods] Loaded ${manifests.map(mod => mod.id).join(', ')}`)
    return { manifests, gameplay, plantViews, zombieViews, clientContent,
        gameplayDefinitions: gameplayDefinitions.sources, presentationDefinitions: presentationDefinitions.sources }
}

async function loadBaseDefinitions() {
    const base = await new ClientContentLoader().loadBaseContent()
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    const presentation = await loadPresentationDefinitions(base, [])
    buildGameplayContent(gameplay)
    new ClientAnimationRegistry(presentation)
    return { gameplay, presentation }
}
