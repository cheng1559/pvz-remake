import type { AnimationRandom } from './plantAnimation'

/** Frames a second, drawn for each zombie. */
const IDLE_FPS = { min: 12, max: 18 }, IDLE2_FPS = { min: 12, max: 24 }
const ASSET_FPS = 12

/**
 * Zombie::LoadReanim: a zombie that is not on the board (the almanac, the street before a level) stands, three times
 * in four its second way when it has one (`idle2`: its animation has anim_idle2), at a pace drawn for it. On the board a zombie's animation is the server's
 * (server/zombies/animation), which starts it walking.
 */
export function offBoardZombieAnimation(idle2: boolean, random: AnimationRandom):
    { animation: 'anim_idle' | 'anim_idle2', animationTime: number, animationSpeed: number, start: number } {
    const second = random.integer(0, 3) > 0 && idle2
    const { min, max } = second ? IDLE2_FPS : IDLE_FPS
    const animationSpeed = (min + random.nextFloat() * (max - min)) / ASSET_FPS
    // `start`: how far into the clip it starts, as a part of its length (mAnimTime, 0 to 0.99).
    return { animation: second ? 'anim_idle2' : 'anim_idle', animationTime: 0, animationSpeed, start: random.nextFloat() * 0.99 }
}
