import { LevelPlantingPreview } from './LevelPlantingPreview'
import { LevelCoinBank } from './LevelCoinBank'
import { LevelProgressMeter } from './LevelProgressMeter'
import { isAdviceStyle } from '@/client/hud/advice/AdviceWidgetSnapshot'
import { syncTutorialArrow } from './tutorialArrow'
import { Color, Node, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { uiNode } from '@/client/view/uiNode'
import { PlantPreview } from '@/client/hud/PlantPreview'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { UIButton } from '@/client/ui/UIButton'
import { levelStandsStill, type ServerEvent, type WorldSnapshot } from '@/shared/protocol/index'
import { LevelSeedBank } from './LevelSeedBank'
import { itemAt } from '@/shared/content/gameplay'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelPlantingRule } from '@/shared/content/planting'
import type { LevelPresentation } from './LevelPresentation'
import type { LevelAdviceSnapshot, LevelHudSnapshot } from './LevelPresentationSnapshot'

const TUTORIAL_FLASH_TICKS = 75
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type FontAsset = BitmapFontAssets

export interface LevelHudOptions {
    ui: UI
    content: LoadedContent
    level: LevelDefinition
    /** The level rule's share of Board::CanPlantAt, for the planting preview (its view's, made after the HUD). */
    levelRule?: () => LevelPlantingRule | undefined
    seedChooser?: WorldSnapshot['seedChooser']
    /**
     * The packets the bank starts with, in slot order and undefined for an empty slot; the server builds a fixed bank
     * from the level or the available seeds.
     */
    initialSeeds: Array<string | undefined>
    presentation: LevelPresentation
    seedPacketSlot: Node
    rootLayer: number
    packetCostFont: FontAsset
    adviceNode: Node
    adviceParent: Node
    /** Visible-screen surface for tooltips of clipped controls. */
    tooltipSurface: Node
    controlsParent: Node
    adviceFont: FontAsset
    tutorialArrowLayer: Node
    tutorialLawnFlash: Node
    cursorPreview: Node
    gridPreview: Node
    mobileGridGuide: Node
    cursorPlant: PlantPreview
    gridPlant: PlantPreview
    sunText: UILabel
    progressMeter: Node
    progressFillClip: Node
    progressFill: Node
    progressHead: Node
    levelText: UILabel
    coinBank: { node: Node, text: UILabel }
}

export class LevelHudPresenter {
    private adviceMessage = ''
    private adviceTick = 0
    private sunFlashTicks = 0
    private pointer?: { x: number, y: number }
    private lastSnapshot?: WorldSnapshot
    private lastIntroComplete = false
    private lastMenuVisible = false
    private menuButton!: UIButton
    private readonly progress: LevelProgressMeter
    private readonly coinBank: LevelCoinBank
    private readonly preview: LevelPlantingPreview
    private readonly hoverClient = {
        clearHover: () => {},
        refreshHover: (pointer: UIHoverPointer, modalRoot: Node | null) => pointer.canHover && !modalRoot &&
            !UIButton.hasActivePress && this.seedBank.packets.some(packet => packet.view.node.activeInHierarchy) && !!this.lastSnapshot &&
            this.isPointerOverItem(this.lastSnapshot),
    }

    static create(options: LevelHudOptions): LevelHudPresenter {
        const presenter = new LevelHudPresenter(options)
        presenter.menuButton = options.ui.button(options.controlsParent, {
            text: options.ui.text('MENU_BUTTON'), x: 681, y: -10, width: 117, height: 46,
            rightClickTriggers: false, enabled: false, clickSound: null,
        })
        presenter.menuButton.node.name = 'MenuButton'
        presenter.menuButton.node.active = false
        return presenter
    }

    private readonly content: LoadedContent
    private readonly ui: UI
    private readonly level: LevelDefinition
    private readonly presentation: LevelPresentation
    readonly seedBank: LevelSeedBank
    private readonly advice: AdviceWidget
    private readonly sunText: UILabel
    private readonly tutorialArrowLayer: Node
    private readonly tutorialLawnFlash: Node

    private constructor(options: LevelHudOptions) {
        this.content = options.content
        this.ui = options.ui
        this.level = options.level
        this.presentation = options.presentation
        this.seedBank = new LevelSeedBank(options)
        this.advice = new AdviceWidget({ ui: options.ui, node: options.adviceNode, parent: options.adviceParent, font: options.adviceFont })
        this.sunText = options.sunText
        this.tutorialArrowLayer = options.tutorialArrowLayer
        this.tutorialLawnFlash = options.tutorialLawnFlash
        this.progress = new LevelProgressMeter(options.ui, options.level, {
            meter: options.progressMeter, fillClip: options.progressFillClip, fill: options.progressFill, head: options.progressHead, levelText: options.levelText,
        })
        this.coinBank = new LevelCoinBank(options.content.definitions.items, options.coinBank)
        this.preview = new LevelPlantingPreview(options.content, options.level, options, options.levelRule)
        UIHoverManager.registerClient(this.hoverClient)
        this.tutorialArrowLayer.once(Node.EventType.NODE_DESTROYED, () => {
            UIHoverManager.unregisterClient(this.hoverClient)
            UIHoverManager.refreshHoverStates()
        })
    }

