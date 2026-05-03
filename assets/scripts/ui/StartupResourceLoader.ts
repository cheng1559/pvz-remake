import { JsonAsset } from 'cc'
import { AssetLoader } from '@/core/AssetLoader'
import { FONT_NAMES, FontLoader } from '@/core/FontLoader'
import { SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { ChallengeScreenAssets } from './ChallengeScreen/ChallengeScreenAssets'
import { MessageBoxAssets } from './MessageBox/MessageBoxAssets'
import { OptionsDialogAssets } from './OptionsDialog/OptionsDialogAssets'
import { SELECTOR_SCREEN_ANIMATIONS, SELECTOR_SCREEN_SPRITES } from './SelectorScreen/SelectorScreenConfig'

const STARTUP_ANIMATIONS = SELECTOR_SCREEN_ANIMATIONS
const STARTUP_TEXTURES = [
    ...MessageBoxAssets.preload.sprites,
    ...OptionsDialogAssets.preload.sprites,
    ...ChallengeScreenAssets.preload.sprites,
    ...SELECTOR_SCREEN_SPRITES,
]

export class StartupResourceLoader {
    private static _preloadPromise: Promise<void> | null = null
    private static _jsonCache: Map<string, JsonAsset | null> = new Map()

    static preloadStartup(): Promise<void> {
        if (this._preloadPromise) return this._preloadPromise

        this._preloadPromise = (async () => {
            const animations = await this._loadStartupAnimations()
            await Promise.all([this._loadStartupTextures(animations), this._loadAudio(), this._loadFonts()])
        })()

        return this._preloadPromise
    }

    static async loadJson(path: string): Promise<JsonAsset | null> {
        if (this._jsonCache.has(path)) return this._jsonCache.get(path)!

        const asset = await AssetLoader.load(path, JsonAsset, `JSON resource: ${path}`)
        this._jsonCache.set(path, asset)
        return asset
    }

    private static async _loadAudio(): Promise<void> {
        await SoundLoader.preloadAll()
    }

    private static async _loadFonts(): Promise<void> {
        await Promise.all(FONT_NAMES.map((name) => FontLoader.load(name)))
    }

    private static async _loadStartupAnimations(): Promise<JsonAsset[]> {
        const animations = await Promise.all(
            STARTUP_ANIMATIONS.map((path) => this.loadJson(path)),
        )
        return animations.filter((animation): animation is JsonAsset => animation !== null)
    }

    private static async _loadStartupTextures(animations: JsonAsset[]): Promise<void> {
        const textureNames = new Set(STARTUP_TEXTURES)
        for (const animation of animations) {
            this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }

        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    private static _collectAnimationImages(json: Record<string, any>, output: Set<string>) {
        for (const nodeName in json) {
            const tracks = json[nodeName]?.tracks
            for (const trackName in tracks ?? {}) {
                for (const frame of tracks[trackName]?.frames ?? []) {
                    if (frame?.image) output.add(frame.image)
                }
            }
        }
    }
}
