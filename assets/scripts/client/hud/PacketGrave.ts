import { _decorator, Component, UITransform } from 'cc'

const { ccclass } = _decorator

/** A grave seed's packet picture: a holder the packet's size, which a packet of the other side turns round within it. */
@ccclass('PacketGrave')
export class PacketGrave extends Component {
    setMirrored(mirrored: boolean): void {
        this.node.setScale(mirrored ? -1 : 1, 1, 1)
        this.node.setPosition(mirrored ? this.node.getComponent(UITransform)!.width : 0, this.node.position.y)
    }
}
