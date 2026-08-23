import { Color, EventMouse, EventTouch, Node, Sprite, tween } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import { uiNode } from '@/client/view/uiNode'
import { FontMetricsUtil, FontRenderer } from '@/client/font'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { TodParticleSystem } from '@/core/Particle'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { CursorManager } from '@/client/input/CursorManager'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { Adventure11AdviceSnapshotV2, Adventure11HudSnapshotV2 } from './Adventure11PresentationSnapshotV2'

const TUTORIAL_FLASH_TICKS = 75
const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_HEIGHT = 27
const PROGRESS_FILL_WIDTH = 143
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type FontAsset = Awaited<ReturnType<FontRepository['load']>>
type SpriteAsset = Awaited<ReturnType<SpriteRepository['load']>>

export interface Adventure11HudOptions {
    content: LoadedContent
    seedPacketSlot: Node
    rootLayer: number
    seeds: SpriteAsset
    packetPlants: SpriteAsset
    cachedPacketPlants: SpriteAsset
    packetCostFont: FontAsset
    adviceNode: Node
    adviceParent: Node
    adviceFont: FontAsset
    tutorialArrowLayer: Node
    tutorialLawnFlash: Node
    cursorPreview: Node
    gridPreview: Node
    cursorPlant: Sprite
    gridPlant: Sprite
    normalPreview: SpriteAsset
    repeaterPreview: SpriteAsset
    sunText: FontRenderer
    sunFont: FontAsset
    progressMeter: Node
    progressFillClip: Node
    progressFill: Node
    progressHead: Node
    levelText: FontRenderer
    levelFont: FontAsset
}

export class Adventure11HudPresenter {
    private adviceMessage = ''
    private adviceTick = 0
    private sunFlashTicks = 0
    private pointer?: { x: number, y: number }
    private tutorialArrow: TodParticleSystem | null = null
    private previousPacketCooldown?: number
    private progressWave = 0
    private progressCountdownStart = 0
    private progressMeterWidth = 0
    private progressTick = 0
    private lastSnapshot?: WorldSnapshot
    private lastIntroComplete = false

    static create(options: Adventure11HudOptions): Adventure11HudPresenter {
        const seedPacket = new SeedPacketView({
            name: 'PeashooterPacket', parent: options.seedPacketSlot, layer: options.rootLayer, x: 0, y: 0,
            seedType: 'peashooter', cost: 100, seeds: options.seeds,
            packetPlants: options.packetPlants, cachedPacketPlants: options.cachedPacketPlants,
            costFont: options.packetCostFont,
        })
        const advice = new AdviceWidget({ node: options.adviceNode, parent: options.adviceParent, font: options.adviceFont })
        return new Adventure11HudPresenter(
            options.content, options.tutorialArrowLayer, options.tutorialLawnFlash,
            options.cursorPreview, options.gridPreview, options.cursorPlant, options.gridPlant,
            options.normalPreview, options.repeaterPreview, seedPacket, options.sunText, options.sunFont,
            options.progressMeter, options.progressFillClip, options.progressFill, options.progressHead,
            options.levelText, options.levelFont, advice,
        )
    }

    private constructor(
        private readonly content: LoadedContent,
        private readonly tutorialArrowLayer: Node,
        private readonly tutorialLawnFlash: Node,
        private readonly cursorPreview: Node,
        private readonly gridPreview: Node,
        private readonly cursorPlant: Sprite,
        private readonly gridPlant: Sprite,
        private readonly normalPreview: SpriteAsset,
        private readonly repeaterPreview: SpriteAsset,
        private readonly seedPacket: SeedPacketView,
        private readonly sunText: FontRenderer,
        private readonly sunFont: FontAsset,
        private readonly progressMeter: Node,
        private readonly progressFillClip: Node,
        private readonly progressFill: Node,
        private readonly progressHead: Node,
        private readonly levelText: FontRenderer,
        private readonly levelFont: FontAsset,
        private readonly advice: AdviceWidget,
    ) {}

