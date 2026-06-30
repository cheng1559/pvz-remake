import {
    _decorator,
    Color,
    EventMouse,
    EventKeyboard,
    Graphics,
    Node,
    Vec3,
} from 'cc'
import { FontLoader } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import type { PlayerProfileSummary } from '@/game/persistence/ProfileStore'
import { UIButton } from '@/ui/Button'
import { DialogResult, MessageBox } from '@/ui/MessageBox/MessageBox'
import { MessageBoxAssets } from '@/ui/MessageBox/MessageBoxAssets'
import { createStoneButton } from '@/ui/StoneButton'
import { createUINode } from '@/ui/UIFactory'

const { ccclass } = _decorator

const TALL_DIALOG_TYPE = 1
const USER_DIALOG_MAX_USERS = 8
const USER_LIST_ITEM_HEIGHT = 24
const USER_LIST_HEIGHT = 200
const USER_LIST_LEFT = 66
const USER_LIST_TOP = 138
const USER_LIST_EXTRA_WIDTH = 142
const USER_DIALOG_EXTRA_WIDTH = 210
const USER_DIALOG_EXTRA_HEIGHT = 270
const USER_TEXT_FONT = 'briannetod16'
const USER_LIST_BACKGROUND = new Color(23, 24, 35, 255)
const USER_LIST_OUTLINE = new Color(0, 0, 0, 255)
const USER_LIST_TEXT = new Color(235, 225, 180, 255)
const USER_LIST_HOVER_TEXT = new Color(255, 255, 255, 255)
const USER_LIST_SELECTED_BACKGROUND = new Color(20, 180, 15, 255)
const DOUBLE_CLICK_FALLBACK_MS = 500

interface UserDialogStrings {
    title: string
    createNewUser: string
    rename: string
    delete: string
    ok: string
    cancel: string
}

interface UserDialogEntry {
    name: string
    profile: PlayerProfileSummary | null
    createNewUser: boolean
}

@ccclass('UserDialog')
export class UserDialog extends MessageBox {
    public onCreateUserRequest: (() => void) | null = null
    public onRenameUserRequest: ((name: string) => void) | null = null
    public onDeleteUserRequest: ((name: string) => void) | null = null
    public onSelectUserRequest: ((name: string) => void) | null = null

    private _entries: UserDialogEntry[] = []
    private _numUsers = 0
    private _selectedIndex = 0
    private _strings: UserDialogStrings = {
        title: 'WHO ARE YOU?',
        createNewUser: '(Create a New User)',
        rename: 'Rename',
        delete: 'Delete',
        ok: 'OK',
        cancel: 'Cancel',
    }
    private _listRoot: Node | null = null
    private _extraButtonRoot: Node | null = null
    private _hoveredRows = new Set<number>()
    private _lastPressIndex = -1
    private _lastPressTime = 0
    private _suppressReleaseIndex = -1

    configure(args: {
        profiles: PlayerProfileSummary[]
        currentProfileId: number | null
        strings: UserDialogStrings
    }) {
        this._strings = args.strings
        this.title = args.strings.title
        this.message = ''
        this.dialogType = TALL_DIALOG_TYPE
        this.verticalCenterText = false
        this.extraWidth = USER_DIALOG_EXTRA_WIDTH
        this.extraHeight = USER_DIALOG_EXTRA_HEIGHT
        this.setButtons([
            {
                label: args.strings.ok,
                result: DialogResult.Ok,
                finishOnClick: false,
                localize: false,
                onClick: () => this._confirmSelection(),
            },
            { label: args.strings.cancel, result: DialogResult.Cancel, localize: false },
        ])
        this._entries = this._buildEntries(args.profiles, args.currentProfileId)
        this._numUsers = this._entries.filter((entry) => !entry.createNewUser).length
        this._selectedIndex = Math.max(
            0,
            this._entries.findIndex((entry) => entry.profile?.id === args.currentProfileId),
        )
        if (this._entries[this._selectedIndex]?.createNewUser) this._selectedIndex = 0
    }

