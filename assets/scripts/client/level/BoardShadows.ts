import { Sprite, type Node, type SpriteFrame } from 'cc'
import { frameGeometry } from '@/client/reanim/ReanimPlayer'
import { KernelBatch, type KernelQuadSource } from '@/client/render/KernelBatch'
import { SpriteBlend } from '@/client/view/SpriteBlend'
import { uiNode } from '@/client/view/uiNode'
import { renderOrder, SHADOW_RENDER_OFFSET } from '@/shared/content/renderOrder'
import { kernel } from '@/shared/kernel/index'

/**
 * An entity's shadow on the board's ground: where its picture's top left corner is in the board's layer, at what
 * size from that corner, in which row, and whether it shows. Its entity's view sets these as it places itself.
 */
export interface BoardShadow {
    x: number
    y: number
    scale: number
    row: number
    visible: boolean
    /** It goes, with its entity. */
    remove(): void
}

/** A shadow drawn on a sprite of its own where its entity is in the draw order (BoardShadows.attach). */
export interface AttachedShadow {
    /** It goes, with its entity. */
    remove(): void
}

/** How many more shadows a row's batch has room for each time it is short: its vertices are made anew when it grows. */
const GROWTH = 64

/**
 * A row's shadows of one picture: a node of the layer at the row's shadows' place in the draw order, and its batch;
 * `opacity`, the node's as last given (blend).
 */
interface Row { node: Node, batch: KernelBatch, order: number, shown: Shadow[], source: KernelQuadSource, frame: SpriteFrame, opacity: number }

class Shadow implements BoardShadow {
    x = 0
    y = 0
    scale = 1
    row = 0
    visible = false
    constructor(public frame: SpriteFrame, private readonly from: Set<Shadow>) {}
    remove(): void { this.from.delete(this) }
}

/** A shadow on its own sprite, blending as the board's picture blends into another (SpriteBlend). */
class Attached implements AttachedShadow {
    readonly blend: SpriteBlend
    constructor(readonly sprite: Sprite, private readonly from: Set<Attached>) { this.blend = new SpriteBlend(sprite) }
    remove(): void { this.from.delete(this) }
}

/**
 * The board's shadows. Its zombies' are drawn a row at a time (add): one batch draws all of a row's, where each was a
 * node and a sprite of its own on the layer, a thousand of them to place, order and draw a frame under a thousand
 * zombies. They lie on the ground under every row's plants and zombies as they did (renderOrder's `ground`, each row's
 * after the last's). Shadows of one picture cover what is under them alike in any order, so a row's are drawn as they
 * come. Plants', projectiles' and mowers' are sprites of their own, drawn where their entities are in the draw order
 * as Plant::DrawShadow and LawnMower::Draw draw them (attach). Both kinds change to another time's picture (swap) and
 * blend into it (blend) alike.
 */
export class BoardShadows {
    private readonly shadows = new Set<Shadow>()
    private readonly attached = new Set<Attached>()
    private readonly rows: Row[] = []
    /** The rows' batches by their picture, then by the row. */
    private readonly byFrame = new Map<SpriteFrame, Map<number, Row>>()
    /** The board's shadow picture blending into another's (blend). */
    private blending?: { from: SpriteFrame, to: SpriteFrame, weight: number }

    constructor(private readonly layer: Node) {}

    /** A shadow of `frame`, hidden until it is given a place. */
    add(frame: SpriteFrame): BoardShadow {
        const shadow = new Shadow(frame, this.shadows)
        this.shadows.add(shadow)
        return shadow
    }

    /** A shadow its entity's view draws on `sprite`, which changes and blends with the board's picture. */
    attach(sprite: Sprite): AttachedShadow {
        const shadow = new Attached(sprite, this.attached)
        this.attached.add(shadow)
        return shadow
    }

    /** The board's shadow picture changed (`/time`): the shadows of `from` are drawn with `to` from the next frame. */
    swap(from: SpriteFrame, to: SpriteFrame): void {
        for (const shadow of this.shadows) if (shadow.frame === from) shadow.frame = to
        for (const { sprite } of this.attached) if (sprite.isValid && sprite.spriteFrame === from) sprite.spriteFrame = to
    }

