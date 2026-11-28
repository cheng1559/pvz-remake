import { AudioClip, AudioSource, director, Node, sys } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { FoleyDefinition, PresentationSound } from '@/shared/content/presentation'

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setPitch?: (audioId: number, pitch: number) => boolean
    setFinishCallback?: (audioId: number, callback: () => void) => void
    setVolume?: (audioId: number, volume: number) => void
    preload?: (url: string, callback: (success: boolean) => void) => void
    pause?: (audioId: number) => void
    resume?: (audioId: number) => void
    stop?: (audioId: number) => void
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        AudioEngine?: NativeAudioEngine
    }
}

export interface SoundOptions {
    foley?: boolean
    pitchRange?: number
    /** Fixed pitch in semitones. */
    pitch?: number
    volume?: number
    volumeGroup?: 'music' | 'sfx'
    channel?: string
    ifBusy?: 'keep' | 'replace'
    loop?: boolean
    pauseWithGame?: boolean
}

interface SoundPlayer {
    pause(): void
    resume(): void
    stop(): void
    setVolume(volume: number): void
}

/** A channel is occupied from the request until cancellation, failure or playback completion. */
interface Voice {
    channel?: string
    loop: boolean
    pauseWithGame: boolean
    volume: number
    volumeGroup?: SoundOptions['volumeGroup']
    player?: SoundPlayer
}

const DEFAULT_MUSIC_VOLUME = 0.85
const DEFAULT_SFX_VOLUME = 0.5525

/** The base game's sounds by their resource IDs; a Mod's sounds are named `owner:id` the same way. */
export const SoundEffect = {
    Achievement: 'pvz:achievement',
    Awooga: 'pvz:awooga',
    Bleep: 'pvz:bleep',
    BigChomp: 'pvz:bigchomp',
    Buzzer: 'pvz:buzzer',
    Bowling: 'pvz:bowling',
    BowlingImpact: 'pvz:bowlingimpact',
    BowlingImpact2: 'pvz:bowlingimpact2',
    ButtonClick: 'pvz:buttonclick',
    CherryBomb: 'pvz:cherrybomb',
    Chomp: 'pvz:chomp',
    Chomp2: 'pvz:chomp2',
    ChompSoft: 'pvz:chompsoft',
    Chime: 'pvz:chime',
    Coin: 'pvz:coin',
    CrazyDaveCrazy: 'pvz:crazydavecrazy',
    CrazyDaveExtraLong1: 'pvz:crazydaveextralong1',
    CrazyDaveExtraLong2: 'pvz:crazydaveextralong2',
    CrazyDaveExtraLong3: 'pvz:crazydaveextralong3',
    CrazyDaveLong1: 'pvz:crazydavelong1',
    CrazyDaveLong2: 'pvz:crazydavelong2',
    CrazyDaveLong3: 'pvz:crazydavelong3',
    CrazyDaveScream: 'pvz:crazydavescream',
    CrazyDaveScream2: 'pvz:crazydavescream2',
    CrazyDaveShort1: 'pvz:crazydaveshort1',
    CrazyDaveShort2: 'pvz:crazydaveshort2',
    CrazyDaveShort3: 'pvz:crazydaveshort3',
    Diamond: 'pvz:diamond',
    DiggerZombie: 'pvz:digger_zombie',
    DirtRise: 'pvz:dirt_rise',
    NewspaperRarrgh: 'pvz:newspaper_rarrgh',
    NewspaperRarrgh2: 'pvz:newspaper_rarrgh2',
    Drop: 'pvz:tap2',
    EvilLaugh: 'pvz:evillaugh',
    GraveButton: 'pvz:gravebutton',
    Grassstep: 'pvz:grassstep',
    Groan: 'pvz:groan',
    Groan2: 'pvz:groan2',
    Groan3: 'pvz:groan3',
    Groan4: 'pvz:groan4',
    Groan5: 'pvz:groan5',
    Groan6: 'pvz:groan6',
    Gulp: 'pvz:gulp',
    HatchbackClose: 'pvz:hatchback_close',
    HatchbackOpen: 'pvz:hatchback_open',
    HugeWave: 'pvz:hugewave',
    Juicy: 'pvz:juicy',
    Lawnmower: 'pvz:lawnmower',
    LimbsPop: 'pvz:limbs_pop',
    LoseMusic: 'pvz:losemusic',
    MindControlled: 'pvz:mindcontrolled',
    MoneyFalls: 'pvz:moneyfalls',
    Paper: 'pvz:paper',
    Pause: 'pvz:pause',
    Plant: 'pvz:plant',
    Plant2: 'pvz:plant2',
    PlantGrow: 'pvz:plantgrow',
    Points: 'pvz:points',
    PoleVault: 'pvz:polevault',
    PotatoMine: 'pvz:potato_mine',
    ReverseExplosion: 'pvz:reverse_explosion',
    ReadySetPlant: 'pvz:readysetplant',
    RollIn: 'pvz:roll_in',
    SeedLift: 'pvz:seedlift',
    ShieldHit: 'pvz:shieldhit',
    ShieldHit2: 'pvz:shieldhit2',
    Shovel: 'pvz:shovel',
    Siren: 'pvz:siren',
    Scream: 'pvz:scream',
    Splat: 'pvz:splat',
    Splat2: 'pvz:splat2',
    Splat3: 'pvz:splat3',
    PlasticHit: 'pvz:plastichit',
    PlasticHit2: 'pvz:plastichit2',
    SnowPeaSparkles: 'pvz:snow_pea_sparkles',
    Tap: 'pvz:tap',
    Throw: 'pvz:throw',
    Throw2: 'pvz:throw2',
    FinalFanfare: 'pvz:finalfanfare',
    Floop: 'pvz:floop',
    FinalWave: 'pvz:finalwave',
    Frozen: 'pvz:frozen',
    LightFill: 'pvz:lightfill',
    LoadingBarFlower: 'pvz:loadingbar_flower',
    LoadingBarZombie: 'pvz:loadingbar_zombie',
    WinMusic: 'pvz:winmusic',
    ZombieFalling1: 'pvz:zombie_falling_1',
    ZombieFalling2: 'pvz:zombie_falling_2',
} as const

