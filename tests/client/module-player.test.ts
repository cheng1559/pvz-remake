import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as worklet from '../../assets/scripts/client/music/ModuleMusicWorklet'
import { loadScript } from '../loadScript'

// The web's module player end to end: the real processor source in a stand-in AudioWorkletGlobalScope, the committed
// WebAssembly build of native/engine/common/music, and WorkletModulePlayer talking to it over a message port. The test
// renders by calling the processor's process() as the audio thread would.

const RATE = 44100
const ROW_FRAMES = RATE * 2.5 / 125 // speed 1 at tempo 125

type Cell = { sample?: number, period?: number, effect?: number, param?: number }

/** A four-channel ProTracker module whose one sample is a looped square wave. */
function protracker(patterns: (Cell | undefined)[][][], orders: number[]): Uint8Array {
    const header = new Uint8Array(20 + 31 * 30 + 2 + 128 + 4)
    const view = new DataView(header.buffer)
    const sample = Int8Array.from({ length: 64 }, (_, index) => index < 32 ? 64 : -64)
    view.setUint16(20 + 22, sample.length / 2)
    header[20 + 25] = 64
    view.setUint16(20 + 28, sample.length / 2)
    for (let index = 1; index < 31; index++) view.setUint16(20 + index * 30 + 28, 1)
    const table = 20 + 31 * 30
    header[table] = orders.length
    header[table + 1] = 127
    orders.forEach((order, index) => { header[table + 2 + index] = order })
    header.set([...'M.K.'].map(char => char.charCodeAt(0)), table + 2 + 128)
    const cells = new Uint8Array(patterns.length * 1024)
    patterns.forEach((rows, pattern) => rows.forEach((row, rowIndex) => row.forEach((cell, channel) => {
        if (!cell) return
        const at = pattern * 1024 + rowIndex * 16 + channel * 4, number = cell.sample ?? 0, period = cell.period ?? 0
        cells.set([(number & 0xf0) | ((period >> 8) & 0x0f), period & 0xff, ((number & 0x0f) << 4) | (cell.effect ?? 0), cell.param ?? 0], at)
    })))
    const file = new Uint8Array(header.length + cells.length + sample.length)
    file.set(header)
    file.set(cells, header.length)
    file.set(new Uint8Array(sample.buffer), header.length + cells.length)
    return file
}

const note = { sample: 1, period: 428 }, speed = { effect: 0xf, param: 1 }
const end = (effect: number, param: number) => [undefined, undefined, undefined, { effect, param }]
// Four rows each. Orders 0, 1, 2 then back to 1 (B01); 3 and 4 loop each other and are reached only by a jump.
const MODULE = protracker([
    [[note, undefined, undefined, speed], [], [], end(0xd, 0)],
    [[undefined, note, undefined, speed], [], [], end(0xd, 0)],
    [[undefined, undefined, note, speed], [], [], end(0xb, 1)],
    [[undefined, note, undefined, speed], [], [], end(0xd, 0)],
    [[undefined, undefined, note, speed], [], [], end(0xb, 3)],
], [0, 1, 2, 3, 4])

