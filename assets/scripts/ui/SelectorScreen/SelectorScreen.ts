import {
    _decorator,
    randomRangeInt,
    randomRange,
    Node,
    JsonAsset,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    Color,
    Mask,
    Sprite,
} from 'cc'
import { AnimationComponent } from '@/components/AnimationComponent'
import { AnimNode } from '@/core/Animator/AnimNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { ChallengePage } from '@/ui/ChallengeScreen'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { Animator } from '@/core/Animator'
import { scaleGameDeltaTime } from '@/game/GameDefinitions'
import { getAtlasFrame } from '@/ui/SeedPacketRenderer'
import { ButtonConfig } from './SelectorScreen.d'
import {
    BUTTON_CONFIGS,
    WOODSIGN_BUTTON_CONFIGS,
    AUX_BUTTON_CONFIGS,
    FLOWER_CENTERS,
} from './SelectorScreenConfig'

const { ccclass, property } = _decorator

const MODE_BUTTON_NAMES = new Set(['adventure', 'miniGames', 'Puzzle', 'Survival'])
const BOARD_WIDTH = 800
const ZOMBIE_HAND_CLIP_HEIGHT = 560
const ZOMBIE_HAND_X = -70
const ZOMBIE_HAND_Y = -10
const SELECTOR_OPEN_RATE = 30
const SELECTOR_SIGN_RATE = 30
const SELECTOR_CLOUD_RATE = 0.5
const SELECTOR_CLOUD_INITIAL_MIN_TICKS = -6000
const SELECTOR_CLOUD_INITIAL_MAX_TICKS = 2000
const SELECTOR_TICK_SECONDS = 0.01
const SELECTOR_GRASS_INITIAL_RATE = 6
const SELECTOR_FLOWER_RATE = 24
const LIMBS_POP_PITCH_RANGE = 10
const START_ADVENTURE_FLASH_SECONDS = 0.1
const START_ADVENTURE_LAUGH_SECONDS = 1.25
const START_ADVENTURE_COMPLETE_SECONDS = 4.5
const SELECTOR_ADVENTURE_TRACK = 'SelectorScreen_Adventure_button'
const SELECTOR_START_ADVENTURE_TRACK = 'SelectorScreen_StartAdventure_button'
const SELECTOR_ADVENTURE_SHADOW_TRACK = 'SelectorScreen_Adventure_shadow'
const SELECTOR_START_ADVENTURE_SHADOW_TRACK = 'SelectorScreen_StartAdventure_shadow'
const SELECTOR_ADVENTURE_IMAGE = 'selectorscreen_adventure_button'
const SELECTOR_ADVENTURE_HIGHLIGHT_IMAGE = 'selectorscreen_adventure_highlight'
const SELECTOR_START_ADVENTURE_IMAGE = 'selectorscreen_startadventure_button1'
const SELECTOR_START_ADVENTURE_HIGHLIGHT_IMAGE = 'selectorscreen_startadventure_highlight'
const SELECTOR_ALMANAC_KEY_SHADOW_TRACK = 'almanac_key_shadow'
const SELECTOR_ALMANAC_SHADOW_IMAGE = 'selectorscreen_almanac_shadow'
const SELECTOR_KEY_SHADOW_IMAGE = 'selectorscreen_key_shadow'
const SELECTOR_LEVEL_NUMBER_IMAGE = 'selectorscreen_levelnumbers'
const SELECTOR_LEVEL_NUMBER_TRACK = 'SelectorScreen_BG_Right'
const SELECTOR_LEVEL_NUMBER_WIDTH = 12
const SELECTOR_LEVEL_NUMBER_HEIGHT = 17
const SELECTOR_LEVEL_NUMBER_COLUMNS = 10
const SELECTOR_LEVEL_STAGE_X = 486
const SELECTOR_LEVEL_STAGE_Y = 47
const SELECTOR_LEVEL_SUB_X = 509
const SELECTOR_LEVEL_SUB_Y = 50
const SELECTOR_LEVEL_SUB_TEN_X = 518
const SELECTOR_LEVEL_SUB_TEN_Y = 51

interface CloudLoopState {
    node: AnimNode
    animationName: string
    delayRemaining: number
}

interface SelectorAccessState {
    minigamesLocked: boolean
    puzzleLocked: boolean
    survivalLocked: boolean
    almanacAvailable: boolean
    storeAvailable: boolean
    zenGardenAvailable: boolean
}