export type SoundEffect = (typeof SoundEffect)[keyof typeof SoundEffect]

export class SoundSystem {
    private static readonly _effects: SoundEffect[] = Object.values(SoundEffect)
    private static readonly _pitchStepMultiplier = 1.0594630943592953
    private static readonly _foleyRecentSuppressMs = 100
    private static readonly _maxNativeOneShots = 32
    /** The presentation's foley (useFoley); none before it loads. */
    private static _foley: Readonly<Record<string, FoleyDefinition>> = {}
    private static _clips: Map<string, AudioClip> = new Map()
    private static _loading: Map<string, Promise<AudioClip | null>> = new Map()
    private static _audioBuffers: Map<string, Promise<AudioBuffer | null>> = new Map()
    private static _foleyLastPlayedAt: Map<string, number> = new Map()
    private static _nativeOneShotIds: Set<number> = new Set()
    private static readonly _voices = new Set<Voice>()
    private static _gamePaused = false
    private static _audioContext: AudioContext | null = null
    private static _focusMuted = false
    private static _musicVolume = DEFAULT_MUSIC_VOLUME
    private static _sfxVolume = DEFAULT_SFX_VOLUME
    private static readonly _musicVolumeListeners = new Set<() => void>()

    /** The presentation's foley by audio ID, once it has loaded. */
    public static useFoley(foley: Readonly<Record<string, FoleyDefinition>>): void {
        this._foley = foley
    }

    public static preloadAll() {
        return Promise.all(this._effects.map((effect) => this.load(effect)))
    }

    public static getMusicVolume() {
        return this._musicVolume
    }

    public static getMusicOutputVolume(): number {
        return this._focusMuted ? 0 : this._musicVolume
    }

    public static setFocusMuted(muted: boolean): void {
        if (this._focusMuted === muted) return
        this._focusMuted = muted
        this._syncVolumes()
        for (const listener of this._musicVolumeListeners) listener()
    }

    public static setMusicVolume(volume: number) {
        this._musicVolume = this._clampMasterVolume(volume, DEFAULT_MUSIC_VOLUME)
        this._syncVolumes()
        for (const listener of this._musicVolumeListeners) listener()
    }

    public static onMusicVolumeChange(listener: () => void): () => void {
        this._musicVolumeListeners.add(listener)
        return () => { this._musicVolumeListeners.delete(listener) }
    }

    public static getSfxVolume() {
        return this._sfxVolume
    }

    public static setSfxVolume(volume: number) {
        this._sfxVolume = this._clampMasterVolume(volume, DEFAULT_SFX_VOLUME)
        this._syncVolumes()
    }

