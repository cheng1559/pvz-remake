import { _decorator, Component, Node, EventTouch, UITransform, Vec3, screen, view } from 'cc'
const { ccclass, property } = _decorator

@ccclass('OptionsWindow')
export class OptionsWindow extends Component {
    @property(Node)
    dragHandle: Node | null = null

    private _dragging = false
    private _offset = new Vec3()

    onEnable() {
        const target = this.dragHandle ?? this.node
        target.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
        target.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        target.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        target.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
    }

    onDisable() {
        const target = this.dragHandle ?? this.node
        target.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
        target.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        target.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        target.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
    }

    private _onTouchStart(event: EventTouch) {
        this._dragging = true
        // 记录触摸点与节点位置的偏移
        const uiPos = event.getUILocation()
        const nodePos = this.node.worldPosition
        this._offset.set(nodePos.x - uiPos.x, nodePos.y - uiPos.y, 0)
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._dragging) return
        const uiPos = event.getUILocation()
        const newX = uiPos.x + this._offset.x
        const newY = uiPos.y + this._offset.y

        // 可选：限制在屏幕范围内
        const visibleSize = view.getVisibleSize()
        const clampedX = Math.max(0, Math.min(visibleSize.width, newX))
        const clampedY = Math.max(0, Math.min(visibleSize.height, newY))

        this.node.setWorldPosition(clampedX, clampedY, 0)
    }

    private _onTouchEnd(event: EventTouch) {
        this._dragging = false
    }
}
