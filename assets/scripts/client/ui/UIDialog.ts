import { _decorator, Component, EventTouch, KeyCode, Node, UITransform, Vec3, type EventKeyboard } from 'cc'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { UIInput } from './UIInput'

const { ccclass } = _decorator

@ccclass('PvZUIDialog')
export class UIDialog extends Component {
    private static readonly stack: UIDialog[] = []
    content!: Node
    draggable = true
    clickSound: SoundEffect | null = null
    onConfirm: () => void = () => this.close(true)
    onCancel: () => void = () => this.close(false)
    onClose?: (confirmed: boolean) => void
    onKeyDown?: (event: EventKeyboard) => boolean
    private resolve!: (confirmed: boolean) => void
    readonly result = new Promise<boolean>(resolve => { this.resolve = resolve })
    private closed = false
    private dragOffset: Vec3 | null = null
    get isDragging(): boolean { return this.dragOffset !== null }
    private readonly dragHover = {
        cursor: 'grabbing' as const,
        clearHover: () => { this.dragOffset = null },
        refreshHover: (pointer: UIHoverPointer, modal: Node | null) =>
            pointer.canHover && this.dragOffset !== null && modal === this.node,
    }

    static handleKey(event: EventKeyboard): boolean {
        if (UIInput.handleKey(event)) return true
        const dialog = this.stack[this.stack.length - 1]
        if (!dialog) return false
        event.propagationStopped = true
        if (dialog.onKeyDown?.(event)) return true
        if (event.keyCode === KeyCode.ESCAPE) {
            if (dialog.clickSound !== null) void SoundLoader.play(dialog.clickSound)
            dialog.onCancel()
        } else if (event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE) {
            if (dialog.clickSound !== null) void SoundLoader.play(dialog.clickSound)
            dialog.onConfirm()
        }
        return true
    }

    close(confirmed = false): void {
        if (this.closed) return
        this.closed = true
        this.node.active = false
        this.resolve(confirmed)
        this.onClose?.(confirmed)
        this.node.destroy()
    }

    onEnable(): void {
        UIDialog.stack.push(this)
        UIHoverManager.beginModalBlock(this.node)
        UIHoverManager.registerClient(this.dragHover)
        this.content.on(Node.EventType.TOUCH_START, this.startDrag, this)
        this.content.on(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.content.on(Node.EventType.TOUCH_END, this.endDrag, this)
        this.content.on(Node.EventType.TOUCH_CANCEL, this.endDrag, this)
    }

    onDisable(): void {
        const index = UIDialog.stack.indexOf(this)
        if (index >= 0) UIDialog.stack.splice(index, 1)
        this.dragOffset = null
        UIHoverManager.unregisterClient(this.dragHover)
        UIHoverManager.endModalBlock(this.node)
        this.content.off(Node.EventType.TOUCH_START, this.startDrag, this)
        this.content.off(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.content.off(Node.EventType.TOUCH_END, this.endDrag, this)
        this.content.off(Node.EventType.TOUCH_CANCEL, this.endDrag, this)
    }

    onDestroy(): void { this.resolve(false) }

    private localPoint(event: EventTouch): Vec3 {
        const point = event.getUILocation()
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x, point.y))
    }

    private startDrag(event: EventTouch): void {
        if (!this.draggable || event.target !== this.content) return
        this.dragOffset = this.localPoint(event).subtract(this.content.position)
        UIHoverManager.refreshHoverStates()
        event.propagationStopped = true
    }

    private moveDrag(event: EventTouch): void {
        if (!this.dragOffset) return
        const point = this.localPoint(event).subtract(this.dragOffset)
        const size = this.content.getComponent(UITransform)!.contentSize
        const bounds = this.node.getComponent(UITransform)!.contentSize
        const halfWidth = bounds.width / 2 + 8, halfHeight = bounds.height / 2 + 8
        const clamp = (value: number, a: number, b: number) =>
            Math.max(Math.min(a, b), Math.min(Math.max(a, b), value))
        this.content.setPosition(
            clamp(point.x, -halfWidth, halfWidth - size.width),
            clamp(point.y, size.height - halfHeight, halfHeight),
        )
        event.propagationStopped = true
    }

    private endDrag(): void {
        this.dragOffset = null
        UIHoverManager.refreshHoverStates()
    }
}
