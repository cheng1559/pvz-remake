import {
    _decorator,
    Color,
    EventKeyboard,
    EventTouch,
    Node,
    Sprite,
    UITransform,
    Vec2,
    Vec3,
} from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { ModalDialog } from '@/ui/Dialog'
import { createStoneButton } from '@/ui/StoneButton'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { OptionsDialogAssets, type OptionsDialogFonts, type OptionsDialogSprites } from './OptionsDialogAssets'

const { ccclass, property } = _decorator

const MENU_WIDTH = 423
const MENU_HEIGHT = 498
const TEXT_COLOR = new Color(107, 109, 145)
const DEFAULT_MUSIC_VOLUME = 0.85
const SFX_VOLUME_SCALE = 0.65
const DEFAULT_SFX_VOLUME = DEFAULT_MUSIC_VOLUME * SFX_VOLUME_SCALE
type LawnStringMap = Record<string, string>

@ccclass('OptionsDialog')
export class OptionsDialog extends ModalDialog {
    @property
    musicVolume = DEFAULT_MUSIC_VOLUME

    @property
    sfxVolume = DEFAULT_SFX_VOLUME

    @property
    hardwareAcceleration = true

    @property
    fullScreen = false

    @property
    forceFullScreen = false

    @property
    gameMenu = false

    @property
    showRestartLevel = true

    @property
    backButtonLabel = 'OK'

    public onClose: (() => void) | null = null
    public onMusicVolumeChanged: ((value: number) => void) | null = null
    public onSfxVolumeChanged: ((value: number) => void) | null = null
    public onHardwareAccelerationChanged: ((checked: boolean) => void) | null = null
    public onForcedHardwareAccelerationClick: (() => void) | null = null
    public onFullScreenChanged: ((checked: boolean) => void) | null = null
    public onForcedFullScreenClick: (() => void) | null = null
    public onRestartLevel: (() => void) | null = null
    public onMainMenu: (() => void) | null = null

    private _root: Node | null = null
    private _sprites: OptionsDialogSprites | null = null

    start() {
        this.createModalBlocker()
        setUISize(this.node, MENU_WIDTH, MENU_HEIGHT)
        void this.renderDialog()
    }