    get seedPacketNode(): Node {
        return this.seedPacket.node
    }

    snapshot(): { hud: Adventure11HudSnapshotV2, advice: Adventure11AdviceSnapshotV2 } {
        return {
            hud: {
                sunFlashTicks: this.sunFlashTicks,
                previousPacketCooldown: this.previousPacketCooldown ?? null,
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

    restore(snapshot: Adventure11HudSnapshotV2, advice: Adventure11AdviceSnapshotV2): void {
        this.sunFlashTicks = snapshot.sunFlashTicks
        this.previousPacketCooldown = snapshot.previousPacketCooldown ?? undefined
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
        const previousPacketCooldown = this.previousPacketCooldown
        this.syncSun(world.sun)
        this.syncProgress(world, this.lastIntroComplete)
        this.syncPreviews(world)
        this.syncCursor(world)
        this.syncSeedPacket(world, [], this.lastIntroComplete, false)
        this.previousPacketCooldown = previousPacketCooldown
    }

    setPointer(pointer?: { x: number, y: number }): void {
        this.pointer = pointer
    }

    resetCursor(): void {
        CursorManager.set('default')
    }

    bindSeedPacket(select: () => void): void {
        const onSelect = (event: EventMouse | EventTouch) => {
            select()
            event.propagationStopped = true
        }
        this.seedPacket.node.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (!GameDebugSettings.isMobileMode() && event.getButton() === 0) onSelect(event)
        })
        this.seedPacket.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (GameDebugSettings.isMobileMode()) onSelect(event)
        })
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[], introComplete: boolean): void {
        this.lastSnapshot = snapshot
        this.lastIntroComplete = introComplete
        const elapsedTicks = Math.max(0, snapshot.gameplayTick - this.adviceTick)
        this.sunFlashTicks = Math.max(0, this.sunFlashTicks - elapsedTicks)
        if (events.some(event => event.type === 'sunFlash')) this.sunFlashTicks = 70
        this.syncSun(snapshot.sun)
        this.syncProgress(snapshot, introComplete)
        this.syncPreviews(snapshot)
        this.syncCursor(snapshot)
        this.syncSeedPacket(snapshot, events, introComplete)
        this.syncAdvice(snapshot, events, elapsedTicks, introComplete)
        this.adviceTick = snapshot.gameplayTick
    }

    private syncSeedPacket(
        snapshot: WorldSnapshot,
        events: ServerEvent[],
        introComplete: boolean,
        allowTransientEffects = true,
    ): void {
        const packet = snapshot.seedPackets[0]
        if (packet) {
            const canAfford = snapshot.availableSun >= this.content.definitions.seeds[packet.seedId].sunCost
            const showSeedGuide = introComplete && (snapshot.tutorial.step === 'pick-first-seed' ||
                snapshot.tutorial.step === 'pick-second-seed') && packet.ready && canAfford
            this.seedPacket.sync({
                gameStarted: introComplete,
                active: packet.ready,
                selected: packet.selected,
                cooldownRemaining: packet.cooldownRemaining,
                cooldownTotal: packet.cooldownTotal,
                canAfford,
                tutorialColor: showSeedGuide ? tutorialFlashColor(snapshot.gameplayTick) : null,
                mobile: false,
            })
            this.syncSeedTutorialArrow(showSeedGuide)
            const cooldownFinished = this.previousPacketCooldown !== undefined &&
                this.previousPacketCooldown > 0 && packet.cooldownRemaining === 0 && canAfford
            const flashRequested = events.some(event => event.type === 'seedPacketFlashRequested' && event.data.seedId === packet.seedId)
            if (allowTransientEffects && (cooldownFinished || flashRequested)) this.spawnSeedPacketFlash()
            this.previousPacketCooldown = packet.cooldownRemaining
        }
        const showLawnGuide = introComplete && snapshot.cursor.mode === 'seed' &&
            (snapshot.tutorial.step === 'plant-first-seed' || snapshot.tutorial.step === 'plant-second-seed')
        this.tutorialLawnFlash.active = showLawnGuide
        if (showLawnGuide) uiNode({ node: this.tutorialLawnFlash, sprite: {} }).sprite!.color = tutorialFlashColor(snapshot.gameplayTick)
    }

    private syncAdvice(snapshot: WorldSnapshot, events: ServerEvent[], elapsedTicks: number, introComplete: boolean): void {
        if (snapshot.result === 'won') this.advice.clear()
        if (introComplete) {
            const message = statusLine(snapshot, this.content.strings.entries)
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
                if (typeof key === 'string') this.advice.show(contentText(this.content.strings.entries, key), 'tutorial-level1')
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
        const waveStart = (snapshot.wave.index - 1) / denominator
        const waveEnd = snapshot.wave.index / denominator
        const waveProgress = this.progressCountdownStart > 0 ? 1 - snapshot.wave.countdown / this.progressCountdownStart : 0
        const targetWidth = snapshot.wave.index > 0 ? Math.max(1 / 150, Math.min(1, waveStart + (waveEnd - waveStart) * waveProgress)) : 0
        const targetMeterWidth = Math.round(150 * targetWidth)
        const waveLength = 150 / denominator
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
        const level = 'Level 1-1'
        if (this.levelText.string !== level) {
            this.levelText.string = level
            this.levelText.forceRebuild()
        }
        const levelWidth = FontMetricsUtil.measureTextWidth(this.levelFont.config, level) || this.levelText.contentWidth
        const levelAscent = FontMetricsUtil.getMetrics(this.levelFont.config).ascent
        this.levelText.node.setPosition((progress > 0 ? 593 : 780) - levelWidth, -(595 - levelAscent))
        if (progress <= 0) return
        const fillWidth = Math.max(1, Math.round(PROGRESS_FILL_WIDTH * progress))
        const fillX = PROGRESS_METER_WIDTH - fillWidth - 7
        uiNode({ node: this.progressFillClip }).transform.setContentSize(fillWidth, PROGRESS_METER_HEIGHT)
        this.progressFillClip.setPosition(fillX, 0)
        this.progressFill.setPosition(-fillX, 0)
        this.progressHead.setPosition(138 - Math.round(135 * progress), 3)
    }

    private syncSun(value: number): void {
        const text = String(value)
        if (this.sunText.string !== text) this.sunText.string = text
        this.sunText.fontColor = this.sunFlashTicks > 0 && this.sunFlashTicks % 20 < 10 ? Color.RED : Color.BLACK
        this.sunText.forceRebuild()
        const metrics = FontMetricsUtil.getMetrics(this.sunFont.config)
        const width = FontMetricsUtil.measureTextWidth(this.sunFont.config, text) || this.sunText.contentWidth
        this.sunText.node.setPosition(34 - Math.trunc(width / 2), -(78 - metrics.ascent), 0)
    }

    private syncPreviews(snapshot: WorldSnapshot): void {
        const pointer = this.pointer
        const selected = snapshot.cursor.mode === 'seed' && pointer !== undefined
        this.cursorPreview.active = selected
        if (!selected) {
            this.gridPreview.active = false
            return
        }
        this.cursorPreview.setPosition(pointer.x - 35, -pointer.y + 60)
        const column = Math.floor((pointer.x - 40) / 80)
        const row = Math.floor((pointer.y - 80) / 100)
        const inBounds = pointer.x >= 40 && pointer.x < 760 && pointer.y >= 80 && pointer.y < 580 && row === 2
        const occupant = snapshot.plants.find(plant => plant.row === row && plant.column === column)
        const seedId = snapshot.cursor.mode === 'seed' ? snapshot.cursor.seedId : undefined
        const upgrade = occupant && this.content.loadedMods.plantUpgrades.find(candidate =>
            candidate.seedId === seedId && candidate.targetPlantId === occupant.typeId)
        const preview = upgrade?.resultSeedId === 'pvz:repeater' ? this.repeaterPreview : this.normalPreview
        this.cursorPlant.spriteFrame = preview
        this.gridPlant.spriteFrame = preview
        const valid = inBounds && (!occupant || upgrade !== undefined)
        this.gridPreview.active = valid
        if (valid) this.gridPreview.setPosition(40 + column * 80, -(80 + row * 100))
    }

    private syncCursor(snapshot: WorldSnapshot): void {
        if (snapshot.result !== 'playing' || GameDebugSettings.isMobileMode() || !this.pointer || snapshot.cursor.mode === 'seed') {
            CursorManager.set('default')
            return
        }
        const { x, y } = this.pointer
        const packet = snapshot.seedPackets[0]
        const rect = this.seedPacket.rect()
        const overPacket = packet?.ready && snapshot.availableSun >= this.content.definitions.seeds[packet.seedId].sunCost &&
            x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
        const overItem = snapshot.items.some(item => item.state !== 'collecting' &&
            x >= item.x - 15 && x < item.x + 75 && y >= item.y - 15 && y < item.y + 75)
        CursorManager.set(overPacket || overItem ? 'pointer' : 'default')
    }

    private syncSeedTutorialArrow(visible: boolean): void {
        if (!visible) {
            if (this.tutorialArrow?.node.isValid) this.tutorialArrow.node.destroy()
            this.tutorialArrow = null
            return
        }
        const rect = this.seedPacket.rect()
        if (this.tutorialArrow?.node.isValid) {
            this.tutorialArrow.node.setPosition(rect.x, -rect.y, 20)
            return
        }
        this.tutorialArrow = TodParticleSystem.spawn({ parent: this.tutorialArrowLayer, effect: 'seedpacketpick', x: rect.x, y: -rect.y, z: 20 })
    }

    private spawnSeedPacketFlash(): void {
        const node = uiNode({
            name: 'ParticleSystem_seedpacketflash', parent: this.seedPacket.node,
            position: { x: 0, y: 0, z: 16 },
        }).node
        const player = node.addComponent(ParticlePlayer)
        void player.load('pvz:seedpacketflash', this.content.registry, this.content.loader).then(() => {
            if (!node.isValid) return
            player.play()
            tween(node).delay(0.26).call(() => { if (node.isValid) node.destroy() }).start()
        }).catch(error => {
            if (node.isValid) node.destroy()
            console.error('[Phase4] Failed to play seed packet flash', error)
        })
    }
}

