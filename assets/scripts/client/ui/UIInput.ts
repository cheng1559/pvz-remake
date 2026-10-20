import { _decorator, Color, Component, EditBox, EventMouse, Graphics, input, Input, KeyCode, Mask, Node, UITransform, Vec3, type EventKeyboard, type EventTouch } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontMetricsUtil } from '@/client/font'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { UIButton } from './UIButton'
import { UILabel } from './UILabel'

const { ccclass } = _decorator
type PointerEvent = EventMouse | EventTouch
type InputElement = HTMLInputElement | HTMLTextAreaElement

export interface UIInputOptions {
    value?: string
    placeholder?: string
    maxLength?: number
    color?: Color
    filter?: (value: string) => string
    onChange?: (value: string) => void
    onSubmit?: (value: string) => void
    onCancel?: () => void
}

/** Cocos owns text entry/IME/clipboard; the game draws its original bitmap text and selection. */
@ccclass('PvZUIInput')
export class UIInput extends Component {
    private static active: UIInput | null = null
    private static readonly instances = new Set<UIInput>()
    private static readonly hoverClient = {
        cursor: 'text' as const,
        clearHover: () => { if (UIInput.active && !UIInput.active.available()) UIInput.active.blur() },
        refreshHover: (pointer: UIHoverPointer) => !UIButton.hasActivePress && pointer.canHover
            && [...UIInput.instances].some(input => input.available() && input.node.getComponent(UITransform)!.hitTest(pointer.location, pointer.windowId)),
    }
    private options: UIInputOptions = {}
    private font!: BitmapFontAssets
    private native!: EditBox
    private element: InputElement | null = null
    private area!: Node
    private text!: UILabel
    private selectedText!: UILabel
    private selection!: Node
    private ink!: Graphics
    private captureRoot: Node | null = null
    private content = ''
    private anchor = 0
    private caret = 0
    private scroll = 0
    private blink = 0
    private focused = false
    private focusRequested = false
    private dragging = false
    private touchId: number | null = null
    private interactive = true
    private lastPress = { time: 0, x: 0, y: 0 }
    onChange: (value: string) => void = () => {}
    onSubmit: (value: string) => void = () => {}
    onCancel: () => void = () => this.blur()

    static handleKey(event: EventKeyboard): boolean {
        const active = this.active
        if (!active?.available()) return false
        event.propagationStopped = true
        // DOM editing handles these keys before they reach the game. Never treat typing Space as dialog confirmation.
        if (!active.element) {
            if (event.keyCode === KeyCode.ESCAPE) active.onCancel()
            else if (event.keyCode === KeyCode.ENTER) active.submit()
        }
        return true
    }

