import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content'
import { Registry } from '@/shared/mod'
import type { ModAssets } from '@/shared/mod/ModAssets'

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
    register(assets: ModAssets, tables: Partial<Record<ContentCategory, Record<string, string>>>): void {
        for (const [kind, entries] of Object.entries(tables)) {
            if (!CONTENT_CATEGORIES.includes(kind as ContentCategory)) throw new Error(`Unknown asset category: ${kind}`)
            for (const [id, path] of Object.entries(entries)) {
                if (!id.startsWith(assets.id.split(':')[0] + ':')) throw new Error(`${assets.id} cannot register ${id}`)
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
