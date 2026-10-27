import assert from 'node:assert/strict'
import test from 'node:test'
import { zlibSync } from 'fflate'
import { decodePremultipliedPng } from '@/client/content/PremultipliedPng'

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

test('explicitly premultiplied textures reject unsupported PNG encodings and incomplete scanlines', () => {
    assert.throws(() => decodePremultipliedPng(png([[0, 1, 2, 3, 4]], 1, 3)), /RGBA8/)
    assert.throws(() => decodePremultipliedPng(png([[0, 1, 2, 3]], 1)), /scanlines/)
    assert.throws(() => decodePremultipliedPng(png([[5, 1, 2, 3, 4]], 1)), /row filter/)
})
