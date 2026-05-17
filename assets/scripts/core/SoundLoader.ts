import { AudioClip, AudioSource, director, Node } from 'cc'
import { AssetLoader } from './AssetLoader'

type NativeAudioAsset = {
    url?: string
}

type AudioClipWithNativeAsset = AudioClip & {
    _nativeAsset?: NativeAudioAsset | null
    nativeUrl?: string
}

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setPitch?: (audioId: number, pitch: number) => boolean
    setFinishCallback?: (audioId: number, callback: () => void) => void
}

type PvzNativeBridge = {
    playSfxPitch?: (url: string, volume: number, pitch: number) => boolean
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        AudioEngine?: NativeAudioEngine
        PvzNative?: PvzNativeBridge
    }
}

const DEFAULT_MUSIC_VOLUME = 0.85
const DEFAULT_SFX_VOLUME = 0.5525

export const SoundEffect = {
    Awooga: 'awooga',
    Bleep: 'bleep',
    BigChomp: 'bigchomp',
    Buzzer: 'buzzer',
    ButtonClick: 'buttonclick',
    CherryBomb: 'cherrybomb',
    Chomp: 'chomp',
    Chomp2: 'chomp2',
    ChompSoft: 'chompsoft',
    Chime: 'chime',
    Coin: 'coin',
    CrazyDaveCrazy: 'crazydavecrazy',
    CrazyDaveExtraLong1: 'crazydaveextralong1',
    CrazyDaveExtraLong2: 'crazydaveextralong2',
    CrazyDaveExtraLong3: 'crazydaveextralong3',
    CrazyDaveLong1: 'crazydavelong1',
    CrazyDaveLong2: 'crazydavelong2',
    CrazyDaveLong3: 'crazydavelong3',
    CrazyDaveScream: 'crazydavescream',
    CrazyDaveScream2: 'crazydavescream2',
    CrazyDaveShort1: 'crazydaveshort1',
    CrazyDaveShort2: 'crazydaveshort2',
    CrazyDaveShort3: 'crazydaveshort3',
    Diamond: 'diamond',
    DiggerZombie: 'digger_zombie',
    DirtRise: 'dirt_rise',
    Drop: 'tap2',
    EvilLaugh: 'evillaugh',
    GraveButton: 'gravebutton',
    Groan: 'groan',
    Groan2: 'groan2',
    Groan3: 'groan3',
    Groan4: 'groan4',
    Groan5: 'groan5',
    Groan6: 'groan6',
    HatchbackClose: 'hatchback_close',
    HatchbackOpen: 'hatchback_open',
    HugeWave: 'hugewave',
    Juicy: 'juicy',
    Lawnmower: 'lawnmower',
    LimbsPop: 'limbs_pop',
    LoseMusic: 'losemusic',
    MoneyFalls: 'moneyfalls',
    Paper: 'paper',
    Pause: 'pause',
    Plant: 'plant',
    Plant2: 'plant2',
    Points: 'points',
    PotatoMine: 'potato_mine',
    ReverseExplosion: 'reverse_explosion',
    ReadySetPlant: 'readysetplant',
    RollIn: 'roll_in',
    SeedLift: 'seedlift',
    ShieldHit: 'shieldhit',
    ShieldHit2: 'shieldhit2',
    Shovel: 'shovel',
    Scream: 'scream',
    Splat: 'splat',
    Splat2: 'splat2',
    Splat3: 'splat3',
    PlasticHit: 'plastichit',
    PlasticHit2: 'plastichit2',
    SnowPeaSparkles: 'snow_pea_sparkles',
    Tap: 'tap',
    Throw: 'throw',
    Throw2: 'throw2',
    FinalFanfare: 'finalfanfare',
    FinalWave: 'finalwave',
    Frozen: 'frozen',
    LightFill: 'lightfill',
    LoadingBarFlower: 'loadingbar_flower',
    LoadingBarZombie: 'loadingbar_zombie',
    WinMusic: 'winmusic',
    ZombieFalling1: 'zombie_falling_1',
    ZombieFalling2: 'zombie_falling_2',
} as const

export type SoundEffect = (typeof SoundEffect)[keyof typeof SoundEffect]

