import { prepareClips, showClip } from '@/client/reanim/clips'
import { modResources } from '@/client/content/ModResources'
import { _decorator, Color, Component, director, Director, Node, Sprite, SpriteFrame } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { MainMenuUnlocks, UserView } from '@/shared/menu'
import { preloadTasks } from '@/client/content/preloadTasks'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { MusicSystem } from '@/client/music/MusicSystem'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UILabel } from '@/client/ui/UILabel'
import type { UITooltip } from '@/client/ui/UITooltip'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import type { MainMenuButtonDefinition, MainMenuDefinition } from '@/shared/content/presentation'
import { isMenuDialog, type MenuAction, type MenuDialogId } from './MenuPages'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'

const { ccclass } = _decorator
const random = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum)
/** GameSelector::SyncButtons: mode buttons that stay grey until unlocked, and menu items hidden until reached. */
const LOCKED_MESSAGES: Readonly<Record<string, string>> = {
    minigames: 'MINIGAME_LOCKED_MESSAGE', puzzle: 'PUZZLE_LOCKED_MESSAGE', survival: 'SURVIVAL_LOCKED_MESSAGE',
}
const HIDDEN_UNTIL_UNLOCKED = new Set(['almanac', 'store', 'garden'])
const LOCKED_SHADE = new Color(128, 128, 128)

interface TrackedButton {
    config: MainMenuButtonDefinition
    button: UIButton
    pressed: boolean
}

@ccclass('MainMenuScreen')
export class MainMenuScreen extends Component {
    onNavigate: (action: MenuAction) => void | Promise<void> = () => {}
    onOpenDialog: (id: MenuDialogId) => void | Promise<void> = () => {}
    private ui!: UI
    private frames = new Map<string, SpriteFrame>()
    private open!: ReanimPlayer
    private sign!: ReanimPlayer
    private current!: ReanimPlayer
    private grass!: ReanimPlayer
    private flowers: ReanimPlayer[] = []
    private clouds: { player: ReanimPlayer, delay: number }[] = []
    private hand: ReanimPlayer | null = null
    private buttonsRoot!: Node
    private numbersRoot!: Node
    private trophyRoot!: Node
    private trophy!: Sprite
    private trophyTooltip!: UITooltip
    private trophySparkle: ParticlePlayer | null = null
    private signsRoot!: Node
    private profileLabel!: UILabel
    private buttons: TrackedButton[] = []
    private flowerButtons: UIButton[] = []
    private playedFlowers = new Set<ReanimPlayer>()
    private user: UserView | null = null
    private ready = false
    /** The sky behind the selector, which Mods stretch (a wider screen's). */
    background!: Sprite
    private opened = false
    private signShown = false
    private entrancePending = true
    private startAdventure = true
    private grassDelay = 0.5
    private startingSeconds: number | null = null
    private laughPlayed = false
    private menu!: MainMenuDefinition

