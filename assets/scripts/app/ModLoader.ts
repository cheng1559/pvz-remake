import { DefinitionSources, buildGameplayContent, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { assertPresented } from '@/client/content/assertPresented'
import { basePresentationJson } from '@/client/content/loadPresentationDefinitions'
import { modResources } from '@/client/content/ModResources'
import { ModAssets } from '@/shared/mod/ModAssets'
import type { ModHost } from '@/shared/mod/ModHost'
import type { ModManifest } from '@/shared/mod'
import { contentJson } from '@/shared/mod/content'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { createServerModHost } from '@/server/session/createModHost'
import { ClientViews } from '@/client/content/ClientViews'
import { modManager } from '@/client/content/ModManager'
import { importModModule, mountMod } from '@/client/content/ModRuntime'
import { ClientModAssets, createClientModHost } from '@/client/content/createModHost'

interface ModModule { register(context: { host: ModHost, assets: ModAssets }): void | Promise<void> }
let installedMods: Promise<LoadedMods> | undefined
export type LoadedMods = Awaited<ReturnType<typeof loadMods>>

export function loadInstalledMods(): Promise<LoadedMods> { return installedMods ??= loadMods() }

async function loadMods() {
    const installed = await modManager.ready().catch(error => {
        console.error('[Mods] Failed to read enabled Mods; starting without Mods', error)
        return []
    })
    // Load only base data here. Resolving installed Mods from this read would await this same promise.
    const base = installed.length ? await loadBaseDefinitions() : undefined
    const gameplayDefinitions = new DefinitionSources()
    const presentationDefinitions = new DefinitionSources()
    const gameplay = new GameplayRegistry()
    const views = new ClientViews()
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
            views.checkpoint()]
        const hosts: ModHost[] = []
        let stage = 'mount'
        try {
            console.info(`[Mods] Loading ${manifest.id}@${manifest.version}`)
            if (manifest.gameplay || manifest.client) await mountMod(mod)
            stage = 'content'
            const assets = new ModAssets(manifest, mod.files)
            if (mod.content.gameplay) gameplayDefinitions.register(manifest.id, assets.json(mod.content.gameplay))
            if (mod.content.presentation) presentationDefinitions.register(manifest.id, assets.json(mod.content.presentation))
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
                const host = createClientModHost(manifest.id, presentationDefinitions, views)
                hosts.push(host)
                await module.register({ host, assets: new ClientModAssets(manifest, mod.files) })
            }
            stage = 'definitions'
            const content = buildGameplayContent(base!.gameplay, gameplayDefinitions.sources)
            const presentation = buildPresentationDefinitions(base!.presentation, presentationDefinitions.sources)
            gameplay.validate(content.definitions, content.levels)
            new ClientAnimationRegistry(presentation)
            assertPresented(content, presentation, views)
            manifests.push(manifest)
            loadedIds.add(manifest.id)
        } catch (error) {
            for (const host of hosts.reverse()) host.dispose()
            for (const undo of rollback.reverse()) undo()
            fail(manifest.id, stage, error)
        }
    }
    Object.freeze(gameplayDefinitions.sources)
    Object.freeze(presentationDefinitions.sources)
    if (manifests.length) console.info(`[Mods] Loaded ${manifests.map(mod => mod.id).join(', ')}`)
    return { manifests, gameplay, views,
        gameplayDefinitions: gameplayDefinitions.sources, presentationDefinitions: presentationDefinitions.sources }
}

async function loadBaseDefinitions() {
    const base = await modResources.baseContent()
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    const presentation = basePresentationJson(base)
    // The base is sound before any Mod is layered on it, so a Mod's failure below is the Mod's.
    buildGameplayContent(gameplay)
    new ClientAnimationRegistry(buildPresentationDefinitions(presentation))
    return { gameplay, presentation }
}