export class SoundLoader {
    private static readonly _basePath = 'audio/sfx'
    private static readonly _effects: SoundEffect[] = Object.values(SoundEffect)
    private static readonly _pitchStepMultiplier = 1.0594630943592953
    private static readonly _foleyRecentSuppressMs = 100
    private static readonly _foleyPitchRanges: Partial<Record<SoundEffect, number>> = {
        [SoundEffect.Points]: 10,
        [SoundEffect.ShieldHit]: 10,
        [SoundEffect.Splat]: 10,
        [SoundEffect.PlasticHit]: 5,
        [SoundEffect.Lawnmower]: 10,
        [SoundEffect.Throw]: 10,
        [SoundEffect.ChompSoft]: 4,
        [SoundEffect.LimbsPop]: 10,
        [SoundEffect.SnowPeaSparkles]: 10,
        [SoundEffect.ZombieFalling1]: 10,
        [SoundEffect.ZombieFalling2]: 10,
        [SoundEffect.Coin]: 10,
        [SoundEffect.DirtRise]: 5,
        [SoundEffect.BigChomp]: -2,
        [SoundEffect.Juicy]: 2,
        [SoundEffect.Shovel]: 5,
    }
    private static readonly _foleyVariants: Partial<Record<SoundEffect, readonly SoundEffect[]>> = {
        [SoundEffect.ShieldHit]: [SoundEffect.ShieldHit, SoundEffect.ShieldHit2],
        [SoundEffect.Splat]: [SoundEffect.Splat, SoundEffect.Splat2, SoundEffect.Splat3],
        [SoundEffect.PlasticHit]: [SoundEffect.PlasticHit, SoundEffect.PlasticHit2],
        [SoundEffect.Throw]: [SoundEffect.Throw, SoundEffect.Throw, SoundEffect.Throw, SoundEffect.Throw2],
        [SoundEffect.Chomp]: [SoundEffect.Chomp, SoundEffect.Chomp2],
        [SoundEffect.Plant]: [SoundEffect.Plant, SoundEffect.Plant2],
        [SoundEffect.Groan]: [
            SoundEffect.Groan,
            SoundEffect.Groan2,
            SoundEffect.Groan3,
            SoundEffect.Groan4,
            SoundEffect.Groan5,
            SoundEffect.Groan6,
        ],
        [SoundEffect.ZombieFalling1]: [SoundEffect.ZombieFalling1, SoundEffect.ZombieFalling2],
        [SoundEffect.CrazyDaveShort1]: [
            SoundEffect.CrazyDaveShort1,
            SoundEffect.CrazyDaveShort2,
            SoundEffect.CrazyDaveShort3,
        ],
        [SoundEffect.CrazyDaveLong1]: [
            SoundEffect.CrazyDaveLong1,
            SoundEffect.CrazyDaveLong2,
            SoundEffect.CrazyDaveLong3,
        ],
        [SoundEffect.CrazyDaveExtraLong1]: [
            SoundEffect.CrazyDaveExtraLong1,
            SoundEffect.CrazyDaveExtraLong2,
            SoundEffect.CrazyDaveExtraLong3,
        ],
    }
    private static _clips: Map<SoundEffect, AudioClip> = new Map()
    private static _loading: Map<SoundEffect, Promise<AudioClip | null>> = new Map()
    private static _audioBuffers: Map<SoundEffect, Promise<AudioBuffer | null>> = new Map()
    private static _foleyLastPlayedAt: Map<SoundEffect, number> = new Map()
    private static _exclusiveSources: Map<string, AudioSource> = new Map()
    private static _exclusiveEffects: Map<string, SoundEffect> = new Map()
    private static _exclusiveBaseVolumes: Map<string, number> = new Map()
    private static _exclusiveTokens: Map<string, number> = new Map()
    private static _audioContext: AudioContext | null = null
    private static _source: AudioSource | null = null
    private static _musicVolume = DEFAULT_MUSIC_VOLUME
    private static _sfxVolume = DEFAULT_SFX_VOLUME

    public static preloadAll() {
        return Promise.all(this._effects.map((effect) => this.load(effect)))
    }

    public static getMusicVolume() {
        return this._musicVolume
    }

    public static setMusicVolume(volume: number) {
        this._musicVolume = this._clampMasterVolume(volume, DEFAULT_MUSIC_VOLUME)
        this._syncExclusiveSourceVolumes()
    }

