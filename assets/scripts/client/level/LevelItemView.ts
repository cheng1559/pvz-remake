import { type Node, Sprite } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { ItemPresentationDefinition } from '@/shared/content/presentation'
import type { ItemSnapshot } from '@/shared/protocol/index'
import type { LoadedContent } from './LevelView'

/** Item nodes sit at the 60x60 item's center (they scale around it); definitions measure from its top-left. */
const HALF = 30

/** Coin::Draw for sun and money: a looping animation, plus the coins' flat in-flight image, glow and pickup arrow. */
export class LevelItemView {
    static readonly ANIMATION = 'ItemAnimation'

    static async create(node: Node, definition: ItemPresentationDefinition, content: LoadedContent): Promise<LevelItemView> {
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
        return new LevelItemView(node, definition, animation, flight, glow)
    }

    private constructor(
        private readonly node: Node,
        private readonly definition: ItemPresentationDefinition,
        private readonly animation: Node,
        private readonly flight?: Node,
        private readonly glow?: Node,
    ) {}

    sync(item: ItemSnapshot): void {
        // Moving silver and gold coins use the flat dollar image and hide the spinning animation.
        const flying = !!this.flight && (!item.landed || item.state === 'collecting')
        this.animation.active = !flying
        if (this.flight) this.flight.active = flying
        if (this.glow) this.glow.active = !this.definition.glow?.inFlight || flying
        const arrow = this.definition.arrow
        if (!arrow) return
        const current = this.node.children.find(child => child.getComponent(ParticlePlayer)?.id === arrow.particle)
        if (item.arrow && item.landed && item.state === 'available') {
            if (!current) ParticlePlayer.spawn({ parent: this.node, id: arrow.particle, x: arrow.offset[0] - HALF, y: HALF - arrow.offset[1] })
        } else current?.destroy()
    }
}
