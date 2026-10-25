import { _decorator, Button, Component, EventMouse, input, Input, Node, UITransform, Vec3, type EventTouch } from 'cc'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { Haptics } from '@/platform/Haptics'

const { ccclass } = _decorator
export type UIButtonState = 'normal' | 'hover' | 'pressed' | 'disabled'
/** Pixels from the button's top-left corner; x points right, y points down. */
export type UIButtonPolygon = readonly (readonly [number, number])[]

@ccclass('PvZUIButton')
export class UIButton extends Component {
    private static readonly instances = new Set<UIButton>()
    private static active: UIButton | null = null
    private static captureRoot: Node | null = null
    private static readonly hoverClient = {
        clearHover: () => {
            UIButton.active?.cancelPress()
            for (const button of UIButton.instances) button.setHover(false)
        },
        refreshHover: (pointer: UIHoverPointer, modal: Node | null) => UIButton.refreshHover(pointer, modal),
    }

    onClick: () => void = () => {}
    onPress: () => void = () => { void SoundLoader.play(SoundEffect.GraveButton) }
    onHoverEnter?: () => void
    onHoverChange?: (hovering: boolean) => void
    onStateChange?: (state: UIButtonState) => void
    setText: (text: string) => void = () => {}
    rightClickTriggers = true
    rightClickPressesVisual = true
    releaseToNormalOnPressOut = false
    refreshHoverOnEnable = true
    /** Select immediately without capturing the pointer or emitting a release click. */
    pressOnly = false
    changeCursor = true
    hapticsEnabled = true
    /** Temporary input gate; keeps the normal appearance when blocked. */
    canInteract: () => boolean = () => true
    polygon: UIButtonPolygon = []
    private interactive = true
    private pressed = false
    private hovering = false
    private pressVisual = false
    private mouseButton: number | null = null
    private touchId: number | null = null
    private state: UIButtonState = 'normal'
    private restoreHitTest?: () => void

    get interactable(): boolean { return this.interactive }
    set interactable(value: boolean) {
        if (this.interactive === value) return
        this.interactive = value
        this.cancelPress()
        this.setHover(false)
        if (!value || this.refreshHoverOnEnable) UIHoverManager.refreshHoverStates()
    }
    get isPressed(): boolean { return this.pressed }
    get isHovering(): boolean { return this.hovering }
    static get hasActivePress(): boolean { return this.active !== null }

    onEnable(): void {
        this.installHitTest()
        UIButton.instances.add(this)
        UIHoverManager.registerClient(UIButton.hoverClient)
        this.listen(true)
        this.applyState(this.interactable ? 'normal' : 'disabled')
        if (this.refreshHoverOnEnable) UIHoverManager.refreshHoverStates()
    }

    onDisable(): void {
        UIButton.instances.delete(this)
        this.cancelPress()
        this.setHover(false)
        this.listen(false)
        this.restoreHitTest?.()
        this.restoreHitTest = undefined
        if (UIButton.instances.size === 0) UIHoverManager.unregisterClient(UIButton.hoverClient)
        UIHoverManager.refreshHoverStates()
    }

    private listen(enabled: boolean): void {
        const method = enabled ? 'on' : 'off'
        for (const [event, handler] of [
            [Node.EventType.MOUSE_DOWN, this.mouseDown], [Node.EventType.MOUSE_UP, this.mouseUp],
            [Node.EventType.MOUSE_MOVE, this.mouseMove], [Node.EventType.MOUSE_ENTER, this.mouseMove],
            [Node.EventType.MOUSE_LEAVE, this.mouseMove],
            [Node.EventType.TOUCH_START, this.touchStart], [Node.EventType.TOUCH_MOVE, this.touchMove],
            [Node.EventType.TOUCH_END, this.touchEnd], [Node.EventType.TOUCH_CANCEL, this.touchCancel],
        ] as const) this.node[method](event, handler, this)
    }

