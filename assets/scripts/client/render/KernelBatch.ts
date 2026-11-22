import {
    _decorator, director, EffectAsset, Material, MeshBuffer, type Node, Rect, resources, Sprite, SpriteFrame,
    type UI as Batcher2D, UIVertexFormat,
} from 'cc'
import { JSB } from 'cc/env'
import { kernel } from '@/shared/kernel/index'

const { ccclass } = _decorator

let material: Material | null = null
let supersampled: Material | null = null
let loading: Promise<Material> | undefined
/**
 * Normal and additive images in one draw: the shader premultiplies, and a negative vertex alpha marks additive. With
 * it comes the same taking four samples to a screen pixel (pictureMaterial).
 */
export function loadKernelMaterial(): Promise<Material> {
    return loading ??= new Promise<Material>((resolve, reject) => {
        resources.load('effects/reanim-mixed', EffectAsset, (error, effect) => {
            if (error) { reject(error); return }
            const result = new Material()
            result.initialize({ effectAsset: effect })
            supersampled = new Material()
            supersampled.initialize({ effectAsset: effect, defines: { SUPERSAMPLED: true } })
            resolve(material = result)
        })
    }).catch(error => { loading = undefined; throw error })
}

/**
 * For a picture drawn much smaller than its art, a seed packet's: four samples to a screen pixel. The art is several
 * times the size it is shown at even on the lawn, and the original scales a plant's cached frame into its packet by
 * about a half more, from whole units: each pixel there is the average of four of the frame's. An image drawn
 * straight into the packet with one sample to a pixel skips most of its texels, and its outlines come and go.
 */
export function pictureMaterial(): Material {
    if (!supersampled) throw new Error('kernel material is not loaded; await loadKernelMaterial() first')
    return supersampled
}

/** That, for every plain image under `root`: a picture with no animation behind it (a grave seed's packet). */
export function supersampleSprites(root: Node): void {
    for (const sprite of root.getComponentsInChildren(Sprite)) if (!sprite.customMaterial) sprite.customMaterial = pictureMaterial()
}

/** Supplies a batch's quads through the drawing kernel. */
export interface KernelQuadSource {
    /**
     * Writes at most capacity quads at local positions and returns how many; the rest of the capacity may hold
     * anything, as only those written are drawn. With a `placement` (what Kernel.placeQuads takes), they are placed
     * in the world by it instead.
     */
    writeQuads(positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number, placement?: Float64Array): number
}

/**
 * What the kernel multiplies a quad's alpha (0 to 255) by for one drawn whole. A batch's opacity (its node's, its
 * parents' and their renderers') is the engine's own, worked out as it walks the nodes to draw them: climbing the
 * parents here cost a call into the native engine for each (Node.parent).
 */
const WHOLE = 1 / 255

/** Floats to a vertex: its place, its place in the image and its colour (vfmtPosUvColor). */
const STRIDE = 9

/**
 * The web's quads as the kernel writes them, at local positions: an array of the kernel's own, which it writes without
 * copying. One copy then puts those it drew in the frame's vertices.
 */
let scratch: Float32Array = new Float32Array(0)
/** Its start at each length asked for, so a batch takes one without making a view every frame. */
const scratchViews = new Map<number, Float32Array>()
function scratchOf(floats: number): Float32Array {
    if (scratch.length < floats) {
        kernel().release(scratch)
        scratch = kernel().f32(Math.max(floats, scratch.length * 2, 4096))
        scratchViews.clear()
    }
    let view = scratchViews.get(floats)
    if (!view) scratchViews.set(floats, view = scratch.subarray(0, floats))
    return view
}

/**
 * The parts of the world matrix of the batch being drawn that place a flat quad, the x, y and z of each axis and of
 * the origin, in an array of the kernel's own.
 */
let placement: Float64Array | undefined

/** The quads a vertex buffer holds: 65532 vertices, which is as far as 16-bit indices reach. */
const BUFFER_QUADS = 16383

/**
 * The web's vertices of one frame. The engine gives a renderer a place of its own in one of its vertex buffers for as
 * long as it lives, and joins what is drawn in turn into one draw only from the same buffer: with more animations than
 * one buffer holds, neighbours on the lawn are in different ones and each is drawn on its own. Here the batches of a
 * frame take their places as they are drawn, each as many quads as it draws, so a run of them from one texture is one
 * draw however many there are, and the next frame starts again from the first place. The engine uploads and resets
 * these with its own buffers (registerBufferAccessor).
 */
class FrameQuads {
    private readonly buffers: MeshBuffer[] = []
    private current = 0

