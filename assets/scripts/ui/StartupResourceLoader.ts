import { JsonAsset } from 'cc'
import { AssetLoader } from '@/core/AssetLoader'
import { FONT_NAMES, FontLoader } from '@/core/FontLoader'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { PLANT_DEFINITIONS, SEED_DEFINITIONS, ZOMBIE_DEFINITIONS } from '@/game/GameDefinitions'
import { MusicSystem } from '@/game/music/MusicSystem'
import { CRAZY_DAVE_ANIMATION_PATH } from '@/game/screen/CrazyDaveDialogConfig'
import {
    DIAMOND_ANIMATION_PATH,
    FINAL_WAVE_ANIMATION_PATH,
    GAME_TEXTURES,
    GOLD_COIN_ANIMATION_PATH,
    PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH,
    READY_SET_PLANT_ANIMATION_PATH,
    SILVER_COIN_ANIMATION_PATH,
} from '@/game/screen/GameScreenResources'
import { AwardScreenAssets } from './AwardScreen/AwardScreenAssets'
import { AchievementScreenAssets } from './AchievementScreen/AchievementScreenAssets'
import { AlmanacScreenAssets } from './AlmanacScreen/AlmanacScreenAssets'
import { ChallengeScreenAssets } from './ChallengeScreen/ChallengeScreenAssets'
import { DEBUG_CLI_PRELOAD } from './DebugCliDialog/DebugCliDialog'
import { HelpScreenAssets } from './HelpScreen/HelpScreenAssets'
import { MessageBoxAssets } from './MessageBox/MessageBoxAssets'
import { OptionsDialogAssets } from './OptionsDialog/OptionsDialogAssets'
import { SELECTOR_SCREEN_SPRITES } from './SelectorScreen/SelectorScreenConfig'
import { StoreScreenAssets } from './StoreScreen/StoreScreenAssets'
import { ZenGardenScreenAssets } from './ZenGardenScreen/ZenGardenScreenAssets'

const STARTUP_TEXTURES = [
    'popcap_logo',
    'titlescreen',
    'background_left',
    'background_right',
    'pvz_logo',
    'loadbar_dirt',
    'loadbar_grass',
    'plantshadow',
    'potatomine_rock1',
    'potatomine_rock3',
    'sodroll',
    'sodrollcap',
    'sprout_body',
    'sprout_petal',
    'zombie_hair',
    'zombie_head',
    'zombie_jaw',
    ...GAME_TEXTURES,
    ...Object.values(SEED_DEFINITIONS).map((seed) => seed.packetSprite),
    ...Object.values(SEED_DEFINITIONS).map((seed) => seed.cursorSprite),
    'zombie_outerarm_upper2',
    'zombie_cone2',
    'zombie_cone3',
    'zombie_bucket2',
    'zombie_bucket3',
    ...MessageBoxAssets.preload.sprites,
    ...OptionsDialogAssets.preload.sprites,
    ...AwardScreenAssets.preload.sprites,
    ...AchievementScreenAssets.preload.sprites,
    ...AlmanacScreenAssets.preload.sprites,
    ...ChallengeScreenAssets.preload.sprites,
    ...DEBUG_CLI_PRELOAD.sprites,
    ...HelpScreenAssets.preload.sprites,
    ...StoreScreenAssets.preload.sprites,
    ...ZenGardenScreenAssets.preload.sprites,
    ...SELECTOR_SCREEN_SPRITES,
]

const STARTUP_ANIMATION_PATHS = [...new Set([
    ...Object.values(PLANT_DEFINITIONS).map((plant) => plant.animationPath),
    ...Object.values(ZOMBIE_DEFINITIONS).map((zombie) => zombie.animationPath),
    'animations/zombie_flagpole',
    'animations/lawnmoweredzombie',
    'animations/zombie_charred',
    PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH,
    'animations/sun',
    'animations/sodroll',
    'animations/lawnmower',
    'animations/loadbar_sprout',
    'animations/loadbar_zombiehead',
    'animations/selectorscreen',
    'animations/zombie_hand',
    FINAL_WAVE_ANIMATION_PATH,
    READY_SET_PLANT_ANIMATION_PATH,
    SILVER_COIN_ANIMATION_PATH,
    GOLD_COIN_ANIMATION_PATH,
    DIAMOND_ANIMATION_PATH,
    CRAZY_DAVE_ANIMATION_PATH,
])]

