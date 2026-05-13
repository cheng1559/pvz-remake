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

type NativeBindings = typeof globalThis & {
    jsb?: {
        AudioEngine?: NativeAudioEngine
    }
}

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
    }
    private static _clips: Map<SoundEffect, AudioClip> = new Map()
    private static _loading: Map<SoundEffect, Promise<AudioClip | null>> = new Map()
    private static _audioBuffers: Map<SoundEffect, Promise<AudioBuffer | null>> = new Map()
    private static _foleyLastPlayedAt: Map<SoundEffect, number> = new Map()
    private static _audioContext: AudioContext | null = null
    private static _source: AudioSource | null = null

    public static preloadAll() {
        return Promise.all(this._effects.map((effect) => this.load(effect)))
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
        source.playOneShot(clip, volume)
    }

    public static playFoley(effect: SoundEffect, pitchRange?: number, volume = 1) {
        if (this._hasFoleyPlayedTooRecently(effect)) return Promise.resolve()

        const selectedEffect = this._pickFoleyEffect(effect)
        const resolvedPitchRange = pitchRange ?? this._foleyPitchRanges[effect] ?? 0
        const pitch = resolvedPitchRange === 0 ? 0 : Math.random() * resolvedPitchRange
        return this.playWithPitch(selectedEffect, pitch, volume)
    }

    public static async playWithPitch(effect: SoundEffect, pitchSteps: number, volume = 1) {
        const clip = await this.load(effect)
        if (!clip) return

        if (pitchSteps === 0) {
            this._getSource().playOneShot(clip, volume)
            return
        }

        if (await this._playNativeWithPitch(clip, pitchSteps, volume)) {
            return
        }

        const context = this._getAudioContext()
        if (!context) {
            this._getSource().playOneShot(clip, volume)
            return
        }

        const buffer = await this._loadAudioBuffer(effect, clip)
        if (!buffer) {
            this._getSource().playOneShot(clip, volume)
            return
        }

        if (context.state === 'suspended') {
            void context.resume()
        }

        const source = context.createBufferSource()
        const gain = context.createGain()
        source.buffer = buffer
        source.playbackRate.value = Math.pow(this._pitchStepMultiplier, pitchSteps)
        gain.gain.value = volume
        source.connect(gain)
        gain.connect(context.destination)
        source.start()
    }

    private static async _playNativeWithPitch(clip: AudioClip, pitchSteps: number, volume: number) {
        const bindings = globalThis as NativeBindings
        const audioEngine = bindings.jsb?.AudioEngine
        if (!audioEngine?.play2d || !audioEngine.setPitch) return false

        const url = (clip as AudioClipWithNativeAsset)._nativeAsset?.url ?? (clip as AudioClipWithNativeAsset).nativeUrl
        if (!url) return false

        const audioId = audioEngine.play2d(url, false, volume)
        if (typeof audioId !== 'number' || audioId < 0) return false

        audioEngine.setPitch(audioId, Math.pow(this._pitchStepMultiplier, pitchSteps))
        return true
    }

    private static _getSource() {
        if (this._source?.isValid) return this._source

        const node = new Node('SoundLoader')
        const scene = director.getScene()
        if (scene) {
            scene.addChild(node)
        }
        director.addPersistRootNode(node)
        this._source = node.addComponent(AudioSource)
        return this._source
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
