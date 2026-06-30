import {
    Color,
    EditBox,
    EventMouse,
    EventTouch,
    Graphics,
    Mask,
    Node,
    sys,
    UIOpacity,
    UITransform,
    Vec3,
} from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { CursorManager } from '@/ui/CursorManager'
import { createUINode, setUISize } from '@/ui/UIFactory'
import type { Label } from 'cc'

export function configureSingleLineEditBox(args: {
    editBox: EditBox
    maxLength: number
    textLabel?: Label | null
    placeholderLabel?: Label | null
    value?: string
}) {
    const editBox = args.editBox
    editBox.inputMode = EditBox.InputMode.SINGLE_LINE
    editBox.inputFlag = EditBox.InputFlag.SENSITIVE
    editBox.returnType = EditBox.KeyboardReturnType.DONE
    editBox.maxLength = args.maxLength
    editBox.placeholder = ''
    editBox.backgroundImage = null
    if (args.textLabel) editBox.textLabel = args.textLabel
    if (args.placeholderLabel) editBox.placeholderLabel = args.placeholderLabel
    if (args.value != null) editBox.string = args.value
}

const NATIVE_TEXT_INPUT_SIZE = 1
const NATIVE_TEXT_INPUT_SCALE = 0.01
const ORIGINAL_FRAME_SECONDS = 0.01
const ORIGINAL_BLINK_DELAY_UPDATES = 14
const CURSOR_BLINK_SECONDS = ORIGINAL_FRAME_SECONDS * (ORIGINAL_BLINK_DELAY_UPDATES + 1)
const CURSOR_CLIP_WIDTH = 2
const DOUBLE_CLICK_MS = 500
const DOUBLE_CLICK_DISTANCE_SQ = 36

export enum TextInputKeyCode {
    Tab = 9,
    Backspace = 8,
    Enter = 13,
    Escape = 27,
    Space = 32,
    End = 35,
    Home = 36,
    Left = 37,
    Up = 38,
    Right = 39,
    Down = 40,
    Delete = 46,
    Digit0 = 48,
    Digit9 = 57,
    A = 65,
    Z = 90,
    Numpad0 = 96,
    Numpad9 = 105,
    NumpadMultiply = 106,
    NumpadAdd = 107,
    NumpadSubtract = 109,
    NumpadDecimal = 110,
    NumpadDivide = 111,
    Semicolon = 186,
    Equal = 187,
    Comma = 188,
    Minus = 189,
    Period = 190,
    Slash = 191,
    Backquote = 192,
    BracketLeft = 219,
    Backslash = 220,
    BracketRight = 221,
    Quote = 222,
}

export interface TextInputKey {
    keyCode: number
    rawEvent?: {
        key?: string
        ctrlKey?: boolean
    }
}

interface NativeEditBoxElementHost {
    _impl?: {
        _edTxt?: HTMLInputElement | HTMLTextAreaElement | null
    }
}

interface MobilePageScrollState {
    htmlOverflow: string
    htmlOverscrollBehavior: string
    bodyOverflow: string
    bodyOverscrollBehavior: string
    bodyTouchAction: string
}

interface NativeBridge {
    hideKeyboardAccessory?: () => boolean
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        PvzNative?: NativeBridge
    }
}

export interface SelfDrawTextInputOptions {
    root: Node
    parent: Node
    width: number
    height: number
    font: BitmapFontAssets | null
    maxLength: number
    value?: string
    textColor: Color
    completionColor?: Color
    selectionTextColor?: Color
    selectionColor?: Color
    textX?: number
    textRight?: number
    textTopY?: number
    enforceMaxPixels?: boolean
    nativeName?: string
    isActive?: () => boolean
    isAllowedChar?: (char: string) => boolean
    sanitizeText?: (text: string) => string
    getCompletionSuffix?: () => string
    acceptCompletion?: () => boolean
    onBeforeKey?: (event: TextInputKey) => void
    onSpecialKey?: (event: TextInputKey, input: SelfDrawTextInput) => boolean
    onBeforeEdit?: () => void
    onChange?: (value: string, userEdit: boolean) => void
    onReturn?: () => void
}

export class SelfDrawTextInput {
    private _root: Node
    private _parent: Node
    private _font: BitmapFontAssets | null
    private _textNode: Node | null = null
    private _textRenderer: FontRenderer | null = null
    private _completionNode: Node | null = null
    private _completionRenderer: FontRenderer | null = null
    private _selectionNode: Node | null = null
    private _selectionGraphics: Graphics | null = null
    private _selectionTextClip: Node | null = null
    private _selectionTextNode: Node | null = null
    private _selectionTextRenderer: FontRenderer | null = null
    private _nativeTextInput: EditBox | null = null
    private _syncingNativeTextInput = false
    private _domKeyDownListener: ((event: KeyboardEvent) => void) | null = null
    private _draggingSelection = false
    private _cursorVisible = true
    private _cursorBlinkElapsed = 0
    private _text = ''
    private _undoText = ''
    private _undoCursor = 0
    private _undoHilitePos = -1
    private _lastModifyIdx = 0
    private _cursorPos = 0
    private _hilitePos = -1
    private _leftPos = 0
    private _hasInputFocus = true
    private _mobilePageScrollState: MobilePageScrollState | null = null
    private _mobilePageScrollLocked = false
    private _mobilePageScrollX = 0
    private _mobilePageScrollY = 0
    private _lastPointerDownTime = 0
    private _lastPointerDownX = 0
    private _lastPointerDownY = 0
    private readonly _mobilePageScrollBlocker = (event: Event) => event.preventDefault()
    private readonly _mobilePageScrollRestorer = () => this._restoreMobilePageScroll()