@ccclass('SelectorScreen')
export class SelectorScreen extends AnimationComponent {
    @property(JsonAsset)
    zombieArmAnimation: JsonAsset = null!

    cloudNodes: AnimNode[] = []
    grassNode: AnimNode
    openNode: AnimNode
    signNode: AnimNode
    flowerNodes: AnimNode[] = []
    zombieHandNode: AnimNode
    zombieHandRockNode: AnimNode

    private _buttonContainer: Node = null!
    private _woodsignContainer: Node = null!
    private _auxButtonContainer: Node = null!
    private _buttons: Map<string, UIButton> = new Map()
    private _flowerButtons: UIButton[] = []
    private _selectorButtonsReady = false
    private _trackedButtons: {
        button: UIButton
        name: string
        trackName: string
        offsetX: number
        offsetY: number
    }[] = []
    private _startAdventureActive = false
    private _startAdventureElapsed = 0
    private _startAdventureFlashCounter = 0
    private _startAdventureFlashElapsed = 0
    private _startAdventureLaughPlayed = false
    private _cloudLoopStates: CloudLoopState[] = []
    private _grassLoopActive = false
    private _grassLoopElapsed = 0
    private _grassLoopInterval = 0
    private _adventureLevel = 1
    private _finishedAdventure = 0
    private _levelNumberContainer: Node | null = null
    private _levelNumberAtlas: SpriteFrame | null = null
    private _levelNumberSprites: Sprite[] = []
    private _accessState: SelectorAccessState = {
        minigamesLocked: true,
        puzzleLocked: true,
        survivalLocked: true,
        almanacAvailable: false,
        storeAvailable: false,
        zenGardenAvailable: false,
    }

    public onLockedModeClick: ((name: string) => void) | null = null
    public onMessageBoxRequest: (() => void) | null = null
    public onOptionsRequest: (() => void) | null = null
    public onHelpRequest: (() => void) | null = null
    public onQuitRequest: (() => void) | null = null
    public onChallengePageRequest: ((page: ChallengePage) => void) | null = null
    public onAchievementRequest: (() => void) | null = null
    public onZenGardenRequest: (() => void) | null = null
    public onStoreRequest: (() => void) | null = null
    public onAlmanacRequest: (() => void) | null = null
    public onAdventureRequest: (() => void) | null = null
    public onStartAdventureTransition: (() => void) | null = null

    public get adventureLevel(): number {
        return this._adventureLevel
    }

    public set adventureLevel(value: number) {
        const normalized = Math.max(1, Math.floor(Number(value) || 1))
        if (this._adventureLevel === normalized) return
        this._adventureLevel = normalized
        this._renderLevelNumbers()
        this._updateAdventureButtonMode()
        this._applyAccessState()
    }

    public get finishedAdventure(): number {
        return this._finishedAdventure
    }

    public set finishedAdventure(value: number) {
        const normalized = Math.max(0, Math.floor(Number(value) || 0))
        if (this._finishedAdventure === normalized) return
        this._finishedAdventure = normalized
        this._renderLevelNumbers()
        this._updateAdventureButtonMode()
        this._applyAccessState()
    }

    public setAccessState(state: Partial<SelectorAccessState>) {
        this._accessState = { ...this._accessState, ...state }
        this._applyAccessState()
    }

    async init() {
        const cloudNames = ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']
        for (const name of cloudNames) {
            const node = this.animator.addAnimNode(name)
            this.cloudNodes.push(node)
        }
        this.openNode = this.animator.addAnimNode('open')
        this.signNode = this.animator.addAnimNode('sign')
        this.grassNode = this.animator.addAnimNode('grass')
        const flowerNames = ['flower1', 'flower2', 'flower3']
        for (const name of flowerNames) {
            const node = this.animator.addAnimNode(name)
            this.flowerNodes.push(node)
        }

        this._initButtonContainer()
        await this._initLevelNumbers()
        await this._createButtons()
        this._updateAdventureButtonMode()
        this._applyAccessState()
        this._initZombieHandAnim()
    }