function statusLine(snapshot: WorldSnapshot, strings: Record<string, string>): string {
    if (snapshot.result === 'won') return ''
    if (snapshot.result === 'lost') return contentText(strings, 'ADVICE_ZOMBIES_ATE_BRAINS')
    switch (snapshot.tutorial.step) {
        case 'pick-first-seed': return contentText(strings, 'ADVICE_CLICK_SEED_PACKET')
        case 'plant-first-seed': return contentText(strings, 'ADVICE_CLICK_ON_GRASS')
        case 'first-plant-done': return contentText(strings, 'ADVICE_PLANTED_PEASHOOTER')
        case 'collect-first-sun': return contentText(strings, 'ADVICE_CLICK_ON_SUN')
        case 'collect-more-sun': return contentText(strings, 'ADVICE_CLICKED_ON_SUN')
        case 'enough-sun': return contentText(strings, 'ADVICE_ENOUGH_SUN')
        case 'pick-second-seed': return contentText(strings, 'ADVICE_CLICK_PEASHOOTER')
        case 'plant-second-seed': return ''
        default: return contentText(strings, 'ADVICE_ZOMBIE_ONSLAUGHT')
    }
}

function contentText(strings: Record<string, string>, key: string): string {
    const value = strings[key]
    if (!value) throw new Error(`Missing gameplay string: ${key}`)
    return value
}

function tutorialFlashColor(tick: number): Color {
    const age = tick % TUTORIAL_FLASH_TICKS
    const midpoint = Math.floor(TUTORIAL_FLASH_TICKS / 2)
    const gray = Math.max(55, Math.min(255, Math.round(55 + 200 * Math.abs(midpoint - age) / midpoint)))
    return new Color(gray, gray, gray, 255)
}
