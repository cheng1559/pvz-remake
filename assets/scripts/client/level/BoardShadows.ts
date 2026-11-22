import { Sprite, type Node, type SpriteFrame } from 'cc'
import { frameGeometry } from '@/client/reanim/ReanimPlayer'
import { KernelBatch, type KernelQuadSource } from '@/client/render/KernelBatch'
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

/** How many more shadows a row's batch has room for each time it is short: its vertices are made anew when it grows. */
const GROWTH = 64

/** A row's shadows of one picture: a node of the layer at the row's shadows' place in the draw order, and its batch. */
interface Row { node: Node, batch: KernelBatch, order: number, shown: Shadow[], source: KernelQuadSource, frame: SpriteFrame }

class Shadow implements BoardShadow {
    x = 0
    y = 0
    scale = 1
    row = 0
    visible = false
    constructor(readonly frame: SpriteFrame, private readonly from: Set<Shadow>) {}
    remove(): void { this.from.delete(this) }
}

/**
 * The shadows of the board's zombies, drawn a row at a time: one batch draws all of a row's, where each was a node and
 * a sprite of its own on the layer, a thousand of them to place, order and draw a frame under a thousand zombies.
 * They lie on the ground under every row's plants and zombies as they did (renderOrder's `ground`, each row's after the
 * last's). Shadows of one picture cover what is under them alike in any order, so a row's are drawn as they come.
 */
export class BoardShadows {
    private readonly shadows = new Set<Shadow>()
    private readonly rows: Row[] = []
    /** The rows' batches by their picture, then by the row. */
    private readonly byFrame = new Map<SpriteFrame, Map<number, Row>>()

    constructor(private readonly layer: Node) {}

    /** A shadow of `frame`, hidden until it is given a place. */
    add(frame: SpriteFrame): BoardShadow {
        const shadow = new Shadow(frame, this.shadows)
        this.shadows.add(shadow)
        return shadow
    }

    /** Every row's batch draws its shadows as they now are: once a frame, after the views have placed them. */
    sync(): void {
        for (const row of this.rows) row.shown.length = 0
        for (const shadow of this.shadows) if (shadow.visible) this.rowOf(shadow).shown.push(shadow)
        for (const row of this.rows) {
            if (!row.node.isValid) continue
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

    private rowOf(shadow: Shadow): Row {
        // Pictures of one texture could share a batch; the board has one shadow picture, so each has its own.
        let rows = this.byFrame.get(shadow.frame)
        if (!rows) this.byFrame.set(shadow.frame, rows = new Map())
        let row = rows.get(shadow.row)
        if (!row) {
            const node = uiNode({ name: `Shadows-${shadow.row}`, parent: this.layer, anchor: { x: 0, y: 1 } }).node
            const batch = node.addComponent(KernelBatch), shown: Shadow[] = [], image = frameGeometry(shadow.frame).data
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
            row = { node, batch, order: renderOrder('ground', shadow.row, SHADOW_RENDER_OFFSET), shown, source, frame: shadow.frame }
            rows.set(shadow.row, row)
            this.rows.push(row)
        }
        return row
    }
}