    private _initZombieHandAnim() {
        const zombieHandNode = createUINode('ZombieHand', { layer: this.node.layer })

        const clippedNode = createUINode('ClippedBody', {
            layer: this.node.layer,
            parent: zombieHandNode,
            anchorX: 0,
            anchorY: 1,
            width: BOARD_WIDTH,
            height: ZOMBIE_HAND_CLIP_HEIGHT,
        })
        const mask = clippedNode.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_RECT

        const bodyAnimator = this._createZombieHandAnimator(clippedNode, 'BodyAnimator')
        const rockAnimator = this._createZombieHandAnimator(zombieHandNode, 'RockAnimator')

        const trackNames = Object.keys(this.zombieArmAnimation.json.default?.tracks ?? {})
        for (const trackName of trackNames) {
            if (trackName.startsWith('rock')) {
                bodyAnimator.hideTrack(trackName)
            } else {
                rockAnimator.hideTrack(trackName)
            }
        }

        this.zombieHandNode = bodyAnimator.addAnimNode('default')
        this.zombieHandRockNode = rockAnimator.addAnimNode('default')

        this.animator.insertExternalNode('__zombie_hand__', zombieHandNode, 34)
    }

    private _createZombieHandAnimator(parent: Node, name: string): Animator {
        const animatorNode = new Node(name)
        animatorNode.layer = this.node.layer
        animatorNode.setPosition(ZOMBIE_HAND_X, ZOMBIE_HAND_Y, 0)
        parent.addChild(animatorNode)

        const animator = animatorNode.addComponent(Animator)
        animator.parseJson(this.zombieArmAnimation.json)
        return animator
    }

    private _initButtonContainer() {
        const container = createUINode('Buttons', { layer: this.node.layer })
        this.animator.insertExternalNode('__buttons__', container, 34)
        this._buttonContainer = container

        const wsContainer = createUINode('WoodsignButtons', { layer: this.node.layer })
        this.animator.insertExternalNode('__woodsigns__', wsContainer, 46)
        this._woodsignContainer = wsContainer

        const auxContainer = createUINode('AuxButtons', { layer: this.node.layer })
        this.animator.insertExternalNode('__aux_buttons__', auxContainer, 34)
        this._auxButtonContainer = auxContainer
    }

    private async _initLevelNumbers() {
        this._levelNumberAtlas = await SpriteLoader.load(SELECTOR_LEVEL_NUMBER_IMAGE)
        if (!this._levelNumberAtlas) {
            console.warn(`[SelectorScreen] Missing level number sprite '${SELECTOR_LEVEL_NUMBER_IMAGE}'`)
            return
        }

        const container = createUINode('LevelNumbers', { layer: this.node.layer, anchorX: 0, anchorY: 1 })
        this.animator.insertExternalNode('__level_numbers__', container, 35)
        this._levelNumberContainer = container
        this._renderLevelNumbers()
    }

    private _renderLevelNumbers() {
        const container = this._levelNumberContainer
        const atlas = this._levelNumberAtlas
        if (!container || !atlas) return

        container.removeAllChildren()
        this._levelNumberSprites = []

        if (this._shouldShowStartAdventureButton()) {
            container.active = false
            return
        }

        const parts = this._getAdventureLevelParts(this._adventureLevel)
        const stageOffsetX = parts.stage === 4 ? -1 : 0
        const stageOffsetY = parts.stage === 1 ? 1 : 0
        const subOffsetX = parts.sub === 3 ? -1 : 0

        this._createLevelNumberSprite(
            `stage_${parts.displayStage}`,
            parts.displayStage,
            SELECTOR_LEVEL_STAGE_X + stageOffsetX,
            -(SELECTOR_LEVEL_STAGE_Y + stageOffsetY),
        )

        if (parts.sub < 10) {
            this._createLevelNumberSprite(
                `sub_${parts.sub}`,
                parts.sub,
                SELECTOR_LEVEL_SUB_X + subOffsetX,
                -SELECTOR_LEVEL_SUB_Y,
            )
        } else if (parts.sub === 10) {
            this._createLevelNumberSprite(
                'sub_1',
                1,
                SELECTOR_LEVEL_SUB_X + subOffsetX,
                -SELECTOR_LEVEL_SUB_Y,
            )
            this._createLevelNumberSprite(
                'sub_0',
                0,
                SELECTOR_LEVEL_SUB_TEN_X + subOffsetX,
                -SELECTOR_LEVEL_SUB_TEN_Y,
            )
        }

        this._syncLevelNumberColor()
        this._updateLevelNumberPosition()
    }

