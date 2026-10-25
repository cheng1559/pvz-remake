import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'
import { Registry } from '@/shared/mod'
import type { ModAssets } from '@/shared/mod/ModAssets'
import type { ResourceManifest } from '@/shared/mod/content'

export interface ArchiveContent {
    id: string
    kind: ContentCategory
    ownerId: string
    ownerVersion: string
    contentHash: string
    bundle: string
    path: string
}

/** Raw archive files use the same stable IDs and repositories as bundled content. */
export class ArchiveContentRegistry {
    private readonly values = new Registry<ArchiveContent>()
    register(assets: ModAssets, tables: ResourceManifest): void {
        for (const [resourceKind, entries] of Object.entries(tables)) {
            const kind = resourceKind === 'audio' ? 'sounds' : resourceKind
            if (!CONTENT_CATEGORIES.includes(kind as ContentCategory)) continue
            for (const [id, value] of Object.entries(entries)) {
                // Overrides resolve through ModResources; only new IDs enter the definition registry.
                if (!id.startsWith(assets.id.split(':')[0] + ':')) continue
                const path = typeof value === 'string' ? value : value.file
                assets.url(path)
                this.values.register(`${id}/${kind}`, { id, kind: kind as ContentCategory, path,
                    bundle: assets.baseUrl, ownerId: assets.id, ownerVersion: assets.manifest.version, contentHash: assets.manifest.contentHash })
            }
        }
    }
    entries() { return this.values.entries() }
    checkpoint(): () => void { return this.values.checkpoint() }
    freeze(): void { this.values.freeze() }
}
