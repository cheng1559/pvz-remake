import { _decorator, Component, Node } from 'cc'

const { ccclass, property } = _decorator

@ccclass('Adventure11Slots')
export class Adventure11Slots extends Component {
    @property(Node) board!: Node
    @property(Node) background!: Node
    @property(Node) sodClip!: Node
    @property(Node) sodRow!: Node
    @property(Node) tutorialLawnFlash!: Node
    @property(Node) entityLayer!: Node
    @property(Node) sodRoll!: Node
    @property(Node) hud!: Node
    @property(Node) bank!: Node
    @property(Node) seedPacket!: Node
    @property(Node) sunText!: Node
    @property(Node) coinLayer!: Node
    @property(Node) progressMeter!: Node
    @property(Node) progressBack!: Node
    @property(Node) progressFillClip!: Node
    @property(Node) progressFill!: Node
    @property(Node) progressTrack!: Node
    @property(Node) progressHead!: Node
    @property(Node) levelText!: Node
    @property(Node) advice!: Node
    @property(Node) cursorPreview!: Node
    @property(Node) cursorPlant!: Node
    @property(Node) gridPreview!: Node
    @property(Node) gridPlant!: Node
    @property(Node) awardLayer!: Node
    @property(Node) houseName!: Node
    @property(Node) houseLabel!: Node
    @property(Node) overlayLayer!: Node
    @property(Node) fade!: Node
}
