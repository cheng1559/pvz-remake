import {
    _decorator,
    Node,
    UITransform,
    SpriteFrame,
    Layers,
    Enum,
    Color,
    Vec3,
    EventKeyboard,
} from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { ModalDialog } from '@/ui/Dialog'
import {
    buildNineSliceGrid,
    buildThreeSliceRow,
    createSpriteNode,
    createUINode,
    setUISize,
} from '@/ui/UIFactory'
import { MessageBoxAssets, MessageBoxButtonSprites } from './MessageBoxAssets'

const { ccclass, property } = _decorator

export interface MessageBoxButton {
    label: string
    result?: DialogResult
    width?: number
    height?: number
    finishOnClick?: boolean
    onClick?: () => void
}

export const DialogResult = {
    None: 0x7fffffff,
    Yes: 1000,
    No: 1001,
    Ok: 1000,
    Cancel: 1001,
    Footer: 1000,
} as const

export type DialogResult = number

export enum DialogButtonMode {
    None,
    YesNo,
    OkCancel,
    Footer,
}

/**
 * Dialog bottom style
 */
enum DialogType {
    Standard,
    TallBottom,
}

@ccclass('MessageBox')
export class MessageBox extends ModalDialog {
    @property
    dialogWidth: number = 400

    @property
    dialogHeight: number = 300

    @property({ type: Enum(DialogType) })
    dialogType: DialogType = DialogType.Standard

    @property
    title: string = ''

    @property
    message: string = ''

    @property
    buttonDelay: number = -1

    @property
    verticalCenterText: boolean = true

    @property
    messageMaxWidth: number = 0

    @property
    messageOffsetY: number = 0

    @property
    messageAlign: number = 2

    @property
    spaceAfterHeader: number = 10

    @property
    extraHeight: number = 0

    @property
    extraWidth: number = 0

    @property
    contentInsetTopExtra: number = 0

    private _bgContainer: Node | null = null
    private _buttonContainer: Node | null = null
    private _titleNode: Node | null = null
    private _titleRenderer: FontRenderer | null = null
    private _messageNode: Node | null = null
    private _messageRenderer: FontRenderer | null = null
    private _buttons: MessageBoxButton[] = []
    private _buttonNodes: Node[] = []
    private _buttonStates: Map<Node, UIButton> = new Map()
    private _result: DialogResult = DialogResult.None
    private _started = false
    private _updateCount = 0
    private _renderVersion = 0
    private _resolveResult: ((result: DialogResult) => void) | null = null

    start() {
        this._started = true
        this.createModalBlocker()
        this.renderDialog()
    }

    update() {
        this._updateCount++
        if (this.buttonDelay >= 0 && this._updateCount > this.buttonDelay) {
            this.setButtonDelay(-1)
        }
    }

    /**
     * Set buttons for this dialog. Call before or after renderDialog.
     */
    setButtons(buttons: MessageBoxButton[]) {
        this._buttons = buttons
        if (this._started) {
            this.renderDialog()
        }
    }

    setButtonMode(mode: DialogButtonMode, footer = 'OK', cancel = 'Cancel') {
        switch (mode) {
            case DialogButtonMode.YesNo:
                this.setButtons([
                    { label: 'Yes', result: DialogResult.Yes },
                    { label: 'No', result: DialogResult.No },
                ])
                break
            case DialogButtonMode.OkCancel:
                this.setButtons([
                    { label: footer, result: DialogResult.Ok },
                    { label: cancel, result: DialogResult.Cancel },
                ])
                break
            case DialogButtonMode.Footer:
                this.setButtons([{ label: footer, result: DialogResult.Footer }])
                break
            default:
                this.setButtons([])
                break
        }
    }

    setButtonDelay(frames: number) {
        this.buttonDelay = frames
        this._updateCount = 0
        this._setButtonsInteractable(frames < 0)
    }

    setMessageLayout(maxWidth = 0, offsetY = 0, align = 2) {
        this.messageMaxWidth = maxWidth
        this.messageOffsetY = offsetY
        this.messageAlign = align
        if (this._started) {
            this.renderDialog()
        }
    }

