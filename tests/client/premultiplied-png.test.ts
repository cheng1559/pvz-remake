import assert from 'node:assert/strict'
import test from 'node:test'
import { zlibSync } from 'fflate'
import { decodePremultipliedPng } from '@/client/content/PremultipliedPng'
import { kernel } from '@/shared/kernel/index'

function png(rows: number[][], width: number, color = 6) {
    const chunk = (type: string, data: Uint8Array) => {
        const result = new Uint8Array(data.length + 12)
        new DataView(result.buffer).setUint32(0, data.length)
        result.set(new TextEncoder().encode(type), 4); result.set(data, 8)
        return result
    }
    const header = new Uint8Array(13), view = new DataView(header.buffer)
    view.setUint32(0, width); view.setUint32(4, rows.length); header[8] = 8; header[9] = color
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10,
        ...chunk('IHDR', header), ...chunk('IDAT', zlibSync(new Uint8Array(rows.flat()))), ...chunk('IEND', new Uint8Array())])
}

test('premultiplied decoding reconstructs every PNG filter, preserves alpha and fills transparent edge colors', () => {
    // The five rows decode to the same opaque / half-transparent / transparent pixels.
    const pixels = [200, 160, 120, 255, 100, 80, 60, 128, 0, 0, 0, 0]
    const rows = [
        [0, ...pixels],
        [1, 200, 160, 120, 255, 156, 176, 196, 129, 156, 176, 196, 128],
        [2, ...pixels.map(() => 0)],
        [3, 100, 80, 60, 128, 206, 216, 226, 193, 206, 216, 226, 192],
        [4, ...pixels.map(() => 0)],
    ]
    const { rgba, width, height } = decodePremultipliedPng(png(rows, 3))
    assert.equal(width, 3); assert.equal(height, 5)
    const expected = [200, 160, 120, 255, 199, 159, 120, 128, 199, 159, 120, 0]
    for (let row = 0; row < height; row++) assert.deepEqual([...rgba.subarray(row * 12, (row + 1) * 12)], expected)
})

/** FixPixelsOnAlphaEdgeForBlending, as the original has it. */
function sanded(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const result = rgba.slice()
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4
        if (rgba[at + 3]) continue
        const sum = [0, 0, 0]
        let count = 0
        for (const dy of [-1, 1]) for (const dx of [-1, 0, 1]) {
            const nx = x + dx, ny = y + dy, near = (ny * width + nx) * 4
            if (nx < 0 || nx >= width || ny < 0 || ny >= height || !rgba[near + 3]) continue
            for (let c = 0; c < 3; c++) sum[c] += rgba[near + c]
            count++
        }
        for (let c = 0; c < 3; c++) result[at + c] = count ? Math.floor(sum[c] / count) : 0
    }
    return result
}

test('sanding gives a transparent texel the visible colors above and below it, as the original does on loading an image', () => {
    const A = [10, 20, 30, 255], B = [200, 100, 50, 128], T = [99, 99, 99, 0]
    const small = new Uint8Array([...A, ...T, ...T, ...T, ...T, ...B, ...T, ...T, ...T])
    kernel().sandAlphaEdges(small, 3, 3)
    // The texel beside A takes nothing from its own row; the corner with nothing visible above it turns black.
    assert.deepEqual([...small], [...A, 200, 100, 50, 0, 200, 100, 50, 0, 10, 20, 30, 0, 10, 20, 30, 0, ...B, 0, 0, 0, 0, 200, 100, 50, 0, 200, 100, 50, 0])

    // Larger than one of the bands the WebAssembly kernel works in.
    const width = 1024, height = 1100, large = new Uint8Array(width * height * 4)
    let seed = 1
    for (let i = 0; i < large.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0
        large[i] = i % 4 === 3 && (seed >>> 16) % 3 ? 0 : seed >>> 24
    }
    const expected = sanded(large, width, height)
    kernel().sandAlphaEdges(large, width, height)
    assert.ok(large.every((value, index) => value === expected[index]))
})

test('explicitly premultiplied textures reject unsupported PNG encodings and incomplete scanlines', () => {
    assert.throws(() => decodePremultipliedPng(png([[0, 1, 2, 3, 4]], 1, 3)), /RGBA8/)
    assert.throws(() => decodePremultipliedPng(png([[0, 1, 2, 3]], 1)), /scanlines/)
    assert.throws(() => decodePremultipliedPng(png([[5, 1, 2, 3, 4]], 1)), /row filter/)
})
