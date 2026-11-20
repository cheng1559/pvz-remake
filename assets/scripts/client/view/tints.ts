/** A color a player is drawn in over the rest (ReanimPlayer.setTint). */
export type Tint = Readonly<{ r: number, g: number, b: number }>

/** Zombie::DrawReanim's tint of a chilled zombie (and of a plant a hostile snow pea chilled). */
export const CHILLED_TINT: Tint = { r: 75, g: 75, b: 255 }

/** ZOMBIE_MINDCONTROLLED_COLOR: a mind-controlled zombie's tint, and a mind-controlled plant's. */
export const MIND_CONTROLLED_TINT: Tint = { r: 128, g: 64, b: 192 }

/**
 * Not in the original, whose mind-controlled zombies are never chilled (Zombie::CanBeChilled): one both mind-controlled
 * and chilled or frozen is drawn halfway between the two tints, so that both show: (102, 70, 224).
 */
export const MIND_CONTROLLED_CHILLED_TINT: Tint = {
    r: Math.round((MIND_CONTROLLED_TINT.r + CHILLED_TINT.r) / 2),
    g: Math.round((MIND_CONTROLLED_TINT.g + CHILLED_TINT.g) / 2),
    b: Math.round((MIND_CONTROLLED_TINT.b + CHILLED_TINT.b) / 2),
}

/**
 * Zombie::DrawReanim and OverrideParticleColor: what a zombie or a plant, and the parts it drops, are tinted: a
 * mind-controlled one purple, a chilled or frozen one blue, one that is both between the two; none for the rest.
 */
export function entityTint(mindControlled: boolean, chilled: boolean): Tint | undefined {
    if (mindControlled) return chilled ? MIND_CONTROLLED_CHILLED_TINT : MIND_CONTROLLED_TINT
    return chilled ? CHILLED_TINT : undefined
}
