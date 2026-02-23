import {
    _decorator,
    Component,
    Node,
    EventTouch,
    UITransform,
    view,
    Sprite,
    SpriteFrame,
    Texture2D,
    JsonAsset,
    Layers,
    Enum,
    Color,
    BlockInputEvents,
    Widget,
    Vec2,
    Vec3,
} from 'cc'
import { SpriteLoader } from '@/core/SpriteLoader'
import { UIButton } from '@/ui/Button/UIButton'
import { FontRenderer } from '@/core/FontRenderer'

const { ccclass, property } = _decorator

export interface MessageBoxButton {
    label: string
    width?: number
    height?: number
    onClick?: () => void
}

/**
 * Dialog bottom style
 */
enum DialogType {
    Standard,
    TallBottom,
}

@ccclass('MessageBox')
export class MessageBox extends Component {
    @property(Node)
    dragHandle: Node | null = null

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

    @property({ type: JsonAsset, tooltip: '标题字体 JSON 配置' })
    titleFontConfig: JsonAsset | null = null

    @property({ type: [Texture2D], tooltip: '标题字体图集纹理' })
    titleFontTextures: Texture2D[] = []

    @property({ type: JsonAsset, tooltip: '内容字体 JSON 配置' })
    messageFontConfig: JsonAsset | null = null

    @property({ type: [Texture2D], tooltip: '内容字体图集纹理' })
    messageFontTextures: Texture2D[] = []

    @property({ type: JsonAsset, tooltip: '按钮字体 JSON 配置' })
    buttonFontConfig: JsonAsset | null = null

    @property({ type: [Texture2D], tooltip: '按钮字体图集纹理' })
    buttonFontTextures: Texture2D[] = []

    private _bgContainer: Node | null = null
    private _buttonContainer: Node | null = null
    private _modalBlocker: Node | null = null
    private _titleNode: Node | null = null
    private _titleRenderer: FontRenderer | null = null
    private _messageNode: Node | null = null
    private _messageRenderer: FontRenderer | null = null
    private _dragging = false
    private _dragMouseX = 0
    private _dragMouseY = 0
    private _buttons: MessageBoxButton[] = []
    private _buttonNodes: Node[] = []

    // Cached button sprites (loaded once)
    private static _btnLeft: SpriteFrame | null = null
    private static _btnMiddle: SpriteFrame | null = null
    private static _btnRight: SpriteFrame | null = null
    private static _btnDownLeft: SpriteFrame | null = null
    private static _btnDownMiddle: SpriteFrame | null = null
    private static _btnDownRight: SpriteFrame | null = null

    start() {
        this._createModalBlocker()
        this.renderDialog()
    }

    /**
     * Set buttons for this dialog. Call before or after renderDialog.
     */
    setButtons(buttons: MessageBoxButton[]) {
        this._buttons = buttons
    }

    /**
     * Close and destroy this dialog along with its modal blocker.
     */
    close() {
        if (this._modalBlocker && this._modalBlocker.isValid) {
            this._modalBlocker.destroy()
            this._modalBlocker = null
        }
        if (this.node.isValid) {
            this.node.destroy()
        }
    }

    /**
     * Create a full-screen transparent node that blocks all input to elements behind the dialog.
     * It is added as a sibling before this node so it sits underneath.
     */
    private _createModalBlocker() {
        if (this._modalBlocker) return

        const blocker = new Node('ModalBlocker')
        blocker.layer = Layers.Enum.UI_2D

        // Full-screen UITransform
        const ut = blocker.addComponent(UITransform)
        const visibleSize = view.getVisibleSize()
        ut.setContentSize(visibleSize.width, visibleSize.height)
        ut.setAnchorPoint(0.5, 0.5)

        // Block all touch events from passing through
        blocker.addComponent(BlockInputEvents)

        // Insert as sibling before this node
        const parent = this.node.parent
        if (parent) {
            parent.addChild(blocker)
            // Position at same place as this node's parent center
            blocker.setWorldPosition(visibleSize.width / 2, visibleSize.height / 2, 0)
            // Put blocker right before the dialog node
            const idx = this.node.getSiblingIndex()
            blocker.setSiblingIndex(idx)
        }

        this._modalBlocker = blocker
    }

    onEnable() {
        const target = this.dragHandle ?? this.node
        target.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
        target.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        target.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        target.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
    }

    onDisable() {
        const target = this.dragHandle ?? this.node
        target.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
        target.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        target.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        target.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)

