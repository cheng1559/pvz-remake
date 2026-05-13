import { AudioClip, AudioSource, director, Node } from 'cc'
import { AssetLoader } from './AssetLoader'

type NativeAudioAsset = {
    url?: string
}

type AudioClipWithNativeAsset = AudioClip & {
    _nativeAsset?: NativeAudioAsset | null
}

type NativePCMHeader = {
    totalFrames?: number
    bytesPerFrame?: number
    sampleRate?: number
    channelCount?: number
    dataFormat?: number
    audioFormat?: number
}

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setFinishCallback?: (audioId: number, callback: () => void) => void
    getPCMHeader?: (url: string) => NativePCMHeader | null
    getOriginalPCMBuffer?: (url: string, channelId: number) => ArrayBuffer | ArrayBufferView | null
}

type NativeFileUtils = {
    getWritablePath?: () => string
    createDirectory?: (path: string) => boolean
    isFileExist?: (path: string) => boolean
    writeDataToFile?: (data: ArrayBuffer | ArrayBufferView, path: string) => boolean
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        AudioEngine?: NativeAudioEngine
        fileUtils?: NativeFileUtils
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
    private static readonly _nativePitchStep = 0.5
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
    private static _nativePitchedWavs: Map<string, Promise<string | null>> = new Map()
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

        if (await this._playNativeWithPitch(effect, clip, pitchSteps, volume)) {
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

    private static async _playNativeWithPitch(effect: SoundEffect, clip: AudioClip, pitchSteps: number, volume: number) {
        const bindings = globalThis as NativeBindings
        const audioEngine = bindings.jsb?.AudioEngine
        if (!audioEngine?.play2d || !audioEngine.getPCMHeader || !audioEngine.getOriginalPCMBuffer) return false

        const url = (clip as AudioClipWithNativeAsset)._nativeAsset?.url
        if (!url) return false

        const pitchedUrl = await this._getNativePitchedWav(effect, url, pitchSteps)
        if (!pitchedUrl) return false

        const audioId = audioEngine.play2d(pitchedUrl, false, volume)
        return typeof audioId === 'number' && audioId >= 0
    }

    private static _getNativePitchedWav(effect: SoundEffect, url: string, pitchSteps: number) {
        const quantizedPitch = this._quantizeNativePitch(pitchSteps)
        if (quantizedPitch === 0) return Promise.resolve(null)
        const cacheKey = `${effect}:${url}:${quantizedPitch}`
        const cached = this._nativePitchedWavs.get(cacheKey)
        if (cached) return cached

        const promise = this._createNativePitchedWav(effect, url, quantizedPitch, Math.pow(this._pitchStepMultiplier, quantizedPitch))
        this._nativePitchedWavs.set(cacheKey, promise)
        return promise
    }

    private static _quantizeNativePitch(pitchSteps: number) {
        return Math.round(pitchSteps / this._nativePitchStep) * this._nativePitchStep
    }

    private static async _createNativePitchedWav(
        effect: SoundEffect,
        url: string,
        pitchSteps: number,
        rate: number,
    ): Promise<string | null> {
        const bindings = globalThis as NativeBindings
        const audioEngine = bindings.jsb?.AudioEngine
        const fileUtils = bindings.jsb?.fileUtils
        if (!audioEngine?.getPCMHeader || !audioEngine.getOriginalPCMBuffer || !fileUtils?.getWritablePath || !fileUtils.writeDataToFile) {
            return null
        }

        const header = audioEngine.getPCMHeader(url)
        const channelCount = header?.channelCount ?? 0
        const bytesPerFrame = header?.bytesPerFrame ?? 0
        const sampleRate = header?.sampleRate ?? 0
        const totalFrames = header?.totalFrames ?? 0
        const bytesPerSample = channelCount > 0 ? bytesPerFrame / channelCount : 0
        if (!channelCount || !sampleRate || !totalFrames || bytesPerSample !== 2) return null

        const channelSamples: Int16Array[] = []
        for (let channel = 0; channel < channelCount; channel++) {
            const buffer = this._toArrayBuffer(audioEngine.getOriginalPCMBuffer(url, channel))
            if (!buffer) return null
            channelSamples.push(new Int16Array(buffer))
        }

        const wav = this._buildPitchedWav(channelSamples, sampleRate, rate)
        const outputPath = this._nativePitchWavPath(fileUtils, effect, pitchSteps)
        if (!outputPath) return null
        if (fileUtils.isFileExist?.(outputPath)) return outputPath

        return fileUtils.writeDataToFile(wav.buffer, outputPath) ? outputPath : null
    }

    private static _nativePitchWavPath(fileUtils: NativeFileUtils, effect: SoundEffect, pitchSteps: number) {
        const writablePath = fileUtils.getWritablePath?.()
        if (!writablePath) return null

        const dir = `${writablePath.replace(/\\/g, '/')}${writablePath.endsWith('/') || writablePath.endsWith('\\') ? '' : '/'}sound-pitch-cache/`
        fileUtils.createDirectory?.(dir)
        const pitchKey = pitchSteps.toFixed(1).replace('-', 'm').replace('.', 'p')
        return `${dir}${effect}_${pitchKey}.wav`
    }

    private static _toArrayBuffer(data: ArrayBuffer | ArrayBufferView | null | undefined) {
        if (!data) return null
        if (data instanceof ArrayBuffer) return data

        const view = data as ArrayBufferView
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    }

    private static _buildPitchedWav(channels: Int16Array[], sampleRate: number, rate: number) {
        const channelCount = channels.length
        const inputFrames = Math.min(...channels.map((channel) => channel.length))
        const outputFrames = Math.max(1, Math.floor(inputFrames / rate))
        const dataBytes = outputFrames * channelCount * 2
        const bytes = new Uint8Array(44 + dataBytes)
        const view = new DataView(bytes.buffer)

        this._writeAscii(bytes, 0, 'RIFF')
        view.setUint32(4, 36 + dataBytes, true)
        this._writeAscii(bytes, 8, 'WAVE')
        this._writeAscii(bytes, 12, 'fmt ')
        view.setUint32(16, 16, true)
        view.setUint16(20, 1, true)
        view.setUint16(22, channelCount, true)
        view.setUint32(24, sampleRate, true)
        view.setUint32(28, sampleRate * channelCount * 2, true)
        view.setUint16(32, channelCount * 2, true)
        view.setUint16(34, 16, true)
        this._writeAscii(bytes, 36, 'data')
        view.setUint32(40, dataBytes, true)

        let byteOffset = 44
        for (let frame = 0; frame < outputFrames; frame++) {
            const sourcePosition = frame * rate
            const sourceFrame = Math.floor(sourcePosition)
            const nextSourceFrame = Math.min(sourceFrame + 1, inputFrames - 1)
            const blend = sourcePosition - sourceFrame
            for (let channel = 0; channel < channelCount; channel++) {
                const samples = channels[channel]
                const sample = samples[sourceFrame] + (samples[nextSourceFrame] - samples[sourceFrame]) * blend
                view.setInt16(byteOffset, Math.max(-32768, Math.min(32767, Math.round(sample))), true)
                byteOffset += 2
            }
        }

        return bytes
    }

    private static _writeAscii(bytes: Uint8Array, offset: number, value: string) {
        for (let i = 0; i < value.length; i++) {
            bytes[offset + i] = value.charCodeAt(i)
        }
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
