import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { JsonAsset, Prefab, resources } from 'cc'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { loadInstalledMods } from '@/app/ModLoader'
import { resourcePacks } from '@/client/content/ResourcePacks'
import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'

// Preserve the installed asset ID and prefab UUID for existing content packs and saves.
export const LEVEL_PREFAB_ID = 'pvz:level'

export async function loadIntegratedGameContent() {
    const loader = new ClientContentLoader()
    const [manifest, loadedMods] = await Promise.all([
        loader.loadManifest(),
        loadInstalledMods(),
    ])
    const loadJson = (path: string) => resourcePacks.baseJson(`pvz:${path.replace(/\.json$/i, '')}`)
    const prefabPath = manifest.client.prefabs[LEVEL_PREFAB_ID]
    if (!prefabPath) throw new Error(`Base content does not define prefab ${LEVEL_PREFAB_ID}`)
    const loadPrefab = () => new Promise<Prefab>((resolve, reject) => {
        resources.load(prefabPath.replace(/\.prefab$/i, ''), Prefab, (error, asset) => error ? reject(error) : resolve(asset))
    })
    const [definitionsAsset, levelsAsset, stringsAsset, levelPrefab, presentation] = await Promise.all([
        loadJson(manifest.gameplay.definitions),
        loadJson(manifest.gameplay.levels),
        resourcePacks.asset(`${manifest.id.split(':')[0]}:${manifest.gameplay.strings.replace(/\.json$/i, '')}`, JsonAsset)
            .then(asset => asset ? asset.json : loadJson(manifest.gameplay.strings)),
        loadPrefab(),
        loadPresentationDefinitions(manifest),
    ])
    const { definitions, levels, strings } = buildGameplayContent(
        definitionsAsset, levelsAsset, stringsAsset, loadedMods.gameplayDefinitions,
    )
    const registry = new ContentRegistry()
    registry.register(manifest)
    for (const [, content] of loadedMods.clientContent.entries()) {
        if (CONTENT_CATEGORIES.indexOf(content.kind as ContentCategory) < 0 || content.path === undefined) continue
        registry.registerEntry({
            category: content.kind as ContentCategory,
            id: content.id,
            contentId: content.ownerId,
            contentVersion: content.ownerVersion,
            contentHash: content.contentHash,
            bundle: content.bundle,
            path: content.path,
            schemaVersion: 2,
        })
    }
    registry.freeze()
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
        .filter(mod => mod.gameplay !== undefined)
        .map(mod => ({ id: mod.id, version: mod.version, contentHash: mod.contentHash }))
    return {
        definitions, presentation, levels, strings, levelPrefab, registry, loader,
        contentHash: manifest.contentHash, loadedMods, enabledMods, animations, plantViews, zombieViews,
        saveCompatibleHashes: manifest.saveCompatibleHashes ?? [],
    }
}
