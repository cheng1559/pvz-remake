import { _decorator, Color, EventMouse, EventTouch, Graphics, Node, Vec3 } from 'cc'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SEED_DEFINITIONS, scaleGameDeltaTime } from '@/game/GameDefinitions'
import type { SeedType } from '@/game/GameTypes'
import { UIButton } from '@/ui/Button'
import { MenuScreenBase, SCREEN_HEIGHT, SCREEN_WIDTH } from '@/ui/MenuScreenBase'
import { SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { AwardScreenAssets, type AwardScreenFonts, type AwardScreenSprites } from './AwardScreenAssets'

const { ccclass } = _decorator

const FADE_TICKS_PER_SECOND = 100
const FADE_IN_TICKS = 180
const PACKET_X = 350
const PACKET_Y = 129
const PACKET_SCALE = 2
const TITLE_BASELINE_X = 400
const TITLE_BASELINE_Y = 58
const PLANT_NAME_BASELINE_X = 400
const PLANT_NAME_BASELINE_Y = 326
const DESCRIPTION_X = 285
const DESCRIPTION_Y = 360
const DESCRIPTION_WIDTH = 230
const DESCRIPTION_HEIGHT = 90
const NEXT_BUTTON_X = 324
const NEXT_BUTTON_Y = 500
const NEXT_BUTTON_WIDTH = 156
const NEXT_BUTTON_HEIGHT = 42
const NEXT_BUTTON_TEXT_OFFSET_Y = -1
const TITLE_COLOR = new Color(213, 159, 43, 255)
const DESCRIPTION_COLOR = new Color(40, 50, 90, 255)
const BUTTON_TEXT_COLOR = new Color(213, 159, 43, 255)

const SEED_STRING_KEYS: Record<SeedType, string> = {
    peashooter: 'PEASHOOTER',
    sunflower: 'SUNFLOWER',
    cherrybomb: 'CHERRY_BOMB',
    wallnut: 'WALL_NUT',
    potatomine: 'POTATO_MINE',
    snowpea: 'SNOW_PEA',
    chomper: 'CHOMPER',
    repeater: 'REPEATER',
}

@ccclass('AwardScreen')
export class AwardScreen extends MenuScreenBase {
    public seedType: SeedType = 'sunflower'
    public onNextLevelRequest: (() => void) | null = null

    private _fadeInCounter = FADE_IN_TICKS
    private _fadeNode: Node | null = null
    private _fadeGraphics: Graphics | null = null

    protected update(dt: number) {
        if (this._fadeInCounter <= 0) return

        this._fadeInCounter = Math.max(0, this._fadeInCounter - scaleGameDeltaTime(dt) * FADE_TICKS_PER_SECOND)
        this._syncFade()
    }

    async render(): Promise<void> {
        const [sprites, fonts, lawnStrings] = await Promise.all([
            AwardScreenAssets.loadSprites(),
            AwardScreenAssets.loadFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites) return

        this._resetRoot('AwardScreenRoot')
        this._fadeInCounter = FADE_IN_TICKS
        this._createInputBlocker()
        this._createBackground(sprites.background)
        this._drawTitle(fonts, lawnStrings)
        this._drawSeedPacket(sprites, fonts)
        this._drawDescription(fonts, lawnStrings)
        this._drawNextButton(sprites, fonts, lawnStrings)
        this._createFade()
        this._syncFade()
        UIButton.refreshHoverStates()
    }

    private _drawTitle(fonts: AwardScreenFonts, lawnStrings: Record<string, string>) {
        this._createText({
            name: 'Title',
            text: lawnStrings.NEW_PLANT ?? 'YOU GOT A NEW PLANT!',
            baselineX: TITLE_BASELINE_X,
            baselineY: TITLE_BASELINE_Y,
            font: fonts.title,
            color: TITLE_COLOR,
            align: 'center',
        })
    }

    private _drawSeedPacket(sprites: AwardScreenSprites, fonts: AwardScreenFonts) {
        SeedPacketRenderer.drawSeedPacket({
            name: 'AwardSeedPacket',
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(PACKET_X),
            y: this._cppY(PACKET_Y),
            scale: PACKET_SCALE,
            seedType: this.seedType,
            cost: SEED_DEFINITIONS[this.seedType].cost,
            seeds: null,
            seedPacketLarger: sprites.seedPacketLarger,
            plantPreviews: sprites.plantPreviewsCached,
            costFont: fonts.packetCost,
        })
    }

    private _drawDescription(fonts: AwardScreenFonts, lawnStrings: Record<string, string>) {
        const stringKey = SEED_STRING_KEYS[this.seedType]
        this._createText({
            name: 'PlantName',
            text: lawnStrings[stringKey] ?? stringKey,
            baselineX: PLANT_NAME_BASELINE_X,
            baselineY: PLANT_NAME_BASELINE_Y,
            font: fonts.awardName,
            color: Color.WHITE,
            align: 'center',
        })

        const node = createUINode('Description', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: DESCRIPTION_WIDTH,
        })
        const renderer = node.addComponent(FontRenderer)
        if (fonts.description) renderer.setFontAssets(fonts.description)
        renderer.fontColor = DESCRIPTION_COLOR
        renderer.string = lawnStrings[`${stringKey}_TOOLTIP`] ?? `${stringKey}_TOOLTIP`
        renderer.maxWidth = DESCRIPTION_WIDTH
        renderer.textAlign = 2
        renderer.forceRebuild()

        const textY = DESCRIPTION_Y + Math.max(0, (DESCRIPTION_HEIGHT - renderer.contentHeight) / 2)
        node.setPosition(this._cppX(DESCRIPTION_X), this._cppY(textY), 0)
    }

    private _drawNextButton(
        sprites: AwardScreenSprites,
        fonts: AwardScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        const buttonNode = createSpriteNode({
            name: 'NextLevelButton',
            spriteFrame: sprites.seedChooserButton,
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: this._cppX(NEXT_BUTTON_X),
            y: this._cppY(NEXT_BUTTON_Y),
            width: NEXT_BUTTON_WIDTH,
            height: NEXT_BUTTON_HEIGHT,
        })
        const glowNode = createSpriteNode({
            name: 'Glow',
            spriteFrame: sprites.seedChooserButtonGlow,
            parent: buttonNode,
            layer: this.node.layer,
            z: 2,
            anchorX: 0,
            anchorY: 1,
            width: sprites.seedChooserButtonGlow.originalSize.width,
            height: sprites.seedChooserButtonGlow.originalSize.height,
        })
        glowNode.active = false
        this._applyAdditiveSpriteMaterial(glowNode)

        const label = this._createNextButtonLabel(
            buttonNode,
            lawnStrings.NEXT_LEVEL_BUTTON ?? 'NEXT LEVEL!',
            fonts,
        )
        glowNode.setSiblingIndex(label.getSiblingIndex() + 1)
        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.seedChooserButton
        button.hoverSprite = sprites.seedChooserButton
        button.pressedSprite = sprites.seedChooserButton
        button.pressOffset = new Vec3(1, -1, 0)
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.Tap)
        }
        button.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            glowNode.active = highlighted
            label.setPosition(label.awardBaseX, label.awardBaseY, 1)
        }
        button.onClick = () => this.onNextLevelRequest?.()
    }

    private _createNextButtonLabel(parent: Node, text: string, fonts: AwardScreenFonts) {
        const node = createUINode('Label', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        }) as Node & { awardBaseX: number, awardBaseY: number }
        const renderer = node.addComponent(FontRenderer)
        if (fonts.button) renderer.setFontAssets(fonts.button)
        renderer.fontColor = BUTTON_TEXT_COLOR
        renderer.string = text
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(fonts.button?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(fonts.button?.config ?? null, text) || renderer.contentWidth
        const baselineY = (NEXT_BUTTON_HEIGHT - metrics.ascent / 6 + metrics.ascent - 1) / 2 + NEXT_BUTTON_TEXT_OFFSET_Y
        node.awardBaseX = (NEXT_BUTTON_WIDTH - width) / 2
        node.awardBaseY = -(baselineY - metrics.ascent)
        node.setPosition(node.awardBaseX, node.awardBaseY, 1)
        return node
    }

    private _createInputBlocker() {
        const blocker = createUINode('InputBlocker', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            z: -10,
        })
        const swallow = (event: EventMouse | EventTouch) => {
            event.propagationStopped = true
        }
        blocker.on(Node.EventType.MOUSE_DOWN, swallow)
        blocker.on(Node.EventType.MOUSE_UP, swallow)
        blocker.on(Node.EventType.MOUSE_MOVE, swallow)
        blocker.on(Node.EventType.TOUCH_START, swallow)
        blocker.on(Node.EventType.TOUCH_MOVE, swallow)
        blocker.on(Node.EventType.TOUCH_END, swallow)
        blocker.on(Node.EventType.TOUCH_CANCEL, swallow)
    }

    private _createFade() {
        this._fadeNode = createUINode('Fade', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            z: 100,
        })
        this._fadeGraphics = this._fadeNode.addComponent(Graphics)
    }

    private _syncFade() {
        if (!this._fadeNode?.isValid || !this._fadeGraphics) return

        const alpha = Math.round(255 * Math.max(0, Math.min(1, this._fadeInCounter / FADE_IN_TICKS)))
        this._fadeNode.active = alpha > 0
        this._fadeGraphics.clear()
        if (alpha <= 0) return

        this._fadeGraphics.fillColor = new Color(255, 255, 255, alpha)
        this._fadeGraphics.fillRect(0, -SCREEN_HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT)
    }
}
