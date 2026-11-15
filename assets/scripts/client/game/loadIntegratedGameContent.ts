import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { JsonAsset, Prefab } from 'cc'
import { loadClientContent } from '@/client/content/loadClientContent'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { assertPresented } from '@/client/content/assertPresented'
import { modResources } from '@/client/content/ModResources'
import { contentJson } from '@/shared/mod/content'

// Preserve the installed asset ID and prefab UUID for existing content packs and saves.
export const LEVEL_PREFAB_ID = 'pvz:level'

/** The gameplay definitions and levels with the enabled Mods' changes, without loading any level assets. */
export async function loadGameplayContent() {
    const { base, loadedMods } = await loadClientContent()
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    return { gameplay, ...buildGameplayContent(gameplay, loadedMods.gameplayDefinitions) }
}

export async function loadIntegratedGameContent() {
    const { base, loadedMods, registry, loader } = await loadClientContent()
    const { manifest } = base
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    const prefab = registry.resolve('prefabs', LEVEL_PREFAB_ID)
    if (!prefab) throw new Error(`Base content does not define prefab ${LEVEL_PREFAB_ID}`)
    const [levelPrefab, presentation] = await Promise.all([
        loader.load(prefab, Prefab),
        loadPresentationDefinitions(base),
    ])
    const { definitions, levels } = buildGameplayContent(gameplay, loadedMods.gameplayDefinitions)
    const animations = new ClientAnimationRegistry(presentation)
    animations.freeze()
    const plantViews = loadedMods.plantViews
    plantViews.freeze()
    const zombieViews = loadedMods.zombieViews
    zombieViews.freeze()
    const { projectileViews, gridItemViews } = loadedMods
    projectileViews.freeze()
    gridItemViews.freeze()
    assertPresented(definitions, presentation, { plants: plantViews, zombies: zombieViews, projectiles: projectileViews, gridItems: gridItemViews })
    const enabledMods = loadedMods.manifests
        .filter(mod => mod.gameplay !== undefined || loadedMods.gameplayDefinitions.some(source => source.ownerId === mod.id))
        .map(mod => ({ id: mod.id, version: mod.version, contentHash: mod.contentHash }))
    return {
        definitions, presentation, levels, levelPrefab, registry, loader,
        contentHash: manifest.contentHash, loadedMods, enabledMods, animations, plantViews, zombieViews, projectileViews, gridItemViews,
    }
}
