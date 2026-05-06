import { _decorator, Color, gfx, Material, Node, Rect, Size, Sprite, SpriteFrame, Vec2, Vec3 } from 'cc'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import {
    StoreScreenAssets,
    type StoreScreenFonts,
    type StoreScreenSprites,
} from './StoreScreenAssets'
import { MenuScreenBase } from '../MenuScreenBase'
import { SoundEffect } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { DialogButtonMode, MessageBox } from '@/ui/MessageBox/MessageBox'
import { SeedPacketRenderer } from '@/ui/SeedPacketRenderer'

const { ccclass } = _decorator

const STORE_BUTTON_COLOR = new Color(98, 153, 235)
const STORE_BUTTON_HOVER_COLOR = new Color(167, 192, 235)
const STORE_MONEY_COLOR = new Color(180, 255, 90)
const STORE_PAGE_COLOR = new Color(128, 128, 128)
const STORE_PRICE_COLOR = new Color(0, 0, 0)
const STORE_PACKET_WIDTH = 50
const STORE_PACKET_HEIGHT = 70
const STORE_SEED_PACKET_UPGRADE_CEL = 1
const STORE_HATCH_TRANSITION_SECONDS = 0.5
const STORE_UPDATE_RATE = 100
const STORE_SIGN_ANIMATION_START_FRAME = 50
const STORE_SIGN_ANIMATION_END_FRAME = 110
const STORE_INTERACTION_READY_FRAME = 120
const STORE_SIGN_START_Y = -150
const STORE_SIGN_END_Y = 0
const STORE_ITEM_HIT_WIDTH = 50
const STORE_ITEM_HIT_HEIGHT = 87
const STORE_ITEM_HIGHLIGHT_COLOR = new Color(255, 255, 255, 96)
const STORE_ITEM_HIGHLIGHT_TEXT_COLOR = new Color(255, 255, 255, 255)
const STORE_SLOT_TEXT_WIDTH = 55
const STORE_SLOT_TEXT_HEIGHT = 70
const STORE_SEED_GATLINGPEA = 40
const STORE_SEED_TWINSUNFLOWER = 41
const STORE_SEED_GLOOMSHROOM = 42
const STORE_SEED_CATTAIL = 43
const STORE_SEED_WINTERMELON = 44
const STORE_SEED_GOLD_MAGNET = 45
const STORE_SEED_SPIKEROCK = 46
const STORE_SEED_COBCANNON = 47

let additiveSpriteMaterial: Material | null = null

type StoreItemKind = 'sprite' | 'upgradePacket'
type StoreItemHighlight = 'additiveIcon' | 'seedPacketFlash'

interface StoreItemDefinition {
    price: string
    x: number
    y: number
    kind?: StoreItemKind
    seedType?: number
    spriteKey?: keyof StoreScreenSprites
    offsetX?: number
    offsetY?: number
    highlightAlpha?: number
    highlight?: StoreItemHighlight
    slotText?: string
    quantityText?: string
}

const STORE_ITEM_POSITIONS = [
    { x: 422, y: 206 },
    { x: 496, y: 206 },
    { x: 570, y: 206 },
    { x: 644, y: 206 },
    { x: 372, y: 310 },
    { x: 446, y: 310 },
    { x: 520, y: 310 },
    { x: 594, y: 310 },
]

