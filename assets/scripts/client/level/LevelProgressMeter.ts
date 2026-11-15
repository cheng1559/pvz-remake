import { modResources } from '@/client/content/ModResources'
import { Color, Mask, type Node, Sprite } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { uiAreaEdge } from '@/client/view/ClientViewport'
import type { LevelSlots } from './LevelSlots'
import type { Content } from './LevelStage'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { WorldSnapshot } from '@/shared/protocol/index'
import { adventureStage } from './LevelGeometry'
import type { LevelHudSnapshot } from './LevelPresentationSnapshot'

const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_HEIGHT = 27
const PROGRESS_FILL_WIDTH = 143

/** The meter's nodes: its frame, the clip of its fill and the fill, the zombie head, and the level's name beside it. */
export interface LevelProgressMeterNodes {
    readonly meter: Node
    readonly fillClip: Node
    readonly fill: Node
    readonly head: Node
    readonly levelText: UILabel
}

/**
 * Board::DrawProgressMeter and Board::DrawLevel: the level's name, and the wave meter filling towards each wave as its
 * countdown runs, a pixel at a time (Board::UpdateProgressMeter), with its flags raised as their waves come.
 */
export class LevelProgressMeter {
    private wave = 0
    private countdownStart = 0
    private width = 0
    private tick = 0

