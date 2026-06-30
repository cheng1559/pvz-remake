import {
    _decorator,
    Color,
    EventKeyboard,
    EventMouse,
    EventTouch,
    game,
    Game,
    input,
    Input,
    Mask,
    Node,
    UITransform,
} from 'cc'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import {
    type DebugCliResult,
    getDebugCliCompletion,
    getDebugCliCompletions,
    getDebugCliParameterHint,
} from '@/ui/DebugCliDialog/DebugCliCommands'
import { drawImageBox } from '@/ui/ImageBox'
import { DialogResult, MessageBox } from '@/ui/MessageBox/MessageBox'
import {
    SelfDrawTextInput,
    TextInputKeyCode,
    type TextInputKey,
} from '@/ui/TextInput'
import { createUINode, setUISize } from '@/ui/UIFactory'

const { ccclass } = _decorator

const INPUT_HEIGHT = 28
const INPUT_BORDER_X = 8
const INPUT_BORDER_Y = 4
const INPUT_LEFT_INSET = 48
const INPUT_RIGHT_INSET = 58
const INPUT_CENTER_FROM_BOTTOM = 141
const INPUT_CLIP_LEFT = 4
const INPUT_CLIP_RIGHT = 8
const MAX_COMMAND_LENGTH = 120
const ORIGINAL_FRAME_SECONDS = 0.01
const COMMAND_FLASH_TICKS = 70
const COMMAND_FLASH_PERIOD_TICKS = 20
const COMMAND_FONT = 'briannetod16'
export const DEBUG_CLI_PRELOAD = {
    sprites: ['editbox'],
    fonts: [COMMAND_FONT],
}
const COMMAND_COLOR = new Color(240, 240, 255, 255)
const COMPLETION_COLOR = new Color(240, 240, 255, 95)
const COMMAND_HISTORY_LIMIT = 64

@ccclass('DebugCliDialog')
export class DebugCliDialog extends MessageBox {
    private static _commandHistory: string[] = []

    public onCommand: ((command: string) => DebugCliResult) | null = null
    public initialCommand = ''
    public lastCommandResult: DebugCliResult | null = null