    private _createLevelNumberSprite(name: string, cel: number, x: number, y: number) {
        const atlas = this._levelNumberAtlas
        const container = this._levelNumberContainer
        if (!atlas || !container) return

        const node = createSpriteNode({
            name,
            spriteFrame: getAtlasFrame(
                atlas,
                cel,
                SELECTOR_LEVEL_NUMBER_WIDTH,
                SELECTOR_LEVEL_NUMBER_HEIGHT,
                SELECTOR_LEVEL_NUMBER_COLUMNS,
            ),
            parent: container,
            layer: this.node.layer,
            x,
            y,
            anchorX: 0,
            anchorY: 1,
        })
        const sprite = node.getComponent(Sprite)
        if (sprite) this._levelNumberSprites.push(sprite)
    }

    private _getAdventureLevelParts(level: number) {
        const normalized = Math.max(1, Math.floor(Number(level) || 1))
        const stage = Math.max(1, Math.min(6, Math.floor((normalized - 1) / 10) + 1))
        const sub = normalized - (stage - 1) * 10
        const displayStage = stage
        return { stage, sub, displayStage }
    }

    private _updateLevelNumberPosition() {
        const container = this._levelNumberContainer
        if (!container) return

        if (this._shouldShowStartAdventureButton()) {
            container.active = false
            return
        }

        const frame = this.animator.getTrackFrame(SELECTOR_LEVEL_NUMBER_TRACK)
        if (!frame) {
            container.active = false
            return
        }

        container.active = true
        const adventureButton = this._buttons.get('adventure')
        const pressOffset = adventureButton?.isPressed && adventureButton.isHovering ? 1 : 0
        container.setPosition(frame.x + pressOffset, -(frame.y + pressOffset), 0)
    }

    private _syncLevelNumberColor() {
        const color = this._buttons.get('adventure')?.color ?? Color.WHITE
        for (const sprite of this._levelNumberSprites) {
            sprite.color = color.clone()
        }
    }

    private _shouldShowStartAdventureButton() {
        return this._adventureLevel <= 1 && this._finishedAdventure <= 0
    }

    private _getAdventureButtonTrackName() {
        return this._shouldShowStartAdventureButton() ? SELECTOR_START_ADVENTURE_TRACK : SELECTOR_ADVENTURE_TRACK
    }

    private _updateAdventureButtonMode() {
        this.animator?.hideTrack(SELECTOR_ADVENTURE_TRACK)
        this.animator?.hideTrack(SELECTOR_START_ADVENTURE_TRACK)

        const button = this._buttons.get('adventure')
        const showStartAdventure = this._shouldShowStartAdventureButton()
        if (showStartAdventure) {
            this.animator?.hideTrack(SELECTOR_ADVENTURE_SHADOW_TRACK)
            this.animator?.showTrack(SELECTOR_START_ADVENTURE_SHADOW_TRACK)
        } else {
            this.animator?.showTrack(SELECTOR_ADVENTURE_SHADOW_TRACK)
            this.animator?.hideTrack(SELECTOR_START_ADVENTURE_SHADOW_TRACK)
        }

        if (!button) return

        const normalSprite = SpriteLoader.get(
            showStartAdventure ? SELECTOR_START_ADVENTURE_IMAGE : SELECTOR_ADVENTURE_IMAGE,
        )
        const highlightSprite = SpriteLoader.get(
            showStartAdventure ? SELECTOR_START_ADVENTURE_HIGHLIGHT_IMAGE : SELECTOR_ADVENTURE_HIGHLIGHT_IMAGE,
        )
        if (!normalSprite) return

        button.normalSprite = normalSprite
        button.pressedSprite = highlightSprite ?? normalSprite
        button.hoverSprite = highlightSprite ?? normalSprite
        button.setVisualSprite(button.node.getComponentInChildren(Sprite))
    }