    /** Its nodes in the level's layout, kept off the UI area's right edge, with a flag for each flag wave of `wave`. */
    static async create(content: Content, ui: UI, slots: LevelSlots, hud: Node, wave: WorldSnapshot['wave'], font: BitmapFontAssets): Promise<LevelProgressMeterNodes> {
        const [flagMeter, flagMeterParts, flagMeterLevelProgress] = await Promise.all(['pvz:flagmeter', 'pvz:flagmeterparts', 'pvz:flagmeterlevelprogress'].map(id => modResources.sprite(id)))
        // The progress meter and level name keep their margin from the UI area's right edge, in the same draw order.
        const hudRight = uiAreaEdge(hud, 'right')
        hudRight.setSiblingIndex(slots.progressMeter.getSiblingIndex())
        slots.progressMeter.setParent(hudRight)
        slots.levelText.setParent(hudRight)
        const progressMeter = uiNode({
            node: slots.progressMeter, position: { x: 600, y: -575 },
            size: { width: PROGRESS_METER_WIDTH, height: PROGRESS_METER_HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        uiNode({
            node: slots.progressBack, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeter, 0, PROGRESS_METER_WIDTH, PROGRESS_METER_HEIGHT, 1), sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const progressFillClip = uiNode({
            node: slots.progressFillClip, position: { x: 150 }, anchor: { x: 0, y: 1 },
            size: { width: 1, height: PROGRESS_METER_HEIGHT }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        const progressFill = uiNode({
            node: slots.progressFill, position: { x: -150 }, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeter, 1, PROGRESS_METER_WIDTH, PROGRESS_METER_HEIGHT, 1), sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        uiNode({
            node: slots.progressTrack, position: { x: 38, y: -14 }, anchor: { x: 0, y: 1 },
            sprite: { frame: flagMeterLevelProgress, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const progressHead = uiNode({
            node: slots.progressHead, position: { x: 138, y: 3, z: 3 }, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeterParts, 0, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        // A wave rule builds the waves per game, so the flags come with the snapshot.
        for (const index of wave.flagWaves) {
            const x = 148 - 142 * (index + 1) / wave.total
            uiNode({
                name: `ProgressFlagPole-${index}`, parent: progressMeter, position: { x, y: 4, z: 2 }, anchor: { x: 0, y: 1 },
                sprite: { frame: getAtlasFrame(flagMeterParts, 1, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
            uiNode({
                name: `ProgressFlag-${index}`, parent: progressMeter, position: { x, y: 3, z: 2 }, anchor: { x: 0, y: 1 },
                sprite: { frame: getAtlasFrame(flagMeterParts, 2, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
        }
        // Board::DrawProgressMeter draws the flags, then the "Level Progress" label, then the zombie head.
        slots.progressTrack.setSiblingIndex(progressMeter.children.length - 1)
        progressHead.setSiblingIndex(progressMeter.children.length - 1)
        const levelText = ui.label(slots.levelText.parent!, {
            node: slots.levelText, text: '', font, color: new Color(224, 187, 98, 255),
            x: 780, y: 595, align: 'right', baseline: true,
        })
        progressMeter.active = false
        levelText.node.active = false
        return { meter: progressMeter, fillClip: progressFillClip, fill: progressFill, head: progressHead, levelText }
    }

    constructor(private readonly ui: UI, private readonly level: LevelDefinition, private readonly nodes: LevelProgressMeterNodes) {}

    snapshot(): Pick<LevelHudSnapshot, 'progressWave' | 'progressCountdownStart' | 'progressMeterWidth' | 'progressTick'> {
        return { progressWave: this.wave, progressCountdownStart: this.countdownStart, progressMeterWidth: this.width, progressTick: this.tick }
    }

    restore(snapshot: LevelHudSnapshot): void {
        this.wave = snapshot.progressWave
        this.countdownStart = snapshot.progressCountdownStart
        this.width = snapshot.progressMeterWidth
        this.tick = snapshot.progressTick
    }

    sync(snapshot: WorldSnapshot, introComplete: boolean): void {
        if (snapshot.wave.index !== this.wave) {
            this.wave = snapshot.wave.index
            this.countdownStart = snapshot.wave.countdown
        } else this.countdownStart = Math.max(this.countdownStart, snapshot.wave.countdown)
        const denominator = Math.max(1, snapshot.wave.total - 1)
        const flagCount = snapshot.wave.flagWaves.length
        const passedFlags = snapshot.wave.flagWaves.filter(index => index < snapshot.wave.index).length
        const meterWidth = 150 - flagCount * 12
        const waveStart = ((snapshot.wave.index - 1) * meterWidth / denominator + passedFlags * 12) / 150
        const waveEnd = (snapshot.wave.index * meterWidth / denominator + passedFlags * 12) / 150
        const waveProgress = this.countdownStart > 0 ? 1 - snapshot.wave.countdown / this.countdownStart : 0
        const targetWidth = snapshot.wave.index > 0 ? Math.max(1 / 150, Math.min(1, waveStart + (waveEnd - waveStart) * waveProgress)) : 0
        const targetMeterWidth = Math.round(150 * targetWidth)
        const waveLength = meterWidth / denominator
        for (let tick = this.tick + 1; tick <= snapshot.gameplayTick; tick++) {
            const delta = targetMeterWidth - this.width
            if ((delta > waveLength && tick % 5 === 0) || (delta > 0 && tick % 20 === 0)) this.width++
        }
        this.tick = snapshot.gameplayTick
        const progress = this.width / 150
        const visible = introComplete && snapshot.result !== 'lost'
        const { meter, fillClip, fill, head, levelText } = this.nodes
        levelText.node.active = visible
        meter.active = visible && progress > 0
        if (!visible) return
        // Board::DrawLevel: [LEVEL] followed by the stage.
        const level = `${this.ui.text('LEVEL')} ${adventureStage(this.level.adventureIndex)}`
        if (levelText.text !== level) levelText.text = level
        levelText.setPosition(progress > 0 ? 593 : 780, 595)
        if (progress <= 0) return
        for (const index of snapshot.wave.flagWaves) {
            const flag = meter.getChildByName(`ProgressFlag-${index}`)
            const raised = snapshot.wave.index > index + 1 ? 1 : snapshot.wave.index === index + 1
                ? Math.min(1, (this.countdownStart - snapshot.wave.countdown) / 100) : 0
            if (flag) flag.setPosition(flag.position.x, 3 + Math.round(14 * raised), 2)
        }
        const fillWidth = Math.max(1, Math.round(PROGRESS_FILL_WIDTH * progress))
        const fillX = PROGRESS_METER_WIDTH - fillWidth - 7
        uiNode({ node: fillClip }).transform.setContentSize(fillWidth, PROGRESS_METER_HEIGHT)
        fillClip.setPosition(fillX, 0)
        fill.setPosition(-fillX, 0)
        head.setPosition(138 - Math.round(135 * progress), 3, 3)
        head.setSiblingIndex(meter.children.length - 1)
    }
}