    constructor(private readonly _options: SelfDrawTextInputOptions) {
        this._root = _options.root
        this._parent = _options.parent
        this._font = _options.font
        this._text = this._sanitizeText(_options.value ?? '')
        this._cursorPos = this._text.length
        this._lastModifyIdx = this._cursorPos
        this._render()
        this._bindInputPointerEvents()
        this._bindDomKeyboardEvents()
        this.showCursorNow()
    }

    get value() {
        return this._text
    }

    get cursorPos() {
        return this._cursorPos
    }

    get hasSelection() {
        return this._hasSelection()
    }

    get hasFocus() {
        return this._hasInputFocus
    }

    update(dt: number) {
        if (!this._hasInputFocus) return

        this._cursorBlinkElapsed += dt
        if (this._cursorBlinkElapsed < CURSOR_BLINK_SECONDS) return

        this._cursorBlinkElapsed = 0
        this._cursorVisible = !this._cursorVisible
        this._refreshSelection()
    }

    destroy() {
        this._draggingSelection = false
        this._setCanvasCursor('')
        this._unbindDomKeyboardEvents()
        this._unbindInputPointerEvents()
        const nativeInputNode = this._nativeTextInput?.node
        if (nativeInputNode?.isValid) {
            nativeInputNode.off(EditBox.EventType.TEXT_CHANGED, this._onNativeTextInputChanged, this)
            nativeInputNode.off(EditBox.EventType.EDITING_RETURN, this._onNativeTextInputReturn, this)
            this._nativeTextInput?.blur()
        }
        this._unlockMobilePageScroll()
        this._nativeTextInput = null
    }

    focus() {
        this._setInputFocus(true)
    }

    blur() {
        this._setInputFocus(false)
    }

    setValue(value: string, cursorPos = value.length, userEdit = false) {
        this._text = this._sanitizeText(value)
        this._cursorPos = Math.max(0, Math.min(cursorPos, this._text.length))
        this._hilitePos = -1
        this._leftPos = Math.min(this._leftPos, this._text.length)
        this._focusCursor(true)
        this._refreshInputText()
        this._options.onChange?.(this._text, userEdit)
    }

    setTextColor(color: Color) {
        if (!this._textRenderer || this._textRenderer.fontColor.equals(color)) return
        this._textRenderer.fontColor = color
        this._textRenderer.forceRebuild()
    }

    showCursorNow() {
        this._cursorBlinkElapsed = 0
        this._cursorVisible = true
        this._refreshInputText()
    }

    handleDialogKeyDown(event: TextInputKey) {
        if (!this._hasInputFocus) return false
        if (sys.isMobile && this._nativeTextInput?.node?.isValid) return false
        if (this._domKeyDownListener) return false
        return this.handleInputKey(event)
    }

