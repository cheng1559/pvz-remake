import type { ZombiePresentationDefinition } from '@/shared/content/presentation'

/**
 * Where a zombie walking right is drawn: Zombie::UpdateReanim's 90 further, flipped, whatever the clip's offset. One
 * put down facing right lines up through where it stands (ZombieDefinition.facingRightOffsetX), not how it is drawn.
 */
export const MIRRORED_SHIFT = 90

/** Zombie.cpp ZOMBIE_MINDCONTROLLED_COLOR: multiplied over a mind-controlled zombie, and added again. */
export const MIND_CONTROLLED_RGB = [128, 64, 192] as const

/** What decides which body parts a zombie shows. */
export interface ZombiePartState {
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    /** Carrying its flag (Zombie::ZombieInitialize, DropFlag). */
    holdingFlag: boolean
    /** -1 without a helm, otherwise its damage index. */
    helmStage: number
    /** -1 without a shield, otherwise its damage index. */
    shieldStage: number
    /** Zombie::ShowDoorArms: the shield is worn and the zombie is not eating. */
    holdingShield: boolean
}

/** The state of a zombie shown whole and at rest: the almanac, seed packets and level previews. */
export function displayPartState(presentation: ZombiePresentationDefinition, holdingFlag: boolean): ZombiePartState {
    const helmStage = presentation.helm ? 0 : -1, shieldStage = presentation.shield ? 0 : -1
    // ZombieView keeps the tongue for the zombies that roll one; a display shows none.
    return { hasHead: true, hasTongue: false, hasArm: true, holdingFlag, helmStage, shieldStage, holdingShield: shieldStage >= 0 }
}

/**
 * Track visibility for a zombie's parts, in the order it is applied: a later entry wins for a track in two lists.
 * Shared by the level's ZombieView and the almanac and preview displays so both show the same body.
 */
export function zombiePartVisibility(presentation: ZombiePresentationDefinition, state: ZombiePartState): Array<[readonly string[], boolean]> {
    const parts = presentation.parts, helm = presentation.helm, shield = presentation.shield
    const result: Array<[readonly string[], boolean]> = []
    if (parts.flagArm) {
        result.push([parts.flagArm.free, !state.holdingFlag], [parts.flagArm.holding, state.holdingFlag])
    }
    result.push([parts.head, state.hasHead])
    // Zombie::ZombieInitialize hides the hair under a helm until DropHelm shows it again.
    result.push([parts.hair, state.hasHead && (state.helmStage < 0 || helm?.showsHair === true)])
    result.push([parts.tongue, state.hasHead && state.hasTongue])
    // Zombie::DropPole: losing the head also drops the pole and the hand that holds it.
    result.push([parts.held ?? [], state.hasHead])
    if (parts.shieldArms) {
        result.push([parts.shieldArms.holding, state.holdingShield], [parts.shieldArms.free, !state.holdingShield])
    }
    // A lost arm stays hidden whichever arms are up (ShowDoorArms re-hides the lower arm and hand).
    result.push([parts.arm, state.hasArm && !(parts.shieldArms && state.holdingShield)])
    for (const track of parts.helms) {
        result.push([[track], helm?.track === track && state.helmStage >= 0 || shield?.track === track && state.shieldStage >= 0])
    }
    return result
}

/** The tracks left hidden once every entry is applied. */
export function hiddenZombieParts(presentation: ZombiePresentationDefinition, state: ZombiePartState): string[] {
    const visible = new Map<string, boolean>()
    for (const [tracks, shown] of zombiePartVisibility(presentation, state)) for (const track of tracks) visible.set(track, shown)
    return [...visible].filter(([, shown]) => !shown).map(([track]) => track)
}
