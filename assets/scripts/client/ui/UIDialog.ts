import { _decorator, Component, EventTouch, KeyCode, Node, UITransform, Vec3, type EventKeyboard } from 'cc'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { UIInput } from './UIInput'

const { ccclass } = _decorator

@ccclass('PvZUIDialog')
export class UIDialog extends Component {
    private static readonly stack: UIDialog[] = []
    content!: Node
    draggable = true
    onConfirm: () => void = () => this.close(true)
    onCancel: () => void = () => this.close(false)
    onClose?: (confirmed: boolean) => void
    onKeyDown?: (event: EventKeyboard) => boolean
    private resolve!: (confirmed: boolean) => void
    readonly result = new Promise<boolean>(resolve => { this.resolve = resolve })
    private closed = false
    private dragOffset: Vec3 | null = null

    static handleKey(event: EventKeyboard): boolean {
        if (UIInput.handleKey(event)) return true
        const dialog = this.stack[this.stack.length - 1]
        if (!dialog) return false
        event.propagationStopped = true
        if (dialog.onKeyDown?.(event)) return true
        if (event.keyCode === KeyCode.ESCAPE) {
            void SoundLoader.play(SoundEffect.ButtonClick)
            dialog.onCancel()
        } else if (event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE) {
            void SoundLoader.play(SoundEffect.ButtonClick)
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
        this.content.on(Node.EventType.TOUCH_START, this.startDrag, this)
        this.content.on(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.content.on(Node.EventType.TOUCH_END, this.endDrag, this)
        this.content.on(Node.EventType.TOUCH_CANCEL, this.endDrag, this)
    }

    onDisable(): void {
        const index = UIDialog.stack.indexOf(this)
        if (index >= 0) UIDialog.stack.splice(index, 1)
        UIHoverManager.endModalBlock(this.node)
        this.content.off(Node.EventType.TOUCH_START, this.startDrag, this)
        this.content.off(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.content.off(Node.EventType.TOUCH_END, this.endDrag, this)
        this.content.off(Node.EventType.TOUCH_CANCEL, this.endDrag, this)
        this.dragOffset = null
    }

    onDestroy(): void { this.resolve(false) }

    private localPoint(event: EventTouch): Vec3 {
        const point = event.getUILocation()
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x, point.y))
    }

    private startDrag(event: EventTouch): void {
        if (!this.draggable || event.target !== this.content) return
        this.dragOffset = this.localPoint(event).subtract(this.content.position)
        event.propagationStopped = true
    }

    private moveDrag(event: EventTouch): void {
        if (!this.dragOffset) return
        const point = this.localPoint(event).subtract(this.dragOffset)
        const size = this.content.getComponent(UITransform)!.contentSize
        this.content.setPosition(
            Math.max(-408, Math.min(408 - size.width, point.x)),
            Math.max(size.height - 308, Math.min(308, point.y)),
        )
        event.propagationStopped = true
    }

    private endDrag(): void { this.dragOffset = null }
}
