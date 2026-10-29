import { modResources } from '@/client/content/ModResources'
import { _decorator, Color, Component, director, Director, Mask, Node, Sprite, SpriteFrame } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { UserView } from '@/shared/menu'
import { loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { preloadTasks } from '@/client/content/preloadTasks'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { MusicSystem } from '@/client/music/MusicSystem'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import type { MainMenuButtonDefinition, MainMenuDefinition } from '@/shared/content/presentation'
import type { MenuAction } from './MenuPages'

const { ccclass } = _decorator
const random = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum)

interface TrackedButton {
    config: MainMenuButtonDefinition
    button: UIButton
    pressed: boolean
}

@ccclass('MainMenuScreen')
export class MainMenuScreen extends Component {
    onNavigate: (action: MenuAction) => void | Promise<void> = () => {}
    private ui!: UI
    private frames = new Map<string, SpriteFrame>()
    private open!: ReanimPlayer
    private sign!: ReanimPlayer
    private current!: ReanimPlayer
    private grass!: ReanimPlayer
    private flowers: ReanimPlayer[] = []
    private clouds: { player: ReanimPlayer, delay: number }[] = []
    private hand: ReanimPlayer[] = []
    private buttonsRoot!: Node
    private numbersRoot!: Node
    private signsRoot!: Node
    private profileLabel!: UILabel
    private buttons: TrackedButton[] = []
    private flowerButtons: UIButton[] = []
    private playedFlowers = new Set<ReanimPlayer>()
    private user: UserView | null = null
    private ready = false
    private background!: Sprite
    private opened = false
    private entrancePending = true
    private startAdventure = true
    private grassDelay = 0.5
    private startingSeconds: number | null = null
    private laughPlayed = false
    private menu!: MainMenuDefinition

    async initialize(ui: UI, onProgress: (progress: number) => void = () => {}): Promise<void> {
        this.ui = ui
        const { content: game } = await loadEntityDisplayAssets()
        const { registry, loader } = game
        const menu = this.menu = game.presentation.mainMenu
        const imageNames = new Set([
            ...menu.buttons.flatMap(button => [button.image, button.highlight]), ...menu.images,
            menu.startAdventure.image, menu.startAdventure.highlight,
        ])
        const total = imageNames.size + menu.clouds.length + menu.flowers.length + 5
        let completed = 0
        const report = () => onProgress(++completed / total)
        await Promise.all([...imageNames].map(async name => {
            const frame = await modResources.asset(name, SpriteFrame)
            if (!frame) throw new Error(`Missing main menu image: ${name}`)
            this.frames.set(name, frame)
            report()
        }))
        if (!this.node.isValid) return
        const content = uiNode({ name: 'Selector', parent: this.node, anchor: { x: 0, y: 1 }, position: { x: -400, y: 300 } }).node
        this.background = ui.image(content, this.frames.get('selectorscreen_bg')!, { width: 800, height: 600 })
        const pending: (() => Promise<void>)[] = []
        const player = (name: string, parent = content): ReanimPlayer => {
            const animation = uiNode({ name, parent, anchor: { x: 0, y: 1 } }).node.addComponent(ReanimPlayer)
            pending.push(() => animation.load(`pvz:selector_${name}`, registry, loader).then(report))
            return animation
        }
        this.clouds = menu.clouds.map(name => ({ player: player(name), delay: 0 }))
        this.open = player('open')
        this.sign = player('sign')
        this.grass = player('grass')
        this.flowers = menu.flowers.map((_, index) => player(`flower${index + 1}`))
        const clip = uiNode({ name: 'HandClip', parent: content, anchor: { x: 0, y: 1 }, size: { width: 800, height: 560 }, mask: Mask.Type.GRAPHICS_RECT }).node
        this.hand = [player('zombie_hand', clip), player('zombie_hand')]
        await preloadTasks(pending)
        if (!this.node.isValid) return
        this.current = this.open
        this.sign.node.active = false
        for (const animation of [this.open, this.sign]) {
            // Only the sky is separate; the moving foreground (SelectorScreen_BG_Center/Left/Right) stays in its original track order.
            animation.setTracksVisible([menu.tracks.sky, ...menu.tracks.replaced], false)
            animation.setTracksVisible(menu.buttons.filter(button => button.replace).map(button => button.track), false)
            animation.setTracksVisible([menu.startAdventure.track], false)
        }
        this.hand.forEach((animation, index) => {
            animation.node.setPosition(-70, -10)
            // The clipped hand draws everything but the rocks; the second player draws only the rocks.
            const rocks = menu.tracks.handRocks
            animation.setTracksVisible(index === 1 ? animation.trackIds.filter(id => !rocks.includes(id)) : rocks, false)
            animation.hide()
        })
        this.signsRoot = uiNode({ name: 'Signs', parent: content, anchor: { x: 0, y: 1 }, active: false }).node
        const signTrack = this.sign.getTrackNode(menu.tracks.profileSign)!
        signTrack.parent = this.signsRoot
        this.profileLabel = ui.label(signTrack, {
            text: '', font: 'profile', color: new Color(255, 245, 200), align: 'center', baseline: true,
            x: 148.5, y: 110.5,
        })
        this.buttonsRoot = uiNode({ name: 'Buttons', parent: content, anchor: { x: 0, y: 1 } }).node
        this.numbersRoot = uiNode({ name: 'LevelNumbers', parent: content, anchor: { x: 0, y: 1 } }).node
        // Match the original draw order; flower clips 1/2/3 contain tracks 3/2/1.
        const layers = [
            ...this.clouds.map(cloud => cloud.player.node), this.open.node, this.sign.node,
            this.buttonsRoot, clip, this.hand[1].node, this.numbersRoot, this.grass.node,
            ...[...this.flowers].reverse().map(flower => flower.node), this.signsRoot,
        ]
        layers.forEach((layer, index) => layer.setSiblingIndex(index + 1))
        this.user = await menuApi.getCurrentUser()
        if (!this.node.isValid) return
        if (!this.node.isValid) return
        this.refreshButtons()
        this.ready = true
    }

