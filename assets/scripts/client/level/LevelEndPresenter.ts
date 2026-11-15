import { Color, Graphics, Node, UITransform } from 'cc'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelEndSnapshot } from './LevelPresentationSnapshot'
import { fitViewport } from '@/client/view/ClientViewport'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>

export class LevelEndPresenter {
    private ticks = -1

    /** Ticks since the level was won, -1 before (LevelStage.levelEndTicks). */
    get elapsed(): number { return this.ticks }
    private finalWave: ReanimPlayer | null = null
    private hugeWaveTicks = 0
    private hugeWave: UILabel | null = null
    private paperAward = false

    constructor(
        private readonly content: LoadedContent,
        private readonly overlayLayer: Node,
        private readonly fade: Node,
        private readonly audio: LevelAudioPresenter,
        private readonly ui: UI,
    ) {
        fitViewport(fade, () => this.syncFade())
    }

    /** Board::UpdateLevelEndSequence's length: 600 ticks, 500 for a note. */
    private get duration(): number { return this.paperAward ? 500 : 600 }

    snapshot(): LevelEndSnapshot {
        return { ticks: this.ticks, finalWave: this.finalWave?.snapshot() ?? null, ...(this.hugeWaveTicks > 0 ? { hugeWaveTicks: this.hugeWaveTicks } : {}) }
    }

    /** `completionStarted`: the saved level had gone on to its award screen, which it did once the end ran its length. */
    async restore(snapshot: LevelEndSnapshot, completionStarted: boolean): Promise<void> {
        if (snapshot.ticks > this.duration) throw new Error('Saved level end runs past its award')
        if (completionStarted !== (snapshot.ticks >= this.duration)) throw new Error('Level presentation completion flow and end ticks are inconsistent')
        this.ticks = snapshot.ticks
        this.hugeWaveTicks = snapshot.hugeWaveTicks ?? 0
        this.syncHugeWave()
        this.syncFade()
        if (this.finalWave?.node.isValid) this.finalWave.node.destroy()
        this.finalWave = null
        if (snapshot.finalWave) await this.createFinalWave(snapshot.finalWave)
    }

    update(dt: number): boolean {
        if (this.hugeWaveTicks > 0) {
            this.hugeWaveTicks = Math.max(0, this.hugeWaveTicks - dt * 100)
            this.syncHugeWave()
        }
        const duration = this.duration
        if (this.ticks < 0 || this.ticks >= duration) return false
        const previous = this.ticks
        this.ticks = Math.min(duration, this.ticks + dt * 100)
        if (!this.paperAward && previous < 300 && this.ticks >= 300) this.audio.lightFill()
        this.syncFade()
        return this.ticks >= duration
    }

    cancelWarnings(): void {
        this.hugeWaveTicks = 0
        this.syncHugeWave()
        if (this.finalWave?.node.isValid) this.finalWave.node.destroy()
        this.finalWave = null
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        this.paperAward = this.content.levels.levels[snapshot.levelId].award.kind === 'note'
        if (snapshot.result === 'won') this.start()
        for (const event of events) {
            if (event.type === 'levelWon') this.start()
            else if (event.type === 'hugeWave') { this.hugeWaveTicks = 750; this.syncHugeWave() }
            else if (event.type === 'finalWave') {
                // Board::UpdateZombieSpawning clears the huge wave advice before NextWaveComing shows the final wave.
                this.hugeWaveTicks = 0
                this.syncHugeWave()
                void this.createFinalWave()
            }
        }
    }

    private syncHugeWave(): void {
        if (this.hugeWaveTicks <= 0) {
            if (this.hugeWave?.node.isValid) this.hugeWave.node.parent!.active = false
            return
        }
        if (!this.hugeWave?.node.isValid) {
            const node = uiNode({ name: 'HugeWave', parent: this.overlayLayer, position: { x: 0, y: -57.5 } }).node
            this.hugeWave = this.ui.label(node, {
                text: this.ui.text('ADVICE_HUGE_WAVE'), font: 'pageTitle', color: Color.RED,
                x: -380, y: -55.5, width: 760, align: 'center',
            })
        }
        const node = this.hugeWave.node.parent!
        node.active = true
        const enter = Math.min(1, (750 - this.hugeWaveTicks) / 20)
        const scale = 2.003 - 1.002 * enter
        node.setScale(scale, scale, 1)
        uiNode({ node, opacity: Math.round(255 * Math.min(enter, this.hugeWaveTicks / 40, 1)) })
    }

    private start(): void {
        if (this.ticks < 0) this.ticks = 0
    }

    private syncFade(): void {
        const alpha = Math.round(255 * Math.max(0, this.ticks - (this.paperAward ? 300 : 400)) / 200)
        const graphics = this.fade.getComponent(Graphics)
        if (!graphics) return
        graphics.clear()
        this.fade.active = alpha > 0
        if (alpha <= 0) return
        const value = this.paperAward ? 0 : 255
        graphics.fillColor = new Color(value, value, value, alpha)
        const { width, height } = this.fade.getComponent(UITransform)!.contentSize
        graphics.fillRect(-width / 2, -height / 2, width, height)
    }

    private async createFinalWave(snapshot?: LevelEndSnapshot['finalWave']): Promise<void> {
        if (this.finalWave?.node.isValid) return
        const node = uiNode({
            name: 'FinalWave', parent: this.overlayLayer, position: { x: -400, y: 300 },
            size: { width: 800, height: 600 }, anchor: { x: 0, y: 1 },
        }).node
        const player = node.addComponent(ReanimPlayer)
        this.finalWave = player
        try {
            await player.load('pvz:finalwave')
            if (!node.isValid) return
            const finish = () => {
                if (node.isValid) node.destroy()
                if (this.finalWave === player) this.finalWave = null
            }
            if (snapshot) {
                player.restore(snapshot)
                player.setOnFinish(finish)
            } else {
                player.play({ loop: false, rate: 1, onFinish: finish })
                this.audio.finalWave(node)
            }
        } catch (error) {
            if (node.isValid) node.destroy()
            if (this.finalWave === player) this.finalWave = null
            console.error('[Level] Failed to play final-wave warning', error)
        }
    }
}
