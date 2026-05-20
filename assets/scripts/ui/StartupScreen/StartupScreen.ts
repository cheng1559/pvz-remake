import { _decorator, Color, Component, EventKeyboard, EventMouse, EventTouch, Graphics, input, Input, Mask, Node, UIOpacity, UITransform, Vec3, view, type SpriteFrame } from 'cc'
import { Animator } from '@/core/Animator'
import type { AnimNode } from '@/core/Animator/AnimNode'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { FontLoader } from '@/core/FontLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { MusicSystem } from '@/game/music/MusicSystem'
import { UIButton } from '@/ui/Button'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '@/ui/MenuScreenBase'
import { StartupResourceLoader, type StartupPreloadProgress } from '@/ui/StartupResourceLoader'

const { ccclass } = _decorator

const ORIGINAL_FPS = 100
const POPCAP_LOGO_DURATION = 200
const POPCAP_LOGO_FADE = 50
const TITLE_SCREEN_COUNTER = 100
const LOAD_BAR_WIDTH = 314
const START_BUTTON_HEIGHT = 50
const LOAD_BAR_COMPLETE_HOLD = 18
const LOAD_BAR_TRIGGER_POINTS = [0.11, 0.32, 0.54, 0.72, 0.91]
const LOADING_TEXT = 'LOADING...'
const CLICK_TO_START_TEXT = 'CLICK TO START!'
const START_BUTTON_NORMAL_COLOR = new Color(218, 184, 33)
const START_BUTTON_HOVER_COLOR = new Color(250, 90, 15)

type StartupPhase = 'logo' | 'waitingForLoader' | 'loading' | 'ready' | 'done'

@ccclass('StartupScreen')
export class StartupScreen extends Component {
    private _root: Node | null = null
    private _screenClipRoot: Node | null = null
    private _phase: StartupPhase = 'logo'
    private _frameAccumulator = 0
    private _titleAge = 0
    private _titleStateCounter = TITLE_SCREEN_COUNTER
    private _curBarWidth = 0
    private _barVel = 0.2
    private _barStartProgress = 0
    private _prevLoadingPercent = 0
    private _targetProgress = 0
    private _loadingComplete = false
    private _readyHoldCounter = 0
    private _startInputBound = false
    private _triggeredLoadBarEvents = new Set<number>()
    private _resolveLogo: (() => void) | null = null
    private _resolveStarted: (() => void) | null = null
    private _logoOpacity: UIOpacity | null = null
    private _backgroundLeft: Node | null = null
    private _backgroundRight: Node | null = null
    private _pvzLogo: Node | null = null
    private _barRoot: Node | null = null
    private _barGrassClip: Node | null = null
    private _sodRollCap: Node | null = null
    private _loadBarReanimLayer: Node | null = null
    private _loadBarReanims: { node: Node, animNode: AnimNode }[] = []
    private _startButtonNode: Node | null = null
    private _startButton: UIButton | null = null
    private _loadingLabel: Node | null = null

    async play(): Promise<void> {
        setUISize(this.node, this._screenWidth(), SCREEN_HEIGHT)
        this._resetBlackRoot('StartupScreenRoot')
        void MusicSystem.playTune('title_theme', true)
        await this._showPopCapLogo()

        const loaderAssets = StartupResourceLoader.loadStartupLoaderAssets()
        const preload = StartupResourceLoader.preloadStartup((progress) => this._onPreloadProgress(progress))

        await this._waitForLogo()
        this._phase = 'waitingForLoader'
        await loaderAssets

        await this._showLoadingScreen()
        await preload
        this._loadingComplete = true
        this._targetProgress = 1
        this._bindStartInput()
        await this._waitForStart()
        this._phase = 'done'
    }

    onDestroy() {
        this._unbindStartInput()
    }

    update(dt: number) {
        this._frameAccumulator += dt * ORIGINAL_FPS
        let ticks = Math.floor(this._frameAccumulator)
        if (ticks <= 0) return
        this._frameAccumulator -= ticks
        ticks = Math.min(ticks, 12)

        for (let i = 0; i < ticks; i++) {
            this._tick()
        }
        this._renderFrame()
    }

    private _tick() {
        this._titleAge++
        if (this._phase === 'logo') {
            this._tickLogo()
            return
        }

        if (this._phase === 'loading') {
            this._tickLoading()
        }
    }

