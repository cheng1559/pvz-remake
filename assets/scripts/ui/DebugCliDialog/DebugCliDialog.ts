import {
    _decorator,
    Color,
    EditBox,
    EventKeyboard,
    EventMouse,
    EventTouch,
    game,
    Game,
    Graphics,
    input,
    Input,
    Mask,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    sys,
    UITransform,
    UIOpacity,
    Vec2,
    Vec3,
} from 'cc'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import {
    type DebugCliResult,
    getDebugCliCompletion,
    getDebugCliCompletions,
    getDebugCliParameterHint,
} from '@/ui/DebugCliDialog/DebugCliCommands'
import { DialogResult, MessageBox } from '@/ui/MessageBox/MessageBox'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { CursorManager } from '@/ui/CursorManager'

const { ccclass } = _decorator

const INPUT_HEIGHT = 28
const INPUT_BORDER_X = 8
const INPUT_BORDER_Y = 4
const INPUT_LEFT_INSET = 48
const INPUT_RIGHT_INSET = 58
const INPUT_CENTER_FROM_BOTTOM = 141
const INPUT_CLIP_LEFT = 4
const INPUT_CLIP_RIGHT = 8
const INPUT_TEXT_TOP_Y = INPUT_HEIGHT / 2 - 4
const NATIVE_TEXT_INPUT_SIZE = 1
const NATIVE_TEXT_INPUT_SCALE = 0.01
const MAX_COMMAND_LENGTH = 120
const ORIGINAL_FRAME_SECONDS = 0.01
const ORIGINAL_BLINK_DELAY_UPDATES = 14
const CURSOR_BLINK_SECONDS = ORIGINAL_FRAME_SECONDS * (ORIGINAL_BLINK_DELAY_UPDATES + 1)
const COMMAND_FLASH_TICKS = 70
const COMMAND_FLASH_PERIOD_TICKS = 20
const COMMAND_FONT = 'briannetod16'
export const DEBUG_CLI_PRELOAD = {
    sprites: ['editbox'],
    fonts: [COMMAND_FONT],
}
const COMMAND_COLOR = new Color(240, 240, 255, 255)
const COMPLETION_COLOR = new Color(240, 240, 255, 95)
const SELECTION_TEXT_COLOR = new Color(0, 0, 0, 255)
const CURSOR_COLOR = new Color(255, 255, 255, 255)
const SELECTION_COLOR = new Color(255, 255, 255, 255)
const CURSOR_WIDTH = 2
const COMMAND_HISTORY_LIMIT = 64

const enum DebugCliKeyCode {
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

interface DebugCliInputKey {
    keyCode: number
    rawEvent?: {
        key?: string
        ctrlKey?: boolean
    }
}

interface MobilePageScrollState {
    htmlOverflow: string
    htmlOverscrollBehavior: string
    bodyOverflow: string
    bodyOverscrollBehavior: string
    bodyTouchAction: string
}

interface NativeEditBoxElementHost {
    _impl?: {
        _edTxt?: HTMLInputElement | HTMLTextAreaElement | null
    }
}

interface DebugCliNativeBridge {
    hideKeyboardAccessory?: () => boolean
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        PvzNative?: DebugCliNativeBridge
    }
}

@ccclass('DebugCliDialog')
export class DebugCliDialog extends MessageBox {
    private static _commandHistory: string[] = []

    public onCommand: ((command: string) => DebugCliResult) | null = null
    public initialCommand = ''
    public lastCommandResult: DebugCliResult | null = null

    private _inputRoot: Node | null = null
    private _textNode: Node | null = null
    private _textRenderer: FontRenderer | null = null
    private _completionNode: Node | null = null
    private _completionRenderer: FontRenderer | null = null
    private _selectionNode: Node | null = null
    private _selectionGraphics: Graphics | null = null
    private _selectionTextClip: Node | null = null
    private _selectionTextNode: Node | null = null
    private _selectionTextRenderer: FontRenderer | null = null
    private _cursorNode: Node | null = null
    private _cursorGraphics: Graphics | null = null
    private _commandFont: BitmapFontAssets | null = null
    private _command = ''
    private _undoCommand = ''
    private _undoCursor = 0
    private _undoHilitePos = -1
    private _lastModifyIdx = 0
    private _cursorPos = 0
    private _hilitePos = -1
    private _leftPos = 0
    private _hasInputFocus = true
    private _draggingSelection = false
    private _cursorVisible = true
    private _cursorBlinkElapsed = 0
    private _domKeyDownListener: ((event: KeyboardEvent) => void) | null = null
    private _nativeTextInput: EditBox | null = null
    private _syncingNativeTextInput = false
    private _inputWidth = 0
    private _historyIndex = -1
    private _historyDraft = ''
    private _completionCycleBaseCommand = ''
    private _completionCycleCandidates: string[] = []
    private _completionCycleIndex = -1
    private _commandFlashTicks = 0
    private _mobilePageScrollState: MobilePageScrollState | null = null
    private _mobilePageScrollLocked = false
    private _mobilePageScrollX = 0
    private _mobilePageScrollY = 0
    private readonly _mobilePageScrollBlocker = (event: Event) => event.preventDefault()
    private readonly _mobilePageScrollRestorer = () => this._restoreMobilePageScroll()
    start() {
        this.title = 'DEBUG CLI'
        this.message = 'Enter debug command:'
        this.verticalCenterText = false
        this.messageOffsetY = -8
        this.spaceAfterHeader = 10
        this.extraWidth = 110
        this.extraHeight = 40
        this.setButtons([
            {
                label: 'OK',
                result: DialogResult.Ok,
                finishOnClick: false,
                onClick: () => {
                    this._captureCommand()
                    this._submitCommand()
                },
            },
            { label: 'Cancel', result: DialogResult.Cancel },
        ])
        this._setCommand(this.initialCommand)
        super.start()
    }

