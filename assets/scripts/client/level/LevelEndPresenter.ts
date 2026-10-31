import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { Color, Graphics, Node, UITransform } from 'cc'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH } from '@/client/hud/SeedPacketRenderer'
import type { ItemSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelEndSnapshot } from './LevelPresentationSnapshot'
import { levelAwardSize } from './LevelGeometry'
import { fitViewport } from '@/client/view/ClientViewport'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>

export class LevelEndPresenter {
    private ticks = -1
    private finalWave: ReanimPlayer | null = null
    private hugeWaveTicks = 0
    private hugeWave: UILabel | null = null
    private paperAward = false

    constructor(
        private readonly content: LoadedContent,
        private readonly awardLayer: Node,
        private readonly overlayLayer: Node,
        private readonly fade: Node,
        private readonly entityNode: (id: number) => Node | undefined,
        private readonly audio: LevelAudioPresenter,
        private readonly ui: UI,
    ) {
        fitViewport(fade, () => this.syncFade())
    }

    snapshot(): LevelEndSnapshot {
        return { ticks: this.ticks, ...(this.paperAward ? { durationTicks: 500 } : {}),
            finalWave: this.finalWave?.snapshot() ?? null, ...(this.hugeWaveTicks > 0 ? { hugeWaveTicks: this.hugeWaveTicks } : {}) }
    }

    async restore(snapshot: LevelEndSnapshot): Promise<void> {
        if ((snapshot.durationTicks ?? 600) !== (this.paperAward ? 500 : 600)) throw new Error('Saved award duration does not match the level')
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
        const duration = this.paperAward ? 500 : 600
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
            else if (event.type === 'levelAwardCollected') this.playAwardCollected(event)
            else if (event.type === 'hugeWave') { this.hugeWaveTicks = 750; this.syncHugeWave() }
            else if (event.type === 'finalWave') {
                // Board::UpdateZombieSpawning clears the huge wave advice before NextWaveComing shows the final wave.
                this.hugeWaveTicks = 0
                this.syncHugeWave()
                void this.createFinalWave()
            }
        }
    }

    syncAward(item: ItemSnapshot, levelId: string): boolean {
        const award = this.content.levels.levels[levelId].award
        if (item.typeId !== award.id) return false
        const node = this.entityNode(item.entityId)
        if (!node) return true
        const size = levelAwardSize(award)
        let { x, y, scale } = item
        if (award.kind !== 'note' && item.state === 'collecting' && this.ticks >= 0) {
            const moveTime = Math.min(1, this.ticks / 350)
            const moveEaseOut = 2 * moveTime - moveTime * moveTime
            x += (400 - size.width / 2 - x) * moveEaseOut
            y += (200 - size.height / 2 - y) * moveEaseOut
            const scaleTime = Math.min(1, this.ticks / 400)
            const smoothStep = 3 * scaleTime * scaleTime - 2 * scaleTime * scaleTime * scaleTime
            const scaleEase = 3 * smoothStep * smoothStep - 2 * smoothStep * smoothStep * smoothStep
            scale = 1.01 + 0.99 * scaleEase
        }
        node.setPosition(x + size.width / 2, -(y + size.height / 2))
        uiNode({ node, opacity: award.kind === 'note' && item.state === 'collecting' && this.ticks >= 0
            ? Math.round(item.alpha * Math.max(0, 1 - this.ticks / 15)) : item.alpha })
        this.syncAwardVisual(node, scale, item.state === 'collecting')
        return true
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

    private playAwardCollected(event: ServerEvent): void {
        const entityId = event.data.entityId
        const x = event.data.x
        const y = event.data.y
        if (typeof entityId !== 'number' || typeof x !== 'number' || typeof y !== 'number') return
        const item = this.entityNode(entityId)
        ParticlePlayer.spawn({
            parent: this.awardLayer,
            id: "pvz:starburst",
            x: x + 30,
            y: -(y + 30),
            z: 1,
        })
        if (!item?.isValid) return
        for (const particle of item.getComponentsInChildren(ParticlePlayer)) {
            if (particle.id === 'pvz:seedpacket' || particle.id === 'pvz:awardpickuparrow') particle.node.destroy()
        }
        ParticlePlayer.spawn({
            parent: item.getChildByName('AwardBackEffects') ?? item,
            id: this.paperAward ? "pvz:presentpickup" : "pvz:award",
            x: 0,
            y: 0,
            z: -1,
        })
    }

    private syncAwardVisual(node: Node, scale: number, collecting: boolean): void {
        const visualScale = Math.max(0.001, scale)
        const normal = node.getChildByName('FinalSeedPacketNormal')
        const large = node.getChildByName('FinalSeedPacketLarge')
        node.getChildByName('AwardImage')?.setScale(visualScale, visualScale, 1)
        const x = -SEED_PACKET_WIDTH * visualScale / 2
        const y = SEED_PACKET_HEIGHT * visualScale / 2
        if (normal) {
            normal.active = visualScale <= 1
            normal.setPosition(x, y)
            normal.setScale(visualScale, visualScale, 1)
        }
        if (large) {
            large.active = visualScale > 1
            large.setPosition(x, y)
            large.setScale(visualScale / 2, visualScale / 2, 1)
        }
        for (const particle of node.getComponentsInChildren(ParticlePlayer)) {
            particle.overrideScale(visualScale)
            if (collecting && particle.id === 'pvz:seedpacket') particle.node.destroy()
        }
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
            await player.load('pvz:finalwave', this.content.registry, this.content.loader)
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
