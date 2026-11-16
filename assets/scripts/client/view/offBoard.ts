import type { Node } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { GridItemView } from '@/client/gridItems/GridItemView'
import type { PlantDraw, PlantView, ShownPlant } from '@/client/plants/PlantView'
import { plantDefinition } from '@/client/plants/definitions'
import type { ProjectileView } from '@/client/projectiles/ProjectileView'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import type { ShownZombie, ZombieDraw, ZombieView } from '@/client/zombies/ZombieView'
import { type AnimationRandom } from '@/shared/content/animation'
import { startOffBoardPlant } from '@/shared/content/plantAnimation'
import { startOffBoardZombie } from '@/shared/content/zombieAnimation'
import type { GridItemSnapshot } from '@/shared/protocol/index'

/**
 * Plants, zombies, the things of a cell and projectiles off the board: the almanac, a packet's picture, a preview, the
 * street before a level. Each is drawn by the view the board draws it with, made by its kind's registry with no stage
 * (which is what off the board is), and animated by the rules the server animates it by; only who keeps the animation
 * differs: off the board its view (shared/content/animation, plantAnimation, zombieAnimation). Each comes as its view,
 * which goes with `destroy` (its node is the caller's), or nothing for a type its view does not draw off the board.
 * What only one kind does there is the view's own: PlantView.advance, ZombieView.turn.
 */

/**
 * A plant's or a zombie's picture held on its pose (a packet's, a preview's, the almanac's portrait): its players stop,
 * and take four samples to a screen pixel when it is drawn much smaller than its art (`supersampled`).
 */
export function holdStill(players: readonly ReanimPlayer[], supersampled: boolean): void {
    for (const player of players) {
        player.pause()
        if (supersampled) player.setSupersampled()
    }
}

/** Nothing off the board is the server's, so nothing has to come out the same twice. */
const random: AnimationRandom = { nextFloat: () => Math.random(), integer: (min, max) => min + Math.floor(Math.random() * (max - min + 1)) }
/** The same for whatever else only a client shows (the store's chatter). */
export { random as offBoardRandom }

/**
 * A plant in `node`, as it is off the board (Plant::PlantInitialize when it is not in play), its animation going on
 * with PlantView.advance. `packet`: as a packet's picture has it (PlantPresentationDefinition.packet). Nothing for a
 * plant that has no animation to draw it by.
 */
export async function createOffBoardPlant(node: Node, typeId: string, options: { packet?: boolean, draw?: PlantDraw } = {}): Promise<PlantView | null> {
    const game = await loadIntegratedGameContent()
    const animation = game.definitions.plants[typeId]?.animation
    if (!animation || !node.isValid) return null
    const packet = options.packet ? plantDefinition(game.presentation, typeId).packet : undefined
    const { animations, blinkTicks, state } = startOffBoardPlant(animation, random, { state: packet?.state, at: packet?.time })
    // In the state of its ability it is in there (a grown sun-shroom), with nothing to count down.
    const plant: ShownPlant = { typeId, animations, ...(blinkTicks === undefined ? {} : { blinkTicks }), ...(state === undefined ? {} : { ability: { state, ticks: 0 } }) }
    return game.views.plants.create({ node, content: game, plant, draw: options.draw })
}

/**
 * A whole zombie in `node`, as it is off the board (Zombie::LoadReanim when it is not on it): standing, or held on the
 * first frame of `pose` (a clip of its presentation) for a picture; facing right when `mirrored`, which ZombieView.turn
 * changes. Its shadow, when drawn, goes beside the node.
 */
export async function createOffBoardZombie(node: Node, typeId: string,
    options: { pose?: string, mirrored?: boolean, hasTongue?: boolean, draw?: ZombieDraw } = {}): Promise<ZombieView | null> {
    const game = await loadIntegratedGameContent()
    const definition = game.definitions.zombies[typeId]
    if (!definition || !node.isValid) return null
    const clips: Record<string, unknown> = game.animations.resolve(typeId)
    const animations = startOffBoardZombie(definition.animation, clip => clips[clip] !== undefined, random, options.pose)
    // Whole and at rest, with its own helm and shield worn: little else of a snapshot is read off the board.
    const zombie: ShownZombie = {
        typeId, x: 0, y: 0, row: 0, state: 'standing', ...(options.mirrored ? { team: 'plants' as const } : {}),
        health: definition.maxHealth, maxHealth: definition.maxHealth, alpha: 255,
        hasHead: true, hasArm: true, hasTongue: options.hasTongue === true,
        helmHealth: definition.helm?.health ?? 0, shieldHealth: definition.shield?.health ?? 0, animations,
    }
    return game.views.zombies.create({ node, content: game, zombie, draw: options.draw })
}

/**
 * A thing of a cell in `node`, as it stands off the board (a grave risen, for a packet's picture or a preview). Nothing
 * when its type has no view.
 */
export async function createOffBoardGridItem(node: Node, typeId: GridItemSnapshot['typeId']): Promise<GridItemView | null> {
    const game = await loadIntegratedGameContent()
    if (!node.isValid || !game.presentation.gridItems[typeId]) return null
    return game.views.gridItems.create({ node, content: game, item: { typeId } })
}

/** A projectile in `node`, as it is off the board: its picture or its animation, without its shadow. Nothing without a presentation. */
export async function createOffBoardProjectile(node: Node, typeId: string): Promise<ProjectileView | null> {
    const game = await loadIntegratedGameContent()
    if (!node.isValid || !game.presentation.projectiles[typeId]) return null
    return game.views.projectiles.create({ node, content: game, projectile: { typeId } })
}
