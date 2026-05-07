import {
    _decorator,
    BlockInputEvents,
    Component,
    EventKeyboard,
    EventTouch,
    game,
    input,
    Input,
    Layers,
    Node,
    sys,
    UITransform,
    view,
} from 'cc'
import { UIButton } from '@/ui/Button'

const { ccclass, property } = _decorator

@ccclass('ModalDialog')
export class ModalDialog extends Component {
    @property(Node)
    dragHandle: Node | null = null

    @property
    modal = true

    @property
    draggable = true

    @property
    dragClampMargin = 8

    private _modalBlocker: Node | null = null
    private _modalHoverBlockActive = false
    private _dragging = false
    private _dragMouseX = 0
    private _dragMouseY = 0
    private _dragEventTarget: Node | null = null

    onEnable() {
        this._createModalBlocker()
        this._bindDragEvents()
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
    }

    onDisable() {
        this._unbindDragEvents()
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this._dragging = false
        this._setCursor('')

        if (this._modalBlocker) {
            this._modalBlocker.active = false
            this._endModalHoverBlock()
        }
    }

    onDestroy() {
        this._destroyModalBlocker()
    }

    close() {
        if (this.node.isValid) {
            this.node.destroy()
        }
    }

    protected onDialogKeyDown(_event: EventKeyboard) {
    }

    protected createModalBlocker() {
        this._createModalBlocker()
    }

    protected setDragHandle(handle: Node | null) {
        if (this.dragHandle === handle && this._dragEventTarget === (handle ?? this.node)) return

        this._unbindDragEvents()
        this.dragHandle = handle

        if (this.node.activeInHierarchy && this.enabled) {
            this._bindDragEvents()
        }
    }

    private _bindDragEvents() {
        if (!this.draggable) return
        if (this._dragEventTarget) return
        const target = this.dragHandle ?? this.node
        if (!target.isValid) return

        target.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
        target.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        target.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        target.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
        this._dragEventTarget = target
    }

    private _unbindDragEvents() {
        const target = this._dragEventTarget
        if (!target) return

        if (target.isValid) {
            target.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
            target.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
            target.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
            target.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
        }
        this._dragEventTarget = null
    }

    private _createModalBlocker() {
        if (!this.modal) return
        if (this._modalBlocker) {
            this._modalBlocker.active = true
            this._beginModalHoverBlock()
            return
        }

        const blocker = new Node('ModalBlocker')
        blocker.layer = Layers.Enum.UI_2D

        const transform = blocker.addComponent(UITransform)
        const visibleSize = view.getVisibleSize()
        transform.setContentSize(visibleSize.width, visibleSize.height)
        transform.setAnchorPoint(0.5, 0.5)
        blocker.addComponent(BlockInputEvents)

        const parent = this.node.parent
        if (parent) {
            parent.addChild(blocker)
            blocker.setWorldPosition(visibleSize.width / 2, visibleSize.height / 2, 0)
            blocker.setSiblingIndex(this.node.getSiblingIndex())
        }

        this._modalBlocker = blocker
        this._beginModalHoverBlock()
    }

    private _beginModalHoverBlock() {
        if (this._modalHoverBlockActive) return
        this._modalHoverBlockActive = true
        UIButton.beginHoverBlock()
    }

    private _endModalHoverBlock() {
        if (!this._modalHoverBlockActive) return
        this._modalHoverBlockActive = false
        UIButton.endHoverBlock()
    }

    private _destroyModalBlocker() {
        if (this._modalBlocker?.isValid) {
            this._modalBlocker.destroy()
        }
        this._modalBlocker = null
        this._endModalHoverBlock()
    }

    private _onTouchStart(event: EventTouch) {
        event.propagationStopped = true
        this._dragging = true

        const uiPos = event.getUILocation()
        const transform = this.node.getComponent(UITransform)!
        const pos = this.node.worldPosition
        this._dragMouseX = uiPos.x - (pos.x - transform.contentSize.width * transform.anchorPoint.x)
        this._dragMouseY = pos.y + transform.contentSize.height * (1 - transform.anchorPoint.y) - uiPos.y
        this._setCursor('move')
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._dragging) return
        event.propagationStopped = true

        const uiPos = event.getUILocation()
        const transform = this.node.getComponent(UITransform)!
        const { width, height } = transform.contentSize
        const { width: screenWidth, height: screenHeight } = view.getVisibleSize()
        const margin = this.dragClampMargin

        let nextX = uiPos.x - this._dragMouseX
        let nextY = uiPos.y + this._dragMouseY

        nextX = Math.max(-margin, Math.min(screenWidth - width + margin, nextX))
        nextY = Math.max(height - margin, Math.min(screenHeight + margin, nextY))

        this._dragMouseX = Math.max(margin, Math.min(width - margin - 1, uiPos.x - nextX))
        this._dragMouseY = Math.max(margin, Math.min(height - margin - 1, nextY - uiPos.y))
        this.node.setWorldPosition(
            nextX + width * transform.anchorPoint.x,
            nextY - height * (1 - transform.anchorPoint.y),
            0,
        )
    }

    private _onTouchEnd(event: EventTouch) {
        event.propagationStopped = true
        this._dragging = false
        this._setCursor('')
    }

    private _onKeyDown(event: EventKeyboard) {
        this.onDialogKeyDown(event)
    }

    private _setCursor(style: string) {
        if (!sys.isBrowser) return
        const canvas = game.canvas
        if (canvas) canvas.style.cursor = style
    }
}
