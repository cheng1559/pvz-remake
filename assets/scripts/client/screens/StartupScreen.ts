import { modFaults } from '@/shared/mod/ModHost'
import { prepareClips, showClip } from '@/client/reanim/clips'
import { modResources } from '@/client/content/ModResources'
import { modManager } from '@/client/content/ModManager'
import { waitForPreloadFrame } from '@/client/content/preloadTasks'
import { _decorator, Color, Component, input, Input, Mask, Node, Sprite, UITransform, type EventKeyboard, type EventMouse, type EventTouch, type UIOpacity } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import { MusicSystem } from '@/client/music/MusicSystem'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { animateCurve } from '@/shared/content/animation'

const { ccclass } = _decorator
const BAR_WIDTH = 314
/** TitleScreen::Update: 0.906 in 1.0.0.1051, 1.2.0.1073 and 1.2.0.1096 (PvZ-Portable has 0.91). */
const TRIGGERS = [0.11, 0.32, 0.54, 0.72, 0.906]
const LOAD_BAR_CLIPS = {
    sprout: { reanimId: 'pvz:loadbar_sprout', fps: 18, hold: true },
    zombie: { reanimId: 'pvz:loadbar_zombiehead', fps: 18, hold: true },
} as const
const NORMAL_COLOR = new Color(218, 184, 33)
const HOVER_COLOR = new Color(250, 90, 15)
type Preload = (onProgress: (progress: number) => void) => Promise<void>

@ccclass('StartupScreen')
export class StartupScreen extends Component {
    onStart: () => void = () => {}
    private preload!: Preload
    private ui?: UI
    private content!: Node
    private logo?: Node
    private logoOpacity?: UIOpacity
    private title?: Node
    private pvzLogo!: Node
    private bar!: Node
    private grass!: UITransform
    private roll!: Node
    private startButton!: UIButton
    private label!: UILabel
    private effects: ReanimPlayer[] = []
    private phase: 'logo' | 'loading' | 'done' = 'logo'
    private age = 0
    private ticks = 0
    private titleCounter = 100
    private progress = 0
    private startProgress = 0
    private previousProgress = 0
    private width = 0
    private velocity = 0.2
    private complete = false
    private started = false
    private grassX = 0
    private applyingMods = false
    private retryMods?: () => void

