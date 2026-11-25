import { modResources } from '@/client/content/ModResources'
import { getBoardPresentation } from './boards/definitions'
import type { HapticStyle } from '@/platform/Haptics'
import type { Color, Node, SpriteFrame } from 'cc'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { ParticlePlayer, ParticleSpawnArgs } from '@/client/particle/ParticlePlayer'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { PresentationSound } from '@/shared/content/presentation'
import type { PlantSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { BoardShadows } from './BoardShadows'
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

/** The board's plant shadow (BoardPresentation.plantShadow, the darker one at night); off the board the day's. */
export async function plantShadow(content: Content, stage?: LevelStage): Promise<SpriteFrame> {
    const id = (stage && getBoardPresentation(content.presentation, stage.level.board).plantShadow) ?? 'pvz:plantshadow'
    return modResources.sprite(id)
}

/**
 * What every view of something on the board does (plants, zombies, projectiles and mowers, the things of a cell, items).
 * It is made by its registry with its context (`node`, `content`, the entity, and `stage` on the board), readied by
 * `initialize`, and `sync` shows its entity in each of the level's frames, where it places its node itself. One that
 * keeps something of its own across a save has `snapshot`/`restore`. A plant, a zombie, a thing of a cell and a
 * projectile are drawn off the board too (offBoard.ts): made the same way with no `stage`, which is what tells a view it
 * is off the board, drawn as its context has it from `initialize` on, never synced, and gone with `destroy`.
 */
export interface EntityView<Entity = unknown> {
    initialize(): void | Promise<void>
    sync(entity: Entity, world: WorldSnapshot): void
    snapshot?(entityId: number): LevelEntitySnapshot | undefined
    restore?(snapshot: LevelEntitySnapshot): void | Promise<void>
    /** What the view made outside its node goes with it. */
    destroy?(): void
    /**
     * Its shadow, a node of the board's layer apart from its own: on the ground under it, drawn with the ground. A
     * zombie's on the board is one of the board's instead (LevelStage.shadows).
     */
    readonly shadowNode?: Node
    /** The nodes of its own that particles go under, by name: a save keeps a particle's place by them. */
    readonly particleAnchors?: Readonly<Record<string, Node>>
    /** An item's: how far it is, collected, on its way to its counter, from 0 to 1 (ItemView, AwardView). */
    readonly collectProgress?: number
}

/** A view's class, by which the stage gives the view of that class alone (LevelStage.view). */
export type ViewType<V> = abstract new (...args: never[]) => V

/**
 * The board as the views of what is on it see it: where they put what they draw outside their own node, and what
 * they ask of the level. LevelEntityRenderer is it.
 */
export interface LevelStage {
    /** The layer the board's entities and effects are in. */
    readonly layer: Node
    /** The shadows on the board's ground that are drawn a row at a time: its zombies'. */
    readonly shadows: BoardShadows
    readonly content: Content
    readonly intro: LevelIntro
    /** The level being played, and the gameplay tick of the frame being drawn. */
    readonly level: LevelDefinition
    readonly gameplayTick: number
    /**
     * Plants' and zombies' flashes (Plant::mEatenFlashCountdown, Zombie::mJustGotShotCounter), raised by the server's
     * events (EntityFlashes' handlers), kept with the board across a save.
     */
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
    /** Ticks since the level was won (Board::UpdateLevelEndSequence), -1 before. */
    levelEndTicks(): number
    /** Board::ShakeBoard by (x, y), felt as `haptic`: of a frame's shakes, the strongest is felt once. */
    shake(x: number, y: number, haptic: HapticStyle): void
    /**
     * A particle effect on the board at a draw order, in board coordinates (Board::AddPvzpParticle), its node kept for
     * the next one once through (spawnParticle's `recycle`). `mirrored`: played flipped left to right, for a zombie or
     * plant facing the other way.
     */
    particle(effect: string, x: number, y: number, order: number, tint?: Color, mirrored?: boolean): void
    /**
     * A particle effect on the board at a draw order, in the layer's coordinates, played as `args` say. Every particle
     * of the board is drawn at its order among the rest this way, and a save puts it back the same way. None while
     * the particle pools are full (ParticlePlayer.spawn).
     */
    spawnParticle(order: number, args: Omit<ParticleSpawnArgs, 'parent' | 'renderOrder'>): ParticlePlayer | null
    /** A particle of the board (spawnParticle) goes to another draw order, as a projectile's trail does with its projectile. */
    reorderParticle(player: ParticlePlayer, order: number): void
    /**
     * A node of the layer takes its place in the draw order until it is destroyed. Among what else is at that order it
     * goes after the entities, or where the entity `entityId` does while the snapshot lists it.
     */
    addScenery(node: Node, order: number, entityId?: number): void
    /** An entity's node. */
    node(entityId: number): Node | undefined
    /** An entity's view once made: any, or only one of `type` (a plant's PlantView, the award's AwardView). */
    view(entityId: number): EntityView | undefined
    view<V extends EntityView>(entityId: number, type: ViewType<V>): V | undefined
    /**
     * Where each kind of entity is drawn among the rest, as the board draws it, for what a view draws with it. A plant's:
     * Plant::CalcRenderOrder.
     */
    plantOrder(plant: Pick<PlantSnapshot, 'typeId' | 'row' | 'x'>): number
    /** The row's zombie draw order, including the type's configured offset when supplied. */
    zombieOrder(row: number, typeId?: string): number
    /** A projectile's draw order in a row, by its type's layer (a row's mower's too, by the projectile it runs as). */
    projectileOrder(typeId: string, row: number): number
    /** A thing of a cell's draw order in a row, by its type's layer and offset. */
    gridItemOrder(typeId: string, row: number): number
}

/** What a view does about one of the server's events: with the level's state after it. */
export type StageEvent = (stage: LevelStage, event: ServerEvent, world: WorldSnapshot) => void
