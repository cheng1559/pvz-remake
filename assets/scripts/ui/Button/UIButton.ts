import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    EventTouch,
    input,
    Input,
    Camera,
    Color,
    EventMouse,
} from 'cc'
import { UIHoverManager, type UIHoverPointer } from '@/ui/UIHoverManager'
import { CursorManager } from '@/ui/CursorManager'
import { GameDebugSettings } from '@/game/GameDebugSettings'

const { ccclass, property } = _decorator
const LEFT_MOUSE_BUTTON = 0

enum ButtonState {
    NORMAL,
    PRESSED,
    HOVER,
    DISABLED,
}

export type UIButtonVisualState = 'normal' | 'pressed' | 'hover' | 'disabled'
export type UIButtonPointerEvent = EventTouch | EventMouse

@ccclass('UIButton')
export class UIButton extends Component {
    private static _activeButton: UIButton | null = null
    private static _instances: Set<UIButton> = new Set()
    private static _hoverSuppressCount = 0
    private static _inputSuppressedPointerActive = false
    private static _ignoreHoverUntilMouseMove = false
    private static _lastMouseLocation: Vec2 | null = null
    private static _lastPointerCanHover = false
    private static _mouseTrackingStarted = false
    private static _pressCaptureRoot: Node | null = null
    private static readonly _hoverClient = {
        clearHover: () => UIButton.clearHoverStates(),
        refreshHover: (pointer: UIHoverPointer | null, activeModalRoot: Node | null) =>
            UIButton._refreshManagedHover(pointer, activeModalRoot),
    }

    @property(SpriteFrame)
    normalSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    pressedSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    hoverSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    disabledSprite: SpriteFrame | null = null

    @property(Vec3)
    pressOffset = new Vec3(1, -1, 0)

    @property
    releaseToNormalOnPressOut = false

    @property
    keepPressOffsetOnPressOut = false

    @property([Vec2])
    polygon: Vec2[] = []

    private _interactable: boolean = true

    @property
    public get interactable(): boolean {
        return this._interactable
    }

    public set interactable(value: boolean) {
        if (this._interactable === value) return
        this._interactable = value
        if (UIButton._activeButton === this) {
            UIButton._activeButton = null
            UIButton._endPressCapture()
        }
        this._pressed = false
        this._pressVisualActive = false
        this._hovering = false
        this._releaseOffset()
        this._applyState(ButtonState.NORMAL)
        if (!value) {
            this._setCursor('default')
        } else if (this.refreshHoverOnEnable) {
            UIHoverManager.refreshHoverStates()
        }
    }

    private _locked: boolean = false

    @property
    public get locked(): boolean {
        return this._locked
    }

    public set locked(value: boolean) {
        if (this._locked === value) return
        this._locked = value
        if (UIButton._activeButton === this) {
            UIButton._activeButton = null
            UIButton._endPressCapture()
        }
        this._pressed = false
        this._pressVisualActive = false
        this._releaseOffset()
        this._applyState(ButtonState.NORMAL)
        if (value) {
            this._color.set(128, 128, 128)
            this._applyColor()
        }
    }

    @property
    changeCursor: boolean = true

    @property
    rightClickTriggers: boolean = true

    @property
    rightClickPressesVisual: boolean = true

    @property
    refreshHoverOnEnable: boolean = true

    public onClick: ((event: UIButtonPointerEvent) => void) | null = null

    public onClickLocked: ((event: UIButtonPointerEvent) => void) | null = null

    public onPress: ((event: UIButtonPointerEvent) => void) | null = null

    public onHoverEnter: (() => void) | null = null

    public onStateChange: ((state: UIButtonVisualState) => void) | null = null

    private _color: Color = Color.WHITE.clone()

    public get color(): Color {
        return this._color
    }

    public set color(value: Color) {
        this._color.set(value)
        this._applyColor()
    }

    private _sprite: Sprite | null = null
    private _spriteExplicit = false
    private _originPos = new Vec3()
    private _state: ButtonState = ButtonState.NORMAL
    private _pressed = false
    private _pressVisualActive = false
    private _hovering = false

