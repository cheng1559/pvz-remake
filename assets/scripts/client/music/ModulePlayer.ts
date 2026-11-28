import { MODULE_MUSIC_PROCESSOR, MODULE_MUSIC_WORKLET_SOURCE, STATE_FIELDS } from './ModuleMusicWorklet'

export interface ModulePosition {
    order: number
    row: number
    /** How far into the row, 0 to 1. */
    rowFraction: number
}

/**
 * native/engine/common/music's Player: module instances that each play from an order with notes reset, loop by the
 * module's own jumps and mix in one loop, in step to the sample. The native build runs it on its audio stream; the web
 * in an AudioWorklet (WorkletModulePlayer).
 */
export interface ModulePlayer {
    /**
     * Whether a module loads without holding up the music playing: natively it is read on a thread of its own, the
     * worklet reads it on the audio thread.
     */
    readonly loadsWhilePlaying: boolean
    /** A new instance of the module, stopped at volume 1; -1 when the module cannot be read. */
    load(bytes: Uint8Array): Promise<number>
    play(instance: number, order: number, row?: number): void
    stop(instance: number): void
    /** Reached over the next few milliseconds. */
    setVolume(instance: number, volume: number): void
    setChannelVolume(instance: number, channel: number, volume: number): void
    /**
     * When `watched` next enters another order, `target` plays from row 0 of orders[new order % orders.length], at
     * `volume` unless that is negative. An empty list cancels it.
     */
    queueJump(target: number, watched: number, orders: readonly number[], volume?: number): void
    /** On the web, as the worklet last said: a few milliseconds behind. */
    position(instance: number): ModulePosition
    playing(instance: number): boolean
    /** How many queued jumps have landed on the instance: read late it is behind, never ahead. */
    jumps(instance: number): number
    /** The instance's module's channel count. */
    channels(instance: number): number
    /** The whole mix. */
    setOutputVolume(volume: number): void
    setPaused(paused: boolean): void
    destroy(): void
}

/** native/engine/common/Classes/MusicBindings.cpp, and the engine's AudioEngine for the stream it plays through. */
type NativeMusic = typeof globalThis & {
    __pvzMusicCreate?: (sampleRate: number) => number
    __pvzMusicLoad: (handle: number, bytes: Uint8Array, done: (instance: number) => void) => void
    __pvzMusicPlay: (handle: number, instance: number, order: number, row: number) => void
    __pvzMusicStop: (handle: number, instance: number) => void
    __pvzMusicSetVolume: (handle: number, instance: number, volume: number) => void
    __pvzMusicSetChannelVolume: (handle: number, instance: number, channel: number, volume: number) => void
    __pvzMusicQueueJump: (handle: number, target: number, watched: number, orders: Int32Array, volume: number) => void
    __pvzMusicState: (handle: number, instances: number, out: Float64Array) => void
    __pvzMusicChannels: (handle: number, instance: number) => number
    __pvzMusicStart: (handle: number, volume: number) => number
    __pvzMusicDestroy: (handle: number) => void
    jsb?: { AudioEngine?: { setVolume(audioId: number, volume: number): void, pause(audioId: number): void, resume(audioId: number): void } }
}

/** The native build's player: the C++ Player behind MusicBindings, playing through an AudioEngine stream. */
export class NativeModulePlayer implements ModulePlayer {
    readonly loadsWhilePlaying = true
    private instances = 0
    private state = new Float64Array(STATE_FIELDS)

    private constructor(private readonly native: NativeMusic, private readonly handle: number, private readonly audioId: number) {}

    /** Null where the build has no module player or the engine no stream for it. */
    static create(sampleRate = 44100): NativeModulePlayer | null {
        const native = globalThis as NativeMusic
        if (typeof native.__pvzMusicCreate !== 'function' || !native.jsb?.AudioEngine) return null
        const handle = native.__pvzMusicCreate(sampleRate)
        const audioId = native.__pvzMusicStart(handle, 1)
        if (audioId < 0) {
            native.__pvzMusicDestroy(handle)
            return null
        }
        return new NativeModulePlayer(native, handle, audioId)
    }

    load(bytes: Uint8Array): Promise<number> {
        return new Promise(resolve => this.native.__pvzMusicLoad(this.handle, bytes, instance => {
            if (instance >= this.instances) {
                this.instances = instance + 1
                this.state = new Float64Array(this.instances * STATE_FIELDS)
            }
            resolve(instance)
        }))
    }

    play(instance: number, order: number, row = 0): void {
        this.native.__pvzMusicPlay(this.handle, instance, order, row)
    }

    stop(instance: number): void {
        this.native.__pvzMusicStop(this.handle, instance)
    }

    setVolume(instance: number, volume: number): void {
        this.native.__pvzMusicSetVolume(this.handle, instance, volume)
    }

    setChannelVolume(instance: number, channel: number, volume: number): void {
        this.native.__pvzMusicSetChannelVolume(this.handle, instance, channel, volume)
    }

    queueJump(target: number, watched: number, orders: readonly number[], volume = -1): void {
        this.native.__pvzMusicQueueJump(this.handle, target, watched, Int32Array.from(orders), volume)
    }