    waitForResult(): Promise<DialogResult> {
        if (this._result !== DialogResult.None) return Promise.resolve(this._result)
        return new Promise((resolve) => {
            this._resolveResult = resolve
        })
    }

    /**
     * Close and destroy this dialog along with its modal blocker.
     */
    close() {
        if (this._result === DialogResult.None) {
            this._finish(DialogResult.Cancel)
            return
        }
        super.close()
    }

    onDestroy() {
        super.onDestroy()
        this._destroyFontNode(this._titleNode)
        this._destroyFontNode(this._messageNode)
        this._titleNode = null
        this._messageNode = null
        this._titleRenderer = null
        this._messageRenderer = null
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        if (this._result !== DialogResult.None) return
        switch (event.keyCode) {
            case 32: // Space
            case 13: // Enter
            case 89: // Y
                this._finish(DialogResult.Yes)
                break
            case 27: // Escape
            case 78: // N
                if (
                    this._buttons.some(
                        (b) => b.result === DialogResult.No || b.result === DialogResult.Cancel,
                    )
                ) {
                    this._finish(DialogResult.No)
                }
                break
        }
    }

    async renderDialog() {
        const renderVersion = ++this._renderVersion
        if (!this._bgContainer) {
            this._bgContainer = createUINode('BackgroundContainer', { parent: this.node })
            this._bgContainer.setSiblingIndex(0)
        }
        this.setDragHandle(this._bgContainer)

        const isTall = this.dialogType === DialogType.TallBottom
        const dialogSprites = await MessageBoxAssets.loadDialogSprites(isTall)
        const textFonts = await MessageBoxAssets.loadTextFonts()
        const buttonSprites = await MessageBoxAssets.loadButtonSprites()
        if (renderVersion !== this._renderVersion || !this.node.isValid) return
        if (!dialogSprites || !buttonSprites) {
            console.error('[MessageBox] Failed to load one or more resources')
            return
        }

        const container = this._bgContainer
        container.removeAllChildren()

        const {
            topLeft,
            topMiddle,
            topRight,
            centerLeft,
            centerMiddle,
            centerRight,
            bottomLeft,
            bottomMiddle,
            bottomRight,
            header,
        } = dialogSprites

        // ── PvZ LawnDialog constants ──
        const DIALOG_HEADER_OFFSET = 45
        const BG_INSET_LEFT = 0
        const BG_INSET_TOP = 0
        const BG_INSET_RIGHT = 0
        const BG_INSET_BOTTOM = 0
        const CONTENT_INSET_TOP = 35 + this.contentInsetTopExtra
        const CONTENT_INSET_LEFT = 36
        const CONTENT_INSET_RIGHT = 46
        const CONTENT_INSET_BOTTOM = 36
        const LINES_RECT_EXTRA_LEFT = 2
        const LINES_RECT_EXTRA_WIDTH = 4
        const LINES_EXTRA_HEIGHT = 30
        const VERTICAL_CENTER_BOTTOM_PAD = 55
        // LawnDialog passes null button images to Dialog, so Dialog::mButtonHeight remains 24.
        const LAYOUT_BUTTON_HEIGHT = 24

        const titleFontData = textFonts.title
        const msgFontData = textFonts.message
        const titleMetrics = FontMetricsUtil.getMetrics(titleFontData?.config ?? null)

        const topW = topLeft!.originalSize.width + topRight!.originalSize.width
        const midW = topMiddle!.originalSize.width
        const minImageWidth = topW + midW
        let desiredWidth =
            BG_INSET_LEFT +
            BG_INSET_RIGHT +
            CONTENT_INSET_LEFT +
            CONTENT_INSET_RIGHT +
            this.extraWidth +
            (this.title
                ? FontMetricsUtil.measureTextWidth(titleFontData?.config ?? null, this.title)
                : 0)

        if (desiredWidth <= minImageWidth) {
            desiredWidth = minImageWidth
        } else if (midW > 0) {
            const extraWidth = (desiredWidth - minImageWidth) % midW
            if (extraWidth) desiredWidth += midW - extraWidth
        }

        if (this.message) {
            desiredWidth += midW
        }

        // Calculate repeats
        const repeatX = Math.floor(Math.max(0, desiredWidth - topW) / midW)

        // Recalculate actual width based on tiles to ensure perfect centering
        const actualWidth = topW + repeatX * midW

        const topH = topLeft!.originalSize.height
        const bottomH = bottomLeft!.originalSize.height
        const centerH = centerLeft!.originalSize.height

        let desiredHeight =
            BG_INSET_TOP +
            BG_INSET_BOTTOM +
            CONTENT_INSET_TOP +
            CONTENT_INSET_BOTTOM +
            DIALOG_HEADER_OFFSET

        if (this.title) {
            desiredHeight +=
                -titleMetrics.ascentPadding + titleMetrics.height + this.spaceAfterHeader
        }
        if (this.message) {
            const defaultLinesAreaWidth =
                actualWidth -
                CONTENT_INSET_LEFT -
                CONTENT_INSET_RIGHT -
                BG_INSET_LEFT -
                BG_INSET_RIGHT -
                LINES_RECT_EXTRA_WIDTH
            const linesAreaWidth =
                this.messageMaxWidth > 0
                    ? Math.min(this.messageMaxWidth, defaultLinesAreaWidth)
                    : defaultLinesAreaWidth
            desiredHeight +=
                FontMetricsUtil.measureWordWrappedHeight(
                    msgFontData?.config ?? null,
                    this.message,
                    linesAreaWidth,
                ) + LINES_EXTRA_HEIGHT
        }
        desiredHeight += LAYOUT_BUTTON_HEIGHT
        desiredHeight += this.extraHeight

        const minImageHeight = topH + bottomH + DIALOG_HEADER_OFFSET
        if (desiredHeight < minImageHeight) {
            desiredHeight = minImageHeight
        } else if (centerH > 0) {
            const extraHeight = (desiredHeight - minImageHeight) % centerH
            if (extraHeight) desiredHeight += centerH - extraHeight
        }

        const repeatY = Math.floor(
            Math.max(0, desiredHeight - topH - bottomH - DIALOG_HEADER_OFFSET) / centerH,
        )

        // Recalculate actual height
        const actualHeight = topH + bottomH + repeatY * centerH + DIALOG_HEADER_OFFSET

        // Adjust starting position (Center the constructed grid)
        const startX = -actualWidth / 2
        // Start Y includes header offset downward, centered vertically based on actual height
        const startY = actualHeight / 2 - DIALOG_HEADER_OFFSET

        buildNineSliceGrid({
            parent: container,
            startX,
            startY,
            repeatX,
            repeatY,
            topLeft: topLeft!,
            topMiddle: topMiddle!,
            topRight: topRight!,
            centerLeft: centerLeft!,
            centerMiddle: centerMiddle!,
            centerRight: centerRight!,
            bottomLeft: bottomLeft!,
            bottomMiddle: bottomMiddle!,
            bottomRight: bottomRight!,
        })

        // 4. Draw Header
        // The header is a separate overlay, effectively above the box
        // We want it centered horizontally
        const headerX = -header!.originalSize.width / 2 - 5

        // Vertically, the user logic says "Header is drawn at actualHeight/2"
        // Since we are centering everything around (0,0), and startY is (actualHeight/2 - Offset)
        // The TOP of the box (visual top) is at startY.
        // The header should be placed so its bottom overlaps the top of the box slightly, or as user says "Header is drawn at actualHeight/2".
        // If anchor is Top-Left (0,1), then drawing at Y means Top edge is at Y.
        // If header is at actualHeight/2, its top edge is at actualHeight/2.

        const headerY = actualHeight / 2

        createSpriteNode({ spriteFrame: header!, parent: container, x: headerX, y: headerY })

        setUISize(this.node, actualWidth, actualHeight)
        setUISize(container, actualWidth, actualHeight)

        // aFontY in C++ coords (top-left origin, Y-down)
        let aFontY = CONTENT_INSET_TOP + BG_INSET_TOP + DIALOG_HEADER_OFFSET

        // ── Create title FontRenderer ──
        this._destroyFontNode(this._titleNode)
        if (titleFontData && this.title) {
            const titleCfg = titleFontData.config.json as any
            const titleL0 = titleCfg.layers?.[0]
            const titleAscentPad = titleL0?.ascentPadding ?? 0
            const titleAscent = titleL0?.ascent ?? 0
            const configuredTitleHeight = titleL0?.height ?? 0

            // aOffsetY = aFontY - ascentPadding + ascent (baseline in C++ coords)
            const aOffsetY = aFontY - titleAscentPad + titleAscent

            this._titleNode = createUINode('TitleText', { anchorX: 0, anchorY: 1 })
            const titleFont = this._titleNode.addComponent(FontRenderer)
            titleFont.setFontAssets(titleFontData)
            titleFont.fontColor = new Color(0xe0, 0xbb, 0x62)
            titleFont.string = this.title
            this.node.addChild(this._titleNode)
            titleFont.forceRebuild()
            const titleFontHeight =
                configuredTitleHeight > 0 ? configuredTitleHeight : titleFont.contentHeight

            // FontRenderer is positioned by glyph top, while the original DrawString uses baseline Y.
            const titleWidth =
                FontMetricsUtil.measureTextWidth(titleFontData.config, this.title) ||
                titleFont.contentWidth
            const titleX = -titleWidth / 2
            const titleTopYCpp = aOffsetY - titleAscent
            const titleY = actualHeight / 2 - titleTopYCpp
            this._titleNode.setPosition(titleX, titleY)
            this._titleRenderer = titleFont

            // Advance aFontY past title: baseline - ascent + fontHeight + spaceAfterHeader
            aFontY = aOffsetY - titleAscent + titleFontHeight + this.spaceAfterHeader
        }

        // ── Create message FontRenderer ──
        this._destroyFontNode(this._messageNode)
        if (msgFontData) {
            // Message X in C++ coords: backgroundInsets.left + contentInsets.left + 2
            const msgX_cpp = BG_INSET_LEFT + CONTENT_INSET_LEFT + LINES_RECT_EXTRA_LEFT

            this._messageNode = createUINode('MessageText', { anchorX: 0, anchorY: 1 })
            const msgUt = this._messageNode.getComponent(UITransform)!
            const msgFont = this._messageNode.addComponent(FontRenderer)
            msgFont.setFontAssets(msgFontData)
            msgFont.fontColor = new Color(0xe0, 0xbb, 0x62)
            msgFont.textAlign = this.messageAlign
            // Lines area width for word wrapping
            const defaultLinesAreaWidth =
                actualWidth -
                CONTENT_INSET_LEFT -
                CONTENT_INSET_RIGHT -
                BG_INSET_LEFT -
                BG_INSET_RIGHT -
                LINES_RECT_EXTRA_WIDTH
            const linesAreaWidth =
                this.messageMaxWidth > 0
                    ? Math.min(this.messageMaxWidth, defaultLinesAreaWidth)
                    : defaultLinesAreaWidth
            msgFont.maxWidth = linesAreaWidth
            msgFont.string = this.message
            this.node.addChild(this._messageNode)
            msgFont.forceRebuild()
            msgUt.setContentSize(linesAreaWidth, msgFont.contentHeight)
            const wrapped = FontMetricsUtil.measureWordWrapped(
                msgFontData.config,
                this.message,
                linesAreaWidth,
            )
            const msgMetrics = FontMetricsUtil.getMetrics(msgFontData.config)

            // Vertical centering (mVerticalCenterText = true)
            let msgY_cpp = aFontY
            const linesHeight = wrapped.height
            let linesAreaHeight =
                actualHeight -
                CONTENT_INSET_BOTTOM -
                BG_INSET_BOTTOM -
                LAYOUT_BUTTON_HEIGHT -
                aFontY -
                VERTICAL_CENTER_BOTTOM_PAD
            if (this.dialogType === DialogType.TallBottom) {
                linesAreaHeight -= 36
            }
            if (this.verticalCenterText) {
                msgY_cpp += Math.trunc((linesAreaHeight - linesHeight) / 2)
            }

            // Word-wrapped text rect Y is already the glyph top in original C++ coordinates.
            const msgX = msgX_cpp - actualWidth / 2 + (defaultLinesAreaWidth - linesAreaWidth) / 2
            const msgY = actualHeight / 2 - msgY_cpp
            this._messageNode.setPosition(
                msgX,
                msgY + msgMetrics.ascentPadding - this.messageOffsetY,
            )
            this._messageRenderer = msgFont
        }

        this.onDialogRendered(actualWidth, actualHeight)

        // Render buttons
        await this._renderButtons(actualWidth, actualHeight, buttonSprites, renderVersion)
    }

