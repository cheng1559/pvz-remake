import { kernel, PngResult, type Kernel } from '@/shared/kernel/index'

const errors: Record<number, string> = {
    [PngResult.UNSUPPORTED]: 'Premultiplied textures require a non-interlaced RGBA8 PNG',
    [PngResult.SCANLINES]: 'Invalid premultiplied PNG scanlines',
    [PngResult.FILTER]: 'Invalid premultiplied PNG row filter',
}

/** Decode explicitly marked RGBA8 PNGs before any platform decoder can round their low-alpha colors; see pvz_png.h. */
export function decodePremultipliedPng(bytes: Uint8Array, api: Kernel = kernel()): { width: number; height: number; rgba: Uint8Array } {
    if (bytes.length < 33) throw new Error(errors[PngResult.UNSUPPORTED])
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16), height = view.getUint32(20)
    const output = new Uint8Array((width * 4 + 1) * height)
    const result = api.decodePng(bytes, output)
    if (result !== PngResult.OK) throw new Error(errors[result] ?? errors[PngResult.UNSUPPORTED])
    return { width, height, rgba: output.subarray(0, width * height * 4) }
}
