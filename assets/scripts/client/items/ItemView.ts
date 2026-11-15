import { type Node, Sprite } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import type { Content, EntityView, LevelStage, StageEvent } from '@/client/level/LevelStage'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import { SUN_BANK_TARGET } from '@/shared/content/gameplay'
import type { ItemPresentationDefinition } from '@/shared/content/presentation'
import type { ItemSnapshot } from '@/shared/protocol/index'

/** Item nodes sit at the 60x60 item's center (they scale around it); definitions measure from its top-left. */
const HALF = 30

export type ItemViewSnapshot = Extract<LevelEntitySnapshot, { kind: 'item' }>

export interface ItemViewContext {
    node: Node
    content: Content
    item: ItemSnapshot
    /** The board: items lie on no other. */
    stage: LevelStage
}

/** Coin::Draw for sun and money: a looping animation, plus the coins' flat in-flight image, glow and pickup arrow. */
export class ItemView implements EntityView<ItemSnapshot> {
    private animation!: Node
    private flight?: Node
    private glow?: Node
    /** Where it started flying to the counter from. */
    private collectStart?: { x: number, y: number }

    constructor(protected readonly context: ItemViewContext) {}

    protected get presentation(): ItemPresentationDefinition {
        const { content, item } = this.context, presentation = content.presentation.items[item.typeId]
        if (!presentation) throw new Error(`Item presentation is not installed: ${item.typeId}`)
        return presentation
    }

    async initialize(): Promise<void> {
        const { node, content } = this.context, definition = this.presentation
        const sprites = new SpriteRepository(content.registry, content.loader)
        const image = async (name: string, sprite: string, [x, y]: readonly [number, number]) => {
            const frame = await sprites.load(sprite)
            return uiNode({ name, parent: node, position: { x: x - HALF, y: HALF - y }, anchor: { x: 0, y: 1 },
                sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
        }
        // Glow first so it draws under the coin.
        this.glow = definition.glow && await image('ItemGlow', definition.glow.sprite, definition.glow.offset)
        const [x, y] = definition.offset
        const animation = this.animation = uiNode({ name: 'ItemAnimation', parent: node, position: { x: x - HALF, y: HALF - y } }).node
        const player = animation.addComponent(ReanimPlayer)
        await player.load(definition.reanim, content.registry, content.loader)
        const [min, max] = definition.rate
        // Coins start at a random point of their spin, each at its own speed.
        player.play({ loop: true, rate: min + Math.random() * (max - min), timeSeconds: min === max ? 0 : Math.random() * player.durationSeconds })
        this.flight = definition.flight && await image('ItemFlight', definition.flight.sprite, definition.flight.offset)
    }

    sync(item: ItemSnapshot): void {
        const { node, content } = this.context, definition = this.presentation
        uiNode({ node, opacity: item.alpha })
        // Only sun flies to the (possibly edge-pinned) sun counter.
        const sun = content.definitions.items[item.typeId]?.kind !== 'money'
        node.setPosition(item.x + HALF + (sun ? this.collectOffset(item) : 0), -(item.y + HALF))
        node.setScale(item.scale, item.scale, 1)
        // Moving silver and gold coins use the flat dollar image and hide the spinning animation.
        const flying = !!this.flight && (!item.landed || item.state === 'collecting')
        this.animation.active = !flying
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
        const offset = this.context.stage.sunBankOffset()
        if (item.state !== 'collecting') { this.collectStart = undefined; return 0 }
        if (!offset) return 0
        const start = this.collectStart ??= { x: item.x, y: item.y }
        const total = Math.hypot(start.x - SUN_BANK_TARGET.x, start.y - SUN_BANK_TARGET.y)
        return total ? offset * (1 - Math.hypot(item.x - SUN_BANK_TARGET.x, item.y - SUN_BANK_TARGET.y) / total) : offset
    }

    /** Where its spin is, for a save. */
    snapshot(entityId: number): ItemViewSnapshot {
        return { kind: 'item', entityId, animation: this.animation.getComponent(ReanimPlayer)?.snapshot() ?? null }
    }

    restore(snapshot: ItemViewSnapshot): void {
        if (snapshot.animation) this.animation.getComponent(ReanimPlayer)?.restore(snapshot.animation)
    }

    /** Coin::Coin: the sound of an item as it comes. */
    static readonly spawned: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.spawnSounds)
    }

    /** Coin::Update: as it lands. */
    static readonly landed: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.landSounds)
    }

    /** Coin::Collect: as it is picked up, unless picked up silently. */
    static readonly collected: StageEvent = (stage, event) => {
        if (event.data.silent !== true) SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.collectSounds)
    }
}
