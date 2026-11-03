import type { LevelRule } from '@/shared/content/gameplay'
import { adventureRule } from './adventure'
import type { LevelRuleDefinition } from './registry'

/** Board::PickZombieWaves: Wall-nut Bowling's waves have four times the points. */
const POINTS_SCALE = 4

/** `rules: {kind: "pvz:bowling", count, fixedZombies?}`: the adventure's waves at four times the points. */
function waves(rule: LevelRule): LevelRule {
    const { pointsScale, lineColumn, ...settings } = rule.settings
    if (pointsScale !== undefined) throw new Error('pointsScale is fixed on Wall-nut Bowling')
    if (lineColumn !== undefined) throw new Error('lineColumn is now the level\'s plantingLine: {column}')
    return { ...rule, settings: { ...settings, pointsScale: POINTS_SCALE } }
}

/**
 * Wall-nut Bowling (LawnApp::IsWallnutBowlingLevel): zombies drop no money. The nuts' rolling is their own plant
 * behavior, and the red line the level's own `plantingLine`.
 */
export const bowlingRule: LevelRuleDefinition = {
    validate(rule, level, definitions, name) {
        let parsed: LevelRule
        try { parsed = waves(rule) } catch (error) { throw new Error(`${name}: ${(error as Error).message}`) }
        adventureRule.validate(parsed, level, definitions, name)
    },
    draft(rule, level, definitions) { return adventureRule.draft(waves(rule), level, definitions) },
    /** Board::DropLootPiece: no money on Wall-nut Bowling. */
    dropLoot() { return true },
}