const STORE_PAGES: StoreItemDefinition[][] = [
    [
        { price: '$750', spriteKey: 'storePacketUpgrade', offsetX: -7, offsetY: 7, highlightAlpha: 32, slotText: '7\nslots', ...STORE_ITEM_POSITIONS[0] },
        { price: '$1,000', spriteKey: 'iconPoolCleaner', offsetX: 1, offsetY: 7, ...STORE_ITEM_POSITIONS[1] },
        { price: '$200', spriteKey: 'iconRake', offsetX: -5, offsetY: 10, ...STORE_ITEM_POSITIONS[2] },
        { price: '$3,000', spriteKey: 'iconRoofCleaner', offsetX: 0, offsetY: 28, ...STORE_ITEM_POSITIONS[3] },
        { price: '$5,000', kind: 'upgradePacket', seedType: STORE_SEED_GATLINGPEA, ...STORE_ITEM_POSITIONS[4] },
        { price: '$5,000', kind: 'upgradePacket', seedType: STORE_SEED_TWINSUNFLOWER, ...STORE_ITEM_POSITIONS[5] },
        { price: '$7,500', kind: 'upgradePacket', seedType: STORE_SEED_GLOOMSHROOM, ...STORE_ITEM_POSITIONS[6] },
        { price: '$10,000', kind: 'upgradePacket', seedType: STORE_SEED_CATTAIL, ...STORE_ITEM_POSITIONS[7] },
    ],
    [
        { price: '$7,500', kind: 'upgradePacket', seedType: STORE_SEED_SPIKEROCK, ...STORE_ITEM_POSITIONS[0] },
        { price: '$3,000', kind: 'upgradePacket', seedType: STORE_SEED_GOLD_MAGNET, ...STORE_ITEM_POSITIONS[1] },
        { price: '$10,000', kind: 'upgradePacket', seedType: STORE_SEED_WINTERMELON, ...STORE_ITEM_POSITIONS[2] },
        { price: '$20,000', kind: 'upgradePacket', seedType: STORE_SEED_COBCANNON, ...STORE_ITEM_POSITIONS[3] },
        { price: '$30,000', spriteKey: 'imitaterSeed', offsetX: 0, offsetY: 0, highlight: 'seedPacketFlash', ...STORE_ITEM_POSITIONS[4] },
        { price: '$2,000', spriteKey: 'storeFirstAidWallnutIcon', offsetX: -1, offsetY: 13, ...STORE_ITEM_POSITIONS[5] },
    ],
    [
        { price: '$2,500', ...STORE_ITEM_POSITIONS[0] },
        { price: '$2,500', ...STORE_ITEM_POSITIONS[1] },
        { price: '$2,500', ...STORE_ITEM_POSITIONS[2] },
        { price: '$10,000', spriteKey: 'wateringCanGold', offsetX: -14, offsetY: -4, ...STORE_ITEM_POSITIONS[3] },
        { price: '$750', spriteKey: 'fertilizer', offsetX: -11, offsetY: -2, quantityText: 'x5', ...STORE_ITEM_POSITIONS[4] },
        { price: '$1,000', spriteKey: 'bugSpray', offsetX: -12, offsetY: 3, quantityText: 'x5', ...STORE_ITEM_POSITIONS[5] },
        { price: '$15,000', spriteKey: 'phonograph', offsetX: -12, offsetY: 3, ...STORE_ITEM_POSITIONS[6] },
        { price: '$1,000', spriteKey: 'zenGardenGlove', offsetX: -12, offsetY: 3, ...STORE_ITEM_POSITIONS[7] },
    ],
    [
        { price: '$30,000', spriteKey: 'storeMushroomGardenIcon', offsetX: -8, offsetY: 2, ...STORE_ITEM_POSITIONS[0] },
        { price: '$30,000', spriteKey: 'storeAquariumGardenIcon', offsetX: -8, offsetY: 2, ...STORE_ITEM_POSITIONS[1] },
        { price: '$200', spriteKey: 'zenWheelbarrow', offsetX: -12, offsetY: 3, ...STORE_ITEM_POSITIONS[2] },
        { price: '$3,000', spriteKey: 'stinkyTurn3', offsetX: -24, offsetY: 14, ...STORE_ITEM_POSITIONS[3] },
        { price: '$10,000', spriteKey: 'storeTreeOfWisdomIcon', offsetX: -8, offsetY: 2, ...STORE_ITEM_POSITIONS[4] },
        { price: '$2,500', spriteKey: 'treeFood', offsetX: -8, offsetY: -2, ...STORE_ITEM_POSITIONS[5] },
    ],
]

