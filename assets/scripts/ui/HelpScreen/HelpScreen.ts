import {
    _decorator,
    Color,
    EventKeyboard,
    Graphics,
    input,
    Input,
    KeyCode,
    Node,
} from 'cc'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { scaleGameDeltaTime } from '@/game/GameDefinitions'
import { UIButton } from '@/ui/Button'
import { createSeedChooserButton } from '@/ui/SeedChooserButton'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { MenuScreenBase, SCREEN_HEIGHT, SCREEN_WIDTH } from '@/ui/MenuScreenBase'
import { HelpScreenAssets, type HelpScreenFonts, type HelpScreenSprites } from './HelpScreenAssets'

const { ccclass } = _decorator

const FADE_TICKS = 180
const FADE_TICK_SECONDS = 0.01
const BUTTON_TEXT_COLOR = new Color(213, 159, 43)
const MAIN_MENU_BUTTON_X = 324
const MAIN_MENU_BUTTON_Y = 520

@ccclass('HelpScreen')
export class HelpScreen extends MenuScreenBase {
    public keyboardExitEnabled = true

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
        const [sprites, fonts, lawnStrings] = await Promise.all([
            HelpScreenAssets.loadSprites(),
            HelpScreenAssets.loadFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites) return

        this._resetRoot('HelpScreenRoot')

        this._createNote(sprites)
        this._createMainMenuButton(sprites, fonts, lawnStrings)
        this._createFadeOverlay()

        void SoundLoader.play(SoundEffect.Paper)
    }

    update(dt: number) {
        if (this._fadeCounter <= 0) return

        this._fadeCounter = Math.max(0, this._fadeCounter - scaleGameDeltaTime(dt) / FADE_TICK_SECONDS)
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

    private _createMainMenuButton(
        sprites: HelpScreenSprites,
        fonts: HelpScreenFonts,
        lawnStrings: Record<string, string>,
    ) {
        const { button, glow } = createSeedChooserButton({
            name: 'MainMenuButton',
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(MAIN_MENU_BUTTON_X),
            y: this._cppY(MAIN_MENU_BUTTON_Y),
            label: LawnStringLoader.translate('[MAIN_MENU_BUTTON]', lawnStrings),
            normal: sprites.mainMenuButton,
            glow: sprites.mainMenuButtonGlow,
            font: fonts.button,
            color: BUTTON_TEXT_COLOR,
            onClick: () => this._exitScreen(),
        })
        button.disabledSprite = sprites.mainMenuButtonDisabled
        button.rightClickTriggers = false
        this._applyAdditiveSpriteMaterial(glow)
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
        if (!this.keyboardExitEnabled) return

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
