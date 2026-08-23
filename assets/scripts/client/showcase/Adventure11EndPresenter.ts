import { Color, Graphics, Node } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { TodParticleSystem } from '@/core/Particle'
import { SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH } from '@/client/hud/SeedPacketRenderer'
import type { ItemSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { Adventure11AudioPresenter } from './Adventure11AudioPresenter'
import type { Adventure11EndSnapshotV2 } from './Adventure11PresentationSnapshotV2'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>

export class Adventure11EndPresenter {
    private ticks = -1
    private finalWave: ReanimPlayer | null = null

    constructor(
        private readonly content: LoadedContent,
        private readonly awardLayer: Node,
        private readonly overlayLayer: Node,
        private readonly fade: Node,
        private readonly entityNode: (id: number) => Node | undefined,
        private readonly audio: Adventure11AudioPresenter,
    ) {}

    snapshot(): Adventure11EndSnapshotV2 {
        return { ticks: this.ticks, finalWave: this.finalWave?.snapshot() ?? null }
    }

    async restore(snapshot: Adventure11EndSnapshotV2): Promise<void> {
        this.ticks = snapshot.ticks
        this.syncFade()
        if (this.finalWave?.node.isValid) this.finalWave.node.destroy()
        this.finalWave = null
        if (snapshot.finalWave) await this.createFinalWave(snapshot.finalWave)
    }

    update(dt: number): boolean {
        if (this.ticks < 0 || this.ticks >= 600) return false
        const previous = this.ticks
        this.ticks = Math.min(600, this.ticks + dt * 100)
        if (previous < 300 && this.ticks >= 300) this.audio.lightFill()
        this.syncFade()
        return this.ticks >= 600
    }

    sync(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        if (snapshot.result === 'won') this.start()
        for (const event of events) {
            if (event.type === 'levelWon') this.start()
            else if (event.type === 'levelAwardCollected') this.playAwardCollected(event)
            else if (event.type === 'finalWave') void this.createFinalWave()
        }
    }

    syncAward(item: ItemSnapshot, levelId: string): boolean {
        if (item.typeId !== this.content.levels.levels[levelId].award.id) return false
        const node = this.entityNode(item.entityId)
        if (!node) return true
        let { x, y, scale } = item
        if (item.state === 'collecting' && this.ticks >= 0) {
            const moveTime = Math.min(1, this.ticks / 350)
            const moveEaseOut = 2 * moveTime - moveTime * moveTime
            x += (375 - x) * moveEaseOut
            y += (165 - y) * moveEaseOut
            const scaleTime = Math.min(1, this.ticks / 400)
            const smoothStep = 3 * scaleTime * scaleTime - 2 * scaleTime * scaleTime * scaleTime
            const scaleEase = 3 * smoothStep * smoothStep - 2 * smoothStep * smoothStep * smoothStep
            scale = 1.01 + 0.99 * scaleEase
        }
        node.setPosition(x + SEED_PACKET_WIDTH / 2, -(y + SEED_PACKET_HEIGHT / 2))
        uiNode({ node, opacity: item.alpha })
        this.syncAwardVisual(node, scale, item.state === 'collecting')
        return true
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
        TodParticleSystem.spawn({
            parent: this.awardLayer,
            effect: 'starburst',
            x: x + 30,
            y: -(y + 30),
            z: 1,
            useGameTime: false,
        })
        if (!item?.isValid) return
        for (const particle of item.getComponentsInChildren(TodParticleSystem)) {
            if (particle.node.name === 'ParticleSystem_seedpacket') particle.node.destroy()
        }
        TodParticleSystem.spawn({
            parent: item.getChildByName('AwardBackEffects') ?? item,
            effect: 'award',
            x: 0,
            y: 0,
            z: -1,
            useGameTime: false,
        })
    }

    private syncAwardVisual(node: Node, scale: number, collecting: boolean): void {
        const visualScale = Math.max(0.001, scale)
        const normal = node.getChildByName('FinalSeedPacketNormal')
        const large = node.getChildByName('FinalSeedPacketLarge')
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
        for (const particle of node.getComponentsInChildren(TodParticleSystem)) {
            particle.overrideScale(visualScale)
            if (collecting && particle.node.name === 'ParticleSystem_seedpacket') particle.node.destroy()
        }
    }

    private syncFade(): void {
        const alpha = Math.round(255 * Math.max(0, this.ticks - 400) / 200)
        const graphics = this.fade.getComponent(Graphics)
        if (!graphics) return
        graphics.clear()
        this.fade.active = alpha > 0
        if (alpha <= 0) return
        graphics.fillColor = new Color(255, 255, 255, alpha)
        graphics.fillRect(-400, -300, 800, 600)
    }

    private async createFinalWave(snapshot?: Adventure11EndSnapshotV2['finalWave']): Promise<void> {
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
            console.error('[Phase4] Failed to play final-wave warning', error)
        }
    }
}