    show(): void {
        if (!this.ready) return
        this.startingSeconds = null
        for (const hand of this.hand) hand.hide()
        void MusicSystem.playTune('title_theme')
        if (this.opened) {
            this.setButtonsEnabled(true)
            this.setAdventureShade(255)
            this.syncPositions()
            return
        }
        // Let activation, old-page disposal and first-draw setup finish before starting the clock.
        director.off(Director.EVENT_AFTER_DRAW, this.queueEntrance, this)
        director.off(Director.EVENT_AFTER_UPDATE, this.playEntrance, this)
        director.once(Director.EVENT_AFTER_DRAW, this.queueEntrance, this)
    }

    private queueEntrance(): void {
        director.once(Director.EVENT_AFTER_UPDATE, this.playEntrance, this)
    }

    private playEntrance(): void {
        if (!this.node?.isValid || !this.node.activeInHierarchy) return
        this.entrancePending = false
        void SoundSystem.play(SoundEffect.RollIn)
        for (const cloud of this.clouds) {
            const delay = random(-60, 20)
            if (delay <= 0) this.playCloud(cloud, -delay / 60 * (cloud.player.durationSeconds - 1 / 20))
            else {
                cloud.player.play({ loop: false, hideOnFinish: false, timeSeconds: 0 })
                cloud.player.pause()
                cloud.delay = delay
            }
        }
        this.open.play({ loop: false, rate: 30 / 20, hideOnFinish: false, timeSeconds: 0, onFinish: () => {
            this.opened = true
            this.open.node.active = false
            this.sign.node.active = true
            this.signsRoot.active = true
            this.current = this.sign
            this.sign.play({ loop: false, rate: 30 / 20, hideOnFinish: false, timeSeconds: 0 })
            this.setButtonsEnabled(true)
            this.syncPositions()
        } })
    }

    async refreshProfile(): Promise<void> {
        const user = await menuApi.getCurrentUser()
        if (!this.ready || !this.node.isValid) return
        this.user = user
        this.refreshButtons()
    }

