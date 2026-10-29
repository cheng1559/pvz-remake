import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { Color, Graphics, isValid, Node, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { FontRepository } from '@/client/content/ClientContentLoader'
import { uiNode } from '@/client/view/uiNode'
import { formatMoney } from '@/client/ui/formatMoney'
import { PlantPreview } from '@/client/hud/PlantPreview'
import type { SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { UIButton } from '@/client/ui/UIButton'
import { graveAt, type ServerEvent, type WorldSnapshot } from '@/shared/protocol/index'
import { LevelSeedBank } from './LevelSeedBank'
import { adventureStage, boardCell, levelAwardSize } from './LevelGeometry'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelPresentation } from './LevelPresentation'
import type { LevelAdviceSnapshot, LevelHudSnapshot } from './LevelPresentationSnapshot'
import { plantDefinition } from '@/client/plants/definitions'

const TUTORIAL_FLASH_TICKS = 75
const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_HEIGHT = 27
const PROGRESS_FILL_WIDTH = 143
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type FontAsset = Awaited<ReturnType<FontRepository['load']>>

export interface LevelHudOptions {
    ui: UI
    content: LoadedContent
    level: LevelDefinition
    seedChooser?: WorldSnapshot['seedChooser']
    presentation: LevelPresentation
    seedPacketSlot: Node
    rootLayer: number
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
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

/** Board::ShowCoinBank's default duration; the bank fades out over its last 15 ticks. */
const COIN_BANK_TICKS = 1000

export class LevelHudPresenter {
    private adviceMessage = ''
    private adviceTick = 0
    private sunFlashTicks = 0
    private coinBankTicks = 0
    private coinBankTick = 0
    private coinBankPaused = false
    private coinBank!: LevelHudOptions['coinBank']
    private ui!: UI
    private pointer?: { x: number, y: number }
    private progressWave = 0
    private progressCountdownStart = 0
    private progressMeterWidth = 0
    private progressTick = 0
    private lastSnapshot?: WorldSnapshot
    private lastIntroComplete = false
    private lastMenuVisible = false
    private menuButton!: UIButton
    private mobileGridGuide!: Node
    private mobileGuideCell = -1
    private readonly hoverClient = {
        clearHover: () => {},
        refreshHover: (pointer: UIHoverPointer, modalRoot: Node | null) => pointer.canHover && !modalRoot &&
            !UIButton.hasActivePress && this.seedBank.packets.some(packet => packet.view.node.activeInHierarchy) && !!this.lastSnapshot &&
            this.isPointerOverItem(this.lastSnapshot),
    }

    static create(options: LevelHudOptions): LevelHudPresenter {
        const seedBank = new LevelSeedBank(options)
        const advice = new AdviceWidget({ ui: options.ui, node: options.adviceNode, parent: options.adviceParent, font: options.adviceFont })
        const presenter = new LevelHudPresenter(
            options.content, options.tutorialArrowLayer, options.tutorialLawnFlash,
            options.cursorPreview, options.gridPreview, options.cursorPlant, options.gridPlant,
            seedBank, options.sunText,
            options.progressMeter, options.progressFillClip, options.progressFill, options.progressHead,
            options.levelText, advice, options.level, options.presentation,
        )
        presenter.menuButton = options.ui.button(options.controlsParent, {
            text: options.ui.text('MENU_BUTTON'), x: 681, y: -10, width: 117, height: 46,
            rightClickTriggers: false, enabled: false, clickSound: null,
        })
        presenter.menuButton.node.name = 'MenuButton'
        presenter.mobileGridGuide = options.mobileGridGuide
        presenter.coinBank = options.coinBank
        presenter.ui = options.ui
        presenter.menuButton.node.active = false
        return presenter
    }

    private constructor(
        private readonly content: LoadedContent,
        private readonly tutorialArrowLayer: Node,
        private readonly tutorialLawnFlash: Node,
        private readonly cursorPreview: Node,
        private readonly gridPreview: Node,
        private readonly cursorPlant: PlantPreview,
        private readonly gridPlant: PlantPreview,
        readonly seedBank: LevelSeedBank,
        private readonly sunText: UILabel,
        private readonly progressMeter: Node,
        private readonly progressFillClip: Node,
        private readonly progressFill: Node,
        private readonly progressHead: Node,
        private readonly levelText: UILabel,
        private readonly advice: AdviceWidget,
        private readonly level: LevelDefinition,
        private readonly presentation: LevelPresentation,
    ) {
        UIHoverManager.registerClient(this.hoverClient)
        this.tutorialArrowLayer.once(Node.EventType.NODE_DESTROYED, () => {
            UIHoverManager.unregisterClient(this.hoverClient)
            UIHoverManager.refreshHoverStates()
        })
    }

    snapshot(): { hud: LevelHudSnapshot, advice: LevelAdviceSnapshot } {
        return {
            hud: {
                sunFlashTicks: this.sunFlashTicks,
                coinBankTicks: this.coinBankTicks,
                progressWave: this.progressWave,
                progressCountdownStart: this.progressCountdownStart,
                progressMeterWidth: this.progressMeterWidth,
                progressTick: this.progressTick,
            },
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
        this.coinBankTicks = snapshot.coinBankTicks
        this.progressWave = snapshot.progressWave
        this.progressCountdownStart = snapshot.progressCountdownStart
        this.progressMeterWidth = snapshot.progressMeterWidth
        this.progressTick = snapshot.progressTick
        this.pointer = undefined
        this.cursorPreview.active = false
        this.gridPreview.active = false
        this.adviceMessage = advice.lastStatusMessage
        this.adviceTick = advice.lastSyncedTick
        this.advice.restore(advice.widget)
        this.resetCursor()
        const world = this.lastSnapshot
        if (!world) return
        this.syncMenu(world, this.lastMenuVisible)
        this.syncSun(world.sun)
        this.coinBankTick = world.gameplayTick
        this.coinBankPaused = world.paused
        this.syncCoinBank(world, [])
        this.syncProgress(world, this.lastIntroComplete)
        this.syncPreviews(world)
        UIHoverManager.refreshHoverStates()
        this.syncSeedPacket(world, [], this.lastIntroComplete, false)
    }

    /** Board::DrawUICoinBank: shown while collecting money, and when a game with coins is paused (Board::Pause). */
    private syncCoinBank(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        // The count only runs with the game, so a pause holds the bank on screen.
        this.coinBankTicks = Math.max(0, this.coinBankTicks - Math.max(0, snapshot.gameplayTick - this.coinBankTick))
        this.coinBankTick = snapshot.gameplayTick
        if (events.some(event => event.type === 'itemCollected' && this.content.definitions.items[String(event.data.typeId)]?.kind === 'money') ||
            snapshot.paused && !this.coinBankPaused && snapshot.money > 0) this.coinBankTicks = COIN_BANK_TICKS
        this.coinBankPaused = snapshot.paused
        this.coinBank.node.active = this.coinBankTicks > 0
        if (!this.coinBank.node.active) return
        uiNode({ node: this.coinBank.node, opacity: Math.min(255, Math.round(255 * this.coinBankTicks / 15)) })
        const text = formatMoney(snapshot.money)
        if (this.coinBank.text.text !== text) this.coinBank.text.text = text
    }

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
        if (events.some(event => event.type === 'sunFlash')) this.sunFlashTicks = 70
        this.syncSun(snapshot.sun)
        this.syncCoinBank(snapshot, events)
        this.syncProgress(snapshot, introComplete)
        this.syncPreviews(snapshot)
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
        const packet = snapshot.seedPackets.find(packet => packet.seedId === (this.presentation.guideSeed ?? this.level.seedPackets[0]))
        this.syncSeedTutorialArrow(!!(showSeedGuide && packet?.ready && !packet.availability.reason))
        const showLawnGuide = introComplete && snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' &&
            this.presentation.lawnGuideSteps.includes(snapshot.tutorial.step)
        this.tutorialLawnFlash.active = showLawnGuide
        if (showLawnGuide) uiNode({ node: this.tutorialLawnFlash, sprite: {} }).sprite!.color = tutorialFlashColor(snapshot.gameplayTick)
    }

    /** Level advice names pvz:strings keys; the server only sends keys. */
    private adviceText(key: string): string { return key ? this.ui.text(key) : '' }

    private syncAdvice(snapshot: WorldSnapshot, events: ServerEvent[], elapsedTicks: number, introComplete: boolean): void {
        if (snapshot.result === 'lost') { this.advice.clear(); return }
        if (snapshot.result === 'won') this.advice.clear()
        if (introComplete || this.presentation.adviceDuringIntro) {
            const message = this.adviceText(this.presentation.advice[snapshot.tutorial.step] ?? '')
            if (message !== this.adviceMessage) {
                this.adviceMessage = message
                if (message) this.advice.show(message, this.presentation.adviceStyle ?? (snapshot.tutorial.step === 'complete' ? 'tutorial-level1' : 'tutorial-level1-stay'))
                else this.advice.clear()
            }
        }
        for (const event of events) {
            if (event.type === 'levelWon') this.advice.clear()
            else if (event.type === 'advice') {
                const key = event.data.key
                const style = event.data.style
                if (typeof key === 'string') this.advice.show(this.adviceText(key),
                    style === 'hint' || style === 'tutorial-level2' || style === 'tutorial-later' || style === 'tutorial-later-stay' ? style : 'tutorial-level1')
            } else if (event.type === 'adviceCleared') {
                const key = event.data.key
                if (typeof key === 'string' && this.advice.snapshot()?.message === this.adviceText(key)) this.advice.clear()
            }
        }
        this.advice.update(elapsedTicks, snapshot.gameplayTick)
    }

    private syncProgress(snapshot: WorldSnapshot, introComplete: boolean): void {
        if (snapshot.wave.index !== this.progressWave) {
            this.progressWave = snapshot.wave.index
            this.progressCountdownStart = snapshot.wave.countdown
        } else this.progressCountdownStart = Math.max(this.progressCountdownStart, snapshot.wave.countdown)
        const denominator = Math.max(1, snapshot.wave.total - 1)
        const flagCount = this.level.waves.filter(wave => wave.flagWave).length
        const passedFlags = this.level.waves.filter((wave, index) => wave.flagWave && index < snapshot.wave.index).length
        const meterWidth = 150 - flagCount * 12
        const waveStart = ((snapshot.wave.index - 1) * meterWidth / denominator + passedFlags * 12) / 150
        const waveEnd = (snapshot.wave.index * meterWidth / denominator + passedFlags * 12) / 150
        const waveProgress = this.progressCountdownStart > 0 ? 1 - snapshot.wave.countdown / this.progressCountdownStart : 0
        const targetWidth = snapshot.wave.index > 0 ? Math.max(1 / 150, Math.min(1, waveStart + (waveEnd - waveStart) * waveProgress)) : 0
        const targetMeterWidth = Math.round(150 * targetWidth)
        const waveLength = meterWidth / denominator
        for (let tick = this.progressTick + 1; tick <= snapshot.gameplayTick; tick++) {
            const delta = targetMeterWidth - this.progressMeterWidth
            if ((delta > waveLength && tick % 5 === 0) || (delta > 0 && tick % 20 === 0)) this.progressMeterWidth++
        }
        this.progressTick = snapshot.gameplayTick
        const progress = this.progressMeterWidth / 150
        const visible = introComplete && snapshot.result !== 'lost'
        this.levelText.node.active = visible
        this.progressMeter.active = visible && progress > 0
        if (!visible) return
        // Board::DrawLevel: [LEVEL] followed by the stage.
        const level = `${this.ui.text('LEVEL')} ${adventureStage(this.level.adventureIndex)}`
        if (this.levelText.text !== level) this.levelText.text = level
        this.levelText.setPosition(progress > 0 ? 593 : 780, 595)
        if (progress <= 0) return
        this.level.waves.forEach((wave, index) => {
            if (wave.flagWave) {
                const flag = this.progressMeter.getChildByName(`ProgressFlag-${index}`)
                const raised = snapshot.wave.index > index + 1 ? 1 : snapshot.wave.index === index + 1
                    ? Math.min(1, (this.progressCountdownStart - snapshot.wave.countdown) / 100) : 0
                if (flag) flag.setPosition(flag.position.x, 3 + Math.round(14 * raised), 2)
            }
        })
        const fillWidth = Math.max(1, Math.round(PROGRESS_FILL_WIDTH * progress))
        const fillX = PROGRESS_METER_WIDTH - fillWidth - 7
        uiNode({ node: this.progressFillClip }).transform.setContentSize(fillWidth, PROGRESS_METER_HEIGHT)
        this.progressFillClip.setPosition(fillX, 0)
        this.progressFill.setPosition(-fillX, 0)
        this.progressHead.setPosition(138 - Math.round(135 * progress), 3, 3)
        this.progressHead.setSiblingIndex(this.progressMeter.children.length - 1)
    }

    private syncSun(value: number): void {
        const text = String(value)
        if (this.sunText.text !== text) this.sunText.text = text
        this.sunText.color = this.sunFlashTicks > 0 && this.sunFlashTicks % 20 < 10 ? Color.RED : Color.BLACK
    }

    private syncPreviews(snapshot: WorldSnapshot): void {
        const pointer = this.pointer
        const mobile = GameDebugSettings.isMobileMode()
        this.mobileGridGuide.active = false
        const seed = snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' && pointer !== undefined
        this.cursorPreview.active = seed
        if (!pointer || snapshot.result !== 'playing' || (!seed && !(mobile && snapshot.cursor.mode === 'tool'))) {
            this.gridPreview.active = false
            return
        }
        const board = this.content.definitions.boards[this.level.board]
        const seedDefinition = snapshot.cursor.mode === 'seed' ? this.content.definitions.seeds[snapshot.cursor.seedId] : undefined
        const plantId = seedDefinition?.plant
        const presentation = plantId ? plantDefinition(this.content.presentation, plantId) : undefined
        const { row, column, inBounds } = boardCell(board, pointer.x, pointer.y + (presentation?.pointerOffsetY ?? 0))
        let valid = inBounds && this.level.activeRows.includes(row)
        if (plantId) {
            this.cursorPreview.setPosition(pointer.x - 35, -pointer.y + 60)
            this.cursorPlant.setPlant(plantId)
            this.gridPlant.setPlant(plantId)
            const occupant = snapshot.plants.find(plant => this.content.definitions.plants[plant.typeId].occupiesCell !== false && plant.row === row && plant.column === column)
            const grave = !!graveAt(snapshot.graves, row, column)
            // Graves block planting, except for a grave buster, which needs one.
            const needsGrave = seedDefinition!.placement === 'grave'
            valid = valid && !occupant && grave === needsGrave && (!this.level.bowling || column <= this.level.bowling.lineColumn)
            this.gridPreview.active = valid && !mobile
            if (valid && !mobile) this.gridPreview.setPosition(board.origin.x + column * board.cell.width,
                -(board.origin.y + row * board.cell.height + (presentation?.drawHeightOffset ?? 0)))
        } else this.gridPreview.active = false
        if (valid && mobile) {
            this.mobileGridGuide.active = true
            const cell = row * board.columns + column
            if (cell !== this.mobileGuideCell) {
                this.mobileGuideCell = cell
                const graphics = this.mobileGridGuide.getComponent(Graphics)!
                graphics.clear()
                graphics.fillColor = new Color(255, 255, 255, 72)
                graphics.fillRect(board.origin.x, -(board.origin.y + (row + 1) * board.cell.height), board.columns * board.cell.width, board.cell.height)
                graphics.fillRect(board.origin.x + column * board.cell.width, -(board.origin.y + board.rows * board.cell.height), board.cell.width, board.rows * board.cell.height)
            }
        }
    }

    private isPointerOverItem(snapshot: WorldSnapshot): boolean {
        if (snapshot.paused || snapshot.result !== 'playing' || GameDebugSettings.isMobileMode() || !this.pointer || snapshot.cursor.mode !== 'none') return false
        const { x, y } = this.pointer
        return snapshot.items.some(item => {
            const definition = this.content.definitions.items[item.typeId]
            const size = definition ?? levelAwardSize(this.level.award)
            const extra = definition ? 15 : 0
            return item.state !== 'collecting' && x >= item.x - extra && x < item.x + size.width + extra &&
                y >= item.y - extra && y < item.y + size.height + extra
        })
    }

    /** Board::OffsetYForPlanting for the seed being planted. */
    pointerOffsetY(seedId: string): number {
        return plantDefinition(this.content.presentation, this.content.definitions.seeds[seedId].plant).pointerOffsetY ?? 0
    }

    private syncSeedTutorialArrow(visible: boolean): void {
        // Restore recreates particle nodes, so reuse the live arrow instead of caching its component.
        const [arrow, ...duplicates] = this.tutorialArrowLayer.children.filter(node =>
            node.getComponent(ParticlePlayer)?.id === 'pvz:seedpacketpick' && isValid(node, true),
        )
        for (const duplicate of duplicates) duplicate.destroy()
        if (!visible) {
            arrow?.destroy()
            return
        }
        const packet = this.seedBank.packets.find(packet => packet.seedId === (this.presentation.guideSeed ?? this.level.seedPackets[0]))!
        // The bank may sit in an edge container, so place the arrow by the packet's world position.
        const { x, y } = this.tutorialArrowLayer.inverseTransformPoint(new Vec3(), packet.view.node.worldPosition)
        if (arrow) {
            arrow.setPosition(x, y, 20)
            return
        }
        ParticlePlayer.spawn({ parent: this.tutorialArrowLayer, id: "pvz:seedpacketpick", x, y, z: 20 })
    }

}


function tutorialFlashColor(tick: number): Color {
    const age = tick % TUTORIAL_FLASH_TICKS
    const midpoint = Math.floor(TUTORIAL_FLASH_TICKS / 2)
    const gray = Math.max(55, Math.min(255, Math.floor(55 + 200 * Math.abs(midpoint - age) / midpoint)))
    return new Color(gray, gray, gray, 255)
}