    private _applyAccessState() {
        for (const name of ['miniGames', 'Puzzle', 'Survival'] as const) {
            const button = this._buttons.get(name)
            if (!button) continue

            const locked = this._isModeLocked(name)
            button.locked = locked
            button.color = locked ? new Color(128, 128, 128) : Color.WHITE
            button.onClickLocked = () => {
                this.onLockedModeClick?.(name)
            }
        }

        this._applyVisibilityState('zenGarden', this._accessState.zenGardenAvailable)
        this._applyVisibilityState('store', this._accessState.storeAvailable)
        this._applyVisibilityState('almanac', this._accessState.almanacAvailable)

        if (!this.animator) return

        const almanacVisible = this._accessState.almanacAvailable || this._accessState.storeAvailable
        if (almanacVisible) {
            this.animator.showTrack(SELECTOR_ALMANAC_KEY_SHADOW_TRACK)
            this.animator.setTrackImageOverride(
                SELECTOR_ALMANAC_KEY_SHADOW_TRACK,
                this._accessState.almanacAvailable && this._accessState.storeAvailable
                    ? null
                    : this._accessState.almanacAvailable
                        ? SELECTOR_ALMANAC_SHADOW_IMAGE
                        : SELECTOR_KEY_SHADOW_IMAGE,
            )
        } else {
            this.animator.hideTrack(SELECTOR_ALMANAC_KEY_SHADOW_TRACK)
            this.animator.setTrackImageOverride(SELECTOR_ALMANAC_KEY_SHADOW_TRACK, null)
        }
    }

    private _applyVisibilityState(name: 'zenGarden' | 'store' | 'almanac', visible: boolean) {
        const button = this._buttons.get(name)
        if (!button) return

        button.node.active = visible
        button.interactable = this._selectorButtonsReady && visible
    }

    private _isModeLocked(name: 'miniGames' | 'Puzzle' | 'Survival') {
        if (this._finishedAdventure > 0) return false
        if (name === 'miniGames') return this._accessState.minigamesLocked
        if (name === 'Puzzle') return this._accessState.puzzleLocked
        return this._accessState.survivalLocked
    }

    private _isButtonAvailable(name: string) {
        if (name === 'zenGarden') return this._accessState.zenGardenAvailable
        if (name === 'store') return this._accessState.storeAvailable
        if (name === 'almanac') return this._accessState.almanacAvailable
        return true
    }

    private _loadConfigs(...groups: ButtonConfig[][]) {
        const promises: Promise<any>[] = []
        for (const configs of groups) {
            for (const c of configs) {
                promises.push(SpriteLoader.load(c.normalImage))
                promises.push(SpriteLoader.load(c.pressedImage))
            }
        }
        return Promise.all(promises)
    }

    private _createButtonsFromConfigs(configs: ButtonConfig[], container: Node) {
        for (const c of configs) {
            const btn = this._createButton({
                name: c.name,
                container,
                normalSprite: SpriteLoader.get(c.normalImage),
                pressedSprite: SpriteLoader.get(c.pressedImage),
                x: 0,
                y: 0,
                width: c.width,
                height: c.height,
                polygon: c.polygon,
                pressOffset: c.pressOffset,
                offsetX: c.offsetX,
                offsetY: c.offsetY,
            })
            if (btn) {
                this._configureButtonSounds(c.name, btn)
                if (c.attached) {
                    btn.node.active = false
                    this._trackedButtons.push({
                        button: btn,
                        name: c.name,
                        trackName: c.attached.trackName,
                        offsetX: c.attached.offsetX,
                        offsetY: c.attached.offsetY,
                    })
                    if (c.attached.isReplaceTrack) {
                        this.animator.hideTrack(c.attached.trackName)
                    }
                }
            }
        }
    }

    private async _createButtons() {
        await this._loadConfigs(BUTTON_CONFIGS, WOODSIGN_BUTTON_CONFIGS, AUX_BUTTON_CONFIGS)

        this._createButtonsFromConfigs(BUTTON_CONFIGS, this._buttonContainer)
        this._createButtonsFromConfigs(AUX_BUTTON_CONFIGS, this._auxButtonContainer)
        this._createButtonsFromConfigs(WOODSIGN_BUTTON_CONFIGS, this._woodsignContainer)

        this.animator.hideTrack('SelectorScreen_StartAdventure_button')

        this._setButtonsInteractable(false)

        this._bindButtonClick('adventure', () => {
            this.startAdventure()
        })
        this._bindButtonClick('options', () => {
            this.onOptionsRequest?.()
        })
        this._bindButtonClick('help', () => {
            this.onHelpRequest?.()
        })
        this._bindButtonClick('quit', () => {
            this.onQuitRequest?.()
        })
        this._bindButtonClick('miniGames', () => {
            this.onChallengePageRequest?.(ChallengePage.MiniGames)
        })
        this._bindButtonClick('Puzzle', () => {
            this.onChallengePageRequest?.(ChallengePage.Puzzle)
        })
        this._bindButtonClick('Survival', () => {
            this.onChallengePageRequest?.(ChallengePage.Survival)
        })
        this._bindButtonClick('achievement', () => {
            this.onAchievementRequest?.()
        })
        this._bindButtonClick('zenGarden', () => {
            this.onZenGardenRequest?.()
        })
        this._bindButtonClick('store', () => {
            this.onStoreRequest?.()
        })
        this._bindButtonClick('almanac', () => {
            this.onAlmanacRequest?.()
        })

        this._applyAccessState()
    }