    close() {
        this.onClose?.()
        super.close()
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case 13:
            case 32:
            case 27:
                void SoundLoader.play(SoundEffect.ButtonClick)
                this.close()
                break
        }
    }

    async renderDialog() {
        const [sprites, fonts, lawnStrings] = await Promise.all([
            OptionsDialogAssets.loadSprites(),
            OptionsDialogAssets.loadFonts(),
            LawnStringLoader.load(),
        ])
        if (!sprites) return

        this._sprites = sprites
        this._root?.destroy()
        this._root = createUINode('OptionsDialogRoot', { parent: this.node, layer: this.node.layer })

        const menuBack = createSpriteNode({
            name: 'MenuBack',
            spriteFrame: sprites.menuBack,
            parent: this._root,
            layer: this.node.layer,
            x: -MENU_WIDTH / 2,
            y: MENU_HEIGHT / 2,
            anchorX: 0,
            anchorY: 1,
        })
        this.setDragHandle(menuBack)

        const musicOffset = this.gameMenu ? 0 : 5
        const sfxOffset = this.gameMenu ? 0 : 10
        const accelerationOffset = this.gameMenu ? 0 : 15
        const fullScreenOffset = this.gameMenu ? 0 : 20

        this._createLabel(this._lawnString(lawnStrings, 'OPTIONS_MUSIC_LABEL', 'Music'), 186, 140 + musicOffset, fonts.label, 'right')
        this._createLabel(this._lawnString(lawnStrings, 'OPTIONS_SOUNDFX', 'Sound FX'), 186, 167 + sfxOffset, fonts.label, 'right')
        this._createLabel(this._lawnString(lawnStrings, 'OPTIONS_3D_ACCELERATION', '3D Acceleration'), 274, 197 + accelerationOffset, fonts.label, 'right')
        this._createLabel(this._lawnString(lawnStrings, 'OPTIONS_FULL_SCREEN', 'Full Screen'), 274, 229 + fullScreenOffset, fonts.label, 'right')

        this._createSlider('MusicVolume', 199, 116 + musicOffset, this.musicVolume, (value) => {
            this.musicVolume = value
            this.onMusicVolumeChanged?.(value)
        })
        this._createSlider('SfxVolume', 199, 143 + sfxOffset, this.sfxVolume / SFX_VOLUME_SCALE, (value) => {
            this.sfxVolume = value * SFX_VOLUME_SCALE
            this.onSfxVolumeChanged?.(this.sfxVolume)
        })
        this._createCheckbox(
            'HardwareAcceleration',
            284,
            175 + accelerationOffset,
            true,
            (checked) => {
                this.hardwareAcceleration = checked
                this.onHardwareAccelerationChanged?.(checked)
            },
            () => {
                this.hardwareAcceleration = true
                this.onForcedHardwareAccelerationClick?.()
            },
        )
        this._createCheckbox(
            'FullScreen',
            284,
            206 + fullScreenOffset,
            this.forceFullScreen ? true : this.fullScreen,
            (checked) => {
                this.fullScreen = checked
                this.onFullScreenChanged?.(checked)
            },
            this.forceFullScreen ? () => {
                this.fullScreen = true
                this.onForcedFullScreenClick?.()
            } : null,
        )
        if (this.gameMenu) {
            this._createGameButtons(fonts, lawnStrings)
        }
        this._createBackButton(fonts, lawnStrings)
    }

    private _lawnString(strings: LawnStringMap, key: string, fallback: string) {
        return LawnStringLoader.translateOptional(`[${key}]`, strings) || fallback
    }

    private _localizedLabel(label: string, strings: LawnStringMap) {
        if (label.startsWith('[') && label.endsWith(']')) return LawnStringLoader.translate(label, strings)
        const key = {
            OK: 'DIALOG_BUTTON_OK',
            'BACK TO GAME': 'BACK_TO_GAME',
            'MAIN MENU': 'MAIN_MENU_BUTTON',
            'GO BACK': 'BACK_TO_GAME',
        }[label.toUpperCase()]
        return key ? this._lawnString(strings, key, label) : label
    }

    private _createLabel(
        text: string,
        baselineX: number,
        baselineY: number,
        font: BitmapFontAssets | null,
        align: 'left' | 'center' | 'right',
    ) {
        const node = createUINode(`Label_${text}`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (font) renderer.setFontAssets(font)
        renderer.fontColor = TEXT_COLOR
        renderer.string = text
        renderer.forceRebuild()

        const width = FontMetricsUtil.measureTextWidth(font?.config ?? null, text) || renderer.contentWidth
        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        let x = baselineX
        if (align === 'center') x -= width / 2
        if (align === 'right') x -= width
        node.setPosition(this._cppX(x), this._cppY(baselineY - metrics.ascent), 0)
    }

    private _createSlider(
        name: string,
        cppX: number,
        cppY: number,
        value: number,
        onChange: (value: number) => void,
    ) {
        const sprites = this._sprites!
        const slot = sprites.sliderSlot
        const knob = sprites.sliderKnob
        const sliderWidth = 135
        const sliderHeight = 40
        const thumbTravelWidth = sliderWidth - knob.originalSize.width
        let dragging = false
        let dragOffsetX = 0
        const root = createUINode(name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: sliderWidth,
            height: sliderHeight,
        })
        root.setPosition(this._cppX(cppX), this._cppY(cppY), 0)

        createSpriteNode({
            name: 'Slot',
            spriteFrame: slot,
            parent: root,
            layer: this.node.layer,
            x: 0,
            y: -14,
            anchorX: 0,
            anchorY: 1,
        })

        const knobNode = createSpriteNode({
            name: 'Knob',
            spriteFrame: knob,
            parent: root,
            layer: this.node.layer,
            x: 0,
            y: -5,
            anchorX: 0,
            anchorY: 1,
        })

        const setValue = (nextValue: number, emitChange = true) => {
            value = Math.max(0, Math.min(1, nextValue))
            knobNode.setPosition(value * thumbTravelWidth, -5, 0)
            if (emitChange) onChange(value)
        }

        const localXFromTouch = (event: EventTouch) => {
            const location = event.getUILocation()
            const transform = root.getComponent(UITransform)!
            const local = new Vec3()
            transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0), local)
            return local.x
        }

        for (const target of [root, knobNode]) {
            target.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
                event.propagationStopped = true
                const localX = localXFromTouch(event)
                const thumbX = value * thumbTravelWidth
                if (localX >= thumbX && localX < thumbX + knob.originalSize.width) {
                    dragging = true
                    dragOffsetX = localX - thumbX
                    return
                }
                setValue(localX / sliderWidth)
            })
            target.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
                if (!dragging) return
                event.propagationStopped = true
                setValue((localXFromTouch(event) - dragOffsetX) / thumbTravelWidth)
            })
            target.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true
                dragging = false
                void SoundLoader.play(SoundEffect.ButtonClick)
            })
            target.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
                event.propagationStopped = true
                dragging = false
            })
        }

        setValue(value, false)
    }

    private _createCheckbox(
        name: string,
        cppX: number,
        cppY: number,
        checked: boolean,
        onChange: (checked: boolean) => void,
        onForcedClick: (() => void) | null = null,
    ) {
        const sprites = this._sprites!
        const node = createUINode(name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 46,
            height: 45,
        })
        node.setPosition(this._cppX(cppX), this._cppY(cppY), 0)

        const spriteNode = createSpriteNode({
            name: 'Sprite',
            spriteFrame: checked ? sprites.checkboxOn : sprites.checkboxOff,
            parent: node,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })
        const sprite = spriteNode.getComponent(Sprite)!
        const button = node.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.polygon = [
            new Vec2(0, 0),
            new Vec2(46, 0),
            new Vec2(46, -45),
            new Vec2(0, -45),
        ]
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.ButtonClick)
            if (onForcedClick) {
                checked = true
                sprite.spriteFrame = sprites.checkboxOn
                onForcedClick()
                return
            }
            checked = !checked
            sprite.spriteFrame = checked ? sprites.checkboxOn : sprites.checkboxOff
            onChange(checked)
        }
    }

    private _createGameButtons(fonts: OptionsDialogFonts, lawnStrings: LawnStringMap) {
        const sprites = this._sprites!
        const buttonSprites = {
            left: sprites.buttonLeft,
            middle: sprites.buttonMiddle,
            right: sprites.buttonRight,
            downLeft: sprites.buttonDownLeft,
            downMiddle: sprites.buttonDownMiddle,
            downRight: sprites.buttonDownRight,
        }
        const buttonFonts = {
            normal: fonts.smallButton,
            highlight: fonts.smallButtonHighlight,
        }

        if (this.showRestartLevel) {
            createStoneButton({
                name: 'RestartLevelButton',
                parent: this._root!,
                layer: this.node.layer,
                label: this._lawnString(lawnStrings, 'RESTART_LEVEL_BUTTON', 'Restart Level'),
                x: this._cppX(107),
                y: this._cppY(284),
                width: 209,
                height: 46,
                sprites: buttonSprites,
                fonts: buttonFonts,
                onClick: () => this.onRestartLevel?.(),
            })
        }

        createStoneButton({
            name: 'MainMenuButton',
            parent: this._root!,
            layer: this.node.layer,
            label: this._lawnString(lawnStrings, 'MAIN_MENU_BUTTON', 'Main Menu'),
            x: this._cppX(107),
            y: this._cppY(327),
            width: 209,
            height: 46,
            sprites: buttonSprites,
            fonts: buttonFonts,
            onClick: () => this.onMainMenu?.(),
        })
    }

    private _createBackButton(fonts: OptionsDialogFonts, lawnStrings: LawnStringMap) {
        const sprites = this._sprites!
        const labelText = this._localizedLabel(this.backButtonLabel, lawnStrings)
        const buttonNode = createUINode('BackToGameButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: sprites.backToGameButton.originalSize.width,
            height: sprites.backToGameButton.originalSize.height,
        })
        buttonNode.setPosition(this._cppX(30), this._cppY(381), 0)

        const sprite = buttonNode.addComponent(Sprite)
        sprite.trim = false
        sprite.sizeMode = Sprite.SizeMode.RAW
        sprite.spriteFrame = sprites.backToGameButton

        const normalLabelNode = createUINode('Label', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const normalLabel = normalLabelNode.addComponent(FontRenderer)
        if (fonts.button) normalLabel.setFontAssets(fonts.button)
        normalLabel.fontColor = Color.WHITE
        normalLabel.string = labelText
        normalLabel.forceRebuild()

        const highlightLabelNode = createUINode('LabelHighlight', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const highlightLabel = highlightLabelNode.addComponent(FontRenderer)
        if (fonts.buttonHighlight) {
            highlightLabel.setFontAssets(fonts.buttonHighlight)
        } else if (fonts.button) {
            highlightLabel.setFontAssets(fonts.button)
        }
        highlightLabel.fontColor = Color.WHITE
        highlightLabel.string = labelText
        highlightLabel.forceRebuild()

        const buttonWidth = sprites.backToGameButton.originalSize.width
        const buttonHeight = sprites.backToGameButton.originalSize.height
        const normalWidth =
            FontMetricsUtil.measureTextWidth(fonts.button?.config ?? null, labelText) ||
            normalLabel.contentWidth
        const highlightWidth =
            FontMetricsUtil.measureTextWidth(
                fonts.buttonHighlight?.config ?? fonts.button?.config ?? null,
                labelText,
            ) ||
            highlightLabel.contentWidth
        const normalMetrics = FontMetricsUtil.getMetrics(fonts.button?.config ?? null)
        const highlightMetrics = FontMetricsUtil.getMetrics(
            fonts.buttonHighlight?.config ?? fonts.button?.config ?? null,
        )
        const normalTopY = this._buttonLabelTopY(buttonHeight, normalMetrics.ascent, -5)
        const highlightTopY = this._buttonLabelTopY(buttonHeight, highlightMetrics.ascent, -5)
        const normalX = (buttonWidth - normalWidth) / 2 - 2
        const highlightX = (buttonWidth - highlightWidth) / 2 - 2
        normalLabelNode.setPosition(normalX, -normalTopY, 0)
        highlightLabelNode.setPosition(highlightX, -highlightTopY, 0)
        highlightLabelNode.active = false

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.backToGameButton
        button.pressedSprite = sprites.backToGameButtonDown
        button.hoverSprite = sprites.backToGameButton
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        button.onStateChange = (state) => {
            const pressed = state === 'pressed'
            const highlighted = state === 'hover' || pressed
            normalLabelNode.active = !highlighted
            highlightLabelNode.active = highlighted
            normalLabelNode.setPosition(normalX, -normalTopY, 0)
            highlightLabelNode.setPosition(highlightX, -(highlightTopY + (pressed ? 1 : 0)), 0)
        }
        button.onClick = () => {
            void SoundLoader.play(SoundEffect.ButtonClick)
            this.close()
        }
    }

    private _cppX(x: number) {
        return x - MENU_WIDTH / 2
    }

    private _cppY(y: number) {
        return MENU_HEIGHT / 2 - y
    }

    private _buttonLabelTopY(buttonHeight: number, ascent: number, offsetY: number) {
        const baseline = offsetY + Math.trunc((buttonHeight - Math.trunc(ascent / 6) + ascent - 1) / 2)
        return baseline - ascent
    }
}
