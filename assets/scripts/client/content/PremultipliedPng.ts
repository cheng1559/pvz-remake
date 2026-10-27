import * as fflate from 'fflate'

// Cocos exposes the CJS package through default; headless Node uses its named ESM exports.
const compression = (fflate as { default?: typeof fflate }).default ?? fflate

/** Decode explicitly marked RGBA8 PNGs before any platform decoder can round their low-alpha colors. */
export function decodePremultipliedPng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a
        || view.getUint32(12) !== 0x49484452 || bytes[24] !== 8 || bytes[25] !== 6
        || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) {
        throw new Error('Premultiplied textures require a non-interlaced RGBA8 PNG')
    }
    const width = view.getUint32(16), height = view.getUint32(20), stride = width * 4
    if (!width || !height) throw new Error('Invalid premultiplied PNG size')
    const chunks: Uint8Array[] = []
    let length = 0
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const size = view.getUint32(offset), type = view.getUint32(offset + 4)
        if (offset + size + 12 > bytes.length) throw new Error('Truncated premultiplied PNG')
        if (type === 0x49444154) {
            chunks.push(bytes.subarray(offset + 8, offset + 8 + size))
            length += size
        }
        offset += size + 12
        if (type === 0x49454e44) break
    }
    const compressed = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length }
    const filtered = compression.unzlibSync(compressed)
    if (filtered.length !== (stride + 1) * height) throw new Error('Invalid premultiplied PNG scanlines')
    const rgba = new Uint8Array(stride * height)
    for (let y = 0; y < height; y++) {
        const filter = filtered[y * (stride + 1)]
        if (filter > 4) throw new Error('Invalid premultiplied PNG row filter')
        for (let x = 0; x < stride; x++) {
            const index = y * stride + x
            const left = x >= 4 ? rgba[index - 4] : 0
            const up = y > 0 ? rgba[index - stride] : 0
            const corner = y > 0 && x >= 4 ? rgba[index - stride - 4] : 0
            let prediction = 0
            if (filter === 1) prediction = left
            else if (filter === 2) prediction = up
            else if (filter === 3) prediction = Math.floor((left + up) / 2)
            else if (filter === 4) {
                const p = left + up - corner
                const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner)
                prediction = a <= b && a <= c ? left : b <= c ? up : corner
            }
            rgba[index] = filtered[y * (stride + 1) + 1 + x] + prediction
        }
    }
    for (let index = 0; index < rgba.length; index += 4) {
        const alpha = rgba[index + 3]
        if (alpha > 0 && alpha < 255) for (let channel = 0; channel < 3; channel++) {
            rgba[index + channel] = Math.min(255, Math.round(rgba[index + channel] * 255 / alpha))
        }
    }
    // Extend edge colors into neighboring transparent texels so LINEAR sampling does not mix in black.
    // Alpha stays unchanged; only originally visible pixels can donate a color.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4
        if (rgba[index + 3]) continue
        let best = index
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue
            const neighbor = ((y + dy) * width + x + dx) * 4
            if (rgba[neighbor + 3] > rgba[best + 3]) best = neighbor
        }
        for (let channel = 0; channel < 3; channel++) rgba[index + channel] = rgba[best + channel]
    }
    return { width, height, rgba }
}
