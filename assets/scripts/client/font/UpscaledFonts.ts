import { JsonAsset, sys, Texture2D } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import type { BitmapFontAssets } from './BitmapFontAssets'
import type { FontConfig } from './FontRenderer.d'

const cache = new Map<string, Promise<BitmapFontAssets>>()

export function upscaledFontLoader(name: string): BitmapFontAssets['loadUpscaled'] {
    if (name === 'pico129' || name === 'pix118bold') return undefined
    return () => {
        const cached = cache.get(name)
        if (cached) return cached
        const pending = load(name).catch(error => { cache.delete(name); throw error })
        cache.set(name, pending)
        return pending
    }
}

async function load(name: string): Promise<BitmapFontAssets> {
    const directory = 'fonts/upscaled'
    const config = await AssetLoader.load<JsonAsset>(`${directory}/${name}`, JsonAsset)
    if (!config) throw new Error(`Missing upscaled font: ${name}`)
    const data = config.json as unknown as FontConfig
    const textures = await Promise.all(data.layers.map(async layer => {
        const texture = await AssetLoader.load<Texture2D>(`${directory}/${layer.image}/texture`, Texture2D)
        if (!texture) throw new Error(`Missing upscaled font texture: ${layer.image}`)
        const image = texture.image?.data
        if (sys.isBrowser && image && !ArrayBuffer.isView(image)) {
            // Direct HTML image uploads can leave an empty WebGL texture.
            // Upload decoded RGBA pixels once, before caching the font.
            const canvas = document.createElement('canvas')
            canvas.width = texture.width
            canvas.height = texture.height
            const context = canvas.getContext('2d')!
            context.drawImage(image, 0, 0)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
            texture.uploadData(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength))
        }
        texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
        texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR)
        return texture
    }))
    return { config, textures }
}
