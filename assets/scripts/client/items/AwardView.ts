import { Sprite } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
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
export class AwardView implements EntityView<ItemSnapshot> {
    /** The effects behind it. */
    static readonly BACK = 'AwardBackEffects'

    constructor(protected readonly context: ItemViewContext) {}

    async initialize(): Promise<void> {
        const { node, content, stage } = this.context, award = stage.level.award, size = levelAwardSize(award)
        uiNode({ node, size, anchor: { x: 0.5, y: 0.5 } })
        // The pickup arrow or seed packet glow is added here once the award lands.
        uiNode({ name: AwardView.BACK, parent: node })
        if (award.kind !== 'seed') {
            const visual = content.presentation.awards?.[award.id]
            if (!visual) throw new Error(`Award presentation is not installed: ${award.id}`)
            const frame = await new SpriteRepository(content.registry, content.loader).load(visual.sprite)
            if (!node.isValid) return
            const image = uiNode({ name: 'AwardImage', parent: node,
                position: { x: visual.x + frame.originalSize.width / 2 - size.width / 2,
                    y: -(visual.y + frame.originalSize.height / 2 - size.height / 2) } }).node
            uiNode({ parent: image, anchor: { x: 0.5, y: 0.5 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
                .node.setScale(visual.scale, visual.scale, 1)
        } else {
            const { assets } = stage
            const packet = {
                definitions: content.presentation, parent: node, layer: node.layer, x: 0, y: 0, cost: content.definitions.seeds[award.id].sunCost,
                seedType: plantDefinition(content.presentation, award.id).visual.seedType, costFont: assets.packetCostFont, loadSprite: assets.loadPacketSprite,
            }
            SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketNormal' })
            SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketLarge', scale: 2 }).active = false
        }
    }

    sync(item: ItemSnapshot): void {
        const { node, stage } = this.context, award = stage.level.award, size = levelAwardSize(award)
        uiNode({ node, opacity: item.alpha })
        node.setPosition(item.x + size.width / 2, -(item.y + size.height / 2))
        // Coin::Update adds the bouncy arrow once an award lands (CoinInitialize only sets mNeedsBouncyArrow): the seed
        // packet glow for seed packets (PARTICLE_SEED_PACKET), the pickup arrow for every other award. Collecting removes
        // it (LevelEndPresenter); a restored game brings back its saved one.
        const back = node.getChildByName(AwardView.BACK)
        if (!back || !item.landed || item.state !== 'available') return
        const id = award.kind === 'seed' ? 'pvz:seedpacket' : 'pvz:awardpickuparrow'
        if (!back.children.some(child => child.getComponent(ParticlePlayer)?.id === id)) ParticlePlayer.spawn({ parent: back, id, x: 0, y: 60, z: -1 })
    }

    /** Zombie::TrySpawnLevelAward throws it (FOLEY_SPAWN_SUN). */
    static readonly dropped: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Throw, 10) }
}
