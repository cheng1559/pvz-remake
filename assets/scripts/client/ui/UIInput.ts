import { _decorator, Color, Component, EditBox, EventMouse, game, Graphics, input, Input, KeyCode, Mask, Node, sys, UITransform, Vec3, type EventKeyboard, type EventTouch } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontMetricsUtil } from '@/client/font'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { UIButton } from './UIButton'
import { UILabel } from './UILabel'

const { ccclass } = _decorator
type PointerEvent = EventMouse | EventTouch
type InputElement = HTMLInputElement | HTMLTextAreaElement
type NativeInputBox = {
    showInputBox?: (options: Record<string, unknown>) => void
    setInputBoxText?: (text: string, start: number, end: number) => void
    getInputBoxSelection?: () => { start: number, end: number } | null
    onInputBoxKey?: (key: string, shift: boolean) => boolean
    hideInputBoxAccessory?: () => boolean
}
const nativeInputBox = () => (globalThis as { jsb?: NativeInputBox }).jsb

export interface UIInputOptions {
    value?: string
    placeholder?: string
    maxLength?: number
    /** iOS keyboard layout; the game's text fields default to ASCII. */
    keyboardType?: 'default' | 'ascii' | 'email' | 'number' | 'url'
    /** iOS text corrections and smart substitutions; off by default. */
    autocorrect?: boolean
    color?: Color
    filter?: (value: string) => string
    onChange?: (value: string) => void
    onSubmit?: (value: string) => void
    onCancel?: () => void
    onKey?: (key: string, shift: boolean) => boolean
    completion?: (value: string) => string
}

