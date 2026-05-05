import {
    _decorator,
    Color,
    Component,
    EventMouse,
    EventTouch,
    JsonAsset,
    Label,
    Mask,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
} from 'cc'
import { Animator } from '@/core/Animator'
import { AnimNode } from '@/core/Animator/AnimNode'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import {
    MessageBoxAssets,
    type MessageBoxButtonFonts,
    type MessageBoxButtonSprites,
} from '@/ui/MessageBox/MessageBoxAssets'
import { SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createStoneButton } from '@/ui/StoneButton'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'
import { GAME_TICK_SECONDS, SEED_DEFINITIONS } from './GameDefinitions'
import { GameSession } from './GameSession'
import type {
    GameEntity,
    GameEvent,
    PlantEntity,
    SeedPacketState,
    SeedType,
} from './GameTypes'

const { ccclass } = _decorator

const BOARD_OFFSET = 220
const BOARD_RIGHT_X = -380
const MENU_BUTTON_WIDTH = 117
const MENU_BUTTON_HEIGHT = 46
const INTRO_PAN_RIGHT_START = 150
const INTRO_PAN_RIGHT_END = 350
const INTRO_PAN_LEFT_START = 450
const INTRO_PAN_LEFT_END = 600
const INTRO_ROLL_SOD_START = 600
const INTRO_ROLL_SOD_END = 800
const INTRO_END = 820
const SOD_ROW_X = 239 - BOARD_OFFSET
const SOD_ROW_Y = 265
const GAME_TEXTURES = [
    'background1',
    'background1unsodded',
    'seedbank',
    'seeds',
    'packet_plants',
    'packet_plants_cached',
    'seedpacket_larger',
    'peashooter_head',
    'plantshadow',
    'sod1row',
]

interface PlantView {
    node: Node
    body: AnimNode | null
    head: AnimNode | null
    face: AnimNode | null
}

@ccclass('AdventureGameScreen')
export class AdventureGameScreen extends Component {
    public onBackToMenu: (() => void) | null = null
    public onMenuRequest: (() => void) | null = null

    private _session = new GameSession()
    private _boardRoot: Node = null!
    private _boardContent: Node = null!
    private _entityLayer: Node = null!
    private _uiLayer: Node = null!
    private _seedBankNode: Node | null = null
    private _menuButtonNode: Node | null = null
    private _unsoddedNode: Node | null = null
    private _soddedNode: Node | null = null
    private _sodClipNode: Node | null = null
    private _sodRollNode: Node | null = null
    private _seedBankHeight = 87
    private _cursorPreview: Node | null = null
    private _sunLabel: FontRenderer = null!
    private _adviceLabel: Label = null!
    private _resultLabel: Label = null!
    private _entityNodes: Map<number, Node> = new Map()
    private _plantViews: Map<number, PlantView> = new Map()
    private _mousePixel = { x: -1, y: -1 }
    private _peashooterAnimation: JsonAsset | null = null
    private _sodRollAnimation: JsonAsset | null = null
    private _sodRollAnimNode: AnimNode | null = null
    private _sunFont: BitmapFontAssets | null = null
    private _packetCostFont: BitmapFontAssets | null = null
    private _buttonSprites: MessageBoxButtonSprites | null = null
    private _buttonFonts: MessageBoxButtonFonts | null = null
    private _introTime = 0
    private _gameAccumulator = 0
    private _gameStarted = false
    private _bootstrapped = false

    onLoad() {
        setUISize(this.node, 800, 600)
        this._boardRoot = createUINode('BoardRoot', {
            parent: this.node,
            width: 800,
            height: 600,
            anchorX: 0,
            anchorY: 1,
            x: -400,
            y: 300,
        })
        this._boardRoot.addComponent(Mask).type = Mask.Type.RECT
        this._boardContent = createUINode('BoardContent', {
            parent: this._boardRoot,
            anchorX: 0,
            anchorY: 1,
            width: 1400,
            height: 600,
            x: BOARD_OFFSET,
            y: 0,
        })
        this._entityLayer = createUINode('Entities', { parent: this._boardContent, anchorX: 0, anchorY: 1 })
        this._uiLayer = createUINode('HUD', { parent: this._boardRoot, anchorX: 0, anchorY: 1 })

        void this._bootstrap()
    }

    onDestroy() {
        this.unscheduleAllCallbacks()
    }