    private _bindButtonClick(name: string, onClick: () => void) {
        const button = this._buttons.get(name)
        if (!button) {
            console.warn(`[SelectorScreen] Button '${name}' was not created because its sprites are missing`)
            return
        }

        button.onClick = onClick
    }

    private _setButtonsInteractable(interactable: boolean) {
        this._selectorButtonsReady = interactable
        for (const [name, button] of this._buttons) {
            button.interactable = interactable && this._isButtonAvailable(name)
        }
        for (const button of this._flowerButtons) {
            button.interactable = interactable
        }
    }

    public setButtonsInteractable(interactable: boolean) {
        this._setButtonsInteractable(interactable)
    }

    private _configureButtonSounds(name: string, button: UIButton) {
        button.onHoverEnter = () => {
            if (button.locked) return
            void SoundLoader.play(SoundEffect.Bleep)
        }

        button.onPress = () => {
            const effect = MODE_BUTTON_NAMES.has(name) ? SoundEffect.GraveButton : SoundEffect.Tap
            void SoundLoader.play(effect)
        }
    }

    private _speedForReanimRate(node: AnimNode, animationName: string, rate: number): number {
        const fps = node.getAnimationFps(animationName)
        if (!fps || fps <= 0) return 1
        return rate / fps
    }

    private _timeForReanimFraction(node: AnimNode, animationName: string, fraction: number): number {
        const duration = node.getAnimationDuration(animationName)
        if (!duration || duration <= 1) return 0
        return Math.max(0, Math.min(1, fraction)) * (duration - 1)
    }

    private _createButton(options: {
        name: string
        container: Node
        normalSprite: SpriteFrame | null
        pressedSprite: SpriteFrame | null
        x: number
        y: number
        width?: number
        height?: number
        polygon?: Vec2[]
        pressOffset?: Vec3
        offsetX?: number
        offsetY?: number
    }): UIButton | null {
        const {
            name,
            container,
            normalSprite,
            pressedSprite,
            x,
            y,
            width,
            height,
            polygon,
            pressOffset,
            offsetX,
            offsetY,
        } = options
        if (!normalSprite) {
            console.warn(`[SelectorScreen] Missing normal sprite for button '${name}'`)
            return null
        }

        const node = createUINode(name, { layer: this.node.layer, anchorX: 0, anchorY: 1 })

        const hasOffset = (offsetX != null && offsetX !== 0) || (offsetY != null && offsetY !== 0)

        if (hasOffset) {
            createSpriteNode({
                name: 'sprite',
                spriteFrame: normalSprite,
                parent: node,
                layer: this.node.layer,
                x: offsetX ?? 0,
                y: -(offsetY ?? 0),
                anchorX: 0,
                anchorY: 1,
            })

            const uiTransform = node.getComponent(UITransform)!
            uiTransform.setAnchorPoint(0, 1)
            uiTransform.setContentSize(width ?? 0, height ?? 0)
        } else {
            createSpriteNode({
                name: 'sprite',
                spriteFrame: normalSprite,
                parent: node,
                layer: this.node.layer,
                x: 0,
                y: 0,
                anchorX: 0,
                anchorY: 1,
            })
            const uiTransform = node.getComponent(UITransform)!
            uiTransform.setAnchorPoint(0, 1)
            uiTransform.setContentSize(
                width ?? normalSprite.originalSize.width,
                height ?? normalSprite.originalSize.height,
            )
        }

        const button = node.addComponent(UIButton)
        button.refreshHoverOnEnable = false
        button.normalSprite = normalSprite
        button.pressedSprite = pressedSprite ?? normalSprite
        button.hoverSprite = pressedSprite ?? normalSprite
        if (pressOffset) button.pressOffset = pressOffset
        if (polygon) {
            button.polygon = polygon
        } else if (width != null && height != null) {
            button.polygon = [
                new Vec2(0, 0),
                new Vec2(width, 0),
                new Vec2(width, -height),
                new Vec2(0, -height),
            ]
        }

        node.setPosition(x, -y, 0)
        container.addChild(node)
        this._buttons.set(name, button)
        return button
    }