    snapshot(): { hud: LevelHudSnapshot, advice: LevelAdviceSnapshot } {
        return {
            hud: { sunFlashTicks: this.sunFlashTicks, coinBankTicks: this.coinBank.remainingTicks, ...this.progress.snapshot() },
            advice: {
                lastStatusMessage: this.adviceMessage,
                lastSyncedTick: this.adviceTick,
                widget: this.advice.snapshot(),
            },
        }
    }

    restore(snapshot: LevelHudSnapshot, advice: LevelAdviceSnapshot, introComplete: boolean, menuVisible = introComplete): void {
        this.lastIntroComplete = introComplete
        this.lastMenuVisible = menuVisible
        this.sunFlashTicks = snapshot.sunFlashTicks
        this.coinBank.restore(snapshot.coinBankTicks)
        this.progress.restore(snapshot)
        this.pointer = undefined
        this.preview.hide()
        this.adviceMessage = advice.lastStatusMessage
        this.adviceTick = advice.lastSyncedTick
        this.advice.restore(advice.widget)
        this.resetCursor()
        const world = this.lastSnapshot
        if (!world) return
        this.syncMenu(world, this.lastMenuVisible)
        this.syncSun(world.sun)
        this.coinBank.sync(world, [])
        this.progress.sync(world, this.lastIntroComplete)
        this.preview.sync(world, this.pointer)
        UIHoverManager.refreshHoverStates()
        this.syncSeedPacket(world, [], this.lastIntroComplete, false)
    }

    /** Board::ShowCoinBank (LevelCoinBank). */
    showCoinBank(ticks?: number): void { this.coinBank.show(ticks) }
    /** Board::Pause: a paused game with coins shows the coin bank. */
    showPauseCoinBank(): void { this.coinBank.showWhilePaused() }
    advanceCoinBank(ticks: number): void { this.coinBank.advance(ticks) }
    setCoinBankBesideDave(beside: boolean): void { this.coinBank.setBesideDave(beside) }

    setPointer(pointer?: { x: number, y: number }): void {
        this.pointer = pointer
        UIHoverManager.refreshHoverStates()
    }

    resetCursor(): void {
        this.setPointer()
    }

    bindSeedPackets(select: (index: number) => void): UIButton[] {
        return this.seedBank.bind(select)
    }

    bindMenu(open: () => void): UIButton {
        this.menuButton.onClick = open
        return this.menuButton
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[], introComplete: boolean, menuVisible = introComplete): void {
        this.lastSnapshot = snapshot
        this.lastIntroComplete = introComplete
        this.lastMenuVisible = menuVisible
        this.syncMenu(snapshot, menuVisible)
        const elapsedTicks = Math.max(0, snapshot.gameplayTick - this.adviceTick)
        this.sunFlashTicks = Math.max(0, this.sunFlashTicks - elapsedTicks)
        // Like too little sun, sun an enemy producer takes flashes the counter red, though without the buzzer.
        if (events.some(event => event.type === 'sunFlash' || event.type === 'sunDrained')) this.sunFlashTicks = 70
        this.syncSun(snapshot.sun)
        this.coinBank.sync(snapshot, events)
        this.progress.sync(snapshot, introComplete)
        this.preview.sync(snapshot, this.pointer)
        this.syncSeedPacket(snapshot, events, introComplete)
        UIHoverManager.refreshHoverStates()
        this.syncAdvice(snapshot, events, elapsedTicks, introComplete)
        this.adviceTick = snapshot.gameplayTick
    }

    private syncMenu(snapshot: WorldSnapshot, visible: boolean): void {
        this.menuButton.node.active = visible && snapshot.result !== 'lost'
        this.menuButton.interactable = this.menuButton.node.active
    }

    private syncSeedPacket(
        snapshot: WorldSnapshot,
        events: ServerEvent[],
        introComplete: boolean,
        allowTransientEffects = true,
    ): void {
        const showSeedGuide = introComplete && snapshot.result === 'playing' && this.presentation.seedGuideSteps.includes(snapshot.tutorial.step)
        this.seedBank.sync(snapshot, events, introComplete, showSeedGuide ? tutorialFlashColor(snapshot.gameplayTick) : null, allowTransientEffects)
        const packet = snapshot.seedPackets.find(packet => packet?.seedId === (this.presentation.guideSeed ?? snapshot.seedPackets[0]?.seedId))
        this.syncSeedTutorialArrow(!!(showSeedGuide && this.presentation.seedGuideArrow !== false && packet?.ready && !packet.availability.reason))
        const showLawnGuide = introComplete && snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' &&
            this.presentation.lawnGuideSteps.includes(snapshot.tutorial.step)
        this.tutorialLawnFlash.active = showLawnGuide
        if (showLawnGuide) uiNode({ node: this.tutorialLawnFlash, sprite: {} }).sprite!.color = tutorialFlashColor(snapshot.gameplayTick)
    }

