/**
 * The web's module player: an AudioWorklet processor that runs native/engine/common/music in WebAssembly
 * (assets/resources/music/pvz_music.bin, built by tools/music/build.ts) and renders its mix on the audio thread.
 * The page sends it the wasm and then commands; it answers loads and posts each instance's position every
 * STATE_FRAMES frames. It is a string because AudioWorklet loads a script of its own, not one of the game's modules.
 *
 * Messages in: { type: 'init', wasm: ArrayBuffer }, { type: 'load', id, bytes: ArrayBuffer },
 * { type: 'play', instance, order, row }, { type: 'stop', instance }, { type: 'volume', instance, volume },
 * { type: 'channelVolume', instance, channel, volume }, { type: 'queueJump', target, watched, orders, volume },
 * { type: 'pause', paused }. Messages out: { type: 'ready' } or { type: 'failed', error },
 * { type: 'loaded', id, instance, channels } (instance -1 when the module could not be read), { type: 'state', state: Float64Array }
 * with order, row, row fraction, playing and the jumps landed for each instance in turn.
 */
export const MODULE_MUSIC_PROCESSOR = 'pvz-music'
export const STATE_FRAMES = 1024
export const STATE_FIELDS = 5

export const MODULE_MUSIC_WORKLET_SOURCE = String.raw`
const STATE_FRAMES = ${STATE_FRAMES}
const STATE_FIELDS = ${STATE_FIELDS}

class PvzMusicProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.api = null
        this.player = 0
        this.buffer = 0
        this.bufferFrames = 0
        this.instances = 0
        this.paused = false
        this.sinceState = 0
        this.pending = []
        this.port.onmessage = (event) => this.receive(event.data)
    }

    receive(message) {
        if (message.type === 'init') { this.start(message.wasm); return }
        if (!this.api) { this.pending.push(message); return }
        this.apply(message)
    }

    start(wasm) {
        let memory = null
        const view = () => new DataView(memory.buffer)
        // libopenmpt asks the system for little: the time, a random seed, and somewhere to print; none matter here.
        const wasi = {
            clock_time_get: (_id, _precision, out) => { view().setBigUint64(out, 0n, true); return 0 },
            random_get: (pointer, length) => { new Uint8Array(memory.buffer, pointer, length).fill(0x5a); return 0 },
            environ_sizes_get: (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0 },
            environ_get: () => 0,
            fd_write: (_fd, iovs, count, written) => {
                let total = 0
                for (let index = 0; index < count; index++) total += view().getUint32(iovs + index * 8 + 4, true)
                view().setUint32(written, total, true)
                return 0
            },
            fd_read: (_fd, _iovs, _count, read) => { view().setUint32(read, 0, true); return 0 },
            fd_seek: () => 0,
            fd_close: () => 0,
        }
        WebAssembly.instantiate(wasm, { env: { emscripten_notify_memory_growth: () => {} }, wasi_snapshot_preview1: wasi })
            .then(({ instance }) => {
                const api = instance.exports
                memory = api.memory
                api._initialize()
                this.api = api
                this.player = api.pvz_music_create(sampleRate)
                this.port.postMessage({ type: 'ready' })
                for (const message of this.pending.splice(0)) this.apply(message)
            })
            .catch((error) => this.port.postMessage({ type: 'failed', error: String(error) }))
    }

    apply(message) {
        const api = this.api, player = this.player
        switch (message.type) {
            case 'load': {
                const bytes = new Uint8Array(message.bytes)
                const pointer = api.malloc(bytes.length)
                new Uint8Array(api.memory.buffer, pointer, bytes.length).set(bytes)
                const instance = api.pvz_music_load(player, pointer, bytes.length)
                api.free(pointer)
                if (instance >= 0) this.instances = Math.max(this.instances, instance + 1)
                this.port.postMessage({ type: 'loaded', id: message.id, instance, channels: instance >= 0 ? api.pvz_music_channels(player, instance) : 0 })
                break
            }
            case 'play': api.pvz_music_play(player, message.instance, message.order, message.row); break
            case 'stop': api.pvz_music_stop(player, message.instance); break
            case 'volume': api.pvz_music_set_volume(player, message.instance, message.volume); break
            case 'channelVolume': api.pvz_music_set_channel_volume(player, message.instance, message.channel, message.volume); break
            case 'queueJump': {
                const orders = message.orders
                const pointer = api.malloc(Math.max(1, orders.length) * 4)
                new Int32Array(api.memory.buffer, pointer, orders.length).set(orders)
                api.pvz_music_queue_jump(player, message.target, message.watched, pointer, orders.length, message.volume)
                api.free(pointer)
                break
            }
            case 'pause': this.paused = !!message.paused; break
        }
    }

    process(_inputs, outputs) {
        const output = outputs[0]
        if (!this.api || this.paused || !output || output.length === 0) return true
        const api = this.api, frames = output[0].length
        if (frames > this.bufferFrames) {
            if (this.buffer) api.free(this.buffer)
            this.buffer = api.malloc(frames * 8)
            this.bufferFrames = frames
        }
        api.pvz_music_render(this.player, this.buffer, frames)
        const mix = new Float32Array(api.memory.buffer, this.buffer, frames * 2)
        const left = output[0], right = output[1] || output[0]
        for (let frame = 0; frame < frames; frame++) {
            left[frame] = mix[frame * 2]
            right[frame] = mix[frame * 2 + 1]
        }
        this.sinceState += frames
        if (this.sinceState >= STATE_FRAMES) {
            this.sinceState = 0
            this.postState()
        }
        return true
    }

    postState() {
        const api = this.api, state = new Float64Array(this.instances * STATE_FIELDS)
        const pointer = api.malloc(24)
        for (let instance = 0; instance < this.instances; instance++) {
            api.pvz_music_position(this.player, instance, pointer)
            const position = new Float64Array(api.memory.buffer, pointer, 3)
            state.set(position, instance * STATE_FIELDS)
            state[instance * STATE_FIELDS + 3] = api.pvz_music_playing(this.player, instance)
            state[instance * STATE_FIELDS + 4] = api.pvz_music_jumps(this.player, instance)
        }
        api.free(pointer)
        this.port.postMessage({ type: 'state', state }, [state.buffer])
    }
}

registerProcessor('${MODULE_MUSIC_PROCESSOR}', PvzMusicProcessor)
`
