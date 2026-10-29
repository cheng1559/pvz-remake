import { _decorator, Color, Component, input, Input, Mask, Node, UITransform, Vec3, type EventMouse, type EventTouch } from 'cc'
import { getWheelScrollSteps, TouchScrollGesture } from '@/client/input/ScrollGesture'
import { uiNode, type UiNodeParts } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

const { ccclass } = _decorator
const BAR_WIDTH = 8
/** SexyApp widgets update every 10ms; a held track pages after 25 updates, then every 5. */
const PAGE_TICK = 0.01

/** ScrollbarWidget color slots: track, track while paging, thumb, thumb edge, thumb shadow, thumb highlight. */
export type ScrollbarColors = readonly [Color, Color, Color, Color, Color, Color]
const scrollbarColors = (values: readonly (readonly number[])[]) =>
    values.map(([r, g, b, a]) => new Color(r, g, b, a)) as unknown as ScrollbarColors
/** Steam 1.2.0.1096 AlmanacDialog colors (0x72c898 and 0x72c8f8), blended over the card. */
export const PLANT_SCROLLBAR_COLORS = scrollbarColors([
    [214, 100, 40, 128], [143, 67, 27, 192], [98, 43, 14, 192], [72, 0, 0, 192], [96, 44, 17, 192], [97, 45, 18, 192],
])
export const ZOMBIE_SCROLLBAR_COLORS = scrollbarColors([
    [120, 125, 160, 128], [95, 97, 129, 192], [34, 36, 52, 192], [19, 16, 17, 192], [32, 33, 43, 192], [85, 87, 115, 192],
])

/**
 * ScrollbarWidget::GetThumbSize and GetThumbPosition, with the value, page and maximum in pixels. `maxScroll` is
 * contentHeight - pageHeight unless the range was extended to reach taller drawn content.
 */
export function scrollbarThumb(height: number, contentHeight: number, pageHeight: number, offset: number,
    maxScroll = contentHeight - pageHeight) {
    if (contentHeight <= pageHeight || maxScroll <= 0) return { size: 0, position: 0 }
    const size = Math.max(8, Math.floor(height * pageHeight / contentHeight + 0.5))
    return { size, position: Math.floor((height - size) * offset / maxScroll + 0.5) }
}

export interface UIScrollOptions {
    width: number
    height: number
    contentHeight: number
    /** Pixels per wheel step, before the legacy wheel normalization. */
    wheelStep?: number
    /** Pixels a track click pages; the scroll stops when this much of the content remains. Defaults to the height. */
    pageHeight?: number
    scrollbar?: boolean
    colors?: ScrollbarColors
    /** Seconds for a full wheel step; zero keeps scrolling immediate. */
    wheelDuration?: number
}

/** Vertical scroll area with the Steam GOTY ScrollbarWidget: 8px wide, no arrow buttons, track paging. */
@ccclass('PvZUIScroll')
export class UIScroll extends Component {
    content!: Node
    private viewport!: UiNodeParts
    private bar!: UiNodeParts
    private width = 0
    private height = 0
    private contentHeight = 0
    private page = 0
    private colors: ScrollbarColors = ZOMBIE_SCROLLBAR_COLORS
    private wheelStep = 12
    private showScrollbar = true
    private wheelDuration = 0
    private tweenDuration = 0
    private tweenElapsed = 0
    private tweenStart = 0
    private tweenEnd = 0
    private maxScroll = 0
    private scroll = 0
    private pressed = false
    private dragging = false
    private dragStart = 0
    private dragThumb = 0
    /** -1 or 1 while a held track pages up or down. */
    private paging = 0
    private pageTicks = 0
    private pageElapsed = 0
    private lastY = 0
    private mobile = false
    private readonly gesture = new TouchScrollGesture()

