import { KERNEL_WASM } from './binary'

/**
 * The drawing kernel in native/engine/common/kernel: one implementation for every platform. Native builds call it
 * through JSB (iOS forbids JIT, and its JavaScript engine therefore has no WebAssembly); the web and
 * tests run the same source compiled to WebAssembly by tools/kernel/build.ts.
 */
export interface Kernel {
    /** Arrays the kernel reads and writes without copying; release them when discarded. */
    f64(length: number): Float64Array
    i32(length: number): Int32Array
    release(array: Float64Array | Int32Array): void
    /** Writes x, y, scaleX, scaleY, skewX, skewY and alpha; returns the keyframe index, or -1 before the first. */
    sample(keys: Float64Array, first: number, count: number, time: number, pose: Float64Array): number
    /** Blends pose towards itself from a captured pose, in place. */
    blend(from: Float64Array, ratio: number, pose: Float64Array): void
    writeReanim(keys: Float64Array, tracks: Int32Array, state: Float64Array, positions: Float32Array, vertices: Float32Array): number
    particlesCreate(definition: Float64Array, seed: number): number
    particlesStep(handle: number, ticks: number, motion: Float64Array): number
    particlesInfo(handle: number, output: Float64Array): number
    /** Writes an emitter's particles straight to vertices; options follow ParticleOption. Returns the quads written. */
    particlesWrite(handle: number, emitter: number, geometry: Float64Array, options: Float64Array, positions: Float32Array, vertices: Float32Array): number
    /** It launches no more particles; each emitter is dead with its last one. */
    particlesStop(handle: number): void
    particlesDestroy(handle: number): void
    /** Decodes a premultiplied RGBA8 PNG into the start of output, which holds (width * 4 + 1) * height bytes; see PngResult. */
    decodePng(png: Uint8Array, output: Uint8Array): number
    /**
     * Sands straight-alpha RGBA8 in place, as the original does to every image it loads: each fully transparent texel
     * takes the average color of the visible texels above and below it; see pvz_png.h. A native image's decoded data
     * (ImageAsset.data), which JavaScript holds unread, is sanded where it is.
     */
    sandAlphaEdges(rgba: Uint8Array | object, width: number, height: number): void
}

/** Layouts shared with native/engine/common/kernel/pvz_kernel.h. */
export const KEY = 10, TRACK = 4, IMAGE = 12, BLEND = 8
export const ParticleOption = {
    RED: 0, GREEN: 1, BLUE: 2, ALPHA: 3, SCALE: 4, ADDITIVE: 5, EXTRA: 6, OPACITY: 7, STRIDE: 8, CAPACITY: 9,
    CEL_WIDTH: 10, CEL_HEIGHT: 11, SIZE: 12,
} as const
export const PngResult = { OK: 0, UNSUPPORTED: -1, SCANLINES: -2, FILTER: -3 } as const
/** Bytes of an image the WebAssembly kernel sands at a time. */
const SAND_BAND = 4 << 20
export const Header = {
    TIME: 0, RED: 1, GREEN: 2, BLUE: 3, ALPHA: 4, EXTRA: 5, EXTRA_RED: 6, EXTRA_GREEN: 7, EXTRA_BLUE: 8, EXTRA_ALPHA: 9,
    OPACITY: 10, STRIDE: 11, TRACKS: 12, CAPACITY: 13, TINTED: 14, IMAGES: 15, BLENDING: 16, RATIO: 17,
    MATRIX_A: 18, MATRIX_B: 19, MATRIX_C: 20, MATRIX_D: 21, MATRIX_X: 22, MATRIX_Y: 23, FIRST: 24, END: 25,
    /** Keyframes a second where a track has one for every frame: where the one a time has reached is looked for first. */
    RATE: 26, SIZE: 27,
} as const

type Native = {
    __pvzParticlesCreate?: Kernel['particlesCreate']
    __pvzParticlesStep?: Kernel['particlesStep']
    __pvzParticlesInfo?: Kernel['particlesInfo']
    __pvzParticlesWrite?: Kernel['particlesWrite']
    __pvzParticlesStop?: Kernel['particlesStop']
    __pvzParticlesDestroy?: Kernel['particlesDestroy']
    __pvzKernelSample?: Kernel['sample']
    __pvzKernelBlend?: Kernel['blend']
    __pvzKernelWriteReanim?: Kernel['writeReanim']
    __pvzKernelDecodePng?: Kernel['decodePng']
    __pvzKernelSandAlphaEdges?: Kernel['sandAlphaEdges']
}