    initialize(font: BitmapFontAssets, options: UIInputOptions): void {
        this.font = font
        this.options = options
        this.onChange = options.onChange ?? this.onChange
        this.onSubmit = options.onSubmit ?? this.onSubmit
        this.onCancel = options.onCancel ?? this.onCancel
        const size = this.node.getComponent(UITransform)!
        this.area = uiNode({
            name: 'TextClip', parent: this.node, position: { x: 8, y: -4 }, anchor: { x: 0, y: 1 },
            size: { width: size.width - 16, height: size.height - 8 }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        this.ink = uiNode({ parent: this.area, graphics: true }).graphics!
        this.text = new UILabel(this.area, font, { text: '', color: options.color ?? new Color(240, 240, 255) })
        this.selection = uiNode({ parent: this.area, anchor: { x: 0, y: 1 }, mask: Mask.Type.GRAPHICS_RECT }).node
        this.selectedText = new UILabel(this.selection, font, { text: '', color: Color.BLACK })
        const bridge = uiNode({ name: 'Keyboard', parent: this.node, size: { width: 1, height: 1 }, opacity: 0 }).node
        bridge.setScale(0.01, 0.01, 1)
        this.native = bridge.addComponent(EditBox)
        this.native.inputMode = EditBox.InputMode.SINGLE_LINE
        this.native.inputFlag = EditBox.InputFlag.SENSITIVE
        this.native.returnType = EditBox.KeyboardReturnType.DONE
        this.native.maxLength = options.maxLength ?? 65535
        this.native.placeholder = ''
        this.native.backgroundImage = null
        bridge.on(EditBox.EventType.TEXT_CHANGED, this.changed, this)
        bridge.on(EditBox.EventType.EDITING_RETURN, this.submit, this)
        bridge.on(EditBox.EventType.EDITING_DID_ENDED, this.ended, this)
        this.value = options.value ?? ''
    }

    get value(): string { return this.content }
    set value(value: string) {
        this.content = this.sanitize(value)
        this.anchor = this.caret = this.content.length
        this.native.string = this.content
        if (this.element) this.element.value = this.content
        this.syncSelection()
        this.draw()
    }
    get hasFocus(): boolean { return this.focused }
    get interactable(): boolean { return this.interactive }
    set interactable(value: boolean) { this.interactive = value; if (!value) this.blur() }

    focus(): void {
        if (!this.node.activeInHierarchy) { this.focusRequested = true; return }
        if (!this.available()) return
        if (!this.native._impl) { this.scheduleOnce(() => this.focus(), 0); return }
        if (UIInput.active !== this) UIInput.active?.blur()
        UIInput.active = this
        this.focused = true
        this.blink = 0
        this.element = (this.native._impl as { _edTxt?: InputElement } | null)?._edTxt ?? null
        if (this.element) {
            const element = this.element
            element.style.opacity = '0'
            element.style.pointerEvents = 'none'
            element.autocomplete = 'off'
            element.spellcheck = false
            element.addEventListener('keydown', this.domKey, true)
            // EditBox calls DOM focus() without options; keep its editing lifecycle without scrolling the page.
            const focus = element.focus
            element.focus = options => focus.call(element, { ...options, preventScroll: true })
            try { this.native.focus() } finally { element.focus = focus }
        } else this.native.focus()
        ;(globalThis as { jsb?: { hideInputBoxAccessory?: () => boolean } }).jsb?.hideInputBoxAccessory?.()
        this.syncSelection()
        this.draw()
    }

    blur(): void {
        this.element?.removeEventListener('keydown', this.domKey, true)
        this.element = null
        this.ended()
        this.native?.blur()
    }

    selectAll(): void { this.anchor = 0; this.caret = this.content.length; this.syncSelection(); this.draw() }

    onEnable(): void {
        UIInput.instances.add(this)
        UIHoverManager.registerClient(UIInput.hoverClient)
        for (let node: Node | null = this.node; node; node = node.parent) if (node.getComponent(UITransform)) this.captureRoot = node
        this.listen(true)
        if (this.focusRequested) { this.focusRequested = false; this.scheduleOnce(() => this.focus(), 0) }
    }

    onDisable(): void {
        this.blur()
        this.listen(false)
        UIInput.instances.delete(this)
        if (!UIInput.instances.size) UIHoverManager.unregisterClient(UIInput.hoverClient)
        this.captureRoot = null
        UIHoverManager.refreshHoverStates()
    }

    private listen(enabled: boolean): void {
        const method = enabled ? 'on' : 'off'
        this.node[method](Node.EventType.MOUSE_DOWN, this.mouseDown, this)
        this.node[method](Node.EventType.TOUCH_START, this.touchStart, this)
        for (const [event, handler] of [
            [Node.EventType.MOUSE_DOWN, this.outside], [Node.EventType.TOUCH_START, this.outside],
            [Node.EventType.MOUSE_MOVE, this.move], [Node.EventType.MOUSE_UP, this.release],
            [Node.EventType.TOUCH_MOVE, this.move], [Node.EventType.TOUCH_END, this.release], [Node.EventType.TOUCH_CANCEL, this.release],
        ] as const) this.captureRoot?.[method](event, handler, this, true)
        input[method](Input.EventType.MOUSE_MOVE, this.move, this)
        input[method](Input.EventType.MOUSE_UP, this.release, this)
    }

    private available(): boolean {
        const modal = UIHoverManager.activeModalRoot
        return this.interactive && this.enabledInHierarchy && this.node.activeInHierarchy && !UIHoverManager.isInputBlocked
            && (!modal || this.node === modal || this.node.isChildOf(modal))
    }

    private sanitize(value: string): string {
        const line = value.split(/[\r\n]/, 1)[0]
        return Array.from(this.options.filter?.(line) ?? line).slice(0, this.options.maxLength ?? 65535).join('')
    }

    private changed(): void {
        const raw = this.native.string
        const from = this.element?.selectionStart ?? raw.length, to = this.element?.selectionEnd ?? raw.length
        const next = this.sanitize(raw)
        this.anchor = this.sanitize(raw.slice(0, from)).length
        this.caret = this.sanitize(raw.slice(0, to)).length
        const changed = next !== this.content
        this.content = next
        if (raw !== next) {
            this.native.string = next
            if (this.element) this.element.value = next
            this.syncSelection()
        }
        this.blink = 0
        this.draw()
        if (changed) this.onChange(next)
    }

    private syncSelection(): void {
        this.element?.setSelectionRange(Math.min(this.anchor, this.caret), Math.max(this.anchor, this.caret), this.caret < this.anchor ? 'backward' : 'forward')
        this.blink = 0
    }

    private readonly domKey = (event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.isComposing) { if (event.key === 'Enter') event.stopImmediatePropagation(); return }
        if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault()
            event.stopImmediatePropagation()
            if (!this.available()) return
            if (event.key === 'Enter') this.submit()
            else if (event.key === 'Escape') this.onCancel()
            else {
                const inputs = [...UIInput.instances].filter(input => input.available())
                inputs[(inputs.indexOf(this) + (event.shiftKey ? inputs.length - 1 : 1)) % inputs.length]?.focus()
            }
        }
    }