    private _tickLogo() {
        if (this._titleAge >= POPCAP_LOGO_DURATION) {
            const resolve = this._resolveLogo
            this._resolveLogo = null
            resolve?.()
        }
    }

    private _tickLoading() {
        if (this._titleStateCounter > 0) {
            this._titleStateCounter--
            return
        }

        const loadingPercent = this._loadingPercent()
        const previousWidth = this._curBarWidth
        this._curBarWidth += this._barVel
        if (!this._loadingComplete) {
            this._curBarWidth = Math.min(this._curBarWidth, LOAD_BAR_WIDTH * 0.99)
        } else if (this._curBarWidth > LOAD_BAR_WIDTH) {
            this._curBarWidth = LOAD_BAR_WIDTH
            this._setLoadingLabel(CLICK_TO_START_TEXT)
        }

        if (loadingPercent > this._prevLoadingPercent + 0.01 || this._loadingComplete) {
            const targetWidth = this._easeIn(loadingPercent) * LOAD_BAR_WIDTH
            const diff = targetWidth - this._curBarWidth
            const acceleration = this._loadingComplete
                ? 0.0001
                : this._lerp(0.0001, 0.00001, loadingPercent)
            this._barVel += diff * Math.abs(diff) * acceleration
            this._barVel = Math.max(
                this._lerp(0.2, 0.01, loadingPercent),
                Math.min(2, this._barVel),
            )
            this._prevLoadingPercent = loadingPercent
        }

        this._triggerLoadBarEvents(previousWidth, this._curBarWidth)
        if (this._loadingComplete && this._curBarWidth >= LOAD_BAR_WIDTH) {
            this._readyHoldCounter++
            if (this._readyHoldCounter >= LOAD_BAR_COMPLETE_HOLD) {
                this._phase = 'ready'
            }
        }
    }

    private _renderFrame() {
        if (this._phase === 'logo') {
            this._renderPopCapLogo()
            return
        }
        if (this._phase !== 'loading' && this._phase !== 'ready') return

        this._renderLoadingScreen()
    }

    private _renderPopCapLogo() {
        if (!this._logoOpacity) return

        let alpha = 255
        const counter = Math.max(0, POPCAP_LOGO_DURATION - this._titleAge)
        if (counter < POPCAP_LOGO_DURATION - POPCAP_LOGO_FADE) {
            alpha = this._animateCurve(POPCAP_LOGO_FADE, 0, counter, 255, 0)
        } else {
            alpha = this._animateCurve(POPCAP_LOGO_DURATION, POPCAP_LOGO_DURATION - POPCAP_LOGO_FADE, counter, 0, 255)
        }
        this._logoOpacity.opacity = Math.max(0, Math.min(255, Math.round(alpha)))
    }

    private _renderLoadingScreen() {
        this._layoutWidescreenBackgrounds()

        const logoY = this._titleStateCounter > 60
            ? this._animateCurveInt(TITLE_SCREEN_COUNTER, 60, this._titleStateCounter, -150, 10, 'easeIn')
            : this._animateCurveInt(60, 50, this._titleStateCounter, 10, 15, 'bounce')
        this._pvzLogo?.setPosition(0, this._cppY(logoY), 0)

        const buttonY = this._titleStateCounter > 10
            ? this._animateCurveInt(60, 10, this._titleStateCounter, 650, 534, 'easeIn')
            : this._animateCurveInt(10, 0, this._titleStateCounter, 534, 529, 'bounce')
        this._layoutLoadBar(buttonY)
        this._setBarWidth(this._curBarWidth)
    }

    private _resetBlackRoot(name: string) {
        this._root?.destroy()
        this._screenClipRoot = null
        this._root = createUINode(name, {
            parent: this.node,
            layer: this.node.layer,
        })
        const screenWidth = this._screenWidth()
        const background = createUINode('BlackBackground', {
            parent: this._root,
            layer: this.node.layer,
            width: screenWidth,
            height: SCREEN_HEIGHT,
        })
        const graphics = background.addComponent(Graphics)
        graphics.fillColor = Color.BLACK
        graphics.fillRect(-screenWidth / 2, -SCREEN_HEIGHT / 2, screenWidth, SCREEN_HEIGHT)
        this._screenClipRoot = this._createScreenClipRoot(this._root)
    }

