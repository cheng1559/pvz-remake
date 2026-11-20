import { type Graphics, Mask, type Node } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { SEED_PACKET_SIZE } from '@/shared/content/gameplay'

/**
 * How a seed packet's picture is drawn, shared by plants (PlantPreview) and zombies (ZombiePreview). Each kind sets
 * its tilt for the way it faces in its packet (`facing`); a picture facing the other way is turned around whole by
 * its preview, its tilt and clip with it.
 */

/** SeedPacket's width, in its own units. */
export const SEED_PACKET_WIDTH = SEED_PACKET_SIZE.width

/** A packet of the other side turns its picture round about the packet's middle, whatever the picture is. */
export function mirrorInPacket(node: Node, mirrored: boolean, packetScale: number): void {
    node.setScale(mirrored ? -1 : 1, node.scale.y, 1)
    node.setPosition(mirrored ? SEED_PACKET_WIDTH * packetScale : 0, node.position.y)
}

/** /tilted: how much larger, the turn in degrees and its pivot in the packet. */
export interface PacketTilt { readonly factor: number, readonly angle: number, readonly pivot: readonly [number, number] }

/** A plant faces right: half as large again, leaning right about the packet's lower centre. */
export const PLANT_TILT: PacketTilt = { factor: 1.5, angle: -12, pivot: [23, -25] }

/** The tilted clip: the inner image's side border behind the picture and bottom border. */
const CLIP = { side: 3.5, bottom: 52, width: 220.5, height: 220 }

/** Places the picture's root at `placement`; `tilted` (/tilted, in a packet of `packetScale`), tilted by `tilt`. */
export function placePacketPicture(root: Node, placement: { x: number, y: number, scale: number }, packetScale: number | undefined,
    tilted: boolean | undefined, tilt: PacketTilt): void {
    const { x, y, scale } = placement
    const enlarged = !!tilted && packetScale !== undefined
    const factor = enlarged ? tilt.factor : 1
    root.angle = enlarged ? tilt.angle : 0
    root.setScale(scale * factor, scale * factor, 1)
    if (!enlarged) { root.setPosition(x, y); return }
    // Turn about the pivot, so the picture leans the way it faces.
    const pivotX = tilt.pivot[0] * packetScale!
    const pivotY = tilt.pivot[1] * packetScale!
    const radians = root.angle * Math.PI / 180
    const cos = Math.cos(radians), sin = Math.sin(radians)
    root.setPosition(pivotX + ((x - pivotX) * cos - (y - pivotY) * sin) * factor,
        pivotY + ((x - pivotX) * sin + (y - pivotY) * cos) * factor)
}

/**
 * Whether a picture is tilted (/tilted: a packet's; the held and grid previews never are), and its tilted clip on its
 * node, which its preview syncs before placing it (`sync`). The clip, made when first needed, cuts at the inner
 * image's bottom border and its side behind the picture (the left for one facing right), free above and in front.
 */
export class PacketPictureStyle {
    /** Whether the picture is tilted, once synced. */
    tilted?: boolean
    private mask?: Mask
    /** What the clip is drawn for: a node not shown yet may not have its mask's graphics, to try again. */
    private drawn?: boolean

    constructor(private readonly node: Node, private readonly facing: 'left' | 'right') {}

    /** Takes up /tilted for a picture in a packet of `packetScale` (or none); whether it is to be placed again. */
    sync(packetScale: number | undefined): boolean {
        const tilted = packetScale !== undefined && GameDebugSettings.tiltedSeedPackets
        if (tilted === this.drawn) return false
        this.tilted = tilted
        this.drawn = this.drawClip(packetScale, tilted) ? tilted : undefined
        return true
    }

    /** Sets the clip; false while the mask has no graphics yet. */
    private drawClip(packetScale: number | undefined, tilted: boolean): boolean {
        if (packetScale === undefined || (!this.mask && !tilted)) return true
        const mask = this.mask ??= this.node.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_STENCIL
        mask.enabled = tilted
        if (!mask.enabled) return true
        const graphics = mask.subComp as Graphics | null
        if (!graphics) return false
        graphics.clear()
        const left = this.facing === 'right' ? CLIP.side : SEED_PACKET_WIDTH - CLIP.side - CLIP.width
        graphics.rect(left * packetScale, -CLIP.bottom * packetScale, CLIP.width * packetScale, CLIP.height * packetScale)
        graphics.fill()
        return true
    }
}