    private _circlePolygon(radius: number, segments = 12): Vec2[] {
        const pts: Vec2[] = []
        for (let i = 0; i < segments; i++) {
            const a = (Math.PI * 2 * i) / segments
            pts.push(new Vec2(Math.cos(a) * radius, Math.sin(a) * radius))
        }
        return pts
    }

    private _createFlowerButtons() {
        for (let i = 0; i < FLOWER_CENTERS.length; i++) {
            const fc = FLOWER_CENTERS[i]
            const node = new Node(`flower_${i}`)
            node.layer = this.node.layer

            const uiTransform = node.addComponent(UITransform)
            uiTransform.setContentSize(fc.radius * 2, fc.radius * 2)
            uiTransform.setAnchorPoint(0.5, 0.5)

            const button = node.addComponent(UIButton)
            button.refreshHoverOnEnable = false
            button.polygon = this._circlePolygon(fc.radius)
            button.changeCursor = false
            button.interactable = this._selectorButtonsReady
            this._flowerButtons.push(button)

            const idx = i
            button.onClick = () => {
                const flowerNode = this.flowerNodes[idx]
                if (flowerNode.speed > 0) return

                void SoundLoader.playFoley(SoundEffect.LimbsPop, LIMBS_POP_PITCH_RANGE)
                flowerNode.speed = this._speedForReanimRate(
                    flowerNode,
                    `anim_flower${idx + 1}`,
                    SELECTOR_FLOWER_RATE,
                )
            }

            node.setPosition(fc.x, -fc.y, 0)
            this._buttonContainer.addChild(node)

            this.flowerNodes[i].play({
                name: `anim_flower${i + 1}`,
                speed: 0.0,
                keepLastFrame: true,
            })
        }
    }

    private _trackButton(button: UIButton, trackName: string, offsetX: number, offsetY: number) {
        const frame = this.animator.getTrackFrame(trackName)
        if (frame) {
            if (!button.node.active) button.node.active = true
            button.updateOriginPos(new Vec3(frame.x + offsetX, -(frame.y + offsetY), 0))
        }
    }

    protected lateUpdate(dt: number) {
        const scaledDt = scaleGameDeltaTime(dt)
        this._updateStartAdventureTransition(scaledDt)
        this._updateCloudLoops(scaledDt)
        this._updateGrassLoop(scaledDt)
        if (!this.node.isValid) return

        const adventureButton = this._buttons.get('adventure')
        for (const tb of this._trackedButtons) {
            if (!this._isButtonAvailable(tb.name)) {
                tb.button.node.active = false
                continue
            }
            const trackName = tb.button === adventureButton ? this._getAdventureButtonTrackName() : tb.trackName
            this._trackButton(tb.button, trackName, tb.offsetX, tb.offsetY)
        }
        this._updateLevelNumberPosition()
        this._syncLevelNumberColor()
    }

    startAdventure() {
        if (this._startAdventureActive) return

        void SoundLoader.playSfx(SoundEffect.LoseMusic)
        this.onStartAdventureTransition?.()
        this.playZombieHand()
        this._setButtonsInteractable(false)
        this._startAdventureActive = true
        this._startAdventureElapsed = 0
        this._startAdventureFlashCounter = 0
        this._startAdventureFlashElapsed = 0
        this._startAdventureLaughPlayed = false
    }

    private _updateStartAdventureTransition(dt: number) {
        if (!this._startAdventureActive) return

        this._startAdventureElapsed += dt
        this._startAdventureFlashElapsed += dt
        while (this._startAdventureFlashElapsed >= START_ADVENTURE_FLASH_SECONDS) {
            this._startAdventureFlashElapsed -= START_ADVENTURE_FLASH_SECONDS
            this._startAdventureFlashCounter++
            const button = this._buttons.get('adventure')
            if (button) {
                button.color = this._startAdventureFlashCounter % 2 === 0
                    ? new Color(80, 80, 80)
                    : new Color(255, 255, 255)
            }
        }

        if (!this._startAdventureLaughPlayed && this._startAdventureElapsed >= START_ADVENTURE_LAUGH_SECONDS) {
            this._startAdventureLaughPlayed = true
            void SoundLoader.play(SoundEffect.EvilLaugh)
        }

        if (this._startAdventureElapsed < START_ADVENTURE_COMPLETE_SECONDS) return

        this._startAdventureActive = false
        this.onAdventureRequest?.()
    }

