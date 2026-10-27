import { CONTENT_CATEGORIES, type ContentCategory } from '@/shared/content/index'
import type { ContentArchive } from '@/shared/mod/content'
import { ModAssets } from '@/shared/mod/ModAssets'
import { archiveEntries } from './ArchiveContentRegistry'

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

    register(archive: ContentArchive): void {
        const { manifest, content, files } = archive
        if (this.frozen) throw new Error('content registry is frozen')
        if (this.contentIds.has(manifest.id)) throw new Error(`duplicate content manifest: ${manifest.id}`)
        const entries = [...archiveEntries(new ModAssets(manifest, files), content.resources)]
        for (const entry of entries) {
            if (this.values.get(entry.kind)!.has(entry.id)) throw new Error(`duplicate ${entry.kind} content: ${entry.id}`)
        }
        this.contentIds.add(manifest.id)
        for (const entry of entries) this.registerEntry({ category: entry.kind, id: entry.id, path: entry.path,
            contentId: entry.ownerId, contentVersion: entry.ownerVersion, contentHash: entry.contentHash,
            bundle: entry.bundle, schemaVersion: 2 })
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
