import { _decorator, Component, EventTouch, Node, UITransform, Vec3 } from 'cc'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'

const { ccclass } = _decorator

@ccclass('PvZUISlider')
export class UISlider extends Component {
    knob!: Node
    width = 135
    knobWidth = 22
    onChange: (value: number) => void = () => {}
    private current = 0
    private dragging = false
    private dragOffset = 0

    get value(): number { return this.current }
    set value(value: number) {
        this.current = Math.max(0, Math.min(1, value))
        this.knob.setPosition(this.current * (this.width - this.knobWidth), -5)
    }

    onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.startDrag, this)
        this.node.on(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.node.on(Node.EventType.TOUCH_END, this.endDrag, this)
        this.node.on(Node.EventType.TOUCH_CANCEL, this.cancelDrag, this)
    }

    onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.startDrag, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this.moveDrag, this)
        this.node.off(Node.EventType.TOUCH_END, this.endDrag, this)
        this.node.off(Node.EventType.TOUCH_CANCEL, this.cancelDrag, this)
        this.dragging = false
    }

    private localX(event: EventTouch): number {
        const point = event.getUILocation()
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(point.x, point.y)).x
    }

    private change(value: number): void {
        this.value = value
        this.onChange(this.value)
    }

    private startDrag(event: EventTouch): void {
        event.propagationStopped = true
        const x = this.localX(event)
        const thumbX = this.value * (this.width - this.knobWidth)
        this.dragging = x >= thumbX && x < thumbX + this.knobWidth
        this.dragOffset = x - thumbX
        if (!this.dragging) this.change(x / this.width)
    }

    private moveDrag(event: EventTouch): void {
        event.propagationStopped = true
        if (this.dragging) this.change((this.localX(event) - this.dragOffset) / (this.width - this.knobWidth))
    }

    private endDrag(event: EventTouch): void {
        this.cancelDrag(event)
        void SoundLoader.play(SoundEffect.ButtonClick)
    }

    private cancelDrag(event: EventTouch): void {
        event.propagationStopped = true
        this.dragging = false
    }
}
