import { _decorator, Color, Component, type Node, Sprite, UITransform } from 'cc'

const { ccclass } = _decorator

/** A grave seed's packet picture: a holder the packet's size, which a packet of the other side turns round within it. */
@ccclass('PacketGrave')
export class PacketGrave extends Component {
    private color = Color.WHITE
    private picture?: Node

    /** `draw`: the grave in the holder; `drawn` when its pictures have come, a little after it, to take the packet's shade. */
    initialize(draw: (drawn: () => void) => Node): this {
        this.picture = draw(() => this.setColor())
        return this
    }

    setMirrored(mirrored: boolean): void {
        this.node.setScale(mirrored ? -1 : 1, 1, 1)
        this.node.setPosition(mirrored ? this.node.getComponent(UITransform)!.width : 0, this.node.position.y)
    }

    /** The packet's shade over the picture (a chosen card's gray), kept for a grave drawn after it is set. */
    setColor(color = this.color): void {
        this.color = color
        for (const sprite of this.picture?.getComponentsInChildren(Sprite) ?? []) sprite.color = color
    }
}