    position(instance: number): ModulePosition {
        const at = this.read(instance)
        return at < 0 ? { order: 0, row: 0, rowFraction: 0 } : { order: this.state[at], row: this.state[at + 1], rowFraction: this.state[at + 2] }
    }

    playing(instance: number): boolean {
        const at = this.read(instance)
        return at >= 0 && this.state[at + 3] === 1
    }

    jumps(instance: number): number {
        const at = this.read(instance)
        return at >= 0 ? this.state[at + 4] : 0
    }

    channels(instance: number): number {
        return this.native.__pvzMusicChannels(this.handle, instance)
    }

    setOutputVolume(volume: number): void {
        this.native.jsb?.AudioEngine?.setVolume(this.audioId, volume)
    }

    setPaused(paused: boolean): void {
        if (paused) this.native.jsb?.AudioEngine?.pause(this.audioId)
        else this.native.jsb?.AudioEngine?.resume(this.audioId)
    }

    destroy(): void {
        this.native.__pvzMusicDestroy(this.handle)
    }

    /** The instance's fields in `state`, read now from the audio thread's player; -1 for none. */
    private read(instance: number): number {
        if (instance < 0 || instance >= this.instances) return -1
        this.native.__pvzMusicState(this.handle, this.instances, this.state)
        return instance * STATE_FIELDS
    }
}

/** The web's player: MODULE_MUSIC_WORKLET_SOURCE in an AudioWorkletNode, whose state comes back every few milliseconds. */
export class WorkletModulePlayer implements ModulePlayer {
    readonly loadsWhilePlaying = false
    private state = new Float64Array(0)
    private readonly loads = new Map<number, (instance: number) => void>()
    private readonly channelCounts: number[] = []
    private nextLoad = 0
    private started?: { resolve: () => void, reject: (error: Error) => void }

    private constructor(private readonly node: AudioWorkletNode, private readonly gain: GainNode) {
        node.port.onmessage = (event: MessageEvent) => this.receive(event.data)
    }

    /** Loads the processor into `context` and starts it on the module player's WebAssembly. */
    static async create(context: BaseAudioContext, wasm: ArrayBuffer): Promise<WorkletModulePlayer> {
        const url = URL.createObjectURL(new Blob([MODULE_MUSIC_WORKLET_SOURCE], { type: 'text/javascript' }))
        try {
            await context.audioWorklet.addModule(url)
        } finally {
            URL.revokeObjectURL(url)
        }
        const node = new AudioWorkletNode(context, MODULE_MUSIC_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
        const gain = context.createGain()
        node.connect(gain)
        gain.connect(context.destination)
        const player = new WorkletModulePlayer(node, gain)
        await new Promise<void>((resolve, reject) => {
            player.started = { resolve, reject }
            node.port.postMessage({ type: 'init', wasm }, [wasm])
        })
        return player
    }

    load(bytes: Uint8Array): Promise<number> {
        const id = this.nextLoad++
        const copy = bytes.slice().buffer
        return new Promise(resolve => {
            this.loads.set(id, resolve)
            this.node.port.postMessage({ type: 'load', id, bytes: copy }, [copy])
        })
    }

    play(instance: number, order: number, row = 0): void {
        this.node.port.postMessage({ type: 'play', instance, order, row })
    }

    stop(instance: number): void {
        this.node.port.postMessage({ type: 'stop', instance })
    }

    setVolume(instance: number, volume: number): void {
        this.node.port.postMessage({ type: 'volume', instance, volume })
    }

    setChannelVolume(instance: number, channel: number, volume: number): void {
        this.node.port.postMessage({ type: 'channelVolume', instance, channel, volume })
    }

    queueJump(target: number, watched: number, orders: readonly number[], volume = -1): void {
        this.node.port.postMessage({ type: 'queueJump', target, watched, orders: [...orders], volume })
    }

    position(instance: number): ModulePosition {
        const at = instance * STATE_FIELDS
        return at + STATE_FIELDS <= this.state.length
            ? { order: this.state[at], row: this.state[at + 1], rowFraction: this.state[at + 2] }
            : { order: 0, row: 0, rowFraction: 0 }
    }

    playing(instance: number): boolean {
        return this.state[instance * STATE_FIELDS + 3] === 1
    }

    jumps(instance: number): number {
        return this.state[instance * STATE_FIELDS + 4] ?? 0
    }

    channels(instance: number): number {
        return this.channelCounts[instance] ?? 0
    }

    setOutputVolume(volume: number): void {
        this.gain.gain.value = volume
    }

    setPaused(paused: boolean): void {
        this.node.port.postMessage({ type: 'pause', paused })
    }

    destroy(): void {
        this.node.port.onmessage = null
        this.node.disconnect()
        this.gain.disconnect()
        for (const resolve of this.loads.values()) resolve(-1)
        this.loads.clear()
    }

    private receive(message: { type: string, [key: string]: any }): void {
        switch (message.type) {
            case 'ready':
                this.started?.resolve()
                break
            case 'failed':
                this.started?.reject(new Error(`The module player did not start: ${message.error}`))
                break
            case 'loaded': {
                const resolve = this.loads.get(message.id)
                this.loads.delete(message.id)
                if (message.instance >= 0) this.channelCounts[message.instance] = message.channels
                resolve?.(message.instance)
                break
            }
            case 'state':
                this.state = message.state
                break
        }
    }
}
