import { _decorator, Color, Component, input, Input, Mask, Node, UITransform, Vec3, type EventMouse, type EventTouch } from 'cc'
import { getWheelScrollSteps, TouchScrollGesture } from '@/client/input/ScrollGesture'
import { uiNode, type UiNodeParts } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

const { ccclass } = _decorator
const BACKGROUND = new Color(152, 149, 188)
const THUMB_COLORS = [
    [63, 64, 86], [80, 81, 108], [84, 85, 113], [44, 45, 59],
    [40, 41, 54], [34, 35, 46], [30, 28, 34], [22, 19, 21],
].map(([r, g, b]) => new Color(r, g, b))

export interface UIScrollOptions {
    width: number
    height: number
    contentHeight: number
    /** Pixels per wheel step, before the legacy wheel normalization. */
    wheelStep?: number
    /** Extra space below overflowing content. */
    bottomPadding?: number
    scrollbar?: boolean
    /** Seconds for a full wheel step; zero keeps scrolling immediate. */
    wheelDuration?: number
}

/** Vertical scroll area using the previous pvz-remake TypeScript interactions and pixel scrollbar. */
@ccclass('PvZUIScroll')
export class UIScroll extends Component {
    content!: Node
    private viewport!: UiNodeParts
    private bar!: UiNodeParts
    private width = 0
    private height = 0
    private wheelStep = 12
    private bottomPadding = 0
    private showScrollbar = true
    private wheelDuration = 0
    private tweenDuration = 0
    private tweenElapsed = 0
    private tweenStart = 0
    private tweenEnd = 0
    private maxScroll = 0
    private scroll = 0
    private thumbHeight = 0
    private thumbRange = 1
    private dragging = false
    private dragOffset = 0
    private mobile = false
    private readonly gesture = new TouchScrollGesture()

    initialize(options: UIScrollOptions): void {
        this.width = options.width
        this.height = options.height
        this.wheelStep = options.wheelStep ?? 12
        this.bottomPadding = options.bottomPadding ?? 0
        this.showScrollbar = options.scrollbar ?? true
        this.wheelDuration = options.wheelDuration ?? 0
        this.viewport = uiNode({
            name: 'Viewport', parent: this.node, anchor: { x: 0, y: 1 }, mask: Mask.Type.GRAPHICS_RECT,
        })
        this.content = uiNode({ name: 'Content', parent: this.viewport.node, anchor: { x: 0, y: 1 } }).node
        this.bar = uiNode({
            name: 'Scrollbar', parent: this.node, position: { x: this.width - 4 },
            anchor: { x: 0, y: 1 }, size: { width: 8, height: this.height }, graphics: true,
        })
        this.mobile = GameDebugSettings.isMobileMode()
        this.setContentHeight(options.contentHeight)
        if (this.enabledInHierarchy) this.bindEvents('on')
    }

    get contentWidth(): number { return this.viewport.transform.width }
    get offset(): number { return this.scroll }
    set offset(value: number) {
        this.tweenDuration = 0
        this.gesture.stopInertia()
        this.setScroll(value)
    }

    scrollTo(value: number, seconds = 0): void {
        if (seconds <= 0) { this.offset = value; return }
        this.gesture.stopInertia()
        this.tweenStart = this.scroll
        this.tweenEnd = Math.max(0, Math.min(this.maxScroll, value))
        this.tweenElapsed = 0
        this.tweenDuration = seconds
    }

    setContentHeight(contentHeight: number): void {
        const visualMaxScroll = Math.max(0, contentHeight - this.height)
        const scrolling = visualMaxScroll > 0
        this.maxScroll = scrolling ? visualMaxScroll + this.bottomPadding : 0
        this.thumbHeight = Math.min(this.height, Math.max(20, this.height - visualMaxScroll) * 1.5)
        this.thumbRange = Math.max(1, this.height - this.thumbHeight)
        this.viewport.transform.setContentSize(this.width - (scrolling && this.showScrollbar ? 8 : 0), this.height)
        this.content.getComponent(UITransform)!.setContentSize(this.contentWidth, contentHeight)
        this.bar.node.active = scrolling && this.showScrollbar
        this.dragging = false
        this.tweenDuration = 0
        this.gesture.cancel()
        this.setScroll(this.scroll)
    }

    onEnable(): void { if (this.bar) this.bindEvents('on') }

    onDisable(): void {
        if (this.bar) this.bindEvents('off')
        this.dragging = false
        this.tweenDuration = 0
        this.gesture.cancel()
    }

    update(dt: number): void {
        dt = gameClock.delta(dt)
        if (this.tweenDuration > 0) {
            this.tweenElapsed = Math.min(this.tweenDuration, this.tweenElapsed + dt)
            const curve = (t: number) => t * t * (3 - 2 * t)
            this.setScroll(this.tweenStart + (this.tweenEnd - this.tweenStart) * curve(curve(this.tweenElapsed / this.tweenDuration)))
            if (this.tweenElapsed >= this.tweenDuration) this.tweenDuration = 0
        }
        this.gesture.applyInertiaY(dt, () => this.scroll, value => this.setScroll(value))
    }

