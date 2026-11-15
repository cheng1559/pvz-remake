import { type Node, Sprite } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { plantDefinition } from '@/client/plants/definitions'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { type LevelDefinition, SUN_BANK_TARGET } from '@/shared/content/gameplay'
import type { ItemPresentationDefinition } from '@/shared/content/presentation'
import type { ItemSnapshot } from '@/shared/protocol/index'
import { levelAwardSize } from './LevelGeometry'
import type { LevelEntityAssets } from './LevelStage'
import type { LoadedContent } from './LevelView'

/** Item nodes sit at the 60x60 item's center (they scale around it); definitions measure from its top-left. */
const HALF = 30

export interface LevelItemContext {
    content: LoadedContent
    assets: Pick<LevelEntityAssets, 'loadPacketSprite' | 'packetCostFont'>
    /** The layer a seed packet's nodes are drawn on. */
    layer: number
    level: LevelDefinition
    /** How far the sun counter sits from its 800-wide layout position, e.g. when pinned to the screen edge. */
    sunBankOffset(): number
}

/**
 * Coin::Draw: what lies on the lawn to be picked up. Sun and money are a looping animation, with the coins' flat
 * in-flight image, glow and pickup arrow; the level's award is its picture or the seed packet it gives, with the arrow
 * or glow behind it once it has landed.
 */
export class LevelItemView {
    static readonly ANIMATION = 'ItemAnimation'
    /** The effects behind an award. */
    static readonly AWARD_BACK = 'AwardBackEffects'

    static async create(node: Node, item: ItemSnapshot, context: LevelItemContext): Promise<LevelItemView> {
        const { content, level } = context
        if (item.typeId === level.award.id) {
            await LevelItemView.drawAward(node, context)
            return new LevelItemView(node, context, undefined)
        }
        const definition = content.presentation.items[item.typeId]
        if (!definition) throw new Error(`Item presentation is not installed: ${item.typeId}`)
        const sprites = new SpriteRepository(content.registry, content.loader)
        const image = async (name: string, sprite: string, [x, y]: readonly [number, number]) => {
            const frame = await sprites.load(sprite)
            return uiNode({ name, parent: node, position: { x: x - HALF, y: HALF - y }, anchor: { x: 0, y: 1 },
                sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
        }
        // Glow first so it draws under the coin.
        const glow = definition.glow && await image('ItemGlow', definition.glow.sprite, definition.glow.offset)
        const [x, y] = definition.offset
        const animation = uiNode({ name: LevelItemView.ANIMATION, parent: node, position: { x: x - HALF, y: HALF - y } }).node
        const player = animation.addComponent(ReanimPlayer)
        await player.load(definition.reanim, content.registry, content.loader)
        const [min, max] = definition.rate
        // Coins start at a random point of their spin, each at its own speed.
        player.play({ loop: true, rate: min + Math.random() * (max - min), timeSeconds: min === max ? 0 : Math.random() * player.durationSeconds })
        const flight = definition.flight && await image('ItemFlight', definition.flight.sprite, definition.flight.offset)
        return new LevelItemView(node, context, definition, animation, flight, glow)
    }

    /** The level's award: its picture, or the packet of the seed it gives with a larger one for when it is shown off. */
    private static async drawAward(node: Node, { content, level, assets, layer }: LevelItemContext): Promise<void> {
        const award = level.award, size = levelAwardSize(award)
        uiNode({ node, size, anchor: { x: 0.5, y: 0.5 } })
        // The pickup arrow or seed packet glow is added here once the award lands.
        uiNode({ name: LevelItemView.AWARD_BACK, parent: node })
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
            return
        }
        const packet = {
            definitions: content.presentation, parent: node, layer, x: 0, y: 0, cost: content.definitions.seeds[award.id].sunCost,
            seedType: plantDefinition(content.presentation, award.id).visual.seedType, costFont: assets.packetCostFont, loadSprite: assets.loadPacketSprite,
        }
        SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketNormal' })
        SeedPacketRenderer.drawSeedPacket({ ...packet, name: 'FinalSeedPacketLarge', scale: 2 }).active = false
    }

    /** Where it started flying to the counter from. */
    private collectStart?: { x: number, y: number }

    private constructor(
        private readonly node: Node,
        private readonly context: LevelItemContext,
        /** None for the level's award. */
        private readonly definition?: ItemPresentationDefinition,
        private readonly animation?: Node,
        private readonly flight?: Node,
        private readonly glow?: Node,
    ) {}

    sync(item: ItemSnapshot): void {
        const { node, definition, context } = this
        uiNode({ node, opacity: item.alpha })
        if (!definition) {
            const award = context.level.award, size = levelAwardSize(award)
            node.setPosition(item.x + size.width / 2, -(item.y + size.height / 2))
            // Coin::Update adds the bouncy arrow once an award lands (CoinInitialize only sets mNeedsBouncyArrow): the
            // seed packet glow for seed packets (PARTICLE_SEED_PACKET), the pickup arrow for every other award.
            // Collecting removes it (LevelEndPresenter); a restored game brings back its saved one.
            const back = node.getChildByName(LevelItemView.AWARD_BACK)
            if (!back || !item.landed || item.state !== 'available') return
            const id = award.kind === 'seed' ? 'pvz:seedpacket' : 'pvz:awardpickuparrow'
            if (!back.children.some(child => child.getComponent(ParticlePlayer)?.id === id)) ParticlePlayer.spawn({ parent: back, id, x: 0, y: 60, z: -1 })
            return
        }
        // Only sun flies to the (possibly edge-pinned) sun counter.
        const sun = context.content.definitions.items[item.typeId]?.kind !== 'money'
        node.setPosition(item.x + HALF + (sun ? this.collectOffset(item) : 0), -(item.y + HALF))
        node.setScale(item.scale, item.scale, 1)
        // Moving silver and gold coins use the flat dollar image and hide the spinning animation.
        const flying = !!this.flight && (!item.landed || item.state === 'collecting')
        this.animation!.active = !flying
        if (this.flight) this.flight.active = flying
        if (this.glow) this.glow.active = !definition.glow?.inFlight || flying
        const arrow = definition.arrow
        if (!arrow) return
        const current = node.children.find(child => child.getComponent(ParticlePlayer)?.id === arrow.particle)
        if (item.arrow && item.landed && item.state === 'available') {
            if (!current) ParticlePlayer.spawn({ parent: node, id: arrow.particle, x: arrow.offset[0] - HALF, y: HALF - arrow.offset[1] })
        } else current?.destroy()
    }

    /** The server flies sun to the layout's counter; ease toward the counter's actual position along the way. */
    private collectOffset(item: ItemSnapshot): number {
        const offset = this.context.sunBankOffset()
        if (item.state !== 'collecting') { this.collectStart = undefined; return 0 }
        if (!offset) return 0
        const start = this.collectStart ??= { x: item.x, y: item.y }
        const total = Math.hypot(start.x - SUN_BANK_TARGET.x, start.y - SUN_BANK_TARGET.y)
        return total ? offset * (1 - Math.hypot(item.x - SUN_BANK_TARGET.x, item.y - SUN_BANK_TARGET.y) / total) : offset
    }
}