    private refreshButtons(): void {
        for (const child of [
            ...this.buttons.map(view => view.button.node), ...this.flowerButtons.map(button => button.node),
            ...this.numbersRoot.children,
        ]) {
            child.active = false
            child.destroy()
        }
        this.buttons = []
        this.flowerButtons = []
        const profile = this.user
        // The original DrawOverlay skips grass and flowers until a player exists; their clocks still run.
        for (const animation of [this.grass, ...this.flowers]) animation.setTracksVisible(animation.trackIds, profile !== null)
        const level = profile?.adventureLevel ?? 1
        this.startAdventure = level <= 1 && (profile?.finishedAdventure ?? 0) === 0
        this.profileLabel.text = profile ? `${profile.name}!` : ''
        for (const animation of [this.open, this.sign]) {
            animation.setTracksVisible([this.menu.startAdventure.adventureShadow], !this.startAdventure)
            animation.setTracksVisible([this.menu.startAdventure.shadow], this.startAdventure)
        }
        const start = this.menu.startAdventure
        for (const original of this.menu.buttons) {
            const config = original.name === 'adventure' && this.startAdventure
                ? { ...original, track: start.track, image: start.image, highlight: start.highlight } : original
            const normal = this.frames.get(config.image)!
            const hover = this.frames.get(config.highlight)!
            const parent = config.sign ? this.signsRoot : this.buttonsRoot
            const button = this.ui.button(parent, {
                images: { normal, hover }, width: config.width, height: config.height,
                imageBox: { x: config.imageX, y: config.imageY, width: normal.originalSize.width, height: normal.originalSize.height },
                polygon: config.polygon, pressOffset: config.sign ? [0, 0] : [1, 1],
                refreshHoverOnEnable: false,
                pressSound: config.mode ? SoundEffect.GraveButton : SoundEffect.Tap, hoverSound: SoundEffect.Bleep,
                onClick: () => this.activate(config),
            })
            button.node.name = config.name
            const tracked = { config, button, pressed: false }
            const changeState = button.onStateChange!
            button.onStateChange = state => { tracked.pressed = state === 'pressed'; changeState(state) }
            this.buttons.push(tracked)
        }
        this.menu.flowers.forEach((center, index) => {
            const node = uiNode({ name: `Flower-${index + 1}`, parent: this.buttonsRoot, anchor: { x: 0, y: 1 }, size: { width: 40, height: 40 }, position: { x: center.x - 20, y: 20 - center.y } }).node
            node.active = false
            const button = node.addComponent(UIButton)
            button.refreshHoverOnEnable = false
            button.changeCursor = false
            button.touchSlide = false
            const flower = this.flowers[index]
            button.canInteract = () => !this.playedFlowers.has(flower)
            button.polygon = Array.from({ length: 12 }, (_, point) => {
                const angle = point * Math.PI / 6
                return [20 + Math.cos(angle) * 20, 20 + Math.sin(angle) * 20] as const
            })
            button.onPress = () => {
                this.playedFlowers.add(flower)
                void SoundSystem.playFoley(SoundEffect.LimbsPop, 10)
                flower.play({ loop: false, rate: 24 / 20, timeSeconds: 0, hideOnFinish: false })
            }
            this.flowerButtons.push(button)
            node.active = profile !== null
        })
        if (!this.startAdventure) {
            const stage = Math.min(6, Math.floor((level - 1) / 10) + 1)
            const sub = level - (stage - 1) * 10
            const atlas = this.frames.get('selectorscreen_levelnumbers')!
            const digit = (value: number, x: number, y: number) => this.ui.image(this.numbersRoot, getAtlasFrame(atlas, value, 12, 17, 10), { x, y })
            digit(stage, 486 + (stage === 4 ? -1 : 0), 47 + (stage === 1 ? 1 : 0))
            digit(sub === 10 ? 1 : sub, 509 + (sub === 3 ? -1 : 0), 50)
            if (sub === 10) digit(0, 518, 51)
        }
        this.setButtonsEnabled(this.opened)
        this.syncPositions()
    }