    async initialize(ui: UI, onProgress: (progress: number) => void = () => {}): Promise<void> {
        this.ui = ui
        const game = await loadIntegratedGameContent()
        const menu = this.menu = game.presentation.mainMenu
        const imageNames = new Set([
            ...menu.buttons.flatMap(button => [button.image, button.highlight]), ...menu.images,
            menu.startAdventure.image, menu.startAdventure.highlight,
            menu.keyShadow.almanac, menu.keyShadow.store, menu.trophy.image,
        ])
        const total = imageNames.size + menu.clouds.length + menu.flowers.length + 5
        let completed = 0
        const report = () => onProgress(++completed / total)
        await Promise.all([...imageNames].map(async name => {
            const frame = await modResources.sprite(name)
            this.frames.set(name, frame)
            report()
        }))
        if (!this.node.isValid) return
        const content = uiNode({ name: 'Selector', parent: this.node, anchor: { x: 0, y: 1 }, position: { x: -400, y: 300 } }).node
        this.background = ui.image(content, this.frames.get('selectorscreen_bg')!, { width: 800, height: 600 })
        const pending: (() => Promise<void>)[] = []
        const player = (name: string, parent = content): ReanimPlayer => {
            const animation = uiNode({ name, parent, anchor: { x: 0, y: 1 } }).node.addComponent(ReanimPlayer)
            const clip = menu.clips[name]
            pending.push(async () => {
                await prepareClips([clip])
                if (!animation.node?.isValid) return
                showClip(animation, clip, { blend: 0 })
                animation.pause()
                report()
            })
            return animation
        }
        this.clouds = menu.clouds.map(name => ({ player: player(name), delay: 0 }))
        this.open = player('open')
        this.sign = player('sign')
        this.grass = player('grass')
        this.flowers = menu.flowers.map(flower => player(flower.clip))
        const hand = this.hand = player('zombie_hand')
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
        // The screen's clip, in the hand's own coordinates; the rocks it pushes aside are drawn outside it.
        const { clipRect: clip, rocks } = menu.hand
        const { x = 0, y = 0 } = menu.clips.zombie_hand
        hand.setClip({ x: clip.x - x, y: clip.y + y, width: clip.width, height: clip.height, ignore: rocks })
        hand.hide()
        this.signsRoot = uiNode({ name: 'Signs', parent: content, anchor: { x: 0, y: 1 }, active: false }).node
        const signTrack = this.sign.getTrackNode(menu.tracks.profileSign)!
        signTrack.parent = this.signsRoot
        this.profileLabel = ui.label(signTrack, {
            text: '', font: 'profile', color: new Color(255, 245, 200), align: 'center', baseline: true,
            x: 148.5, y: 110.5,
        })
        this.buttonsRoot = uiNode({ name: 'Buttons', parent: content, anchor: { x: 0, y: 1 } }).node
        this.numbersRoot = uiNode({ name: 'LevelNumbers', parent: content, anchor: { x: 0, y: 1 } }).node
        this.trophyRoot = uiNode({ name: 'Trophy', parent: content, anchor: { x: 0, y: 1 }, active: false }).node
        const trophyFrame = this.frames.get(menu.trophy.image)!
        this.trophy = ui.image(this.trophyRoot, trophyFrame, { width: trophyFrame.originalSize.width / 2 })
        // GameSelector::UpdateTooltip (1073): the pointer over (50, 250)-(135, 475) shows it at a fixed place.
        const trophyArea = uiNode({ name: 'TrophyArea', parent: this.trophyRoot, anchor: { x: 0, y: 1 }, position: { x: 50, y: -250 }, size: { width: 85, height: 225 } }).node
        const hover = trophyArea.addComponent(UIButton)
        hover.changeCursor = false
        hover.touchSlide = false
        hover.hapticsEnabled = false
        const tooltipAnchor = uiNode({ name: 'TrophyTooltip', parent: this.trophyRoot, anchor: { x: 0, y: 1 } }).node
        this.trophyTooltip = ui.tooltip(tooltipAnchor, { text: '', fixed: true })
        hover.onHoverChange = hovering => hovering ? this.trophyTooltip.show() : this.trophyTooltip.hide()
        // Match the original draw order; flower clips 1/2/3 contain tracks 3/2/1.
        const layers = [
            ...this.clouds.map(cloud => cloud.player.node), this.open.node, this.sign.node,
            this.buttonsRoot, hand.node, this.numbersRoot, this.trophyRoot, this.grass.node,
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
        this.hand?.hide()
        void MusicSystem.playTune('title_theme')
        if (this.opened) {
            this.setButtonsEnabled(true)
            this.setAdventureShade(255)
            // SELECTOR_NEW_USER: the sign drops once the create-user dialog has closed with a player.
            if (!this.signShown) void menuApi.getCurrentUser().then(user => { if (user && this.node?.isValid) this.showSign() })
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
            if (delay <= 0) this.playCloud(cloud, -delay / 60 * (cloud.player.durationSeconds - 1 / cloud.player.fps))
            else {
                showClip(cloud.player, this.menu.clips[cloud.player.node.name], { timeSeconds: 0 })
                cloud.player.pause()
                cloud.delay = delay
            }
        }
        showClip(this.open, this.menu.clips.open, { onFinish: () => {
            this.opened = true
            this.setButtonsEnabled(true)
            this.addTrophySparkle()
            // GameSelector::Update: once open, a player gets the sign; without one the create-user dialog comes first.
            if (this.user) this.showSign()
            else void this.onOpenDialog('players')
            this.syncPositions()
        } })
    }

    /** Whether the entrance has finished, so the create-user dialog may open over it. */
    get isOpened(): boolean {
        return this.opened
    }

    private showSign(): void {
        if (this.signShown) return
        this.signShown = true
        this.open.node.active = false
        this.sign.node.active = true
        this.signsRoot.active = true
        this.current = this.sign
        showClip(this.sign, this.menu.clips.sign)
    }

    /** SELECTOR_NEW_USER: the create-user dialog has closed with a player, so the opened menu drops the sign. */
    showPlayerSign(): void {
        if (this.opened && this.user && this.node.isValid) this.showSign()
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
        // The original DrawOverlay skips the grass until a player exists; its clock still runs. The flowers are
        // attached to SelectorScreen_BG_Right, so the background draws them, and MouseDown pops them, without one.
        this.grass.setTracksVisible(this.grass.trackIds, profile !== null)
        const level = profile?.adventureLevel ?? 1
        this.startAdventure = level <= 1 && (profile?.finishedAdventure ?? 0) === 0
        this.profileLabel.text = profile ? `${profile.name}!` : ''
        // Without a player every mode is locked and the almanac, store and garden are hidden.
        const unlocks: Partial<MainMenuUnlocks> = profile?.unlocks ?? {}
        const unlocked = (name: string) => unlocks[name as keyof MainMenuUnlocks] === true
        const { keyShadow } = this.menu
        for (const animation of [this.open, this.sign]) {
            animation.setTracksVisible([keyShadow.track], !!unlocks.almanac || !!unlocks.store)
            animation.setTrackSpriteOverride(keyShadow.track, unlocks.almanac && unlocks.store ? null
                : this.frames.get(unlocks.almanac ? keyShadow.almanac : keyShadow.store)!)
        }
        for (const animation of [this.open, this.sign]) {
            animation.setTracksVisible([this.menu.startAdventure.adventureShadow], !this.startAdventure)
            animation.setTracksVisible([this.menu.startAdventure.shadow], this.startAdventure)
        }
        const start = this.menu.startAdventure
        for (const original of this.menu.buttons) {
            if (HIDDEN_UNTIL_UNLOCKED.has(original.name) && !unlocked(original.name)) continue
            const locked = original.name in LOCKED_MESSAGES && !unlocked(original.name)
            const config = original.name === 'adventure' && this.startAdventure
                ? { ...original, track: start.track, image: start.image, highlight: start.highlight } : original
            const normal = this.frames.get(config.image)!
            // A locked mode keeps its normal image under the pointer, and stays silent.
            const hover = locked ? normal : this.frames.get(config.highlight)!
            const parent = config.sign ? this.signsRoot : this.buttonsRoot
            const button = this.ui.button(parent, {
                images: { normal, hover }, width: config.width, height: config.height,
                imageBox: { x: config.imageX, y: config.imageY, width: normal.originalSize.width, height: normal.originalSize.height },
                polygon: config.polygon, pressOffset: config.sign ? [0, 0] : [1, 1],
                refreshHoverOnEnable: false,
                pressSound: config.mode ? SoundEffect.GraveButton : SoundEffect.Tap, hoverSound: locked ? null : SoundEffect.Bleep,
                onClick: () => locked ? this.showLocked(config.name) : this.activate(config),
            })
            button.node.name = config.name
            if (locked) for (const sprite of button.node.getComponentsInChildren(Sprite)) sprite.color = LOCKED_SHADE
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
            button.clickOnPress = true
            button.onClick = () => {
                this.playedFlowers.add(flower)
                void SoundSystem.playFoley(SoundEffect.LimbsPop, 10)
                showClip(flower, this.menu.clips[center.clip])
            }
            this.flowerButtons.push(button)
            node.active = true
        })
        if (!this.startAdventure) {
            const stage = Math.min(6, Math.floor((level - 1) / 10) + 1)
            const sub = level - (stage - 1) * 10
            const atlas = this.frames.get('selectorscreen_levelnumbers')!
            // DrawImageCel of a one-row, 10-column sheet (resources.xml): each cel is a tenth of the image, full height.
            const [width, height] = [atlas.originalSize.width / 10, atlas.originalSize.height]
            const digit = (value: number, x: number, y: number) => this.ui.image(this.numbersRoot, getAtlasFrame(atlas, value, width, height, 10), { x, y })
            digit(stage, 486 + (stage === 4 ? -1 : 0), 47 + (stage === 1 ? 1 : 0))
            digit(sub === 10 ? 1 : sub, 509 + (sub === 3 ? -1 : 0), 50)
            if (sub === 10) digit(0, 518, 51)
        }
        this.refreshTrophy(profile)
        this.setButtonsEnabled(this.opened)
        this.syncPositions()
    }

