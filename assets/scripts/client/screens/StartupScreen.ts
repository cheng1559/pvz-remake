import { _decorator, Button, Color, Component, input, Input, Mask, Node, Sprite, UITransform, type EventKeyboard, type EventMouse, type EventTouch, type UIOpacity } from 'cc'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { FontMetricsUtil } from '@/client/font'
import { MusicSystem } from '@/client/music/MusicSystem'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { SpriteLoader } from '@/core/SpriteLoader'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { UIHoverManager } from '@/client/input/UIHoverManager'

const { ccclass } = _decorator
const BAR_WIDTH = 314
const TRIGGERS = [0.11, 0.32, 0.54, 0.72, 0.91]
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
    private phase: 'logo' | 'loading' | 'done' | 'failed' = 'logo'
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

    async initialize(showLogo: boolean, preload: Preload): Promise<void> {
        this.preload = preload
        this.age = showLogo ? 0 : 200
        const background = uiNode({ parent: this.node, size: { width: 800, height: 600 }, graphics: true })
        background.graphics!.fillColor = Color.BLACK
        background.graphics!.fillRect(-400, -300, 800, 600)
        this.content = uiNode({ parent: this.node, position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 } }).node
        if (!showLogo) return
        const frame = await SpriteLoader.load('popcap_logo')
        if (!frame) throw new Error('Missing PopCap logo')
        if (!this.node?.isValid) return
        const logo = uiNode({
            name: 'PopCapLogo', parent: this.content, position: { x: 400, y: -300 },
            size: { width: frame.originalSize.width, height: frame.originalSize.height },
            sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM, trim: false }, opacity: 0,
        })
        this.logo = logo.node
        this.logoOpacity = logo.opacity
    }

    show(): void {
        if (this.started) return
        this.started = true
        // Let the menu commit first, including disposing any menu behind a returned title page.
        void Promise.resolve().then(async () => {
            if (!this.node?.isValid) return
            void MusicSystem.playTune('title_theme', true)
            await Promise.all([
                this.loadTitle(),
                this.preload(progress => { this.progress = progress }),
            ])
            if (!this.node?.isValid) return
            this.progress = 1
            this.complete = true
            if (this.phase === 'loading') this.startButton.interactable = true
        }).catch(error => {
            if (!this.node?.isValid) return
            this.phase = 'failed'
            this.ui?.label(this.content, { text: String(error), x: 50, y: 450, width: 700, align: 'center' })
            console.error('[StartupScreen] Failed to load', error)
        })
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
        const loader = new ClientContentLoader()
        const names = ['titlescreen', 'pvz_logo', 'loadbar_dirt', 'loadbar_grass', 'sodrollcap']
        const [ui, frames, manifest] = await Promise.all([
            UI.load(), Promise.all(names.map(async name => {
                const frame = await SpriteLoader.load(name)
                if (!frame) throw new Error(`Missing startup image: ${name}`)
                return frame
            })), loader.loadManifest(),
            MusicSystem.preloadTune('title_theme'),
            SoundLoader.load(SoundEffect.LoadingBarFlower), SoundLoader.load(SoundEffect.LoadingBarZombie),
        ])
        if (!this.node?.isValid) return
        this.ui = ui
        const registry = new ContentRegistry()
        registry.register(manifest)
        registry.freeze()
        const title = uiNode({ name: 'LoadingScreen', parent: this.content, active: false }).node
        const [background, logo, dirt, grass, roll] = frames
        ui.image(title, background)
        this.pvzLogo = ui.image(title, logo, { x: (800 - logo.originalSize.width) / 2, y: -150 }).node
        this.grassX = 400 - Math.trunc(dirt.originalSize.width / 2)
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
        await Promise.all(TRIGGERS.map(async (trigger, index) => {
            const node = uiNode({
                name: `LoadBarEffect-${index}`, parent: effects, active: false,
                position: { x: BAR_WIDTH * trigger + 225 - (index === 4 ? 20 : 0), y: index === 2 ? -506 : -511 },
            }).node
            node.setScale(index === 1 || index === 3 ? -1 : index === 2 ? 1.1 : 1, index === 2 ? 1.3 : 1, 1)
            const player = node.addComponent(ReanimPlayer)
            await player.load(index === 4 ? 'pvz:loadbar_zombiehead' : 'pvz:loadbar_sprout', registry, loader)
            this.effects[index] = player
        }))
        if (!this.node?.isValid) return
        const buttonNode = uiNode({
            name: 'ClickToStart', parent: title, active: false, anchor: { x: 0, y: 1 }, size: { width: BAR_WIDTH, height: 50 },
        }).node
        this.startButton = buttonNode.addComponent(UIButton)
        this.startButton.interactable = false
        this.startButton.releaseToNormalOnPressOut = true
        this.startButton.onPress = () => { void SoundLoader.play(SoundEffect.ButtonClick) }
        this.startButton.onClick = () => this.tryStart(false)
        buttonNode.on(Button.EventType.CLICK, () => this.startButton.onClick())
        this.label = ui.label(buttonNode, { text: ui.text('LOADING', 'Loading...'), font: 'profile', color: NORMAL_COLOR })
        this.startButton.onStateChange = state => {
            this.label.renderer.fontColor = state === 'hover' || state === 'pressed' ? HOVER_COLOR : NORMAL_COLOR
        }
        buttonNode.active = true
        this.title = title
    }

    protected update(dt: number): void {
        this.ticks += gameClock.delta(dt) * 100
        while (this.ticks >= 1) {
            this.ticks--
            this.tick()
        }
        this.render()
    }

    private tick(): void {
        if (this.phase === 'done' || this.phase === 'failed') return
        this.age++
        if (this.phase === 'logo') {
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
            player.play({ loop: false, rate: 18 / 12, timeSeconds: 0, hideOnFinish: false })
            void SoundLoader.play(SoundEffect.LoadingBarFlower)
            if (index === 4) void SoundLoader.play(SoundEffect.LoadingBarZombie)
        })
        if (this.width >= BAR_WIDTH && this.label.text !== this.ui!.text('CLICK_TO_START')) this.label.text = this.ui!.text('CLICK_TO_START')
    }

    private render(): void {
        if (this.phase === 'logo') {
            if (this.logoOpacity) this.logoOpacity.opacity = Math.round(255 * Math.max(0, Math.min(1, this.age / 50, (200 - this.age) / 50)))
            return
        }
        if (this.phase !== 'loading') return
        const logoY = this.titleCounter > 60 ? curve(100, 60, this.titleCounter, -150, 10)
            : curve(60, 50, this.titleCounter, 10, 15, true)
        this.pvzLogo.setPosition(this.pvzLogo.position.x, -logoY)
        const buttonY = this.titleCounter > 10 ? curve(60, 10, this.titleCounter, 650, 534)
            : curve(10, 0, this.titleCounter, 534, 529, true)
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
        if (this.phase !== 'loading' || !this.complete) return
        this.phase = 'done'
        if (playSound) void SoundLoader.play(SoundEffect.ButtonClick)
        this.onStart()
    }
}

function curve(begin: number, end: number, counter: number, from: number, to: number, bounce = false): number {
    const t = Math.max(0, Math.min(1, (begin - counter) / (begin - end)))
    const value = from + (to - from) * (bounce ? 1 - Math.abs(2 * t - 1) : t * t)
    return Math.trunc(value + (value > 0 ? 0.5 : -0.5))
}
