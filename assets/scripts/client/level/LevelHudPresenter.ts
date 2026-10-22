import { Color, Graphics, isValid, Node } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { FontRepository } from '@/client/content/ClientContentLoader'
import { uiNode } from '@/client/view/uiNode'
import { PlantPreview } from '@/client/hud/PlantPreview'
import type { SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { TodParticleSystem } from '@/core/Particle'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { UIHoverManager, type UIHoverPointer } from '@/client/input/UIHoverManager'
import { UIButton } from '@/client/ui/UIButton'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { LevelSeedBank } from './LevelSeedBank'
import { adventureLevelName, boardCell } from './LevelGeometry'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelPresentation } from './LevelPresentation'
import type { LevelAdviceSnapshot, LevelHudSnapshot } from './LevelPresentationSnapshot'

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
    presentation: LevelPresentation
    seedPacketSlot: Node
    rootLayer: number
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
    packetCostFont: FontAsset
    adviceNode: Node
    adviceParent: Node
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
}

export class LevelHudPresenter {
    private adviceMessage = ''
    private adviceTick = 0
    private sunFlashTicks = 0
    private pointer?: { x: number, y: number }
    private progressWave = 0
    private progressCountdownStart = 0
    private progressMeterWidth = 0
    private progressTick = 0
    private lastSnapshot?: WorldSnapshot
    private lastIntroComplete = false
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
        presenter.menuButton = options.ui.button(options.adviceParent, {
            text: options.ui.text('MENU_BUTTON'), x: 681, y: -10, width: 117, height: 46,
            rightClickTriggers: false, enabled: false, clickSound: null,
        })
        presenter.menuButton.node.name = 'MenuButton'
        presenter.mobileGridGuide = options.mobileGridGuide
        presenter.menuButton.node.active = false
        presenter.menuButton.node.setSiblingIndex(options.cursorPreview.getSiblingIndex())
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

    get seedPacketNode(): Node {
        return this.seedBank.packets[0].view.node
    }