    private showLocked(name: string): void {
        this.ui.dialog(this.node, { title: this.ui.text('MODE_LOCKED'), message: this.ui.text(LOCKED_MESSAGES[name]) })
    }

    /** GameSelector: a finished Adventure earns the sunflower trophy, gold once every challenge trophy is won. */
    private refreshTrophy(profile: UserView | null): void {
        const finished = profile?.finishedAdventure ?? 0
        const gold = finished > 0 && profile!.allTrophies
        this.trophyRoot.active = finished > 0
        const frame = this.frames.get(this.menu.trophy.image)!
        this.trophy.spriteFrame = getAtlasFrame(frame, gold ? 1 : 0, frame.originalSize.width / 2, frame.originalSize.height, 2)
        this.trophyTooltip.text = !gold ? this.ui.text('SILVER_SUNFLOWER_TOOLTIP')
            : finished === 1 ? this.ui.text('GOLD_SUNFLOWER_TOOLTIP')
                : this.ui.text('GOLD_SUNFLOWER_TOOLTIP_PLURAL').replace('{COUNT}', String(finished))
        this.trophyTooltip.node.setPosition(gold ? 32 : 20, gold ? -510 : -495)
        // SyncProfile replaces the sparkle; during the entrance it waits for the selector to open.
        if (this.trophySparkle?.isValid) this.trophySparkle.node.destroy()
        this.trophySparkle = null
        if (this.opened) this.addTrophySparkle()
    }