    private _inputRoot: Node | null = null
    private _textInput: SelfDrawTextInput | null = null
    private _command = ''
    private _inputWidth = 0
    private _historyIndex = -1
    private _historyDraft = ''
    private _completionCycleBaseCommand = ''
    private _completionCycleCandidates: string[] = []
    private _completionCycleIndex = -1
    private _commandFlashTicks = 0
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
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalPointerDown, this)
        input.on(Input.EventType.TOUCH_START, this._onGlobalPointerDown, this)
        game.on(Game.EVENT_HIDE, this._onInputFocusLost, this)
    }

    onDisable() {
        if (this.node.isValid) {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        input.off(Input.EventType.MOUSE_DOWN, this._onGlobalPointerDown, this)
        input.off(Input.EventType.TOUCH_START, this._onGlobalPointerDown, this)
        game.off(Game.EVENT_HIDE, this._onInputFocusLost, this)
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
        this._textInput?.update(dt)
    }

    onDestroy() {
        this._destroyInput()
        super.onDestroy()
    }

    protected onDialogRendered(actualWidth: number, actualHeight: number) {
        void this._renderInput(actualWidth, actualHeight)
    }

    public requestNativeTextInputFocus() {
        this._textInput?.focus()
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        if (event.keyCode === TextInputKeyCode.Enter) {
            this._captureCommand()
            this._submitCommand()
            return
        }

        if (event.keyCode === TextInputKeyCode.Escape) {
            this.close()
            return
        }

        event.propagationStopped = true
        this._textInput?.handleDialogKeyDown(event)
    }

    private async _renderInput(dialogWidth: number, dialogHeight: number) {
        this._destroyInput()

        const [editBoxFrame, commandFont] = await Promise.all([
            SpriteLoader.load('editbox'),
            FontLoader.load(COMMAND_FONT),
        ])
        const dialogNode = this.node as Node | null | undefined
        if (!dialogNode?.isValid) return
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

        if (!editBoxFrame) return
        drawImageBox(
            inputRoot,
            editBoxFrame,
            this._inputWidth + INPUT_BORDER_X * 2,
            INPUT_HEIGHT + INPUT_BORDER_Y * 2,
            'CommandInputBackgroundTile',
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
        this._textInput = new SelfDrawTextInput({
            root: inputRoot,
            parent: editNode,
            width: this._inputWidth,
            height: INPUT_HEIGHT,
            font: commandFont,
            maxLength: MAX_COMMAND_LENGTH,
            value: this._command,
            textColor: this._commandTextColor(),
            completionColor: COMPLETION_COLOR,
            textX: INPUT_CLIP_LEFT,
            textRight: INPUT_CLIP_RIGHT,
            nativeName: 'NativeCommandTextInput',
            isActive: () => this.isTopDialog(),
            isAllowedChar: (char) => this._isAllowedInputChar(char, commandFont),
            getCompletionSuffix: () => this._getCompletionSuffix(),
            acceptCompletion: () => this._acceptCompletion(),
            onBeforeKey: (event) => {
                if (event.keyCode !== TextInputKeyCode.Tab) this._resetCompletionCycle()
            },
            onSpecialKey: (event) => this._handleCommandSpecialKey(event),
            onBeforeEdit: () => this._resetHistoryNavigation(),
            onChange: (value, userEdit) => {
                this._command = value
                if (userEdit) this._closeIfEmpty()
            },
            onReturn: () => {
                this._captureCommand()
                this._submitCommand()
            },
        })
        this._textInput.focus()
        this.scheduleOnce(() => this._textInput?.focus(), 0)

        const transform = dialogNode.getComponent(UITransform)
        if (transform) transform.setContentSize(dialogWidth, dialogHeight)
    }

    private _handleCommandSpecialKey(event: TextInputKey) {
        switch (event.keyCode) {
            case TextInputKeyCode.Tab:
                if (this._acceptCompletion()) return true
                return true
            case TextInputKeyCode.Up:
                if (this._navigateHistory(-1)) return true
                return true
            case TextInputKeyCode.Down:
                if (this._navigateHistory(1)) return true
                return true
            default:
                return false
        }
    }

    private _captureCommand() {
        this._command = this._textInput?.value.trim() ?? this._command.trim()
        this._textInput?.setValue(this._command, this._command.length)
        this._commitHistory(this._command)
        this._historyIndex = -1
        this._historyDraft = ''
        this._resetCompletionCycle()
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

        this._textInput?.blur()
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
        this._textInput?.focus()
    }

    private _flashInvalidCommand() {
        this._commandFlashTicks = COMMAND_FLASH_TICKS
        this._refreshInputTextColor()
        this._textInput?.showCursorNow()
        void SoundLoader.play(SoundEffect.Buzzer)
    }

    private _setCommand(command: string) {
        this._command = command
        this._textInput?.setValue(command, command.length)
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
        this._resetCompletionCycle()
        this._textInput?.setValue(command, command.length)
        this._textInput?.showCursorNow()
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
        if (this._textInput?.hasSelection) return false
        if (this._textInput?.cursorPos !== this._command.length) return false

        const completion = this._getNextCompletion()
        if (!completion || completion === this._command) return false

        this._resetHistoryNavigation()
        this._textInput?.setValue(completion, completion.length)
        this._textInput?.showCursorNow()
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

    private _isAllowedInputChar(char: string, commandFont: BitmapFontAssets | null) {
        return this._isPrintableAscii(char) && this._hasCommandFontGlyph(char, commandFont)
    }

    private _isPrintableAscii(char: string) {
        const code = char.charCodeAt(0)
        return code >= 32 && code <= 126
    }

    private _hasCommandFontGlyph(char: string, commandFont: BitmapFontAssets | null) {
        if (char === ' ') return true

        const config = commandFont?.config.json as
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

    private _refreshInputTextColor() {
        const color = this._commandTextColor()
        this._textInput?.setTextColor(color)
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

    private _getCompletionSuffix() {
        if (!this._textInput?.hasFocus || this._textInput.hasSelection) return ''
        if (this._textInput.cursorPos !== this._command.length) return ''

        const completion = getDebugCliCompletion(this._command)
        if (completion && completion.length > this._command.length) {
            return completion.slice(this._command.length)
        }
        return getDebugCliParameterHint(this._command)
    }

    private _onInputFocusLost() {
        this._textInput?.blur()
    }

    private _onGlobalPointerDown(event: EventMouse | EventTouch) {
        this._textInput?.handleGlobalPointer(event)
    }

    private _destroyInput() {
        this._textInput?.destroy()
        if (this._inputRoot?.isValid) {
            this._inputRoot.destroy()
        }
        this._inputRoot = null
        this._textInput = null
    }
}