    snapshot(): { hud: LevelHudSnapshot, advice: LevelAdviceSnapshot } {
        return {
            hud: {
                sunFlashTicks: this.sunFlashTicks,
                previousPacketCooldown: this.seedBank.previousCooldown,
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

    restore(snapshot: LevelHudSnapshot, advice: LevelAdviceSnapshot, introComplete: boolean): void {
        this.lastIntroComplete = introComplete
        this.sunFlashTicks = snapshot.sunFlashTicks
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
        this.syncMenu(world, this.lastIntroComplete)
        this.syncSun(world.sun)
        this.syncProgress(world, this.lastIntroComplete)
        this.syncPreviews(world)
        UIHoverManager.refreshHoverStates()
        this.syncSeedPacket(world, [], this.lastIntroComplete, false)
        this.seedBank.restore(world, snapshot.previousPacketCooldown)
    }

    setPointer(pointer?: { x: number, y: number }): void {
        this.pointer = pointer
        UIHoverManager.refreshHoverStates()
    }

    resetCursor(): void {
        this.setPointer()
    }

    bindSeedPackets(select: (seedId: string) => void): UIButton[] {
        return this.seedBank.bind(select)
    }

    bindMenu(open: () => void): UIButton {
        this.menuButton.onClick = open
        return this.menuButton
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[], introComplete: boolean): void {
        this.lastSnapshot = snapshot
        this.lastIntroComplete = introComplete
        this.syncMenu(snapshot, introComplete)
        const elapsedTicks = Math.max(0, snapshot.gameplayTick - this.adviceTick)
        this.sunFlashTicks = Math.max(0, this.sunFlashTicks - elapsedTicks)
        if (events.some(event => event.type === 'sunFlash')) this.sunFlashTicks = 70
        this.syncSun(snapshot.sun)
        this.syncProgress(snapshot, introComplete)
        this.syncPreviews(snapshot)
        this.syncSeedPacket(snapshot, events, introComplete)
        UIHoverManager.refreshHoverStates()
        this.syncAdvice(snapshot, events, elapsedTicks, introComplete)
        this.adviceTick = snapshot.gameplayTick
    }

    private syncMenu(snapshot: WorldSnapshot, introComplete: boolean): void {
        this.menuButton.node.active = introComplete && snapshot.result !== 'lost'
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
        const canAfford = packet && ((snapshot.extensions['pvz:debug'] as { sunCost?: boolean } | undefined)?.sunCost === false
            || snapshot.availableSun >= this.content.definitions.seeds[packet.seedId].sunCost)
        this.syncSeedTutorialArrow(!!(showSeedGuide && packet?.ready && canAfford))
        const showLawnGuide = introComplete && snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' &&
            this.presentation.lawnGuideSteps.includes(snapshot.tutorial.step)
        this.tutorialLawnFlash.active = showLawnGuide
        if (showLawnGuide) uiNode({ node: this.tutorialLawnFlash, sprite: {} }).sprite!.color = tutorialFlashColor(snapshot.gameplayTick)
    }

    private syncAdvice(snapshot: WorldSnapshot, events: ServerEvent[], elapsedTicks: number, introComplete: boolean): void {
        if (snapshot.result === 'lost') { this.advice.clear(); return }
        if (snapshot.result === 'won') this.advice.clear()
        if (introComplete) {
            const message = contentText(this.content.strings.entries, this.presentation.advice[snapshot.tutorial.step] ?? '')
            if (message !== this.adviceMessage) {
                this.adviceMessage = message
                if (message) this.advice.show(message, snapshot.tutorial.step === 'complete' ? 'tutorial-level1' : 'tutorial-level1-stay')
                else this.advice.clear()
            }
        }
        for (const event of events) {
            if (event.type === 'levelWon') this.advice.clear()
            else if (event.type === 'advice') {
                const key = event.data.key
                if (typeof key === 'string') this.advice.show(contentText(this.content.strings.entries, key), event.data.style === 'tutorial-level2' ? 'tutorial-level2' : 'tutorial-level1')
            } else if (event.type === 'adviceCleared') {
                const key = event.data.key
                if (typeof key === 'string' && this.advice.snapshot()?.message === contentText(this.content.strings.entries, key)) this.advice.clear()
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
        const level = adventureLevelName(this.level.adventureIndex)
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
        const selected = snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' && pointer !== undefined
        this.cursorPreview.active = selected
        if (!selected) {
            this.gridPreview.active = false
            return
        }
        this.cursorPreview.setPosition(pointer.x - 35, -pointer.y + 60)
        const board = this.content.definitions.boards[this.level.board]
        const { row, column, inBounds } = boardCell(board, pointer.x, pointer.y)
        const occupant = snapshot.plants.find(plant => plant.row === row && plant.column === column)
        const seedId = snapshot.cursor.mode === 'seed' ? snapshot.cursor.seedId : undefined
        const upgrade = occupant && this.content.loadedMods.plantUpgrades.find(candidate =>
            candidate.seedId === seedId && candidate.targetPlantId === occupant.typeId)
        const previewSeedId = upgrade?.resultSeedId ?? seedId!
        const plantId = this.content.definitions.seeds[previewSeedId].plant
        this.cursorPlant.setPlant(plantId)
        this.gridPlant.setPlant(plantId)
        const valid = inBounds && this.level.activeRows.includes(row) && (!occupant || upgrade !== undefined)
        this.gridPreview.active = valid && !mobile
        if (valid && !mobile) this.gridPreview.setPosition(board.origin.x + column * board.cell.width, -(board.origin.y + row * board.cell.height))
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
        if (snapshot.paused || snapshot.result !== 'playing' || GameDebugSettings.isMobileMode() || !this.pointer || snapshot.cursor.mode === 'seed') return false
        const { x, y } = this.pointer
        const overItem = snapshot.items.some(item => item.state !== 'collecting' &&
            x >= item.x - 15 && x < item.x + 75 && y >= item.y - 15 && y < item.y + 75)
        return overItem
    }

    private syncSeedTutorialArrow(visible: boolean): void {
        // Restore recreates particle nodes, so reuse the live arrow instead of caching its component.
        const [arrow, ...duplicates] = this.tutorialArrowLayer.children.filter(node =>
            node.name === 'ParticleSystem_seedpacketpick' && isValid(node, true),
        )
        for (const duplicate of duplicates) duplicate.destroy()
        if (!visible) {
            arrow?.destroy()
            return
        }
        const rect = this.seedBank.packets.find(packet => packet.seedId === (this.presentation.guideSeed ?? this.level.seedPackets[0]))!.view.rect()
        if (arrow) {
            arrow.setPosition(rect.x, -rect.y, 20)
            return
        }
        TodParticleSystem.spawn({ parent: this.tutorialArrowLayer, effect: 'seedpacketpick', x: rect.x, y: -rect.y, z: 20 })
    }

}

function contentText(strings: Record<string, string>, key: string): string {
    if (!key) return ''
    const value = strings[key]
    if (!value) throw new Error(`Missing gameplay string: ${key}`)
    return value
}

function tutorialFlashColor(tick: number): Color {
    const age = tick % TUTORIAL_FLASH_TICKS
    const midpoint = Math.floor(TUTORIAL_FLASH_TICKS / 2)
    const gray = Math.max(55, Math.min(255, Math.floor(55 + 200 * Math.abs(midpoint - age) / midpoint)))
    return new Color(gray, gray, gray, 255)
}