@ccclass('StoreScreen')
export class StoreScreen extends MenuScreenBase {
    public initialPage = 0
    public backButtonLabel = 'MAIN MENU'

    private _storePage = 0
    private _storeTime = 0
    private _hatchTimer = 0
    private _waitForDialog = false
    private _signNode: Node | null = null
    private _itemButtons: UIButton[] = []
    private _atlasFrames = new Map<SpriteFrame, Map<string, SpriteFrame>>()
    private _createdAtlasFrames: SpriteFrame[] = []
    private _loadedSprites: StoreScreenSprites | null = null
    private _loadedFonts: StoreScreenFonts | null = null

    async render(): Promise<void> {
        const [sprites, fonts] = await Promise.all([
            StoreScreenAssets.loadSprites(),
            StoreScreenAssets.loadFonts(),
        ])
        if (!sprites) return
        this._loadedSprites = sprites
        this._loadedFonts = fonts

        this._storePage = this._normalizeStorePage(this.initialPage)
        this._resetRoot('StoreScreenRoot')
        this._renderStore(sprites, fonts)
        UIButton.refreshHoverStates()
    }

    private _renderStore(sprites: StoreScreenSprites, fonts: StoreScreenFonts) {
        const hatchOpen = this._hatchTimer <= 0
        this._itemButtons = []
        this._createBackground(sprites.storeBackground)
        createSpriteNode({
            name: 'Car',
            spriteFrame: hatchOpen ? sprites.storeCar : sprites.storeCarClosed,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(196),
            y: this._cppY(138),
            anchorX: 0,
            anchorY: 1,
        })
        if (hatchOpen) {
            createSpriteNode({
                name: 'HatchbackOpen',
                spriteFrame: sprites.storeHatchbackOpen,
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(299),
                y: this._cppY(0),
                anchorX: 0,
                anchorY: 1,
            })
        }
        this._signNode = createSpriteNode({
            name: 'Sign',
            spriteFrame: sprites.storeSign,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(285),
            y: this._cppY(this._getSignY()),
            anchorX: 0,
            anchorY: 1,
        })

        if (hatchOpen) {
            for (const item of STORE_PAGES[this._storePage]) {
                this._createStoreItem(item, sprites, fonts)
            }
        }

        createSpriteNode({
            name: 'CoinBank',
            spriteFrame: sprites.coinBank,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(650),
            y: this._cppY(559),
            anchorX: 0,
            anchorY: 1,
        })
        this._createText({
            name: 'Money',
            text: '$0',
            baselineX: 758,
            baselineY: 583,
            font: fonts.money,
            color: STORE_MONEY_COLOR,
            align: 'right',
        })
        if (hatchOpen) {
            this._createText({
                name: 'Page',
                text: `Page ${this._storePage + 1} of ${STORE_PAGES.length}`,
                baselineX: 470,
                baselineY: 500,
                font: fonts.small,
                color: STORE_PAGE_COLOR,
                align: 'center',
            })
        }
        this._createStorePageButton('PrevButton', 252, 402, sprites.storePrevButton, sprites.storePrevButtonHighlight, () => {
            this._turnPage(-1)
        })
        this._createStorePageButton('NextButton', 596, 402, sprites.storeNextButton, sprites.storeNextButtonHighlight, () => {
            this._turnPage(1)
        })
        this._createStoreBackButton(sprites, fonts)
        this._setStoreButtonsInteractable(this._canInteractWithButtons())
    }

    private _turnPage(delta: number) {
        if (this._hatchTimer > 0) return
        this._storePage = (this._storePage + STORE_PAGES.length + delta) % STORE_PAGES.length
        this._hatchTimer = STORE_HATCH_TRANSITION_SECONDS
        this._rerenderLoaded()
        UIButton.refreshHoverStates()
    }

    private _normalizeStorePage(page: number) {
        return ((Math.trunc(page) % STORE_PAGES.length) + STORE_PAGES.length) % STORE_PAGES.length
    }

