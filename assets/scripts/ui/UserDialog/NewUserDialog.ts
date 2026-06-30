import {
    _decorator,
    Color,
    EventKeyboard,
    Mask,
    Node,
} from 'cc'
import { FontLoader } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { drawImageBox } from '@/ui/ImageBox'
import { DialogResult, MessageBox } from '@/ui/MessageBox/MessageBox'
import { SelfDrawTextInput, TextInputKeyCode } from '@/ui/TextInput'
import { createUINode, setUISize } from '@/ui/UIFactory'

const { ccclass } = _decorator

const USER_TEXT_FONT = 'briannetod16'
const NEW_USER_DIALOG_EXTRA_WIDTH = 110
const NEW_USER_DIALOG_EXTRA_HEIGHT = 40
const NAME_INPUT_LEFT = 48
const NAME_INPUT_RIGHT = 58
const NAME_INPUT_CENTER_FROM_BOTTOM = 141
const NAME_INPUT_HEIGHT = 28
const NAME_INPUT_BORDER_X = 8
const NAME_INPUT_BORDER_Y = 4
const NAME_INPUT_MAX_CHARS = 12
const NAME_INPUT_COLOR = new Color(240, 240, 255, 255)
const NAME_INPUT_TEXT_X = 4

interface NameDialogStrings {
    title: string
    prompt: string
    ok: string
    cancel: string
}

type NameDialogMode = 'new' | 'rename'

@ccclass('NewUserDialog')
export class NewUserDialog extends MessageBox {
    public mode: NameDialogMode = 'new'
    public initialName = ''
    public requireNameBeforeCancel = false
    public onSubmitName: ((name: string) => void) | null = null
    public onEmptyName: (() => void) | null = null

    private _strings: NameDialogStrings = {
        title: 'NEW USER',
        prompt: 'Please enter your name:',
        ok: 'OK',
        cancel: 'Cancel',
    }
    private _inputRoot: Node | null = null
    private _input: SelfDrawTextInput | null = null
    private _name = ''
    private _finishing = false

    configure(args: {
        mode: NameDialogMode
        initialName?: string
        strings: NameDialogStrings
    }) {
        this.mode = args.mode
        this.initialName = args.initialName ?? ''
        this._name = this._filterNameInput(this.initialName)
        this._strings = args.strings
        this.title = args.strings.title
        this.message = args.strings.prompt
        this.dialogType = 0
        this.verticalCenterText = false
        this.extraWidth = NEW_USER_DIALOG_EXTRA_WIDTH
        this.extraHeight = NEW_USER_DIALOG_EXTRA_HEIGHT
        this.setMessageLayout(0, -5, 2)
        this.setButtons([
            {
                label: args.strings.ok,
                result: DialogResult.Ok,
                finishOnClick: false,
                localize: false,
                onClick: () => this._submit(),
            },
            {
                label: args.strings.cancel,
                result: DialogResult.Cancel,
                finishOnClick: false,
                localize: false,
                onClick: () => this._cancel(),
            },
        ])
    }

    protected onDialogRendered(actualWidth: number, actualHeight: number) {
        void this._renderInput(actualWidth, actualHeight)
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        if (event.keyCode === TextInputKeyCode.Enter) {
            this._submit()
            return
        }
        if (event.keyCode === TextInputKeyCode.Escape) {
            this._cancel()
            return
        }
        this._input?.handleDialogKeyDown(event)
    }

    update(dt: number) {
        super.update()
        this._input?.update(dt)
    }

    requestInputFocus() {
        this._input?.focus()
    }

    finishInputDialog() {
        this._finishing = true
        this.close()
    }

    getName() {
        const input = this._input?.value ?? this._name
        let result = ''
        let lastChar = ' '
        for (let i = 0; i < input.length; i++) {
            const char = input[i]
            if (char !== ' ') {
                result += char
            } else if (lastChar !== ' ') {
                result += ' '
            }
            lastChar = char
        }
        return result.endsWith(' ') ? result.slice(0, -1) : result
    }

