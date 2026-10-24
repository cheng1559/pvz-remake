import { Asset, assetManager, AudioClip, JsonAsset, SpriteFrame, Texture2D } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { parseFont } from '@/shared/content/font'
import { parseContentManifest, type ContentManifest } from '@/shared/content/index'
import { parseMusic, type Music } from '@/shared/content/music'
import { parseParticle, type Particle } from '@/shared/content/particle'
import { ContentRegistry, type ResolvedContent } from './ContentRegistry'
import { resourcePacks } from './ResourcePacks'
import { loadArchiveAsset } from './ModRuntime'

type AssetBundle = NonNullable<ReturnType<typeof assetManager.getBundle>>
type AssetType<T extends Asset> = new (...args: any[]) => T

export class ClientContentLoader {
    private readonly bundles = new Map<string, Promise<AssetBundle>>()
    private readonly assets = new Map<string, Promise<Asset>>()
    private readonly manifests = new Map<string, Promise<ContentManifest>>()

    loadBundle(location: string): Promise<AssetBundle> {
        const loaded = assetManager.getBundle(location)
        if (loaded) return Promise.resolve(loaded)

        const pending = this.bundles.get(location)
        if (pending) return pending

        const promise = new Promise<AssetBundle>((resolve, reject) => {
            assetManager.loadBundle(location, (error, bundle) => error ? reject(error) : resolve(bundle))
        }).catch(error => {
            this.bundles.delete(location)
            throw error
        })
        this.bundles.set(location, promise)
        return promise
    }

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
            const bundle = await this.loadBundle(content.bundle)
            return bundle.get(content.path, type) ?? new Promise<T>((resolve, reject) => {
                bundle.load(content.path, type, (error, asset) => error ? reject(error) : resolve(asset))
            })
        })().catch(error => {
            this.assets.delete(key)
            throw error
        })
        this.assets.set(key, promise)
        return promise
    }

    loadManifest(location: string): Promise<ContentManifest> {
        const cached = this.manifests.get(location)
        if (cached) return cached

        const promise = this.loadBundle(location).then(bundle => bundle.get('manifest', JsonAsset) ?? new Promise<JsonAsset>((resolve, reject) => {
            bundle.load('manifest', JsonAsset, (error, asset) => error ? reject(error) : resolve(asset))
        })).then(asset => parseContentManifest(asset.json)).catch(error => {
            this.manifests.delete(location)
            throw error
        })
        this.manifests.set(location, promise)
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

        const promise = Promise.all([
            this.loader.load(content, JsonAsset),
            this.loader.loadBundle(content.bundle),
        ]).then(async ([config, bundle]) => {
            const data = parseFont(config.json)
            if (data.id !== id) throw new Error(`font ID mismatch: expected ${id}, got ${data.id}`)
            const directory = content.path.slice(0, Math.max(0, content.path.lastIndexOf('/') + 1))
            const textures = await Promise.all(data.layers.map(layer => new Promise<Texture2D>((resolve, reject) => {
                bundle.load(`${directory}${layer.image}/texture`, Texture2D, (error, texture) =>
                    error ? reject(error) : resolve(texture),
                )
            })))
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

export class SoundRepository {
    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    load(id: string): Promise<AudioClip> {
        const content = this.registry.resolve('sounds', id)
        if (!content) return Promise.reject(new Error(`unknown sound: ${id}`))
        return this.loader.load(content, AudioClip)
    }
}

export interface MusicAssets {
    definition: Music
    clip: AudioClip
}

export class MusicRepository {
    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    async load(id: string): Promise<MusicAssets> {
        const content = this.registry.resolve('music', id)
        if (!content) throw new Error(`unknown music: ${id}`)
        const asset = await this.loader.load(content, JsonAsset)
        const definition = parseMusic(asset.json)
        if (definition.id !== id) throw new Error(`music ID mismatch: expected ${id}, got ${definition.id}`)
        if (definition.stems.drums !== null || definition.stems.hihats !== null) {
            throw new Error(`music ${id} uses unsupported extra stems`)
        }
        if (definition.loopStartSeconds !== 0 || definition.loopEndSeconds !== definition.durationSeconds) {
            throw new Error(`music ${id} must use a full-track loop`)
        }
        const clip = await this.loader.load({ ...content, path: definition.stems.main }, AudioClip)
        return { definition, clip }
    }
}
