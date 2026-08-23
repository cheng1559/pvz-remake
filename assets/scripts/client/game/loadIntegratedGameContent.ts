import { JsonAsset, Prefab } from 'cc'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { loadInstalledMods } from '@/client/content/ModLoader'
import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'
import {
    parseGameplayDefinitionsV2,
    parseGameplayLevelsV2,
    parseGameplayStringsV2,
} from '@/shared/content/gameplay'

export async function loadIntegratedGameContent(location = 'pvz-base') {
    const loader = new ClientContentLoader()
    const [manifest, loadedMods] = await Promise.all([
        loader.loadManifest(location),
        loadInstalledMods(),
    ])
    const bundle = await loader.loadBundle(manifest.client.bundle)
    const loadJson = (path: string) => new Promise<JsonAsset>((resolve, reject) => {
        bundle.load(path.replace(/\.json$/i, ''), JsonAsset, (error, asset) => error ? reject(error) : resolve(asset))
    })
    const prefabPath = manifest.client.prefabs['pvz:adventure11']
    if (!prefabPath) throw new Error('Bundle pvz-base does not define prefab pvz:adventure11')
    const loadPrefab = () => new Promise<Prefab>((resolve, reject) => {
        bundle.load(prefabPath.replace(/\.prefab$/i, ''), Prefab, (error, asset) => error ? reject(error) : resolve(asset))
    })
    const [definitionsAsset, levelsAsset, stringsAsset, adventure11Prefab] = await Promise.all([
        loadJson(manifest.gameplay.definitions),
        loadJson(manifest.gameplay.levels),
        loadJson(manifest.gameplay.strings),
        loadPrefab(),
    ])
    const definitions = parseGameplayDefinitionsV2(definitionsAsset.json)
    const levels = parseGameplayLevelsV2(levelsAsset.json, definitions)
    const strings = parseGameplayStringsV2(stringsAsset.json)
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
    const animations = new ClientAnimationRegistry()
    for (const operation of loadedMods.clientAnimations) {
        animations.registerLoaded(operation.ownerId, operation.targetId, operation.mode, operation.value)
    }
    animations.freeze()
    const enabledMods = loadedMods.manifests
        .filter(mod => mod.gameplay !== undefined)
        .map(mod => ({ id: mod.id, version: mod.version, contentHash: mod.contentHash }))
    return {
        definitions, levels, strings, adventure11Prefab, registry, loader,
        contentHash: manifest.contentHash, loadedMods, enabledMods, animations,
    }
}