    protected onDialogRendered(actualWidth: number, actualHeight: number) {
        this._renderList(actualWidth, actualHeight)
        void this._renderExtraButtons(actualWidth, actualHeight)
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case 38:
                this._setSelectedIndex(this._selectedIndex - 1)
                break
            case 40:
                this._setSelectedIndex(this._selectedIndex + 1)
                break
            case 13:
                this._confirmSelection()
                break
            case 27:
                this.close()
                break
        }
    }

    selectedName() {
        const entry = this._entries[this._selectedIndex]
        return entry && !entry.createNewUser ? entry.name : ''
    }

    finishRenameUser(newName: string) {
        const entry = this._entries[this._selectedIndex]
        if (!entry || entry.createNewUser) return

        entry.name = newName
        if (entry.profile) entry.profile = { ...entry.profile, name: newName }
        void this.renderDialog()
    }

    finishDeleteUser() {
        const entry = this._entries[this._selectedIndex]
        if (!entry || entry.createNewUser) return

        this._entries.splice(this._selectedIndex, 1)
        this._numUsers = Math.max(0, this._numUsers - 1)
        if (this._numUsers === USER_DIALOG_MAX_USERS - 1 && !this._entries.some((item) => item.createNewUser)) {
            this._entries.push({
                name: this._strings.createNewUser,
                profile: null,
                createNewUser: true,
            })
        }
        this._selectedIndex = Math.max(0, Math.min(this._selectedIndex - 1, this._entries.length - 1))
        void this.renderDialog()
    }

    private _buildEntries(profiles: PlayerProfileSummary[], currentProfileId: number | null) {
        const current = profiles.find((profile) => profile.id === currentProfileId) ?? null
        const ordered = [
            ...(current ? [current] : []),
            ...profiles.filter((profile) => profile.id !== currentProfileId),
        ].slice(0, USER_DIALOG_MAX_USERS)
        const entries = ordered.map((profile) => ({
            name: profile.name,
            profile,
            createNewUser: false,
        }))
        if (entries.length < USER_DIALOG_MAX_USERS) {
            entries.push({
                name: this._strings.createNewUser,
                profile: null,
                createNewUser: true,
            })
        }
        return entries
    }

    private async _renderList(actualWidth: number, actualHeight: number) {
        if (this._listRoot?.isValid) this._listRoot.destroy()

        const listWidth = Math.max(0, actualWidth - USER_LIST_EXTRA_WIDTH)
        const listRoot = createUINode('UserList', {
            parent: this.node,
            anchorX: 0,
            anchorY: 1,
            width: listWidth,
            height: USER_LIST_HEIGHT,
            x: -actualWidth / 2 + USER_LIST_LEFT,
            y: actualHeight / 2 - USER_LIST_TOP,
        })
        this._listRoot = listRoot
        this._hoveredRows.clear()

        const graphics = listRoot.addComponent(Graphics)
        graphics.fillColor = USER_LIST_BACKGROUND
        graphics.rect(0, -USER_LIST_HEIGHT, listWidth, USER_LIST_HEIGHT)
        graphics.fill()
        graphics.strokeColor = USER_LIST_OUTLINE
        graphics.lineWidth = 1
        graphics.rect(0, -USER_LIST_HEIGHT, listWidth, USER_LIST_HEIGHT)
        graphics.stroke()

        const font = await FontLoader.load(USER_TEXT_FONT)
        if (!listRoot.isValid || this._listRoot !== listRoot) return

        for (let i = 0; i < this._entries.length; i++) {
            this._createRow(listRoot, listWidth, i, font)
        }
        this._refreshListSelection()
    }

    private _createRow(
        parent: Node,
        listWidth: number,
        index: number,
        font: Awaited<ReturnType<typeof FontLoader.load>>,
    ) {
        const entry = this._entries[index]
        const row = createUINode(`Row_${index}`, {
            parent,
            anchorX: 0,
            anchorY: 1,
            width: listWidth,
            height: USER_LIST_ITEM_HEIGHT,
            x: 0,
            y: -index * USER_LIST_ITEM_HEIGHT,
        })

        const rowBg = createUINode('SelectedBackground', {
            parent: row,
            active: false,
            anchorX: 0,
            anchorY: 1,
            width: listWidth - 2,
            height: USER_LIST_ITEM_HEIGHT - 2,
            x: 1,
            y: -1,
        })
        const rowGraphics = rowBg.addComponent(Graphics)
        rowGraphics.fillColor = USER_LIST_SELECTED_BACKGROUND
        rowGraphics.rect(0, -(USER_LIST_ITEM_HEIGHT - 2), listWidth - 2, USER_LIST_ITEM_HEIGHT - 2)
        rowGraphics.fill()

        const label = createUINode('Label', {
            parent: row,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = label.addComponent(FontRenderer)
        if (font) renderer.setFontAssets(font)
        renderer.string = entry.name
        renderer.fontColor = USER_LIST_TEXT
        renderer.forceRebuild()
        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        const textWidth = FontMetricsUtil.measureTextWidth(font?.config ?? null, entry.name)
        label.setPosition(
            Math.max(0, Math.floor((listWidth - textWidth) / 2)),
            -Math.floor((USER_LIST_ITEM_HEIGHT - metrics.height) / 2) + metrics.ascentPadding,
            0,
        )

        const button = row.addComponent(UIButton)
        button.setVisualSprite(null)
        button.refreshHoverOnEnable = false
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        if (entry.createNewUser) {
            button.onPress = () => {
                this._clearDoubleClickState()
                this.onCreateUserRequest?.()
            }
        } else {
            button.onPress = (event) => this._pressRow(index, event)
            button.onClick = () => this._releaseRow(index)
        }
        button.onStateChange = (state) => {
            const hovered = state === 'hover' || state === 'pressed'
            if (hovered) this._hoveredRows.add(index)
            else this._hoveredRows.delete(index)
            this._refreshRowVisual(index)
        }
    }

    private _refreshListSelection() {
        if (!this._listRoot?.isValid) return
        for (let i = 0; i < this._listRoot.children.length; i++) {
            this._refreshRowVisual(i)
        }
    }

    private _refreshRowVisual(index: number) {
        if (!this._listRoot?.isValid) return
        const row = this._listRoot.children[index]
        if (!row) return

        const entry = this._entries[index]
        const selected = index === this._selectedIndex && (!entry?.createNewUser || this._numUsers === 0)
        row.getChildByName('SelectedBackground')!.active = selected
        const renderer = row.getChildByName('Label')?.getComponent(FontRenderer)
        if (!renderer) return

        renderer.fontColor = this._hoveredRows.has(index) ? USER_LIST_HOVER_TEXT : USER_LIST_TEXT
        renderer.forceRebuild()
    }

    private _pressRow(index: number, event: EventMouse | unknown) {
        const entry = this._entries[index]
        if (!entry || entry.createNewUser) return

        const now = Date.now()
        const eventClickCount = this._eventClickCount(event)
        const doubleClick = eventClickCount >= 2 ||
            (eventClickCount <= 0 && index === this._lastPressIndex && now - this._lastPressTime <= DOUBLE_CLICK_FALLBACK_MS)
        this._lastPressIndex = index
        this._lastPressTime = now

        if (!doubleClick) return

        this._suppressReleaseIndex = index
        this._clearDoubleClickState()
        this._setSelectedIndex(index)
        this._confirmSelection()
    }

    private _releaseRow(index: number) {
        if (this._suppressReleaseIndex === index) {
            this._suppressReleaseIndex = -1
            return
        }
        this._setSelectedIndex(index)
    }

    private _clearDoubleClickState() {
        this._lastPressIndex = -1
        this._lastPressTime = 0
    }

    private _eventClickCount(event: unknown) {
        if (!(event instanceof EventMouse)) return 0
        const nativeEvent = (event as EventMouse & {
            nativeEvent?: { detail?: number, clicks?: number }
            _nativeEvent?: { detail?: number, clicks?: number }
        }).nativeEvent ?? (event as EventMouse & {
            _nativeEvent?: { detail?: number, clicks?: number }
        })._nativeEvent
        return nativeEvent?.clicks ?? nativeEvent?.detail ?? 0
    }

    private _setSelectedIndex(index: number) {
        if (this._entries.length === 0) return
        const maxSelectableIndex = Math.max(0, this._numUsers - 1)
        const next = Math.max(0, Math.min(maxSelectableIndex, index))
        if (this._selectedIndex === next) return
        this._selectedIndex = next
        this._refreshListSelection()
    }

    private _confirmSelection() {
        const entry = this._entries[this._selectedIndex]
        if (!entry) return
        if (entry.createNewUser) {
            this.onCreateUserRequest?.()
            return
        }
        this.onSelectUserRequest?.(entry.name)
    }

    private async _renderExtraButtons(actualWidth: number, actualHeight: number) {
        if (this._extraButtonRoot?.isValid) this._extraButtonRoot.destroy()

        const [sprites, fonts] = await Promise.all([
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
        ])
        if (!sprites || !fonts || !this.node.isValid) return

        const root = createUINode('UserDialogExtraButtons', { parent: this.node })
        this._extraButtonRoot = root

        const insetLeft = 36
        const insetRight = 46
        const insetBottom = 36
        const buttonHeight = sprites.left.originalSize.height
        const buttonMinWidth = sprites.left.originalSize.width + sprites.right.originalSize.width
        const buttonMidWidth = sprites.middle.originalSize.width
        const buttonAreaX = insetLeft - 5
        const buttonAreaY = actualHeight - insetBottom - buttonHeight + 2 + 5
        const buttonAreaWidth = actualWidth - insetRight - insetLeft + 8
        const roundExtra = (extra: number) => {
            if (extra <= 0) return 0
            const rem = extra % buttonMidWidth
            return rem ? extra + buttonMidWidth - rem : extra
        }
        const buttonWidth = buttonMinWidth + roundExtra(Math.floor((buttonAreaWidth - 10) / 2) - buttonMidWidth - buttonMinWidth + 1)
        const renameX = buttonAreaX - actualWidth / 2
        const deleteX = buttonAreaWidth - buttonWidth + buttonAreaX - actualWidth / 2
        const buttonY = actualHeight / 2 - (buttonAreaY - buttonHeight)

        createStoneButton({
            name: 'RenameButton',
            parent: root,
            label: this._strings.rename,
            x: renameX,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight,
            sprites,
            fonts,
            onClick: () => {
                const name = this.selectedName()
                if (name) this.onRenameUserRequest?.(name)
            },
        })
        createStoneButton({
            name: 'DeleteButton',
            parent: root,
            label: this._strings.delete,
            x: deleteX,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight,
            sprites,
            fonts,
            onClick: () => {
                const name = this.selectedName()
                if (name) this.onDeleteUserRequest?.(name)
            },
        })
    }
}