    private _createScreenClipRoot(parent: Node) {
        const clipRoot = createUINode('StartupClip', {
            parent,
            layer: this.node.layer,
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
        })
        clipRoot.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        return clipRoot
    }

    private async _showPopCapLogo() {
        const logo = await SpriteLoader.load('popcap_logo')
        this._phase = 'logo'
        this._titleAge = 0
        if (!logo || !this._screenClipRoot?.isValid) return

        const logoNode = createSpriteNode({
            name: 'PopCapLogo',
            spriteFrame: logo,
            parent: this._screenClipRoot,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0.5,
            anchorY: 0.5,
        })
        this._logoOpacity = logoNode.addComponent(UIOpacity)
        this._logoOpacity.opacity = 0
    }

    private _waitForLogo() {
        return new Promise<void>((resolve) => {
            this._resolveLogo = resolve
        })
    }

    private async _showLoadingScreen() {
        this._phase = 'loading'
        this._titleStateCounter = TITLE_SCREEN_COUNTER
        this._triggeredLoadBarEvents.clear()
        this._root?.destroy()
        this._screenClipRoot = null
        this._root = createUINode('LoadingScreenRoot', {
            parent: this.node,
            layer: this.node.layer,
        })
        this._screenClipRoot = this._createScreenClipRoot(this._root)

        const title = SpriteLoader.get('titlescreen')
        const backgroundLeft = await SpriteLoader.load('background_left')
        const backgroundRight = await SpriteLoader.load('background_right')
        const pvzLogo = SpriteLoader.get('pvz_logo')
        const dirt = SpriteLoader.get('loadbar_dirt')
        const grass = SpriteLoader.get('loadbar_grass')
        const sodRollCap = SpriteLoader.get('sodrollcap')
        if (!title || !pvzLogo || !dirt || !grass || !sodRollCap) return

        this._createWidescreenBackgrounds(backgroundLeft, backgroundRight)

        createSpriteNode({
            name: 'TitleScreen',
            spriteFrame: title,
            parent: this._screenClipRoot,
            layer: this.node.layer,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            anchorX: 0,
            anchorY: 1,
        })

        this._pvzLogo = createSpriteNode({
            name: 'PvzLogo',
            spriteFrame: pvzLogo,
            parent: this._screenClipRoot,
            layer: this.node.layer,
            x: 0,
            y: this._cppY(-150),
            anchorX: 0.5,
            anchorY: 1,
        })

        this._barRoot = createUINode('LoadBar', {
            parent: this._screenClipRoot,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: dirt.originalSize.width,
            height: dirt.originalSize.height,
        })
        createSpriteNode({
            name: 'LoadBarDirt',
            spriteFrame: dirt,
            parent: this._barRoot,
            layer: this.node.layer,
            x: 4,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })

        this._barGrassClip = createUINode('LoadBarGrassClip', {
            parent: this._barRoot,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 0,
            height: grass.originalSize.height,
            y: 18,
        })
        this._barGrassClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        createSpriteNode({
            name: 'LoadBarGrass',
            spriteFrame: grass,
            parent: this._barGrassClip,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })

        this._sodRollCap = createSpriteNode({
            name: 'SodRollCap',
            spriteFrame: sodRollCap,
            parent: this._barRoot,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
        })
        this._loadBarReanimLayer = createUINode('LoadBarReanims', {
            parent: this._screenClipRoot,
            layer: this.node.layer,
        })
        this._createStartButton()
        this._initializeLoadBarVelocity()
        this._renderLoadingScreen()
    }

    private _createWidescreenBackgrounds(left: SpriteFrame | null, right: SpriteFrame | null) {
        if (left) {
            this._backgroundLeft = createSpriteNode({
                name: 'BackgroundLeft',
                spriteFrame: left,
                parent: this._root!,
                layer: this.node.layer,
                anchorX: 1,
                anchorY: 1,
            })
        }
        if (right) {
            this._backgroundRight = createSpriteNode({
                name: 'BackgroundRight',
                spriteFrame: right,
                parent: this._root!,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
            })
        }
        this._layoutWidescreenBackgrounds()
    }

