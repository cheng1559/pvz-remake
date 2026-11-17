import type { ZombiePresentationDefinition } from '@/shared/content/presentation'

/**
 * Where a zombie walking right is drawn: Zombie::UpdateReanim's 90 further, flipped, whatever the clip's offset. One
 * put down facing right lines up through where it stands (ZombieDefinition.facingRightOffsetX), not how it is drawn.
 */
export const MIRRORED_SHIFT = 90

/**
 * Zombie::UpdateReanim: a zombie of another size (ZombieDefinition.scale) has its body drawn so about this point of its
 * Reanim (Y down), and turned round 90 times its size further right.
 */
export const ZOMBIE_PIVOT = { x: 30, y: 120 } as const

/** What decides which body parts a zombie shows. */
export interface ZombiePartState {
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    /** -1 without a helm, otherwise its damage index. */
    helmStage: number
    /** -1 without a shield, otherwise its damage index. */
    shieldStage: number
    /** Zombie::ShowDoorArms: the shield is worn and the zombie is not eating. */
    holdingShield: boolean
}

/**
 * Track visibility for any zombie's parts, in the order it is applied: a later entry wins for a track in two lists. Its
 * kind's own come before (ZombieView.ownParts: the flag zombie's arms).
 */
export function zombiePartVisibility(presentation: ZombiePresentationDefinition, state: ZombiePartState): Array<[readonly string[], boolean]> {
    const parts = presentation.parts, helm = presentation.helm, shield = presentation.shield
    const result: Array<[readonly string[], boolean]> = []
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
