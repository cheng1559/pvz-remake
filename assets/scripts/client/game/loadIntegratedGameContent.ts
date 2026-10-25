import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { JsonAsset, Prefab, resources } from 'cc'
import { loadClientContent } from '@/client/content/loadClientContent'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { modResources } from '@/client/content/ModResources'

// Preserve the installed asset ID and prefab UUID for existing content packs and saves.
export const LEVEL_PREFAB_ID = 'pvz:level'

export async function loadIntegratedGameContent() {
    const { manifest, loadedMods, registry, loader } = await loadClientContent()
    const loadJson = (path: string) => modResources.baseJson(`pvz:${path.replace(/\.json$/i, '')}`)
    const prefabPath = manifest.client.prefabs[LEVEL_PREFAB_ID]
    if (!prefabPath) throw new Error(`Base content does not define prefab ${LEVEL_PREFAB_ID}`)
    const loadPrefab = () => new Promise<Prefab>((resolve, reject) => {
        resources.load(prefabPath.replace(/\.prefab$/i, ''), Prefab, (error, asset) => error ? reject(error) : resolve(asset))
    })
    const [definitionsAsset, levelsAsset, stringsAsset, seedCatalog, levelPrefab, presentation] = await Promise.all([
        loadJson(manifest.gameplay.definitions),
        loadJson(manifest.gameplay.levels),
        modResources.asset(`${manifest.id.split(':')[0]}:${manifest.gameplay.strings.replace(/\.json$/i, '')}`, JsonAsset)
            .then(asset => asset ? asset.json : loadJson(manifest.gameplay.strings)),
        loadJson(manifest.gameplay.seedCatalog),
        loadPrefab(),
        loadPresentationDefinitions(manifest),
    ])
    const { definitions, levels, strings } = buildGameplayContent(
        definitionsAsset, levelsAsset, stringsAsset, seedCatalog, loadedMods.gameplayDefinitions,
    )
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
        definitions, presentation, levels, strings, levelPrefab, registry, loader,
        contentHash: manifest.contentHash, loadedMods, enabledMods, animations, plantViews, zombieViews,
        saveCompatibleHashes: manifest.saveCompatibleHashes ?? [],
    }
}