    /** The buffer the next `quads` go in, at its vertexOffset; indices of quads in turn are already in it. */
    take(quads: number): MeshBuffer {
        if (quads > BUFFER_QUADS) throw new Error(`a batch of ${quads} quads is more than a vertex buffer holds`)
        let buffer = this.buffers[this.current]
        if (buffer && buffer.vertexOffset + quads * 4 > BUFFER_QUADS * 4) buffer = this.buffers[++this.current]
        return buffer ?? this.add()
    }

    private add(): MeshBuffer {
        const buffer = this.buffers[this.current] = new MeshBuffer()
        buffer.initialize(director.root!.device, UIVertexFormat.vfmtPosUvColor, BUFFER_QUADS * 4 * STRIDE, BUFFER_QUADS * 6)
        // Every frame fills it from the start with quads in turn: their indices never change.
        const indices = buffer.iData
        for (let quad = 0, at = 0; quad < BUFFER_QUADS; quad++) {
            const base = quad * 4
            indices[at++] = base; indices[at++] = base + 1; indices[at++] = base + 2
            indices[at++] = base + 1; indices[at++] = base + 3; indices[at++] = base + 2
        }
        return buffer
    }

    uploadBuffers(): void {
        for (let index = 0; index <= this.current && index < this.buffers.length; index++) this.buffers[index].uploadBuffers()
    }

    reset(): void {
        for (let index = 0; index <= this.current && index < this.buffers.length; index++) {
            const buffer = this.buffers[index]
            buffer.vertexOffset = buffer.byteOffset = buffer.indexOffset = 0
            buffer.reset()
        }
        this.current = 0
    }

    destroy(): void {
        for (const buffer of this.buffers) buffer.destroy()
        this.buffers.length = this.current = 0
        if (frameQuads === this) frameQuads = undefined
    }
}

let frameQuads: FrameQuads | undefined
/** A key no vertex format of the engine's has: it keeps its buffers by the bytes of a vertex. */
const FRAME_QUADS_KEY = -1
function frameQuadsOf(batcher: Batcher2D): FrameQuads {
    if (!frameQuads) batcher.registerBufferAccessor(FRAME_QUADS_KEY, (frameQuads = new FrameQuads()) as never)
    return frameQuads
}

/**
 * Web: writes the batch's quads at the start of the scratch array, at local positions or placed in the world by `world`;
 * returns how many it drew. `opacity`: the node's as it is drawn.
 */
function writeScratch(batch: KernelBatch, opacity: number, world?: Float64Array): number {
    if (!batch.spriteFrame || !batch.count || !batch.source) return 0
    const quads = scratchOf(batch.count * 4 * STRIDE)
    const written = batch.source.writeQuads(quads, quads, opacity * WHOLE, STRIDE, batch.count, world)
    if (written < 0) throw new Error('drawing kernel rejected its input')
    return written
}

/**
 * Web: draws the batch. Its quads are written now, placed in the world by the node's matrix as it is drawn, and take
 * the next places in the frame's vertices (FrameQuads).
 */
function drawNow(batch: KernelBatch, batcher: Batcher2D): void {
    const m = batch.node.worldMatrix, world = placement ??= kernel().f64(9)
    world[0] = m.m00; world[1] = m.m01; world[2] = m.m02
    world[3] = m.m04; world[4] = m.m05; world[5] = m.m06
    world[6] = m.m12; world[7] = m.m13; world[8] = m.m14
    // The engine has just given the node its opacity, on its way to drawing it (Batcher2D.walk).
    const written = batch.written = writeScratch(batch, batch.node._uiProps.opacity, world)
    if (written) {
        const floats = written * 4 * STRIDE
        const buffer = frameQuadsOf(batcher).take(written), first = buffer.indexOffset
        buffer.vData.set(scratchOf(floats), buffer.vertexOffset * STRIDE)
        buffer.vertexOffset += written * 4
        buffer.byteOffset += floats * 4
        buffer.indexOffset = first + written * 6
        buffer.setDirty()
        batcher.commitMiddleware(batch, buffer, first, written * 6, batch.spriteFrame!.texture, batch.getRenderMaterial(0)!, true)
    }
}

/**
 * Native: writes the batch's quads whole, at local positions, in render2dBuffer. The engine places those written in
 * vertices of the frame's as it draws them, in the order drawn, and gives them the node's opacity there
 * (RenderDrawInfo.setTransient), as the web does here (FrameQuads, drawNow): a batch keeps no place in a vertex buffer
 * on either.
 */