export interface StartupPreloadProgress {
    progress: number
    phase: string
}

type StartupTaskProgress = (progress: number) => void

interface WeightedStartupTask {
    phase: string
    weight: number
    task: (onProgress: StartupTaskProgress) => Promise<void>
}

export class StartupResourceLoader {
    private static _preloadPromise: Promise<void> | null = null
    private static _jsonCache: Map<string, JsonAsset | null> = new Map()
    private static _progress: StartupPreloadProgress = { progress: 0, phase: 'waiting' }
    private static _progressListeners = new Set<(progress: StartupPreloadProgress) => void>()

    static preloadStartup(onProgress?: (progress: StartupPreloadProgress) => void): Promise<void> {
        if (onProgress) {
            this._progressListeners.add(onProgress)
            onProgress(this._progress)
        }
        if (this._preloadPromise) {
            return onProgress
                ? this._withProgressListener(this._preloadPromise, onProgress)
                : this._preloadPromise
        }

        this._preloadPromise = this._runPreloadStartup()

        return onProgress
            ? this._withProgressListener(this._preloadPromise, onProgress)
            : this._preloadPromise
    }

    private static _withProgressListener(
        promise: Promise<void>,
        onProgress: (progress: StartupPreloadProgress) => void,
    ) {
        return promise.then(
            () => {
                this._progressListeners.delete(onProgress)
            },
            (error) => {
                this._progressListeners.delete(onProgress)
                throw error
            },
        )
    }

    private static async _runPreloadStartup(): Promise<void> {
        this._setProgress(0, 'animations')
        const animations = await this._loadStartupAnimations()
        this._setProgress(0.1, 'textures')
        await this._loadStartupTextures(animations, 0.1, 0.55)
        await this._runWeightedStartupTasks([
            { phase: 'audio', weight: 0.15, task: (onProgress) => this._loadAudio(onProgress) },
            { phase: 'music', weight: 0.15, task: async (onProgress) => {
                onProgress(0)
                await MusicSystem.preloadAllTunes()
                onProgress(1)
            } },
            { phase: 'fonts', weight: 0.15, task: (onProgress) => this._loadFonts(onProgress) },
            { phase: 'strings', weight: 0.1, task: async (onProgress) => {
                onProgress(0)
                await LawnStringLoader.load()
                onProgress(1)
            } },
        ], 0.55)
        this._setProgress(1, 'complete')
    }

    private static _setProgress(progress: number, phase: string) {
        this._progress = {
            progress: Math.max(0, Math.min(1, progress)),
            phase,
        }
        for (const listener of this._progressListeners) {
            listener(this._progress)
        }
    }

    private static async _runWeightedStartupTasks(tasks: WeightedStartupTask[], startProgress: number) {
        const totalWeight = tasks.reduce((total, task) => total + task.weight, 0)
        const taskProgress = tasks.map(() => 0)
        const updateProgress = (phase: string) => {
            const completedWeight = tasks.reduce(
                (total, task, index) => total + task.weight * taskProgress[index],
                0,
            )
            const progress = totalWeight <= 0
                ? 1
                : startProgress + completedWeight / totalWeight * (1 - startProgress)
            this._setProgress(progress, phase)
        }

        await Promise.all(tasks.map(async (task, index) => {
            const onProgress = (progress: number) => {
                taskProgress[index] = Math.max(0, Math.min(1, progress))
                updateProgress(task.phase)
            }
            onProgress(0)
            await task.task(onProgress)
            onProgress(1)
        }))
    }