    update(deltaTime: number) {
        const wasReady = this._canInteractWithStoreItems()
        if (this._storeTime < STORE_INTERACTION_READY_FRAME) {
            this._storeTime = Math.min(
                STORE_INTERACTION_READY_FRAME,
                this._storeTime + deltaTime * STORE_UPDATE_RATE,
            )
            this._updateSignPosition()
            if (!wasReady && this._canInteractWithStoreItems()) {
                this._setItemButtonsInteractable(true)
                this._setStoreButtonsInteractable(true)
                UIButton.refreshHoverStates()
            }
        }

        if (this._hatchTimer <= 0) return

        this._hatchTimer = Math.max(0, this._hatchTimer - deltaTime)
        if (this._hatchTimer <= 0) {
            this._rerenderLoaded()
            this._refreshPageButtonPointerState()
            UIButton.refreshHoverStates()
        }
    }

    private _rerenderLoaded() {
        if (!this._loadedSprites || !this._loadedFonts) return
        this._resetRoot('StoreScreenRoot')
        this._renderStore(this._loadedSprites, this._loadedFonts)
    }

    private _updateSignPosition() {
        if (!this._signNode?.isValid) return
        this._signNode.setPosition(this._cppX(285), this._cppY(this._getSignY()), 0)
    }

    private _getSignY() {
        if (this._storeTime <= STORE_SIGN_ANIMATION_START_FRAME) return STORE_SIGN_START_Y
        if (this._storeTime >= STORE_SIGN_ANIMATION_END_FRAME) return STORE_SIGN_END_Y

        const progress = (this._storeTime - STORE_SIGN_ANIMATION_START_FRAME) /
            (STORE_SIGN_ANIMATION_END_FRAME - STORE_SIGN_ANIMATION_START_FRAME)
        const curveS = this._curveS(progress)
        const eased = this._curveS(curveS)
        return STORE_SIGN_START_Y + (STORE_SIGN_END_Y - STORE_SIGN_START_Y) * eased
    }

    private _curveS(time: number) {
        return 3 * time * time - 2 * time * time * time
    }

    private _setStoreButtonsInteractable(interactable: boolean, backInteractable = interactable && !this._waitForDialog) {
        const prevButton = this._root?.getChildByName('PrevButton')?.getComponent(UIButton)
        const nextButton = this._root?.getChildByName('NextButton')?.getComponent(UIButton)
        const backButton = this._root?.getChildByName('BackToMenuButton')?.getComponent(UIButton)
        if (prevButton) prevButton.interactable = interactable
        if (nextButton) nextButton.interactable = interactable
        if (backButton) backButton.interactable = backInteractable
    }

    private _setItemButtonsInteractable(interactable: boolean) {
        for (const button of this._itemButtons) {
            if (button.isValid) button.interactable = interactable
        }
    }

    private _canInteractWithStoreItems() {
        return this._hatchTimer <= 0 &&
            !this._waitForDialog &&
            this._storeTime >= STORE_INTERACTION_READY_FRAME
    }

    private _canInteractWithButtons() {
        return this._hatchTimer <= 0 && !this._waitForDialog
    }

    private _refreshPageButtonPointerState() {
        const prevButton = this._root?.getChildByName('PrevButton')?.getComponent(UIButton)
        const nextButton = this._root?.getChildByName('NextButton')?.getComponent(UIButton)
        const prevHovering = prevButton?.refreshHoverFromPointer(false) ?? false
        const nextHovering = nextButton?.refreshHoverFromPointer(false) ?? false

        if (prevHovering) {
            prevButton?.refreshHoverFromPointer()
        } else if (nextHovering) {
            nextButton?.refreshHoverFromPointer()
        } else {
            prevButton?.refreshHoverFromPointer()
            nextButton?.refreshHoverFromPointer()
        }
    }

