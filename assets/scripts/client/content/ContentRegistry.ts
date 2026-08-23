import {
    CONTENT_CATEGORIES,
    type ContentCategory,
    type ContentManifestV2,
} from '@/shared/content/index'

export interface ResolvedContent<K extends ContentCategory = ContentCategory> {
    readonly category: K
    readonly id: string
    readonly contentId: string
    readonly contentVersion: string
    readonly contentHash: string
    readonly bundle: string
    readonly path: string
    readonly schemaVersion: 2
}

export class ContentRegistry {
    private readonly values = new Map<ContentCategory, Map<string, ResolvedContent>>()
    private readonly contentIds = new Set<string>()
    private frozen = false

    constructor() {
        for (const category of CONTENT_CATEGORIES) this.values.set(category, new Map())
    }

    register(manifest: ContentManifestV2): void {
        if (this.frozen) throw new Error('content registry is frozen')
        if (this.contentIds.has(manifest.id)) throw new Error(`duplicate content manifest: ${manifest.id}`)
        for (const category of CONTENT_CATEGORIES) {
            const values = this.values.get(category)!
            for (const id of Object.keys(manifest.client[category])) {
                if (values.has(id)) throw new Error(`duplicate ${category} content: ${id}`)
            }
        }

        this.contentIds.add(manifest.id)
        for (const category of CONTENT_CATEGORIES) {
            const values = this.values.get(category)!
            for (const [id, path] of Object.entries(manifest.client[category])) {
                values.set(id, {
                    category,
                    id,
                    contentId: manifest.id,
                    contentVersion: manifest.version,
                    contentHash: manifest.contentHash,
                    bundle: manifest.client.bundle,
                    path,
                    schemaVersion: 2,
                })
            }
        }
    }

    registerEntry(content: ResolvedContent): void {
        if (this.frozen) throw new Error('content registry is frozen')
        const values = this.values.get(content.category)!
        if (values.has(content.id)) throw new Error(`duplicate ${content.category} content: ${content.id}`)
        values.set(content.id, content)
    }

    resolve<K extends ContentCategory>(category: K, id: string): ResolvedContent<K> | undefined {
        return this.values.get(category)!.get(id) as ResolvedContent<K> | undefined
    }

    entries<K extends ContentCategory>(category: K): IterableIterator<[string, ResolvedContent<K>]> {
        return this.values.get(category)!.entries() as IterableIterator<[string, ResolvedContent<K>]>
    }

    freeze(): void {
        if (this.frozen) return
        this.frozen = true
        for (const values of this.values.values()) {
            for (const value of values.values()) Object.freeze(value)
        }
    }
}