        // Hide blocker when dialog is disabled
        if (this._modalBlocker) {
            this._modalBlocker.active = false
        }
    }

    onDestroy() {
        // Clean up the modal blocker node
        if (this._modalBlocker && this._modalBlocker.isValid) {
            this._modalBlocker.destroy()
            this._modalBlocker = null
        }
        this._destroyFontNode(this._titleNode)
        this._destroyFontNode(this._messageNode)
        this._titleNode = null
        this._messageNode = null
        this._titleRenderer = null
        this._messageRenderer = null
    }

    private _onTouchStart(event: EventTouch) {
        this._dragging = true
        const uiPos = event.getUILocation()
        const ut = this.node.getComponent(UITransform)!
        const pos = this.node.worldPosition
        // Touch offset from dialog top-left corner
        this._dragMouseX = uiPos.x - (pos.x - ut.contentSize.width * ut.anchorPoint.x)
        this._dragMouseY = pos.y + ut.contentSize.height * (1 - ut.anchorPoint.y) - uiPos.y
        if (typeof document !== 'undefined') document.body.style.cursor = 'move'
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._dragging) return
        const uiPos = event.getUILocation()
        const ut = this.node.getComponent(UITransform)!
        const { width: w, height: h } = ut.contentSize
        const { width: sw, height: sh } = view.getVisibleSize()
        const M = 8

        // New top-left = touch - drag offset
        let nx = uiPos.x - this._dragMouseX
        let ny = uiPos.y + this._dragMouseY

        // Clamp with 8px overflow tolerance
        nx = Math.max(-M, Math.min(sw - w + M, nx))
        ny = Math.max(h - M, Math.min(sh + M, ny))

        // Recalculate & clamp drag offset within dialog bounds
        this._dragMouseX = Math.max(M, Math.min(w - M - 1, uiPos.x - nx))
        this._dragMouseY = Math.max(M, Math.min(h - M - 1, ny - uiPos.y))

        // Convert top-left to world position
        this.node.setWorldPosition(nx + w * ut.anchorPoint.x, ny - h * (1 - ut.anchorPoint.y), 0)
    }

    private _onTouchEnd(event: EventTouch) {
        this._dragging = false

        // Restore cursor
        if (typeof document !== 'undefined') {
            document.body.style.cursor = ''
        }
    }

    async renderDialog() {
        if (!this._bgContainer) {
            this._bgContainer = new Node('BackgroundContainer')
            this._bgContainer.layer = Layers.Enum.UI_2D
            this.node.addChild(this._bgContainer)
            this._bgContainer.setSiblingIndex(0)
        }

        const container = this._bgContainer
        container.removeAllChildren()

        // Resources
        const isTall = this.dialogType === DialogType.TallBottom
        const bottomPrefix = isTall ? 'dialog_bigbottom' : 'dialog_bottom'

        // Load all sprites
        const sprites = await Promise.all([
            SpriteLoader.load('dialog_topleft', 'images'),
            SpriteLoader.load('dialog_topmiddle', 'images'),
            SpriteLoader.load('dialog_topright', 'images'),
            SpriteLoader.load('dialog_centerleft', 'images'),
            SpriteLoader.load('dialog_centermiddle', 'images'),
            SpriteLoader.load('dialog_centerright', 'images'),
            SpriteLoader.load(`${bottomPrefix}left`, 'images'),
            SpriteLoader.load(`${bottomPrefix}middle`, 'images'),
            SpriteLoader.load(`${bottomPrefix}right`, 'images'),
            SpriteLoader.load('dialog_header', 'images'),
        ])

        const [
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
        ] = sprites

        if (sprites.some((s) => !s)) {
            console.error('[MessageBox] Failed to load one or more resources')
            return
        }

        // Layout constants
        const DIALOG_HEADER_OFFSET = 37

        // Calculate repeats
        const topW = topLeft!.originalSize.width + topRight!.originalSize.width
        const midW = topMiddle!.originalSize.width
        const repeatX = Math.floor(Math.max(0, this.dialogWidth - topW) / midW)

        // Recalculate actual width based on tiles to ensure perfect centering
        const actualWidth = topW + repeatX * midW

        const topH = topLeft!.originalSize.height
        const bottomH = bottomLeft!.originalSize.height
        const centerH = centerLeft!.originalSize.height

        const availableHeight = this.dialogHeight - topH - bottomH - DIALOG_HEADER_OFFSET
        const repeatY = Math.floor(Math.max(0, availableHeight) / centerH)

        // Recalculate actual height
        const actualHeight = topH + bottomH + repeatY * centerH + DIALOG_HEADER_OFFSET

        // Adjust starting position (Center the constructed grid)
        const startX = -actualWidth / 2
        // Start Y includes header offset downward, centered vertically based on actual height
        const startY = actualHeight / 2 - DIALOG_HEADER_OFFSET

        let currentX = startX
        let currentY = startY

        // 1. Draw Top Row
        this._createSprite(topLeft!, currentX, currentY, container)
        currentX += topLeft!.originalSize.width

        for (let i = 0; i < repeatX; i++) {
            this._createSprite(topMiddle!, currentX, currentY, container)
            currentX += midW
        }

        this._createSprite(topRight!, currentX, currentY, container)

        // 2. Draw Center Rows
        // Reset X to start, move Y down by top height
        currentY -= topH

        for (let i = 0; i < repeatY; i++) {
            currentX = startX

            // Left
            this._createSprite(centerLeft!, currentX, currentY, container)
            currentX += centerLeft!.originalSize.width

            // Middle
            for (let j = 0; j < repeatX; j++) {
                this._createSprite(centerMiddle!, currentX, currentY, container)
                currentX += centerMiddle!.originalSize.width
            }

            // Right
            this._createSprite(centerRight!, currentX, currentY, container)

            currentY -= centerH
        }

        // 3. Draw Bottom Row
        currentX = startX

        this._createSprite(bottomLeft!, currentX, currentY, container)
        currentX += bottomLeft!.originalSize.width

        for (let i = 0; i < repeatX; i++) {
            this._createSprite(bottomMiddle!, currentX, currentY, container)
            currentX += bottomMiddle!.originalSize.width
        }

        this._createSprite(bottomRight!, currentX, currentY, container)

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

        this._createSprite(header!, headerX, headerY, container)

        const uiTransform = this.node.getComponent(UITransform)
        uiTransform.setContentSize(actualWidth, actualHeight)
        uiTransform.setAnchorPoint(0.5, 0.5)

        // ── PvZ LawnDialog.Draw text layout ──
        const CONTENT_INSET_TOP = 35
        const CONTENT_INSET_LEFT = 36
        const CONTENT_INSET_BOTTOM = 36
        const BG_INSET = 0 // mBackgroundInsets, usually 0
        const SPACE_AFTER_HEADER = 0 // mSpaceAfterHeader

        // Load button sprites early for layout height calculation
        await this._loadButtonSprites()
        const buttonHeight = MessageBox._btnLeft ? MessageBox._btnLeft.originalSize.height : 46

        // aFontY in C++ coords (top-left origin, Y-down)
        let aFontY = CONTENT_INSET_TOP + BG_INSET + DIALOG_HEADER_OFFSET // = 72

        // ── Create title FontRenderer ──
        this._destroyFontNode(this._titleNode)
        if (this.titleFontConfig) {
            const titleCfg = this.titleFontConfig.json as any
            const titleL0 = titleCfg.layers?.[0]
            const titleAscentPad = titleL0?.ascentPadding ?? 0
            const titleAscent = titleL0?.ascent ?? 0
            const titleFontHeight = titleL0?.height ?? 0

            // aOffsetY = aFontY - ascentPadding + ascent (baseline in C++ coords)
            const aOffsetY = aFontY - titleAscentPad + titleAscent

            this._titleNode = new Node('TitleText')
            this._titleNode.layer = Layers.Enum.UI_2D
            const titleUt = this._titleNode.addComponent(UITransform)
            titleUt.setAnchorPoint(0, 1)
            const titleFont = this._titleNode.addComponent(FontRenderer)
            titleFont.fontConfigJson = this.titleFontConfig
            titleFont.layerTextures = this.titleFontTextures
            titleFont.fontColor = new Color(0xe0, 0xbb, 0x62)
            titleFont.string = this.title
            this.node.addChild(this._titleNode)
            titleFont.forceRebuild()

            // Center horizontally; convert C++ baseline Y to Cocos Y
            const titleX = -titleFont.contentWidth / 2
            const titleY = actualHeight / 2 - aOffsetY
            this._titleNode.setPosition(titleX, titleY)
            this._titleRenderer = titleFont

            // Advance aFontY past title: baseline - ascent + fontHeight + spaceAfterHeader
            aFontY = aOffsetY - titleAscent + titleFontHeight + SPACE_AFTER_HEADER
        }

        // ── Create message FontRenderer ──
        this._destroyFontNode(this._messageNode)
        if (this.messageFontConfig) {
            // Message X in C++ coords: backgroundInsets.left + contentInsets.left + 2
            const msgX_cpp = BG_INSET + CONTENT_INSET_LEFT + 2

            this._messageNode = new Node('MessageText')
            this._messageNode.layer = Layers.Enum.UI_2D
            const msgUt = this._messageNode.addComponent(UITransform)
            msgUt.setAnchorPoint(0, 1)
            const msgFont = this._messageNode.addComponent(FontRenderer)
            msgFont.fontConfigJson = this.messageFontConfig
            msgFont.layerTextures = this.messageFontTextures
            msgFont.fontColor = new Color(0xe0, 0xbb, 0x62)
            // Lines area width for word wrapping
            const CONTENT_INSET_RIGHT = 46
            const linesAreaWidth =
                actualWidth - BG_INSET - CONTENT_INSET_RIGHT - CONTENT_INSET_LEFT - 2
            msgFont.maxWidth = linesAreaWidth
            msgFont.string = this.message
            this.node.addChild(this._messageNode)
            msgFont.forceRebuild()

            // Vertical centering (mVerticalCenterText = true)
            let msgY_cpp = aFontY
            const linesHeight = msgFont.contentHeight
            let linesAreaHeight =
                actualHeight - CONTENT_INSET_BOTTOM - BG_INSET - buttonHeight - aFontY - 55
            if (this.dialogType === DialogType.TallBottom) {
                linesAreaHeight -= 36
            }
            if (linesAreaHeight > linesHeight) {
                msgY_cpp += Math.floor((linesAreaHeight - linesHeight) / 2)
            }

            // Convert C++ (top-left origin) to Cocos local coords (center origin, Y-up)
            const msgX = msgX_cpp - actualWidth / 2
            const msgY = actualHeight / 2 - msgY_cpp
            this._messageNode.setPosition(msgX, msgY)
            this._messageRenderer = msgFont
        }

        // Render buttons
        await this._renderButtons(actualWidth, actualHeight)
    }

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

    // ── Stone Button Rendering ──────────────────────────────────

    private async _loadButtonSprites() {
        if (MessageBox._btnLeft) return // already loaded
        const [left, mid, right, dLeft, dMid, dRight] = await Promise.all([
            SpriteLoader.load('button_left', 'images'),
            SpriteLoader.load('button_middle', 'images'),
            SpriteLoader.load('button_right', 'images'),
            SpriteLoader.load('button_down_left', 'images'),
            SpriteLoader.load('button_down_middle', 'images'),
            SpriteLoader.load('button_down_right', 'images'),
        ])
        MessageBox._btnLeft = left
        MessageBox._btnMiddle = mid
        MessageBox._btnRight = right
        MessageBox._btnDownLeft = dLeft
        MessageBox._btnDownMiddle = dMid
        MessageBox._btnDownRight = dRight
    }

    private async _renderButtons(dialogW: number, dialogH: number) {
        // Clean up old buttons
        for (const n of this._buttonNodes) {
            if (n.isValid) n.destroy()
        }
        this._buttonNodes = []

        if (this._buttons.length === 0) return

        await this._loadButtonSprites()
        if (!MessageBox._btnLeft) return

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

        const btnH = MessageBox._btnLeft!.originalSize.height
        const btnMinW =
            MessageBox._btnLeft!.originalSize.width + MessageBox._btnRight!.originalSize.width
        const btnMidW = MessageBox._btnMiddle!.originalSize.width

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

            for (const { cfg, cx, cy, w } of cfgs) {
                // Convert C++ top-left coords to Cocos local coords (center origin, Y-up)
                // C++ (cx, cy) = top-left of button; button anchor = (0,0) bottom-left
                const localX = cx - dialogW / 2
                const localY = dialogH / 2 - cy - btnH

                const btnNode = this._createStoneButton(
                    cfg.label,
                    localX,
                    localY,
                    w,
                    btnH,
                    cfg.onClick,
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
            const btnNode = this._createStoneButton(
                cfg.label,
                localX,
                localY,
                btnW,
                btnH,
                cfg.onClick,
            )
            this._buttonContainer.addChild(btnNode)
            this._buttonNodes.push(btnNode)
        }
    }

    /**
     * Create a single stone button node with tiled left/middle/right sprites.
     * Normal & pressed states use separate sprite sets; UIButton handles switching.
     */
    private _createStoneButton(
        label: string,
        x: number,
        y: number,
        width: number,
        height: number,
        onClick?: () => void,
    ): Node {
        const btnRoot = new Node(`Btn_${label}`)
        btnRoot.layer = Layers.Enum.UI_2D

        const ut = btnRoot.addComponent(UITransform)
        ut.setAnchorPoint(0, 0) // bottom-left
        ut.setContentSize(width, height)

        // Build normal sprite container
        const normalContainer = this._buildStoneButtonRow(
            'Normal',
            width,
            MessageBox._btnLeft!,
            MessageBox._btnMiddle!,
            MessageBox._btnRight!,
        )
        btnRoot.addChild(normalContainer)

        // Build pressed sprite container
        const pressedContainer = this._buildStoneButtonRow(
            'Pressed',
            width,
            MessageBox._btnDownLeft!,
            MessageBox._btnDownMiddle!,
            MessageBox._btnDownRight!,
        )
        pressedContainer.active = false
        btnRoot.addChild(pressedContainer)

        // FontRenderer label
        const labelNode = new Node('Label')
        labelNode.layer = Layers.Enum.UI_2D
        const labelUt = labelNode.addComponent(UITransform)
        labelUt.setAnchorPoint(0, 1) // top-left, matching FontRenderer render origin
        const fontComp = labelNode.addComponent(FontRenderer)
        if (this.buttonFontConfig) {
            fontComp.fontConfigJson = this.buttonFontConfig
        }
        if (this.buttonFontTextures.length > 0) {
            fontComp.layerTextures = this.buttonFontTextures
        }
        fontComp.fontColor = new Color(213, 255, 196)
        fontComp.string = label
        btnRoot.addChild(labelNode)
        fontComp.forceRebuild()
        // Center text within button bounds
        const labelX = (width - fontComp.contentWidth) / 2
        const labelY = (height + fontComp.contentHeight) / 2
        labelNode.setPosition(labelX, labelY)

        // UIButton for interaction
        const uiBtn = btnRoot.addComponent(UIButton)
        uiBtn.polygon = [
            new Vec2(0, 0),
            new Vec2(width, 0),
            new Vec2(width, height),
            new Vec2(0, height),
        ]
        uiBtn.pressOffset = new Vec3(1, 0, 0) // Shift down 1px when pressed

        // Swap containers on state change
        const origOnLoad = uiBtn.onLoad?.bind(uiBtn)
        uiBtn.onClick = (event) => {
            onClick?.()
        }

        // Override state changes to swap containers + shift label
        let isDown = false
        const press = () => {
            if (!isDown) {
                isDown = true
                normalContainer.active = false
                pressedContainer.active = true
                labelNode.setPosition(labelX + 1, labelY - 1)
            }
        }
        const release = () => {
            if (isDown) {
                isDown = false
                normalContainer.active = true
                pressedContainer.active = false
                labelNode.setPosition(labelX, labelY)
            }
        }
        const isInsideButton = (event: EventTouch): boolean => {
            const uiPos = event.getUILocation()
            const localPos = ut.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0))
            return localPos.x >= 0 && localPos.x <= width && localPos.y >= 0 && localPos.y <= height
        }
        btnRoot.on(Node.EventType.TOUCH_START, () => {
            press()
        })
        btnRoot.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (isInsideButton(event)) {
                press()
            } else {
                release()
            }
        })
        btnRoot.on(Node.EventType.TOUCH_END, release)
        btnRoot.on(Node.EventType.TOUCH_CANCEL, release)

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
        const row = new Node(name)
        row.layer = Layers.Enum.UI_2D

        const lw = leftSf.originalSize.width
        const rw = rightSf.originalSize.width
        const mw = middleSf.originalSize.width
        const mh = middleSf.originalSize.height

        let px = 0

        // Left
        this._createSprite(leftSf, px, 0, row, 0, 0) // anchor bottom-left
        px += lw

        // Middle (repeated)
        const repeatCount = Math.floor((totalWidth - lw - rw) / mw)
        for (let i = 0; i < repeatCount; i++) {
            this._createSprite(middleSf, px, 0, row, 0, 0)
            px += mw
        }

        // Remaining middle fragment
        const remaining = totalWidth - lw - rw - repeatCount * mw
        if (remaining > 0) {
            const fragNode = this._createSprite(middleSf, px, 0, row, 0, 0)
            // Clip by adjusting UITransform width
            const fragUt = fragNode.getComponent(UITransform)!
            fragUt.setContentSize(remaining, mh)
            px += remaining
        }

        // Right
        this._createSprite(rightSf, px, 0, row, 0, 0)

        return row
    }

    private _createSprite(
        sf: SpriteFrame,
        x: number,
        y: number,
        parent: Node,
        anchorX = 0,
        anchorY = 1,
    ) {
        const node = new Node()
        node.layer = Layers.Enum.UI_2D
        const sprite = node.addComponent(Sprite)
        sprite.spriteFrame = sf
        sprite.sizeMode = Sprite.SizeMode.RAW
        sprite.trim = false // Disable trim to preserve original dimensions

        const uiTransform = node.getComponent(UITransform)
        uiTransform.setAnchorPoint(anchorX, anchorY)

        node.setPosition(x, y)
        parent.addChild(node)
        return node
    }
}