    public get isPressed(): boolean {
        return this._pressed
    }

    public get isHovering(): boolean {
        return this._hovering
    }

    public static beginHoverSuppress() {
        this._hoverSuppressCount++
        this._inputSuppressedPointerActive = false
        this.clearHoverStates()
    }

    public static endHoverSuppress(refreshHover = true) {
        if (this._hoverSuppressCount > 0) {
            this._hoverSuppressCount--
        }
        if (this._hoverSuppressCount === 0) {
            this._inputSuppressedPointerActive = false
            this._ignoreHoverUntilMouseMove = false
            if (refreshHover) {
                this.refreshHoverStates()
            } else {
                this._ignoreHoverUntilMouseMove = true
                this.clearHoverStates()
            }
        }
    }

    public static clearHoverStates() {
        this._activeButton = null
        this._inputSuppressedPointerActive = false
        this._endPressCapture()
        this._pruneDeadInstances()
        for (const button of this._instances) {
            button._pressed = false
            button._pressVisualActive = false
            button._setHovering(false)
            button._releaseOffset()
        }
        this._setGlobalCursor('default')
    }

    public static refreshHoverStates(
        pointerLocation: Vec2 | null = null,
        activeModalRoot: Node | null = UIHoverManager.activeModalRoot,
    ) {
        if (this._hoverSuppressCount > 0 && !activeModalRoot) {
            this.clearHoverStates()
            return false
        }
        this._pruneDeadInstances()
        if (this._activeButton) return false
        if (!this._lastPointerCanHover) {
            this.clearHoverStates()
            return false
        }

        this._ensureMouseTracking()
        let anyHovering = false
        const location = pointerLocation ?? this._lastMouseLocation
        for (const button of this._instances) {
            anyHovering = button._refreshHoverFromPointer(false, location, activeModalRoot) || anyHovering
        }
        this._setGlobalCursor(anyHovering ? 'pointer' : 'default')
        return anyHovering
    }

    public refreshHoverFromPointer(updateCursor = true) {
        return this._refreshHoverFromPointer(updateCursor, null, UIHoverManager.activeModalRoot)
    }

    public setVisualSprite(sprite: Sprite | null) {
        this._sprite = sprite
        this._spriteExplicit = true
        this._applyState(this._state)
    }

    private static _pruneDeadInstances() {
        for (const button of this._instances) {
            if (!this._isButtonAlive(button)) this._instances.delete(button)
        }
        if (this._activeButton && !this._isButtonAlive(this._activeButton)) {
            this._activeButton = null
            this._endPressCapture()
        }
    }

    private static _isButtonAlive(button: UIButton) {
        return button.isValid && !!button.node?.isValid
    }