function nativeKernel(): Kernel | null {
    const native = globalThis as Native
    if (!native.__pvzParticlesCreate || !native.__pvzParticlesStep || !native.__pvzParticlesInfo || !native.__pvzParticlesWrite || !native.__pvzParticlesStop || !native.__pvzParticlesDestroy || !native.__pvzKernelSample || !native.__pvzKernelBlend || !native.__pvzKernelWriteReanim || !native.__pvzKernelDecodePng || !native.__pvzKernelSandAlphaEdges) return null
    return {
        f64: length => new Float64Array(length),
        i32: length => new Int32Array(length),
        release() {},
        particlesCreate: native.__pvzParticlesCreate,
        particlesStep: native.__pvzParticlesStep,
        particlesInfo: native.__pvzParticlesInfo,
        particlesWrite: native.__pvzParticlesWrite,
        particlesStop: native.__pvzParticlesStop,
        particlesDestroy: native.__pvzParticlesDestroy,
        sample: native.__pvzKernelSample,
        blend: native.__pvzKernelBlend,
        writeReanim: native.__pvzKernelWriteReanim,
        decodePng: native.__pvzKernelDecodePng,
        sandAlphaEdges: native.__pvzKernelSandAlphaEdges,
    }
}

interface WasmExports {
    pvz_particles_create(definition: number, length: number, seed: number): number
    pvz_particles_step(handle: number, ticks: number, motion: number, length: number): number
    pvz_particles_info(handle: number, output: number, length: number): number
    pvz_particles_write(handle: number, emitter: number, geometry: number, geometryLength: number, options: number, optionsLength: number,
        positions: number, positionCount: number, vertices: number, vertexCount: number): number
    pvz_particles_stop(handle: number): void
    pvz_particles_destroy(handle: number): void
    pvz_png_decode_premultiplied(png: number, length: number, output: number, outputLength: number): number
    pvz_sand_alpha_edges(rgba: number, width: number, height: number): void
    _initialize?(): void
    memory: WebAssembly.Memory
    malloc(size: number): number
    free(pointer: number): void
    pvz_sample(keys: number, count: number, time: number, pose: number): number
    pvz_blend(from: number, ratio: number, pose: number): void
    pvz_write_reanim(keys: number, keyCount: number, tracks: number, trackCount: number, state: number, stateCount: number,
        positions: number, positionCount: number, vertices: number, vertexCount: number): number
}

