import { type GameplayDefinitions, MOWER_READY_X, mowerY } from '@/shared/content/gameplay'
import type { GameSystem, World } from '@/server/state/World'
import { LevelStateResource, MowedPlantComponent, MowerComponent, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { stepLayers } from '@/shared/content/animation'
import { MOWERED_ANIMATION, squashed } from '@/shared/content/zombieAnimation'
import { zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { mowsZombie } from '../combat/MowingProjectile'
import { readyMowers } from './lawn'
import { Mower } from './Mower'

/**
 * Board::InitLawnMowers (from CutScene::PlaceLawnItems): a row's mower, ready where it waits at the row's house end. The
 * intro rolls it in there on the client (LevelIntro.mowerArrival), which the server, not running the intro's time,
 * does not see; `/lawnmower reset` puts a new one down this way too.
 */
export function createMower(world: World, row: number): number {
    const entity = world.createEntity(), level = world.resources.get(LevelStateResource)
    world.add(entity, PositionComponent, { x: MOWER_READY_X, y: mowerY(level.board, row), row })
    world.add(entity, MowerComponent, new Mower(level.definition.lawnMower))
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
            const ready = readyMowers(world)
            if (ready.size) for (const entity of [...world.query(PositionComponent, ZombieComponent)]) {
                const position = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
                const mower = ready.get(position.row)
                // Dead zombies cannot set a mower off themselves (LawnMower::Update).
                if (mower === undefined || !zombie.hasHead || !mowsZombie(zombie, 'plants')) continue
                const waiting = world.get(mower, MowerComponent)!, hitbox = definitions.projectiles[waiting.typeId].hitbox
                const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
                const left = world.get(mower, PositionComponent)!.x + hitbox.x
                if (Math.min(left + hitbox.width, position.x + body.x + body.width) > Math.max(left, position.x + body.x)) {
                    ready.delete(position.row)
                    waiting.setOff(world, definitions, mower, { entity, position, zombie })
                }
            }
            // A mowed plant is squashed as a mowed zombie is, by the driver it plays, then gone.
            const random = world.resources.get(RandomResource)
            for (const entity of world.query(MowedPlantComponent)) {
                const { squash } = world.get(entity, MowedPlantComponent)!
                stepLayers(MOWERED_ANIMATION, { animations: { squash } }, random)
                if (squashed(squash)) commands.destroyEntity(entity)
            }
        },
    }
}
