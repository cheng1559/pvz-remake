import type { Position, Zombie, ZombieAnimation } from '../state/components'
import type { GameplayDefinitions, ZombieDefinition, ZombieGait } from '@/shared/content/gameplay'

export const ZOMBIE_ASSET_FPS = 12

export const TICKS_PER_SECOND = 100

const ZOMBIE_WALK_RATE_FACTOR = 47

export const ZOMBIE_MOWERED_FRAME_SPAN = 7

// The original 8 fps driver advances in both EffectSystem and Zombie.UpdateReanim.
export const ZOMBIE_MOWERED_ANIMATION_SPEED = 16 / ZOMBIE_ASSET_FPS

export const ZOMBIE_MOWERED_TICKS = Math.ceil((ZOMBIE_MOWERED_FRAME_SPAN + 1) /
    (ZOMBIE_MOWERED_ANIMATION_SPEED * ZOMBIE_ASSET_FPS) * TICKS_PER_SECOND)

// Original Zombie::ApplyAnimRate halves every animation of a chilled zombie; walking speed follows the `_ground` track.
export const CHILLED_ANIMATION_FACTOR = 0.5

export function zombieGait(definition: ZombieDefinition, definitions: GameplayDefinitions): ZombieGait {
    return definitions.zombieGaits[definition.gait]
}

export function walkZombie(zombie: Zombie, position: Position, ground: readonly number[], pace: number): void {
    const span = ground.length - 1
    zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick, ground) * pace
    const previous = sampleGround(ground, zombie.animationTime)
    const nextTime = zombie.animationTime + zombie.animationSpeed * ZOMBIE_ASSET_FPS / TICKS_PER_SECOND
    const loops = Math.floor(nextTime / span)
    zombie.animationTime = nextTime % span
    const next = sampleGround(ground, zombie.animationTime)
    // A local backwards step in the ground track is not an animation loop.
    position.x -= loops * (ground[span] - ground[0]) + next - previous
}

export function walkAnimationSpeed(speed: number, ground: readonly number[]): number {
    return speed * ground.length / (ground[ground.length - 1] - ground[0]) * ZOMBIE_WALK_RATE_FACTOR / ZOMBIE_ASSET_FPS
}

function sampleGround(ground: readonly number[], time: number): number {
    const left = Math.max(0, Math.min(ground.length - 1, Math.floor(time)))
    const right = Math.min(ground.length - 1, left + 1)
    const t = time - left
    return ground[left] + (ground[right] - ground[left]) * t
}

export function deathOf(gait: ZombieGait, animation: ZombieAnimation): ZombieGait['deaths'][number] {
    return gait.deaths.find(death => death.animation === animation) ?? gait.deaths[0]
}
