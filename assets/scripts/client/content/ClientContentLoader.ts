import { Asset, AudioClip, JsonAsset, SpriteFrame, Texture2D } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { parseFont } from '@/shared/content/font'
import { parseContentManifest, type ContentManifest } from '@/shared/content/index'
import { parseParticle, type Particle } from '@/shared/content/particle'
import { ContentRegistry, type ResolvedContent } from './ContentRegistry'
import { resourcePacks } from './ResourcePacks'
import { loadArchiveAsset } from './ModRuntime'

type AssetType<T extends Asset> = new (...args: any[]) => T

export class ClientContentLoader {
    private readonly assets = new Map<string, Promise<Asset>>()
    private readonly manifests = new Map<string, Promise<ContentManifest>>()

    load<T extends Asset>(content: ResolvedContent, type: AssetType<T>, animation?: string): Promise<T> {
        const key = `${content.contentHash}:${content.category}:${content.id}:${content.path}:${type.name}:${animation ?? ''}`
        const cached = this.assets.get(key) as Promise<T> | undefined
        if (cached) return cached

        const promise = (async () => {
            const assetType: AssetType<Asset> = type
            const id = content.category === 'music' && assetType === AudioClip
                ? `${content.id.split(':')[0]}:${content.path.slice(content.path.lastIndexOf('/') + 1)}` : content.id
            const replacement = await resourcePacks.asset(id, type, animation)
            if (replacement !== undefined) return replacement
            if (content.bundle.startsWith('pvzmod:///')) return loadArchiveAsset(content.bundle + content.path, type)
            throw new Error(`Missing ${content.category} asset: ${id}`)
        })().catch(error => {
            this.assets.delete(key)
            throw error
        })
        this.assets.set(key, promise)
        return promise
    }

    loadManifest(): Promise<ContentManifest> {
        const cached = this.manifests.get('base')
        if (cached) return cached

        const promise = resourcePacks.baseJson('pvz:content').then(parseContentManifest).catch(error => {
            this.manifests.delete('base')
            throw error
        })
        this.manifests.set('base', promise)
        return promise
    }
}

export class SpriteRepository {
    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    async load(id: string, animation?: string): Promise<SpriteFrame> {
        const replacement = await resourcePacks.asset(id, SpriteFrame, animation)
        if (replacement) return replacement
        const content = this.registry.resolve('sprites', id)
        if (!content) throw new Error(`unknown sprite: ${id}`)
        return this.loader.load(content, SpriteFrame, animation)
    }
}

export class FontRepository {
    private readonly cache = new Map<string, Promise<BitmapFontAssets>>()

    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    async load(id: string): Promise<BitmapFontAssets> {
        const replacement = await resourcePacks.font(id)
        if (replacement) return replacement
        const content = this.registry.resolve('fonts', id)
        if (!content) return Promise.reject(new Error(`unknown font: ${id}`))
        const key = id
        const cached = this.cache.get(key)
        if (cached) return cached

        const promise = this.loader.load(content, JsonAsset).then(async config => {
            const data = parseFont(config.json)
            if (data.id !== id) throw new Error(`font ID mismatch: expected ${id}, got ${data.id}`)
            const directory = content.path.slice(0, Math.max(0, content.path.lastIndexOf('/') + 1))
            const textures = await Promise.all(data.layers.map(layer => this.loader.load({ ...content,
                id: `${id}/${layer.image}`, path: `${directory}${layer.image}.png`,
            }, Texture2D)))
            for (const texture of textures) {
                texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
                texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST)
            }
            return { config, textures }
        }).catch(error => {
            this.cache.delete(key)
            throw error
        })
        this.cache.set(key, promise)
        return promise
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