    protected onDialogRendered(_actualWidth: number, _actualHeight: number) {}

    show(title: string, message: string) {
        this.title = title
        this.message = message
        if (this._titleRenderer) {
            this._titleRenderer.string = title
        }
        if (this._messageRenderer) {
            this._messageRenderer.string = message
        }
        this.node.active = true
    }

    private _destroyFontNode(node: Node | null) {
        if (node && node.isValid) {
            node.removeFromParent()
            node.destroy()
        }
    }

    private _finish(result: DialogResult, destroy = true) {
        if (this._result !== DialogResult.None) return
        const button = this._buttons.find((b) => b.result === result)
        if (this.buttonDelay >= 0 && this._updateCount <= this.buttonDelay) return

        this._result = result
        button?.onClick?.()
        this._resolveResult?.(result)
        this._resolveResult = null

        if (destroy && this.node.isValid) {
            this.node.destroy()
        }
    }

    private _setButtonsInteractable(interactable: boolean) {
        for (const node of this._buttonNodes) {
            const button = this._buttonStates.get(node)
            if (button) button.interactable = interactable
        }
    }

    // ── Stone Button Rendering ──────────────────────────────────

    private async _renderButtons(
        dialogW: number,
        dialogH: number,
        sprites: MessageBoxButtonSprites,
        renderVersion: number,
    ) {
        // Clean up old buttons
        for (const n of this._buttonNodes) {
            if (n.isValid) n.destroy()
        }
        this._buttonNodes = []
        this._buttonStates.clear()

        if (this._buttons.length === 0) return

        await this._localizeButtonLabels()
        if (renderVersion !== this._renderVersion || !this.node.isValid) return

        const buttonFonts = await MessageBoxAssets.loadButtonFonts()
        if (renderVersion !== this._renderVersion || !this.node.isValid) return

        // Create button container
        if (!this._buttonContainer) {
            this._buttonContainer = new Node('ButtonContainer')
            this._buttonContainer.layer = Layers.Enum.UI_2D
            this.node.addChild(this._buttonContainer)
        }

        // Content insets: (left=36, top=35, right=46, bottom=36)
        const INSET_LEFT = 36
        const INSET_RIGHT = 46
        const INSET_BOTTOM = 36

        const btnH = sprites.left.originalSize.height
        const btnMinW = sprites.left.originalSize.width + sprites.right.originalSize.width
        const btnMidW = sprites.middle.originalSize.width

        // C++ layout (top-left origin coords)
        const aButtonAreaX = INSET_LEFT - 5
        let aButtonAreaY = dialogH - INSET_BOTTOM - btnH + 2
        const aButtonAreaWidth = dialogW - INSET_RIGHT - INSET_LEFT + 8

        if (this.dialogType === DialogType.TallBottom) {
            aButtonAreaY += 5
        }

        /** Round up extraWidth to next multiple of btnMidW */
        const roundExtra = (extra: number): number => {
            if (extra <= 0) return 0
            if (btnMidW > 0) {
                const rem = extra % btnMidW
                if (rem) return extra + btnMidW - rem
            }
            return extra
        }

        const numButtons = this._buttons.length

        if (numButtons >= 2) {
            // Two-button layout: left-aligned Yes, right-aligned No
            const extraW = roundExtra(
                Math.floor((aButtonAreaWidth - 10) / 2) - btnMidW - btnMinW + 1,
            )
            const btnW = btnMinW + extraW

            // Yes button (left)
            const yesX = aButtonAreaX
            const yesY = aButtonAreaY
            // No button (right)
            const noX = aButtonAreaWidth - btnW + aButtonAreaX
            const noY = aButtonAreaY

            const cfgs = [
                { cfg: this._buttons[0], cx: yesX, cy: yesY, w: btnW },
                { cfg: this._buttons[1], cx: noX, cy: noY, w: btnW },
            ]

            for (let i = 0; i < cfgs.length; i++) {
                const { cfg, cx, cy, w } = cfgs[i]
                // Convert C++ top-left coords to Cocos local coords (center origin, Y-up)
                // C++ (cx, cy) = top-left of button; button anchor = (0,0) bottom-left
                const localX = cx - dialogW / 2
                const localY = dialogH / 2 - cy - btnH
                const fallbackResult = i === 0 ? DialogResult.Yes : DialogResult.No
                cfg.result = cfg.result ?? fallbackResult

                const btnNode = this._createStoneButton(
                    cfg.label,
                    localX,
                    localY,
                    w,
                    btnH,
                    sprites,
                    buttonFonts.normal,
                    buttonFonts.highlight,
                    () => {
                        if (cfg.finishOnClick === false) {
                            cfg.onClick?.()
                            return
                        }
                        this._finish(cfg.result ?? fallbackResult)
                    },
                )
                this._buttonContainer.addChild(btnNode)
                this._buttonNodes.push(btnNode)
            }
        } else if (numButtons === 1) {
            // Single button: centered, wider
            const extraW = roundExtra(aButtonAreaWidth - btnMidW - btnMinW + 1)
            const btnW = btnMinW + extraW

            const cx = aButtonAreaX + Math.floor((aButtonAreaWidth - btnW) / 2)
            const cy = aButtonAreaY

            const localX = cx - dialogW / 2
            const localY = dialogH / 2 - cy - btnH

            const cfg = this._buttons[0]
            cfg.result = cfg.result ?? DialogResult.Footer
            const btnNode = this._createStoneButton(
                cfg.label,
                localX,
                localY,
                btnW,
                btnH,
                sprites,
                buttonFonts.normal,
                buttonFonts.highlight,
                () => {
                    if (cfg.finishOnClick === false) {
                        cfg.onClick?.()
                        return
                    }
                    this._finish(cfg.result ?? DialogResult.Footer)
                },
            )
            this._buttonContainer.addChild(btnNode)
            this._buttonNodes.push(btnNode)
        }

        this._setButtonsInteractable(this.buttonDelay < 0)
    }