    public static getSfxVolume() {
        return this._sfxVolume
    }

    public static setSfxVolume(volume: number) {
        this._sfxVolume = this._clampMasterVolume(volume, DEFAULT_SFX_VOLUME)
        this._syncExclusiveSourceVolumes()
    }

    public static load(effect: SoundEffect): Promise<AudioClip | null> {
        const cached = this._clips.get(effect)
        if (cached) return Promise.resolve(cached)

        const loading = this._loading.get(effect)
        if (loading) return loading

        const promise = AssetLoader.load<AudioClip>(
            `${this._basePath}/${effect}`,
            AudioClip,
            `sound: ${effect}`,
        ).then((clip) => {
            this._loading.delete(effect)
            if (clip) this._clips.set(effect, clip)
            return clip
        })

        this._loading.set(effect, promise)
        return promise
    }

    public static async play(effect: SoundEffect, volume = 1) {
        const clip = await this.load(effect)
        if (!clip) return

        const source = this._getSource()
        source.playOneShot(clip, this._resolveEffectVolume(volume))
    }

    public static async playSfx(effect: SoundEffect, volume = 1) {
        const clip = await this.load(effect)
        if (!clip) return

        const source = this._getSource()
        source.playOneShot(clip, this._resolveEffectVolume(volume))
    }

    public static playFoley(effect: SoundEffect, pitchRange?: number, volume = 1) {
        if (this._hasFoleyPlayedTooRecently(effect)) return Promise.resolve()

        const selectedEffect = this._pickFoleyEffect(effect)
        const resolvedPitchRange = pitchRange ?? this._foleyPitchRanges[effect] ?? 0
        const pitch = resolvedPitchRange === 0 ? 0 : Math.random() * resolvedPitchRange
        return this.playWithPitch(selectedEffect, pitch, volume)
    }

    public static async playExclusive(effect: SoundEffect, channel: string = effect, volume = 1) {
        const token = (this._exclusiveTokens.get(channel) ?? 0) + 1
        this._exclusiveTokens.set(channel, token)
        const source = this._getExclusiveSource(channel)
        source.stop()

        const clip = await this.load(effect)
        if (!clip || this._exclusiveTokens.get(channel) !== token) return

        source.stop()
        source.clip = clip
        this._exclusiveEffects.set(channel, effect)
        this._exclusiveBaseVolumes.set(channel, volume)
        source.volume = this._resolveEffectVolume(volume)
        source.loop = false
        source.play()
    }

    public static playFoleyExclusive(effect: SoundEffect, channel: string = effect, pitchRange?: number, volume = 1) {
        if (this._hasFoleyPlayedTooRecently(effect)) {
            this.stopExclusive(channel)
            return Promise.resolve()
        }

        const selectedEffect = this._pickFoleyEffect(effect)
        const resolvedPitchRange = pitchRange ?? this._foleyPitchRanges[effect] ?? 0
        if (resolvedPitchRange === 0) return this.playExclusive(selectedEffect, channel, volume)

        return this.playWithPitch(selectedEffect, Math.random() * resolvedPitchRange, volume)
    }

    public static stopExclusive(channel: string) {
        this._exclusiveTokens.set(channel, (this._exclusiveTokens.get(channel) ?? 0) + 1)
        this._exclusiveSources.get(channel)?.stop()
    }

    public static async playWithPitch(effect: SoundEffect, pitchSteps: number, volume = 1) {
        const clip = await this.load(effect)
        if (!clip) return
        const resolvedVolume = this._resolveEffectVolume(volume)

        if (pitchSteps === 0) {
            this._getSource().playOneShot(clip, resolvedVolume)
            return
        }

        if (await this._playNativeWithPitch(clip, pitchSteps, resolvedVolume)) {
            return
        }

        const context = this._getAudioContext()
        if (!context) {
            this._getSource().playOneShot(clip, resolvedVolume)
            return
        }

        const buffer = await this._loadAudioBuffer(effect, clip)
        if (!buffer) {
            this._getSource().playOneShot(clip, resolvedVolume)
            return
        }

        if (context.state === 'suspended') {
            void context.resume()
        }

        const source = context.createBufferSource()
        const gain = context.createGain()
        source.buffer = buffer
        source.playbackRate.value = Math.pow(this._pitchStepMultiplier, pitchSteps)
        gain.gain.value = resolvedVolume
        source.connect(gain)
        gain.connect(context.destination)
        source.start()
    }

