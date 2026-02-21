import {
    _decorator,
    randomRangeInt,
    randomRange,
    Node,
    Sprite,
    JsonAsset,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    EventTouch,
    Color,
} from 'cc'
import { AnimationComponent } from '@/components/AnimationComponent'
import { AnimNode } from '@/core/Animator/AnimNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { UIButton } from '@/ui/Button'
import { Animator } from '@/core/Animator'
import { ButtonConfig } from './SelectorScreen.d'
import {
    BUTTON_CONFIGS,
    WOODSIGN_BUTTON_CONFIGS,
    AUX_BUTTON_CONFIGS,
    FLOWER_CENTERS,
} from './SelectorScreenConfig'

const { ccclass, property } = _decorator

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

    private _buttonContainer: Node = null!
    private _woodsignContainer: Node = null!
    private _auxButtonContainer: Node = null!
    private _buttons: Map<string, UIButton> = new Map()
    private _trackedButtons: {
        button: UIButton
        trackName: string
        offsetX: number
        offsetY: number
    }[] = []

    init() {
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
        this._createButtons()
        this._initZombieHandAnim()
    }

    private _initZombieHandAnim() {
        const zombieHandNode = new Node('ZombieHand')
        zombieHandNode.layer = this.node.layer
        zombieHandNode.addComponent(UITransform)

        const animatorNode = new Node('Animator')
        animatorNode.layer = this.node.layer
        animatorNode.setPosition(-70, -10, 0)
        zombieHandNode.addChild(animatorNode)

        const animator = animatorNode.addComponent(Animator)
        animator.parseJson(this.zombieArmAnimation.json)

        this.zombieHandNode = animator.addAnimNode('default')

        this.animator.insertExternalNode('__zombie_hand__', zombieHandNode, 34)
    }

    private _initButtonContainer() {
        const container = new Node('Buttons')
        container.layer = this.node.layer
        this.animator.insertExternalNode('__buttons__', container, 34)
        this._buttonContainer = container

        const wsContainer = new Node('WoodsignButtons')
        wsContainer.layer = this.node.layer
        this.animator.insertExternalNode('__woodsigns__', wsContainer, 46)
        this._woodsignContainer = wsContainer

        const auxContainer = new Node('AuxButtons')
        auxContainer.layer = this.node.layer
        this.animator.insertExternalNode('__aux_buttons__', auxContainer, 34)
        this._auxButtonContainer = auxContainer
    }

    private _loadConfigs(...groups: ButtonConfig[][]) {
        const promises: Promise<any>[] = []
        for (const configs of groups) {
            for (const c of configs) {
                promises.push(SpriteLoader.load(c.normalImage, c.spriteDir))
                promises.push(SpriteLoader.load(c.pressedImage, c.spriteDir))
            }
        }
        return Promise.all(promises)
    }

    private _createButtonsFromConfigs(configs: ButtonConfig[], container: Node) {
        // for (const c of configs) {
        //     if (c.trackName) this.animator.hideTrack(c.trackName)
        // }
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

        this._buttons.get('adventure')!.onClick = () => {
            this.startAdventure()
        }

        // const lockedColor = new Color(128, 128, 128)
        const lockedNames = ['miniGames', 'puzzles', 'survival']
        for (const name of lockedNames) {
            const btn = this._buttons.get(name)!
            // btn.color = lockedColor
            btn.locked = true
            btn.onClickLocked = () => {
                console.log(`[SelectorScreen] Locked button clicked: ${name}`)
            }
        }
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

        const node = new Node(name)
        node.layer = this.node.layer

        const hasOffset = (offsetX != null && offsetX !== 0) || (offsetY != null && offsetY !== 0)

        if (hasOffset) {
            const spriteNode = new Node('sprite')
            spriteNode.layer = this.node.layer
            const sprite = spriteNode.addComponent(Sprite)
            sprite.trim = false
            sprite.sizeMode = Sprite.SizeMode.RAW
            sprite.spriteFrame = normalSprite
            spriteNode.getComponent(UITransform)!.setAnchorPoint(0, 1)
            spriteNode.setPosition(offsetX ?? 0, -(offsetY ?? 0), 0)
            node.addChild(spriteNode)

            const uiTransform = node.addComponent(UITransform)
            uiTransform.setAnchorPoint(0, 1)
            uiTransform.setContentSize(width ?? 0, height ?? 0)
        } else {
            const sprite = node.addComponent(Sprite)
            sprite.trim = false
            sprite.spriteFrame = normalSprite
            sprite.sizeMode = Sprite.SizeMode.RAW
            node.getComponent(UITransform)!.setAnchorPoint(0, 1)
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

            const idx = i
            button.onClick = (event: EventTouch) => {
                const flowerNode = this.flowerNodes[idx]
                flowerNode.speed = 1.0
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
        this.playZombieHand()
        for (const btn of this._buttons.values()) {
            btn.interactable = false
        }
        let counter = 0
        const flashCallback = () => {
            counter++
            this._buttons.get('adventure')!.color =
                counter % 2 === 0 ? new Color(80, 80, 80) : new Color(255, 255, 255)
        }
        this.schedule(flashCallback, 0.1)
        this.scheduleOnce(() => {
            this.unschedule(flashCallback)
            console.log('[SelectorScreen] Enabling adventure button')
        }, 4.5)
    }

    playCloudsLoop() {
        const cloudNames = ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']
        for (let i = 0; i < this.cloudNodes.length; i++) {
            const cloudNode = this.cloudNodes[i]
            const name = cloudNames[i]
            const playCloud = (time = 0) => {
                cloudNode.play({
                    name: `anim_${name}`,
                    speed: 0.25 / 12,
                    time,
                    onFinish: () => {
                        const delay = randomRange(20, 40)
                        this.scheduleOnce(() => playCloud(), delay)
                    },
                })
            }
            playCloud(randomRangeInt(0, 60))
        }
    }

    playGrassLoop() {
        this.grassNode.play({
            name: 'anim_grass',
            speed: 0.5,
            loop: true,
        })
        this.schedule(
            () => {
                this.grassNode.play({
                    name: 'anim_grass',
                    speed: randomRange(0.25, 1),
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
            speed: 1,
            onStart: () => {
                this.playCloudsLoop()
            },
            onFinish: () => {
                this.signNode.play({
                    name: 'anim_sign',
                    speed: 1,
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
        this.zombieHandNode.play({
            name: 'default',
            keepLastFrame: true,
            speed: 1,
        })
    }

    async start() {
        this.init()
        await this.delay(1)
        this.playOpenAnimation()
    }
}