    private _createStoreItem(
        item: StoreItemDefinition,
        sprites: StoreScreenSprites,
        fonts: StoreScreenFonts,
    ) {
        if (item.kind === 'upgradePacket') {
            this._createUpgradePacket(item, sprites)
        } else if (item.spriteKey) {
            createSpriteNode({
                name: 'StoreItemIcon',
                spriteFrame: sprites[item.spriteKey],
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(item.x + (item.offsetX ?? 0)),
                y: this._cppY(item.y + (item.offsetY ?? 0)),
                anchorX: 0,
                anchorY: 1,
            })
        }
        this._createStoreItemOverprint(item, fonts, this._root!, false)
        createSpriteNode({
            name: 'PriceTag',
            spriteFrame: sprites.storePriceTag,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(item.x - 3),
            y: this._cppY(item.y + 70),
            anchorX: 0,
            anchorY: 1,
        })
        this._createText({
            name: 'StoreItemPrice',
            text: item.price,
            baselineX: item.x + 23,
            baselineY: item.y + 85,
            font: fonts.small,
            color: STORE_PRICE_COLOR,
            align: 'center',
        })
        const highlightNode = this._createStoreItemHighlight(item, sprites, fonts)
        this._createStoreItemButton(item, highlightNode)
    }

    private _createStoreItemOverprint(
        item: StoreItemDefinition,
        fonts: StoreScreenFonts,
        parent: Node,
        forHighlight: boolean,
    ) {
        if (item.slotText) {
            this._createCenteredItemText(
                forHighlight ? 'StoreItemSlotTextHighlight' : 'StoreItemSlotText',
                item.slotText,
                item.x,
                item.y + 6,
                STORE_SLOT_TEXT_WIDTH,
                STORE_SLOT_TEXT_HEIGHT,
                fonts.item,
                parent,
            )
        }

        if (item.quantityText) {
            const quantityNode = this._createText({
                name: forHighlight ? 'StoreItemQuantityHighlight' : 'StoreItemQuantity',
                text: item.quantityText,
                baselineX: item.x + 56,
                baselineY: item.y + 62,
                font: fonts.item,
                color: forHighlight ? STORE_ITEM_HIGHLIGHT_TEXT_COLOR : Color.WHITE,
                align: 'right',
                parent,
            })
            if (forHighlight) {
                this._applyAdditiveMaterialToSprites(quantityNode)
            }
        }
    }