/** Cocos owns text entry/IME/clipboard; the game draws its original bitmap text and selection. */
@ccclass('PvZUIInput')
export class UIInput extends Component {
    private static active: UIInput | null = null
    private static readonly instances = new Set<UIInput>()
    private static readonly nativeHandledKeys = new Set<number>()
    static get hasFocusedInput(): boolean { return !!this.active?.available() }
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
    private completionText!: UILabel
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
        // AppKit can submit and close the input before SDL delivers the same key to the next dialog.
        if (this.nativeHandledKeys.has(event.keyCode)) { event.propagationStopped = true; return true }
        const active = this.active
        if (!active?.available()) return false
        event.propagationStopped = true
        // DOM editing handles these keys before they reach the game. Never treat typing Space as dialog confirmation.
        if (!active.element && nativeInputBox()?.onInputBoxKey !== active.nativeKey) {
            const key = ({ 9: 'Tab', 38: 'ArrowUp', 40: 'ArrowDown' } as Record<number, string>)[event.keyCode]
            if (key) active.key(key, false)
            else if (event.keyCode === KeyCode.ESCAPE) active.key('Escape', false)
            else if (event.keyCode === KeyCode.ENTER) active.key('Enter', false)
        }
        return true
    }

    static handleKeyUp(event: EventKeyboard): void { this.nativeHandledKeys.delete(event.keyCode) }

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
        this.completionText = new UILabel(this.area, font, { text: '', color: new Color(240, 240, 255, 95) })
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
    get hasSelection(): boolean { return this.anchor !== this.caret }
    get cursorPosition(): number { return this.caret }
    set color(value: Color) { this.options.color = value; this.text.color = value; this.draw() }
    get interactable(): boolean { return this.interactive }
    set interactable(value: boolean) { this.interactive = value; if (!value) this.blur() }

    focus(): void {
        if (!this.node.activeInHierarchy) { this.focusRequested = true; return }
        if (!this.available()) return
        if (this.focused) { this.blink = 0; return }
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
        } else {
            const box = nativeInputBox()
            if (box && 'onInputBoxKey' in box) box.onInputBoxKey = this.nativeKey
            const show = box?.showInputBox
            if (box && show && sys.isNative && sys.os === sys.OS.IOS) {
                // Scope traits to this focus call, as with the DOM focus options above.
                box.showInputBox = options => show.call(box, {
                    ...options,
                    inputType: this.options.keyboardType === 'default' ? 'text' : this.options.keyboardType ?? 'ascii',
                    autocorrect: this.options.autocorrect ?? false,
                })
                try { this.native.focus() } finally { box.showInputBox = show }
            } else this.native.focus()
        }
        nativeInputBox()?.hideInputBoxAccessory?.()
        this.syncSelection()
        this.draw()
    }

    blur(): void {
        const restoreGameFocus = this.focused && this.element !== null
        this.element?.removeEventListener('keydown', this.domKey, true)
        this.element = null
        this.ended()
        this.native?.blur()
        if (restoreGameFocus) game.canvas?.focus({ preventScroll: true })
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
        // Characters the bitmap font cannot draw are dropped, whatever the caller's filter allows.
        return Array.from(this.options.filter?.(line) ?? line)
            .filter(char => FontMetricsUtil.hasGlyph(this.font.config, char))
            .slice(0, this.options.maxLength ?? 65535).join('')
    }

    private changed(): void {
        const raw = this.native.string
        const range = !this.element ? nativeInputBox()?.getInputBoxSelection?.() : null
        const from = this.element?.selectionStart ?? range?.start ?? raw.length
        const to = this.element?.selectionEnd ?? range?.end ?? raw.length
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
        if (this.focused && !this.element) nativeInputBox()?.setInputBoxText?.(this.content, this.anchor, this.caret)
        this.blink = 0
    }

    private key(key: string, shift: boolean): boolean {
        if (!this.available()) return false
        if (this.options.onKey?.(key, shift)) return true
        if (key === 'Enter') this.submit()
        else if (key === 'Escape') this.onCancel()
        else if (key === 'Tab') {
            const inputs = [...UIInput.instances].filter(input => input.available())
            inputs[(inputs.indexOf(this) + (shift ? inputs.length - 1 : 1)) % inputs.length]?.focus()
        } else return false
        return true
    }

    private readonly nativeKey = (key: string, shift: boolean): boolean => {
        if (!this.focused) return false
        this.readSelection()
        const handled = this.key(key, shift)
        const code = ({ Tab: 9, Enter: KeyCode.ENTER, Escape: KeyCode.ESCAPE, ArrowUp: 38, ArrowDown: 40 } as Record<string, number>)[key]
        if (handled && code !== undefined) UIInput.nativeHandledKeys.add(code)
        return handled
    }

    private readonly domKey = (event: KeyboardEvent) => {
        event.stopPropagation()
        if (event.isComposing) { if (event.key === 'Enter') event.stopImmediatePropagation(); return }
        if (this.key(event.key, event.shiftKey)) {
            event.preventDefault()
            event.stopImmediatePropagation()
        }
    }

    private submit(): void { if (this.focused && this.available()) this.onSubmit(this.value) }
    private ended(): void {
        const box = nativeInputBox()
        if (box?.onInputBoxKey === this.nativeKey) box.onInputBoxKey = undefined
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

    private readSelection(): void {
        if (this.element) {
            const from = this.element.selectionStart ?? this.content.length, to = this.element.selectionEnd ?? from
            const caret = this.element.selectionDirection === 'backward' ? from : to
            const anchor = caret === from ? to : from
            if (caret !== this.caret || anchor !== this.anchor) { this.caret = caret; this.anchor = anchor; this.blink = 0 }
        } else {
            // Native boxes report an ordered range; keep the anchor on whichever end it still matches.
            const range = nativeInputBox()?.getInputBoxSelection?.()
            if (range && (range.start !== Math.min(this.anchor, this.caret) || range.end !== Math.max(this.anchor, this.caret))) {
                const backward = range.end === this.anchor && range.start !== this.anchor
                this.anchor = backward ? range.end : range.start
                this.caret = backward ? range.start : range.end
                this.blink = 0
            }
        }
    }

    protected update(dt: number): void {
        if (this.focused && !this.available()) { this.blur(); return }
        if (!this.focused) return
        this.readSelection()
        this.blink += dt
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
        const completion = this.focused && !this.hasSelection && this.caret === this.content.length ? this.options.completion?.(this.content) ?? '' : ''
        if (this.completionText.text !== completion) this.completionText.text = completion
        this.completionText.node.setPosition(4 + this.measure(this.content.length) - this.scroll, y)
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