    public static load(effect: string): Promise<AudioClip | null> {
        const cached = this._clips.get(effect)
        if (cached) return Promise.resolve(cached)

        const loading = this._loading.get(effect)
        if (loading) return loading

        const promise = modResources.audio(effect).then((clip) => {
            if (clip) {
                this._clips.set(effect, clip)
                this._preloadNativeSfx(clip)
            }
            return clip ?? null
        }).finally(() => this._loading.delete(effect))

        this._loading.set(effect, promise)
        return promise
    }

    public static async playSounds(sounds: readonly PresentationSound[] | undefined): Promise<void> {
        if (!sounds?.length) return
        await Promise.all(sounds.map(sound => this.play(sound.audio, sound)))
    }

    public static async play(effect: string, options: SoundOptions = {}): Promise<void> {
        if (!GameDebugSettings.perfSfxEnabled) return

        const { channel } = options
        if (channel !== undefined) {
            const previous = this._channel(channel)
            if (previous) {
                if (options.ifBusy === 'keep') return
                this._stop(previous)
            }
        }
        if (options.foley && this._hasFoleyPlayedTooRecently(effect)) return
        const definition = this._foley[effect]
        const pauseWithGame = options.pauseWithGame ?? definition?.pauseWithGame ?? false
        const voice: Voice = { channel, loop: options.loop === true, pauseWithGame, volume: options.volume ?? 1, volumeGroup: options.volumeGroup }
        this._voices.add(voice)
        let started = false
        try {
            const id = options.foley ? this._pickFoleyEffect(effect) : effect
            const range = options.foley ? options.pitchRange ?? definition?.pitchRange ?? 0 : 0
            const pitch = options.pitch ?? (range ? Math.random() * range : 0)
            const clip = await this.load(id)
            if (!clip || !GameDebugSettings.perfSfxEnabled || !this._voices.has(voice)) return
            await this._playClip(id, clip, pitch, options, voice)
            started = !!voice.player
        } finally {
            if (!started && this._voices.has(voice)) this._stop(voice)
        }
    }

    private static _channel(channel: string): Voice | undefined {
        for (const voice of this._voices) if (voice.channel === channel) return voice
        return undefined
    }

    public static isChannelActive(channel: string): boolean { return !!this._channel(channel) }

    public static stopChannel(channel: string): void {
        const voice = this._channel(channel)
        if (voice) this._stop(voice)
    }

    private static _stop(voice: Voice): void {
        this._voices.delete(voice)
        voice.player?.stop()
    }

    public static pauseGameSounds(paused: boolean): void {
        if (this._gamePaused === paused) return
        this._gamePaused = paused
        for (const voice of this._voices) {
            if (!voice.pauseWithGame) continue
            if (paused) voice.player?.pause()
            else voice.player?.resume()
        }
    }

    public static stopGameSounds(): void {
        for (const voice of this._voices) if (voice.pauseWithGame) this._stop(voice)
        this._gamePaused = false
    }

    /**
     * The window is hidden. A native build's audio engine pauses every sound with it and plays them on as it comes back,
     * where the web's go on unheard and end. A sound that plays once and does not pause with the game stops instead of
     * being heard late, whatever the game is doing then; a looping one, and one that pauses with the game, go on.
     */
    public static windowHidden(): void {
        for (const voice of this._voices) if (!voice.loop && !voice.pauseWithGame) this._stop(voice)
    }

    private static async _playClip(id: string, clip: AudioClip, pitch: number, options: SoundOptions, voice: Voice) {
        const loop = voice.loop
        if (this._playNative(clip, pitch, this._outputVolume(options), voice, loop)) return

        const context = pitch || (!sys.isNative && !voice.channel && !voice.pauseWithGame) ? this._getAudioContext() : null
        const buffer = context ? await this._loadAudioBuffer(id, clip) : null
        if (!this._voices.has(voice)) return
        const paused = voice.pauseWithGame && this._gamePaused
        const output = this._outputVolume(options)
        if (!context || !buffer) {
            const node = this._createPersistentAudioNode('SoundEffect')
            const source = node.addComponent(AudioSource)
            source.playOnAwake = false
            source.clip = clip
            source.loop = loop
            source.volume = output
            voice.player = {
                pause: () => source.pause(), resume: () => source.play(),
                stop: () => { source.stop(); node.destroy() },
                setVolume: value => { source.volume = value },
            }
            node.once(AudioSource.EventType.ENDED, () => { this._voices.delete(voice); node.destroy() })
            if (!paused) source.play()
            return
        }

        if (context.state === 'suspended') void context.resume()
        const source = context.createBufferSource(), gain = context.createGain()
        const rate = Math.pow(this._pitchStepMultiplier, pitch)
        source.buffer = buffer
        source.loop = loop
        source.playbackRate.value = paused ? 0 : rate
        gain.gain.value = paused ? 0 : output
        source.connect(gain)
        gain.connect(context.destination)
        voice.player = {
            pause() { gain.gain.value = 0; source.playbackRate.value = 0 },
            resume: () => { source.playbackRate.value = rate; gain.gain.value = this._outputVolume(voice) },
            stop() { source.stop() },
            setVolume: value => { if (!voice.pauseWithGame || !this._gamePaused) gain.gain.value = value },
        }
        source.onended = () => { this._voices.delete(voice) }
        source.start()
    }

