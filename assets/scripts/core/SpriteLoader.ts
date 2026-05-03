import { SpriteFrame, Texture2D, ImageAsset, warn } from 'cc'
import { AssetLoader } from './AssetLoader'
import {
    SpriteResourceManifest,
    type AlphaComposeColor,
    type SpriteSampling,
    type TransparentColor,
} from './SpriteResourceManifest'

export class SpriteLoader {
    private static _cache: Map<string, SpriteFrame> = new Map()
    private static _pending: Map<string, Promise<SpriteFrame | null>> = new Map()

    // ── Public API ─────────────────────────────────────────────

    static async load(name: string): Promise<SpriteFrame | null> {
        return this.loadWithAlpha(name)
    }

    static async loadWithAlpha(
        name: string,
        explicitAlphaName = SpriteResourceManifest.getAlphaImage(name),
    ): Promise<SpriteFrame | null> {
        if (this._cache.has(name)) {
            return this._cache.get(name)!
        }

        const pending = this._pending.get(name)
        if (pending) {
            return pending
        }

        const promise = this._loadUncached(name, explicitAlphaName)
        this._pending.set(name, promise)
        const spriteFrame = await promise
        this._pending.delete(name)
        return spriteFrame
    }

    private static async _loadUncached(
        name: string,
        explicitAlphaName?: string,
    ): Promise<SpriteFrame | null> {
        let mainSf = await this._loadRaw(name)

        const lastSlash = name.lastIndexOf('/')
        const alphaName1 =
            lastSlash >= 0
                ? name.substring(0, lastSlash + 1) + '_' + name.substring(lastSlash + 1)
                : '_' + name
        const alphaName2 = name + '_'

        let alphaSf = explicitAlphaName ? await this._loadRaw(explicitAlphaName) : null
        if (!alphaSf) alphaSf = await this._loadRaw(alphaName1)
        if (!alphaSf) alphaSf = await this._loadRaw(alphaName2)

        if (alphaSf) {
            if (mainSf) {
                this._mergeAlpha(mainSf, alphaSf)
            } else {
                mainSf = this._createTextureFromAlpha(alphaSf)
            }
        }

        if (mainSf) {
            this._applyAlphaComposeColor(mainSf, SpriteResourceManifest.getAlphaComposeColor(name))
            this._applyTransparentColor(mainSf, SpriteResourceManifest.getTransparentColor(name))
            this._applySpriteSampling(mainSf, SpriteResourceManifest.getSampling(name))
            this._cache.set(name, mainSf)
        } else {
            warn(`[SpriteLoader] Failed to load sprite '${name}'`)
        }
        return mainSf
    }

    static get(name: string): SpriteFrame | undefined {
        const sf = this._cache.get(name)
        if (!sf) {
            warn(`[SpriteLoader] Sprite '${name}' not found in cache`)
        }
        return sf
    }

    static clearCache() {
        this._cache.clear()
        this._pending.clear()
    }

    // ── Raw Loading ────────────────────────────────────────────

    private static _loadRaw(name: string): Promise<SpriteFrame | null> {
        return AssetLoader.load(`textures/${name}/spriteFrame`, SpriteFrame, null).then((sf) => {
            if (sf) return sf
            return AssetLoader.load(`textures/${name}`, SpriteFrame, null)
        })
    }

    // ── Alpha Merging ──────────────────────────────────────────

    private static _applyTextureSampling(texture: Texture2D, sampling: SpriteSampling = 'nearest') {
        const filter =
            sampling === 'linear' ? Texture2D.Filter.LINEAR : Texture2D.Filter.NEAREST
        texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
        texture.setFilters(filter, filter)
    }

    private static _applySpriteSampling(
        spriteFrame: SpriteFrame | null,
        sampling: SpriteSampling = 'nearest',
    ) {
        const texture = spriteFrame?.texture as Texture2D | null
        if (texture) this._applyTextureSampling(texture, sampling)
    }