    /** Advice the client itself has, as a hint: `key`'s string with its %s filled with the strings of `args`. */
    showAdvice(key: string, args: readonly string[] = []): void {
        this.advice.show(this.ui.format(key, args.map(arg => this.ui.text(arg))), 'hint')
    }

    /** Level advice names pvz:strings keys; the server only sends keys. */
    private adviceText(key: string): string { return key ? this.ui.text(key) : '' }

    private syncAdvice(snapshot: WorldSnapshot, events: ServerEvent[], elapsedTicks: number, introComplete: boolean): void {
        // Board::ZombiesWon clears the advice (at once here, where the level stops updating it); a win does not
        // (Board::FadeOutLevel), so messages, such as achievements earned from the sun and coins collected after the
        // award, show through the fade.
        if (snapshot.result === 'lost') { this.advice.clear(true); return }
        if (introComplete || this.presentation.adviceDuringIntro) {
            const message = this.adviceText(this.presentation.advice[snapshot.tutorial.step] ?? '')
            if (message !== this.adviceMessage) {
                this.adviceMessage = message
                if (message) this.advice.show(message, this.presentation.adviceStyle ?? (snapshot.tutorial.step === 'complete' ? 'tutorial-level1' : 'tutorial-level1-stay'))
                else this.advice.clear()
            }
        }
        for (const event of events) {
            if (event.type === 'advice') {
                const key = event.data.key
                const style = event.data.style
                if (typeof key === 'string') this.advice.show(this.adviceText(key), isAdviceStyle(style) ? style : 'tutorial-level1')
            } else if (event.type === 'achievementEarned' && event.data.announce === true && typeof event.data.titleKey === 'string') {
                this.advice.show(this.ui.text('ACHIEVEMENT_ACHIEVED').replace('{ACHIEVEMENT}', this.ui.text(event.data.titleKey)), 'achievement')
            } else if (event.type === 'hugeWave') {
                // Board::UpdateZombieSpawning: DisplayAdviceAgain of the huge wave's message as its countdown starts,
                this.advice.show(this.ui.text('ADVICE_HUGE_WAVE'), 'huge-wave')
            } else if (event.type === 'nextWaveComing') {
                // and ClearAdvice(ADVICE_HUGE_WAVE) as it ends, unless another message is waiting to take its place.
                const shown = this.advice.snapshot()
                if (shown?.style === 'huge-wave' && !shown.next) this.advice.clear()
            } else if (event.type === 'adviceCleared') {
                const key = event.data.key
                if (typeof key === 'string' && this.advice.snapshot()?.message === this.adviceText(key)) this.advice.clear()
            }
        }
        this.advice.update(elapsedTicks, snapshot.gameplayTick)
    }

    private syncSun(value: number): void {
        const text = String(value)
        if (this.sunText.text !== text) this.sunText.text = text
        this.sunText.color = this.sunFlashTicks > 0 && this.sunFlashTicks % 20 < 10 ? Color.RED : Color.BLACK
    }

    private isPointerOverItem(snapshot: WorldSnapshot): boolean {
        if (levelStandsStill(snapshot) || snapshot.result !== 'playing' || GameDebugSettings.isMobileMode() || !this.pointer || snapshot.cursor.mode !== 'none') return false
        return itemAt(snapshot.items, this.content.definitions.items, this.level, this.pointer.x, this.pointer.y) !== undefined
    }

    /** Board::OffsetYForPlanting for the seed being planted; a zombie seed's cell is the pointer's. */
    pointerOffsetY(seedId: string): number { return this.preview.pointerOffsetY(seedId) }

    private syncSeedTutorialArrow(visible: boolean): void {
        if (!visible) { syncTutorialArrow(this.tutorialArrowLayer); return }
        const packet = this.seedBank.packets.find(packet => packet.seedId === (this.presentation.guideSeed ?? this.seedBank.packets[0]?.seedId))!
        // The bank may sit in an edge container, so place the arrow by the packet's world position.
        syncTutorialArrow(this.tutorialArrowLayer, this.tutorialArrowLayer.inverseTransformPoint(new Vec3(), packet.view.node.worldPosition))
    }

}


function tutorialFlashColor(tick: number): Color {
    const age = tick % TUTORIAL_FLASH_TICKS
    const midpoint = Math.floor(TUTORIAL_FLASH_TICKS / 2)
    const gray = Math.max(55, Math.min(255, Math.floor(55 + 200 * Math.abs(midpoint - age) / midpoint)))
    return new Color(gray, gray, gray, 255)
}