    handleGlobalPointer(event: EventMouse | EventTouch) {
        if (!this._root.isValid) {
            this._setInputFocus(false)
            return
        }

        const transform = this._root.getComponent(UITransform)
        if (!transform) return

        const uiLocation = event.getUILocation()
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0))
        const width = transform.contentSize.width
        const height = transform.contentSize.height
        this._setInputFocus(
            local.x >= -width / 2 &&
                local.x <= width / 2 &&
                local.y >= -height / 2 &&
                local.y <= height / 2,
        )
    }

    handleInputKey(event: TextInputKey) {
        this._options.onBeforeKey?.(event)

        if (this._options.onSpecialKey?.(event, this)) {
            return true
        }

        if (event.rawEvent?.ctrlKey && this._handleShortcutKey(event)) {
            return true
        }

        if (event.rawEvent?.ctrlKey && this._isUndoKey(event)) {
            const swapText = this._text
            const swapCursor = this._cursorPos
            const swapHilitePos = this._hilitePos
            this._text = this._undoText
            this._cursorPos = this._undoCursor
            this._hilitePos = this._undoHilitePos
            this._undoText = swapText
            this._undoCursor = swapCursor
            this._undoHilitePos = swapHilitePos
            this._lastModifyIdx = -1
            this._focusCursor(true)
            this._options.onChange?.(this._text, true)
            this.showCursorNow()
            return true
        }

        switch (event.keyCode) {
            case TextInputKeyCode.Backspace:
                if (this._deleteSelectionWithUndo()) return this._afterEdit(false)
                if (this._cursorPos > 0) {
                    const oldText = this._text
                    const oldCursor = this._cursorPos
                    this._beforeEdit()
                    this._text = this._text.slice(0, this._cursorPos - 1) + this._text.slice(this._cursorPos)
                    this._cursorPos--
                    if (this._cursorPos !== this._lastModifyIdx) {
                        this._setUndoSnapshot(oldText, oldCursor)
                    }
                    this._lastModifyIdx = this._cursorPos - 1
                    return this._afterEdit(false)
                }
                return true
            case TextInputKeyCode.Delete:
                if (this._deleteSelectionWithUndo()) return this._afterEdit(false)
                if (this._cursorPos < this._text.length) {
                    const oldText = this._text
                    const oldCursor = this._cursorPos
                    this._beforeEdit()
                    this._text = this._text.slice(0, this._cursorPos) + this._text.slice(this._cursorPos + 1)
                    if (this._cursorPos !== this._lastModifyIdx) {
                        this._setUndoSnapshot(oldText, oldCursor)
                    }
                    this._lastModifyIdx = this._cursorPos
                    return this._afterEdit(false)
                }
                return true
            case TextInputKeyCode.Left:
                if (this._hasSelection()) {
                    this._cursorPos = this._selectionStart()
                    this._hilitePos = -1
                } else if (event.rawEvent?.ctrlKey) {
                    this._moveCursorToPreviousWord()
                } else {
                    this._cursorPos = Math.max(0, this._cursorPos - 1)
                }
                this._focusCursor(true)
                this.showCursorNow()
                return true
            case TextInputKeyCode.Right:
                if (this._hasSelection()) {
                    this._cursorPos = this._selectionEnd()
                    this._hilitePos = -1
                } else if (event.rawEvent?.ctrlKey) {
                    this._moveCursorToNextWord()
                } else if (this._cursorPos === this._text.length && this._options.acceptCompletion?.()) {
                    return true
                } else {
                    this._cursorPos = Math.min(this._text.length, this._cursorPos + 1)
                }
                this._focusCursor(true)
                this.showCursorNow()
                return true
            case TextInputKeyCode.Home:
                this._cursorPos = 0
                this._hilitePos = -1
                this._focusCursor(true)
                this.showCursorNow()
                return true
            case TextInputKeyCode.End:
                this._cursorPos = this._text.length
                this._hilitePos = -1
                this._focusCursor(true)
                this.showCursorNow()
                return true
        }

        const char = this._eventToInputChar(event)
        if (!char || (!this._hasSelection() && this._text.length >= this._options.maxLength)) return false

        this._insertText(char)
        return true
    }

    insertText(text: string) {
        const sanitized = this._sanitizeText(text)
        if (!sanitized) return
        this._insertText(sanitized)
    }

    selectAll() {
        if (this._text.length === 0) return

        this._hilitePos = 0
        this._cursorPos = this._text.length
        this._leftPos = 0
        this._focusCursor(true)
        this.showCursorNow()
    }

    private _render() {
        this._createNativeTextInput()

        this._textNode = createUINode('TextInputText', {
            parent: this._parent,
            anchorX: 0,
            anchorY: 1,
            width: this._options.width,
            height: this._options.height,
            x: this._inputTextX(),
            y: this._inputTextTopY(),
        })
        this._textRenderer = this._textNode.addComponent(FontRenderer)
        if (this._font) this._textRenderer.setFontAssets(this._font)
        this._textRenderer.fontColor = this._options.textColor
        this._textRenderer.maxWidth = this._inputTextMaxWidth()

        this._completionNode = createUINode('TextInputCompletionText', {
            parent: this._parent,
            active: false,
            anchorX: 0,
            anchorY: 1,
            width: this._options.width,
            height: this._options.height,
            x: this._inputTextX(),
            y: this._inputTextTopY(),
        })
        this._completionRenderer = this._completionNode.addComponent(FontRenderer)
        if (this._font) this._completionRenderer.setFontAssets(this._font)
        this._completionRenderer.fontColor = this._options.completionColor ?? new Color(240, 240, 255, 95)
        this._completionRenderer.maxWidth = 0

        this._selectionNode = createUINode('TextInputSelection', {
            parent: this._parent,
            anchorX: 0,
            anchorY: 0.5,
            width: this._options.width,
            height: this._options.height,
            x: this._inputTextX(),
            y: 0,
        })
        this._selectionGraphics = this._selectionNode.addComponent(Graphics)

        this._selectionTextClip = createUINode('TextInputSelectionTextClip', {
            parent: this._parent,
            active: false,
            anchorX: 0,
            anchorY: 0.5,
            width: 1,
            height: this._options.height,
            x: this._inputTextX(),
            y: 0,
        })
        this._selectionTextClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        this._selectionTextNode = createUINode('TextInputSelectionText', {
            parent: this._selectionTextClip,
            anchorX: 0,
            anchorY: 1,
            width: this._options.width,
            height: this._options.height,
            x: 0,
            y: this._inputTextTopY(),
        })
        this._selectionTextRenderer = this._selectionTextNode.addComponent(FontRenderer)
        if (this._font) this._selectionTextRenderer.setFontAssets(this._font)
        this._selectionTextRenderer.fontColor = this._options.selectionTextColor ?? new Color(0, 0, 0, 255)
        this._selectionTextRenderer.maxWidth = this._inputTextMaxWidth()
    }

    private _createNativeTextInput() {
        if (!sys.isMobile) return

        const node = createUINode(this._options.nativeName ?? 'NativeTextInput', {
            parent: this._parent,
            anchorX: 0.5,
            anchorY: 0.5,
            width: NATIVE_TEXT_INPUT_SIZE,
            height: NATIVE_TEXT_INPUT_SIZE,
        })
        this._hideNativeTextInputNode(node)
        node.addComponent(UIOpacity).opacity = 0

        const editBox = node.addComponent(EditBox)
        configureSingleLineEditBox({
            editBox,
            maxLength: this._options.maxLength,
            value: this._text,
        })
        node.on(EditBox.EventType.TEXT_CHANGED, this._onNativeTextInputChanged, this)
        node.on(EditBox.EventType.EDITING_RETURN, this._onNativeTextInputReturn, this)
        this._nativeTextInput = editBox
        this._configureNativeTextInputElement()
        this._hideNativeKeyboardAccessory()
    }

    private _hideNativeTextInputNode(node: Node) {
        node.setPosition(0, 0, 0)
        node.setScale(NATIVE_TEXT_INPUT_SCALE, NATIVE_TEXT_INPUT_SCALE, 1)
        setUISize(node, NATIVE_TEXT_INPUT_SIZE, NATIVE_TEXT_INPUT_SIZE, 0.5, 0.5)
    }

    private _focusNativeTextInput() {
        if (!this._nativeTextInput?.node?.isValid) return
        if (!this._hasInputFocus) return

        this._lockMobilePageScroll()
        this._syncNativeTextInput()
        this._configureNativeTextInputElement()
        this._nativeTextInput.focus()
        this._hideNativeKeyboardAccessory()
        this._syncNativeTextInputSelection()
        this._restoreMobilePageScroll()
    }

    private _configureNativeTextInputElement() {
        const element = this._nativeTextInputElement()
        if (!element) return

        element.autocomplete = 'off'
        element.autocapitalize = 'off'
        element.inputMode = 'latin'
        element.lang = 'en'
        element.pattern = '[\\x20-\\x7E]*'
        element.spellcheck = false
        element.setAttribute('autocapitalize', 'off')
        element.setAttribute('autocorrect', 'off')
        element.setAttribute('autocomplete', 'off')
        element.setAttribute('inputmode', 'latin')
        element.setAttribute('lang', 'en')
        element.setAttribute('pattern', '[\\x20-\\x7E]*')
        element.setAttribute('spellcheck', 'false')
    }

    private _nativeTextInputElement() {
        return (this._nativeTextInput as NativeEditBoxElementHost | null)?._impl?._edTxt ?? null
    }

    private _hideNativeKeyboardAccessory() {
        if (!sys.isNative || !sys.isMobile) return
        const bridge = (globalThis as NativeBindings).jsb?.PvzNative
        bridge?.hideKeyboardAccessory?.()
    }

    private _blurNativeTextInput() {
        if (this._nativeTextInput?.node?.isValid) {
            this._nativeTextInput.blur()
        }
        this._unlockMobilePageScroll()
    }

    private _syncNativeTextInput() {
        if (!this._nativeTextInput?.node?.isValid) return

        if (this._nativeTextInput.string !== this._text) {
            this._syncingNativeTextInput = true
            this._nativeTextInput.string = this._text
            this._syncingNativeTextInput = false
        }
        this._syncNativeTextInputSelection()
    }

    private _syncNativeTextInputSelection() {
        const element = this._nativeTextInputElement()
        if (!element?.setSelectionRange) return

        const start = this._hasSelection() ? this._selectionStart() : this._cursorPos
        const end = this._hasSelection() ? this._selectionEnd() : this._cursorPos
        try {
            element.setSelectionRange(this._clampNativeTextInputPosition(start), this._clampNativeTextInputPosition(end))
        } catch {
            return
        }
    }

    private _readNativeTextInputSelection(textLength: number) {
        const element = this._nativeTextInputElement()
        const start = this._clampNativeTextInputPosition(element?.selectionStart ?? textLength, textLength)
        const end = this._clampNativeTextInputPosition(element?.selectionEnd ?? start, textLength)
        return {
            cursorPos: end,
            hilitePos: start === end ? -1 : start,
        }
    }

    private _clampNativeTextInputPosition(position: number, textLength = this._text.length) {
        return Math.max(0, Math.min(textLength, position))
    }

    private _onNativeTextInputChanged(editBox: EditBox) {
        if (this._syncingNativeTextInput) return
        if (!this._hasInputFocus) return

        const sanitized = this._sanitizeText(editBox.string)
        const selection = this._readNativeTextInputSelection(sanitized.length)
        if (sanitized !== editBox.string) {
            this._syncingNativeTextInput = true
            editBox.string = sanitized
            this._syncingNativeTextInput = false
        }
        this._replaceFromNativeTextInput(sanitized, selection.cursorPos, selection.hilitePos)
    }

    private _onNativeTextInputReturn() {
        if (this._isActive()) this._options.onReturn?.()
    }

    private _replaceFromNativeTextInput(text: string, cursorPos: number, hilitePos: number) {
        const clampedCursorPos = this._clampNativeTextInputPosition(cursorPos, text.length)
        const clampedHilitePos = hilitePos === -1 ? -1 : this._clampNativeTextInputPosition(hilitePos, text.length)
        if (text === this._text && clampedCursorPos === this._cursorPos && clampedHilitePos === this._hilitePos) {
            return
        }

        const oldText = this._text
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._beforeEdit()
        this._text = text
        this._cursorPos = clampedCursorPos
        this._hilitePos = clampedHilitePos
        if (text !== oldText) this._setUndoSnapshot(oldText, oldCursor, oldHilitePos)
        this._lastModifyIdx = this._cursorPos
        this._enforceLimits()
        this._cursorPos = Math.min(this._cursorPos, this._text.length)
        if (this._hilitePos !== -1) this._hilitePos = Math.min(this._hilitePos, this._text.length)
        this._focusCursor(false)
        this._options.onChange?.(this._text, true)
        this.showCursorNow()
    }

    private _insertText(text: string) {
        if (!text || (!this._hasSelection() && this._text.length >= this._options.maxLength)) return

        const oldText = this._text
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._beforeEdit()
        if (this._hasSelection()) {
            const start = this._selectionStart()
            const end = this._selectionEnd()
            this._text = this._text.slice(0, start) + text + this._text.slice(end)
            this._cursorPos = start
            this._hilitePos = -1
        } else {
            this._text = this._text.slice(0, this._cursorPos) + text + this._text.slice(this._cursorPos)
        }
        this._text = this._sanitizeText(this._text)
        if (this._cursorPos !== this._lastModifyIdx + 1) {
            this._setUndoSnapshot(oldText, oldCursor, oldHilitePos)
        }
        this._lastModifyIdx = this._cursorPos
        this._cursorPos += text.length
        this._enforceLimits()
        this._cursorPos = Math.min(this._cursorPos, this._text.length)
        this._afterEdit(false)
    }

    private _beforeEdit() {
        this._options.onBeforeEdit?.()
    }

    private _afterEdit(bigJump: boolean) {
        this._focusCursor(bigJump)
        this._options.onChange?.(this._text, true)
        this.showCursorNow()
        return true
    }

    private _handleShortcutKey(event: TextInputKey) {
        const key = this._shortcutKeyName(event)
        switch (key) {
            case 'a':
                this.selectAll()
                return true
            case 'c':
                void this._copySelectionToClipboard()
                return true
            case 'v':
                void this._pasteFromClipboard()
                return true
            case 'x':
                void this._cutSelectionToClipboard()
                return true
            case 'z':
                return false
            default:
                return key.length === 1
        }
    }

    private _shortcutKeyName(event: TextInputKey) {
        const key = event.rawEvent?.key?.toLowerCase()
        if (key) return key

        if (event.keyCode >= TextInputKeyCode.A && event.keyCode <= TextInputKeyCode.Z) {
            return String.fromCharCode(event.keyCode).toLowerCase()
        }
        return ''
    }

    private async _copySelectionToClipboard() {
        if (!this._hasSelection()) return
        await this._writeClipboardText(this._text.slice(this._selectionStart(), this._selectionEnd()))
    }

    private async _cutSelectionToClipboard() {
        if (!this._hasSelection()) return

        const selectedText = this._text.slice(this._selectionStart(), this._selectionEnd())
        await this._writeClipboardText(selectedText)
        if (this._deleteSelectionWithUndo()) this._afterEdit(false)
    }

    private async _pasteFromClipboard() {
        const text = this._sanitizeText(await this._readClipboardText())
        if (!text) return
        this._insertText(text)
    }

    private async _readClipboardText() {
        const clipboard = globalThis.navigator?.clipboard
        if (!clipboard?.readText) return ''

        try {
            return await clipboard.readText()
        } catch {
            return ''
        }
    }

    private async _writeClipboardText(text: string) {
        const clipboard = globalThis.navigator?.clipboard
        if (!clipboard?.writeText) return

        try {
            await clipboard.writeText(text)
        } catch {
            return
        }
    }

    private _sanitizeText(text: string) {
        let sanitized = ''
        for (const char of text) {
            if (char === '\r' || char === '\n') break
            if (this._isAllowedInputChar(char)) sanitized += char
            if (sanitized.length >= this._options.maxLength) break
        }
        const filtered = this._options.sanitizeText ? this._options.sanitizeText(sanitized) : sanitized
        return filtered.slice(0, this._options.maxLength)
    }

    private _eventToInputChar(event: TextInputKey) {
        const rawKey = event.rawEvent?.key
        if (rawKey && rawKey.length === 1) return this._filterInputChar(rawKey)

        const keyCode = event.keyCode
        if (keyCode >= TextInputKeyCode.A && keyCode <= TextInputKeyCode.Z) {
            return this._filterInputChar(String.fromCharCode(keyCode).toLowerCase())
        }
        if (keyCode >= TextInputKeyCode.Digit0 && keyCode <= TextInputKeyCode.Digit9) {
            return this._filterInputChar(String.fromCharCode(keyCode))
        }
        if (keyCode >= TextInputKeyCode.Numpad0 && keyCode <= TextInputKeyCode.Numpad9) {
            return this._filterInputChar(String(keyCode - TextInputKeyCode.Numpad0))
        }

        switch (keyCode) {
            case TextInputKeyCode.Space:
                return this._filterInputChar(' ')
            case TextInputKeyCode.NumpadMultiply:
                return this._filterInputChar('*')
            case TextInputKeyCode.NumpadAdd:
                return this._filterInputChar('+')
            case TextInputKeyCode.NumpadSubtract:
                return this._filterInputChar('-')
            case TextInputKeyCode.NumpadDecimal:
                return this._filterInputChar('.')
            case TextInputKeyCode.NumpadDivide:
                return this._filterInputChar('/')
            case TextInputKeyCode.Semicolon:
                return this._filterInputChar(';')
            case TextInputKeyCode.Equal:
                return this._filterInputChar('=')
            case TextInputKeyCode.Comma:
                return this._filterInputChar(',')
            case TextInputKeyCode.Minus:
                return this._filterInputChar('-')
            case TextInputKeyCode.Period:
                return this._filterInputChar('.')
            case TextInputKeyCode.Slash:
                return this._filterInputChar('/')
            case TextInputKeyCode.Backquote:
                return this._filterInputChar('`')
            case TextInputKeyCode.BracketLeft:
                return this._filterInputChar('[')
            case TextInputKeyCode.Backslash:
                return this._filterInputChar('\\')
            case TextInputKeyCode.BracketRight:
                return this._filterInputChar(']')
            case TextInputKeyCode.Quote:
                return this._filterInputChar("'")
            default:
                return ''
        }
    }

    private _filterInputChar(char: string) {
        return this._isAllowedInputChar(char) ? char : ''
    }

    private _isAllowedInputChar(char: string) {
        if (this._options.isAllowedChar) return this._options.isAllowedChar(char)
        const code = char.charCodeAt(0)
        return code >= 32 && code <= 126
    }

    private _isUndoKey(event: TextInputKey) {
        return event.rawEvent?.key?.toLowerCase() === 'z' || event.keyCode === TextInputKeyCode.Z
    }

    private _isPartOfWord(char: string) {
        return /^[A-Za-z0-9_]$/.test(char)
    }

    private _moveCursorToPreviousWord() {
        while (this._cursorPos > 0 && !this._isPartOfWord(this._text[this._cursorPos - 1])) {
            this._cursorPos--
        }
        while (this._cursorPos > 0 && this._isPartOfWord(this._text[this._cursorPos - 1])) {
            this._cursorPos--
        }
    }

    private _moveCursorToNextWord() {
        while (this._cursorPos < this._text.length - 1 && this._isPartOfWord(this._text[this._cursorPos + 1])) {
            this._cursorPos++
        }
        while (this._cursorPos < this._text.length - 1 && !this._isPartOfWord(this._text[this._cursorPos + 1])) {
            this._cursorPos++
        }
        this._cursorPos = Math.min(this._cursorPos + 1, this._text.length)
    }

    private _refreshInputText() {
        if (!this._textRenderer) return

        this._syncNativeTextInput()
        const visibleText = this._text.slice(this._leftPos)
        this._textRenderer.string = visibleText
        this._textRenderer.forceRebuild()
        this._refreshCompletion()
        if (this._selectionTextRenderer) {
            this._selectionTextRenderer.string = visibleText
            this._selectionTextRenderer.forceRebuild()
        }
        this._refreshSelection()
    }

    private _refreshCompletion() {
        if (!this._completionNode || !this._completionRenderer) return

        const suffix = this._options.getCompletionSuffix?.() ?? ''
        if (!suffix || !this._hasInputFocus || this._hasSelection()) {
            this._completionNode.active = false
            this._completionRenderer.string = ''
            return
        }

        const textWidth = this._textOffsetFromLeft(this._cursorPos)
        const maxWidth = this._inputTextMaxWidth()
        const remainingWidth = maxWidth - textWidth
        if (remainingWidth <= 0) {
            this._completionNode.active = false
            this._completionRenderer.string = ''
            return
        }

        this._completionNode.active = true
        this._completionNode.setPosition(this._inputTextX() + textWidth, this._inputTextTopY(), 0)
        setUISize(this._completionNode, remainingWidth, this._options.height, 0, 1)
        this._completionRenderer.maxWidth = 0
        this._completionRenderer.string = suffix
        this._completionRenderer.forceRebuild()
    }

    private _refreshSelection() {
        if (!this._selectionGraphics || !this._selectionTextClip || !this._selectionTextNode) return

        this._selectionGraphics.clear()
        this._selectionTextClip.active = false
        if (!this._hasInputFocus) return

        let cursorX = this._textOffsetFromLeft(this._cursorPos)
        let hiliteX = cursorX + CURSOR_CLIP_WIDTH
        if (this._hasSelection()) {
            hiliteX = this._textOffsetFromLeft(this._hilitePos)
        }
        if (!this._cursorVisible) cursorX += CURSOR_CLIP_WIDTH

        const maxWidth = this._inputTextMaxWidth()
        const visibleCursorX = this._clamp(cursorX, 0, maxWidth)
        const visibleHiliteX = this._clamp(hiliteX, 0, maxWidth)
        const visibleStartX = Math.min(visibleCursorX, visibleHiliteX)
        const selectionWidth = Math.abs(visibleHiliteX - visibleCursorX)
        if (selectionWidth <= 0) return

        const selectionHeight = this._selectionClipHeight()
        const selectionTopY = this._inputTextTopY()
        const selectionCenterY = selectionTopY - selectionHeight / 2
        this._selectionGraphics.fillColor = this._options.selectionColor ?? new Color(255, 255, 255, 255)
        this._selectionGraphics.rect(
            visibleStartX,
            selectionTopY - selectionHeight,
            selectionWidth,
            selectionHeight,
        )
        this._selectionGraphics.fill()

        this._selectionTextClip.active = true
        this._selectionTextClip.setPosition(this._inputTextX() + visibleStartX, selectionCenterY, 0)
        setUISize(this._selectionTextClip, selectionWidth, selectionHeight, 0, 0.5)
        this._selectionTextNode.setPosition(-visibleStartX, selectionHeight / 2, 0)
    }

    private _focusCursor(bigJump: boolean) {
        while (this._cursorPos < this._leftPos) {
            this._leftPos = Math.max(0, this._leftPos - (bigJump ? 10 : 1))
        }

        while (this._inputTextMaxWidth() > 0 && this._textOffsetFromLeft(this._cursorPos) >= this._inputTextMaxWidth()) {
            this._leftPos = Math.min(this._leftPos + (bigJump ? 10 : 1), this._text.length - 1)
        }

        this._leftPos = Math.max(0, Math.min(this._leftPos, this._text.length))
    }

    private _enforceLimits() {
        if (this._text.length > this._options.maxLength) {
            this._text = this._text.slice(0, this._options.maxLength)
        }
        if (this._options.enforceMaxPixels === false) return

        while (this._text.length > 0 && this._measureText(this._text) > this._inputTextMaxWidth()) {
            this._text = this._text.slice(0, -1)
        }
    }

    private _inputTextX() {
        return -this._options.width / 2 + (this._options.textX ?? 4)
    }

    private _inputTextTopY() {
        if (this._options.textTopY != null) return this._options.textTopY

        const fontHeight = FontMetricsUtil.getMetrics(this._font?.config ?? null).height
        return fontHeight > 0 ? fontHeight / 2 : this._options.height / 2 - 4
    }

    private _inputTextMaxWidth() {
        return this._options.width - (this._options.textX ?? 4) - (this._options.textRight ?? 8)
    }

    private _measureText(text: string) {
        return FontMetricsUtil.measureTextWidth(this._font?.config ?? null, text)
    }

    private _textOffsetFromLeft(position: number) {
        const clampedPosition = Math.max(0, Math.min(position, this._text.length))
        return (
            this._measureText(this._text.slice(0, clampedPosition)) -
            this._measureText(this._text.slice(0, this._leftPos))
        )
    }

    private _selectionClipHeight() {
        const fontHeight = FontMetricsUtil.getMetrics(this._font?.config ?? null).height
        return fontHeight > 0 ? Math.min(fontHeight, this._options.height) : Math.max(0, this._options.height - 8)
    }

    private _clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value))
    }

    private _setInputFocus(focused: boolean) {
        if (this._hasInputFocus === focused) {
            if (focused) this._focusNativeTextInput()
            return
        }

        this._hasInputFocus = focused
        if (focused) {
            this._focusNativeTextInput()
            this.showCursorNow()
        } else {
            this._blurNativeTextInput()
            this._draggingSelection = false
            this._cursorVisible = false
            this._refreshCompletion()
            this._refreshSelection()
        }
    }

    private _bindInputPointerEvents() {
        this._root.on(Node.EventType.TOUCH_START, this._onInputPointerDown, this)
        this._root.on(Node.EventType.TOUCH_MOVE, this._onInputPointerMove, this)
        this._root.on(Node.EventType.TOUCH_END, this._onInputPointerUp, this)
        this._root.on(Node.EventType.TOUCH_CANCEL, this._onInputPointerUp, this)
        this._root.on(Node.EventType.MOUSE_ENTER, this._onInputMouseEnter, this)
        this._root.on(Node.EventType.MOUSE_LEAVE, this._onInputMouseLeave, this)
    }

    private _unbindInputPointerEvents() {
        if (!this._root.isValid) return
        this._root.off(Node.EventType.TOUCH_START, this._onInputPointerDown, this)
        this._root.off(Node.EventType.TOUCH_MOVE, this._onInputPointerMove, this)
        this._root.off(Node.EventType.TOUCH_END, this._onInputPointerUp, this)
        this._root.off(Node.EventType.TOUCH_CANCEL, this._onInputPointerUp, this)
        this._root.off(Node.EventType.MOUSE_ENTER, this._onInputMouseEnter, this)
        this._root.off(Node.EventType.MOUSE_LEAVE, this._onInputMouseLeave, this)
    }

    private _onInputPointerDown(event: EventTouch) {
        event.propagationStopped = true
        const hadSelection = this._hasSelection()
        const doubleClick = !hadSelection && this._isDoubleClick(event)
        if (hadSelection) this._clearLastPointerDown()
        else this._rememberPointerDown(event)
        this._setInputFocus(true)
        if (doubleClick) {
            this._draggingSelection = false
            this.selectAll()
            return
        }

        this._draggingSelection = true
        this._hilitePos = -1
        this._cursorPos = this._getCharAtEvent(event)
        this._focusCursor(false)
        this.showCursorNow()
    }

    private _onInputPointerMove(event: EventTouch) {
        event.propagationStopped = true
        if (!this._draggingSelection) return

        if (this._hilitePos === -1) this._hilitePos = this._cursorPos
        this._cursorPos = this._getCharAtEvent(event)
        if (this._hilitePos === this._cursorPos) this._hilitePos = -1
        this._focusCursor(false)
        this.showCursorNow()
    }

    private _onInputPointerUp(event: EventTouch) {
        event.propagationStopped = true
        this._draggingSelection = false
        if (this._hilitePos === this._cursorPos) this._hilitePos = -1
        this._refreshInputText()
    }

    private _onInputMouseEnter() {
        this._setCanvasCursor('text')
    }

    private _onInputMouseLeave() {
        this._setCanvasCursor('')
    }

    private _isDoubleClick(event: EventTouch) {
        const now = Date.now()
        if (now - this._lastPointerDownTime > DOUBLE_CLICK_MS) return false

        const uiLocation = event.getUILocation()
        const dx = uiLocation.x - this._lastPointerDownX
        const dy = uiLocation.y - this._lastPointerDownY
        return dx * dx + dy * dy <= DOUBLE_CLICK_DISTANCE_SQ
    }

    private _rememberPointerDown(event: EventTouch) {
        const uiLocation = event.getUILocation()
        this._lastPointerDownTime = Date.now()
        this._lastPointerDownX = uiLocation.x
        this._lastPointerDownY = uiLocation.y
    }

    private _clearLastPointerDown() {
        this._lastPointerDownTime = 0
    }

    private _bindDomKeyboardEvents() {
        if (this._domKeyDownListener) return
        if (!sys.isBrowser) return
        if (typeof globalThis.addEventListener !== 'function') return

        this._domKeyDownListener = (event) => this._onDomKeyDown(event)
        globalThis.addEventListener('keydown', this._domKeyDownListener, true)
    }

    private _unbindDomKeyboardEvents() {
        if (!this._domKeyDownListener) return
        if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener('keydown', this._domKeyDownListener, true)
        }
        this._domKeyDownListener = null
    }

    private _onDomKeyDown(event: KeyboardEvent) {
        if (!this._isActive()) return
        if (!this._hasInputFocus) return
        if (event.key === 'Enter' || event.key === 'Escape') return
        if (sys.isMobile && this._nativeTextInput?.node?.isValid) return

        this.handleInputKey({
            keyCode: event.keyCode,
            rawEvent: {
                key: event.key,
                ctrlKey: event.ctrlKey,
            },
        })
        event.preventDefault()
        event.stopPropagation()
    }

    private _getCharAtEvent(event: EventTouch | EventMouse) {
        if (!this._root.isValid) return this._cursorPos

        const transform = this._root.getComponent(UITransform)
        if (!transform) return this._cursorPos

        const uiLocation = event.getUILocation()
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0))
        return this._getCharAt(local.x + this._options.width / 2)
    }

    private _getCharAt(x: number) {
        let pos = this._leftPos
        for (let i = this._leftPos; i < this._text.length; i++) {
            const low = this._measureText(this._text.slice(this._leftPos, i))
            const high = this._measureText(this._text.slice(this._leftPos, i + 1))
            if (x >= (low + high) / 2 + 5) pos = i + 1
        }
        return Math.max(0, Math.min(this._text.length, pos))
    }

    private _hasSelection() {
        return this._hilitePos !== -1 && this._hilitePos !== this._cursorPos
    }

    private _selectionStart() {
        return this._hasSelection() ? Math.min(this._cursorPos, this._hilitePos) : this._cursorPos
    }

    private _selectionEnd() {
        return this._hasSelection() ? Math.max(this._cursorPos, this._hilitePos) : this._cursorPos
    }

    private _deleteSelectionWithUndo() {
        if (!this._hasSelection()) return false

        const oldText = this._text
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        const start = this._selectionStart()
        const end = this._selectionEnd()
        this._beforeEdit()
        this._text = this._text.slice(0, start) + this._text.slice(end)
        this._cursorPos = start
        this._hilitePos = -1
        this._setUndoSnapshot(oldText, oldCursor, oldHilitePos)
        this._lastModifyIdx = -1
        return true
    }

    private _setUndoSnapshot(text: string, cursorPos: number, hilitePos = -1) {
        this._undoText = text
        this._undoCursor = cursorPos
        this._undoHilitePos = hilitePos
    }

    private _isActive() {
        return this._options.isActive?.() ?? true
    }

    private _setCanvasCursor(style: string) {
        CursorManager.set(style)
    }

    private _lockMobilePageScroll() {
        if (!sys.isBrowser || !sys.isMobile || this._mobilePageScrollLocked) return

        const doc = globalThis.document
        const html = doc?.documentElement
        const body = doc?.body
        if (!doc || !html || !body) return

        this._mobilePageScrollX = globalThis.scrollX || html.scrollLeft || body.scrollLeft || 0
        this._mobilePageScrollY = globalThis.scrollY || html.scrollTop || body.scrollTop || 0
        this._mobilePageScrollState = {
            htmlOverflow: html.style.overflow,
            htmlOverscrollBehavior: html.style.overscrollBehavior,
            bodyOverflow: body.style.overflow,
            bodyOverscrollBehavior: body.style.overscrollBehavior,
            bodyTouchAction: body.style.touchAction,
        }

        html.style.overflow = 'hidden'
        html.style.overscrollBehavior = 'none'
        body.style.overflow = 'hidden'
        body.style.overscrollBehavior = 'none'
        body.style.touchAction = 'none'
        doc.addEventListener('touchmove', this._mobilePageScrollBlocker, {
            capture: true,
            passive: false,
        })
        globalThis.addEventListener('scroll', this._mobilePageScrollRestorer, true)

        this._mobilePageScrollLocked = true
        this._restoreMobilePageScroll()
    }

    private _unlockMobilePageScroll() {
        if (!this._mobilePageScrollLocked) return

        const doc = globalThis.document
        const html = doc?.documentElement
        const body = doc?.body
        doc?.removeEventListener('touchmove', this._mobilePageScrollBlocker, true)
        globalThis.removeEventListener?.('scroll', this._mobilePageScrollRestorer, true)

        if (html && body && this._mobilePageScrollState) {
            html.style.overflow = this._mobilePageScrollState.htmlOverflow
            html.style.overscrollBehavior = this._mobilePageScrollState.htmlOverscrollBehavior
            body.style.overflow = this._mobilePageScrollState.bodyOverflow
            body.style.overscrollBehavior = this._mobilePageScrollState.bodyOverscrollBehavior
            body.style.touchAction = this._mobilePageScrollState.bodyTouchAction
        }

        this._mobilePageScrollLocked = false
        this._mobilePageScrollState = null
        this._restoreMobilePageScroll()
    }

    private _restoreMobilePageScroll() {
        if (!sys.isBrowser || !sys.isMobile) return

        const doc = globalThis.document
        const html = doc?.documentElement
        const body = doc?.body
        if (html) {
            html.scrollLeft = this._mobilePageScrollX
            html.scrollTop = this._mobilePageScrollY
        }
        if (body) {
            body.scrollLeft = this._mobilePageScrollX
            body.scrollTop = this._mobilePageScrollY
        }
        globalThis.scrollTo?.(this._mobilePageScrollX, this._mobilePageScrollY)
    }
}