    private async _bootstrap() {
        const results = await Promise.all([
            ...GAME_TEXTURES.map((name) => SpriteLoader.load(name)),
            StartupResourceLoader.loadJson('animations/peashootersingle'),
            StartupResourceLoader.loadJson('animations/sodroll'),
            FontLoader.load('continuumbold14'),
            FontLoader.load('pico129'),
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
        ])
        this._peashooterAnimation = results[GAME_TEXTURES.length] as JsonAsset | null
        this._sodRollAnimation = results[GAME_TEXTURES.length + 1] as JsonAsset | null
        this._sunFont = results[GAME_TEXTURES.length + 2] as BitmapFontAssets | null
        this._packetCostFont = results[GAME_TEXTURES.length + 3] as BitmapFontAssets | null
        this._buttonSprites = results[GAME_TEXTURES.length + 4] as MessageBoxButtonSprites | null
        this._buttonFonts = results[GAME_TEXTURES.length + 5] as MessageBoxButtonFonts | null

        await this._drawStaticBoard()
        this._drawHud()
        this._wireInput()
        this._bootstrapped = true
        this._renderFrame()
    }

    update(dt: number) {
        if (!this._bootstrapped) return

        if (this._gameStarted) {
            this._gameAccumulator += dt
            while (this._gameAccumulator >= GAME_TICK_SECONDS) {
                this._session.update()
                this._gameAccumulator -= GAME_TICK_SECONDS
            }
        } else {
            this._updateIntro(dt)
        }
        this._renderFrame()
    }

    private async _drawStaticBoard() {
        const unsodded = SpriteLoader.get('background1unsodded')
        if (unsodded) {
            this._unsoddedNode = createSpriteNode({
                name: 'BackgroundUnsodded',
                spriteFrame: unsodded,
                parent: this._boardContent,
                x: -BOARD_OFFSET,
                y: 0,
            })
        }

        const background = SpriteLoader.get('background1')
        if (background) {
            this._soddedNode = createSpriteNode({
                name: 'Background',
                spriteFrame: background,
                parent: this._boardContent,
                x: -BOARD_OFFSET,
                y: 0,
            })
            this._soddedNode.active = false
        }

        const sod = SpriteLoader.get('sod1row')
        if (sod) {
            this._sodClipNode = createUINode('SodClip', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: 0,
                height: sod.originalSize.height,
                x: SOD_ROW_X,
                y: -SOD_ROW_Y,
            })
            this._sodClipNode.addComponent(Mask).type = Mask.Type.RECT
            createSpriteNode({
                name: 'SodRow',
                spriteFrame: sod,
                parent: this._sodClipNode,
                x: 0,
                y: 0,
            })
        }

