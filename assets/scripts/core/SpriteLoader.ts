import { SpriteFrame, Texture2D, warn } from 'cc'
import { AssetLoader } from './AssetLoader'
import { SpriteResourceManifest, type SpriteSampling } from './SpriteResourceManifest'

export class SpriteLoader {
    private static _cache: Map<string, SpriteFrame> = new Map()
    private static _pending: Map<string, Promise<SpriteFrame | null>> = new Map()

    // ── Public API ─────────────────────────────────────────────

    static async load(name: string): Promise<SpriteFrame | null> {
        if (!this._isValidSpriteName(name)) {
            this._warnInvalidSpriteName('load', name)
            return null
        }
        return this.loadWithAlpha(name)
    }

    static async loadWithAlpha(
        name: string,
        explicitAlphaName?: string,
    ): Promise<SpriteFrame | null> {
        if (!this._isValidSpriteName(name)) {
            this._warnInvalidSpriteName('loadWithAlpha', name)
            return null
        }

        if (this._cache.has(name)) {
            return this._cache.get(name)!
        }

        const pending = this._pending.get(name)
        if (pending) {
            return pending
        }

        if (explicitAlphaName != null && !this._isValidSpriteName(explicitAlphaName)) {
            this._warnInvalidSpriteName('loadWithAlpha alpha', explicitAlphaName)
        }

        const promise = this._loadUncached(name)
        this._pending.set(name, promise)
        const spriteFrame = await promise
        this._pending.delete(name)
        return spriteFrame
    }

    private static async _loadUncached(name: string): Promise<SpriteFrame | null> {
        const mainSf = await this._loadRaw(name)

        if (mainSf) {
            this._applySpriteSampling(mainSf, SpriteResourceManifest.getSampling(name))
            this._cache.set(name, mainSf)
        } else {
            warn(`[SpriteLoader] Failed to load sprite '${name}'`)
        }
        return mainSf
    }

    static get(name: string): SpriteFrame | undefined {
        if (!this._isValidSpriteName(name)) {
            this._warnInvalidSpriteName('get', name)
            return undefined
        }

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

    private static _isValidSpriteName(name: unknown): name is string {
        return typeof name === 'string' && name.length > 0
    }

    private static _warnInvalidSpriteName(context: string, name: unknown) {
        warn(
            `[SpriteLoader] Ignoring invalid sprite name in ${context}: ${this._formatValue(name)}`,
        )
    }

    private static _formatValue(value: unknown): string {
        if (typeof value === 'string') return value
        try {
            const json = JSON.stringify(value)
            if (json) return json.slice(0, 160)
        } catch {
            // Fall through to String(value).
        }
        return String(value)
    }

    // ── Raw Loading ────────────────────────────────────────────

    private static _loadRaw(name: string): Promise<SpriteFrame | null> {
        return AssetLoader.load(`textures/${name}/spriteFrame`, SpriteFrame, null).then((sf) => {
            if (sf) return sf
            return AssetLoader.load(`textures/${name}`, SpriteFrame, null)
        })
    }

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
}