    playCloudsLoop() {
        const cloudNames = ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']
        this._cloudLoopStates = []
        for (let i = 0; i < this.cloudNodes.length; i++) {
            const cloudNode = this.cloudNodes[i]
            const name = cloudNames[i]
            const animationName = `anim_${name}`
            const state = { node: cloudNode, animationName, delayRemaining: 0 }
            this._cloudLoopStates.push(state)
            const initialCounter = randomRangeInt(
                SELECTOR_CLOUD_INITIAL_MIN_TICKS,
                SELECTOR_CLOUD_INITIAL_MAX_TICKS,
            )
            if (initialCounter <= 0) {
                this._playCloudLoop(
                    state,
                    this._timeForReanimFraction(
                        cloudNode,
                        animationName,
                        -initialCounter / -SELECTOR_CLOUD_INITIAL_MIN_TICKS,
                    ),
                )
            } else {
                cloudNode.play({
                    name: animationName,
                    speed: 0,
                    keepLastFrame: true,
                })
                state.delayRemaining = initialCounter * SELECTOR_TICK_SECONDS
            }
        }
    }

    private _updateCloudLoops(dt: number) {
        for (const state of this._cloudLoopStates) {
            if (state.delayRemaining <= 0) continue

            state.delayRemaining -= dt
            if (state.delayRemaining <= 0) {
                state.delayRemaining = 0
                this._playCloudLoop(state)
            }
        }
    }

    private _playCloudLoop(state: CloudLoopState, time = 0) {
        state.node.play({
            name: state.animationName,
            speed: this._speedForReanimRate(state.node, state.animationName, SELECTOR_CLOUD_RATE),
            time,
            keepLastFrame: true,
            onFinish: () => {
                state.delayRemaining = randomRange(20, 40)
            },
        })
    }

    playGrassLoop() {
        this.grassNode.play({
            name: 'anim_grass',
            speed: this._speedForReanimRate(
                this.grassNode,
                'anim_grass',
                SELECTOR_GRASS_INITIAL_RATE,
            ),
            loop: true,
        })
        this._grassLoopActive = true
        this._grassLoopElapsed = 0
        this._grassLoopInterval = randomRange(2, 4)
    }

    private _updateGrassLoop(dt: number) {
        if (!this._grassLoopActive || this._grassLoopInterval <= 0) return

        this._grassLoopElapsed += dt
        while (this._grassLoopElapsed >= this._grassLoopInterval) {
            this._grassLoopElapsed -= this._grassLoopInterval
            this.grassNode.play({
                name: 'anim_grass',
                speed: this._speedForReanimRate(
                    this.grassNode,
                    'anim_grass',
                    randomRange(3, 12),
                ),
                blendTime: 0.2,
                loop: true,
            })
        }
    }

    playOpenAnimation() {
        this.openNode.play({
            name: 'anim_open',
            keepLastFrame: true,
            speed: this._speedForReanimRate(this.openNode, 'anim_open', SELECTOR_OPEN_RATE),
            onStart: () => {
                this.playCloudsLoop()
            },
            onFinish: () => {
                this._setButtonsInteractable(true)
                this.signNode.play({
                    name: 'anim_sign',
                    speed: this._speedForReanimRate(this.signNode, 'anim_sign', SELECTOR_SIGN_RATE),
                    keepLastFrame: true,
                    onFinish: () => {
                        this._createFlowerButtons()
                    },
                })
                this.playGrassLoop()
            },
        })
    }

    playZombieHand() {
        void SoundLoader.playFoley(SoundEffect.DirtRise)
        this.zombieHandNode.play({
            name: 'default',
            keepLastFrame: true,
            speed: 1,
        })
        this.zombieHandRockNode.play({
            name: 'default',
            keepLastFrame: true,
            speed: 1,
        })
    }

    onShowMessageBoxClicked() {
        this.onMessageBoxRequest?.()
    }

    protected async onReady() {
        await this.init()
        void SoundLoader.play(SoundEffect.RollIn)
        this.playOpenAnimation()
    }
}