function writeNative(batch: KernelBatch): void {
    batch.dirty = false
    batch.written = 0
    const rd = batch.renderData, info = rd?.renderDrawInfo, local = info?.render2dBuffer
    if (!rd || !info || !local || !batch.spriteFrame || !batch.count || !batch.source) {
        info?.setVBCount(0)
        return
    }
    if (rd.passDirty || rd.textureDirty || rd.nodeDirty || rd.hashDirty) rd.updateRenderData(batch, batch.spriteFrame)
    const written = batch.source.writeQuads(local, local, WHOLE, rd.floatStride, batch.count)
    if (written < 0) throw new Error('drawing kernel rejected its input')
    // Four vertices to each quad written: what the engine draws of the batch this frame.
    info.setVBCount(written * 4)
    batch.written = written
}

const assembler = {
    createData(batch: KernelBatch) { return batch.requestRenderData() },
    updateUVs() {},
    updateColor() {},
    // Native only: the web writes a batch as it draws it (drawNow).
    updateRenderData(batch: KernelBatch) { if (JSB) writeNative(batch) },
}

/** Quads written by the drawing kernel from one texture, without a node per image; used by animations and particles. */
@ccclass('KernelBatch')
export class KernelBatch extends Sprite {
    source: KernelQuadSource | null = null
    /** Quad capacity; written is the number actually drawn. */
    count = 0
    written = 0
    /** Native: the source has changed since the quads were written. */
    dirty = false
    private supersampled = false

    setSource(source: KernelQuadSource, frame: SpriteFrame, capacity: number): void {
        this.source = source
        this.dirty = true
        if (this.spriteFrame?.texture !== frame.texture) this.spriteFrame = frame
        // Same capacity and live render data: only the vertices change.
        if (capacity !== this.count || JSB && !this.renderData) {
            this.count = capacity
            this._flushAssembler()
        }
        // Native writes its quads again. The web writes them whenever it draws: only one not drawing has to be looked at.
        if (JSB || !this._renderFlag) this.markForUpdateRenderData()
    }

    clear(): void {
        if (!this.count) return
        this.count = this.written = 0
        this.source = null
        this.markForUpdateRenderData()
    }

    /** Four samples to a screen pixel, for a picture drawn much smaller than its art (pictureMaterial). */
    setSupersampled(supersampled: boolean): void {
        if (this.supersampled === supersampled) return
        this.supersampled = supersampled
        if (this._assembler) this.syncMaterial()
    }

    private syncMaterial(): void {
        if (!material) throw new Error('kernel material is not loaded; await loadKernelMaterial() first')
        const wanted = this.supersampled ? pictureMaterial() : material
        if (this.customMaterial !== wanted) this.customMaterial = wanted
    }

    /**
     * World bounds of the drawn images, for offscreen compositing; none when it draws nothing, as a batch does whose
     * tracks are all hidden (it keeps its quads).
     */
    getWorldBounds(): Rect | null {
        // Compositing reads bounds before the engine's render update.
        let local: Float32Array | undefined, stride = STRIDE
        if (JSB) {
            if (this.dirty) writeNative(this)
            local = this.renderData?.renderDrawInfo?.render2dBuffer
            stride = this.renderData?.floatStride ?? STRIDE
        } else {
            // Where its quads are does not come of its opacity.
            this.written = writeScratch(this, 1)
            local = scratch
        }
        if (!this.written || !local) return null
        const m = this.node.worldMatrix
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let vertex = 0; vertex < this.written * 4; vertex++) {
            const x = local[vertex * stride], y = local[vertex * stride + 1]
            const worldX = m.m00 * x + m.m04 * y + m.m12, worldY = m.m01 * x + m.m05 * y + m.m13
            minX = Math.min(minX, worldX); maxX = Math.max(maxX, worldX)
            minY = Math.min(minY, worldY); maxY = Math.max(maxY, worldY)
        }
        return new Rect(minX, minY, maxX - minX, maxY - minY)
    }

    protected _flushAssembler(): void {
        this._useVertexOpacity = true
        this._assembler = assembler
        this.syncMaterial()
        // The web keeps no vertices of a batch's own (drawNow).
        if (!JSB) return
        // Render data is released while hidden; made again whenever geometry is needed.
        if (!this.renderData) {
            const created = assembler.createData(this)
            created.material = this.getRenderMaterial(0)!
            // The engine's typings are made when it is built, and may be older than this.
            ;(created.renderDrawInfo as unknown as { setTransient(transient: boolean): void }).setTransient(true)
        }
        // Room for the capacity at local positions; no place in a vertex buffer (writeNative).
        const rd = this.renderData!, vertices = this.count * 4
        if (vertices && rd.dataLength !== vertices) rd.dataLength = vertices
    }

    protected _render(batcher: Parameters<Sprite['fillBuffers']>[0]): void {
        if (JSB) super._render(batcher)
        else drawNow(this, batcher as Batcher2D)
    }

    protected _canRender(): boolean {
        return this.count > 0 && super._canRender()
    }
}
