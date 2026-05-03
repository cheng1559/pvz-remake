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
    EventTouch,
    Color,
    Mask,
} from 'cc'
import { AnimationComponent } from '@/components/AnimationComponent'
import { AnimNode } from '@/core/Animator/AnimNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { ChallengePage } from '@/ui/ChallengeScreen'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { Animator } from '@/core/Animator'
import { ButtonConfig } from './SelectorScreen.d'
import {
    BUTTON_CONFIGS,
    WOODSIGN_BUTTON_CONFIGS,
    AUX_BUTTON_CONFIGS,
    FLOWER_CENTERS,
} from './SelectorScreenConfig'

const { ccclass, property } = _decorator

const MODE_BUTTON_NAMES = new Set(['adventure', 'miniGames', 'Puzzle', 'Survival'])
const LOCKED_MODE_NAMES = new Set<string>()
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
    private _selectorButtonsReady = false
    private _trackedButtons: {
        button: UIButton
        trackName: string
        offsetX: number
        offsetY: number
    }[] = []

    public onLockedModeClick: ((name: string) => void) | null = null
    public onMessageBoxRequest: (() => void) | null = null
    public onOptionsRequest: (() => void) | null = null
    public onChallengePageRequest: ((page: ChallengePage) => void) | null = null

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
        await this._createButtons()
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
        mask.type = Mask.Type.RECT

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

        this._buttons.get('adventure')!.onClick = () => {
            this.startAdventure()
        }
        this._buttons.get('options')!.onClick = () => {
            this.onOptionsRequest?.()
        }
        this._buttons.get('miniGames')!.onClick = () => {
            this.onChallengePageRequest?.(ChallengePage.MiniGames)
        }
        this._buttons.get('Puzzle')!.onClick = () => {
            this.onChallengePageRequest?.(ChallengePage.Puzzle)
        }
        this._buttons.get('Survival')!.onClick = () => {
            this.onChallengePageRequest?.(ChallengePage.Survival)
        }

        for (const name of LOCKED_MODE_NAMES) {
            const btn = this._buttons.get(name)!
            btn.locked = true
            btn.onClickLocked = () => {
                this.onLockedModeClick?.(name)
            }
        }
    }

    private _setButtonsInteractable(interactable: boolean) {
        this._selectorButtonsReady = interactable
        for (const button of this._buttons.values()) {
            button.interactable = interactable
        }
    }

    private _configureButtonSounds(name: string, button: UIButton) {
        button.onHoverEnter = () => {
            if (LOCKED_MODE_NAMES.has(name) && button.locked) return
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
        if (!normalSprite) return null

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
            button.polygon = this._circlePolygon(fc.radius)
            button.changeCursor = false
            button.interactable = this._selectorButtonsReady

            const idx = i
            button.onClick = (event: EventTouch) => {
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
        for (const tb of this._trackedButtons) {
            this._trackButton(tb.button, tb.trackName, tb.offsetX, tb.offsetY)
        }
    }

    startAdventure() {
        void SoundLoader.play(SoundEffect.LoseMusic)
        this.playZombieHand()
        this._setButtonsInteractable(false)
        let counter = 0
        const flashCallback = () => {
            counter++
            this._buttons.get('adventure')!.color =
                counter % 2 === 0 ? new Color(80, 80, 80) : new Color(255, 255, 255)
        }
        this.schedule(flashCallback, 0.1)
        this.scheduleOnce(() => {
            void SoundLoader.play(SoundEffect.EvilLaugh)
        }, 1.25)
        this.scheduleOnce(() => {
            this.unschedule(flashCallback)
        }, 4.5)
    }

    playCloudsLoop() {
        const cloudNames = ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']
        for (let i = 0; i < this.cloudNodes.length; i++) {
            const cloudNode = this.cloudNodes[i]
            const name = cloudNames[i]
            const animationName = `anim_${name}`
            const playCloud = (time = 0) => {
                cloudNode.play({
                    name: animationName,
                    speed: this._speedForReanimRate(cloudNode, animationName, SELECTOR_CLOUD_RATE),
                    time,
                    keepLastFrame: true,
                    onFinish: () => {
                        const delay = randomRange(20, 40)
                        this.scheduleOnce(() => playCloud(), delay)
                    },
                })
            }
            const initialCounter = randomRangeInt(
                SELECTOR_CLOUD_INITIAL_MIN_TICKS,
                SELECTOR_CLOUD_INITIAL_MAX_TICKS,
            )
            if (initialCounter < 0) {
                playCloud(
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
                this.scheduleOnce(() => playCloud(), initialCounter * SELECTOR_TICK_SECONDS)
            }
        }
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
        this.schedule(
            () => {
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
            },
            randomRange(2, 4),
        )
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
        void SoundLoader.play(SoundEffect.DirtRise)
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