    onEnable() {
        super.onEnable()
        this._bindDomKeyboardEvents()
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalPointerDown, this)
        input.on(Input.EventType.TOUCH_START, this._onGlobalPointerDown, this)
        game.on(Game.EVENT_HIDE, this._onInputFocusLost, this)
    }

    onDisable() {
        if (this.node.isValid) {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        this._unbindDomKeyboardEvents()
        input.off(Input.EventType.MOUSE_DOWN, this._onGlobalPointerDown, this)
        input.off(Input.EventType.TOUCH_START, this._onGlobalPointerDown, this)
        game.off(Game.EVENT_HIDE, this._onInputFocusLost, this)
        this._draggingSelection = false
        this._setCanvasCursor('')
        super.onDisable()
    }

    get command() {
        return this._command.trim()
    }

    update(dt: number) {
        super.update()
        if (this._commandFlashTicks > 0) {
            this._commandFlashTicks = Math.max(0, this._commandFlashTicks - dt / ORIGINAL_FRAME_SECONDS)
            this._refreshInputTextColor()
        }
        if (!this._hasInputFocus) return

        this._cursorBlinkElapsed += dt
        if (this._cursorBlinkElapsed < CURSOR_BLINK_SECONDS) return

        this._cursorBlinkElapsed = 0
        this._cursorVisible = !this._cursorVisible
        this._refreshCursor()
    }

    onDestroy() {
        this._unbindDomKeyboardEvents()
        this._destroyInput()
        super.onDestroy()
    }

    protected onDialogRendered(actualWidth: number, actualHeight: number) {
        void this._renderInput(actualWidth, actualHeight)
    }

    public requestNativeTextInputFocus() {
        this._setInputFocus(true)
        this._createNativeTextInput(this._inputRoot ?? this.node)
        this._focusNativeTextInput()
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        if (event.keyCode === DebugCliKeyCode.Enter) {
            this._captureCommand()
            this._submitCommand()
            return
        }

        if (event.keyCode === DebugCliKeyCode.Escape) {
            this.close()
            return
        }

        if (!this._hasInputFocus) return

        event.propagationStopped = true
        if (!this._domKeyDownListener) {
            this._handleInputKey(event)
        }
    }

    private async _renderInput(dialogWidth: number, dialogHeight: number) {
        this._destroyInput(true)

        const [editBoxFrame, commandFont] = await Promise.all([
            SpriteLoader.load('editbox'),
            FontLoader.load(COMMAND_FONT),
        ])
        const dialogNode = this.node as Node | null | undefined
        if (!dialogNode?.isValid) return
        this._commandFont = commandFont
        this._inputWidth = dialogWidth - INPUT_LEFT_INSET - INPUT_RIGHT_INSET

        const inputRoot = createUINode('DebugCliInput', {
            parent: dialogNode,
            anchorX: 0.5,
            anchorY: 0.5,
            width: this._inputWidth + INPUT_BORDER_X * 2,
            height: INPUT_HEIGHT + INPUT_BORDER_Y * 2,
            x: INPUT_LEFT_INSET + this._inputWidth / 2 - dialogWidth / 2,
            y: -dialogHeight / 2 + INPUT_CENTER_FROM_BOTTOM,
        })
        this._inputRoot = inputRoot
        this._bindInputPointerEvents(inputRoot)

        if (!editBoxFrame) return
        this._drawImageBox(
            inputRoot,
            editBoxFrame,
            this._inputWidth + INPUT_BORDER_X * 2,
            INPUT_HEIGHT + INPUT_BORDER_Y * 2,
        )

        const editNode = createUINode('CommandInput', {
            parent: inputRoot,
            anchorX: 0.5,
            anchorY: 0.5,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
        })
        setUISize(editNode, this._inputWidth, INPUT_HEIGHT)
        const inputMask = editNode.addComponent(Mask)
        inputMask.type = Mask.Type.GRAPHICS_RECT
        this._createNativeTextInput(editNode)

        this._selectionNode = createUINode('CommandSelection', {
            parent: editNode,
            anchorX: 0,
            anchorY: 0.5,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
            x: this._inputTextX(),
            y: 0,
        })
        this._selectionGraphics = this._selectionNode.addComponent(Graphics)

        this._textNode = createUINode('CommandText', {
            parent: editNode,
            anchorX: 0,
            anchorY: 1,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
            x: this._inputTextX(),
            y: INPUT_TEXT_TOP_Y,
        })
        this._textRenderer = this._textNode.addComponent(FontRenderer)
        if (this._commandFont) this._textRenderer.setFontAssets(this._commandFont)
        this._textRenderer.fontColor = this._commandTextColor()
        this._textRenderer.maxWidth = this._inputTextMaxWidth()

        this._completionNode = createUINode('CommandCompletionText', {
            parent: editNode,
            active: false,
            anchorX: 0,
            anchorY: 1,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
            x: this._inputTextX(),
            y: INPUT_TEXT_TOP_Y,
        })
        this._completionRenderer = this._completionNode.addComponent(FontRenderer)
        if (this._commandFont) this._completionRenderer.setFontAssets(this._commandFont)
        this._completionRenderer.fontColor = COMPLETION_COLOR
        this._completionRenderer.maxWidth = 0

        this._selectionTextClip = createUINode('CommandSelectionTextClip', {
            parent: editNode,
            active: false,
            anchorX: 0,
            anchorY: 0.5,
            width: 1,
            height: INPUT_HEIGHT,
            x: this._inputTextX(),
            y: 0,
        })
        const selectionTextMask = this._selectionTextClip.addComponent(Mask)
        selectionTextMask.type = Mask.Type.GRAPHICS_RECT
        this._selectionTextNode = createUINode('CommandSelectionText', {
            parent: this._selectionTextClip,
            anchorX: 0,
            anchorY: 1,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
            x: 0,
            y: INPUT_TEXT_TOP_Y,
        })
        this._selectionTextRenderer = this._selectionTextNode.addComponent(FontRenderer)
        if (this._commandFont) this._selectionTextRenderer.setFontAssets(this._commandFont)
        this._selectionTextRenderer.fontColor = SELECTION_TEXT_COLOR
        this._selectionTextRenderer.maxWidth = this._inputTextMaxWidth()

        this._cursorNode = createUINode('CommandCursor', {
            parent: editNode,
            anchorX: 0,
            anchorY: 0.5,
            width: CURSOR_WIDTH,
            height: INPUT_HEIGHT,
            x: this._inputTextX(),
            y: 0,
        })
        this._cursorGraphics = this._cursorNode.addComponent(Graphics)
        this._cursorGraphics.fillColor = CURSOR_COLOR

        this._setInputFocus(true)
        this._focusNativeTextInput()
        this.scheduleOnce(() => this._focusNativeTextInput(), 0)
        this._showCursorNow()

        const transform = dialogNode.getComponent(UITransform)
        if (transform) transform.setContentSize(dialogWidth, dialogHeight)
    }

    private _drawImageBox(parent: Node, spriteFrame: SpriteFrame, width: number, height: number) {
        const sourceWidth = spriteFrame.rect.width
        const sourceHeight = spriteFrame.rect.height
        if (sourceWidth <= 0 || sourceHeight <= 0) return

        const cornerWidth = Math.floor(sourceWidth / 3)
        const cornerHeight = Math.floor(sourceHeight / 3)
        const middleWidth = sourceWidth - cornerWidth * 2
        const middleHeight = sourceHeight - cornerHeight * 2
        if (cornerWidth <= 0 || cornerHeight <= 0 || middleWidth <= 0 || middleHeight <= 0) {
            return
        }

        const startX = -width / 2
        const startY = height / 2
        const rightX = width - cornerWidth
        const bottomY = height - cornerHeight
        const middleTargetWidth = Math.max(0, width - cornerWidth * 2)
        const middleTargetHeight = Math.max(0, height - cornerHeight * 2)

        this._drawImageBoxTile(parent, spriteFrame, 0, 0, cornerWidth, cornerHeight, startX, startY)
        this._drawImageBoxTile(
            parent,
            spriteFrame,
            cornerWidth + middleWidth,
            0,
            cornerWidth,
            cornerHeight,
            startX + rightX,
            startY,
        )
        this._drawImageBoxTile(
            parent,
            spriteFrame,
            0,
            cornerHeight + middleHeight,
            cornerWidth,
            cornerHeight,
            startX,
            startY - bottomY,
        )
        this._drawImageBoxTile(
            parent,
            spriteFrame,
            cornerWidth + middleWidth,
            cornerHeight + middleHeight,
            cornerWidth,
            cornerHeight,
            startX + rightX,
            startY - bottomY,
        )

        for (let x = 0; x < middleTargetWidth; x += middleWidth) {
            const tileWidth = Math.min(middleWidth, middleTargetWidth - x)
            this._drawImageBoxTile(
                parent,
                spriteFrame,
                cornerWidth,
                0,
                tileWidth,
                cornerHeight,
                startX + cornerWidth + x,
                startY,
            )
            this._drawImageBoxTile(
                parent,
                spriteFrame,
                cornerWidth,
                cornerHeight + middleHeight,
                tileWidth,
                cornerHeight,
                startX + cornerWidth + x,
                startY - bottomY,
            )
        }

        for (let y = 0; y < middleTargetHeight; y += middleHeight) {
            const tileHeight = Math.min(middleHeight, middleTargetHeight - y)
            this._drawImageBoxTile(
                parent,
                spriteFrame,
                0,
                cornerHeight,
                cornerWidth,
                tileHeight,
                startX,
                startY - cornerHeight - y,
            )
            this._drawImageBoxTile(
                parent,
                spriteFrame,
                cornerWidth + middleWidth,
                cornerHeight,
                cornerWidth,
                tileHeight,
                startX + rightX,
                startY - cornerHeight - y,
            )
        }

        for (let x = 0; x < middleTargetWidth; x += middleWidth) {
            const tileWidth = Math.min(middleWidth, middleTargetWidth - x)
            for (let y = 0; y < middleTargetHeight; y += middleHeight) {
                const tileHeight = Math.min(middleHeight, middleTargetHeight - y)
                this._drawImageBoxTile(
                    parent,
                    spriteFrame,
                    cornerWidth,
                    cornerHeight,
                    tileWidth,
                    tileHeight,
                    startX + cornerWidth + x,
                    startY - cornerHeight - y,
                )
            }
        }
    }

    private _drawImageBoxTile(
        parent: Node,
        source: SpriteFrame,
        sourceX: number,
        sourceY: number,
        width: number,
        height: number,
        x: number,
        y: number,
    ) {
        if (width <= 0 || height <= 0) return

        const sourceRect = source.rect
        const frame = new SpriteFrame()
        frame.reset({
            texture: source.texture,
            rect: new Rect(sourceRect.x + sourceX, sourceRect.y + sourceY, width, height),
            originalSize: new Size(width, height),
            offset: new Vec2(0, 0),
            isRotate: false,
        })

        const node = createSpriteNode({
            name: 'CommandInputBackgroundTile',
            spriteFrame: frame,
            parent,
            layer: parent.layer,
            x,
            y,
            anchorX: 0,
            anchorY: 1,
            width,
            height,
        })
        const sprite = node.getComponent(Sprite)
        if (sprite) {
            sprite.type = Sprite.Type.SIMPLE
            sprite.sizeMode = Sprite.SizeMode.CUSTOM
        }
    }

    private _createNativeTextInput(parent: Node) {
        if (!sys.isMobile) return

        const existingNode = this._nativeTextInput?.node
        if (existingNode?.isValid) {
            const node = existingNode
            if (node.parent !== parent) node.setParent(parent)
            this._hideNativeTextInputNode(node)
            this._syncNativeTextInput()
            return
        }

        const node = createUINode('NativeCommandTextInput', {
            parent,
            anchorX: 0.5,
            anchorY: 0.5,
            width: NATIVE_TEXT_INPUT_SIZE,
            height: NATIVE_TEXT_INPUT_SIZE,
        })
        this._hideNativeTextInputNode(node)
        node.addComponent(UIOpacity).opacity = 0

        const editBox = node.addComponent(EditBox)
        editBox.inputMode = EditBox.InputMode.SINGLE_LINE
        editBox.inputFlag = EditBox.InputFlag.SENSITIVE
        editBox.returnType = EditBox.KeyboardReturnType.DONE
        editBox.maxLength = MAX_COMMAND_LENGTH
        editBox.placeholder = ''
        editBox.backgroundImage = null
        editBox.string = this._command
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

        if (this._nativeTextInput.string !== this._command) {
            this._syncingNativeTextInput = true
            this._nativeTextInput.string = this._command
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
            element.setSelectionRange(
                this._clampNativeTextInputPosition(start),
                this._clampNativeTextInputPosition(end),
            )
        } catch {
            return
        }
    }

    private _readNativeTextInputSelection(commandLength: number) {
        const element = this._nativeTextInputElement()
        const start = this._clampNativeTextInputPosition(element?.selectionStart ?? commandLength, commandLength)
        const end = this._clampNativeTextInputPosition(element?.selectionEnd ?? start, commandLength)
        return {
            cursorPos: end,
            hilitePos: start === end ? -1 : start,
        }
    }

    private _clampNativeTextInputPosition(position: number, commandLength = this._command.length) {
        return Math.max(0, Math.min(commandLength, position))
    }

    private _onNativeTextInputChanged(editBox: EditBox) {
        if (this._syncingNativeTextInput) return
        if (!this._hasInputFocus) return

        const sanitized = this._sanitizeClipboardText(editBox.string)
        const selection = this._readNativeTextInputSelection(sanitized.length)
        if (sanitized !== editBox.string) {
            this._syncingNativeTextInput = true
            editBox.string = sanitized
            this._syncingNativeTextInput = false
        }
        this._replaceCommandFromNativeTextInput(sanitized, selection.cursorPos, selection.hilitePos)
    }

    private _onNativeTextInputReturn() {
        if (!this.isTopDialog()) return

        this._captureCommand()
        this._submitCommand()
    }

    private _replaceCommandFromNativeTextInput(command: string, cursorPos: number, hilitePos: number) {
        const clampedCursorPos = this._clampNativeTextInputPosition(cursorPos, command.length)
        const clampedHilitePos =
            hilitePos === -1 ? -1 : this._clampNativeTextInputPosition(hilitePos, command.length)
        if (
            command === this._command &&
            clampedCursorPos === this._cursorPos &&
            clampedHilitePos === this._hilitePos
        ) {
            return
        }

        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._resetCompletionCycle()
        this._resetHistoryNavigation()
        this._command = command
        this._cursorPos = clampedCursorPos
        this._hilitePos = clampedHilitePos
        if (command !== oldCommand) this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        this._lastModifyIdx = this._cursorPos
        this._enforceMaxPixels()
        this._cursorPos = Math.min(this._cursorPos, this._command.length)
        if (this._hilitePos !== -1) this._hilitePos = Math.min(this._hilitePos, this._command.length)
        this._focusCursor(false)
        if (this._closeIfEmpty()) return
        this._showCursorNow()
    }

    private _handleInputKey(event: DebugCliInputKey) {
        if (event.keyCode !== DebugCliKeyCode.Tab) {
            this._resetCompletionCycle()
        }

        if (event.rawEvent?.ctrlKey && this._handleShortcutKey(event)) {
            return
        }

        if (event.rawEvent?.ctrlKey && this._isUndoKey(event)) {
            const swapCommand = this._command
            const swapCursor = this._cursorPos
            const swapHilitePos = this._hilitePos
            this._command = this._undoCommand
            this._cursorPos = this._undoCursor
            this._hilitePos = this._undoHilitePos
            this._undoCommand = swapCommand
            this._undoCursor = swapCursor
            this._undoHilitePos = swapHilitePos
            this._lastModifyIdx = -1
            this._focusCursor(true)
            this._showCursorNow()
            return
        }

        switch (event.keyCode) {
            case DebugCliKeyCode.Tab:
                if (this._acceptCompletion()) return
                return
            case DebugCliKeyCode.Up:
                if (this._navigateHistory(-1)) return
                return
            case DebugCliKeyCode.Down:
                if (this._navigateHistory(1)) return
                return
            case DebugCliKeyCode.Backspace:
                if (this._deleteSelectionWithUndo()) {
                    if (this._closeIfEmpty()) return
                    this._focusCursor(false)
                    this._showCursorNow()
                    return
                }
                if (this._cursorPos > 0) {
                    const oldCommand = this._command
                    const oldCursor = this._cursorPos
                    this._resetHistoryNavigation()
                    this._command =
                        this._command.slice(0, this._cursorPos - 1) +
                        this._command.slice(this._cursorPos)
                    this._cursorPos--
                    if (this._cursorPos !== this._lastModifyIdx) {
                        this._setUndoSnapshot(oldCommand, oldCursor)
                    }
                    this._lastModifyIdx = this._cursorPos - 1
                    if (this._closeIfEmpty()) return
                    this._focusCursor(false)
                    this._showCursorNow()
                }
                return
            case DebugCliKeyCode.Delete:
                if (this._deleteSelectionWithUndo()) {
                    if (this._closeIfEmpty()) return
                    this._focusCursor(false)
                    this._showCursorNow()
                    return
                }
                if (this._cursorPos < this._command.length) {
                    const oldCommand = this._command
                    const oldCursor = this._cursorPos
                    this._resetHistoryNavigation()
                    this._command =
                        this._command.slice(0, this._cursorPos) +
                        this._command.slice(this._cursorPos + 1)
                    if (this._cursorPos !== this._lastModifyIdx) {
                        this._setUndoSnapshot(oldCommand, oldCursor)
                    }
                    this._lastModifyIdx = this._cursorPos
                    if (this._closeIfEmpty()) return
                    this._focusCursor(false)
                    this._showCursorNow()
                }
                return
            case DebugCliKeyCode.Left:
                if (this._hasSelection()) {
                    this._cursorPos = this._selectionStart()
                    this._hilitePos = -1
                } else if (event.rawEvent?.ctrlKey) {
                    this._moveCursorToPreviousWord()
                } else {
                    this._cursorPos = Math.max(0, this._cursorPos - 1)
                }
                this._focusCursor(true)
                this._showCursorNow()
                return
            case DebugCliKeyCode.Right:
                if (this._hasSelection()) {
                    this._cursorPos = this._selectionEnd()
                    this._hilitePos = -1
                } else if (event.rawEvent?.ctrlKey) {
                    this._moveCursorToNextWord()
                } else if (this._cursorPos === this._command.length && this._acceptCompletion()) {
                    return
                } else {
                    this._cursorPos = Math.min(this._command.length, this._cursorPos + 1)
                }
                this._focusCursor(true)
                this._showCursorNow()
                return
            case DebugCliKeyCode.Home:
                this._cursorPos = 0
                this._hilitePos = -1
                this._focusCursor(true)
                this._showCursorNow()
                return
            case DebugCliKeyCode.End:
                this._cursorPos = this._command.length
                this._hilitePos = -1
                this._focusCursor(true)
                this._showCursorNow()
                return
        }

        const char = this._eventToInputChar(event)
        if (!char || this._command.length >= MAX_COMMAND_LENGTH) return

        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._resetHistoryNavigation()
        if (this._hasSelection()) {
            const start = this._selectionStart()
            const end = this._selectionEnd()
            this._command = this._command.slice(0, start) + char + this._command.slice(end)
            this._cursorPos = start
            this._hilitePos = -1
        } else {
            this._command =
                this._command.slice(0, this._cursorPos) + char + this._command.slice(this._cursorPos)
        }
        if (this._cursorPos !== this._lastModifyIdx + 1) {
            this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        }
        this._lastModifyIdx = this._cursorPos
        this._cursorPos += char.length
        this._enforceMaxPixels()
        this._cursorPos = Math.min(this._cursorPos, this._command.length)
        this._focusCursor(false)
        this._showCursorNow()
    }

    private _captureCommand() {
        this._command = this._command.trim()
        this._cursorPos = this._command.length
        this._hilitePos = -1
        this._commitHistory(this._command)
        this._historyIndex = -1
        this._historyDraft = ''
        this._resetCompletionCycle()
        this._focusCursor(true)
        this._refreshInputText()
    }

    private _submitCommand() {
        if (!this._command || !this.onCommand) {
            this._flashInvalidCommand()
            this._refocusAfterInvalidCommand()
            return
        }

        const result = this.onCommand(this._command)
        if (!result.ok && result.failure !== 'condition') {
            this._flashInvalidCommand()
            this._refocusAfterInvalidCommand()
            return
        }

        this._setInputFocus(false)
        this.lastCommandResult = result
        if (result.ok) {
            void SoundLoader.play(SoundEffect.ButtonClick)
        } else if (result.failure === 'condition') {
            void SoundLoader.play(SoundEffect.Buzzer)
        }
        this._destroyInput()
        this.close()
    }

    private _refocusAfterInvalidCommand() {
        if (sys.isMobile && this._nativeTextInput?.node?.isValid) {
            this._hasInputFocus = true
            this._showCursorNow()
            return
        }

        this._setInputFocus(true)
        this._focusNativeTextInput()
    }

    private _flashInvalidCommand() {
        this._commandFlashTicks = COMMAND_FLASH_TICKS
        this._refreshInputTextColor()
        this._showCursorNow()
        void SoundLoader.play(SoundEffect.Buzzer)
    }

    private _setCommand(command: string) {
        this._command = command
        this._cursorPos = command.length
        this._hilitePos = -1
        this._leftPos = 0
        this._lastModifyIdx = 0
        this._undoCommand = ''
        this._undoCursor = 0
        this._undoHilitePos = -1
        this._historyIndex = -1
        this._historyDraft = ''
        this._resetCompletionCycle()
    }

    private _commitHistory(command: string) {
        if (!command) return

        const history = DebugCliDialog._commandHistory
        if (history[history.length - 1] === command) return

        const duplicateIndex = history.indexOf(command)
        if (duplicateIndex !== -1) history.splice(duplicateIndex, 1)
        history.push(command)
        while (history.length > COMMAND_HISTORY_LIMIT) history.shift()
    }

    private _navigateHistory(direction: -1 | 1) {
        const history = DebugCliDialog._commandHistory
        if (history.length === 0) return false

        if (direction < 0) {
            if (this._historyIndex === -1) {
                this._historyDraft = this._command
                this._historyIndex = history.length - 1
            } else {
                this._historyIndex = Math.max(0, this._historyIndex - 1)
            }
        } else {
            if (this._historyIndex === -1) return false
            this._historyIndex++
            if (this._historyIndex >= history.length) {
                this._historyIndex = -1
            }
        }

        const command = this._historyIndex === -1
            ? this._historyDraft
            : history[this._historyIndex]
        this._replaceCommandFromHistory(command)
        return true
    }

    private _replaceCommandFromHistory(command: string) {
        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._resetCompletionCycle()
        this._command = command
        this._cursorPos = command.length
        this._hilitePos = -1
        this._lastModifyIdx = this._cursorPos
        this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        this._focusCursor(true)
        this._showCursorNow()
    }

    private _resetHistoryNavigation() {
        this._historyIndex = -1
        this._historyDraft = ''
    }

    private _resetCompletionCycle() {
        this._completionCycleBaseCommand = ''
        this._completionCycleCandidates = []
        this._completionCycleIndex = -1
    }

    private _acceptCompletion() {
        if (this._hasSelection()) return false
        if (this._cursorPos !== this._command.length) return false

        const completion = this._getNextCompletion()
        if (!completion || completion === this._command) return false

        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._command = completion
        this._cursorPos = completion.length
        this._hilitePos = -1
        this._lastModifyIdx = this._cursorPos
        this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        this._resetHistoryNavigation()
        this._focusCursor(false)
        this._showCursorNow()
        return true
    }

    private _getNextCompletion() {
        const currentCycleCandidate = this._completionCycleCandidates[this._completionCycleIndex]
        if (
            this._completionCycleBaseCommand &&
            currentCycleCandidate === this._command &&
            this._completionCycleCandidates.length > 1
        ) {
            this._completionCycleIndex =
                (this._completionCycleIndex + 1) % this._completionCycleCandidates.length
            return this._completionCycleCandidates[this._completionCycleIndex]
        }

        const candidates = getDebugCliCompletions(this._command, true)
        if (candidates.length === 0) {
            this._resetCompletionCycle()
            return ''
        }

        this._completionCycleBaseCommand = this._command
        this._completionCycleCandidates = candidates
        const currentIndex = candidates.indexOf(this._command)
        this._completionCycleIndex = currentIndex === -1
            ? 0
            : (currentIndex + 1) % candidates.length
        return candidates[this._completionCycleIndex]
    }

    private _closeIfEmpty() {
        if (this._command.length > 0) return false

        this.close()
        return true
    }

    private _setUndoSnapshot(command: string, cursorPos: number, hilitePos = -1) {
        this._undoCommand = command
        this._undoCursor = cursorPos
        this._undoHilitePos = hilitePos
    }

    private _handleShortcutKey(event: DebugCliInputKey) {
        const key = this._shortcutKeyName(event)
        switch (key) {
            case 'a':
                this._selectAll()
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

    private _shortcutKeyName(event: DebugCliInputKey) {
        const key = event.rawEvent?.key?.toLowerCase()
        if (key) return key

        if (event.keyCode >= DebugCliKeyCode.A && event.keyCode <= DebugCliKeyCode.Z) {
            return String.fromCharCode(event.keyCode).toLowerCase()
        }
        return ''
    }

    private _selectAll() {
        if (this._command.length === 0) return

        this._hilitePos = 0
        this._cursorPos = this._command.length
        this._leftPos = 0
        this._focusCursor(true)
        this._showCursorNow()
    }

    private async _copySelectionToClipboard() {
        if (!this._hasSelection()) return

        await this._writeClipboardText(
            this._command.slice(this._selectionStart(), this._selectionEnd()),
        )
    }

    private async _cutSelectionToClipboard() {
        if (!this._hasSelection()) return

        const selectedText = this._command.slice(this._selectionStart(), this._selectionEnd())
        await this._writeClipboardText(selectedText)
        if (this._deleteSelectionWithUndo()) {
            if (this._closeIfEmpty()) return
            this._focusCursor(false)
            this._showCursorNow()
        }
    }

    private async _pasteFromClipboard() {
        const text = this._sanitizeClipboardText(await this._readClipboardText())
        if (!text) return

        this._insertText(text)
    }

    private _insertText(text: string) {
        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        this._resetHistoryNavigation()
        if (this._hasSelection()) {
            const start = this._selectionStart()
            const end = this._selectionEnd()
            this._command = this._command.slice(0, start) + text + this._command.slice(end)
            this._cursorPos = start
            this._hilitePos = -1
        } else {
            this._command =
                this._command.slice(0, this._cursorPos) + text + this._command.slice(this._cursorPos)
        }

        this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        this._cursorPos += text.length
        if (this._command.length > MAX_COMMAND_LENGTH) {
            this._command = this._command.slice(0, MAX_COMMAND_LENGTH)
        }
        this._enforceMaxPixels()
        this._cursorPos = Math.min(this._cursorPos, this._command.length)
        this._lastModifyIdx = this._cursorPos
        this._focusCursor(false)
        this._showCursorNow()
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

    private _sanitizeClipboardText(text: string) {
        let sanitized = ''
        for (const char of text) {
            if (char === '\r' || char === '\n') break
            if (this._isAllowedInputChar(char)) sanitized += char
        }
        return sanitized
    }

    private _eventToInputChar(event: DebugCliInputKey) {
        const rawKey = event.rawEvent?.key
        if (rawKey && rawKey.length === 1 && this._isAllowedInputChar(rawKey)) return rawKey

        const keyCode = event.keyCode
        if (keyCode >= DebugCliKeyCode.A && keyCode <= DebugCliKeyCode.Z) {
            return this._filterInputChar(String.fromCharCode(keyCode).toLowerCase())
        }
        if (keyCode >= DebugCliKeyCode.Digit0 && keyCode <= DebugCliKeyCode.Digit9) {
            return this._filterInputChar(String.fromCharCode(keyCode))
        }
        if (keyCode >= DebugCliKeyCode.Numpad0 && keyCode <= DebugCliKeyCode.Numpad9) {
            return this._filterInputChar(String(keyCode - DebugCliKeyCode.Numpad0))
        }

        switch (keyCode) {
            case DebugCliKeyCode.Space:
                return this._filterInputChar(' ')
            case DebugCliKeyCode.NumpadMultiply:
                return this._filterInputChar('*')
            case DebugCliKeyCode.NumpadAdd:
                return this._filterInputChar('+')
            case DebugCliKeyCode.NumpadSubtract:
                return this._filterInputChar('-')
            case DebugCliKeyCode.NumpadDecimal:
                return this._filterInputChar('.')
            case DebugCliKeyCode.NumpadDivide:
                return this._filterInputChar('/')
            case DebugCliKeyCode.Semicolon:
                return this._filterInputChar(';')
            case DebugCliKeyCode.Equal:
                return this._filterInputChar('=')
            case DebugCliKeyCode.Comma:
                return this._filterInputChar(',')
            case DebugCliKeyCode.Minus:
                return this._filterInputChar('-')
            case DebugCliKeyCode.Period:
                return this._filterInputChar('.')
            case DebugCliKeyCode.Slash:
                return this._filterInputChar('/')
            case DebugCliKeyCode.Backquote:
                return this._filterInputChar('`')
            case DebugCliKeyCode.BracketLeft:
                return this._filterInputChar('[')
            case DebugCliKeyCode.Backslash:
                return this._filterInputChar('\\')
            case DebugCliKeyCode.BracketRight:
                return this._filterInputChar(']')
            case DebugCliKeyCode.Quote:
                return this._filterInputChar("'")
            default:
                return ''
        }
    }

    private _filterInputChar(char: string) {
        return this._isAllowedInputChar(char) ? char : ''
    }

    private _isAllowedInputChar(char: string) {
        return this._isPrintableAscii(char) && this._hasCommandFontGlyph(char)
    }

    private _isPrintableAscii(char: string) {
        const code = char.charCodeAt(0)
        return code >= 32 && code <= 126
    }

    private _hasCommandFontGlyph(char: string) {
        if (char === ' ') return true

        const config = this._commandFont?.config.json as
            | {
                charMap?: Record<string, number>
                layers?: Array<{ chars?: Record<string, unknown> }>
            }
            | undefined
        const layerChars = config?.layers?.[0]?.chars
        if (!layerChars) return true

        const sourceCode = String(char.charCodeAt(0))
        const mappedCode = String(config?.charMap?.[sourceCode] ?? sourceCode)
        return layerChars[mappedCode] != null
    }

    private _isUndoKey(event: DebugCliInputKey) {
        return event.rawEvent?.key?.toLowerCase() === 'z' || event.keyCode === DebugCliKeyCode.Z
    }

    private _isPartOfWord(char: string) {
        return /^[A-Za-z0-9_]$/.test(char)
    }

    private _moveCursorToPreviousWord() {
        while (this._cursorPos > 0 && !this._isPartOfWord(this._command[this._cursorPos - 1])) {
            this._cursorPos--
        }
        while (this._cursorPos > 0 && this._isPartOfWord(this._command[this._cursorPos - 1])) {
            this._cursorPos--
        }
    }

    private _moveCursorToNextWord() {
        while (
            this._cursorPos < this._command.length - 1 &&
            this._isPartOfWord(this._command[this._cursorPos + 1])
        ) {
            this._cursorPos++
        }
        while (
            this._cursorPos < this._command.length - 1 &&
            !this._isPartOfWord(this._command[this._cursorPos + 1])
        ) {
            this._cursorPos++
        }
        this._cursorPos = Math.min(this._cursorPos + 1, this._command.length)
    }

    private _showCursorNow() {
        this._cursorBlinkElapsed = 0
        this._cursorVisible = true
        this._refreshInputText()
    }

    private _refreshInputText() {
        if (!this._textRenderer) return

        this._syncNativeTextInput()
        const visibleText = this._command.slice(this._leftPos)
        this._refreshInputTextColor()
        this._textRenderer.string = visibleText
        this._textRenderer.forceRebuild()
        this._refreshCompletion()
        if (this._selectionTextRenderer) {
            this._selectionTextRenderer.string = visibleText
            this._selectionTextRenderer.forceRebuild()
        }
        this._refreshSelection()
        this._refreshCursor()
    }

    private _refreshInputTextColor() {
        const color = this._commandTextColor()
        if (this._textRenderer && !this._textRenderer.fontColor.equals(color)) {
            this._textRenderer.fontColor = color
            this._textRenderer.forceRebuild()
        }
    }

    private _commandTextColor() {
        if (
            this._commandFlashTicks > 0 &&
            Math.floor(this._commandFlashTicks) % COMMAND_FLASH_PERIOD_TICKS < COMMAND_FLASH_PERIOD_TICKS / 2
        ) {
            return new Color(255, 0, 0, 255)
        }
        return COMMAND_COLOR
    }

    private _refreshCompletion() {
        if (!this._completionNode || !this._completionRenderer) return

        const suffix = this._getCompletionSuffix()
        if (!suffix) {
            this._completionNode.active = false
            this._completionRenderer.string = ''
            return
        }

        const commandWidth = this._measureText(this._command.slice(this._leftPos, this._cursorPos))
        const maxWidth = this._inputTextMaxWidth()
        const remainingWidth = maxWidth - commandWidth
        if (remainingWidth <= 0) {
            this._completionNode.active = false
            this._completionRenderer.string = ''
            return
        }

        this._completionNode.active = true
        this._completionNode.setPosition(this._inputTextX() + commandWidth, INPUT_TEXT_TOP_Y, 0)
        setUISize(this._completionNode, remainingWidth, INPUT_HEIGHT, 0, 1)
        this._completionRenderer.maxWidth = 0
        this._completionRenderer.string = suffix
        this._completionRenderer.forceRebuild()
    }

    private _getCompletionSuffix() {
        if (!this._hasInputFocus || this._hasSelection()) return ''
        if (this._cursorPos !== this._command.length) return ''

        const completion = getDebugCliCompletion(this._command)
        if (completion && completion.length > this._command.length) {
            return completion.slice(this._command.length)
        }
        return getDebugCliParameterHint(this._command)
    }

    private _refreshSelection() {
        if (!this._selectionGraphics || !this._selectionTextClip || !this._selectionTextNode) return

        this._selectionGraphics.clear()
        this._selectionTextClip.active = false
        if (!this._hasSelection()) return

        const start = this._selectionStart()
        const end = this._selectionEnd()
        const startX = this._measureText(this._command.slice(this._leftPos, start))
        const endX = this._measureText(this._command.slice(this._leftPos, end))
        const maxWidth = this._inputTextMaxWidth()
        const visibleStartX = Math.max(0, Math.min(maxWidth, startX))
        const visibleEndX = Math.max(0, Math.min(maxWidth, endX))
        if (visibleEndX <= visibleStartX) return

        const selectionWidth = visibleEndX - visibleStartX
        this._selectionGraphics.fillColor = SELECTION_COLOR
        this._selectionGraphics.rect(
            visibleStartX,
            -INPUT_HEIGHT / 2 + 4,
            selectionWidth,
            INPUT_HEIGHT - 8,
        )
        this._selectionGraphics.fill()

        this._selectionTextClip.active = true
        this._selectionTextClip.setPosition(this._inputTextX() + visibleStartX, 0, 0)
        setUISize(this._selectionTextClip, selectionWidth, INPUT_HEIGHT, 0, 0.5)
        this._selectionTextNode.setPosition(-visibleStartX, INPUT_TEXT_TOP_Y, 0)
    }

    private _refreshCursor() {
        if (!this._cursorNode || !this._cursorGraphics) return

        this._cursorNode.active = this._hasInputFocus && this._cursorVisible && !this._hasSelection()
        this._cursorNode.setPosition(
            this._inputTextX() +
                this._measureText(this._command.slice(this._leftPos, this._cursorPos)),
            0,
            0,
        )

        this._cursorGraphics.clear()
        this._cursorGraphics.fillColor = CURSOR_COLOR
        this._cursorGraphics.rect(0, -INPUT_HEIGHT / 2 + 3, CURSOR_WIDTH, INPUT_HEIGHT - 6)
        this._cursorGraphics.fill()
    }

    private _focusCursor(bigJump: boolean) {
        while (this._cursorPos < this._leftPos) {
            this._leftPos = Math.max(0, this._leftPos - (bigJump ? 10 : 1))
        }

        while (
            this._inputTextMaxWidth() > 0 &&
            this._measureText(this._command.slice(this._leftPos, this._cursorPos)) >=
                this._inputTextMaxWidth()
        ) {
            this._leftPos = Math.min(this._leftPos + (bigJump ? 10 : 1), this._command.length - 1)
        }

        this._leftPos = Math.max(0, Math.min(this._leftPos, this._command.length))
    }

    private _enforceMaxPixels() {
        while (
            this._command.length > 0 &&
            this._measureText(this._command) > this._inputTextMaxWidth()
        ) {
            this._command = this._command.slice(0, -1)
        }
    }

    private _inputTextX() {
        return -this._inputWidth / 2 + INPUT_CLIP_LEFT
    }

    private _inputTextMaxWidth() {
        return this._inputWidth - INPUT_CLIP_LEFT - INPUT_CLIP_RIGHT
    }

    private _measureText(text: string) {
        return FontMetricsUtil.measureTextWidth(this._commandFont?.config ?? null, text)
    }

    private _setInputFocus(focused: boolean) {
        if (this._hasInputFocus === focused) {
            if (focused) this._focusNativeTextInput()
            return
        }

        this._hasInputFocus = focused
        if (focused) {
            this._focusNativeTextInput()
            this._showCursorNow()
        } else {
            this._blurNativeTextInput()
            this._draggingSelection = false
            this._cursorVisible = false
            this._refreshCompletion()
            this._refreshCursor()
        }
    }

    private _bindInputPointerEvents(inputRoot: Node) {
        inputRoot.on(Node.EventType.TOUCH_START, this._onInputPointerDown, this)
        inputRoot.on(Node.EventType.TOUCH_MOVE, this._onInputPointerMove, this)
        inputRoot.on(Node.EventType.TOUCH_END, this._onInputPointerUp, this)
        inputRoot.on(Node.EventType.TOUCH_CANCEL, this._onInputPointerUp, this)
        inputRoot.on(Node.EventType.MOUSE_ENTER, this._onInputMouseEnter, this)
        inputRoot.on(Node.EventType.MOUSE_LEAVE, this._onInputMouseLeave, this)
    }

    private _unbindInputPointerEvents(inputRoot: Node) {
        inputRoot.off(Node.EventType.TOUCH_START, this._onInputPointerDown, this)
        inputRoot.off(Node.EventType.TOUCH_MOVE, this._onInputPointerMove, this)
        inputRoot.off(Node.EventType.TOUCH_END, this._onInputPointerUp, this)
        inputRoot.off(Node.EventType.TOUCH_CANCEL, this._onInputPointerUp, this)
        inputRoot.off(Node.EventType.MOUSE_ENTER, this._onInputMouseEnter, this)
        inputRoot.off(Node.EventType.MOUSE_LEAVE, this._onInputMouseLeave, this)
    }

    private _onInputPointerDown(event: EventTouch) {
        event.propagationStopped = true
        this._setInputFocus(true)
        this._draggingSelection = true
        this._hilitePos = -1
        this._cursorPos = this._getCharAtEvent(event)
        this._focusCursor(false)
        this._showCursorNow()
    }

    private _onInputPointerMove(event: EventTouch) {
        event.propagationStopped = true
        if (!this._draggingSelection) return

        if (this._hilitePos === -1) this._hilitePos = this._cursorPos
        this._cursorPos = this._getCharAtEvent(event)
        if (this._hilitePos === this._cursorPos) this._hilitePos = -1
        this._focusCursor(false)
        this._showCursorNow()
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
        if (!this.isTopDialog()) return
        if (!this._hasInputFocus) return
        if (event.key === 'Enter' || event.key === 'Escape') return
        if (sys.isMobile && this._nativeTextInput?.node?.isValid) return

        this._handleInputKey({
            keyCode: event.keyCode,
            rawEvent: {
                key: event.key,
                ctrlKey: event.ctrlKey,
            },
        })
        event.preventDefault()
        event.stopPropagation()
    }

    private _onInputFocusLost() {
        this._setInputFocus(false)
    }

    private _onGlobalPointerDown(event: EventMouse | EventTouch) {
        if (!this._inputRoot?.isValid) {
            this._setInputFocus(false)
            return
        }

        const transform = this._inputRoot.getComponent(UITransform)
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

    private _getCharAtEvent(event: EventTouch) {
        if (!this._inputRoot?.isValid) return this._cursorPos

        const transform = this._inputRoot.getComponent(UITransform)
        if (!transform) return this._cursorPos

        const uiLocation = event.getUILocation()
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0))
        return this._getCharAt(local.x + this._inputWidth / 2)
    }

    private _getCharAt(x: number) {
        let pos = this._leftPos
        for (let i = this._leftPos; i < this._command.length; i++) {
            const low = this._measureText(this._command.slice(this._leftPos, i))
            const high = this._measureText(this._command.slice(this._leftPos, i + 1))
            if (x >= (low + high) / 2 + 5) pos = i + 1
        }
        return Math.max(0, Math.min(this._command.length, pos))
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

        const oldCommand = this._command
        const oldCursor = this._cursorPos
        const oldHilitePos = this._hilitePos
        const start = this._selectionStart()
        const end = this._selectionEnd()
        this._resetHistoryNavigation()
        this._command = this._command.slice(0, start) + this._command.slice(end)
        this._cursorPos = start
        this._hilitePos = -1
        this._setUndoSnapshot(oldCommand, oldCursor, oldHilitePos)
        this._lastModifyIdx = -1
        return true
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

    private _destroyInput(preserveNativeTextInput = false) {
        this._draggingSelection = false
        this._setCanvasCursor('')
        const nativeInputNode = this._nativeTextInput?.node
        if (nativeInputNode?.isValid) {
            if (preserveNativeTextInput) {
                if (nativeInputNode.parent === this._inputRoot) nativeInputNode.setParent(this.node)
            } else {
                nativeInputNode.off(EditBox.EventType.TEXT_CHANGED, this._onNativeTextInputChanged, this)
                nativeInputNode.off(EditBox.EventType.EDITING_RETURN, this._onNativeTextInputReturn, this)
                this._nativeTextInput?.blur()
                this._unlockMobilePageScroll()
            }
        }
        if (!preserveNativeTextInput) this._unlockMobilePageScroll()
        if (this._inputRoot?.isValid) {
            this._unbindInputPointerEvents(this._inputRoot)
            this._inputRoot.destroy()
        }
        this._inputRoot = null
        if (!preserveNativeTextInput) this._nativeTextInput = null
        this._syncingNativeTextInput = false
        this._textNode = null
        this._textRenderer = null
        this._completionNode = null
        this._completionRenderer = null
        this._selectionNode = null
        this._selectionGraphics = null
        this._selectionTextClip = null
        this._selectionTextNode = null
        this._selectionTextRenderer = null
        this._cursorNode = null
        this._cursorGraphics = null
        this._commandFont = null
    }
}