    async initialize(showLogo: boolean, preload: Preload): Promise<void> {
        this.preload = preload
        this.applyingMods = modManager.hasPendingChanges()
        showLogo ||= this.applyingMods
        this.age = showLogo ? 0 : 200
        // Cover the whole viewport: menu pages are prepared and drawn once behind this screen.
        const background = uiNode({ parent: this.node, graphics: true, viewport: true })
        const fill = () => {
            const { width, height } = background.transform.contentSize
            background.graphics!.clear()
            background.graphics!.fillColor = Color.BLACK
            background.graphics!.fillRect(-width / 2, -height / 2, width, height)
        }
        background.node.on(Node.EventType.SIZE_CHANGED, fill)
        fill()
        this.content = uiNode({ parent: this.node, position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 } }).node
        if (!showLogo) return
        const frame = this.applyingMods
            ? await modResources.baseSprite('pvz:popcap_logo')
            : await modResources.sprite('pvz:popcap_logo')
        if (!this.node?.isValid) return
        const logo = uiNode({
            name: 'PopCapLogo', parent: this.content, position: { x: 400, y: -300 },
            size: { width: frame.originalSize.width, height: frame.originalSize.height },
            sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM, trim: false }, opacity: 0,
        })
        this.logo = logo.node
        this.logoOpacity = logo.opacity
    }

    async show(): Promise<void> {
        if (this.started) return
        this.started = true
        // Let the menu commit first, including disposing any menu behind a returned title page.
        await Promise.resolve()
        if (!this.node?.isValid) return
        while (this.applyingMods && this.age < 50 && this.node?.isValid && !modFaults.current) await waitForPreloadFrame()
        if (modFaults.current) return
        while (this.applyingMods && this.node?.isValid) {
            try {
                await modManager.applyPendingChanges(waitForPreloadFrame)
                break
            } catch (error) {
                console.error('[Mods] Pending changes failed', error)
                await new Promise<void>(resolve => { this.retryMods = resolve })
            }
        }
        if (!this.node?.isValid) return
        // The logo waits only for Mod installation; loading continues on the title screen.
        this.applyingMods = false
        void MusicSystem.playTune('title_theme', true)
        await Promise.all([
            this.loadTitle(),
            this.preload(progress => { this.progress = progress }),
        ])
        if (!this.node?.isValid || modFaults.current) return
        this.progress = 1
        this.complete = true
        if (this.phase === 'loading') this.startButton.interactable = true
    }

    onEnable(): void {
        input.on(Input.EventType.KEY_DOWN, this.keyDown, this)
        this.node.on(Node.EventType.MOUSE_DOWN, this.pointerDown, this)
        this.node.on(Node.EventType.TOUCH_START, this.touchStart, this)
    }

    onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this.keyDown, this)
        this.node.off(Node.EventType.MOUSE_DOWN, this.pointerDown, this)
        this.node.off(Node.EventType.TOUCH_START, this.touchStart, this)
    }

    private async loadTitle(): Promise<void> {
        const names = ['pvz:titlescreen', 'pvz:pvz_logo', 'pvz:loadbar_dirt', 'pvz:loadbar_grass', 'pvz:sodrollcap']
        const [ui, frames] = await Promise.all([
            UI.load(), Promise.all(names.map(name => modResources.sprite(name))),
            MusicSystem.preloadTune('title_theme'),
            SoundSystem.load(SoundEffect.LoadingBarFlower), SoundSystem.load(SoundEffect.LoadingBarZombie),
        ])
        if (!this.node?.isValid || modFaults.current) return
        this.ui = ui
        const title = uiNode({ name: 'LoadingScreen', parent: this.content, active: false }).node
        const [background, logo, dirt, grass, roll] = frames
        ui.image(title, background)
        this.pvzLogo = ui.image(title, logo, { x: (800 - logo.originalSize.width) / 2, y: -150 }).node
        // TitleScreen::Update: (mWidth - IMAGE_LOADBAR_DIRT->mWidth) / 2, an integer division (239 for 321).
        this.grassX = Math.trunc((800 - dirt.originalSize.width) / 2)
        this.bar = uiNode({ name: 'LoadBar', parent: title, anchor: { x: 0, y: 1 } }).node
        ui.image(this.bar, dirt, { x: 4 })
        const clip = uiNode({
            name: 'GrassClip', parent: this.bar, position: { y: 18 }, anchor: { x: 0, y: 1 },
            size: { width: 0, height: grass.originalSize.height }, mask: Mask.Type.GRAPHICS_RECT,
        })
        this.grass = clip.transform
        ui.image(clip.node, grass)
        this.roll = ui.image(this.bar, roll).node
        this.roll.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5)
        const effects = uiNode({ name: 'LoadBarEffects', parent: title }).node
        await prepareClips(Object.values(LOAD_BAR_CLIPS))
        if (!this.node?.isValid) return
        TRIGGERS.forEach((trigger, index) => {
            const node = uiNode({
                name: `LoadBarEffect-${index}`, parent: effects,
                position: { x: BAR_WIDTH * trigger + 225 - (index === 4 ? 20 : 0), y: index === 2 ? -506 : -511 },
            }).node
            node.setScale(index === 1 || index === 3 ? -1 : index === 2 ? 1.1 : 1, index === 2 ? 1.3 : 1, 1)
            const player = uiNode({ name: 'Animation', parent: node, active: false }).node.addComponent(ReanimPlayer)
            this.effects[index] = player
        })
        if (!this.node?.isValid) return
        const buttonNode = uiNode({
            name: 'ClickToStart', parent: title, active: false, anchor: { x: 0, y: 1 }, size: { width: BAR_WIDTH, height: 50 },
        }).node
        this.startButton = buttonNode.addComponent(UIButton)
        this.startButton.interactable = false
        this.startButton.releaseToNormalOnPressOut = true
        this.startButton.pressSound = SoundEffect.ButtonClick
        this.startButton.onClick = () => this.tryStart(false)
        this.label = ui.label(buttonNode, { text: ui.text('LOADING'), font: 'profile', color: NORMAL_COLOR })
        this.startButton.onStateChange = state => {
            this.label.renderer.fontColor = state === 'hover' || state === 'pressed' ? HOVER_COLOR : NORMAL_COLOR
        }
        buttonNode.active = true
        this.title = title
    }

    protected update(dt: number): void {
        if (modFaults.current) return
        this.ticks += gameClock.delta(dt) * 100
        while (this.ticks >= 1) {
            this.ticks--
            this.tick()
        }
        this.render()
    }

    private tick(): void {
        if (this.phase === 'done') return
        this.age++
        if (this.phase === 'logo') {
            if (this.applyingMods) { this.age = Math.min(this.age, 100); return }
            if (this.age < 200 || !this.title) return
            if (this.logo) this.logo.active = false
            this.title.active = true
            this.phase = 'loading'
            this.startProgress = Math.min(this.progress, 0.9)
            const estimate = this.progress > 0.000001 ? this.age / this.progress : 3000
            this.velocity = BAR_WIDTH / Math.max(100, Math.min(3000, estimate * (1 - this.progress)))
            this.startButton.interactable = this.complete
            return
        }
        if (this.titleCounter > 0) { this.titleCounter--; return }
        const progress = Math.max(0, Math.min(1, (this.progress - this.startProgress) / (1 - this.startProgress)))
        const previous = this.width
        this.width = Math.min(this.complete ? BAR_WIDTH : BAR_WIDTH * Math.min(0.99, progress + 0.05), this.width + this.velocity)
        if (progress > this.previousProgress + 0.01 || this.complete) {
            const diff = progress * progress * BAR_WIDTH - this.width
            this.velocity += diff * Math.abs(diff) * (this.complete ? 0.0001 : 0.0001 - progress * 0.00009)
            this.velocity = Math.max(0.05 - progress * 0.04, Math.min(2, this.velocity))
            this.previousProgress = progress
        }
        TRIGGERS.forEach((trigger, index) => {
            if (previous >= BAR_WIDTH * trigger || this.width < BAR_WIDTH * trigger) return
            const player = this.effects[index]
            player.node.active = true
            // TitleScreen::Update plays a sprout at 18 frames a second; the screen is up before the presentation is.
            showClip(player, index === 4 ? LOAD_BAR_CLIPS.zombie : LOAD_BAR_CLIPS.sprout)
            void SoundSystem.play(SoundEffect.LoadingBarFlower)
            if (index === 4) void SoundSystem.play(SoundEffect.LoadingBarZombie)
        })
        if (this.width >= BAR_WIDTH && this.label.text !== this.ui!.text('CLICK_TO_START')) this.label.text = this.ui!.text('CLICK_TO_START')
    }

    private render(): void {
        if (this.phase === 'logo') {
            if (this.logoOpacity) this.logoOpacity.opacity = Math.round(255 * Math.max(0, Math.min(1, this.age / 50, (200 - this.age) / 50)))
            return
        }
        if (this.phase !== 'loading') return
        const logoY = this.titleCounter > 60 ? animateCurve(100, 60, this.titleCounter, -150, 10, 'ease-in')
            : animateCurve(60, 50, this.titleCounter, 10, 15, 'bounce')
        this.pvzLogo.setPosition(this.pvzLogo.position.x, -logoY)
        const buttonY = this.titleCounter > 10 ? animateCurve(60, 10, this.titleCounter, 650, 534, 'ease-in')
            : animateCurve(10, 0, this.titleCounter, 534, 529, 'bounce')
        this.bar.setPosition(this.grassX, -(buttonY + 1))
        this.startButton.node.setPosition(this.grassX, -buttonY)
        this.grass.setContentSize(this.width, this.grass.height)
        this.roll.active = this.width < BAR_WIDTH
        const length = this.width * 0.94
        const scale = 1 - 0.5 * this.width / BAR_WIDTH
        this.roll.setPosition(11 + length, 35 * scale - 14)
        this.roll.setScale(scale, scale, 1)
        this.roll.angle = -length / 180 * 360
        const font = this.ui!.assets.fonts.profile.config
        const ascent = FontMetricsUtil.getMetrics(font).ascent
        const textWidth = FontMetricsUtil.measureTextWidth(font, this.label.text)
        this.label.node.setPosition(Math.trunc((BAR_WIDTH - textWidth) / 2), ascent + 1 - Math.trunc((50 + ascent) / 2))
    }

    private pointerDown(event: EventMouse): void {
        if (!GameDebugSettings.isMobileMode()) this.backgroundPress(event)
    }

    private keyDown(event: EventKeyboard): void {
        if (!event.propagationStopped && !UIHoverManager.isModalBlocked) this.tryStart()
    }

    private touchStart(event: EventTouch): void {
        if (GameDebugSettings.isMobileMode()) this.backgroundPress(event)
    }

    private backgroundPress(event: EventMouse | EventTouch): void {
        event.propagationStopped = true
        this.tryStart()
    }

    private tryStart(playSound = true): void {
        if (modFaults.current) return
        if (this.retryMods) {
            const retry = this.retryMods
            this.retryMods = undefined
            retry()
            return
        }
        if (this.phase !== 'loading' || !this.complete) return
        this.phase = 'done'
        if (playSound) void SoundSystem.play(SoundEffect.ButtonClick)
        this.onStart()
    }
}
