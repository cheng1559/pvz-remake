import type { Node } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { PlantDraw, PlantView, ShownPlant } from '@/client/plants/PlantView'
import { plantDefinition } from '@/client/plants/definitions'
import type { ZombieDraw, ZombieView } from '@/client/zombies/ZombieView'
import { type AnimationRandom } from '@/shared/content/animation'
import { startOffBoardPlant, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { startOffBoardZombie } from '@/shared/content/zombieAnimation'
import type { GridItemSnapshot, ZombieSnapshot } from '@/shared/protocol/index'

/**
 * Plants and zombies off the board: the almanac, a packet's picture, a preview, the street before a level. Each is
 * drawn by the view the board draws it with, and animated by the rules the server animates it by; only who keeps the
 * animation differs (shared/content/animation, plantAnimation, zombieAnimation).
 */

/** The game's content for everything shown off the board, the one a level is drawn with (loaded once). */
export function offBoardContent(): ReturnType<typeof loadIntegratedGameContent> {
    return loadIntegratedGameContent()
}

/** Nothing off the board is the server's, so nothing has to come out the same twice. */
const random: AnimationRandom = { nextFloat: () => Math.random(), integer: (min, max) => min + Math.floor(Math.random() * (max - min + 1)) }
/** The same for whatever else only a client shows (the store's chatter). */
export { random as offBoardRandom }

export interface OffBoardPlant {
    view: PlantView
    /** Its animation goes on by this many ticks, and is shown. */
    advance(ticks: number): void
}

/**
 * A plant in `node`, as it is off the board (Plant::PlantInitialize when it is not in play). `packet`: as a packet's
 * picture has it (PlantPresentationDefinition.packet). Nothing for a plant that has no animation to draw it by.
 */
export async function createOffBoardPlant(node: Node, typeId: string, options: { packet?: boolean, draw?: PlantDraw } = {}): Promise<OffBoardPlant | null> {
    const game = await offBoardContent()
    const animation = game.definitions.plants[typeId]?.animation
    if (!animation || !node.isValid) return null
    const presentation = plantDefinition(game.presentation, typeId), packet = options.packet ? presentation.packet : undefined
    const state = startOffBoardPlant(animation, { ...presentation.offBoard, ...packet?.clips }, random, packet?.time)
    const plant: ShownPlant = { typeId, animations: state.animations }
    const view = await game.views.plants.create({ node, content: game, plant, draw: options.draw })
    return { view, advance(ticks) {
        for (let tick = 0; tick < ticks; tick++) stepPlantAnimation(animation, state, random)
        view.show(plant)
    } }
}

export interface OffBoardZombie {
    view: ZombieView
    /** What is shown; shown again with a change (the side it is on). */
    zombie: ZombieSnapshot
}

/**
 * A whole zombie in `node`, as it is off the board (Zombie::LoadReanim when it is not on it): standing, or held on the
 * first frame of `pose` (a clip of its presentation) for a picture. Its shadow, when drawn, goes beside the node.
 */
export async function createOffBoardZombie(node: Node, typeId: string,
    options: { pose?: string, mirrored?: boolean, hasTongue?: boolean, draw?: ZombieDraw } = {}): Promise<OffBoardZombie | null> {
    const game = await offBoardContent()
    const definition = game.definitions.zombies[typeId]
    if (!definition || !node.isValid) return null
    const clips: Record<string, unknown> = game.animations.resolve(typeId)
    const animations = startOffBoardZombie(definition.animation, clip => clips[clip] !== undefined, random, options.pose)
    // Whole and at rest, with its own helm and shield worn: little else of a snapshot is read off the board.
    const zombie: ZombieSnapshot = {
        entityId: -1, typeId, x: 0, y: 0, row: 0, state: 'walking', team: options.mirrored ? 'plants' : undefined,
        health: definition.maxHealth, maxHealth: definition.maxHealth, alpha: 255,
        hasHead: true, hasArm: true, hasTongue: options.hasTongue === true,
        helmHealth: definition.helm?.health ?? 0, shieldHealth: definition.shield?.health ?? 0, animations,
    }
    const view = await game.views.zombies.create({ node, content: game, zombie, draw: options.draw })
    view.shadowNode.setSiblingIndex(0)
    view.show(zombie)
    return { view, zombie }
}

/**
 * A thing of a cell in `node`, as it stands off the board (a grave risen, for a packet's picture or a preview): drawn
 * by its view. Nothing when its type has none.
 */
export async function createOffBoardGridItem(node: Node, typeId: GridItemSnapshot['typeId']): Promise<boolean> {
    const game = await offBoardContent()
    if (!node.isValid || !game.presentation.gridItems[typeId]) return false
    await game.views.gridItems.create({ node, content: game, item: { typeId } })
    return true
}