    private _createCenteredItemText(
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        font: StoreScreenFonts['item'],
        parent: Node = this._root!,
    ) {
        const node = createUINode(name, {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (font) renderer.setFontAssets(font)
        renderer.fontColor = Color.WHITE
        renderer.string = text
        renderer.maxWidth = width
        renderer.textAlign = 2
        renderer.forceRebuild()

        const textX = x
        const textY = y + Math.floor((height - renderer.contentHeight) / 2)
        node.setPosition(this._cppX(textX), this._cppY(textY), 0)
    }

    private _createUpgradePacket(item: StoreItemDefinition, sprites: StoreScreenSprites) {
        if (item.seedType != null) {
            SeedPacketRenderer.drawSeedPacket({
                name: 'UpgradePacket',
                parent: this._root!,
                layer: this.node.layer,
                seedType: item.seedType,
                drawCost: false,
                upgrade: true,
                seeds: sprites.seeds,
                packetPlants: sprites.packetPlants,
                cachedPacketPlants: sprites.packetPlantsCached,
                x: this._cppX(item.x),
                y: this._cppY(item.y),
            })
            return
        }

        createSpriteNode({
            name: 'UpgradePacketBackground',
            spriteFrame: this._getAtlasFrame(sprites.seeds, STORE_SEED_PACKET_UPGRADE_CEL, STORE_PACKET_WIDTH, STORE_PACKET_HEIGHT),
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(item.x),
            y: this._cppY(item.y),
            anchorX: 0,
            anchorY: 1,
        })
    }

    private _createStoreItemButton(item: StoreItemDefinition, highlightNode: Node | null) {
        const buttonNode = createUINode('StoreItemButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: STORE_ITEM_HIT_WIDTH,
            height: STORE_ITEM_HIT_HEIGHT,
            x: this._cppX(item.x),
            y: this._cppY(item.y),
        })
        const button = buttonNode.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.interactable = this._canInteractWithStoreItems()
        button.onStateChange = (state) => {
            if (highlightNode?.isValid) {
                highlightNode.active = state === 'hover' || state === 'pressed'
            }
        }
        button.onPress = () => {
            void this._showPurchaseConfirmation(highlightNode)
        }
        this._itemButtons.push(button)
    }

    private _createStoreItemHighlight(
        item: StoreItemDefinition,
        sprites: StoreScreenSprites,
        fonts: StoreScreenFonts,
    ) {
        let spriteFrame: SpriteFrame | null = null
        let x = item.x + (item.offsetX ?? 0)
        let y = item.y + (item.offsetY ?? 0)
        let useAdditive = true
        const highlight = item.highlight ?? (item.kind === 'upgradePacket' ? 'seedPacketFlash' : 'additiveIcon')

        if (highlight === 'seedPacketFlash') {
            spriteFrame = sprites.seedPacketFlash
            x = item.x
            y = item.y
            useAdditive = false
        } else if (item.kind === 'upgradePacket') {
            spriteFrame = sprites.storePacketUpgrade
            x = item.x - 7
            y = item.y + 7
        } else if (item.spriteKey) {
            spriteFrame = sprites[item.spriteKey]
        }
        if (!spriteFrame) return null

        const node = createUINode('StoreItemHighlight', {
            parent: this._root!,
            layer: this.node.layer,
        })
        const iconNode = createSpriteNode({
            name: 'StoreItemHighlight',
            spriteFrame,
            parent: node,
            layer: this.node.layer,
            x: this._cppX(x),
            y: this._cppY(y),
            anchorX: 0,
            anchorY: 1,
        })
        const sprite = iconNode.getComponent(Sprite)
        if (sprite && useAdditive) {
            sprite.color = new Color(
                STORE_ITEM_HIGHLIGHT_COLOR.r,
                STORE_ITEM_HIGHLIGHT_COLOR.g,
                STORE_ITEM_HIGHLIGHT_COLOR.b,
                item.highlightAlpha ?? STORE_ITEM_HIGHLIGHT_COLOR.a,
            )
            sprite.customMaterial = this._getAdditiveSpriteMaterial()
        }

        this._createStoreItemOverprint(item, fonts, node, true)

        node.active = false
        return node
    }

    private _applyAdditiveMaterialToSprites(node: Node) {
        const sprite = node.getComponent(Sprite)
        if (sprite) {
            sprite.customMaterial = this._getAdditiveSpriteMaterial()
        }
        for (const child of node.children) {
            this._applyAdditiveMaterialToSprites(child)
        }
    }

    private _getAdditiveSpriteMaterial() {
        if (additiveSpriteMaterial) return additiveSpriteMaterial

        additiveSpriteMaterial = new Material()
        additiveSpriteMaterial.initialize({
            effectName: 'for2d/builtin-sprite',
            defines: {
                USE_TEXTURE: true,
            },
            states: {
                blendState: {
                    targets: [
                        {
                            blend: true,
                            blendSrc: gfx.BlendFactor.SRC_ALPHA,
                            blendDst: gfx.BlendFactor.ONE,
                            blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                            blendDstAlpha: gfx.BlendFactor.ONE,
                        },
                    ],
                },
            },
        })
        return additiveSpriteMaterial
    }

    private async _showPurchaseConfirmation(activeHighlightNode?: Node | null) {
        if (this._waitForDialog || !this._canInteractWithStoreItems()) return

        this._waitForDialog = true
        this._setItemButtonsInteractable(false)
        this._setStoreButtonsInteractable(false, false)
        UIButton.refreshHoverStates()
        if (activeHighlightNode?.isValid) {
            activeHighlightNode.active = true
        }
        const node = createUINode('StorePurchaseDialog', { active: false, width: 100, height: 100 })
        const dialog = node.addComponent(MessageBox)
        dialog.dialogWidth = 500
        dialog.dialogHeight = 300
        dialog.title = 'Buy this item?'
        dialog.message = 'Are you sure you want to buy this item?'
        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(DialogButtonMode.YesNo)

        const parent = this.node.parent ?? this.node
        parent.addChild(node)
        node.active = true
        await dialog.waitForResult()

        this._waitForDialog = false
        this._setItemButtonsInteractable(this._canInteractWithStoreItems())
        this._setStoreButtonsInteractable(this._canInteractWithButtons())
        UIButton.refreshHoverStates()
    }

    private _getAtlasFrame(atlas: SpriteFrame, index: number, width: number, height: number) {
        const cacheKey = `${index}:${width}:${height}`
        let framesByAtlas = this._atlasFrames.get(atlas)
        if (!framesByAtlas) {
            framesByAtlas = new Map<string, SpriteFrame>()
            this._atlasFrames.set(atlas, framesByAtlas)
        }

        const cached = framesByAtlas.get(cacheKey)
        if (cached) return cached

        const atlasRect = atlas.rect
        const frame = new SpriteFrame()
        frame.reset({
            texture: atlas.texture,
            rect: new Rect(
                atlasRect.x + index * width,
                atlasRect.y,
                width,
                height,
            ),
            originalSize: new Size(width, height),
            offset: new Vec2(0, 0),
            isRotate: false,
        })
        framesByAtlas.set(cacheKey, frame)
        this._createdAtlasFrames.push(frame)
        return frame
    }

    private _createStorePageButton(
        name: string,
        x: number,
        y: number,
        normal: SpriteFrame,
        hover: SpriteFrame,
        onClick: () => void,
    ) {
        this._createImageButton({
            name,
            x,
            y,
            normal,
            hover,
            pressed: hover,
            pressSound: null,
            clickSound: SoundEffect.HatchbackClose,
            pressOffset: new Vec3(1, -1, 0),
            onClick,
        })
    }

    private _createStoreBackButton(sprites: StoreScreenSprites, fonts: StoreScreenFonts) {
        const buttonNode = this._createImageButton({
            name: 'BackToMenuButton',
            x: 366,
            y: 512,
            normal: sprites.storeMainMenuButton,
            hover: sprites.storeMainMenuButtonHighlight,
            pressed: sprites.storeMainMenuButtonDown,
            pressOffset: new Vec3(1, -1, 0),
            onClick: () => this.onBackToMenu?.(),
        })
        this._createStoreBackButtonLabel(buttonNode, fonts)
    }

    private _createStoreBackButtonLabel(buttonNode: Node, fonts: StoreScreenFonts) {
        const labelNode = createUINode('Label', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = labelNode.addComponent(FontRenderer)
        if (fonts.title) renderer.setFontAssets(fonts.title)
        renderer.fontColor = STORE_BUTTON_COLOR
        renderer.string = this.backButtonLabel
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(fonts.title?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(fonts.title?.config ?? null, renderer.string) || renderer.contentWidth
        const normalX = 62 - width / 2
        const normalY = -(38 - metrics.ascent / 2)
        labelNode.setPosition(normalX, normalY, 0)

        const button = buttonNode.getComponent(UIButton)!
        button.onStateChange = (state) => {
            const pressedOut = button.isPressed && !button.isHovering
            const highlightedText = (state === 'hover' || state === 'pressed') && !pressedOut
            renderer.fontColor = highlightedText ? STORE_BUTTON_HOVER_COLOR : STORE_BUTTON_COLOR
            labelNode.setPosition(state === 'pressed' ? normalX + 1 : normalX, normalY, 0)
        }
    }

    onDestroy() {
        for (const frame of this._createdAtlasFrames) {
            frame.destroy()
        }
        this._createdAtlasFrames = []
        this._atlasFrames.clear()
    }
}
