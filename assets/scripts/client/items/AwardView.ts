import { modResources } from '@/client/content/ModResources'
import { type Node, Sprite } from 'cc'
import { SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { easeInOutCurve } from '@/client/view/GameScreenMath'
import { levelAwardSize } from '@/client/level/LevelGeometry'
import type { EntityView, StageEvent } from '@/client/level/LevelStage'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { plantDefinition } from '@/client/plants/definitions'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import type { ItemSnapshot } from '@/shared/protocol/index'
import type { ItemViewContext } from './ItemView'

/**
 * The level's award, an item of its own (Coin::Draw for the award coins): its picture, or the packet of the seed it gives
 * with a larger one for when it is shown off, with the arrow or glow behind it once it has landed.
 */
/** A packet's cost (SeedPacket::DrawSeedPacket's FONT_PICO129). */
const PACKET_COST_FONT = 'pvz:pico129'

export class AwardView implements EntityView<ItemSnapshot> {
    /** The effects behind it. */
    static readonly BACK = 'AwardBackEffects'
    particleAnchors?: Readonly<Record<string, Node>>
    /** Its picture, or its packet at 1x and the 2x one it turns into as it grows. */
    private image?: Node
    private packets?: { readonly normal: Node, readonly large: Node }

    constructor(protected readonly context: ItemViewContext) {}

    async initialize(): Promise<void> {
        const { node, content, stage } = this.context, award = stage.level.award, size = levelAwardSize(award)
        uiNode({ node, size, anchor: { x: 0.5, y: 0.5 } })
        // The pickup arrow or seed packet glow is added here once the award lands.
        this.particleAnchors = { 'award-back-effects': uiNode({ name: AwardView.BACK, parent: node }).node }
        if (award.kind !== 'seed') {
            const visual = content.presentation.awards?.[award.id]
            if (!visual) throw new Error(`Award presentation is not installed: ${award.id}`)
            const frame = await modResources.sprite(visual.sprite)
            if (!node.isValid) return
            const image = this.image = uiNode({ name: 'AwardImage', parent: node,
                position: { x: visual.x + frame.originalSize.width / 2 - size.width / 2,
                    y: -(visual.y + frame.originalSize.height / 2 - size.height / 2) } }).node
            uiNode({ parent: image, anchor: { x: 0.5, y: 0.5 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
                .node.setScale(visual.scale, visual.scale, 1)
        } else {
            const costFont = await modResources.font(PACKET_COST_FONT)
            if (!node.isValid) return
            const packet = {
                definitions: content.presentation, parent: node, layer: node.layer, x: 0, y: 0, cost: content.definitions.seeds[award.id].sunCost,
                seedType: plantDefinition(content.presentation, award.id).visual.seedType, costFont,
            }
            const normal = SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketNormal' })
            const large = SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketLarge', scale: 2 })
            large.active = false
            this.packets = { normal, large }
        }
    }

    sync(item: ItemSnapshot): void {
        const { node, stage } = this.context, award = stage.level.award, size = levelAwardSize(award)
        const ticks = stage.levelEndTicks(), collected = item.state === 'collecting' && ticks >= 0
        let { x, y, scale } = item
        // Board::UpdateLevelEndSequence: a collected award flies to the screen's middle as it grows to twice its size; a
        // note fades out where it is instead.
        if (collected && award.kind !== 'note') {
            const moveTime = Math.min(1, ticks / 350), moveEaseOut = 2 * moveTime - moveTime * moveTime
            x += (400 - size.width / 2 - x) * moveEaseOut
            y += (200 - size.height / 2 - y) * moveEaseOut
            scale = 1.01 + 0.99 * easeInOutCurve(Math.min(1, ticks / 400))
        }
        node.setPosition(x + size.width / 2, -(y + size.height / 2))
        uiNode({ node, opacity: collected && award.kind === 'note' ? Math.round(item.alpha * Math.max(0, 1 - ticks / 15)) : item.alpha })
        this.syncScale(Math.max(0.001, scale), item.state === 'collecting')
        // Coin::Update adds the bouncy arrow once an award lands (CoinInitialize only sets mNeedsBouncyArrow): the seed
        // packet glow for seed packets (PARTICLE_SEED_PACKET), the pickup arrow for every other award. Collecting removes
        // it; a restored game brings back its saved one.
        const back = this.particleAnchors?.['award-back-effects']
        if (!back || !item.landed || item.state !== 'available') return
        const id = award.kind === 'seed' ? 'pvz:seedpacket' : 'pvz:awardpickuparrow'
        if (!back.children.some(child => child.getComponent(ParticlePlayer)?.id === id)) ParticlePlayer.spawn({ parent: back, id, x: 0, y: 60, z: -1 })
    }

    /** Its picture or packet at `scale` about its middle, its effects with it; a collected packet loses its glow. */
    private syncScale(scale: number, collecting: boolean): void {
        this.image?.setScale(scale, scale, 1)
        if (this.packets) {
            const { normal, large } = this.packets, x = -SEED_PACKET_WIDTH * scale / 2, y = SEED_PACKET_HEIGHT * scale / 2
            normal.active = scale <= 1
            normal.setPosition(x, y)
            normal.setScale(scale, scale, 1)
            large.active = scale > 1
            large.setPosition(x, y)
            large.setScale(scale / 2, scale / 2, 1)
        }
        for (const particle of this.context.node.getComponentsInChildren(ParticlePlayer)) {
            particle.overrideScale(scale)
            if (collecting && particle.id === 'pvz:seedpacket') particle.node.destroy()
        }
    }

    /**
     * Coin::Collect of the level's award: a starburst where it was, its arrow or glow gone, and the award's own effect
     * behind it (PARTICLE_AWARD; a note's PARTICLE_PRESENT_PICKUP).
     */
    static readonly collected: StageEvent = (stage, event) => {
        const { entityId, x, y } = event.data
        const node = typeof entityId === 'number' ? stage.node(entityId) : undefined
        if (!node?.isValid || typeof x !== 'number' || typeof y !== 'number') return
        ParticlePlayer.spawn({ parent: node.parent!, id: 'pvz:starburst', x: x + 30, y: -(y + 30), z: 1 })
        for (const particle of node.getComponentsInChildren(ParticlePlayer)) {
            if (particle.id === 'pvz:seedpacket' || particle.id === 'pvz:awardpickuparrow') particle.node.destroy()
        }
        ParticlePlayer.spawn({ parent: node.getChildByName(AwardView.BACK) ?? node, id: stage.level.award.kind === 'note' ? 'pvz:presentpickup' : 'pvz:award', x: 0, y: 0, z: -1 })
    }

    /** Zombie::TrySpawnLevelAward throws it (FOLEY_SPAWN_SUN). */
    static readonly dropped: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Throw, 10) }
}
