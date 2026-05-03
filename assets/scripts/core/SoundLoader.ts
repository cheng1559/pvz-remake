import { AudioClip, AudioSource, director, Node } from 'cc'
import { AssetLoader } from './AssetLoader'

type NativeAudioAsset = {
    url?: string
}

type AudioClipWithNativeAsset = AudioClip & {
    _nativeAsset?: NativeAudioAsset | null
}

export const SoundEffect = {
    Bleep: 'bleep',
    ButtonClick: 'buttonclick',
    DirtRise: 'dirt_rise',
    EvilLaugh: 'evillaugh',
    GraveButton: 'gravebutton',
    LimbsPop: 'limbs_pop',
    LoseMusic: 'losemusic',
    Paper: 'paper',
    RollIn: 'roll_in',
    Tap: 'tap',
} as const

export type SoundEffect = (typeof SoundEffect)[keyof typeof SoundEffect]

export class SoundLoader {
    private static readonly _basePath = 'audio/sfx'
    private static readonly _effects: SoundEffect[] = Object.values(SoundEffect)
    private static readonly _pitchStepMultiplier = 1.0594630943592953
    private static _clips: Map<SoundEffect, AudioClip> = new Map()
    private static _loading: Map<SoundEffect, Promise<AudioClip | null>> = new Map()
    private static _audioBuffers: Map<SoundEffect, Promise<AudioBuffer | null>> = new Map()
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

    public static playFoley(effect: SoundEffect, pitchRange = 0, volume = 1) {
        const pitch = pitchRange === 0 ? 0 : Math.random() * pitchRange
        return this.playWithPitch(effect, pitch, volume)
    }

    public static async playWithPitch(effect: SoundEffect, pitchSteps: number, volume = 1) {
        const clip = await this.load(effect)
        if (!clip) return

        if (pitchSteps === 0) {
            this._getSource().playOneShot(clip, volume)
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