    private _createStartButton() {
        const dirt = SpriteLoader.get('loadbar_dirt')
        const x = dirt ? this._loadBarDirtX(dirt) : SCREEN_WIDTH / 2 - LOAD_BAR_WIDTH / 2
        this._startButtonNode = createUINode('StartButton', {
            parent: this._screenClipRoot!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: LOAD_BAR_WIDTH,
            height: START_BUTTON_HEIGHT,
            x: this._cppX(x),
            y: this._cppY(650),
        })
        this._startButton = this._startButtonNode.addComponent(UIButton)
        this._startButton.interactable = false
        this._startButton.rightClickTriggers = true
        this._startButton.pressOffset = new Vec3(0, 0, 0)
        this._startButton.releaseToNormalOnPressOut = true
        this._startButton.onPress = () => {
            if (this._canCompleteStartup()) {
                void SoundLoader.play(SoundEffect.ButtonClick)
            }
        }
        this._startButton.onClick = () => {
            this._completeStartup()
            this._startButton?.refreshHoverFromPointer()
        }
        this._startButton.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            this._setLabelColor(highlighted ? START_BUTTON_HOVER_COLOR : START_BUTTON_NORMAL_COLOR)
        }

        this._loadingLabel = createUINode('LoadingLabel', {
            parent: this._startButtonNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = this._loadingLabel.addComponent(FontRenderer)
        const font = FontLoader.get('briannetod16') ?? null
        if (font) renderer.setFontAssets(font)
        renderer.fontColor = START_BUTTON_NORMAL_COLOR.clone()
        renderer.string = LOADING_TEXT
        renderer.forceRebuild()
    }

    private _initializeLoadBarVelocity() {
        const currentProgress = this._targetProgress
        const estimatedTotalLoadTime = currentProgress > 0.000001
            ? this._titleAge / currentProgress
            : 3000
        const loadTime = Math.max(100, Math.min(3000, estimatedTotalLoadTime * (1 - currentProgress)))
        this._barVel = LOAD_BAR_WIDTH / loadTime
        this._barStartProgress = Math.min(currentProgress, 0.9)
        this._prevLoadingPercent = 0
    }

    private _layoutLoadBar(buttonY: number) {
        const dirt = SpriteLoader.get('loadbar_dirt')
        if (!dirt || !this._barRoot?.isValid) return

        const grassX = this._loadBarDirtX(dirt)
        const grassY = buttonY - 17
        const dirtY = grassY + 18
        this._barRoot.setPosition(this._cppX(grassX), this._cppY(dirtY), 0)
        this._barGrassClip?.setPosition(0, 18, 0)
        if (this._startButtonNode?.isValid) {
            const pos = new Vec3(this._cppX(grassX), this._cppY(buttonY), 0)
            this._startButton?.updateOriginPos(pos)
        }
        this._layoutSodRollCap()
        this._layoutLoadingLabel()
    }

    private _layoutWidescreenBackgrounds() {
        if (this._backgroundLeft?.isValid) {
            this._backgroundLeft.active = true
            this._layoutSideBackground(this._backgroundLeft, -SCREEN_WIDTH / 2)
        }
        if (this._backgroundRight?.isValid) {
            this._backgroundRight.active = true
            this._layoutSideBackground(this._backgroundRight, SCREEN_WIDTH / 2)
        }
    }

    private _layoutSideBackground(node: Node, x: number) {
        const transform = node.getComponent(UITransform)
        const height = transform?.contentSize.height ?? SCREEN_HEIGHT
        const scale = height > 0 ? SCREEN_HEIGHT / height : 1
        node.setPosition(x, SCREEN_HEIGHT / 2, 0)
        node.setScale(scale, scale, 1)
    }

    private _layoutSodRollCap() {
        if (!this._sodRollCap?.isValid) return
        const cappedWidth = Math.max(0, Math.min(LOAD_BAR_WIDTH, this._curBarWidth))
        this._sodRollCap.active = cappedWidth < LOAD_BAR_WIDTH
        if (!this._sodRollCap.active) return

        const rollLen = cappedWidth * 0.94
        const scale = this._lerp(1, 0.5, cappedWidth / LOAD_BAR_WIDTH)
        this._sodRollCap.setPosition(11 + rollLen, 35 * scale - 14, 0)
        this._sodRollCap.setScale(scale, scale, 1)
        this._sodRollCap.angle = -rollLen / 180 * 360
    }

    private _layoutLoadingLabel() {
        if (!this._loadingLabel?.isValid) return

        const renderer = this._loadingLabel.getComponent(FontRenderer)
        const font = FontLoader.get('briannetod16') ?? null
        const text = renderer?.string ?? LOADING_TEXT
        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(font?.config ?? null, text) || renderer?.contentWidth || 0
        const fontX = Math.trunc((LOAD_BAR_WIDTH - width) / 2)
        const fontY = Math.trunc((START_BUTTON_HEIGHT + metrics.ascent) / 2) - 1
        const y = -(fontY - metrics.ascent)
        this._loadingLabel.setPosition(fontX, y, 0)
    }

    private _setBarWidth(width: number) {
        const cappedWidth = Math.max(0, Math.min(LOAD_BAR_WIDTH, width))
        const transform = this._barGrassClip?.getComponent(UITransform)
        if (transform) {
            transform.setContentSize(cappedWidth, transform.contentSize.height)
        }
        this._layoutSodRollCap()
    }

    private _setLoadingLabel(text: string) {
        const renderer = this._loadingLabel?.getComponent(FontRenderer)
        if (!renderer || renderer.string === text) return

        renderer.string = text
        renderer.forceRebuild()
        this._layoutLoadingLabel()
    }

    private _triggerLoadBarEvents(previousWidth: number, currentWidth: number) {
        for (let i = 0; i < LOAD_BAR_TRIGGER_POINTS.length; i++) {
            if (this._triggeredLoadBarEvents.has(i)) continue

            const triggerWidth = LOAD_BAR_WIDTH * LOAD_BAR_TRIGGER_POINTS[i]
            if (previousWidth < triggerWidth && currentWidth >= triggerWidth) {
                this._triggeredLoadBarEvents.add(i)
                void this._spawnLoadBarReanim(i)
                void SoundLoader.play(SoundEffect.LoadingBarFlower)
                if (i === LOAD_BAR_TRIGGER_POINTS.length - 1) {
                    void SoundLoader.play(SoundEffect.LoadingBarZombie)
                }
            }
        }
    }

    private async _spawnLoadBarReanim(index: number) {
        if (!this._loadBarReanimLayer?.isValid) return

        const isZombieHead = index === LOAD_BAR_TRIGGER_POINTS.length - 1
        const animationName = isZombieHead ? 'loadbar_zombiehead' : 'loadbar_sprout'
        const animationAsset = await StartupResourceLoader.loadJson(`animations/${animationName}`)
        if (!animationAsset?.json || !this._loadBarReanimLayer?.isValid) return

        let x = LOAD_BAR_WIDTH * LOAD_BAR_TRIGGER_POINTS[index] + 225
        let y = 511
        let scaleX = 1
        let scaleY = 1
        if (index === 1 || index === 3) {
            scaleX = -1
        } else if (index === 2) {
            y -= 5
            scaleX = 1.1
            scaleY = 1.3
        } else if (index === 4) {
            x -= 20
        }

        const node = createUINode(`LoadBarReanim_${index}`, {
            parent: this._loadBarReanimLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 80,
            height: 80,
            x: this._cppX(x),
            y: this._cppY(y),
        })
        node.setScale(scaleX, scaleY, 1)

        const animator = node.addComponent(Animator)
        await animator.parseJson(animationAsset.json as Record<string, any>)
        if (!node.isValid) return

        const animNode = animator.addAnimNode('default')
        if (!animNode) {
            node.destroy()
            return
        }

        this._loadBarReanims.push({ node, animNode })
        animNode.play({
            name: 'default',
            loop: false,
            speed: this._animationRateSpeed(animNode, 'default', 18),
            keepLastFrame: true,
        })
    }

    private _loadingPercent() {
        const remainingProgress = 1 - this._barStartProgress
        if (remainingProgress <= 0) return 1

        return Math.max(0, Math.min(1, (this._targetProgress - this._barStartProgress) / remainingProgress))
    }

    private _onPreloadProgress(progress: StartupPreloadProgress) {
        this._targetProgress = progress.progress
    }

    private _bindStartInput() {
        if (this._startInputBound) return
        this._startInputBound = true
        if (this._startButton) {
            this._startButton.interactable = true
            UIButton.refreshHoverStates()
        }
        input.on(Input.EventType.KEY_DOWN, this._onStartKey, this)
        input.on(Input.EventType.MOUSE_DOWN, this._onStartPointerDown, this)
        input.on(Input.EventType.TOUCH_START, this._onStartPointerDown, this)
    }

    private _unbindStartInput(disableButton = true) {
        if (!this._startInputBound) return
        this._startInputBound = false
        if (disableButton && this._startButton) this._startButton.interactable = false
        input.off(Input.EventType.KEY_DOWN, this._onStartKey, this)
        input.off(Input.EventType.MOUSE_DOWN, this._onStartPointerDown, this)
        input.off(Input.EventType.TOUCH_START, this._onStartPointerDown, this)
    }

    private _onStartKey(_event: EventKeyboard) {
        this._completeStartupWithSound()
    }

    private _onStartPointerDown(event: EventMouse | EventTouch) {
        if (this._isStartButtonPointer(event)) return
        this._completeStartupWithSound()
    }

    private _completeStartupWithSound() {
        if (this._canCompleteStartup()) {
            void SoundLoader.play(SoundEffect.ButtonClick)
        }
        this._completeStartup()
    }

    private _isStartButtonPointer(event: EventMouse | EventTouch) {
        const transform = this._startButtonNode?.getComponent(UITransform)
        if (!transform) return false

        const uiLocation = event.getUILocation()
        const local = transform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0))
        const size = transform.contentSize
        return local.x >= 0 && local.x <= size.width && local.y <= 0 && local.y >= -size.height
    }

    private _canCompleteStartup() {
        return !!this._resolveStarted && this._loadingComplete && (this._phase === 'loading' || this._phase === 'ready')
    }

    private _completeStartup() {
        if (!this._canCompleteStartup()) return

        this._unbindStartInput(false)
        const resolve = this._resolveStarted
        this._resolveStarted = null
        resolve?.()
    }

    private _setLabelColor(color: Color) {
        const renderer = this._loadingLabel?.getComponent(FontRenderer)
        if (!renderer) return

        renderer.fontColor = color.clone()
        renderer.forceRebuild()
    }

    private _waitForStart() {
        return new Promise<void>((resolve) => {
            this._resolveStarted = resolve
        })
    }

    private _cppX(x: number) {
        return x - SCREEN_WIDTH / 2
    }

    private _cppY(y: number) {
        return SCREEN_HEIGHT / 2 - y
    }

    private _screenWidth() {
        const parentWidth = this.node.parent?.getComponent(UITransform)?.contentSize.width ?? 0
        const visibleSize = view.getVisibleSize()
        return Math.max(SCREEN_WIDTH, parentWidth, visibleSize.width)
    }

    private _loadBarDirtX(dirt: SpriteFrame) {
        return Math.trunc(SCREEN_WIDTH / 2) - Math.trunc(dirt.originalSize.width / 2)
    }

    private _animateCurve(
        begin: number,
        end: number,
        counter: number,
        from: number,
        to: number,
        curve: 'linear' | 'easeIn' | 'bounce' = 'linear',
    ) {
        const denominator = begin - end
        const rawT = denominator === 0 ? 1 : (begin - counter) / denominator
        const t = Math.max(0, Math.min(1, rawT))
        if (curve === 'easeIn') return this._lerp(from, to, this._easeIn(t))
        if (curve === 'bounce') return this._lerp(from, to, this._bounce(t))
        return this._lerp(from, to, t)
    }

    private _animateCurveInt(
        begin: number,
        end: number,
        counter: number,
        from: number,
        to: number,
        curve: 'linear' | 'easeIn' | 'bounce' = 'linear',
    ) {
        return this._roundPvzInt(this._animateCurve(begin, end, counter, from, to, curve))
    }

    private _roundPvzInt(value: number) {
        return value > 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5)
    }

    private _easeIn(t: number) {
        return t * t
    }

    private _bounce(t: number) {
        return 1 - Math.abs(2 * t - 1)
    }

    private _lerp(start: number, end: number, t: number) {
        return start + (end - start) * t
    }

    private _animationRateSpeed(node: AnimNode, animationName: string, animRate: number) {
        const fps = node.getAnimationFps(animationName) ?? 12
        return fps > 0 ? animRate / fps : 0
    }
}