    private static _ensureMouseTracking() {
        if (this._mouseTrackingStarted) return
        this._mouseTrackingStarted = true
        UIHoverManager.registerClient(this._hoverClient)
        input.on(Input.EventType.MOUSE_MOVE, this._onGlobalMouseMove)
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown)
        input.on(Input.EventType.MOUSE_UP, this._onGlobalMouseUp)
        input.on(Input.EventType.TOUCH_START, this._onGlobalTouch)
        input.on(Input.EventType.TOUCH_MOVE, this._onGlobalTouch)
        input.on(Input.EventType.TOUCH_END, this._onGlobalTouch)
        input.on(Input.EventType.TOUCH_CANCEL, this._onGlobalTouch)
    }

    private static _onGlobalMouseMove(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) {
            UIButton._lastPointerCanHover = false
            return
        }
        UIButton._ignoreHoverUntilMouseMove = false
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event)
    }

    private static _onGlobalMouseDown(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) {
            UIButton._lastPointerCanHover = false
            return
        }
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
    }

    private static _onGlobalMouseUp(event: EventMouse) {
        if (UIButton._activeButton?._pressed) {
            UIButton._activeButton._finishMousePress(event)
        }
        UIButton._inputSuppressedPointerActive = false
        if (GameDebugSettings.isMobileMode()) {
            UIButton._lastPointerCanHover = false
            return
        }
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        if (UIButton._ignoreHoverUntilMouseMove) {
            UIButton.clearHoverStates()
            return
        }
        UIButton.refreshHoverStates()
    }

    private static _beginPressCapture(button: UIButton) {
        const root = button._findPressCaptureRoot()
        if (!root || this._pressCaptureRoot === root) return
        this._endPressCapture()
        this._pressCaptureRoot = root
        root.on(Node.EventType.MOUSE_MOVE, this._onPressCaptureMouseMove, this, true)
        root.on(Node.EventType.MOUSE_UP, this._onPressCaptureMouseUp, this, true)
    }

    private static _endPressCapture() {
        const root = this._pressCaptureRoot
        if (!root) return
        root.off(Node.EventType.MOUSE_MOVE, this._onPressCaptureMouseMove, this, true)
        root.off(Node.EventType.MOUSE_UP, this._onPressCaptureMouseUp, this, true)
        this._pressCaptureRoot = null
    }

    private static _onPressCaptureMouseMove(event: EventMouse) {
        const button = UIButton._activeButton
        if (!button?._pressed) return
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        button._updateMousePressState(event)
    }

    private static _onPressCaptureMouseUp(event: EventMouse) {
        const button = UIButton._activeButton
        if (!button?._pressed) return
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        button._finishMousePress(event)
    }

    private static _onGlobalTouch(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode()) return
        UIButton._lastMouseLocation = event.touch?.getLocation() ?? event.getUILocation()
        UIButton._lastPointerCanHover = false
        UIHoverManager.rememberTouchEvent(event, false)
        if (event.type === Node.EventType.TOUCH_END || event.type === Node.EventType.TOUCH_CANCEL) {
            UIButton._inputSuppressedPointerActive = false
        }
    }

    private static _setGlobalCursor(style: string) {
        CursorManager.set(style)
    }

    public static rememberTouchLocation(event: EventTouch) {
        UIButton._lastMouseLocation = event.touch?.getLocation() ?? event.getUILocation()
        UIHoverManager.rememberTouchEvent(event, false)
        if (GameDebugSettings.isMobileMode()) {
            UIButton._lastPointerCanHover = false
        } else {
            UIButton._lastPointerCanHover = true
        }
    }

    public static rememberMouseLocation(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) {
            UIButton._lastPointerCanHover = false
            return
        }
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
    }

    private static _refreshManagedHover(pointer: UIHoverPointer | null, activeModalRoot: Node | null) {
        this._lastPointerCanHover = !!pointer?.canHover
        this._lastMouseLocation = pointer?.location.clone() ?? null
        return this.refreshHoverStates(pointer?.location ?? null, activeModalRoot)
    }

    onLoad() {
        if (!this._spriteExplicit) {
            this._sprite = this.node.getComponent(Sprite) ?? this.node.getComponentInChildren(Sprite)
        }
        Vec3.copy(this._originPos, this.node.position)
        this._setupHitTest()
        this._applyState(ButtonState.NORMAL)
    }

    public updateOriginPos(pos: Vec3) {
        Vec3.copy(this._originPos, pos)
        if (this._state === ButtonState.PRESSED) {
            this._applyOffset()
        } else {
            this.node.setPosition(this._originPos)
        }
    }

    onEnable() {
        UIButton._ensureMouseTracking()
        UIButton._instances.add(this)
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this)
        this.node.on(Node.EventType.MOUSE_DOWN, this._onMouseDown, this)
        this.node.on(Node.EventType.MOUSE_UP, this._onMouseUp, this)
        this.node.on(Node.EventType.MOUSE_MOVE, this._onMouseMove, this)
        this.node.on(Node.EventType.MOUSE_ENTER, this._onMouseEnter, this)
        this.node.on(Node.EventType.MOUSE_LEAVE, this._onMouseLeave, this)
        if (this.refreshHoverOnEnable) {
            UIHoverManager.refreshHoverStates()
        }
    }

    onDisable() {
        UIButton._instances.delete(this)
        if (UIButton._activeButton === this) {
            UIButton._activeButton = null
            UIButton._endPressCapture()
        }
        this._pressed = false
        this._pressVisualActive = false
        this._setHovering(false)
        this._releaseOffset()
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this)
        this.node.off(Node.EventType.MOUSE_DOWN, this._onMouseDown, this)
        this.node.off(Node.EventType.MOUSE_UP, this._onMouseUp, this)
        this.node.off(Node.EventType.MOUSE_MOVE, this._onMouseMove, this)
        this.node.off(Node.EventType.MOUSE_ENTER, this._onMouseEnter, this)
        this.node.off(Node.EventType.MOUSE_LEAVE, this._onMouseLeave, this)
    }

    onDestroy() {
        UIButton._instances.delete(this)
        if (UIButton._activeButton === this) {
            UIButton._activeButton = null
            UIButton._endPressCapture()
        }
        this._sprite = null
    }

    private _onTouchStart(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode()) return
        if (UIButton._isInputSuppressedForNode(this.node)) {
            UIButton._inputSuppressedPointerActive = true
            UIButton._ignoreHoverUntilMouseMove = true
            return
        }
        if (UIButton._inputSuppressedPointerActive) return
        if (!this._interactable) return
        UIButton.rememberTouchLocation(event)
        event.propagationStopped = true
        this._startPress(event)
    }

    private _onTouchMove(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode()) return
        if (UIButton._isInputSuppressedForNode(this.node) || UIButton._inputSuppressedPointerActive) return
        if (!this._interactable) return
        if (!this._pressed) return
        UIButton.rememberTouchLocation(event)
        event.propagationStopped = true
        const inside = this._isTouchInside(event)
        const hoverAllowed = !UIButton._isInputSuppressedForNode(this.node)
        this._setHovering(hoverAllowed && inside, false)
        if (inside) {
            if (this._state !== ButtonState.PRESSED) {
                this._applyState(ButtonState.PRESSED)
            }
            this._applyOffset()
        } else {
            const outState =
                !hoverAllowed || this.releaseToNormalOnPressOut ? ButtonState.NORMAL : ButtonState.HOVER
            if (this._state !== outState) {
                this._applyState(outState)
            }
            if (!this.keepPressOffsetOnPressOut) {
                this._releaseOffset()
            }
        }
        this._setCursor(hoverAllowed && inside ? 'pointer' : 'default')
    }

    private _onTouchEnd(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode()) return
        if (UIButton._isInputSuppressedForNode(this.node) || UIButton._inputSuppressedPointerActive) {
            UIButton._inputSuppressedPointerActive = false
            return
        }
        if (!this._interactable) return
        if (!this._pressed) return
        UIButton.rememberTouchLocation(event)
        event.propagationStopped = true
        this._pressed = false
        this._pressVisualActive = false
        this._releaseOffset()

        const inside = this._isTouchInside(event)
        UIButton._activeButton = null
        const shouldHover = !GameDebugSettings.isMobileMode() && inside && !UIButton._isInputSuppressedForNode(this.node)
        this._setHovering(shouldHover, false, false)
        this._applyState(shouldHover ? ButtonState.HOVER : ButtonState.NORMAL)
        this._setCursor(shouldHover ? 'pointer' : 'default')
        if (!this._locked) {
            if (inside) this.onClick?.(event)
        } else {
            if (inside) this.onClickLocked?.(event)
        }
    }

    private _onTouchCancel(event: EventTouch) {
        if (!GameDebugSettings.isMobileMode()) return
        if (UIButton._isInputSuppressedForNode(this.node) || UIButton._inputSuppressedPointerActive) {
            UIButton._inputSuppressedPointerActive = false
            return
        }
        if (!this._interactable) return
        if (!this._pressed) return
        UIButton.rememberTouchLocation(event)
        this._pressed = false
        this._pressVisualActive = false
        this._releaseOffset()
        UIButton._activeButton = null
        this._setHovering(false, false, false)
        this._applyState(ButtonState.NORMAL)
        this._setCursor('default')
    }

    private _isTouchInside(event: EventTouch): boolean {
        return this._hitTestPointer(event.touch?.getLocation() ?? event.getUILocation())
    }

    private _onMouseDown(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) return
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        if (UIButton._isInputSuppressedForNode(this.node)) {
            UIButton._inputSuppressedPointerActive = true
            UIButton._ignoreHoverUntilMouseMove = true
            return
        }
        if (UIButton._inputSuppressedPointerActive) return
        if (!this._interactable) return
        if (!this._shouldHandleMouseButton(event)) return

        event.propagationStopped = true
        this._startPress(event)
        UIButton._beginPressCapture(this)
    }

    private _onMouseUp(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) return
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        if (UIButton._isInputSuppressedForNode(this.node) || UIButton._inputSuppressedPointerActive) {
            UIButton._inputSuppressedPointerActive = false
            return
        }
        this._finishMousePress(event)
    }

    private static _isInputSuppressedForNode(
        node: Node | null,
        activeModalRoot: Node | null = UIHoverManager.activeModalRoot,
    ) {
        return UIButton._hoverSuppressCount > 0 && !UIButton._isNodeInsideModalRoot(node, activeModalRoot)
    }

    private static _isNodeInsideModalRoot(node: Node | null, activeModalRoot: Node | null) {
        let current = node
        while (current) {
            if (current === activeModalRoot) return true
            current = current.parent
        }
        return false
    }

    private _shouldHandleMouseButton(event: EventMouse) {
        return this.rightClickTriggers || event.getButton() === LEFT_MOUSE_BUTTON
    }

    private _shouldPressVisual(event: UIButtonPointerEvent) {
        if (event instanceof EventMouse && event.getButton() !== LEFT_MOUSE_BUTTON) {
            return this.rightClickPressesVisual
        }
        return true
    }

    private _startPress(event: UIButtonPointerEvent) {
        this._pressed = true
        this._pressVisualActive = this._shouldPressVisual(event)
        UIButton._activeButton = this
        const hoverAllowed = !UIButton._isInputSuppressedForNode(this.node)
        this._setHovering(hoverAllowed, false, false)
        if (this._pressVisualActive) {
            this._applyState(ButtonState.PRESSED)
            this._applyOffset()
        } else {
            this._applyState(hoverAllowed ? ButtonState.HOVER : ButtonState.NORMAL)
            this._releaseOffset()
        }
        this.onPress?.(event)
    }

    private _finishMousePress(event: EventMouse) {
        if (!this._interactable) return
        if (!this._pressed) return
        event.propagationStopped = true
        this._pressed = false
        this._pressVisualActive = false
        this._releaseOffset()

        const inside = this._isMouseInside(event)
        UIButton._activeButton = null
        UIButton._endPressCapture()
        const shouldHover = inside && !UIButton._isInputSuppressedForNode(this.node)
        this._setHovering(shouldHover, false, false)
        this._applyState(shouldHover ? ButtonState.HOVER : ButtonState.NORMAL)
        this._setCursor(shouldHover ? 'pointer' : 'default')

        if (!this._shouldHandleMouseButton(event)) return
        if (!this._locked) {
            if (inside) this.onClick?.(event)
        } else {
            if (inside) this.onClickLocked?.(event)
        }
    }

    private _isMouseInside(event: EventMouse): boolean {
        return this._hitTestPointer(event.getLocation())
    }

    private _updateMousePressState(event: EventMouse) {
        if (!this._interactable) return
        if (!this._pressed) return

        const inside = this._isMouseInside(event)
        const hoverAllowed = !UIButton._isInputSuppressedForNode(this.node)
        this._setHovering(hoverAllowed && inside, false)
        if (!this._pressVisualActive) {
            const state = hoverAllowed && inside ? ButtonState.HOVER : ButtonState.NORMAL
            if (this._state !== state) {
                this._applyState(state)
            }
            this._releaseOffset()
            this._setCursor(hoverAllowed && inside ? 'pointer' : 'default')
            return
        }
        if (inside) {
            if (this._state !== ButtonState.PRESSED) {
                this._applyState(ButtonState.PRESSED)
            }
            this._applyOffset()
            this._setCursor(hoverAllowed ? 'pointer' : 'default')
            return
        }

        const outState = !hoverAllowed || this.releaseToNormalOnPressOut ? ButtonState.NORMAL : ButtonState.HOVER
        if (this._state !== outState) {
            this._applyState(outState)
        }
        if (!this.keepPressOffsetOnPressOut) {
            this._releaseOffset()
        }
        this._setCursor('default')
    }

    private _findPressCaptureRoot(): Node | null {
        let root: Node | null = this.node.getComponent(UITransform) ? this.node : null
        let current = this.node.parent
        while (current) {
            if (current.getComponent(UITransform)) {
                root = current
            }
            current = current.parent
        }
        return root
    }

    private _onMouseEnter() {
        if (GameDebugSettings.isMobileMode()) return
        if (!this._interactable) return
        if (UIButton._isInputSuppressedForNode(this.node)) return
        if (UIButton._activeButton && UIButton._activeButton !== this) return
        UIButton._lastPointerCanHover = true
        if (this._pressed) {
            this._setHovering(true, false)
            return
        }
        this._setHovering(true)
    }

    private _onMouseMove(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) return
        UIButton._lastMouseLocation = event.getLocation()
        UIButton._lastPointerCanHover = true
        UIHoverManager.rememberMouseEvent(event, false)
        if (!this._interactable) return
        if (UIButton._isInputSuppressedForNode(this.node)) return
        if (UIButton._activeButton && UIButton._activeButton !== this) return
        if (!this._pressed) {
            this._setHovering(true)
            return
        }
        this._updateMousePressState(event)
    }

    private _onMouseLeave() {
        if (GameDebugSettings.isMobileMode()) return
        if (!this._interactable) return
        if (UIButton._isInputSuppressedForNode(this.node)) return
        if (UIButton._activeButton && UIButton._activeButton !== this) return
        if (this._pressed) {
            this._setHovering(false, false)
            return
        }
        this._setHovering(false)
    }

    private _refreshHoverFromPointer(
        updateCursor = true,
        pointerLocation: Vec2 | null = null,
        activeModalRoot: Node | null = null,
    ) {
        if (!UIButton._isButtonAlive(this)) {
            UIButton._instances.delete(this)
            if (UIButton._activeButton === this) UIButton._activeButton = null
            return false
        }
        if (
            !this._interactable ||
            !this.node.activeInHierarchy ||
            (activeModalRoot && !this._isInsideModalRoot(activeModalRoot)) ||
            this._pressed ||
            UIButton._isInputSuppressedForNode(this.node, activeModalRoot) ||
            !UIButton._lastPointerCanHover
        ) {
            this._setHovering(false, true, true, updateCursor)
            return false
        }

        const uiTransform = this.node.getComponent(UITransform)
        const location = pointerLocation ?? UIButton._lastMouseLocation
        const hovering = !!uiTransform && !!location && this._hitTestPointer(location)
        this._setHovering(hovering, true, true, updateCursor)
        return hovering
    }

    private _isInsideModalRoot(activeModalRoot: Node) {
        let node: Node | null = this.node
        while (node) {
            if (node === activeModalRoot) return true
            node = node.parent
        }
        return false
    }

    private _setHovering(hovering: boolean, applyVisual = true, emitEvent = true, updateCursor = true) {
        if (!UIButton._isButtonAlive(this)) return
        const wasHovering = this._hovering
        this._hovering = hovering
        if (!this._interactable) return

        if (applyVisual && !this._pressed) {
            this._applyState(hovering ? ButtonState.HOVER : ButtonState.NORMAL)
            if (updateCursor) this._setCursor(hovering ? 'pointer' : 'default')
        }
        if (emitEvent && hovering && !wasHovering) {
            this.onHoverEnter?.()
        }
    }

    private _applyState(state: ButtonState) {
        this._state = state

        let frame: SpriteFrame | null = null
        let visualState: UIButtonVisualState = 'normal'
        switch (state) {
            case ButtonState.NORMAL:
                frame = this.normalSprite
                visualState = 'normal'
                break
            case ButtonState.PRESSED:
                frame = this.pressedSprite ?? this.normalSprite
                visualState = 'pressed'
                break
            case ButtonState.HOVER:
                frame = this.hoverSprite ?? this.normalSprite
                visualState = 'hover'
                break
            case ButtonState.DISABLED:
                frame = this.disabledSprite ?? this.normalSprite
                visualState = 'disabled'
                break
        }
        const sprite = this._getLiveSprite()
        if (frame && sprite) sprite.spriteFrame = frame
        if (sprite) this._applyColor()
        this.onStateChange?.(visualState)
    }

    private _applyColor() {
        const sprite = this._getLiveSprite()
        if (!sprite) return
        const c = this._color
        const cur = sprite.color
        if (!cur) {
            // ponytail: repair Cocos' null renderer color before using its setter.
            const renderer = sprite as Sprite & { _color?: Color | null, _updateColor?: () => void }
            renderer._color = new Color(c.r, c.g, c.b, c.a)
            renderer._updateColor?.()
            return
        }
        if (cur.r !== c.r || cur.g !== c.g || cur.b !== c.b || cur.a !== c.a) {
            sprite.color = new Color(c.r, c.g, c.b, c.a)
        }
    }

    private _getLiveSprite() {
        if (this._sprite?.isValid && this._sprite.node?.isValid) return this._sprite
        this._sprite = null
        return null
    }

    private _applyOffset() {
        const pos = new Vec3()
        Vec3.add(pos, this._originPos, this.pressOffset)
        this.node.setPosition(pos)
    }

    private _releaseOffset() {
        this.node.setPosition(this._originPos)
    }

    private _setCursor(style: string) {
        if (!this.changeCursor) return
        CursorManager.set(style)
    }

    private _setupHitTest() {
        if (this.polygon.length < 3) return

        const uiTransform = this.node.getComponent(UITransform)
        if (!uiTransform) return

        const original = uiTransform.hitTest.bind(uiTransform)
        const self = this
        uiTransform.hitTest = (worldPoint: Vec2, windowId?: number) => {
            if (self.polygon.length < 3) return original(worldPoint, windowId)
            return self._hitTestPointer(worldPoint)
        }
    }

    private _hitTestPointer(screenPoint: Vec2): boolean {
        const uiTransform = this.node.getComponent(UITransform)
        if (!uiTransform) return false

        const localPos = this._screenToNodeLocal(screenPoint, uiTransform)
        if (!localPos) return false

        if (this.polygon.length >= 3) {
            return this._pointInPolygonLocal(localPos.x, localPos.y)
        }

        const width = uiTransform.contentSize.width
        const height = uiTransform.contentSize.height
        const anchor = uiTransform.anchorPoint
        return localPos.x >= -anchor.x * width &&
            localPos.x <= (1 - anchor.x) * width &&
            localPos.y >= -anchor.y * height &&
            localPos.y <= (1 - anchor.y) * height
    }

    private _screenToNodeLocal(screenPoint: Vec2, uiTransform: UITransform): Vec3 | null {
        const localPos = new Vec3()
        const camera = this.node.scene.getComponentInChildren(Camera)
        if (camera) {
            const worldPos = new Vec3()
            camera.screenToWorld(new Vec3(screenPoint.x, screenPoint.y, 0), worldPos)
            uiTransform.convertToNodeSpaceAR(worldPos, localPos)
        } else {
            uiTransform.convertToNodeSpaceAR(new Vec3(screenPoint.x, screenPoint.y, 0), localPos)
        }
        return localPos
    }

    private _pointInPolygonLocal(x: number, y: number): boolean {
        const poly = this.polygon

        let inside = false
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x,
                yi = poly[i].y
            const xj = poly[j].x,
                yj = poly[j].y
            const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            if (intersect) inside = !inside
        }
        return inside
    }
}
