/** A color a player is drawn in over the rest (ReanimPlayer.setTint). */
export type Tint = Readonly<{ r: number, g: number, b: number }>

/** Zombie::DrawReanim's tint of a chilled zombie (and of a plant a hostile snow pea chilled). */
export const CHILLED_TINT: Tint = { r: 75, g: 75, b: 255 }

/** ZOMBIE_MINDCONTROLLED_COLOR: a mind-controlled zombie's tint, and a mind-controlled plant's. */
export const MIND_CONTROLLED_TINT: Tint = { r: 128, g: 64, b: 192 }

/**
 * Zombie::DrawReanim and OverrideParticleColor: what a zombie or a plant, and the parts it drops, are tinted: a
 * mind-controlled one purple before a chilled one blue; none for the rest.
 */
export function entityTint(mindControlled: boolean, chilled: boolean): Tint | undefined {
    return mindControlled ? MIND_CONTROLLED_TINT : chilled ? CHILLED_TINT : undefined
}
