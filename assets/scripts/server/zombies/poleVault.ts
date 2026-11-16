import { EventQueueResource, emitServerEvent } from '../state/events'
import { type GameplayDefinitions, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import { type Position, RandomResource, type Zombie } from '../state/components'
import { TICKS_PER_SECOND, playZombie, stepZombie, walkAgain, zombieBody } from './animation'
import { type AnimationRandom, passedMark } from '@/shared/content/animation'
import type { World } from '@/ecs/index'
import { PLANT_WIDTH, teamDirection, ZOMBIE_WIDTH, zombieTeam } from '@/shared/content/teams'

const POLE_VAULT_STEP_TIME = 0.2

const POLE_VAULT_SOUND_TIME = 0.4

export function startVault(
    zombie: Zombie,
    position: Position,
    plantPosition: Position,
    definition: ZombieDefinition,
    random: AnimationRandom,
    /** Over a rolling nut the zombie jumps where it stands. */
    inPlace = false,
): void {
    zombie.state = 'vaulting'
    const jump = playZombie(zombie, definition.animation, ZOMBIE_CLIPS.jump, random)
    zombie.biteTicks = 0
    zombie.hasPole = false
    // Zombie::UpdateZombiePolevaulter spreads the jump over the animation; the landing adds the rest. The jump ends 80
    // past the plant's left edge (mX - aPlant->mX - 80); a zombie facing right mirrors that across both widths. One
    // put down on the plant's own cell does not jump back (the original's zombies never stand there).
    const durationTicks = definition.animation.clips[ZOMBIE_CLIPS.jump].frames / jump.rate * TICKS_PER_SECOND
    const x = Math.trunc(position.x)
    const distance = teamDirection(zombieTeam(zombie)) < 0 ? x - plantPosition.x - 80
        : plantPosition.x - x - (ZOMBIE_WIDTH - PLANT_WIDTH) - 80
    zombie.speedPerTick = inPlace ? 0 : Math.max(0, distance) / durationTicks
}

export function updateVault(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    zombie: Zombie,
    position: Position,
    pace: number,
): void {
    const definition = definitions.zombies[zombie.typeId]
    const vault = definition.vault!
    const jump = zombieBody(zombie), clip = definition.animation.clips[ZOMBIE_CLIPS.jump], previous = jump.time
    stepZombie(zombie, definition.animation, world.resources.get(RandomResource))
    // A zombie facing right vaults right.
    const direction = teamDirection(zombieTeam(zombie))
    position.x += direction * zombie.speedPerTick * pace
    const events = world.resources.get(EventQueueResource)
    if (passedMark(clip, previous, jump.time, POLE_VAULT_STEP_TIME)) emitServerEvent(events, 'zombieVaultSound', { entityId: entity, sound: 'grassstep' })
    if (passedMark(clip, previous, jump.time, POLE_VAULT_SOUND_TIME)) emitServerEvent(events, 'zombieVaultSound', { entityId: entity, sound: 'polevault' })
    if (jump.time < clip.frames) return
    position.x += direction * vault.landingOffset
    startPostVaultWalk(world, definitions, zombie)
}

/** StartWalkAnim(0), shared by landing and WalkIntoHouse's pre-vault transition. */
export function startPostVaultWalk(world: World, definitions: GameplayDefinitions, zombie: Zombie): void {
    const definition = definitions.zombies[zombie.typeId]
    const random = world.resources.get(RandomResource)
    zombie.hasPole = false
    zombie.state = 'walking'
    walkAgain(zombie, definition, random)
}
