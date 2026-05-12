import {
    _decorator,
    Color,
    EventKeyboard,
    EventMouse,
    EventTouch,
    input,
    Input,
    KeyCode,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    sys,
    Vec2,
    Vec3,
} from 'cc'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { scaleGameDeltaTime } from '@/game/GameDefinitions'
import { UIButton } from '@/ui/Button'
import { MenuScreenBase } from '@/ui/MenuScreenBase'
import { TouchScrollGesture } from '@/ui/ScrollGesture'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import {
    AchievementScreenAssets,
    type AchievementScreenFonts,
    type AchievementScreenSprites,
} from './AchievementScreenAssets'

const { ccclass } = _decorator

const BACK_BUTTON_X = 128
const BACK_BUTTON_Y = 55
const BACK_BUTTON_HIT_OFFSET_X = -8
const BACK_BUTTON_HIT_OFFSET_Y = -18
const BACK_BUTTON_WIDTH = 130
const BACK_BUTTON_HEIGHT = 80
const ROCK_BUTTON_X = 700
const ROCK_BUTTON_Y = 450
const TILE_COUNT = 70
const MAX_SCROLL_POSITION = 15342
const WHEEL_SCROLL_DISTANCE = 435
const WHEEL_TWEEN_SECONDS = 0.35
const WHEEL_MIN_TWEEN_SECONDS = 0.05
const MORE_SCROLL_DISTANCE = 230
const MORE_TWEEN_SECONDS = 0.25
const ACHIEVEMENT_ICON_COLUMNS = 7
const ACHIEVEMENT_ICON_STRIDE = 70
const ACHIEVEMENT_ICON_SIZE = 70
const ACHIEVEMENT_ICON_SCALE = 0.8
const ACHIEVEMENT_DESC_WIDTH = 215
const ACHIEVEMENT_TITLE_COLOR = new Color(21, 175, 0)
const ACHIEVEMENT_DESC_COLOR = new Color(255, 255, 255)

interface AchievementDefinition {
    title: string
    description: string
}

const ACHIEVEMENTS: AchievementDefinition[] = [
    {
        title: 'Home Lawn Security',
        description: 'Complete Adventure Mode.',
    },
    {
        title: 'Nobel Peas Prize',
        description: 'Get the golden sunflower trophy.',
    },
    {
        title: 'Better Off Dead',
        description: 'Get to a streak of 10 in I, Zombie Endless',
    },
    {
        title: 'China Shop',
        description: 'Get to a streak of 15 in Vasebreaker Endless',
    },
    {
        title: 'SPUDOW!',
        description: 'Blow up a zombie using a Potato Mine.',
    },
    {
        title: 'Explodonator',
        description: 'Take out 10 zombies with a single Cherry Bomb.',
    },
    {
        title: 'Morticulturalist',
        description: "Collect all 49 plants (including plants from Crazy Dave's shop).",
    },
    {
        title: "Don't Pea in the Pool",
        description: 'Complete a daytime pool level without using pea shooters of any kind.',
    },
    {
        title: 'Roll Some Heads',
        description: 'Bowl over 5 zombies with a single Wall-Nut.',
    },
    {
        title: 'Grounded',
        description: 'Defeat a normal roof level without using any catapult plants.',
    },
    {
        title: 'Cryptozombologist',
        description: 'Discover the Yeti zombie.',
    },
    {
        title: 'Penny Pincher',
        description: 'Pick up 30 coins in a row on a single level without letting any disappear.',
    },
    {
        title: 'Sunny Days',
        description: 'Accumulate 8,000 sun during a single level.',
    },
    {
        title: 'Popcorn Party',
        description: 'Defeat 2 Gargantuars with Corn Cob missiles in a single level.',
    },
    {
        title: 'Good Morning',
        description: 'Complete a daytime level by planting only Mushrooms and Coffee Beans.',
    },
    {
        title: 'No Fungus Among Us',
        description: 'Complete a nighttime level without planting any Mushrooms.',
    },
    {
        title: 'Beyond the Grave',
        description: 'Beat all 20 mini games.',
    },
    {
        title: 'Immortal',
        description: 'Survive 20 waves of pure zombie ferocity.',
    },
    {
        title: 'Towering Wisdom',
        description: 'Grow the Tree of Wisdom to 100 feet.',
    },
    {
        title: 'Mustache Mode',
        description: 'Enable Mustache Mode',
    },
    {
        title: 'Disco is Undead',
        description: 'Hypnotize the lead Zombie Dancer.',
    },
]

