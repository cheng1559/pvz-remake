import { prepareClips, showClip } from '@/client/reanim/clips'
import { modResources } from '@/client/content/ModResources'
import { type Node, Sprite } from 'cc'
import { type LevelEntitySnapshot, parseSavedPlayback, viewSaveData } from '@/client/level/LevelPresentationSnapshot'
import type { Content, EntityView, LevelStage, StageEvent } from '@/client/level/LevelStage'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import { collectTarget } from '@/shared/content/gameplay'
import type { ItemPresentationDefinition } from '@/shared/content/presentation'
import { jsonRoundTrip, type ItemSnapshot, type JsonObject } from '@/shared/protocol/index'

/** Item nodes sit at the 60x60 item's center (they scale around it); definitions measure from its top-left. */
const HALF = 30


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
    /**
     * How far a collected item is on its way to its counter, from 0 where it was picked up to 1 there (0 until it is
     * collected), as the frame being drawn has it: what the sun is eased toward the counter's actual position by, and
     * what a Mod that shifts the lawn moves it by.
     */
    collectProgress = 0

    constructor(protected readonly context: ItemViewContext) {}

    protected get presentation(): ItemPresentationDefinition {
        const { content, item } = this.context, presentation = content.presentation.items[item.typeId]
        if (!presentation) throw new Error(`Item presentation is not installed: ${item.typeId}`)
        return presentation
    }

    async initialize(): Promise<void> {
        const { node } = this.context, definition = this.presentation
        const image = async (name: string, sprite: string, [x, y]: readonly [number, number]) => {
            const frame = await modResources.sprite(sprite)
            return uiNode({ name, parent: node, position: { x: x - HALF, y: HALF - y }, anchor: { x: 0, y: 1 },
                sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
        }
        // Glow first so it draws under the coin.
        this.glow = definition.glow && await image('ItemGlow', definition.glow.sprite, definition.glow.offset)
        const corner = uiNode({ name: 'ItemCorner', parent: node, position: { x: -HALF, y: HALF } }).node
        const animation = this.animation = uiNode({ name: 'ItemAnimation', parent: corner }).node
        const clip = definition.clips.idle
        await prepareClips([clip])
        if (!node.isValid) return
        showClip(animation.addComponent(ReanimPlayer), clip)
        this.flight = definition.flight && await image('ItemFlight', definition.flight.sprite, definition.flight.offset)
    }

    sync(item: ItemSnapshot): void {
        const { node, content } = this.context, definition = this.presentation
        uiNode({ node, opacity: item.alpha })
        this.collectProgress = this.progress(item)
        // The server flies sun to the layout's counter; it is eased toward the counter's actual position (possibly
        // pinned to the screen's edge) along the way.
        const sun = content.definitions.items[item.typeId]?.kind !== 'money'
        node.setPosition(item.x + HALF + (sun ? this.context.stage.sunBankOffset() * this.collectProgress : 0), -(item.y + HALF))
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

    /** collectProgress: the part of the way from where it was picked up to its counter (collectTarget) it has come. */
    private progress(item: ItemSnapshot): number {
        if (item.state !== 'collecting') { this.collectStart = undefined; return 0 }
        const start = this.collectStart ??= { x: item.x, y: item.y }
        const target = collectTarget(this.context.content.definitions.items[item.typeId])
        const total = Math.hypot(start.x - target.x, start.y - target.y)
        return total ? 1 - Math.hypot(item.x - target.x, item.y - target.y) / total : 1
    }

    /** Where its spin is, for a save. */
    snapshot(entityId: number): LevelEntitySnapshot {
        return { kind: 'item', entityId, data: jsonRoundTrip({ animation: this.animation.getComponent(ReanimPlayer)?.snapshot() ?? null }) as unknown as JsonObject }
    }

    restore(snapshot: LevelEntitySnapshot): void {
        const animation = parseSavedPlayback(viewSaveData(snapshot, ['animation']).animation)
        if (animation) this.animation.getComponent(ReanimPlayer)?.restore(animation)
    }

    /** Coin::Coin: the sound of an item as it comes. */
    static readonly spawned: StageEvent = (stage, event) => {
        void SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.spawnSounds)
    }

    /** Coin::Update: as it lands. */
    static readonly landed: StageEvent = (stage, event) => {
        void SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.landSounds)
    }

    /** Coin::Collect: as it is picked up, unless picked up silently. */
    static readonly collected: StageEvent = (stage, event) => {
        if (event.data.silent !== true) void SoundSystem.playSounds(stage.content.presentation.items[String(event.data.typeId)]?.collectSounds)
    }
}