    private async _localizeButtonLabels() {
        const strings = await LawnStringLoader.load()
        const keyByLabel: Record<string, string> = {
            OK: 'DIALOG_BUTTON_OK',
            Cancel: 'DIALOG_BUTTON_CANCEL',
            Yes: 'DIALOG_BUTTON_YES',
            No: 'DIALOG_BUTTON_NO',
            'Try Again': 'TRY_AGAIN',
        }
        for (const button of this._buttons) {
            const key = keyByLabel[button.label]
            if (!key) continue
            button.label = LawnStringLoader.translateOptional(`[${key}]`, strings) || button.label
        }
    }

    /**
     * Create a single stone button node with tiled left/middle/right sprites.
     * Normal & pressed states use separate sprite sets.
     */
    private _createStoneButton(
        label: string,
        x: number,
        y: number,
        width: number,
        height: number,
        sprites: MessageBoxButtonSprites,
        normalFont: BitmapFontAssets | null,
        highlightFont: BitmapFontAssets | null,
        onClick?: () => void,
    ): Node {
        const btnRoot = createUINode(`Btn_${label}`, { anchorX: 0, anchorY: 0, width, height })

        // Build normal sprite container
        const normalContainer = this._buildStoneButtonRow(
            'Normal',
            width,
            sprites.left,
            sprites.middle,
            sprites.right,
        )
        btnRoot.addChild(normalContainer)

        // Build pressed sprite container
        const pressedContainer = this._buildStoneButtonRow(
            'Pressed',
            width,
            sprites.downLeft,
            sprites.downMiddle,
            sprites.downRight,
        )
        pressedContainer.active = false
        btnRoot.addChild(pressedContainer)

        // FontRenderer label (normal state)
        const labelNode = createUINode('Label', { anchorX: 0, anchorY: 1 })
        const fontComp = labelNode.addComponent(FontRenderer)
        if (normalFont) {
            fontComp.setFontAssets(normalFont)
        }
        fontComp.fontColor = new Color(213, 255, 196)
        fontComp.string = label
        btnRoot.addChild(labelNode)
        fontComp.forceRebuild()

        // FontRenderer label (highlight state)
        const hlLabelNode = createUINode('LabelHighlight', { anchorX: 0, anchorY: 1 })
        const hlFontComp = hlLabelNode.addComponent(FontRenderer)
        if (highlightFont) {
            hlFontComp.setFontAssets(highlightFont)
        }
        hlFontComp.fontColor = new Color(213, 255, 196)
        hlFontComp.string = label
        hlLabelNode.active = false
        btnRoot.addChild(hlLabelNode)
        hlFontComp.forceRebuild()

        const normalCfg = normalFont?.config ?? null
        const highlightCfg = highlightFont?.config ?? normalCfg
        const normalLayer = (normalCfg?.json as any)?.layers?.[0]
        const highlightLayer = (highlightCfg?.json as any)?.layers?.[0] ?? normalLayer
        const normalAscent = normalLayer?.ascent ?? 0
        const highlightAscent = highlightLayer?.ascent ?? normalAscent
        const labelWidth =
            FontMetricsUtil.measureTextWidth(normalCfg, label) || fontComp.contentWidth
        const hlLabelWidth =
            FontMetricsUtil.measureTextWidth(highlightCfg, label) || hlFontComp.contentWidth

        // DrawStoneButton computes a baseline, then ImageFont draws glyphs at baseline - ascent.
        const labelX = (width - labelWidth) / 2 + 1
        const labelBaselineYCpp = (height - normalAscent / 6 - 1 + normalAscent) / 2 - 4
        const labelTopYCpp = labelBaselineYCpp - normalAscent
        const labelY = height - labelTopYCpp
        labelNode.setPosition(labelX, labelY)

        const hlLabelX = (width - hlLabelWidth) / 2 + 1
        const hlLabelBaselineYCpp = (height - highlightAscent / 6 - 1 + highlightAscent) / 2 - 4
        const hlLabelTopYCpp = hlLabelBaselineYCpp - highlightAscent
        const hlLabelY = height - hlLabelTopYCpp
        hlLabelNode.setPosition(hlLabelX, hlLabelY)

        const button = btnRoot.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        button.onClick = () => onClick?.()
        button.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            const pressed = state === 'pressed'
            normalContainer.active = !pressed
            pressedContainer.active = pressed
            labelNode.active = !highlighted
            hlLabelNode.active = highlighted
            labelNode.setPosition(labelX, labelY)
            hlLabelNode.setPosition(
                pressed ? hlLabelX + 1 : hlLabelX,
                pressed ? hlLabelY - 1 : hlLabelY,
            )
        }
        this._buttonStates.set(btnRoot, button)

        labelNode.active = true
        hlLabelNode.active = false

        btnRoot.setPosition(x, y)
        return btnRoot
    }

    /**
     * Build a tiled row of left/middle/right sprites matching DrawStoneButton logic.
     */
    private _buildStoneButtonRow(
        name: string,
        totalWidth: number,
        leftSf: SpriteFrame,
        middleSf: SpriteFrame,
        rightSf: SpriteFrame,
    ): Node {
        return buildThreeSliceRow({
            name,
            width: totalWidth,
            left: leftSf,
            middle: middleSf,
            right: rightSf,
            anchorX: 0,
            anchorY: 0,
        })
    }
}
