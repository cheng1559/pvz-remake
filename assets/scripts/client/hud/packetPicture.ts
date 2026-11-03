import { type Graphics, Mask, type Node } from 'cc'
import { GameDebugSettings, type SeedPacketStyle } from '@/platform/debug/GameDebugSettings'

/**
 * How a seed packet's picture is drawn, shared by plants (PlantPreview) and zombies (ZombiePreview). Each kind sets
 * its tilt for the way it faces in its packet (`facing`); a picture facing the other way is turned around whole by
 * its preview, its tilt and clip with it.
 */

/** /seedstyle tilted: how much larger, the turn in degrees and its pivot in the packet. */
export interface PacketTilt { readonly factor: number, readonly angle: number, readonly pivot: readonly [number, number] }

/** A plant faces right: half as large again, leaning right about the packet's lower centre. */
export const PLANT_TILT: PacketTilt = { factor: 1.5, angle: -12, pivot: [23, -25] }

/** The packet's width, and its tilted clip: the inner image's side border behind the picture and bottom border. */
const PACKET_WIDTH = 50
const CLIP = { side: 3.5, bottom: 52, width: 220.5, height: 220 }

/** The /seedstyle a picture follows: a packet's own; the held and grid previews follow it without the tilt. */
function packetPictureStyle(packetScale: number | undefined): SeedPacketStyle {
    const style = GameDebugSettings.seedPacketStyle
    return packetScale !== undefined || style === 'standard' ? style : 'rendered'
}

/** Places the picture's root at `placement`, tilted by `tilt` (in a packet of `packetScale`) for /seedstyle tilted. */
export function placePacketPicture(root: Node, placement: { x: number, y: number, scale: number }, packetScale: number | undefined,
    style: SeedPacketStyle | undefined, tilt: PacketTilt): void {
    const { x, y, scale } = placement
    const enlarged = style === 'tilted' && packetScale !== undefined
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
 * A picture's /seedstyle and its tilted clip on its node, which its preview syncs before placing it (`sync`). The
 * clip, made when first needed, cuts at the inner image's bottom border and its side behind the picture (the left for
 * one facing right), free above and in front.
 */
export class PacketPictureStyle {
    /** The style the picture is drawn in, once synced. */
    style?: SeedPacketStyle
    private mask?: Mask
    /** The style the clip is drawn for: a node not shown yet may not have its mask's graphics, to try again. */
    private drawn?: SeedPacketStyle

    constructor(private readonly node: Node, private readonly facing: 'left' | 'right') {}

    /** Takes up /seedstyle for a picture in a packet of `packetScale` (or none); whether it is to be placed again. */
    sync(packetScale: number | undefined): boolean {
        const style = packetPictureStyle(packetScale)
        if (style === this.drawn) return false
        this.style = style
        this.drawn = this.drawClip(packetScale, style) ? style : undefined
        return true
    }

    /** Sets the clip for `style`; false while the mask has no graphics yet. */
    private drawClip(packetScale: number | undefined, style: SeedPacketStyle): boolean {
        if (packetScale === undefined || (!this.mask && style !== 'tilted')) return true
        const mask = this.mask ??= this.node.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_STENCIL
        mask.enabled = style === 'tilted'
        if (!mask.enabled) return true
        const graphics = mask.subComp as Graphics | null
        if (!graphics) return false
        graphics.clear()
        const left = this.facing === 'right' ? CLIP.side : PACKET_WIDTH - CLIP.side - CLIP.width
        graphics.rect(left * packetScale, -CLIP.bottom * packetScale, CLIP.width * packetScale, CLIP.height * packetScale)
        graphics.fill()
        return true
    }
}