    private static _getImageData(imageAsset: ImageAsset): Uint8Array | null {
        const data = imageAsset.data
        if (!data) return null

        if (data instanceof Uint8Array) return data
        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        }

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            try {
                const canvas = document.createElement('canvas')
                canvas.width = imageAsset.width
                canvas.height = imageAsset.height
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.drawImage(data as CanvasImageSource, 0, 0)
                    const imageData = ctx.getImageData(0, 0, imageAsset.width, imageAsset.height)
                    return new Uint8Array(imageData.data.buffer)
                }
            } catch (e) {
                warn('[SpriteLoader] Failed to extract image data:', e)
            }
        }
        return null
    }

    private static _mergeAlpha(rgbSf: SpriteFrame, alphaSf: SpriteFrame) {
        const rgbTex = rgbSf.texture as Texture2D
        const alphaTex = alphaSf.texture as Texture2D
        if (!rgbTex || !alphaTex) return

        const rgbImage = rgbTex.image as ImageAsset
        const alphaImage = alphaTex.image as ImageAsset
        if (!rgbImage || !alphaImage) return
        if (rgbImage.width !== alphaImage.width || rgbImage.height !== alphaImage.height) return

        const rgbData = this._getImageData(rgbImage)
        const alphaData = this._getImageData(alphaImage)
        if (!rgbData || !alphaData) return

        const width = rgbImage.width
        const height = rgbImage.height
        const count = width * height
        const newBuffer = new Uint8Array(count * 4)
        const rgbStep = Math.floor(rgbData.length / count)
        const alphaStep = Math.floor(alphaData.length / count)

        for (let i = 0; i < count; i++) {
            newBuffer[i * 4 + 0] = rgbData[i * rgbStep + 0]
            newBuffer[i * 4 + 1] = rgbData[i * rgbStep + 1]
            newBuffer[i * 4 + 2] = rgbData[i * rgbStep + 2]
            newBuffer[i * 4 + 3] = alphaData[i * alphaStep + 0]
        }

        const newTex = new Texture2D()
        newTex.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 })
        this._applyTextureSampling(newTex)
        newTex.uploadData(newBuffer)
        rgbSf.texture = newTex
    }

    private static _applyAlphaComposeColor(spriteFrame: SpriteFrame, color?: AlphaComposeColor) {
        if (!color) return

        const texture = spriteFrame.texture as Texture2D
        if (!texture) return

        const image = texture.image as ImageAsset
        if (!image) return

        const data = this._getImageData(image)
        if (!data) return

        const width = image.width
        const height = image.height
        const count = width * height
        const step = Math.floor(data.length / count)
        if (step < 3) return

        const newBuffer = new Uint8Array(count * 4)
        for (let i = 0; i < count; i++) {
            const source = i * step
            const target = i * 4
            newBuffer[target + 0] = color[0]
            newBuffer[target + 1] = color[1]
            newBuffer[target + 2] = color[2]
            newBuffer[target + 3] = Math.max(data[source], data[source + 1], data[source + 2])
        }

        const newTex = new Texture2D()
        newTex.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 })
        this._applyTextureSampling(newTex)
        newTex.uploadData(newBuffer)
        spriteFrame.texture = newTex
    }

    private static _applyTransparentColor(spriteFrame: SpriteFrame, color?: TransparentColor) {
        if (!color) return

        const texture = spriteFrame.texture as Texture2D
        if (!texture) return

        const image = texture.image as ImageAsset
        if (!image) return

        const data = this._getImageData(image)
        if (!data) return

        const width = image.width
        const height = image.height
        const count = width * height
        const step = Math.floor(data.length / count)
        if (step < 3) return

        const newBuffer = new Uint8Array(count * 4)
        for (let i = 0; i < count; i++) {
            const source = i * step
            const target = i * 4
            const r = data[source]
            const g = data[source + 1]
            const b = data[source + 2]
            newBuffer[target + 0] = r
            newBuffer[target + 1] = g
            newBuffer[target + 2] = b
            newBuffer[target + 3] = r === color[0] && g === color[1] && b === color[2] ? 0 : 255
        }

        const newTex = new Texture2D()
        newTex.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 })
        this._applyTextureSampling(newTex)
        newTex.uploadData(newBuffer)
        spriteFrame.texture = newTex
    }

    private static _createTextureFromAlpha(alphaSf: SpriteFrame): SpriteFrame | null {
        const alphaTex = alphaSf.texture as Texture2D
        if (!alphaTex) return null
        const alphaImage = alphaTex.image as ImageAsset
        if (!alphaImage) return null

        const alphaData = this._getImageData(alphaImage)
        if (!alphaData) return null

        const width = alphaImage.width
        const height = alphaImage.height
        const count = width * height
        const newBuffer = new Uint8Array(count * 4)
        const alphaStep = Math.floor(alphaData.length / count)

        for (let i = 0; i < count; i++) {
            newBuffer[i * 4 + 0] = 255
            newBuffer[i * 4 + 1] = 255
            newBuffer[i * 4 + 2] = 255
            newBuffer[i * 4 + 3] = alphaData[i * alphaStep + 0]
        }

        const newTex = new Texture2D()
        newTex.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 })
        this._applyTextureSampling(newTex)
        newTex.uploadData(newBuffer)

        const newSf = new SpriteFrame()
        newSf.texture = newTex
        return newSf
    }
}
