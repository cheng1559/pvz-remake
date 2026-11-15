import { BASE_MOD_ID } from '@/shared/mod'
import { Asset, JsonAsset, Prefab, resources, SpriteFrame } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { ContentArchive } from '@/shared/mod/content'
import { parseParticle, type Particle } from '@/shared/content/particle'
import { ContentRegistry, type ResolvedContent } from './ContentRegistry'
import { modResources } from './ModResources'

type AssetType<T extends Asset> = new (...args: any[]) => T

export class ClientContentLoader {
    private readonly assets = new Map<string, Promise<Asset>>()

    load<T extends Asset>(content: ResolvedContent, type: AssetType<T>, animation?: string): Promise<T> {
        const key = `${content.contentHash}:${content.category}:${content.id}:${content.path}:${type.name}:${animation ?? ''}`
        const cached = this.assets.get(key) as Promise<T> | undefined
        if (cached) return cached

        const promise = (async () => {
            const assetType: AssetType<Asset> = type
            // Engine-imported prefabs retain their compiled script and dependency bindings.
            if (assetType === Prefab && content.contentId === BASE_MOD_ID) {
                const path = content.path.replace(/^assets\/prefabs\//, '').replace(/\.prefab$/i, '')
                return new Promise<T>((resolve, reject) => resources.load(path, type,
                    (error, asset) => error ? reject(error) : resolve(asset)))
            }
            const replacement = await modResources.asset(content.id, type, animation, assetType === JsonAsset ? content.category : undefined)
            return replacement ?? modResources.file(content.contentId, content.path, type)
        })().catch(error => {
            this.assets.delete(key)
            throw error
        })
        this.assets.set(key, promise)
        return promise
    }

    loadBaseContent(): Promise<ContentArchive> { return modResources.baseContent() }
}

export class SpriteRepository {
    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    async load(id: string, animation?: string): Promise<SpriteFrame> {
        const replacement = await modResources.asset(id, SpriteFrame, animation)
        if (replacement) return replacement
        const content = this.registry.resolve('sprites', id)
        if (!content) throw new Error(`unknown sprite: ${id}`)
        return this.loader.load(content, SpriteFrame, animation)
    }
}

/** A bitmap font of the content, with any replacement a pack makes of it (ModResources). */
export class FontRepository {
    async load(id: string): Promise<BitmapFontAssets> {
        const font = await modResources.font(id)
        if (!font) throw new Error(`unknown font: ${id}`)
        return font
    }
}

export class ParticleRepository {
    private readonly cache = new Map<string, Promise<Particle>>()

    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    load(id: string): Promise<Particle> {
        const cached = this.cache.get(id)
        if (cached) return cached
        const content = this.registry.resolve('particles', id)
        if (!content) return Promise.reject(new Error(`unknown particle: ${id}`))

        const promise = this.loader.load(content, JsonAsset).then(asset => {
            const data = parseParticle(asset.json)
            if (data.id !== id) throw new Error(`particle ID mismatch: expected ${id}, got ${data.id}`)
            return data
        }).catch(error => {
            this.cache.delete(id)
            throw error
        })
        this.cache.set(id, promise)
        return promise
    }
}
