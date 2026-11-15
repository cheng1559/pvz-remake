import type { Color, Node, SpriteFrame } from 'cc'
import type { FontRepository } from '@/client/content/ClientContentLoader'
import type { SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { PlantView } from '@/client/plants/PlantView'
import type { ZombieViewInstance, ZombieViewSprites } from '@/client/zombies/ZombieView'
import type { PlantSnapshot, ServerEvent, WorldSnapshot, ZombieSnapshot } from '@/shared/protocol/index'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'

const WIDTH = 800
const HEIGHT = 600

/** Board coordinates (from the top left, y down) in the entity layer's (from its middle, y up). */
export function boardToLayer(x: number, y: number): { x: number, y: number } {
    return { x: x - WIDTH / 2, y: HEIGHT / 2 - y }
}

/** The pictures a level loads before it starts, for what is on its board. */
export interface LevelEntityAssets {
    /** Projectile sprites by projectile ID. */
    projectileFrames: Record<string, SpriteFrame>
    projectileShadowFrames: Record<string, SpriteFrame>
    /** The board's plant shadow, the darker one at night. */
    mowerShadow: SpriteFrame
    zombieSprites: ZombieViewSprites
    wallnutCracked: [SpriteFrame, SpriteFrame]
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
    packetCostFont: Awaited<ReturnType<FontRepository['load']>>
}

/**
 * The board as the views of what is on it see it: where they put what they draw outside their own node, and what
 * they ask of the level. LevelEntityRenderer is it.
 */
export interface LevelStage {
    /** The layer the board's entities and effects are in. */
    readonly layer: Node
    readonly content: Awaited<ReturnType<typeof loadIntegratedGameContent>>
    readonly animations: ClientAnimationRegistry
    readonly audio: LevelAudioPresenter
    readonly intro: LevelIntro
    readonly assets: LevelEntityAssets
    /** Zombie::RiseFromGrave: the dirt of a zombie rising, the level rule's or the presentation's. */
    readonly riseParticle: string
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
    /** An entity's node. */
    node(entityId: number): Node | undefined
    plant(entityId: number): PlantView | undefined
    zombie(entityId: number): ZombieViewInstance | undefined
    /** The type of a zombie it has drawn, also once the zombie is gone from the level's state. */
    zombieType(entityId: number): string | undefined
    /** A zombie's node and view brought to this state now, before what leaves from where it is. */
    showZombie(zombie: ZombieSnapshot, world: WorldSnapshot): void
    /** Plant::CalcRenderOrder. */
    plantOrder(plant: Pick<PlantSnapshot, 'typeId' | 'row' | 'x' | 'behaviorState'>): number
    /** A zombie's draw order in a row. */
    zombieOrder(row: number): number
}

/** What a view does about one of the server's events: with the level's state after it. */
export type StageEvent = (stage: LevelStage, event: ServerEvent, world: WorldSnapshot) => void
