import { JsonAsset, Texture2D } from 'cc'
import { AssetLoader } from './AssetLoader'

export const FONT_NAMES = [
    'briannetod12',
    'briannetod16',
    'briannetod32',
    'briannetod32black',
    'continuumbold14',
    'continuumbold14outback',
    'dwarventodcraft12',
    'dwarventodcraft15',
    'dwarventodcraft18',
    'dwarventodcraft18brightgreeninset',
    'dwarventodcraft18greeninset',
    'dwarventodcraft18yellow',
    'dwarventodcraft24',
    'dwarventodcraft36brightgreeninset',
    'dwarventodcraft36greeninset',
    'houseofterror16',
    'houseofterror20',
    'houseofterror28',
    'pico129',
    'pix118bold',
]

export interface BitmapFontAssets {
    config: JsonAsset
    textures: Texture2D[]
}

export class FontLoader {
    private static _cache: Map<string, BitmapFontAssets> = new Map()
    private static _pending: Map<string, Promise<BitmapFontAssets | null>> = new Map()

    static async load(name: string): Promise<BitmapFontAssets | null> {
        const cached = this._cache.get(name)
        if (cached) return cached

        const pending = this._pending.get(name)
        if (pending) return pending

        const promise = this._loadUncached(name)
        this._pending.set(name, promise)
        const assets = await promise
        this._pending.delete(name)
        return assets
    }

    private static async _loadUncached(name: string): Promise<BitmapFontAssets | null> {
        const config = await this._loadConfig(name)
        if (!config) return null

        const layerImages = this._getLayerImages(config)
        if (layerImages.length === 0) {
            console.error(`[FontLoader] Font '${name}' does not define any layer images`)
            return null
        }

        const textures = await Promise.all(layerImages.map((imageName) => this._loadTexture(imageName)))
        if (textures.some((texture) => !texture)) {
            console.error(`[FontLoader] Failed to load one or more textures for font '${name}'`)
            return null
        }

        for (const texture of textures) {
            texture!.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
            texture!.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST)
        }

        const assets = { config, textures: textures as Texture2D[] }
        this._cache.set(name, assets)
        return assets
    }

    static get(name: string): BitmapFontAssets | undefined {
        return this._cache.get(name)
    }

    static clearCache() {
        this._cache.clear()
        this._pending.clear()
    }

    private static _loadConfig(name: string): Promise<JsonAsset | null> {
        return AssetLoader.load(`fonts/${name}`, JsonAsset, `font config: ${name}`)
    }

    private static async _loadTexture(imageName: string): Promise<Texture2D | null> {
        const texture = await AssetLoader.load(
            `fonts/${imageName}/texture`,
            Texture2D,
            null,
        )
        if (texture) return texture

        console.error(`[FontLoader] Failed to load font texture: ${imageName}`)
        return null
    }

    private static _getLayerImages(config: JsonAsset): string[] {
        const json = config.json as { layers?: { image?: string }[] }
        const images: string[] = []
        for (const layer of json.layers ?? []) {
            if (layer.image) images.push(layer.image)
        }
        return images
    }

}