    private addTrophySparkle(): void {
        if (!this.trophyRoot.active || this.trophySparkle?.isValid) return
        // AddTrophySparkle: (85, 380) on screen. 1073 writes (885, 380) because its selector sits at x = -800 with
        // everything inside shifted 800 right for the Zombatar screen; it stays put while the trophy rose 45 above the pedestal.
        this.trophySparkle = ParticlePlayer.spawn({ parent: this.trophyRoot, id: this.menu.trophy.particle, x: 85, y: -380 })
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
        const left = this.current.getTrackNode(this.menu.trophy.track)
        if (left) this.trophy.node.setPosition(left.position.x + 12, left.position.y - 345)
        const right = this.current.getTrackNode(this.menu.tracks.anchor)!
        for (const animation of [this.grass, ...this.flowers]) {
            const clip = this.menu.clips[animation.node.name]
            animation.node.setPosition(right.position.x - 71 + (clip.x ?? 0), right.position.y + 41 + (clip.y ?? 0))
        }
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
            void SoundSystem.play(SoundEffect.LoseMusic)
            void SoundSystem.playFoley(SoundEffect.DirtRise)
            if (this.hand) showClip(this.hand, this.menu.clips.zombie_hand)
        } else if (config.target && isMenuDialog(config.target)) void this.onOpenDialog(config.target)
        else if (config.target) void this.onNavigate(config.target as MenuAction)
        else this.ui.dialog(this.node, { title: this.ui.text('ZOMBATAR_UNAVAILABLE_HEADER'), message: this.ui.text('ZOMBATAR_UNAVAILABLE_BODY') })
    }

    private playCloud(cloud: { player: ReanimPlayer, delay: number }, timeSeconds = 0): void {
        cloud.delay = 0
        showClip(cloud.player, this.menu.clips[cloud.player.node.name], { timeSeconds, onFinish: () => { cloud.delay = random(20, 40) } })
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
            showClip(this.grass, this.menu.clips.grass)
            this.syncPositions()
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
