import { _decorator, Color, Component, director, Director, Mask, Node, Sprite, type SpriteFrame } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { UserView } from '@/shared/menu'
import { loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { MusicSystem } from '@/client/music/MusicSystem'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { gameClock } from '@/core/GameClock'
import { MAIN_MENU_BUTTONS, MAIN_MENU_CLOUDS, MAIN_MENU_EXTRA_IMAGES, MAIN_MENU_FLOWERS, type MainMenuButton } from './MainMenuConfig'
import type { MenuAction } from './MenuPages'

const { ccclass } = _decorator
const random = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum)

interface TrackedButton {
    config: MainMenuButton
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

    async initialize(ui: UI, onProgress: (progress: number) => void = () => {}): Promise<void> {
        this.ui = ui
        const { content: { registry, loader } } = await loadEntityDisplayAssets()
        const imageNames = new Set([
            ...MAIN_MENU_BUTTONS.flatMap(button => [button.image, button.highlight]), ...MAIN_MENU_EXTRA_IMAGES,
        ])
        const total = imageNames.size + MAIN_MENU_CLOUDS.length + MAIN_MENU_FLOWERS.length + 5
        let completed = 0
        const report = () => onProgress(++completed / total)
        await Promise.all([...imageNames].map(async name => {
            const frame = await SpriteLoader.load(name)
            if (!frame) throw new Error(`Missing main menu image: ${name}`)
            this.frames.set(name, frame)
            report()
        }))
        if (!this.node.isValid) return
        const content = uiNode({ name: 'Selector', parent: this.node, anchor: { x: 0, y: 1 }, position: { x: -400, y: 300 } }).node
        this.background = ui.image(content, this.frames.get('selectorscreen_bg')!, { width: 800, height: 600 })
        const pending: Promise<void>[] = []
        const player = (name: string, parent = content): ReanimPlayer => {
            const animation = uiNode({ name, parent, anchor: { x: 0, y: 1 } }).node.addComponent(ReanimPlayer)
            pending.push(animation.load(`pvz:selector_${name}`, registry, loader).then(report))
            return animation
        }
        this.clouds = MAIN_MENU_CLOUDS.map(name => ({ player: player(name), delay: 0 }))
        this.open = player('open')
        this.sign = player('sign')
        this.grass = player('grass')
        this.flowers = MAIN_MENU_FLOWERS.map((_, index) => player(`flower${index + 1}`))
        const clip = uiNode({ name: 'HandClip', parent: content, anchor: { x: 0, y: 1 }, size: { width: 800, height: 560 }, mask: Mask.Type.GRAPHICS_RECT }).node
        this.hand = [player('zombie_hand', clip), player('zombie_hand')]
        await Promise.all(pending)
        if (!this.node.isValid) return
        this.current = this.open
        this.sign.node.active = false
        for (const animation of [this.open, this.sign]) {
            animation.setTrackPrefixVisible('SelectorScreen_BG', false)
            // Only the sky is separate; the moving foreground stays in its original track order.
            for (const name of ['SelectorScreen_BG_Center', 'SelectorScreen_BG_Left', 'SelectorScreen_BG_Right']) {
                animation.setTrackPrefixVisible(name, true)
            }
            animation.setTrackPrefixVisible('leaf', false)
            animation.setTrackPrefixVisible('flower', false)
            for (const button of MAIN_MENU_BUTTONS) if (button.replace) animation.setTrackPrefixVisible(button.track, false)
            animation.setTrackPrefixVisible('SelectorScreen_StartAdventure_button', false)
        }
        this.hand.forEach((animation, index) => {
            animation.node.setPosition(-70, -10)
            for (const track of animation.node.children) {
                if (track.name.startsWith('rock') !== (index === 1)) animation.setTrackPrefixVisible(track.name, false)
            }
            animation.hide()
        })
        this.signsRoot = uiNode({ name: 'Signs', parent: content, anchor: { x: 0, y: 1 }, active: false }).node
        const signTrack = this.sign.getTrackNode('woodsign1')!
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
        void SoundLoader.play(SoundEffect.RollIn)
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
        for (const animation of [this.grass, ...this.flowers]) animation.setTrackPrefixVisible('', profile !== null)
        const level = profile?.adventureLevel ?? 1
        this.startAdventure = level <= 1 && (profile?.finishedAdventure ?? 0) === 0
        this.profileLabel.text = profile ? `${profile.name}!` : ''
        for (const animation of [this.open, this.sign]) {
            animation.setTrackPrefixVisible('SelectorScreen_Adventure_shadow', !this.startAdventure)
            animation.setTrackPrefixVisible('SelectorScreen_StartAdventure_shadow', this.startAdventure)
        }
        for (const original of MAIN_MENU_BUTTONS) {
            const config = original.name === 'adventure' && this.startAdventure ? {
                ...original, track: 'SelectorScreen_StartAdventure_button',
                image: 'selectorscreen_startadventure_button1', highlight: 'selectorscreen_startadventure_highlight',
            } : original
            const normal = this.frames.get(config.image)!
            const hover = this.frames.get(config.highlight)!
            const parent = config.track.startsWith('woodsign') ? this.signsRoot : this.buttonsRoot
            const button = this.ui.button(parent, {
                images: { normal, hover }, width: config.width, height: config.height,
                imageBox: { x: config.imageX, y: config.imageY, width: normal.originalSize.width, height: normal.originalSize.height },
                polygon: config.polygon, pressOffset: config.track.startsWith('woodsign') ? [0, 0] : [1, 1],
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
        MAIN_MENU_FLOWERS.forEach((center, index) => {
            const node = uiNode({ name: `Flower-${index + 1}`, parent: this.buttonsRoot, anchor: { x: 0, y: 1 }, size: { width: 40, height: 40 }, position: { x: center.x - 20, y: 20 - center.y } }).node
            node.active = false
            const button = node.addComponent(UIButton)
            button.refreshHoverOnEnable = false
            button.changeCursor = false
            const flower = this.flowers[index]
            button.canInteract = () => !this.playedFlowers.has(flower)
            button.polygon = Array.from({ length: 12 }, (_, point) => {
                const angle = point * Math.PI / 6
                return [20 + Math.cos(angle) * 20, 20 + Math.sin(angle) * 20] as const
            })
            button.onPress = () => {
                this.playedFlowers.add(flower)
                void SoundLoader.playFoley(SoundEffect.LimbsPop, 10)
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
        const right = this.current.getTrackNode('SelectorScreen_BG_Right')!
        for (const animation of [this.grass, ...this.flowers]) animation.node.setPosition(right.position.x - 71, right.position.y + 41)
        const offset = this.buttons.find(view => view.config.name === 'adventure')?.pressed ? 1 : 0
        this.numbersRoot.setPosition(right.position.x + offset, right.position.y - offset)
    }

    private activate(config: MainMenuButton): void {
        if (config.name === 'adventure') {
            if (this.startingSeconds !== null) return
            this.setButtonsEnabled(false)
            for (const button of this.flowerButtons) button.enabled = true
            this.startingSeconds = 0
            this.laughPlayed = false
            MusicSystem.stop()
            void SoundLoader.playSfx(SoundEffect.LoseMusic)
            void SoundLoader.playFoley(SoundEffect.DirtRise)
            for (const hand of this.hand) hand.play({ loop: false, timeSeconds: 0, hideOnFinish: false })
        } else if (config.target) void this.onNavigate(config.target)
        else this.ui.dialog(this.node, { title: 'Zombatar', message: 'Zombatar is not available yet.' })
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
            void SoundLoader.play(SoundEffect.EvilLaugh)
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
