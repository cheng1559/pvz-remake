import {
    _decorator,
    Color,
    EventKeyboard,
    Graphics,
    input,
    Input,
    KeyCode,
    Node,
    Vec3,
} from 'cc'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { MenuScreenBase, SCREEN_HEIGHT, SCREEN_WIDTH } from '@/ui/MenuScreenBase'
import { HelpScreenAssets, type HelpScreenFonts, type HelpScreenSprites } from './HelpScreenAssets'

const { ccclass } = _decorator

const FADE_TICKS = 180
const FADE_TICK_SECONDS = 0.01
const BUTTON_TEXT_COLOR = new Color(213, 159, 43)
const MAIN_MENU_BUTTON_X = 324
const MAIN_MENU_BUTTON_Y = 520
const MAIN_MENU_BUTTON_WIDTH = 156
const MAIN_MENU_BUTTON_HEIGHT = 42

@ccclass('HelpScreen')
export class HelpScreen extends MenuScreenBase {
    private _fadeGraphics: Graphics | null = null
    private _fadeCounter = FADE_TICKS
    private _hasExited = false

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this)
    }

    async render() {
        const [sprites, fonts] = await Promise.all([
            HelpScreenAssets.loadSprites(),
            HelpScreenAssets.loadFonts(),
        ])
        if (!sprites) return

        this._resetRoot('HelpScreenRoot')

        this._createNote(sprites)
        this._createMainMenuButton(sprites, fonts)
        this._createFadeOverlay()

        void SoundLoader.play(SoundEffect.Paper)
    }

    update(dt: number) {
        if (this._fadeCounter <= 0) return

        this._fadeCounter = Math.max(0, this._fadeCounter - dt / FADE_TICK_SECONDS)
        this._drawFadeOverlay()
    }

    private _createNote(sprites: HelpScreenSprites) {
        createSpriteNode({
            name: 'Background',
            spriteFrame: sprites.background,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(-700),
            y: this._cppY(-300),
            anchorX: 0,
            anchorY: 1,
            width: 2800,
            height: 1200,
        })
        createSpriteNode({
            name: 'ZombieNote',
            spriteFrame: sprites.zombieNote,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(80),
            y: this._cppY(80),
            anchorX: 0,
            anchorY: 1,
        })
        createSpriteNode({
            name: 'ZombieNoteHelp',
            spriteFrame: sprites.zombieNoteHelp,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(131),
            y: this._cppY(132),
            anchorX: 0,
            anchorY: 1,
        })
    }

    private _createMainMenuButton(sprites: HelpScreenSprites, fonts: HelpScreenFonts) {
        const buttonNode = createUINode('MainMenuButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: MAIN_MENU_BUTTON_WIDTH,
            height: MAIN_MENU_BUTTON_HEIGHT,
        })
        buttonNode.setPosition(this._cppX(MAIN_MENU_BUTTON_X), this._cppY(MAIN_MENU_BUTTON_Y), 0)

        const buttonImageNode = createSpriteNode({
            name: 'ButtonImage',
            spriteFrame: sprites.mainMenuButton,
            parent: buttonNode,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
            width: MAIN_MENU_BUTTON_WIDTH,
            height: MAIN_MENU_BUTTON_HEIGHT,
        })
        const overlayNode = createSpriteNode({
            name: 'HoverOverlay',
            spriteFrame: sprites.mainMenuButtonGlow,
            parent: buttonNode,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
            width: MAIN_MENU_BUTTON_WIDTH,
            height: MAIN_MENU_BUTTON_HEIGHT,
        })
        overlayNode.active = false

        const labelNode = createUINode('Label', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const label = labelNode.addComponent(FontRenderer)
        if (fonts.button) label.setFontAssets(fonts.button)
        label.fontColor = BUTTON_TEXT_COLOR
        label.string = 'Main Menu'
        label.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(fonts.button?.config ?? null)
        const width =
            FontMetricsUtil.measureTextWidth(fonts.button?.config ?? null, label.string) ||
            label.contentWidth
        const baseline = Math.trunc(
            (MAIN_MENU_BUTTON_HEIGHT - Math.trunc(metrics.ascent / 6) + metrics.ascent - 1) / 2,
        )
        const labelOrigin = new Vec3(
            (MAIN_MENU_BUTTON_WIDTH - width) / 2,
            -(baseline - metrics.ascent - 1),
            0,
        )
        labelNode.setPosition(labelOrigin)

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.mainMenuButton
        button.hoverSprite = sprites.mainMenuButton
        button.pressedSprite = sprites.mainMenuButton
        button.disabledSprite = sprites.mainMenuButtonDisabled
        button.pressOffset = new Vec3(0, 0, 0)
        button.rightClickTriggers = false
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.Tap)
        }
        button.onStateChange = (state) => {
            const pressed = state === 'pressed'
            const highlighted = state === 'hover' || state === 'pressed'
            buttonImageNode.setPosition(pressed ? 1 : 0, pressed ? -1 : 0, 0)
            overlayNode.active = highlighted
            labelNode.setPosition(
                labelOrigin.x + (pressed ? 1 : 0),
                labelOrigin.y + (pressed ? -1 : 0),
                0,
            )
        }
        button.onClick = () => {
            this._exitScreen()
        }
    }

    private _createFadeOverlay() {
        const fadeNode = createUINode('FadeOverlay', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
        })
        this._fadeGraphics = fadeNode.addComponent(Graphics)
        this._drawFadeOverlay()
    }

    private _drawFadeOverlay() {
        if (!this._fadeGraphics) return
        const alpha = Math.round((Math.max(0, this._fadeCounter) / FADE_TICKS) * 255)
        this._fadeGraphics.clear()
        if (alpha <= 0) return

        this._fadeGraphics.fillColor = new Color(0, 0, 0, alpha)
        this._fadeGraphics.fillRect(-SCREEN_WIDTH / 2, -SCREEN_HEIGHT / 2, SCREEN_WIDTH, SCREEN_HEIGHT)
    }

    private _onKeyDown(event: EventKeyboard) {
        if (
            event.keyCode === KeyCode.SPACE ||
            event.keyCode === KeyCode.ENTER ||
            event.keyCode === KeyCode.ESCAPE
        ) {
            this._exitScreen()
        }
    }

    private _exitScreen() {
        if (this._hasExited) return
        this._hasExited = true
        this.onBackToMenu?.()
    }

}