    private async _renderInput(dialogWidth: number, dialogHeight: number) {
        this._destroyInput()

        const inputWidth = dialogWidth - NAME_INPUT_LEFT - NAME_INPUT_RIGHT
        const inputRoot = createUINode('NameInputRoot', {
            parent: this.node,
            anchorX: 0.5,
            anchorY: 0.5,
            width: inputWidth + NAME_INPUT_BORDER_X * 2,
            height: NAME_INPUT_HEIGHT + NAME_INPUT_BORDER_Y * 2,
            x: NAME_INPUT_LEFT + inputWidth / 2 - dialogWidth / 2,
            y: -dialogHeight / 2 + NAME_INPUT_CENTER_FROM_BOTTOM,
        })
        this._inputRoot = inputRoot

        const [editBoxFrame, inputFont] = await Promise.all([
            SpriteLoader.load('editbox'),
            FontLoader.load(USER_TEXT_FONT),
        ])
        if (!inputRoot.isValid || this._inputRoot !== inputRoot) return
        if (editBoxFrame) {
            drawImageBox(
                inputRoot,
                editBoxFrame,
                inputWidth + NAME_INPUT_BORDER_X * 2,
                NAME_INPUT_HEIGHT + NAME_INPUT_BORDER_Y * 2,
                'NameInputBackgroundTile',
            )
        }

        const inputNode = createUINode('NameInput', {
            parent: inputRoot,
            anchorX: 0.5,
            anchorY: 0.5,
            width: inputWidth,
            height: NAME_INPUT_HEIGHT,
        })
        setUISize(inputNode, inputWidth, NAME_INPUT_HEIGHT)
        inputNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT

        this._input = new SelfDrawTextInput({
            root: inputRoot,
            parent: inputNode,
            width: inputWidth,
            height: NAME_INPUT_HEIGHT,
            font: inputFont,
            maxLength: NAME_INPUT_MAX_CHARS,
            value: this._name,
            textColor: NAME_INPUT_COLOR,
            textX: NAME_INPUT_TEXT_X,
            enforceMaxPixels: false,
            nativeName: 'NativeNameTextInput',
            isActive: () => this.isTopDialog(),
            isAllowedChar: (char) => this._isAllowedNameChar(char),
            sanitizeText: (value) => this._filterNameInput(value),
            onChange: (value) => {
                this._name = value
            },
            onReturn: () => this._submit(),
        })
        this.scheduleOnce(() => {
            this.requestInputFocus()
            if (this.mode === 'rename') this._input?.selectAll()
        }, 0)
    }

    private _submit() {
        const name = this.getName()
        if (!name) {
            if (this.mode === 'new') {
                this.onEmptyName?.()
            }
            return
        }
        this.onSubmitName?.(name)
    }

    private _cancel() {
        if (this._finishing) return
        if (this.requireNameBeforeCancel) {
            this.onEmptyName?.()
            return
        }
        this._finishing = true
        this.close()
    }

    private _filterNameInput(value: string) {
        let filtered = ''
        for (const char of value) {
            if (this._isAllowedNameChar(char)) {
                filtered += char
            }
            if (filtered.length >= NAME_INPUT_MAX_CHARS) break
        }
        if (filtered.length > 0 && filtered[0] >= 'a' && filtered[0] <= 'z') {
            filtered = filtered[0].toUpperCase() + filtered.slice(1)
        }
        return filtered
    }

    private _isAllowedNameChar(char: string) {
        return (
            (char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            (char >= '0' && char <= '9') ||
            char === ' '
        )
    }

    private _destroyInput() {
        this._input?.destroy()
        if (this._inputRoot?.isValid) {
            this._inputRoot.destroy()
        }
        this._inputRoot = null
        this._input = null
    }

    onDestroy() {
        this._destroyInput()
        super.onDestroy()
    }
}
