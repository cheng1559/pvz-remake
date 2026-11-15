/** What a weighted pick draws from: a whole number from `min` to `max`, both included (Sexy::Rand(n) is integer(0, n - 1)). */
export interface IntegerRandom { integer(min: number, max: number): number }

/**
 * PvzpPickArrayItemFromWeightedArray: one of `entries` by its whole-number weight, with one draw below their total. An
 * entry of weight 0 is never picked; the total must be above 0.
 */
export function pickWeighted<T extends { readonly weight: number }>(entries: readonly T[], random: IntegerRandom): T {
    let roll = random.integer(0, entries.reduce((sum, entry) => sum + entry.weight, 0) - 1)
    return entries.find(entry => (roll -= entry.weight) < 0)!
}
