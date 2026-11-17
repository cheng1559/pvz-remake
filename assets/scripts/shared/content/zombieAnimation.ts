import { ASSET_FPS, type Animated, type AnimationRandom, type LayerState, startLayer, startLayers } from './animation'
import { type AnimationClip, type AnimationDefinition, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS } from './gameplay'

/** What only a zombie's animation does (ZombieDefinition.animation), on the rules of every animation (./animation). */

/** How often a zombie stands its second way where it has it: three times in four. */
const SECOND_IN = 4

/**
 * The mower's driver for what it flattens (REANIM_LAWN_MOWERED_ZOMBIE), a zombie or a plant, the same for all: 8
 * frames at 8 a second, advanced twice a tick, and held on the last.
 */
export const MOWERED_CLIP: AnimationClip = { frames: 8, fps: { min: 16, max: 16 }, hold: true }
/**
 * The animation of what is under the mower, whatever it is: the driver, on a zombie's body (its body's layer) and on a
 * mowed plant alike (Plant.mowered.squash).
 */
export const MOWERED_ANIMATION: AnimationDefinition = { clips: { [ZOMBIE_CLIPS.mowered]: MOWERED_CLIP }, layers: {} }

/**
 * Zombie::UpdateMowered: what a mower flattened is gone once the driver's clip it plays (MOWERED_ANIMATION) is through,
 * held on its last frame (the original's mLoopCount).
 */
export function squashed(state: LayerState): boolean {
    return state.clip === ZOMBIE_CLIPS.mowered && state.time >= MOWERED_CLIP.frames
}

/** A clip a zombie's body is on: its animation's, or the mower's. */
export function zombieClip(animation: AnimationDefinition, clip: string): AnimationClip | undefined {
    return clip === ZOMBIE_CLIPS.mowered ? MOWERED_CLIP : animation.clips[clip]
}

/**
 * Zombie::LoadReanim for a zombie that is not on the board (the almanac, the street before a level): it stands, its
 * second way three times in four when it has one (`has`: whoever shows it has the clip's pictures), at the pace and
 * from the part of the clip drawn for it (the clips' `fps` and `start`); what it carries goes on as on the board (a
 * flag waving). On the board a zombie's animation is the server's (server/zombies/animation), which starts it walking.
 * `pose`: its body held on the start of that clip instead, for a picture.
 */
export function startOffBoardZombie(animation: AnimationDefinition, has: (clip: string) => boolean, random: AnimationRandom, pose?: string): Record<string, LayerState> {
    const zombie: Animated = {}
    startLayers(animation, zombie, animation.layers, random)
    const second = pose === undefined && random.integer(0, SECOND_IN - 1) > 0 && animation.clips[ZOMBIE_CLIPS.standing2] !== undefined && has(ZOMBIE_CLIPS.standing2)
    zombie.animations![ZOMBIE_BODY_LAYER] = pose !== undefined ? { clip: pose, time: 0, rate: ASSET_FPS }
        : startLayer(animation, zombie, second ? ZOMBIE_CLIPS.standing2 : ZOMBIE_CLIPS.standing, random)
    return zombie.animations!
}