function wasmKernel(instance: WebAssembly.Instance): Kernel {
    const wasm = instance.exports as unknown as WasmExports
    wasm._initialize?.()
    const buffer = wasm.memory.buffer
    // Arrays outside kernel memory are copied in for the call, and outputs copied back.
    type View = Float64Array | Int32Array | Float32Array | Uint8Array
    const temporary: number[] = []
    // Outputs are copied in too, so the slots the kernel leaves alone survive the copy back.
    const pointer = (array: View): number => {
        if (array.buffer === buffer) return array.byteOffset
        const address = wasm.malloc(array.byteLength)
        if (!address) throw new Error('drawing kernel is out of memory')
        temporary.push(address)
        const copy = new (array.constructor as new (buffer: ArrayBuffer, offset: number, length: number) => View)(buffer, address, array.length)
        copy.set(array)
        return address
    }
    /** Copies an output back to an array outside kernel memory. */
    const read = (array: View, address: number) => {
        if (array.buffer !== buffer) array.set(new (array.constructor as new (buffer: ArrayBuffer, offset: number, length: number) => View)(buffer, address, array.length))
    }
    /** Frees the copies made for the call; none when its arrays were the kernel's own, as every frame's are. */
    const done = () => {
        if (!temporary.length) return
        for (const address of temporary) wasm.free(address)
        temporary.length = 0
    }
    const allocate = <T extends Float64Array | Int32Array>(type: new (buffer: ArrayBuffer, offset: number, length: number) => T,
        fallback: new (length: number) => T, bytes: number, length: number): T => {
        const address = length ? wasm.malloc(length * bytes) : 0
        if (length && !address) throw new Error('drawing kernel is out of memory')
        const array = address ? new type(buffer, address, length) : new fallback(length)
        // Match native typed-array allocation, including blocks reused after a player is destroyed.
        array.fill(0)
        return array
    }
    return {
        f64: length => allocate(Float64Array, Float64Array, 8, length),
        i32: length => allocate(Int32Array, Int32Array, 4, length),
        release(array) { if (array.buffer === buffer && array.length) wasm.free(array.byteOffset) },
        particlesCreate(definition, seed) {
            try { return wasm.pvz_particles_create(pointer(definition), definition.length, seed) }
            finally { done() }
        },
        particlesStep(handle, ticks, motion) {
            try { return wasm.pvz_particles_step(handle, ticks, pointer(motion), motion.length) }
            finally { done() }
        },
        particlesInfo(handle, output) {
            const address = pointer(output)
            try { return wasm.pvz_particles_info(handle, address, output.length) }
            finally { read(output, address); done() }
        },
        particlesWrite(handle, emitter, geometry, options, positions, vertices) {
            const positionAddress = pointer(positions), vertexAddress = vertices === positions ? positionAddress : pointer(vertices)
            const written = wasm.pvz_particles_write(handle, emitter, pointer(geometry), geometry.length, pointer(options), options.length,
                positionAddress, positions.length, vertexAddress, vertices.length)
            read(positions, positionAddress)
            if (vertices !== positions) read(vertices, vertexAddress)
            done()
            return written
        },
        particlesStop(handle) { wasm.pvz_particles_stop(handle) },
        particlesDestroy(handle) { wasm.pvz_particles_destroy(handle) },
        decodePng(png, output) {
            const address = pointer(output)
            const result = wasm.pvz_png_decode_premultiplied(pointer(png), png.length, address, output.length)
            read(output, address)
            done()
            return result
        },
        sandAlphaEdges(rgba, width, height) {
            const pixels = rgba as Uint8Array, stride = width * 4
            // In bands, so an image need not fit the kernel's memory. Each takes along the rows beside it, which are
            // read but not kept: sanded there, they would lack their own neighbors.
            const rows = Math.max(1, Math.floor(SAND_BAND / stride))
            for (let y = 0; y < height; y += rows) {
                const first = Math.max(0, y - 1), end = Math.min(height, y + rows), last = Math.min(height, end + 1)
                const address = wasm.malloc((last - first) * stride)
                if (!address) throw new Error('drawing kernel is out of memory')
                const band = new Uint8Array(buffer, address, (last - first) * stride)
                band.set(pixels.subarray(first * stride, last * stride))
                wasm.pvz_sand_alpha_edges(address, width, last - first)
                pixels.set(band.subarray((y - first) * stride, (end - first) * stride), y * stride)
                wasm.free(address)
            }
        },
        sample(keys, first, count, time, pose) {
            if (first < 0 || count < 0 || (first + count) * KEY > keys.length || pose.length < 7) return -1
            const keyAddress = pointer(keys), poseAddress = pointer(pose)
            const index = wasm.pvz_sample(keyAddress + first * KEY * 8, count, time, poseAddress)
            read(pose, poseAddress)
            done()
            return index
        },
        blend(from, ratio, pose) {
            const fromAddress = pointer(from), poseAddress = pointer(pose)
            wasm.pvz_blend(fromAddress, ratio, poseAddress)
            read(pose, poseAddress)
            done()
        },
        writeReanim(keys, tracks, state, positions, vertices) {
            const positionAddress = pointer(positions), vertexAddress = vertices === positions ? positionAddress : pointer(vertices)
            const written = wasm.pvz_write_reanim(pointer(keys), keys.length, pointer(tracks), tracks.length, pointer(state), state.length,
                positionAddress, positions.length, vertexAddress, vertices.length)
            read(positions, positionAddress)
            if (vertices !== positions) read(vertices, vertexAddress)
            done()
            return written
        },
    }
}

function wasmBytes(): Uint8Array<ArrayBuffer> {
    const text = atob(KERNEL_WASM)
    const bytes = new Uint8Array(new ArrayBuffer(text.length))
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
    return bytes
}

/** Imports a standalone module may still declare; none are used by the kernel. */
function imports(module: WebAssembly.Module): WebAssembly.Imports {
    const result: Record<string, Record<string, WebAssembly.ImportValue>> = {}
    for (const entry of WebAssembly.Module.imports(module)) {
        (result[entry.module] ??= {})[entry.name] = () => { throw new Error(`drawing kernel called ${entry.module}.${entry.name}`) }
    }
    return result
}

let current: Kernel | null = nativeKernel()
let loading: Promise<Kernel> | null = null
if (!current && typeof WebAssembly !== 'undefined') {
    // Small modules compile synchronously where allowed (Node, most browsers); otherwise loadKernel() compiles asynchronously.
    try {
        const module = new WebAssembly.Module(wasmBytes())
        current = wasmKernel(new WebAssembly.Instance(module, imports(module)))
    } catch {
        current = null
    }
}

export function loadKernel(): Promise<Kernel> {
    if (current) return Promise.resolve(current)
    return loading ??= WebAssembly.compile(wasmBytes()).then(async module => {
        current = wasmKernel(await WebAssembly.instantiate(module, imports(module)))
        return current
    })
}

export function kernel(): Kernel {
    if (!current) throw new Error('drawing kernel is not loaded; await loadKernel() first')
    return current
}
