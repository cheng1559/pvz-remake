import { _decorator, Director, director, EffectAsset, Material, type Node, Rect, resources, Sprite, SpriteFrame } from 'cc'
import { JSB } from 'cc/env'

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
    /** Writes at most capacity quads, clearing the rest; returns the quads written. */
    writeQuads(positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number): number
}

// Hundreds of batches share a few ancestors. While the engine updates render data, opacity cannot change,
// so each ancestor's inherited opacity is computed once per frame instead of once per batch.
const inherited = new Map<Node, number>()
let caching = false
director.on(Director.EVENT_BEFORE_DRAW, () => { caching = true })
director.on(Director.EVENT_AFTER_DRAW, () => { caching = false; inherited.clear() })

/** Opacity of a node and its ancestors, including the alpha of their renderers. */
function inheritedOpacity(node: Node | null): number {
    if (!node) return 1
    let opacity = caching ? inherited.get(node) : undefined
    if (opacity === undefined) {
        const props = (node as any)._uiProps
        opacity = props.localOpacity * (props.uiComp?.color ? props.uiComp.color.a / 255 : 1) * inheritedOpacity(node.parent)
        if (caching) inherited.set(node, opacity)
    }
    return opacity
}

/** Opacity inherited from the parents, which vertex-colored renderers apply themselves. */
function opacityOf(sprite: Sprite): number {
    return (sprite.node as any)._uiProps.localOpacity * inheritedOpacity(sprite.node.parent)
}

/**
 * Native renders local positions from render2dBuffer; the web keeps them in `local` and transforms them
 * in fillBuffers. UVs and colors go straight to the vertex buffer.
 */
function writeQuads(batch: KernelBatch): void {
    batch.dirty = false
    batch.written = 0
    const rd = batch.renderData
    if (!rd?.chunk || !batch.spriteFrame || !batch.count || !batch.source) return
    if (rd.passDirty || rd.textureDirty || rd.nodeDirty || rd.hashDirty) rd.updateRenderData(batch, batch.spriteFrame)
    const stride = rd.floatStride
    let positions = JSB ? rd.renderDrawInfo?.render2dBuffer : undefined
    if (!positions) {
        if (batch.local.length < rd.dataLength * stride) batch.local = new Float32Array(rd.dataLength * stride)
        positions = batch.local
    }
    rd.vertDirty = true
    const written = batch.source.writeQuads(positions, rd.chunk.vb, opacityOf(batch) / 255, stride, batch.count)
    if (written < 0) throw new Error('drawing kernel rejected its input')
    batch.written = written
}

const assembler = {
    createData(batch: KernelBatch) { return batch.requestRenderData() },
    updateUVs() {},
    updateColor() {},
    updateRenderData(batch: KernelBatch) { writeQuads(batch) },
    // Web only: transforms the local positions and writes indices.
    fillBuffers(batch: KernelBatch) {
        const rd = batch.renderData!, chunk = rd.chunk, m = batch.node.worldMatrix
        const vb = chunk.vb, stride = rd.floatStride, local = batch.local
        for (let i = 0; i < rd.dataLength; i++) {
            const offset = i * stride, x = local[offset], y = local[offset + 1]
            vb[offset] = m.m00 * x + m.m04 * y + m.m12
            vb[offset + 1] = m.m01 * x + m.m05 * y + m.m13
            vb[offset + 2] = m.m02 * x + m.m06 * y + m.m14
        }
        const mesh = chunk.meshBuffer, indices = mesh.iData
        let offset = mesh.indexOffset
        for (let i = 0; i < rd.dataLength; i += 4) {
            const base = chunk.vertexOffset + i
            indices[offset++] = base; indices[offset++] = base + 1; indices[offset++] = base + 2
            indices[offset++] = base + 1; indices[offset++] = base + 3; indices[offset++] = base + 2
        }
        mesh.indexOffset = offset
        rd.vertDirty = false
    },
}

/** Quads written by the drawing kernel from one texture, without a node per image; used by animations and particles. */
@ccclass('KernelBatch')
export class KernelBatch extends Sprite {
    source: KernelQuadSource | null = null
    /** Quad capacity; written is the number actually drawn. */
    count = 0
    written = 0
    dirty = false
    local = new Float32Array(0)
    private supersampled = false

    setSource(source: KernelQuadSource, frame: SpriteFrame, capacity: number): void {
        this.source = source
        this.dirty = true
        if (this.spriteFrame?.texture !== frame.texture) this.spriteFrame = frame
        // Same capacity and live render data: only the vertices change.
        if (capacity !== this.count || !this.renderData?.chunk) {
            this.count = capacity
            this._flushAssembler()
        }
        this.markForUpdateRenderData()
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
        if (this.renderData) this.syncMaterial()
    }

    private syncMaterial(): void {
        if (!material) throw new Error('kernel material is not loaded; await loadKernelMaterial() first')
        const wanted = this.supersampled ? pictureMaterial() : material
        if (this.customMaterial !== wanted) this.customMaterial = wanted
    }

    /** World bounds of the drawn images, for offscreen compositing. */
    getWorldBounds(): Rect {
        // Compositing reads bounds before the engine's render update.
        if (this.dirty) writeQuads(this)
        const rd = this.renderData!, stride = rd.floatStride, m = this.node.worldMatrix
        const positions = (JSB ? rd.renderDrawInfo?.render2dBuffer : undefined) ?? this.local
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (let vertex = 0; vertex < this.written * 4; vertex++) {
            const x = positions[vertex * stride], y = positions[vertex * stride + 1]
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
        if (!this.renderData) assembler.createData(this).material = this.getRenderMaterial(0)!
        // Render data is released while hidden; rebuild it whenever geometry is needed.
        const rd = this.renderData!, vertices = this.count * 4
        if (vertices && (rd.dataLength !== vertices || !rd.chunk)) {
            rd.dataLength = vertices
            rd.resize(vertices, this.count * 6)
            const indices = new Uint16Array(this.count * 6)
            for (let q = 0; q < this.count; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6)
            rd.chunk.setIndexBuffer(indices)
        }
    }

    protected _canRender(): boolean {
        return this.count > 0 && super._canRender()
    }
}
