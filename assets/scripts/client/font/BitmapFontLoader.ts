import { JsonAsset, Texture2D } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import type { BitmapFontAssets } from './BitmapFontAssets'
import type { FontConfig } from './FontRenderer.d'
import { resourcePacks } from '@/client/content/ResourcePacks'

const cache = new Map<string, Promise<BitmapFontAssets>>()
let revision = -1

export async function loadBitmapFont(name: string): Promise<BitmapFontAssets> {
    const replacement = await resourcePacks.font(`pvz:${name}`)
    if (replacement) return replacement
    if (revision !== resourcePacks.revision) { cache.clear(); revision = resourcePacks.revision }
    const cached = cache.get(name)
    if (cached) return cached
    const pending = load(name).catch(error => { cache.delete(name); throw error })
    cache.set(name, pending)
    return pending
}

async function load(name: string): Promise<BitmapFontAssets> {
    const directory = 'fonts'
    const config = await AssetLoader.load<JsonAsset>(`${directory}/${name}`, JsonAsset)
    if (!config) throw new Error(`Missing font: ${directory}/${name}`)
    const data = config.json as unknown as FontConfig
    const textures = await Promise.all(data.layers.map(async layer => {
        const texture = await AssetLoader.load<Texture2D>(`${directory}/${layer.image}/texture`, Texture2D)
        if (!texture) throw new Error(`Missing font texture: ${directory}/${layer.image}`)
        texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
        texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST)
        return texture
    }))
    return { config, textures }
}