        if (this._sodRollAnimation?.json) {
            this._sodRollNode = createUINode('SodRoll', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: 800,
                height: 600,
                x: 0,
                y: 0,
            })
            this._sodRollNode.active = false
            const animator = this._sodRollNode.addComponent(Animator)
            await animator.parseJson(this._sodRollAnimation.json as Record<string, any>)
            this._sodRollAnimNode = animator.addAnimNode('default')
        }

        this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
    }

    private _drawHud() {
        const bank = SpriteLoader.get('seedbank')
        if (bank) {
            this._seedBankHeight = bank.originalSize.height
            this._seedBankNode = createSpriteNode({
                name: 'SeedBank',
                spriteFrame: bank,
                parent: this._uiLayer,
                x: 0,
                y: -bank.originalSize.height,
            })
            this._seedBankNode.active = false
        }

        this._sunLabel = this._createBitmapText({
            name: 'SunAmount',
            text: '0',
            baselineX: 29,
            baselineY: 78,
            font: this._sunFont,
            color: Color.BLACK,
            parent: this._seedBankNode ?? this._uiLayer,
            align: 'center',
        })
        this._adviceLabel = this._createLabel('Advice', 400, -565, '', 20, new Color(255, 245, 180))
        this._resultLabel = this._createLabel('Result', 400, -285, '', 42, new Color(255, 240, 120))
        this._drawSeedPackets()
        this._createMenuButton()
        this._setSeedBankContentsVisible(false)
    }

    private _createMenuButton() {
        if (!this._buttonSprites || !this._buttonFonts) return

        this._menuButtonNode = createStoneButton({
            name: 'MenuButton',
            parent: this._uiLayer,
            layer: this.node.layer,
            label: 'Menu',
            x: 681,
            y: 10,
            width: MENU_BUTTON_WIDTH,
            height: MENU_BUTTON_HEIGHT,
            sprites: this._buttonSprites,
            fonts: {
                normal: this._buttonFonts.normal,
                highlight: this._buttonFonts.highlight,
            },
            onClick: () => {
                void SoundLoader.play(SoundEffect.Pause)
                this.onMenuRequest?.()
            },
        })
        this._menuButtonNode.active = false
    }

    private _drawSeedPackets() {
        const parent = this._seedBankNode ?? this._uiLayer
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const x = 75 + i * 52
            const y = -8
            SeedPacketRenderer.drawSeedPacket({
                name: `SeedPacket_${packet.seedType}`,
                x,
                y,
                parent,
                layer: this.node.layer,
                seedType: packet.seedType,
                cost: SEED_DEFINITIONS[packet.seedType].cost,
                seeds: SpriteLoader.get('seeds') ?? null,
                packetPlants: SpriteLoader.get('packet_plants') ?? null,
                cachedPacketPlants: SpriteLoader.get('packet_plants_cached') ?? null,
                costFont: this._packetCostFont,
            })
        }
    }

    private _wireInput() {
        this.node.on(Node.EventType.MOUSE_MOVE, (event: EventMouse) => {
            this._mousePixel = this._eventToBoardPixel(event)
            this._updateCursorPreview()
        })
        this.node.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            this._handlePointerDown(this._eventToBoardPixel(event))
        })
        this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            this._mousePixel = this._eventToBoardPixel(event)
            this._updateCursorPreview()
        })
        this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._handlePointerDown(pixel)
        })
    }

    private _handlePointerDown(pixel: { x: number, y: number }) {
        if (!this._gameStarted) return

        const seedType = this._hitSeedPacket(pixel)
        if (seedType) {
            this._session.dispatch({ type: 'selectSeed', seedType })
            this._renderFrame()
            return
        }

        this._session.dispatch({ type: 'placePlant', x: pixel.x, y: pixel.y })
        this._renderFrame()
    }

    private _renderFrame() {
        if (this._gameStarted) {
            this._handleEvents(this._session.drainEvents())
        }
        this._sunLabel.string = `${this._session.sun}`
        this._resultLabel.string =
            this._session.result === 'won' ? 'Level Complete!' :
                this._session.result === 'lost' ? 'Game Over' : ''

        for (const entity of this._session.allEntities()) {
            this._syncEntity(entity)
        }
        this._syncSeedPacketState()
        this._updateCursorPreview()
    }

    private _updateIntro(dt: number) {
        const previousIntroTime = this._introTime
        this._introTime += dt * 100
        this._boardContent.setPosition(this._introBoardX(), 0, 0)
        if (previousIntroTime < INTRO_ROLL_SOD_START && this._introTime >= INTRO_ROLL_SOD_START) {
            this._startSodRoll()
        }
        this._updateIntroSod()

        if (this._introTime < INTRO_END) return

        this._gameStarted = true
        this._boardContent.setPosition(0, 0, 0)
        if (this._soddedNode) this._soddedNode.active = false
        if (this._unsoddedNode) this._unsoddedNode.active = true
        if (this._sodClipNode) this._sodClipNode.active = true
        if (this._sodRollNode) this._sodRollNode.active = false
        if (this._seedBankNode) {
            this._seedBankNode.active = true
            this._seedBankNode.setPosition(10, 0, 10)
        }
        if (this._menuButtonNode) this._menuButtonNode.active = true
        this._setSeedBankContentsVisible(true)
    }

    private _introBoardX() {
        if (this._introTime <= INTRO_PAN_RIGHT_START) return BOARD_OFFSET
        if (this._introTime <= INTRO_PAN_RIGHT_END) {
            return this._easeInOut(
                INTRO_PAN_RIGHT_START,
                INTRO_PAN_RIGHT_END,
                this._introTime,
                BOARD_OFFSET,
                BOARD_RIGHT_X,
            )
        }
        if (this._introTime <= INTRO_PAN_LEFT_START) return BOARD_RIGHT_X
        if (this._introTime <= INTRO_PAN_LEFT_END) {
            return this._easeInOut(
                INTRO_PAN_LEFT_START,
                INTRO_PAN_LEFT_END,
                this._introTime,
                BOARD_RIGHT_X,
                0,
            )
        }
        return 0
    }

    private _startSodRoll() {
        if (!this._sodRollNode || !this._sodRollAnimNode) return

        this._sodRollNode.active = true
        this._sodRollAnimNode.play({
            name: 'default',
            loop: false,
            speed: 0,
            keepLastFrame: true,
        })
        void SoundLoader.play(SoundEffect.DiggerZombie)
    }

    private _updateIntroSod() {
        if (!this._sodClipNode) return

        const transform = this._sodClipNode.getComponent(UITransform)
        const height = transform?.height ?? 127
        if (this._introTime < INTRO_ROLL_SOD_START) {
            setUISize(this._sodClipNode, 0, height, 0, 1)
            if (this._sodRollNode) this._sodRollNode.active = false
            return
        }

        const sodWidth = SpriteLoader.get('sod1row')?.originalSize.width ?? 771
        const progress = this._linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime, 0, 1)
        const width = sodWidth * progress
        setUISize(this._sodClipNode, width, height, 0, 1)
        this._syncSodRollAnimation(progress)
        if (this._sodRollNode) this._sodRollNode.active = this._introTime <= INTRO_ROLL_SOD_END
    }

    private _syncSodRollAnimation(progress: number) {
        if (!this._sodRollAnimNode) return

        const duration = this._sodRollAnimNode.getAnimationDuration('default')
        if (!duration) return

        this._sodRollAnimNode.time = Math.max(0, duration - 1) * progress
    }

    private _handleEvents(events: GameEvent[]) {
        for (const event of events) {
            switch (event.type) {
                case 'entityRemoved':
                    this._removeEntityNode(event.entityId)
                    break
                case 'animationRequested':
                    this._playPlantAnimation(event.entityId, event.animation)
                    break
                case 'soundRequested':
                    void SoundLoader.play(event.sound)
                    break
                case 'advice':
                    this._adviceLabel.string = event.message
                    break
            }
        }
    }

    private _syncEntity(entity: GameEntity) {
        let node = this._entityNodes.get(entity.id)
        if (!node) {
            node = this._createEntityNode(entity)
            this._entityNodes.set(entity.id, node)
        }
        node.setPosition(entity.x, -entity.y, this._entityZ(entity))
    }

    private _createEntityNode(entity: GameEntity) {
        switch (entity.kind) {
            case 'plant':
                return this._createPlantNode(entity)
        }
    }

    private _createPlantNode(plant: PlantEntity) {
        const node = createUINode(`Plant_${plant.id}`, { parent: this._entityLayer, anchorX: 0, anchorY: 1, width: 100, height: 100 })
        const shadow = SpriteLoader.get('plantshadow')
        if (shadow) {
            createSpriteNode({ spriteFrame: shadow, parent: node, x: -10, y: -18 })
        }

        const view: PlantView = { node, body: null, head: null, face: null }
        if (this._peashooterAnimation?.json) {
            const animatorNode = new Node('Animator')
            animatorNode.layer = node.layer
            animatorNode.setPosition(0, 0, 0)
            node.addChild(animatorNode)
            const animator = animatorNode.addComponent(Animator)
            void animator.parseJson(this._peashooterAnimation.json as Record<string, any>).then(() => {
                view.body = animator.addAnimNode('body')
                view.head = animator.addAnimNode('head')
                view.face = animator.addAnimNode('face')
                if (view.body && view.head) {
                    view.head.attach({ node: view.body, slot: 'anim_stem' })
                }
                if (view.head && view.face) {
                    view.face.attach({ node: view.head, slot: 'anim_face' })
                }
                view.body?.play({ name: 'anim_idle', speed: 1.5, loop: true })
                view.head?.play({ name: 'anim_head_idle', speed: 1.25, loop: true })
            })
        }
        this._plantViews.set(plant.id, view)
        return node
    }

    private _playPlantAnimation(entityId: number, animation: string) {
        if (animation !== 'shoot') return
        const view = this._plantViews.get(entityId)
        view?.head?.play({
            name: 'anim_shooting',
            speed: 3.75,
            blendTime: 0.1,
            keepLastFrame: true,
            onFinish: () => {
                view.head?.play({ name: 'anim_head_idle', speed: 1.25, loop: true, blendTime: 0.1 })
            },
        })
    }

    private _syncSeedPacketState() {
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const node = (this._seedBankNode ?? this._uiLayer).getChildByName(`SeedPacket_${packet.seedType}`)
            if (!node) continue
            node.setPosition(75 + i * 52, packet.selected ? -2 : -8, 10)
            this._applyPacketColor(node, packet)
        }
    }

    private _applyPacketColor(node: Node, packet: SeedPacketState) {
        const affordable = this._session.sun >= SEED_DEFINITIONS[packet.seedType].cost
        const ready = packet.cooldownRemaining <= 0
        const color = ready && affordable ? Color.WHITE : new Color(70, 70, 70)
        this._applySpriteColorRecursive(node, color)
    }

    private _applySpriteColorRecursive(node: Node, color: Color) {
        if (node.getComponent(FontRenderer)) return

        const sprite = node.getComponent(Sprite)
        if (sprite) sprite.color = color
        for (const child of node.children) {
            this._applySpriteColorRecursive(child, color)
        }
    }

    private _updateCursorPreview() {
        if (!this._gameStarted) return

        if (!this._session.selectedSeed) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            this._cursorPreview = null
            return
        }

        if (!this._cursorPreview?.isValid) {
            this._cursorPreview = createUINode('CursorPreview', {
                parent: this._uiLayer,
                anchorX: 0.5,
                anchorY: 0.5,
                width: 80,
                height: 80,
            })
            const spriteFrame = SpriteLoader.get(SEED_DEFINITIONS[this._session.selectedSeed].cursorSprite)
            if (spriteFrame) {
                const spriteNode = createSpriteNode({ spriteFrame, parent: this._cursorPreview, x: -24, y: 24, width: 48, height: 48 })
                const sprite = spriteNode.getComponent(Sprite)
                if (sprite) sprite.color = new Color(255, 255, 255, 160)
            }
        }
        const grid = this._session.geometry.pixelToGrid(this._mousePixel.x, this._mousePixel.y)
        if (grid) {
            const pixel = this._session.geometry.gridToPixel(grid.col, grid.row)
            this._cursorPreview.setPosition(pixel.x + 40, -(pixel.y + 45), 1000)
        } else {
            this._cursorPreview.setPosition(this._mousePixel.x, -this._mousePixel.y, 1000)
        }
    }

    private _hitSeedPacket(pixel: { x: number, y: number }): SeedType | null {
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const x = 75 + i * 52
            if (pixel.x >= x && pixel.x <= x + 50 && pixel.y >= 8 && pixel.y <= 78) {
                return packet.seedType
            }
        }
        return null
    }

    private _entityZ(entity: GameEntity) {
        return this._session.geometry.rowZ(entity.row)
    }

    private _removeEntityNode(entityId: number) {
        const node = this._entityNodes.get(entityId)
        if (node?.isValid) node.destroy()
        this._entityNodes.delete(entityId)
        this._plantViews.delete(entityId)
    }

    private _eventToBoardPixel(event: EventMouse | EventTouch) {
        const ui = event.getUILocation()
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0))
        return {
            x: local.x + 400,
            y: 300 - local.y,
        }
    }

    private _createLabel(
        name: string,
        x: number,
        y: number,
        text: string,
        size: number,
        color: Color,
        parent: Node = this._uiLayer,
        width = 500,
    ) {
        const node = createUINode(name, {
            parent,
            anchorX: 0.5,
            anchorY: 0.5,
            width,
            height: size + 8,
            x,
            y,
        })
        const label = node.addComponent(Label)
        label.string = text
        label.fontSize = size
        label.lineHeight = size + 4
        label.color = color
        label.horizontalAlign = Label.HorizontalAlign.CENTER
        label.verticalAlign = Label.VerticalAlign.CENTER
        return label
    }

    private _createBitmapText(args: {
        name: string
        text: string
        baselineX: number
        baselineY: number
        font: BitmapFontAssets | null
        color: Color
        parent: Node
        align?: 'left' | 'center' | 'right'
        maxWidth?: number
        textAlign?: number
    }) {
        const node = createUINode(args.name, {
            parent: args.parent,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = args.color
        renderer.string = args.text
        if (args.maxWidth != null) renderer.maxWidth = args.maxWidth
        if (args.textAlign != null) renderer.textAlign = args.textAlign
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text) || renderer.contentWidth
        let x = args.baselineX
        if (args.align === 'center') x -= width / 2
        if (args.align === 'right') x -= width
        node.setPosition(x, -(args.baselineY - metrics.ascent), 0)
        return renderer
    }

    private _easeInOut(startTick: number, endTick: number, tick: number, start: number, end: number) {
        const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
        const eased = this._todCurveS(this._todCurveS(t))
        return Math.round(start + (end - start) * eased)
    }

    private _linear(startTick: number, endTick: number, tick: number, start: number, end: number) {
        return Math.round(this._linearFloat(startTick, endTick, tick, start, end))
    }

    private _linearFloat(startTick: number, endTick: number, tick: number, start: number, end: number) {
        const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
        return start + (end - start) * t
    }

    private _todCurveS(t: number) {
        return 3 * t * t - 2 * t * t * t
    }

    private _setSeedBankContentsVisible(visible: boolean) {
        if (!this._seedBankNode) return
        for (const child of this._seedBankNode.children) {
            child.active = visible
        }
    }

    private _addSpriteIfLoaded(parent: Node, spriteName: string, x: number, y: number, scale: number) {
        const spriteFrame: SpriteFrame | undefined = SpriteLoader.get(spriteName)
        if (!spriteFrame) return null
        const node = createSpriteNode({ spriteFrame, parent, x, y })
        node.setScale(scale, scale, 1)
        return node
    }
}