    /**
     * The board's shadow picture blends into another's (`/time`'s change of time): the shadows of `from` are drawn
     * with `to` too, `to`'s at `weight` (0 to 1) and `from`'s at the rest (share); without `to`, as they are. Given
     * each frame of the change, it reaches the shadows attached meanwhile.
     */
    blend(from: SpriteFrame, to: SpriteFrame | undefined, weight: number): void {
        const blending = this.blending = to && to !== from ? { from, to, weight } : undefined
        for (const { sprite, blend } of this.attached) {
            if (blending && sprite.isValid && sprite.spriteFrame === blending.from) blend.show(blending.from, blending.to, weight)
            else blend.end()
        }
    }

    /** How much of a shadow `frame` draws as the board's picture blends (blend): all of it but for the two blending. */
    private share(frame: SpriteFrame): number {
        const blending = this.blending
        return frame === blending?.from ? 1 - blending.weight : frame === blending?.to ? blending.weight : 1
    }

    /** Every row's batch draws its shadows as they now are: once a frame, after the views have placed them. */
    sync(): void {
        const blending = this.blending
        for (const row of this.rows) row.shown.length = 0
        for (const shadow of this.shadows) if (shadow.visible) {
            this.rowOf(shadow.frame, shadow.row).shown.push(shadow)
            if (shadow.frame === blending?.from) this.rowOf(blending.to, shadow.row).shown.push(shadow)
        }
        for (const row of this.rows) {
            if (!row.node.isValid) continue
            const opacity = this.share(row.frame)
            if (row.opacity !== opacity) uiNode({ node: row.node, opacity: Math.round(255 * opacity) })
            row.opacity = opacity
            const count = row.shown.length
            if (count) row.batch.setSource(row.source, row.frame, Math.ceil(count / GROWTH) * GROWTH)
            else row.batch.clear()
        }
    }

    /** The rows' nodes with their places in the draw order, for the layer's ordering. */
    entries(): { node: Node, order: number }[] {
        const entries: { node: Node, order: number }[] = []
        for (const row of this.rows) if (row.node.isValid) entries.push({ node: row.node, order: row.order })
        return entries
    }

    /** The batch of the row `index`'s shadows of `frame`. */
    private rowOf(frame: SpriteFrame, index: number): Row {
        // Pictures of one texture could share a batch; the board has one shadow picture, so each has its own.
        let rows = this.byFrame.get(frame)
        if (!rows) this.byFrame.set(frame, rows = new Map())
        let row = rows.get(index)
        if (!row) {
            const node = uiNode({ name: `Shadows-${index}`, parent: this.layer, anchor: { x: 0, y: 1 } }).node
            const batch = node.addComponent(KernelBatch), shown: Shadow[] = [], image = frameGeometry(frame).data
            batch.sizeMode = Sprite.SizeMode.CUSTOM
            const source: KernelQuadSource = {
                writeQuads(positions, vertices, opacity, stride, capacity, placement) {
                    const quads = Math.min(shown.length, capacity), alpha = 255 * opacity
                    for (let quad = 0; quad < quads; quad++) {
                        const { x, y, scale } = shown[quad]
                        for (let corner = 0; corner < 4; corner++) {
                            const offset = (quad * 4 + corner) * stride
                            positions[offset] = x + scale * image[corner & 1]
                            positions[offset + 1] = y + scale * image[corner & 2 ? 3 : 2]
                            positions[offset + 2] = 0
                            vertices[offset + 3] = image[4 + corner * 2]
                            vertices[offset + 4] = image[5 + corner * 2]
                            vertices[offset + 5] = vertices[offset + 6] = vertices[offset + 7] = 1
                            vertices[offset + 8] = alpha
                        }
                    }
                    if (placement && quads) kernel().placeQuads(positions, quads, stride, placement)
                    return quads
                },
            }
            row = { node, batch, order: renderOrder('ground', index, SHADOW_RENDER_OFFSET), shown, source, frame, opacity: 1 }
            rows.set(index, row)
            this.rows.push(row)
        }
        return row
    }
}