    initialize(options: UIScrollOptions): void {
        this.width = options.width
        this.height = options.height
        this.page = options.pageHeight ?? options.height
        this.colors = options.colors ?? ZOMBIE_SCROLLBAR_COLORS
        this.wheelStep = options.wheelStep ?? 12
        this.showScrollbar = options.scrollbar ?? true
        this.wheelDuration = options.wheelDuration ?? 0
        this.viewport = uiNode({
            name: 'Viewport', parent: this.node, anchor: { x: 0, y: 1 }, mask: Mask.Type.GRAPHICS_RECT,
        })
        this.content = uiNode({ name: 'Content', parent: this.viewport.node, anchor: { x: 0, y: 1 } }).node
        // AlmanacDialog places the bar 6px inside the box's right edge and narrows the text by 7px.
        this.bar = uiNode({
            name: 'Scrollbar', parent: this.node, position: { x: this.width - 6 },
            anchor: { x: 0, y: 1 }, size: { width: BAR_WIDTH, height: this.height }, graphics: true,
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

    /** `drawnHeight` extends the range, never the thumb, when the drawn content is taller than the measured one. */
    setContentHeight(contentHeight: number, drawnHeight = contentHeight): void {
        const scrolling = contentHeight > this.height
        this.contentHeight = contentHeight
        this.maxScroll = scrolling ? Math.max(0, contentHeight - this.page, drawnHeight - this.height) : 0
        this.viewport.transform.setContentSize(this.width - (scrolling && this.showScrollbar ? 7 : 0), this.height)
        this.content.getComponent(UITransform)!.setContentSize(this.contentWidth, Math.max(contentHeight, drawnHeight))
        this.bar.node.active = scrolling && this.showScrollbar
        this.release()
        this.tweenDuration = 0
        this.gesture.cancel()
        this.setScroll(this.scroll)
    }

    onEnable(): void { if (this.bar) this.bindEvents('on') }

    onDisable(): void {
        if (this.bar) this.bindEvents('off')
        this.release()
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
        // ScrollbarWidget::Update: keep paging while the pointer stays on the same side of the thumb.
        if (this.paging) this.pageElapsed += dt
        while (this.paging && this.pageElapsed >= PAGE_TICK) {
            this.pageElapsed -= PAGE_TICK
            if (this.thumbSide(this.lastY) !== this.paging) {
                this.paging = 0
                this.draw()
            } else if (++this.pageTicks >= 25) {
                this.pageTicks = 20
                this.setScroll(this.scroll + this.paging * this.page)
            }
        }
    }

    private bindEvents(method: 'on' | 'off'): void {
        this.viewport.node[method](Node.EventType.MOUSE_WHEEL, this.onWheel, this)
        this.bar.node[method](Node.EventType.TOUCH_START, this.pressBar, this)
        this.bar.node[method](Node.EventType.TOUCH_MOVE, this.moveBar, this)
        this.bar.node[method](Node.EventType.TOUCH_END, this.releaseBar, this)
        this.bar.node[method](Node.EventType.TOUCH_CANCEL, this.releaseBar, this)
        this.bar.node[method](Node.EventType.MOUSE_DOWN, this.pressBar, this)
        input[method](Input.EventType.MOUSE_MOVE, this.moveBar, this)
        input[method](Input.EventType.MOUSE_UP, this.releaseBar, this)
        if (!this.mobile) return
        this.viewport.node[method](Node.EventType.TOUCH_START, this.beginTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_MOVE, this.moveTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_END, this.endTouch, this)
        this.viewport.node[method](Node.EventType.TOUCH_CANCEL, this.cancelTouch, this)
    }

    private onWheel(event: EventMouse): void {
        if (this.maxScroll <= 0) return
        event.propagationStopped = true
        if (this.pressed) return
        this.gesture.stopInertia()
        const from = this.tweenDuration > 0 ? this.tweenEnd : this.scroll
        const target = Math.max(0, Math.min(this.maxScroll, from - this.wheelStep * getWheelScrollSteps(event)))
        const distance = Math.abs(target - from)
        if (!distance) return
        const duration = this.wheelDuration > 0 ? Math.max(0.05, this.wheelDuration * Math.min(1, distance / this.wheelStep)) : 0
        this.scrollTo(target, duration)
    }

    private beginTouch(event: EventTouch): void {
        if (this.maxScroll > 0 && !this.pressed) {
            this.tweenDuration = 0
            this.gesture.beginTouch(event)
        }
    }

    private moveTouch(event: EventTouch): void {
        if (!this.pressed) this.gesture.dragByTouchY(event, delta => this.setScroll(this.scroll + delta))
    }

    private endTouch(event: EventTouch): void { this.gesture.endTouch(event) }
    private cancelTouch(event: EventTouch): void { this.gesture.endTouch(event, false) }

    private localY(event: EventMouse | EventTouch): number {
        const point = event.getUILocation?.() ?? event.getLocation()
        return -this.bar.transform.convertToNodeSpaceAR(new Vec3(point.x, point.y)).y
    }

    private get thumb() { return scrollbarThumb(this.height, this.contentHeight, this.page, this.scroll, this.maxScroll) }

    /** ScrollbarWidget::ThumbCompare: -1 above the thumb, 0 on it, 1 below it. */
    private thumbSide(y: number): number {
        const { size, position } = this.thumb
        return y < position ? -1 : y >= position + size ? 1 : 0
    }

    /** ScrollbarWidget::MouseDown: the thumb starts a drag, the track pages at once and keeps paging while held. */
    private pressBar(event: EventMouse | EventTouch): void {
        // A mouse press can arrive as both MOUSE_DOWN and TOUCH_START.
        if (this.pressed || this.maxScroll <= 0) return
        this.pressed = true
        this.tweenDuration = 0
        this.gesture.cancel()
        event.propagationStopped = true
        this.lastY = this.localY(event)
        const side = this.thumbSide(this.lastY)
        if (side === 0) {
            this.dragging = true
            this.dragStart = this.lastY
            this.dragThumb = this.thumb.position
            return
        }
        this.paging = side
        this.pageTicks = 0
        this.pageElapsed = 0
        this.setScroll(this.scroll + side * this.page)
    }

    private moveBar(event: EventMouse | EventTouch): void {
        if (!this.pressed || !this.bar.node.isValid) return
        this.lastY = this.localY(event)
        const range = this.height - this.thumb.size
        if (this.dragging && range > 0) this.setScroll((this.dragThumb + this.lastY - this.dragStart) * this.maxScroll / range)
        event.propagationStopped = true
    }

    private releaseBar(event: EventMouse | EventTouch): void {
        if (!this.pressed) return
        this.release()
        this.draw()
        event.propagationStopped = true
    }

    private release(): void {
        this.pressed = false
        this.dragging = false
        this.paging = 0
    }

    private setScroll(value: number): void {
        this.scroll = Math.max(0, Math.min(this.maxScroll, value))
        this.content.setPosition(0, this.scroll, 0)
        this.draw()
    }

    /** ScrollbarWidget::Draw: the track splits at the thumb's middle and the thumb is drawn over it. */
    private draw(): void {
        if (!this.bar.node.active) return
        const g = this.bar.graphics!, { size, position: y } = this.thumb
        const [track, pagingTrack, thumb, edge, shadow, highlight] = this.colors
        const rect = (color: Color, x: number, top: number, width: number, height: number) => {
            if (width <= 0 || height <= 0) return
            g.fillColor = color
            g.fillRect(x, -(top + height), width, height)
        }
        const middle = y + Math.trunc(size / 2), w = BAR_WIDTH, h = size
        g.clear()
        rect(this.paging < 0 ? pagingTrack : track, 0, 0, w, middle)
        rect(this.paging > 0 ? pagingTrack : track, 0, middle, w, this.height - middle)
        if (size <= 0) return
        // ScrollbarWidget::DrawThumb; the translucent layers blend over each other.
        rect(thumb, 0, y, w, h)
        rect(highlight, 1, y + 1, w - 2, 1)
        rect(highlight, 1, y + 1, 1, h - 2)
        rect(edge, 0, y + h - 1, w, 1)
        rect(edge, w - 1, y, 1, h)
        rect(shadow, 1, y + h - 2, w - 2, 1)
        rect(shadow, w - 2, y + 1, 1, h - 2)
    }
}