    private submit(): void { if (this.focused && this.available()) this.onSubmit(this.value) }
    private ended(): void {
        if (UIInput.active === this) UIInput.active = null
        this.focused = this.dragging = false
        this.touchId = null
        if (this.text) this.draw()
    }

    private outside(event: PointerEvent): void {
        if (this.focused && !this.node.getComponent(UITransform)!.hitTest(event.getLocation(), event.windowId)) this.blur()
    }
    private mouseDown(event: EventMouse): void {
        if (!GameDebugSettings.isMobileMode() && event.getButton() === EventMouse.BUTTON_LEFT) this.press(event)
    }
    private touchStart(event: EventTouch): void {
        if (!GameDebugSettings.isMobileMode()) return
        this.touchId = event.touch!.getID()
        this.press(event)
    }
    private press(event: PointerEvent): void {
        if (!this.available()) return
        event.propagationStopped = true
        this.focus()
        const point = event.getUILocation(), now = Date.now()
        const double = this.anchor === this.caret && now - this.lastPress.time <= 500
            && (point.x - this.lastPress.x) ** 2 + (point.y - this.lastPress.y) ** 2 <= 36
        this.lastPress = { time: now, x: point.x, y: point.y }
        this.dragging = !double
        if (double) this.selectAll()
        else { this.anchor = this.caret = this.indexAt(event); this.syncSelection(); this.draw() }
    }
    private move(event: PointerEvent): void {
        if (!this.dragging || !this.matches(event)) return
        this.caret = this.indexAt(event)
        this.syncSelection()
        this.draw()
    }
    private release(event: PointerEvent): void {
        if (event instanceof EventMouse && event.getButton() !== EventMouse.BUTTON_LEFT) return
        if (this.matches(event)) { this.dragging = false; this.touchId = null }
    }
    private matches(event: PointerEvent): boolean {
        return GameDebugSettings.isMobileMode() ? 'touch' in event && event.touch?.getID() === this.touchId : event instanceof EventMouse
    }
    private indexAt(event: PointerEvent): number {
        const p = event.getUILocation()
        const x = this.area.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y)).x - 4 + this.scroll
        let index = 0, previous = 0
        for (const char of this.content) {
            const end = index + char.length, width = this.measure(end)
            if (x < (previous + width) / 2) return index
            previous = width
            index = end
        }
        return index
    }
    private measure(end: number): number { return FontMetricsUtil.measureTextWidth(this.font.config, this.content.slice(0, end)) }

    protected update(dt: number): void {
        if (this.focused && !this.available()) { this.blur(); return }
        if (!this.focused) return
        if (this.element) {
            const from = this.element.selectionStart ?? this.content.length, to = this.element.selectionEnd ?? from
            const caret = this.element.selectionDirection === 'backward' ? from : to
            const anchor = caret === from ? to : from
            if (caret !== this.caret || anchor !== this.anchor) { this.caret = caret; this.anchor = anchor; this.blink = 0 }
        }
        this.blink += gameClock.delta(dt)
        this.draw()
    }

    private draw(): void {
        const { width, height } = this.area.getComponent(UITransform)!
        const caretX = this.measure(this.caret)
        this.scroll = Math.max(0, Math.min(this.scroll, caretX))
        this.scroll = Math.max(this.scroll, caretX - width + 8)
        const metrics = FontMetricsUtil.getMetrics(this.font.config)
        const y = (metrics.height - height) / 2
        const selectionHeight = Math.min(metrics.height, height)
        const shown = this.content || (!this.focused ? this.options.placeholder ?? '' : '')
        if (this.text.text !== shown) this.text.text = shown
        this.text.node.setPosition(4 - this.scroll, y)
        this.ink.clear()
        this.selection.active = this.focused && this.anchor !== this.caret
        if (this.selection.active) {
            const left = this.measure(Math.min(this.anchor, this.caret)), right = this.measure(Math.max(this.anchor, this.caret))
            this.ink.fillColor = Color.WHITE
            this.ink.fillRect(4 + left - this.scroll, y - selectionHeight, right - left, selectionHeight)
            this.selection.setPosition(4 + left - this.scroll, y)
            this.selection.getComponent(UITransform)!.setContentSize(right - left, selectionHeight)
            if (this.selectedText.text !== this.content) this.selectedText.text = this.content
            this.selectedText.node.setPosition(-left, 0)
        } else if (this.focused && Math.floor(this.blink / 0.15) % 2 === 0) {
            this.ink.fillColor = this.options.color ?? new Color(240, 240, 255)
            this.ink.fillRect(4 + caretX - this.scroll, y - selectionHeight, 2, selectionHeight)
        }
    }
}