    private static refreshHover(pointer: UIHoverPointer, modal: Node | null): boolean {
        const active = this.active
        if (active) {
            if (!active.available(modal)) active.cancelPress()
            else {
                for (const button of this.instances) if (button !== active) button.setHover(false)
                if (pointer.canHover) active.movePress(active.hit(pointer))
                return pointer.canHover && active.hovering && active.changeCursor
            }
        }
        let top: UIButton | null = null
        if (pointer.canHover) for (const button of this.instances) {
            if (button.available(modal, false) && button.hit(pointer) && (!top || this.above(button.node, top.node))) top = button
        }
        for (const button of this.instances) button.setHover(button === top && button.interactable)
        return !!top?.interactable && top.changeCursor
    }

    private static above(a: Node, b: Node): boolean {
        const path = (node: Node) => {
            const nodes: Node[] = []
            for (let current: Node | null = node; current; current = current.parent) nodes.unshift(current)
            return nodes
        }
        const left = path(a), right = path(b)
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
            if (left[i] !== right[i]) return left[i].getSiblingIndex() > right[i].getSiblingIndex()
        }
        return left.length > right.length
    }

    private available(modal = UIHoverManager.activeModalRoot, requireInteractive = true): boolean {
        return this.enabledInHierarchy && this.node.activeInHierarchy && (!requireInteractive || this.interactable)
            && this.canInteract() && !UIHoverManager.isInputBlocked && (!modal || this.node === modal || this.node.isChildOf(modal))
    }

    private hit(pointer: Pick<UIHoverPointer, 'location' | 'windowId'>): boolean {
        return this.node.getComponent(UITransform)!.hitTest(pointer.location, pointer.windowId)
    }

    private setHover(inside: boolean, emit = true): void {
        const entered = inside && !this.hovering
        const changed = inside !== this.hovering
        this.hovering = inside
        if (!this.pressed) this.applyState(!this.interactable ? 'disabled' : inside ? 'hover' : 'normal')
        if (changed) this.onHoverChange?.(inside)
        if (entered && this.hapticsEnabled) Haptics.play()
        if (entered && emit) this.onHoverEnter?.()
    }

    private applyState(state: UIButtonState): void {
        if (this.state === state) return
        this.state = state
        this.onStateChange?.(state)
    }

    private beginPress(visual: boolean): void {
        this.pressed = true
        this.pressVisual = visual
        UIButton.active = this
        this.setHover(true, false)
        this.applyState(visual ? 'pressed' : 'hover')
        this.onPress()
        UIHoverManager.refreshHoverStates()
    }

    private movePress(inside: boolean): void {
        this.setHover(inside)
        this.applyState(inside ? this.pressVisual ? 'pressed' : 'hover'
            : this.pressVisual && !this.releaseToNormalOnPressOut ? 'hover' : 'normal')
    }

    private cancelPress(clearHover = true): void {
        if (UIButton.active === this) {
            UIButton.active = null
            UIButton.capture(false)
        }
        this.pressed = false
        this.pressVisual = false
        this.mouseButton = this.touchId = null
        if (clearHover) this.setHover(false, false)
    }

    private finishPress(inside: boolean, event: EventMouse | EventTouch, canHover: boolean): void {
        this.cancelPress(false)
        this.setHover(canHover && inside, false)
        event.propagationStopped = true
        if (inside && this.available()) this.node.emit(Button.EventType.CLICK, this, event)
        UIHoverManager.refreshHoverStates()
    }

    private mouseDown(event: EventMouse): void {
        if (GameDebugSettings.isMobileMode() || !this.available() || UIButton.active) return
        if (!this.rightClickTriggers && event.getButton() !== EventMouse.BUTTON_LEFT) return
        event.propagationStopped = true
        UIHoverManager.rememberMouseEvent(event, false)
        if (this.pressOnly) { this.setHover(true, false); this.onPress(); return }
        this.mouseButton = event.getButton()
        this.beginPress(this.mouseButton === EventMouse.BUTTON_LEFT || this.rightClickPressesVisual)
        if (UIButton.active === this) UIButton.capture(true)
    }

    private mouseMove(event: EventMouse): void {
        if (!GameDebugSettings.isMobileMode()) UIHoverManager.rememberMouseEvent(event)
    }

    private mouseUp(event: EventMouse): void {
        if (this.mouseButton === null || event.getButton() !== this.mouseButton) return
        UIHoverManager.rememberMouseEvent(event, false)
        const inside = this.hit({ location: event.getLocation(), windowId: event.windowId })
        this.finishPress(inside, event, true)
    }

    private static capture(enabled: boolean): void {
        if (this.captureRoot) {
            this.captureRoot.off(Node.EventType.MOUSE_MOVE, this.captureMove, this, true)
            this.captureRoot.off(Node.EventType.MOUSE_UP, this.captureUp, this, true)
            this.captureRoot = null
        }
        input.off(Input.EventType.MOUSE_MOVE, this.captureMove, this)
        input.off(Input.EventType.MOUSE_UP, this.captureUp, this)
        if (!enabled || !this.active) return
        let root: Node | null = null
        for (let current: Node | null = this.active.node; current; current = current.parent) {
            if (current.getComponent(UITransform)) root = current
        }
        if (!root) return
        this.captureRoot = root
        root.on(Node.EventType.MOUSE_MOVE, this.captureMove, this, true)
        root.on(Node.EventType.MOUSE_UP, this.captureUp, this, true)
        input.on(Input.EventType.MOUSE_MOVE, this.captureMove, this)
        input.on(Input.EventType.MOUSE_UP, this.captureUp, this)
    }

    private static captureMove(event: EventMouse): void { UIHoverManager.rememberMouseEvent(event) }
    private static captureUp(event: EventMouse): void { this.active?.mouseUp(event) }

    private touchStart(event: EventTouch): void {
        if (!GameDebugSettings.isMobileMode() || !this.available() || UIButton.active) return
        event.propagationStopped = true
        if (this.pressOnly) {
            this.setHover(true, false)
            this.onPress()
            this.setHover(false, false)
            return
        }
        this.touchId = event.touch!.getID()
        this.beginPress(true)
    }

    private touchMove(event: EventTouch): void {
        if (this.touchId === null || event.touch!.getID() !== this.touchId) return
        event.propagationStopped = true
        this.movePress(this.hit({ location: event.touch!.getLocation(), windowId: event.windowId }))
    }

    private touchEnd(event: EventTouch): void {
        if (this.touchId === null || event.touch!.getID() !== this.touchId) return
        this.finishPress(this.hit({ location: event.touch!.getLocation(), windowId: event.windowId }), event, false)
    }

    private touchCancel(event: EventTouch): void {
        if (this.touchId === null || event.touch!.getID() !== this.touchId) return
        this.cancelPress()
        UIHoverManager.refreshHoverStates()
    }

    private installHitTest(): void {
        const transform = this.node.getComponent(UITransform)!
        const original = transform.hitTest
        const world = new Vec3()
        const local = new Vec3()
        // Hook native hit testing so empty corners also pass through during hover and touch dispatch.
        const hitTest: UITransform['hitTest'] = (point, windowId = 0) => {
            if (!original.call(transform, point, windowId)) return false
            if (this.polygon.length < 3) return true
            for (const camera of this.node.scene.renderScene?.cameras ?? []) {
                if (!(camera.visibility & this.node.layer) || camera.systemWindowId !== windowId
                    || (camera.window && !camera.window.swapchain)) continue
                world.set(point.x, point.y, 0)
                camera.screenToWorld(world, world)
                transform.convertToNodeSpaceAR(world, local)
                const x = local.x + transform.anchorX * transform.width
                const y = (1 - transform.anchorY) * transform.height - local.y
                if (this.containsPoint(x, y)) return true
            }
            return false
        }
        transform.hitTest = hitTest
        this.restoreHitTest = () => {
            if (transform.hitTest === hitTest) transform.hitTest = original
        }
    }

    private containsPoint(x: number, y: number): boolean {
        let inside = false
        const points = this.polygon
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const [xi, yi] = points[i]
            const [xj, yj] = points[j]
            // Include edges, including horizontal edges and vertices.
            const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi)
            if (Math.abs(cross) < 1e-6 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj)
                && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
        }
        return inside
    }

}