    private setButtonsEnabled(enabled: boolean): void {
        // Disable input without applying the disabled skin during the entrance/launch animation.
        for (const { button } of this.buttons) button.enabled = enabled
        for (const button of this.flowerButtons) button.enabled = enabled
    }

    private syncPositions(): void {
        for (const { config, button } of this.buttons) {
            const track = this.current.getTrackNode(config.track)
            button.node.active = !!track?.getComponent(Sprite)?.enabled
            if (track) button.node.setPosition(track.position.x + (config.x ?? 0), track.position.y - (config.y ?? 0))
        }
        const right = this.current.getTrackNode(this.menu.tracks.anchor)!
        for (const animation of [this.grass, ...this.flowers]) animation.node.setPosition(right.position.x - 71, right.position.y + 41)
        const offset = this.buttons.find(view => view.config.name === 'adventure')?.pressed ? 1 : 0
        this.numbersRoot.setPosition(right.position.x + offset, right.position.y - offset)
    }

    private activate(config: MainMenuButtonDefinition): void {
        if (config.name === 'adventure') {
            if (this.startingSeconds !== null) return
            this.setButtonsEnabled(false)
            for (const button of this.flowerButtons) button.enabled = true
            this.startingSeconds = 0
            this.laughPlayed = false
            MusicSystem.stop()
            void SoundSystem.playSfx(SoundEffect.LoseMusic)
            void SoundSystem.playFoley(SoundEffect.DirtRise)
            for (const hand of this.hand) hand.play({ loop: false, timeSeconds: 0, hideOnFinish: false })
        } else if (config.target) void this.onNavigate(config.target as MenuAction)
        else this.ui.dialog(this.node, { title: this.ui.text('ZOMBATAR_UNAVAILABLE_HEADER'), message: this.ui.text('ZOMBATAR_UNAVAILABLE_BODY') })
    }

    private playCloud(cloud: { player: ReanimPlayer, delay: number }, timeSeconds = 0): void {
        cloud.delay = 0
        cloud.player.play({ loop: false, rate: 0.5 / 20, timeSeconds, hideOnFinish: false, onFinish: () => { cloud.delay = random(20, 40) } })
    }

    private setAdventureShade(shade: number): void {
        const adventure = this.buttons.find(view => view.config.name === 'adventure')
        for (const node of [adventure?.button.node, this.numbersRoot]) {
            for (const sprite of node?.getComponentsInChildren(Sprite) ?? []) sprite.color = new Color(shade, shade, shade)
        }
    }

    protected lateUpdate(dt: number): void {
        if (!this.ready || this.entrancePending) return
        dt = gameClock.delta(dt)
        this.syncPositions()
        for (const cloud of this.clouds) {
            if (cloud.delay <= 0) continue
            cloud.delay -= dt
            if (cloud.delay <= 0) this.playCloud(cloud)
        }
        if ((this.grassDelay -= dt) <= 0) {
            this.grass.blendFrom(this.grass, 0.2)
            this.grass.play({ loop: true, rate: random(3, 12) / 20, timeSeconds: 0 })
            this.grassDelay = random(2, 4)
        }
        if (this.startingSeconds === null) return
        this.startingSeconds += dt
        const shade = Math.floor(this.startingSeconds / 0.1) % 2 === 0 ? 80 : 255
        this.setAdventureShade(shade)
        if (!this.laughPlayed && this.startingSeconds >= 1.25) {
            this.laughPlayed = true
            void SoundSystem.play(SoundEffect.EvilLaugh)
        }
        if (this.startingSeconds >= 4.5) {
            this.startingSeconds = null
            void this.enterAdventure()
        }
    }

    private async enterAdventure(): Promise<void> {
        await this.onNavigate('play')
        if (this.node?.isValid && this.node.activeInHierarchy) this.show()
    }

    protected onDestroy(): void {
        director.off(Director.EVENT_AFTER_DRAW, this.queueEntrance, this)
        director.off(Director.EVENT_AFTER_UPDATE, this.playEntrance, this)
    }
}
