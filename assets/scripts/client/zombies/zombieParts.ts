import type { ZombiePresentationDefinition } from '@/shared/content/presentation'
import { mirrorX } from '@/shared/content/teams'

/**
 * Where a zombie walking right is drawn: Zombie::UpdateReanim's 90 further, flipped, whatever the clip's offset, and its
 * presentation's own `turnedOffsetX` on that. One put down facing right lines up through where it stands
 * (ZombieDefinition.facingRightOffsetX), not how it is drawn.
 */
export const MIRRORED_SHIFT = 90

/**
 * Zombie::UpdateReanim: a zombie of another size (ZombieDefinition.scale) has its body drawn so about this point of its
 * Reanim (Y down), and turned round MIRRORED_SHIFT times its size further right.
 */
export const ZOMBIE_PIVOT = { x: 30, y: 120 } as const

/**
 * Zombie::RiseFromGrave's PARTICLE_ZOMBIE_RISE and Zombie::SummonBackupDancer's PARTICLE_DANCER_RISE: the dirt of a
 * zombie coming up, (60, 110) from it, turned round with one walking right. One out of a grave (`graveOffsetX`: the
 * grave's own offset in its cell) comes up through the grave's dirt, turned round with a stone of the plants' side
 * (GraveView) about the stone's middle, 64 right of the zombie by that offset: the zombie comes up 25 left of the cell,
 * the stone's corner is 4 left of it, and the stone is 86 wide. So it lies under the stone of either side. Elsewhere
 * one walking right stands its feet where its shadow is (Zombie::DrawShadow's `backwardsX`, further left), and its
 * dirt comes up as far over. The original leaves the dirt at 60 and unturned, off the feet of a mind-controlled
 * Dancing Zombie's troupe.
 */
export function riseDirt(zombie: { readonly x: number, readonly y: number, readonly team?: string },
    shadow: ZombiePresentationDefinition['shadow'], graveOffsetX?: number): { x: number, y: number, mirrored: boolean } {
    const mirrored = zombie.team === 'plants'
    const x = graveOffsetX !== undefined ? mirrorX(60, 128 + 2 * graveOffsetX, mirrored)
        : 60 + (mirrored ? (shadow.backwardsX ?? shadow.x) - shadow.x : 0)
    return { x: zombie.x + x, y: zombie.y + 110, mirrored }
}

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