    private static _playNative(clip: AudioClip, pitch: number, volume: number, voice: Voice, loop: boolean): boolean {
        const engine = (globalThis as NativeBindings).jsb?.AudioEngine
        if (!engine?.pause || !engine.resume || !engine.stop || !engine.setVolume || !engine.setFinishCallback) return false
        const countsAsOneShot = voice.channel === undefined
        if (countsAsOneShot && this._nativeOneShotIds.size >= this._maxNativeOneShots) return true
        const audioId = this._playNativeSfx(clip, Math.pow(this._pitchStepMultiplier, pitch), volume, loop)
        if (audioId === null) return false

        if (countsAsOneShot) this._nativeOneShotIds.add(audioId)
        const finish = () => {
            this._nativeOneShotIds.delete(audioId)
            this._voices.delete(voice)
        }
        voice.player = {
            pause: () => engine.pause!(audioId), resume: () => engine.resume!(audioId),
            stop: () => { engine.stop!(audioId); finish() },
            setVolume: value => engine.setVolume?.(audioId, value),
        }
        if (voice.pauseWithGame && this._gamePaused) voice.player.pause()
        engine.setFinishCallback(audioId, finish)
        return true
    }

    private static _playNativeSfx(clip: AudioClip, pitch: number, volume: number, loop: boolean) {
        if (!sys.isNative) return null
        const url = clip.nativeUrl
        if (!url) return null

        const audioEngine = (globalThis as NativeBindings).jsb?.AudioEngine
        if (!audioEngine?.play2d) return null
        const audioId = audioEngine.play2d(url, loop, volume)
        if (typeof audioId !== 'number' || audioId < 0) return null
        if (pitch !== 1 && !audioEngine.setPitch?.(audioId, pitch)) {
            audioEngine.stop?.(audioId)
            return null
        }
        return audioId
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

    private static _pickFoleyEffect(effect: string) {
        const variants = this._foley[effect]?.variants
        if (!variants || variants.length === 0) return effect

        return variants[Math.floor(Math.random() * variants.length)]
    }

    private static _hasFoleyPlayedTooRecently(effect: string) {
        const now = Date.now()
        const lastPlayedAt = this._foleyLastPlayedAt.get(effect)
        if (lastPlayedAt !== undefined && now - lastPlayedAt < this._foleyRecentSuppressMs) return true

        this._foleyLastPlayedAt.set(effect, now)
        return false
    }

    private static _preloadNativeSfx(clip: AudioClip) {
        const url = clip.nativeUrl
        if (!url) return
        ;(globalThis as NativeBindings).jsb?.AudioEngine?.preload?.(url, () => {})
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

    private static _outputVolume({ volume = 1, volumeGroup }: Pick<SoundOptions, 'volume' | 'volumeGroup'>) {
        if (this._focusMuted) return 0
        const base = Number.isFinite(volume) ? Math.max(0, volume) : 1
        if (volumeGroup === 'music') return this._sfxVolume < 1e-6 ? 0 : base * this._musicVolume
        return base * this._sfxVolume
    }

    private static _clampMasterVolume(volume: number, fallback: number) {
        if (!Number.isFinite(volume)) return fallback
        return Math.max(0, Math.min(1, volume))
    }

    private static _syncVolumes() {
        for (const voice of this._voices) voice.player?.setVolume(this._outputVolume(voice))
    }

    private static _loadAudioBuffer(effect: string, clip: AudioClip) {
        const cached = this._audioBuffers.get(effect)
        if (cached) return cached

        const promise = this._decodeAudioBuffer(clip)
        this._audioBuffers.set(effect, promise)
        return promise
    }

    private static async _decodeAudioBuffer(clip: AudioClip): Promise<AudioBuffer | null> {
        const context = this._getAudioContext()
        const url = clip.nativeUrl
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
