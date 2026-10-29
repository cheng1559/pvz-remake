import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { JsonAsset, Prefab } from 'cc'
import { loadClientContent } from '@/client/content/loadClientContent'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { modResources } from '@/client/content/ModResources'
import { contentJson } from '@/shared/mod/content'

// Preserve the installed asset ID and prefab UUID for existing content packs and saves.
export const LEVEL_PREFAB_ID = 'pvz:level'

export async function loadIntegratedGameContent() {
    const { base, loadedMods, registry, loader } = await loadClientContent()
    const { manifest } = base
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    const prefab = registry.resolve('prefabs', LEVEL_PREFAB_ID)
    if (!prefab) throw new Error(`Base content does not define prefab ${LEVEL_PREFAB_ID}`)
    const [strings, levelPrefab, presentation] = await Promise.all([
        modResources.asset('pvz:gameplay/strings', JsonAsset).then(asset => asset?.json ?? gameplay.strings),
        loader.load(prefab, Prefab),
        loadPresentationDefinitions(base),
    ])
    const { definitions, levels, strings: gameStrings } = buildGameplayContent({ ...gameplay, strings }, loadedMods.gameplayDefinitions)
    const animations = new ClientAnimationRegistry(presentation)
    animations.freeze()
    const plantViews = loadedMods.plantViews
    plantViews.freeze()
    const zombieViews = loadedMods.zombieViews
    zombieViews.freeze()
    for (const id of Object.keys(definitions.plants)) {
        const definition = presentation.plants[id]
        if (!definition?.view || !plantViews.has(definition.view)) throw new Error(`Plant presentation is not installed: ${id}`)
    }
    for (const id of Object.keys(definitions.projectiles)) {
        if (!presentation.projectiles[id]) throw new Error(`Projectile presentation is not installed: ${id}`)
    }
    for (const id of Object.keys(definitions.zombies)) {
        const definition = presentation.zombies[id]
        if (!definition || !zombieViews.has(definition.view ?? 'zombie')) throw new Error(`Zombie presentation is not installed: ${id}`)
    }
    const enabledMods = loadedMods.manifests
        .filter(mod => mod.gameplay !== undefined || loadedMods.gameplayDefinitions.some(source => source.ownerId === mod.id))
        .map(mod => ({ id: mod.id, version: mod.version, contentHash: mod.contentHash }))
    return {
        definitions, presentation, levels, strings: gameStrings, levelPrefab, registry, loader,
        contentHash: manifest.contentHash, loadedMods, enabledMods, animations, plantViews, zombieViews,
    }
}