    private static async _playNativeWithPitch(clip: AudioClip, pitchSteps: number, volume: number) {
        const bindings = globalThis as NativeBindings
        const url = (clip as AudioClipWithNativeAsset)._nativeAsset?.url ?? (clip as AudioClipWithNativeAsset).nativeUrl
        if (!url) return false

        const pitch = Math.pow(this._pitchStepMultiplier, pitchSteps)
        if (bindings.jsb?.PvzNative?.playSfxPitch?.(url, volume, pitch)) {
            return true
        }

        const audioEngine = bindings.jsb?.AudioEngine
        if (!audioEngine?.play2d || !audioEngine.setPitch) return false

        const audioId = audioEngine.play2d(url, false, volume)
        if (typeof audioId !== 'number' || audioId < 0) return false

        audioEngine.setPitch(audioId, pitch)
        return true
    }

    private static _getSource() {
        if (this._source?.isValid) return this._source

        const node = this._createPersistentAudioNode('SoundLoader')
        this._source = node.addComponent(AudioSource)
        return this._source
    }

    private static _getExclusiveSource(channel: string) {
        const cached = this._exclusiveSources.get(channel)
        if (cached?.isValid) return cached

        const node = this._createPersistentAudioNode(`SoundLoader_${channel}`)
        const source = node.addComponent(AudioSource)
        this._exclusiveSources.set(channel, source)
        return source
    }

    private static _createPersistentAudioNode(name: string) {
        const node = new Node(name)
        const scene = director.getScene()
        if (scene) {
            scene.addChild(node)
        }
        director.addPersistRootNode(node)
        return node
    }

    private static _pickFoleyEffect(effect: SoundEffect) {
        const variants = this._foleyVariants[effect]
        if (!variants || variants.length === 0) return effect

        return variants[Math.floor(Math.random() * variants.length)]
    }

    private static _hasFoleyPlayedTooRecently(effect: SoundEffect) {
        const now = Date.now()
        const lastPlayedAt = this._foleyLastPlayedAt.get(effect)
        if (lastPlayedAt !== undefined && now - lastPlayedAt < this._foleyRecentSuppressMs) return true

        this._foleyLastPlayedAt.set(effect, now)
        return false
    }

    private static _getAudioContext(): AudioContext | null {
        if (this._audioContext) return this._audioContext

        const audioGlobal = globalThis as typeof globalThis & {
            webkitAudioContext?: typeof AudioContext
        }
        const ContextCtor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext
        if (!ContextCtor) return null

        this._audioContext = new ContextCtor()
        return this._audioContext
    }

    private static _resolveEffectVolume(volume: number) {
        const baseVolume = Number.isFinite(volume) ? Math.max(0, volume) : 1
        return baseVolume * this._sfxVolume
    }

    private static _clampMasterVolume(volume: number, fallback: number) {
        if (!Number.isFinite(volume)) return fallback
        return Math.max(0, Math.min(1, volume))
    }

    private static _syncExclusiveSourceVolumes() {
        for (const [channel, source] of this._exclusiveSources) {
            const effect = this._exclusiveEffects.get(channel)
            if (!source.isValid || !effect) continue

            source.volume = this._resolveEffectVolume(this._exclusiveBaseVolumes.get(channel) ?? 1)
        }
    }

    private static _loadAudioBuffer(effect: SoundEffect, clip: AudioClip) {
        const cached = this._audioBuffers.get(effect)
        if (cached) return cached

        const promise = this._decodeAudioBuffer(clip)
        this._audioBuffers.set(effect, promise)
        return promise
    }

    private static async _decodeAudioBuffer(clip: AudioClip): Promise<AudioBuffer | null> {
        const context = this._getAudioContext()
        const url = (clip as AudioClipWithNativeAsset)._nativeAsset?.url
        if (!context || !url || typeof fetch !== 'function') return null

        try {
            const response = await fetch(url)
            const data = await response.arrayBuffer()
            return await context.decodeAudioData(data)
        } catch {
            return null
        }
    }
}