    static async loadStartupLoaderAssets(): Promise<void> {
        await Promise.all([
            SpriteLoader.load('popcap_logo'),
            SpriteLoader.load('titlescreen'),
            SpriteLoader.load('background_left'),
            SpriteLoader.load('background_right'),
            SpriteLoader.load('pvz_logo'),
            SpriteLoader.load('loadbar_dirt'),
            SpriteLoader.load('loadbar_grass'),
            SpriteLoader.load('plantshadow'),
            SpriteLoader.load('potatomine_rock1'),
            SpriteLoader.load('potatomine_rock3'),
            SpriteLoader.load('sodroll'),
            SpriteLoader.load('sodrollcap'),
            SpriteLoader.load('sprout_body'),
            SpriteLoader.load('sprout_petal'),
            SpriteLoader.load('zombie_hair'),
            SpriteLoader.load('zombie_head'),
            SpriteLoader.load('zombie_jaw'),
            FontLoader.load('briannetod16'),
            SoundLoader.load(SoundEffect.LoadingBarFlower),
            SoundLoader.load(SoundEffect.LoadingBarZombie),
            ...STARTUP_ANIMATION_PATHS.map((path) => this.loadJson(path)),
        ])
    }

    static getStartupProgress() {
        return this._progress
    }

    static async loadJson(path: string): Promise<JsonAsset | null> {
        if (this._jsonCache.has(path)) return this._jsonCache.get(path)!

        const asset = await AssetLoader.load(path, JsonAsset, `JSON resource: ${path}`)
        this._jsonCache.set(path, asset)
        return asset
    }

    private static async _loadAudio(onProgress?: StartupTaskProgress): Promise<void> {
        const effects = Object.values(SoundEffect) as SoundEffect[]
        let completed = 0
        onProgress?.(0)
        await Promise.all(effects.map(async (effect) => {
            await SoundLoader.load(effect)
            completed++
            onProgress?.(effects.length === 0 ? 1 : completed / effects.length)
        }))
    }

    private static async _loadFonts(onProgress?: StartupTaskProgress): Promise<void> {
        const fontNames = [...new Set([
            ...FONT_NAMES,
            ...AwardScreenAssets.preload.fonts,
            ...AchievementScreenAssets.preload.fonts,
            ...AlmanacScreenAssets.preload.fonts,
            ...DEBUG_CLI_PRELOAD.fonts,
            ...HelpScreenAssets.preload.fonts,
            ...StoreScreenAssets.preload.fonts,
            ...ZenGardenScreenAssets.preload.fonts,
        ])]
        let completed = 0
        onProgress?.(0)
        await Promise.all(fontNames.map(async (name) => {
            await FontLoader.load(name)
            completed++
            onProgress?.(fontNames.length === 0 ? 1 : completed / fontNames.length)
        }))
    }

    private static async _loadStartupAnimations(): Promise<JsonAsset[]> {
        const [dirAnimations, explicitAnimations] = await Promise.all([
            AssetLoader.loadDir(
                'animations',
                JsonAsset,
                'animation resources',
            ),
            Promise.all(STARTUP_ANIMATION_PATHS.map((path) => this.loadJson(path))),
        ])
        for (const animation of dirAnimations) {
            this._jsonCache.set(`animations/${animation.name}`, animation)
        }
        return [
            ...dirAnimations,
            ...explicitAnimations.filter((animation): animation is JsonAsset => !!animation),
        ]
    }

    private static async _loadStartupTextures(
        animations: JsonAsset[],
        startProgress = 0,
        endProgress = 1,
    ): Promise<void> {
        const textureNames = new Set(STARTUP_TEXTURES)
        for (const animation of animations) {
            this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }

        const names = [...textureNames]
        let completed = 0
        await Promise.all(names.map(async (name) => {
            await SpriteLoader.load(name)
            completed++
            const ratio = names.length === 0 ? 1 : completed / names.length
            this._setProgress(startProgress + (endProgress - startProgress) * ratio, 'textures')
        }))
    }

    private static _collectAnimationImages(value: unknown, output: Set<string>) {
        if (Array.isArray(value)) {
            for (const item of value) {
                this._collectAnimationImages(item, output)
            }
            return
        }
        if (!value || typeof value !== 'object') return

        for (const [key, child] of Object.entries(value)) {
            if (key === 'image') {
                const imageName = this._normalizeImageName(child)
                if (imageName) output.add(imageName)
                continue
            }
            this._collectAnimationImages(child, output)
        }
    }

    private static _normalizeImageName(imageName: unknown): string | null {
        if (typeof imageName === 'string') return imageName.length > 0 ? imageName : null
        if (imageName instanceof String) {
            const value = imageName.valueOf()
            return value.length > 0 ? value : null
        }
        return null
    }
}
