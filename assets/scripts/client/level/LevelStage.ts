import type { Color, Node, SpriteFrame } from 'cc'
import { type FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import type { SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { PlantView } from '@/client/plants/PlantView'
import type { ZombieView, ZombieViewSprites } from '@/client/zombies/ZombieView'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { PresentationSound } from '@/shared/content/presentation'
import type { PlantSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { EntityFlashes } from './EntityFlashes'
import type { LevelIntro } from './LevelIntro'
import type { LevelEntitySnapshot } from './LevelPresentationSnapshot'

const WIDTH = 800
const HEIGHT = 600

export type Content = Awaited<ReturnType<typeof loadIntegratedGameContent>>

/** Board coordinates (from the top left, y down) in the entity layer's (from its middle, y up). */
export function boardToLayer(x: number, y: number): { x: number, y: number } {
    return { x: x - WIDTH / 2, y: HEIGHT / 2 - y }
}

/** The board's plant shadow, the darker one at night; off the board the day's. */
export async function plantShadow(content: Content, stage?: LevelStage): Promise<SpriteFrame> {
    return stage?.assets.shadow ?? new SpriteRepository(content.registry, content.loader).load('pvz:plantshadow')
}

/** The pictures a level loads before it starts, for what is on its board. */
export interface LevelEntityAssets {
    /** Projectile sprites by projectile ID. */
    projectileFrames: Record<string, SpriteFrame>
    projectileShadowFrames: Record<string, SpriteFrame>
    /** The board's plant shadow, the darker one at night. */
    shadow: SpriteFrame
    zombieSprites: ZombieViewSprites
    wallnutCracked: [SpriteFrame, SpriteFrame]
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
    packetCostFont: Awaited<ReturnType<FontRepository['load']>>
}

/**
 * What every view of something on the board does (plants, zombies, projectiles, the things of a cell, items). It is made
 * by its registry with its context (`node`, `content`, the entity, and `stage` on the board), readied by `initialize`,
 * and `sync` shows its entity in each of the level's frames, where it places its node itself. A view of what is also
 * drawn off the board has `show` for that. One that keeps something of its own across a save has `snapshot`/`restore`.
 */
export interface EntityView<Entity = unknown> {
    initialize(): void | Promise<void>
    sync(entity: Entity, world: WorldSnapshot): void
    snapshot?(entityId: number): LevelEntitySnapshot | undefined
    restore?(snapshot: LevelEntitySnapshot): void | Promise<void>
    /** What the view made outside its node goes with it. */
    destroy?(): void
    /** Its shadow, a node of the board's layer apart from its own: on the ground under it, drawn with the ground. */
    readonly shadowNode?: Node
}

/**
 * The board as the views of what is on it see it: where they put what they draw outside their own node, and what
 * they ask of the level. LevelEntityRenderer is it.
 */
export interface LevelStage {
    /** The layer the board's entities and effects are in. */
    readonly layer: Node
    readonly content: Content
    readonly intro: LevelIntro
    readonly assets: LevelEntityAssets
    /** The level being played, and the gameplay tick of the frame being drawn. */
    readonly level: LevelDefinition
    readonly gameplayTick: number
    /** Plants' and zombies' flashes (Plant::mEatenFlashCountdown, Zombie::mJustGotShotCounter), raised by the server's events. */
    readonly flashes: EntityFlashes
    /**
     * What the board shows now it shows without what goes with getting there: its first frame, what the level starts or is
     * loaded with, and a save being put back. A view made now came with the level, not during play.
     */
    readonly quiet: boolean
    /** Zombie::RiseFromGrave: the dirt and rumble of a zombie rising, the level rule's or the presentation's. */
    readonly graveRise: { readonly particle: string, readonly sounds: readonly PresentationSound[] }
    /** How far the sun counter sits from its 800-wide layout position, e.g. when pinned to the screen edge. */
    sunBankOffset(): number
    /**
     * A particle effect on the board at a draw order, in board coordinates (Board::AddPvzpParticle). `mirrored`: played
     * flipped left to right, for a zombie or plant facing the other way.
     */
    particle(effect: string, x: number, y: number, order: number, tint?: Color, mirrored?: boolean): void
    /**
     * A node of the layer takes its place in the draw order until it is destroyed. `entityId`: among what else is at
     * that order, it goes where that entity does.
     */
    addScenery(node: Node, order: number, entityId?: number): void
    /** An entity's node, and the view of a plant or a zombie. */
    node(entityId: number): Node | undefined
    plant(entityId: number): PlantView | undefined
    zombie(entityId: number): ZombieView | undefined
    /** Plant::CalcRenderOrder. */
    plantOrder(plant: Pick<PlantSnapshot, 'typeId' | 'row' | 'x' | 'behaviorState'>): number
    /** A zombie's draw order in a row. */
    zombieOrder(row: number): number
}

/** What a view does about one of the server's events: with the level's state after it. */
export type StageEvent = (stage: LevelStage, event: ServerEvent, world: WorldSnapshot) => void