async function setup() {
    const flush = () => new Promise(resolve => setImmediate(resolve))
    const pair = () => {
        const a: any = { onmessage: null }, b: any = { onmessage: null }
        a.postMessage = (data: unknown) => queueMicrotask(() => b.onmessage?.({ data }))
        b.postMessage = (data: unknown) => queueMicrotask(() => a.onmessage?.({ data }))
        return [a, b]
    }
    const processors = new Map<string, any>()
    let nextPort: any
    class AudioWorkletProcessor { port = nextPort }
    let processor: any
    class AudioWorkletNode {
        port: any
        constructor(_context: unknown, name: string) {
            const [main, audio] = pair()
            nextPort = audio
            processor = new (processors.get(name))()
            this.port = main
        }
        connect() {}
        disconnect() {}
    }
    const node = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} })
    const context = {
        destination: {},
        createGain: node,
        audioWorklet: {
            async addModule() {
                new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', worklet.MODULE_MUSIC_WORKLET_SOURCE)(
                    AudioWorkletProcessor, (name: string, type: unknown) => processors.set(name, type), RATE)
            },
        },
    }
    const { WorkletModulePlayer } = loadScript('assets/scripts/client/music/ModulePlayer.ts',
        id => id === './ModuleMusicWorklet' ? worklet : {}, { URL, Blob, AudioWorkletNode })
    const wasm = readFileSync('assets/resources/music/pvz_music.bin')
    const player = await WorkletModulePlayer.create(context, wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength))
    /** Renders `frames` frames, then lets the messages through; the loudest sample. */
    const render = async (frames: number) => {
        let peak = 0
        for (let done = 0; done < frames; done += 128) {
            const output = [new Float32Array(128), new Float32Array(128)]
            processor.process([], [output])
            for (const channel of output) for (const value of channel) peak = Math.max(peak, Math.abs(value))
        }
        await flush()
        return peak
    }
    return { player, render, flush }
}

test('an instance plays from its order with the notes reset and loops by the module\'s own jump', async () => {
    const { player, render, flush } = await setup()
    const instance = await player.load(MODULE)
    assert.equal(instance, 0)
    for (const channel of [1, 2, 3]) player.setChannelVolume(instance, channel, 0)
    player.play(instance, 0)
    await flush()
    const orders: number[] = []
    let firstPeak = 0
    for (let step = 0; step < 40; step++) {
        const peak = await render(1024)
        if (step < 4) firstPeak = Math.max(firstPeak, peak)
        const { order } = player.position(instance)
        if (orders.at(-1) !== order) orders.push(order)
    }
    assert.deepEqual(orders.slice(0, 7), [0, 1, 2, 1, 2, 1, 2])
    assert.ok(firstPeak > 0.01, 'channel 0 plays its note')

    // From order 1 the note of order 0 does not sound on, as libopenmpt would by default and BASS_MUSIC_POSRESET does not.
    player.play(instance, 1)
    await render(256)
    assert.equal(await render(4 * 4 * ROW_FRAMES), 0)
})

test('a queued jump lands as the watched instance enters its next order, at the volume it was given', async () => {
    const { player, render } = await setup()
    const melody = await player.load(MODULE), drums = await player.load(MODULE)
    player.play(melody, 1)
    player.setVolume(drums, 0)
    player.play(drums, 0)
    player.queueJump(drums, melody, [3, 4], 1)
    let landed
    for (let step = 0; step < 8 && !landed; step++) {
        await render(1024)
        if (player.position(melody).order === 2) landed = { melody: player.position(melody), drums: player.position(drums) }
    }
    assert.ok(landed, 'the melody went on to order 2')
    // Order 2 is even: the first of the list, in step with the melody to within the 64 frames a block renders.
    assert.equal(landed.drums.order, 3)
    const rows = (position: { row: number, rowFraction: number }) => position.row + position.rowFraction
    assert.ok(Math.abs(rows(landed.drums) - rows(landed.melody)) <= 64 / ROW_FRAMES + 1e-9, JSON.stringify(landed))
    assert.equal(player.jumps(drums), 1, 'one jump landed')

    // At volume 1: muting the melody leaves the drums sounding.
    player.setVolume(melody, 0)
    await render(1024)
    assert.ok(await render(2048) > 0.01)
})

test('a paused player renders nothing and holds its place, and a module it cannot read loads as -1', async () => {
    const { player, render } = await setup()
    assert.equal(await player.load(new Uint8Array([1, 2, 3, 4])), -1)
    const instance = await player.load(MODULE)
    player.play(instance, 0)
    await render(2048)
    player.setPaused(true)
    await render(128)
    const held = player.position(instance)
    assert.equal(await render(8192), 0)
    assert.deepEqual(player.position(instance), held)
    player.setPaused(false)
    await render(128)
    assert.ok(await render(4096) > 0)
})
