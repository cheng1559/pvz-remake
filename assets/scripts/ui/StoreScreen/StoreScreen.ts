import { _decorator, Color, gfx, JsonAsset, Material, Node, Rect, Size, Sprite, SpriteFrame, UITransform, Vec2, Vec3 } from 'cc'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import {
    StoreScreenAssets,
    type StoreScreenFonts,
    type StoreScreenSprites,
} from './StoreScreenAssets'
import { MenuScreenBase } from '../MenuScreenBase'
import { SoundEffect } from '@/core/SoundLoader'
import { scaleGameDeltaTime } from '@/game/GameDefinitions'
import { ProfileStore } from '@/game/persistence/ProfileStore'
import { UIButton } from '@/ui/Button'
import { DialogResult, MessageBox } from '@/ui/MessageBox/MessageBox'
import { MoneyCounter } from '@/ui/MoneyCounter'
import { SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { CrazyDaveWidget } from '@/ui/CrazyDaveWidget'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'
import { LawnStringLoader } from '@/core/LawnStringLoader'

const { ccclass } = _decorator

const STORE_BUTTON_COLOR = new Color(98, 153, 235)
const STORE_BUTTON_HOVER_COLOR = new Color(167, 192, 235)
const STORE_PAGE_COLOR = new Color(128, 128, 128)
const STORE_PRICE_COLOR = new Color(0, 0, 0)
const STORE_PACKET_WIDTH = 50
const STORE_PACKET_HEIGHT = 70
const STORE_SEED_PACKET_UPGRADE_CEL = 1
const STORE_HATCH_TRANSITION_SECONDS = 0.5
const STORE_HATCH_SHAKE_END_SECONDS = 0.35
const STORE_HATCH_SHAKE_MIN_Y = 1
const STORE_HATCH_SHAKE_MAX_Y = 3
const STORE_UPDATE_RATE = 100
const STORE_SIGN_ANIMATION_START_FRAME = 50
const STORE_SIGN_ANIMATION_END_FRAME = 110
const STORE_INTERACTION_READY_FRAME = 120
const STORE_SIGN_START_Y = -150
const STORE_SIGN_END_Y = 0
const STORE_CAR_X = 196
const STORE_CAR_Y = 138
const STORE_HATCHBACK_X = 299
const STORE_HATCHBACK_Y = 0
const STORE_PREV_BUTTON_X = 252
const STORE_PREV_BUTTON_Y = 402
const STORE_NEXT_BUTTON_X = 596
const STORE_NEXT_BUTTON_Y = 402
const STORE_BACK_BUTTON_X = 366
const STORE_BACK_BUTTON_Y = 512
const STORE_CRAZY_DAVE_ANIMATION_PATH = 'animations/crazydave'
const STORE_CRAZY_DAVE_X = -42
const STORE_CRAZY_DAVE_Y = 68
const STORE_CRAZY_DAVE_BUBBLE_X = 105
const STORE_CRAZY_DAVE_BUBBLE_Y = -58
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
const STORE_PURCHASE_PACKET_UPGRADE = 21
const STORE_DAVE_ITEM_BUBBLE_TICKS = 100
const STORE_DAVE_AMBIENT_BUBBLE_TICKS = 800
const STORE_DAVE_AMBIENT_COUNTDOWN_MIN = 500
const STORE_DAVE_AMBIENT_COUNTDOWN_MAX = 1000

let additiveSpriteMaterial: Material | null = null

type StoreItemKind = 'sprite' | 'upgradePacket'
type StoreItemHighlight = 'additiveIcon' | 'seedPacketFlash'
type StoreDaveMessageIndex = number | 'packetUpgrade'

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
    daveMessageIndex?: StoreDaveMessageIndex
    slotCount?: number
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
        { price: '$750', spriteKey: 'storePacketUpgrade', offsetX: -7, offsetY: 7, highlightAlpha: 32, slotCount: 7, daveMessageIndex: 'packetUpgrade', ...STORE_ITEM_POSITIONS[0] },
        { price: '$1,000', spriteKey: 'iconPoolCleaner', offsetX: 1, offsetY: 7, daveMessageIndex: 2026, ...STORE_ITEM_POSITIONS[1] },
        { price: '$200', spriteKey: 'iconRake', offsetX: -5, offsetY: 10, daveMessageIndex: 2028, ...STORE_ITEM_POSITIONS[2] },
        { price: '$3,000', spriteKey: 'iconRoofCleaner', offsetX: 0, offsetY: 28, daveMessageIndex: 2027, ...STORE_ITEM_POSITIONS[3] },
        { price: '$5,000', kind: 'upgradePacket', seedType: STORE_SEED_GATLINGPEA, daveMessageIndex: 2000, ...STORE_ITEM_POSITIONS[4] },
        { price: '$5,000', kind: 'upgradePacket', seedType: STORE_SEED_TWINSUNFLOWER, daveMessageIndex: 2001, ...STORE_ITEM_POSITIONS[5] },
        { price: '$7,500', kind: 'upgradePacket', seedType: STORE_SEED_GLOOMSHROOM, daveMessageIndex: 2002, ...STORE_ITEM_POSITIONS[6] },
        { price: '$10,000', kind: 'upgradePacket', seedType: STORE_SEED_CATTAIL, daveMessageIndex: 2003, ...STORE_ITEM_POSITIONS[7] },
    ],
    [
        { price: '$7,500', kind: 'upgradePacket', seedType: STORE_SEED_SPIKEROCK, daveMessageIndex: 2006, ...STORE_ITEM_POSITIONS[0] },
        { price: '$3,000', kind: 'upgradePacket', seedType: STORE_SEED_GOLD_MAGNET, daveMessageIndex: 2005, ...STORE_ITEM_POSITIONS[1] },
        { price: '$10,000', kind: 'upgradePacket', seedType: STORE_SEED_WINTERMELON, daveMessageIndex: 2004, ...STORE_ITEM_POSITIONS[2] },
        { price: '$20,000', kind: 'upgradePacket', seedType: STORE_SEED_COBCANNON, daveMessageIndex: 2007, ...STORE_ITEM_POSITIONS[3] },
        { price: '$30,000', spriteKey: 'imitaterSeed', offsetX: 0, offsetY: 0, highlight: 'seedPacketFlash', daveMessageIndex: 2008, ...STORE_ITEM_POSITIONS[4] },
        { price: '$2,000', spriteKey: 'storeFirstAidWallnutIcon', offsetX: -1, offsetY: 13, daveMessageIndex: 2033, ...STORE_ITEM_POSITIONS[5] },
    ],
    [
        { price: '$2,500', daveMessageIndex: 2010, ...STORE_ITEM_POSITIONS[0] },
        { price: '$2,500', daveMessageIndex: 2010, ...STORE_ITEM_POSITIONS[1] },
        { price: '$2,500', daveMessageIndex: 2010, ...STORE_ITEM_POSITIONS[2] },
        { price: '$10,000', spriteKey: 'wateringCanGold', offsetX: -14, offsetY: -4, daveMessageIndex: 2019, ...STORE_ITEM_POSITIONS[3] },
        { price: '$750', spriteKey: 'fertilizer', offsetX: -11, offsetY: -2, quantityText: 'x5', daveMessageIndex: 2020, ...STORE_ITEM_POSITIONS[4] },
        { price: '$1,000', spriteKey: 'bugSpray', offsetX: -12, offsetY: 3, quantityText: 'x5', daveMessageIndex: 2022, ...STORE_ITEM_POSITIONS[5] },
        { price: '$15,000', spriteKey: 'phonograph', offsetX: -12, offsetY: 3, daveMessageIndex: 2021, ...STORE_ITEM_POSITIONS[6] },
        { price: '$1,000', spriteKey: 'zenGardenGlove', offsetX: -12, offsetY: 3, daveMessageIndex: 2023, ...STORE_ITEM_POSITIONS[7] },
    ],
    [
        { price: '$30,000', spriteKey: 'storeMushroomGardenIcon', offsetX: -8, offsetY: 2, daveMessageIndex: 2032, ...STORE_ITEM_POSITIONS[0] },
        { price: '$30,000', spriteKey: 'storeAquariumGardenIcon', offsetX: -8, offsetY: 2, daveMessageIndex: 2029, ...STORE_ITEM_POSITIONS[1] },
        { price: '$200', spriteKey: 'zenWheelbarrow', offsetX: -12, offsetY: 3, daveMessageIndex: 2024, ...STORE_ITEM_POSITIONS[2] },
        { price: '$3,000', spriteKey: 'stinkyTurn3', offsetX: -24, offsetY: 14, daveMessageIndex: 2025, ...STORE_ITEM_POSITIONS[3] },
        { price: '$10,000', spriteKey: 'storeTreeOfWisdomIcon', offsetX: -8, offsetY: 2, daveMessageIndex: 2030, ...STORE_ITEM_POSITIONS[4] },
        { price: '$2,500', spriteKey: 'treeFood', offsetX: -8, offsetY: -2, daveMessageIndex: 2031, ...STORE_ITEM_POSITIONS[5] },
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
    private _carNode: Node | null = null
    private _signNode: Node | null = null
    private _itemButtons: UIButton[] = []
    private _atlasFrames = new Map<SpriteFrame, Map<string, SpriteFrame>>()
    private _createdAtlasFrames: SpriteFrame[] = []
    private _loadedSprites: StoreScreenSprites | null = null
    private _loadedFonts: StoreScreenFonts | null = null
    private _crazyDaveAnimation: JsonAsset | null = null
    private _crazyDave: CrazyDaveWidget | null = null
    private _crazyDaveEntered = false
    private _lawnStrings: Record<string, string> = {}
    private _crazyDaveMessageIndex = -1
    private _crazyDaveBubbleCountdown = 0
    private _crazyDaveAmbientCountdown = 200
    private _previousCrazyDaveAmbientIndex = -1
    private _hoveredStoreItem: StoreItemDefinition | null = null

    async render(): Promise<void> {
        const [sprites, fonts, crazyDaveAnimation, lawnStrings] = await Promise.all([
            StoreScreenAssets.loadSprites(),
            StoreScreenAssets.loadFonts(),
            StartupResourceLoader.loadJson(STORE_CRAZY_DAVE_ANIMATION_PATH),
            LawnStringLoader.load(),
        ])
        if (!sprites) return
        this._loadedSprites = sprites
        this._loadedFonts = fonts
        this._crazyDaveAnimation = crazyDaveAnimation
        this._lawnStrings = lawnStrings

        this._storePage = this._normalizeStorePage(this.initialPage)
        this._resetRoot('StoreContentRoot')
        this._renderStore(sprites, fonts)
        UIButton.refreshHoverStates()
    }

    private _renderStore(sprites: StoreScreenSprites, fonts: StoreScreenFonts) {
        const hatchOpen = this._hatchTimer <= 0
        this._itemButtons = []
        this._createBackground(sprites.storeBackground)
        this._carNode = createSpriteNode({
            name: 'Car',
            spriteFrame: hatchOpen ? sprites.storeCar : sprites.storeCarClosed,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(STORE_CAR_X),
            y: this._cppY(STORE_CAR_Y),
            anchorX: 0,
            anchorY: 1,
        })
        if (hatchOpen) {
            createSpriteNode({
                name: 'HatchbackOpen',
                spriteFrame: sprites.storeHatchbackOpen,
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(STORE_HATCHBACK_X),
                y: this._cppY(STORE_HATCHBACK_Y),
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

        this._createCrazyDave(sprites, fonts)

        new MoneyCounter({
            parent: this._root!,
            layer: this.node.layer,
            coinBank: sprites.coinBank,
            font: fonts.money,
            amount: ProfileStore.getCurrentProfile()?.coins ?? 0,
            x: this._cppX(650),
            y: this._cppY(559),
            textRightOffset: 113,
        })
        if (hatchOpen) {
            this._createText({
                name: 'Page',
                text: this._formatLawnString('STORE_PAGE', `Page ${this._storePage + 1} of ${STORE_PAGES.length}`, {
                    PAGE: this._storePage + 1,
                    NUM_PAGES: STORE_PAGES.length,
                }),
                baselineX: 470,
                baselineY: 500,
                font: fonts.small,
                color: STORE_PAGE_COLOR,
                align: 'center',
            })
        }
        this._createStorePageButton('PrevButton', STORE_PREV_BUTTON_X, STORE_PREV_BUTTON_Y, sprites.storePrevButton, sprites.storePrevButtonHighlight, () => {
            this._turnPage(-1)
        })
        this._createStorePageButton('NextButton', STORE_NEXT_BUTTON_X, STORE_NEXT_BUTTON_Y, sprites.storeNextButton, sprites.storeNextButtonHighlight, () => {
            this._turnPage(1)
        })
        this._createStoreBackButton(sprites, fonts)
        this._setStoreButtonsInteractable(this._canInteractWithButtons())
    }

    private _turnPage(delta: number) {
        if (this._hatchTimer > 0) return
        this._storePage = (this._storePage + STORE_PAGES.length + delta) % STORE_PAGES.length
        this._hatchTimer = STORE_HATCH_TRANSITION_SECONDS
        this._hoveredStoreItem = null
        this._stopCrazyDaveTalking(true)
        this._rerenderLoaded()
        UIButton.refreshHoverStates()
    }

    private _normalizeStorePage(page: number) {
        return ((Math.trunc(page) % STORE_PAGES.length) + STORE_PAGES.length) % STORE_PAGES.length
    }

    update(deltaTime: number) {
        const scaledDeltaTime = scaleGameDeltaTime(deltaTime)
        const ticks = scaledDeltaTime * STORE_UPDATE_RATE
        this._crazyDave?.updateTicks(ticks, true)
        this._crazyDave?.syncBubbleShake()
        this._updateCrazyDaveBubble(ticks)
        const wasReady = this._canInteractWithStoreItems()
        if (this._storeTime < STORE_INTERACTION_READY_FRAME) {
            this._storeTime = Math.min(
                STORE_INTERACTION_READY_FRAME,
                this._storeTime + scaledDeltaTime * STORE_UPDATE_RATE,
            )
            this._updateSignPosition()
            if (!wasReady && this._canInteractWithStoreItems()) {
                this._setItemButtonsInteractable(true)
                this._setStoreButtonsInteractable(true)
                UIButton.refreshHoverStates()
            }
        }

        if (this._hatchTimer <= 0) return

        this._hatchTimer = Math.max(0, this._hatchTimer - scaledDeltaTime)
        if (this._hatchTimer <= 0) {
            this._rerenderLoaded()
            this._refreshPageButtonPointerState()
            UIButton.refreshHoverStates()
        } else {
            this._updateHatchCarShake()
        }
    }

    private _rerenderLoaded() {
        if (!this._loadedSprites || !this._loadedFonts) return
        this._hoveredStoreItem = null
        this._carNode = null
        this._signNode = null
        this._itemButtons = []
        this._resetRoot('StoreContentRoot')
        this._renderStore(this._loadedSprites, this._loadedFonts)
    }

    private _updateHatchCarShake() {
        if (!this._carNode?.isValid) return

        const shakeY = this._hatchTimer > STORE_HATCH_SHAKE_END_SECONDS
            ? STORE_HATCH_SHAKE_MIN_Y + Math.floor(Math.random() * (STORE_HATCH_SHAKE_MAX_Y - STORE_HATCH_SHAKE_MIN_Y + 1))
            : 0
        this._carNode.setPosition(this._cppX(STORE_CAR_X), this._cppY(STORE_CAR_Y + shakeY), 0)
        this._root?.getChildByName('PrevButton')?.setPosition(this._cppX(STORE_PREV_BUTTON_X), this._cppY(STORE_PREV_BUTTON_Y + shakeY), 0)
        this._root?.getChildByName('NextButton')?.setPosition(this._cppX(STORE_NEXT_BUTTON_X), this._cppY(STORE_NEXT_BUTTON_Y + shakeY), 0)
        this._root?.getChildByName('BackToMenuButton')?.setPosition(this._cppX(STORE_BACK_BUTTON_X), this._cppY(STORE_BACK_BUTTON_Y + shakeY), 0)
    }

    private _updateCrazyDaveBubble(ticks: number) {
        if (this._waitForDialog || this._hatchTimer > 0) return

        if (this._hoveredStoreItem && this._canInteractWithStoreItems()) {
            this._showCrazyDaveItemMessage(this._hoveredStoreItem)
            return
        }

        if (this._crazyDaveBubbleCountdown > 0) {
            this._crazyDaveBubbleCountdown = Math.max(0, this._crazyDaveBubbleCountdown - ticks)
            if (this._crazyDaveBubbleCountdown === 0) {
                this._stopCrazyDaveTalking()
            }
            return
        }

        if (!this._canInteractWithButtons()) return

        this._crazyDaveAmbientCountdown -= ticks
        if (this._crazyDaveAmbientCountdown > 0) return

        const messageIndex = this._pickCrazyDaveAmbientMessage()
        this._previousCrazyDaveAmbientIndex = messageIndex
        this._setCrazyDaveBubbleText(messageIndex, STORE_DAVE_AMBIENT_BUBBLE_TICKS, false)
        this._crazyDaveAmbientCountdown = this._randomCrazyDaveAmbientCountdown()
    }

    private _setCrazyDaveBubbleText(messageIndex: number, countdown: number, clickToContinue: boolean) {
        const rawText = this._getCrazyDaveText(messageIndex)
        if (!rawText || !this._crazyDave?.showMessage(rawText, {
            clickToContinue,
            restartNoSoundWhileTalking: false,
        })) return

        this._crazyDaveMessageIndex = messageIndex
        this._crazyDaveBubbleCountdown = countdown
    }

    private _stopCrazyDaveTalking(stopSound = false) {
        this._crazyDave?.stopTalking({ stopSound })
        this._crazyDaveMessageIndex = -1
        this._crazyDaveBubbleCountdown = 0
    }

    private _showCrazyDaveItemMessage(item: StoreItemDefinition) {
        const messageIndex = this._resolveCrazyDaveMessageIndex(item.daveMessageIndex)
        if (messageIndex < 0) return

        if (this._crazyDaveMessageIndex !== messageIndex) {
            this._setCrazyDaveBubbleText(messageIndex, STORE_DAVE_ITEM_BUBBLE_TICKS, false)
        } else {
            this._crazyDaveBubbleCountdown = STORE_DAVE_ITEM_BUBBLE_TICKS
        }
        this._crazyDaveAmbientCountdown = this._randomCrazyDaveAmbientCountdown()
    }

    private _resolveCrazyDaveMessageIndex(messageIndex: StoreDaveMessageIndex | undefined) {
        if (messageIndex == null) return -1
        if (messageIndex !== 'packetUpgrade') return messageIndex

        const profile = ProfileStore.getCurrentProfile()
        const purchaseCount = Math.max(0, Math.min(3, Math.floor(profile?.purchases[STORE_PURCHASE_PACKET_UPGRADE] ?? 0)))
        return 2011 + purchaseCount
    }

    private _getCrazyDaveText(messageIndex: number) {
        let text = LawnStringLoader.translateOptional(`[CRAZY_DAVE_${messageIndex}]`, this._lawnStrings)
        const profile = ProfileStore.getCurrentProfile()
        text = text.replace(/\{MONEY\}/g, this._formatStoreMoney(profile?.coins ?? 0))
        text = text.replace(/\{UPGRADE_COST\}/g, '$750')
        text = text.replace(/\{PLAYER_NAME\}/g, profile?.name ?? '')
        return text
    }

    private _formatStoreMoney(coins: number) {
        return `$${Math.max(0, Math.floor(coins)) * 10}`
    }

    private _formatLawnString(key: string, fallback: string, replacements: Record<string, string | number>) {
        let text = LawnStringLoader.translateOptional(`[${key}]`, this._lawnStrings) || fallback
        for (const [name, value] of Object.entries(replacements)) {
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
        }
        return text
    }

    private _localizedBackButtonLabel() {
        const key = {
            'MAIN MENU': 'STORE_MAIN_MENU_BUTTON',
            'GO BACK': 'STORE_BACK_TO_GAME',
        }[this.backButtonLabel.toUpperCase()]
        return key ? LawnStringLoader.translateOptional(`[${key}]`, this._lawnStrings) || this.backButtonLabel : this.backButtonLabel
    }

    private _pickCrazyDaveAmbientMessage() {
        const candidates = [2015, 2016, 2017, 2018].filter((messageIndex) => messageIndex !== this._previousCrazyDaveAmbientIndex)
        return candidates[Math.floor(Math.random() * candidates.length)] ?? 2015
    }

    private _randomCrazyDaveAmbientCountdown() {
        return STORE_DAVE_AMBIENT_COUNTDOWN_MIN +
            Math.floor(Math.random() * (STORE_DAVE_AMBIENT_COUNTDOWN_MAX - STORE_DAVE_AMBIENT_COUNTDOWN_MIN + 1))
    }

    private _createCrazyDave(sprites: StoreScreenSprites, fonts: StoreScreenFonts) {
        if (!this._crazyDaveAnimation?.json) return
        if (this._crazyDave?.isValid && this._crazyDave.node.isValid) {
            this._crazyDave.node.setPosition(this._cppX(STORE_CRAZY_DAVE_X), this._cppY(STORE_CRAZY_DAVE_Y), 0)
            this._crazyDave.node.setSiblingIndex(this.node.children.length - 1)
            return
        }

        const node = createUINode('CrazyDave', {
            parent: this.node,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 320,
            height: 360,
            x: this._cppX(STORE_CRAZY_DAVE_X),
            y: this._cppY(STORE_CRAZY_DAVE_Y),
        })
        const widget = node.addComponent(CrazyDaveWidget)
        this._crazyDave = widget
        void widget.initialize({
            animation: this._crazyDaveAnimation,
            bubbleSprite: sprites.storeSpeechBubble,
            bubbleX: STORE_CRAZY_DAVE_BUBBLE_X,
            bubbleY: STORE_CRAZY_DAVE_BUBBLE_Y,
            daveFont: fonts.dave,
            continueFont: fonts.money,
            continueText: LawnStringLoader.translate('[CLICK_TO_CONTINUE]', this._lawnStrings),
            layer: this.node.layer,
            animationsEnabled: true,
        }).then((ready) => {
            if (!ready || !widget.isValid) return
            if (this._crazyDaveEntered) {
                widget.playIdle()
                return
            }
            this._crazyDaveEntered = true
            widget.enterThen(() => {})
        })
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
        if (!interactable) this._hoveredStoreItem = null
        for (const button of this._itemButtons) {
            if (button.isValid) button.interactable = interactable
        }
    }

    private _canInteractWithStoreItems() {
        return this._hatchTimer <= 0 &&
            !this._waitForDialog
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
        const slotText = item.slotCount == null
            ? item.slotText
            : this._formatLawnString('STORE_UPGRADE_SLOTS', `${item.slotCount}\nslots`, {
                SLOTS: item.slotCount,
            })
        if (slotText) {
            this._createCenteredItemText(
                forHighlight ? 'StoreItemSlotTextHighlight' : 'StoreItemSlotText',
                slotText,
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
            if (state === 'hover' || state === 'pressed') {
                this._hoveredStoreItem = item
                this._showCrazyDaveItemMessage(item)
            } else if (this._hoveredStoreItem === item) {
                this._hoveredStoreItem = null
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

        this._hoveredStoreItem = null
        this._stopCrazyDaveTalking()
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
        dialog.title = LawnStringLoader.translateOptional('[BUY_ITEM_HEADER]', this._lawnStrings) || 'Buy this item?'
        dialog.message = LawnStringLoader.translateOptional('[BUY_ITEM]', this._lawnStrings) || 'Are you sure you want to buy this item?'
        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtons([
            {
                label: LawnStringLoader.translateOptional('[DIALOG_BUTTON_YES]', this._lawnStrings) || 'Yes',
                result: DialogResult.Yes,
            },
            {
                label: LawnStringLoader.translateOptional('[DIALOG_BUTTON_NO]', this._lawnStrings) || 'No',
                result: DialogResult.No,
            },
        ])

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
            x: STORE_BACK_BUTTON_X,
            y: STORE_BACK_BUTTON_Y,
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
        renderer.string = this._localizedBackButtonLabel()
        renderer.forceRebuild()

        const size = buttonNode.getComponent(UITransform)!
        const metrics = FontMetricsUtil.getMetrics(fonts.title?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(fonts.title?.config ?? null, renderer.string) || renderer.contentWidth
        const baselineY = 2 + (size.height - metrics.ascent / 6 + metrics.ascent - 1) / 2
        const normalX = -6 + (size.width - width) / 2
        const normalY = -(baselineY - metrics.ascent)
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
