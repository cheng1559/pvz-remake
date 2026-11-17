import { _decorator, Color, Component, type Node, Sprite } from 'cc'
import { mirrorInPacket } from './packetPicture'

const { ccclass } = _decorator

/**
 * A grave or crater seed's packet picture (the thing of a cell it puts down): a holder the packet's size, which a packet
 * of the other side turns round within it.
 */
@ccclass('PacketGridItem')
export class PacketGridItem extends Component {
    private color = Color.WHITE
    private picture?: Node
    private packetScale = 1

    /**
     * `packetScale`: the packet's, whose size the holder is. `draw`: the grave or crater in the holder; `drawn` when its pictures
     * have come, a little after it, to take the packet's shade.
     */
    initialize(packetScale: number, draw: (drawn: () => void) => Node): this {
        this.packetScale = packetScale
        this.picture = draw(() => this.setColor())
        return this
    }

    /** A packet of the other side turns its picture round about the packet's middle (mirrorInPacket). */
    setMirrored(mirrored: boolean): void {
        mirrorInPacket(this.node, mirrored, this.packetScale)
    }

    /** The packet's shade over the picture (a chosen card's gray), kept for a picture drawn after it is set. */
    setColor(color = this.color): void {
        this.color = color
        for (const sprite of this.picture?.getComponentsInChildren(Sprite) ?? []) sprite.color = color
    }
}
