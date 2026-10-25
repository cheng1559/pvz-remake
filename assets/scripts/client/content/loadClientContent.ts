import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'
import { loadInstalledMods } from '@/app/ModLoader'
import { ClientContentLoader } from './ClientContentLoader'
import { ContentRegistry } from './ContentRegistry'

let pending: ReturnType<typeof loadAssets> | undefined

/** Shared presentation resources, without loading a level prefab or gameplay definitions. */
export function loadClientContent() {
    return pending ??= loadAssets().catch(error => { pending = undefined; throw error })
}

async function loadAssets() {
    const loader = new ClientContentLoader()
    const [manifest, loadedMods] = await Promise.all([loader.loadManifest(), loadInstalledMods()])
    const registry = new ContentRegistry()
    registry.register(manifest)
    for (const [, content] of loadedMods.clientContent.entries()) {
        if (CONTENT_CATEGORIES.indexOf(content.kind as ContentCategory) < 0 || content.path === undefined) continue
        registry.registerEntry({
            category: content.kind as ContentCategory, id: content.id, contentId: content.ownerId,
            contentVersion: content.ownerVersion, contentHash: content.contentHash,
            bundle: content.bundle, path: content.path, schemaVersion: 2,
        })
    }
    registry.freeze()
    return { manifest, loadedMods, registry, loader }
}
