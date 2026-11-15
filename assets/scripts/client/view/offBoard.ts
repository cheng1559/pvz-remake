import type { Node } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { PlantDraw, PlantView, ShownPlant } from '@/client/plants/PlantView'
import { plantDefinition } from '@/client/plants/definitions'
import type { ZombieDraw, ZombieViewInstance, ZombieViewSprites } from '@/client/zombies/ZombieView'
import { type AnimationRandom, startOffBoardPlant, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { offBoardZombieAnimation } from '@/shared/content/zombieAnimation'
import type { GridItemSnapshot, ZombieSnapshot } from '@/shared/protocol/index'
import { EntityAttachments } from './EntityAttachments'

/**
 * Plants and zombies off the board: the almanac, a packet's picture, a preview, the street before a level. Each is
 * drawn by the view the board draws it with, and animated by the rules the server animates it by; only who keeps the
 * animation differs (shared/content/plantAnimation, zombieAnimation).
 */

type Content = Awaited<ReturnType<typeof loadIntegratedGameContent>>
let content: Promise<Content> | undefined

/** The game's content, loaded once for everything shown off the board: loading it anew builds every definition again. */
export function offBoardContent(): Promise<Content> {
    return content ??= loadIntegratedGameContent().catch(error => { content = undefined; throw error })
}

/** Nothing off the board is the server's, so nothing has to come out the same twice. */
const random: AnimationRandom = { nextFloat: () => Math.random(), integer: (min, max) => min + Math.floor(Math.random() * (max - min + 1)) }

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
    const shadow = await new SpriteRepository(game.registry, game.loader).load('pvz:plantshadow')
    if (!node.isValid) return null
    const view = await game.plantViews.create({
        node, attachments: new EntityAttachments(), content: game, animations: game.animations, assets: { shadow }, plant, tick: 0, draw: options.draw,
    })
    return { view, advance(ticks) {
        for (let tick = 0; tick < ticks; tick++) stepPlantAnimation(animation, state, random)
        view.show(plant)
    } }
}

export interface OffBoardZombie {
    view: ZombieViewInstance & Required<Pick<ZombieViewInstance, 'display' | 'players'>>
    /** What is shown; shown again with a change (the side it is on). */
    zombie: ZombieSnapshot
}

/**
 * A whole zombie in `node`, as it is off the board (Zombie::LoadReanim when it is not on it): standing, or held on the
 * first frame of `pose` (a clip of its presentation) for a picture. Its shadow, when drawn, goes beside the node. Nothing
 * for a zombie whose view does not draw it off the board.
 */
export async function createOffBoardZombie(node: Node, typeId: string,
    options: { pose?: string, mirrored?: boolean, hasTongue?: boolean, draw?: ZombieDraw } = {}): Promise<OffBoardZombie | null> {
    const game = await offBoardContent()
    const definition = game.definitions.zombies[typeId]
    if (!definition || !node.isValid) return null
    const standing = options.pose === undefined ? offBoardZombieAnimation(definition, random)
        : { animation: `anim_${options.pose}` as ZombieSnapshot['animation'], animationTime: 0, animationSpeed: 1, start: 0 }
    const { start, ...animation } = standing
    // Whole and at rest, with its own helm and shield worn: none of the rest of a snapshot is read off the board.
    const zombie = {
        entityId: -1, typeId, x: 0, y: 0, row: 0, state: 'walking', team: options.mirrored ? 'plants' : undefined,
        hasHead: true, hasArm: true, hasTongue: options.hasTongue === true,
        helmHealth: definition.helm?.health, shieldHealth: definition.shield?.health, ...animation,
    } as ZombieSnapshot
    const shadow = await new SpriteRepository(game.registry, game.loader).load('pvz:plantshadow')
    if (!node.isValid) return null
    const view = await game.zombieViews.create({
        node, attachments: new EntityAttachments(), shadowParent: node.parent!, content: game, animations: game.animations,
        // A whole zombie swaps in none of the sprites of a damaged one.
        assets: { shadow, sprites: { helms: {} } as ZombieViewSprites }, zombie, tick: 0, draw: options.draw,
    })
    if (!view.display || !view.players) { view.destroy(); return null }
    view.shadowNode.setSiblingIndex(0)
    view.display(zombie, start)
    return { view: view as OffBoardZombie['view'], zombie }
}

/**
 * A thing of a cell in `node`, as it stands off the board (a grave risen, for a packet's picture or a preview): drawn
 * by its view. Nothing when its type has none.
 */
export async function createOffBoardGridItem(node: Node, typeId: GridItemSnapshot['typeId']): Promise<boolean> {
    const game = await offBoardContent()
    if (!node.isValid || !game.presentation.gridItems[typeId]) return false
    await game.gridItemViews.create({ node, content: game, item: { typeId } })
    return true
}