    private bindEvents(method: 'on' | 'off'): void {
        this.viewport.node[method](Node.EventType.MOUSE_WHEEL, this.onWheel, this)
        this.bar.node[method](Node.EventType.MOUSE_WHEEL, this.onWheel, this)
        this.bar.node[method](Node.EventType.TOUCH_START, this.beginThumbDrag, this)
        this.bar.node[method](Node.EventType.TOUCH_MOVE, this.moveThumb, this)
        this.bar.node[method](Node.EventType.TOUCH_END, this.endThumbDrag, this)
        this.bar.node[method](Node.EventType.TOUCH_CANCEL, this.endThumbDrag, this)
        this.bar.node[method](Node.EventType.MOUSE_DOWN, this.beginThumbDrag, this)
        input[method](Input.EventType.MOUSE_MOVE, this.moveThumb, this)
        input[method](Input.EventType.MOUSE_UP, this.endThumbDrag, this)
        if (!this.mobile) return
        this.viewport.node[method](Node.EventType.TOUCH_START, this.beginTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_MOVE, this.moveTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_END, this.endTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_CANCEL, this.cancelTouch, this)
    }

    private onWheel(event: EventMouse): void {
        if (this.maxScroll <= 0) return
        event.propagationStopped = true
        if (this.dragging) return
        this.gesture.stopInertia()
        const from = this.tweenDuration > 0 ? this.tweenEnd : this.scroll
        const target = Math.max(0, Math.min(this.maxScroll, from - this.wheelStep * getWheelScrollSteps(event)))
        const distance = Math.abs(target - from)
        if (!distance) return
        const duration = this.wheelDuration > 0 ? Math.max(0.05, this.wheelDuration * Math.min(1, distance / this.wheelStep)) : 0
        this.scrollTo(target, duration)
    }

    private beginTouch(event: EventTouch): void {
        if (this.maxScroll > 0 && !this.dragging) {
            this.tweenDuration = 0
            this.gesture.beginTouch(event)
        }
    }

    private moveTouch(event: EventTouch): void {
        if (!this.dragging) this.gesture.dragByTouchY(event, delta => this.setScroll(this.scroll + delta))
    }

    private endTouch(event: EventTouch): void { this.gesture.endTouch(event) }
    private cancelTouch(event: EventTouch): void { this.gesture.endTouch(event, false) }

    private localY(event: EventMouse | EventTouch): number {
        const point = event.getUILocation?.() ?? event.getLocation()
        return -this.bar.transform.convertToNodeSpaceAR(new Vec3(point.x, point.y)).y
    }

    private beginThumbDrag(event: EventMouse | EventTouch): void {
        const y = this.localY(event), top = this.thumbY
        if (y < top || y >= top + this.thumbHeight) return
        this.dragOffset = y - top
        this.dragging = true
        this.tweenDuration = 0
        this.gesture.cancel()
        event.propagationStopped = true
    }

    private moveThumb(event: EventMouse | EventTouch): void {
        if (!this.dragging || !this.bar.node.isValid) return
        this.setScroll((this.localY(event) - this.dragOffset) / this.thumbRange * this.maxScroll)
        event.propagationStopped = true
    }

    private endThumbDrag(event: EventMouse | EventTouch): void {
        if (!this.dragging) return
        this.dragging = false
        event.propagationStopped = true
    }

    private setScroll(value: number): void {
        this.scroll = Math.max(0, Math.min(this.maxScroll, value))
        this.content.setPosition(0, this.scroll, 0)
        this.draw()
    }

    private get thumbY(): number {
        return this.maxScroll > 0 ? Math.max(0, Math.min(this.thumbRange, this.scroll / this.maxScroll * this.thumbRange)) : 0
    }

    private draw(): void {
        if (!this.bar.node.active) return
        const g = this.bar.graphics!, y = this.thumbY, h = this.thumbHeight
        const rect = (x: number, top: number, width: number, height: number) => {
            if (width > 0 && height > 0) g.fillRect(x, -(top + height), width, height)
        }
        g.clear()
        g.fillColor = BACKGROUND
        rect(0, 0, 8, y)
        rect(0, y + h, 8, this.height - y - h)
        g.fillColor = THUMB_COLORS[0]
        rect(0, y, 7, 1)
        rect(0, y + 1, 1, h - 2)
        rect(2, y + 2, 4, h - 3)
        g.fillColor = THUMB_COLORS[1]
        rect(2, y + 1, 4, 1)
        rect(1, y + 2, 1, h - 4)
        g.fillColor = THUMB_COLORS[2]
        rect(1, y + 1, 1, 1)
        g.fillColor = THUMB_COLORS[3]
        rect(6, y + 1, 1, 1)
        rect(1, y + h - 2, 1, 1)
        g.fillColor = THUMB_COLORS[4]
        rect(6, y + 1, 1, h - 4)
        rect(1, y + h - 2, 4, 1)
        g.fillColor = THUMB_COLORS[5]
        rect(6, y + h - 2, 1, 1)
        g.fillColor = THUMB_COLORS[6]
        rect(7, y, 1, h - 1)
        rect(0, y + h - 1, 7, 1)
        g.fillColor = THUMB_COLORS[7]
        rect(7, y + h - 1, 1, 1)
    }
}
