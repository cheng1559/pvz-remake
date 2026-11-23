import { type GameplayDefinitions, MOWER_READY_X, mowerY } from '@/shared/content/gameplay'
import type { GameSystem, World } from '@/server/state/World'
import { LevelStateResource, RandomResource } from '../state/resources'
import { stepLayers } from '@/shared/content/animation'
import { MOWERED_ANIMATION, squashed } from '@/shared/content/zombieAnimation'
import { zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { mowsZombie } from '../projectiles/MowingProjectile'
import { Mower } from './Mower'

/**
 * Board::InitLawnMowers (from CutScene::PlaceLawnItems): a row's mower, ready where it waits at the row's house end. The
 * intro rolls it in there on the client (LevelIntro.mowerArrival), which the server, not running the intro's time,
 * does not see; `/lawnmower reset` puts a new one down this way too.
 */
export function createMower(world: World, row: number): number {
    const entity = world.createEntity(), level = world.resources.get(LevelStateResource)
    world.insert(world.mowers, Object.assign(new Mower(level.definition.lawnMower), { id: entity, position: { x: MOWER_READY_X, y: mowerY(level.board, row), row } }))
    return entity
}

/**
 * The level's mowers. One waits at each active row's end (createMower) until a zombie with its head reaches it, and
 * then sets off as the level's mowing projectile (Mower.setOff), which the projectile system flies like any other
 * (MowingProjectile); a plant it mowed is squashed here.
 */
export function createMowerSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:mower',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            // Each row's waiting mower and the span it sets off from, made once a run rather than for each zombie.
            const ready: ({ mower: Mower, left: number, right: number } | undefined)[] = []
            for (const mower of world.mowers) {
                const hitbox = definitions.projectiles[mower.typeId].hitbox, left = mower.position.x + hitbox.x
                ready[mower.position.row] = { mower, left, right: left + hitbox.width }
            }
            // The list as it goes: a mower setting off takes only the zombie that set it off out of it.
            if (ready.length) for (const zombie of world.zombies) {
                const { position } = zombie
                const waiting = ready[position.row]
                // Dead zombies cannot set a mower off themselves (LawnMower::Update).
                if (waiting === undefined || !zombie.hasHead || !mowsZombie(zombie, 'plants')) continue
                const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
                if (Math.min(waiting.right, position.x + body.x + body.width) > Math.max(waiting.left, position.x + body.x)) {
                    ready[position.row] = undefined
                    waiting.mower.setOff(world, definitions, zombie)
                }
            }
            // A mowed plant is squashed as a mowed zombie is, by the driver it plays, then gone.
            const random = world.resources.get(RandomResource)
            for (const plant of world.plants) {
                if (!plant.mowered) continue
                const { squash } = plant.mowered
                stepLayers(MOWERED_ANIMATION, { animations: { squash } }, random)
                if (squashed(squash)) commands.destroyEntity(plant.id)
            }
        },
    }
}