@ccclass('AchievementScreen')
export class AchievementScreen extends MenuScreenBase {
    private _rockButtonImage: Sprite | null = null
    private _moreButton: UIButton | null = null
    private _sprites: AchievementScreenSprites | null = null
    private _showingTop = false
    private _scrollPosition = 0
    private _scrollTargetPosition = 0
    private _scrollTweenElapsed = 0
    private _scrollTweenDuration = 0
    private _scrollTweenStart = 0
    private _scrollTweenEnd = 0
    private _iconFrames: SpriteFrame[] = []
    private readonly _touchScrollGesture = new TouchScrollGesture({ direction: -1 })

    onEnable() {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this.node.on(Node.EventType.MOUSE_WHEEL, this._onMouseWheel, this)
        if (sys.isMobile) {
            this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
            this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
            this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
            this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
        }
    }

    onDisable() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this.node.off(Node.EventType.MOUSE_WHEEL, this._onMouseWheel, this)
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this)
        this._touchScrollGesture.cancel()
    }

    async render() {
        const [sprites, fonts] = await Promise.all([
            AchievementScreenAssets.loadSprites(),
            AchievementScreenAssets.loadFonts(),
        ])
        if (!sprites) return

        this._sprites = sprites
        this._clearIconFrames()
        this._resetRoot('AchievementScreenRoot')

        this._createBackground(sprites)
        this._createAchievements(sprites, fonts)
        this._createBackButton(sprites)
        this._createRockButton(sprites)
        this._applyScrollPosition()
    }

    update(dt: number) {
        const scaledDt = scaleGameDeltaTime(dt)
        if (this._scrollTweenDuration > 0) {
            this._scrollTweenElapsed = Math.min(
                this._scrollTweenDuration,
                this._scrollTweenElapsed + scaledDt,
            )
            const t = this._scrollTweenElapsed / this._scrollTweenDuration
            this._setScrollPosition(
                this._interpolateScroll(this._scrollTweenStart, this._scrollTweenEnd, t),
            )
            if (this._scrollTweenElapsed >= this._scrollTweenDuration) {
                this._scrollTweenDuration = 0
                this._scrollTargetPosition = this._scrollPosition
            }
        }
    }

    private _createBackground(sprites: AchievementScreenSprites) {
        createSpriteNode({
            name: 'Background',
            spriteFrame: sprites.background,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(0),
            y: this._cppY(0),
            anchorX: 0,
            anchorY: 1,
        })

        for (let i = 1; i <= TILE_COUNT; i++) {
            const isChinaTile = i === TILE_COUNT
            const y = sprites.tile.originalSize.height * i + (isChinaTile ? -30 : 0)
            createSpriteNode({
                name: isChinaTile ? 'ChinaTile' : 'Tile',
                spriteFrame: isChinaTile ? sprites.chinaTile : sprites.tile,
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(0),
                y: this._cppY(y),
                anchorX: 0,
                anchorY: 1,
            })
        }

        this._createBackgroundOverlay('Bookworm', sprites.bookworm, 1125)
        this._createBackgroundOverlay('Bejeweled', sprites.bejeweled, 2250)
        this._createBackgroundOverlay('Chuzzle', sprites.chuzzle, 4500)
        this._createBackgroundOverlay('Peggle', sprites.peggle, 6750)
        this._createBackgroundOverlay('Pipe', sprites.pipe, 9000)
        this._createBackgroundOverlay('Zuma', sprites.zuma, 11250)
    }

    private _createAchievements(sprites: AchievementScreenSprites, fonts: AchievementScreenFonts) {
        for (let i = 0; i < ACHIEVEMENTS.length; i++) {
            const row = Math.floor(i / 2)
            const xPos = (i % 2 !== 0 ? 380 : 90) + 120
            const yPos = 178 + 57 * row
            const imagePosX = xPos - 90
            const achievement = ACHIEVEMENTS[i]

            createSpriteNode({
                name: `AchievementIcon_${i}`,
                spriteFrame: this._getAchievementIconFrame(sprites.icons, i),
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(imagePosX),
                y: this._cppY(yPos),
                anchorX: 0,
                anchorY: 1,
                width: ACHIEVEMENT_ICON_SIZE * ACHIEVEMENT_ICON_SCALE,
                height: ACHIEVEMENT_ICON_SIZE * ACHIEVEMENT_ICON_SCALE,
            })

            this._createText({
                name: `AchievementTitle_${i}`,
                text: achievement.title,
                font: fonts.title,
                color: ACHIEVEMENT_TITLE_COLOR,
                x: xPos - 20,
                y: yPos + 16,
            })
            this._createText({
                name: `AchievementDescription_${i}`,
                text: achievement.description,
                font: fonts.description,
                color: ACHIEVEMENT_DESC_COLOR,
                x: xPos - 20,
                y: yPos + 30,
                maxWidth: ACHIEVEMENT_DESC_WIDTH,
            })
        }
    }

    private _createText(args: {
        name: string
        text: string
        font: AchievementScreenFonts['title']
        color: Color
        x: number
        y: number
        maxWidth?: number
    }) {
        const node = createUINode(args.name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = args.color
        renderer.maxWidth = args.maxWidth ?? 0
        renderer.lineSpacing = args.maxWidth ? 12 : 0
        renderer.string = args.text
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const y = args.y - metrics.ascent + (args.maxWidth ? 1 : 0)
        node.setPosition(this._cppX(args.x), this._cppY(y), 0)
    }

    private _getAchievementIconFrame(atlas: SpriteFrame, index: number) {
        const cached = this._iconFrames[index]
        if (cached) return cached

        const atlasRect = atlas.rect
        const frame = new SpriteFrame()
        frame.reset({
            texture: atlas.texture,
            rect: new Rect(
                atlasRect.x + (index % ACHIEVEMENT_ICON_COLUMNS) * ACHIEVEMENT_ICON_STRIDE,
                atlasRect.y + Math.floor(index / ACHIEVEMENT_ICON_COLUMNS) * ACHIEVEMENT_ICON_STRIDE,
                ACHIEVEMENT_ICON_SIZE,
                ACHIEVEMENT_ICON_SIZE,
            ),
            originalSize: new Size(ACHIEVEMENT_ICON_SIZE, ACHIEVEMENT_ICON_SIZE),
            offset: new Vec2(0, 0),
            isRotate: false,
        })
        this._iconFrames[index] = frame
        return frame
    }

    private _createBackgroundOverlay(
        name: string,
        spriteFrame: AchievementScreenSprites['bookworm'],
        y: number,
    ) {
        createSpriteNode({
            name,
            spriteFrame,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(0),
            y: this._cppY(y),
            anchorX: 0,
            anchorY: 1,
        })
    }

    private _createBackButton(sprites: AchievementScreenSprites) {
        const buttonNode = createUINode('BackButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: BACK_BUTTON_WIDTH,
            height: BACK_BUTTON_HEIGHT,
        })
        buttonNode.setPosition(
            this._cppX(BACK_BUTTON_X + BACK_BUTTON_HIT_OFFSET_X),
            this._cppY(BACK_BUTTON_Y + BACK_BUTTON_HIT_OFFSET_Y),
            0,
        )

        const glowNode = createUINode('Glow', {
            parent: buttonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        glowNode.setPosition(-BACK_BUTTON_HIT_OFFSET_X, BACK_BUTTON_HIT_OFFSET_Y, 0)
        glowNode.active = false
        const sprite = glowNode.addComponent(Sprite)
        sprite.trim = false
        sprite.sizeMode = Sprite.SizeMode.RAW
        sprite.spriteFrame = sprites.backButton

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.backButton
        button.hoverSprite = sprites.backButton
        button.pressedSprite = sprites.backButton
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.changeCursor = false
        button.onStateChange = (state) => {
            glowNode.active = state === 'hover' || state === 'pressed'
        }
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        button.onClick = () => {
            this._exitScreen()
        }
    }

    private _createRockButton(sprites: AchievementScreenSprites) {
        createSpriteNode({
            name: 'Rock',
            spriteFrame: sprites.rock,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(ROCK_BUTTON_X),
            y: this._cppY(ROCK_BUTTON_Y),
            anchorX: 0,
            anchorY: 1,
        })

        const buttonNode = createUINode('MoreButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: sprites.moreButton.originalSize.width,
            height: sprites.moreButton.originalSize.height,
        })
        buttonNode.setPosition(this._cppX(ROCK_BUTTON_X), this._cppY(ROCK_BUTTON_Y), 0)

        this._rockButtonImage = buttonNode.addComponent(Sprite)
        this._rockButtonImage.trim = false
        this._rockButtonImage.sizeMode = Sprite.SizeMode.RAW
        this._rockButtonImage.spriteFrame = sprites.moreButton

        this._moreButton = buttonNode.addComponent(UIButton)
        this._moreButton.normalSprite = sprites.moreButton
        this._moreButton.hoverSprite = sprites.moreButtonHighlight
        this._moreButton.pressedSprite = sprites.moreButtonHighlight
        this._moreButton.pressOffset = new Vec3(0, 0, 0)
        this._moreButton.releaseToNormalOnPressOut = true
        this._moreButton.changeCursor = false
        this._moreButton.onPress = () => {
            if (!this._showingTop) {
                void SoundLoader.play(SoundEffect.GraveButton)
            }
        }
        this._moreButton.onClick = () => {
            this._toggleRockButton()
        }
    }

    private _toggleRockButton() {
        if (!this._sprites || !this._moreButton || !this._rockButtonImage) return

        this._showingTop = !this._showingTop
        this._moreButton.normalSprite = this._showingTop
            ? this._sprites.topButton
            : this._sprites.moreButton
        this._moreButton.hoverSprite = this._showingTop
            ? this._sprites.topButtonHighlight
            : this._sprites.moreButtonHighlight
        this._moreButton.pressedSprite = this._moreButton.hoverSprite
        this._rockButtonImage.spriteFrame = this._moreButton.normalSprite
        const direction = this._showingTop ? -1 : 1
        this._startScrollTween(this._scrollPosition + direction * MORE_SCROLL_DISTANCE)
    }

    private _onKeyDown(event: EventKeyboard) {
        if (event.keyCode === KeyCode.ARROW_UP) {
            this._cancelScrollTween()
            this._setScrollPosition(this._scrollPosition + 15)
            this._scrollTargetPosition = this._scrollPosition
        } else if (event.keyCode === KeyCode.ARROW_DOWN) {
            this._cancelScrollTween()
            this._setScrollPosition(this._scrollPosition - 15)
            this._scrollTargetPosition = this._scrollPosition
        } else if (event.keyCode === KeyCode.ESCAPE) {
            this._exitScreen()
        }
    }

    private _onMouseWheel(event: EventMouse) {
        const delta = Math.sign(event.getScrollY())
        if (delta === 0) return
        event.propagationStopped = true
        const requestedTarget = this._scrollTargetPosition + WHEEL_SCROLL_DISTANCE * delta
        const target = this._clampScrollPosition(requestedTarget)
        const targetDistance = Math.abs(target - this._scrollTargetPosition)
        if (targetDistance === 0) return

        const durationScale = Math.min(1, targetDistance / WHEEL_SCROLL_DISTANCE)
        const duration = Math.max(WHEEL_MIN_TWEEN_SECONDS, WHEEL_TWEEN_SECONDS * durationScale)
        this._startScrollTween(target, duration)
    }

    private _onTouchStart(event: EventTouch) {
        this._touchScrollGesture.begin()
        this._cancelScrollTween()
        event.propagationStopped = true
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._touchScrollGesture.dragging) return

        const delta = this._touchScrollGesture.getDeltaY(event)
        if (delta !== 0) {
            this._setScrollPosition(this._scrollPosition + delta)
            this._scrollTargetPosition = this._scrollPosition
        }
        event.propagationStopped = true
    }

    private _onTouchEnd(event: EventTouch) {
        if (!this._touchScrollGesture.end()) return

        this._scrollTargetPosition = this._scrollPosition
        event.propagationStopped = true
    }

    private _startScrollTween(target: number, duration = MORE_TWEEN_SECONDS) {
        const clampedTarget = this._clampScrollPosition(target)
        this._scrollTweenStart = this._scrollPosition
        this._scrollTweenEnd = clampedTarget
        this._scrollTweenElapsed = 0
        this._scrollTweenDuration = duration
        this._scrollTargetPosition = clampedTarget
    }

    private _cancelScrollTween() {
        this._scrollTweenDuration = 0
        this._scrollTweenElapsed = 0
        this._scrollTargetPosition = this._scrollPosition
    }

    private _setScrollPosition(position: number) {
        this._scrollPosition = this._clampScrollPosition(position)
        this._applyScrollPosition()
    }

    private _clampScrollPosition(position: number) {
        return Math.max(-MAX_SCROLL_POSITION, Math.min(0, position))
    }

    private _applyScrollPosition() {
        this._root?.setPosition(0, -this._scrollPosition, 0)
    }

    private _interpolateScroll(start: number, end: number, t: number) {
        const s = (time: number) => 3 * time * time - 2 * time * time * time
        const eased = s(s(t))
        return start + (end - start) * eased
    }

    private _exitScreen() {
        this.onBackToMenu?.()
    }

    private _clearIconFrames() {
        for (const frame of this._iconFrames) {
            frame.destroy()
        }
        this._iconFrames = []
    }

    onDestroy() {
        this._clearIconFrames()
    }

}
