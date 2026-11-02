import type { World } from '@/ecs/index'
import type { LevelRule } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { adventureRule } from './adventure'
import type { LevelRuleDefinition } from './registry'

/** Board::PickZombieWaves: Wall-nut Bowling's waves have four times the points. */
const POINTS_SCALE = 4

/** `rules: {kind: "pvz:bowling", count, lineColumn, fixedZombies?}`: nuts are bowled from the columns up to the red line. */
interface BowlingSettings { lineColumn: number }

function settings(rule: LevelRule): { bowling: BowlingSettings; waves: LevelRule } {
    const { lineColumn, pointsScale, ...waves } = rule.settings
    if (pointsScale !== undefined) throw new Error('pointsScale is fixed on Wall-nut Bowling')
    if (typeof lineColumn !== 'number' || !Number.isSafeInteger(lineColumn) || lineColumn < 0) throw new Error('lineColumn must be a non-negative integer')
    return { bowling: { lineColumn }, waves: { ...rule, settings: { ...waves, pointsScale: POINTS_SCALE } } }
}

function lineColumn(world: World): number {
    return settings(world.resources.get(LevelStateResource).definition.rules!).bowling.lineColumn
}

/**
 * Wall-nut Bowling (LawnApp::IsWallnutBowlingLevel): the conveyor's nuts are bowled from behind the red line, and
 * zombies drop no money. The nuts' rolling is their own plant behavior.
 */
export const bowlingRule: LevelRuleDefinition = {
    validate(rule, level, definitions, name) {
        let parsed: ReturnType<typeof settings>
        try { parsed = settings(rule) } catch (error) { throw new Error(`${name}: ${(error as Error).message}`) }
        if (parsed.bowling.lineColumn >= definitions.boards[level.board].columns) throw new Error(`${name}.lineColumn is outside the lawn`)
        adventureRule.validate(parsed.waves, level, definitions, name)
    },
    draft(rule, level, definitions) { return adventureRule.draft(settings(rule).waves, level, definitions) },
    snapshot(world) { return { lineColumn: lineColumn(world) } },
    /** Board::CanPlantAt: not past the line, with ADVICE_NOT_PASSED_LINE once a game. */
    canPlantAt(world, _row, column) {
        if (column <= lineColumn(world)) return true
        const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
        if (!displayed.includes('ADVICE_NOT_PASSED_LINE')) {
            displayed.push('ADVICE_NOT_PASSED_LINE')
            emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key: 'ADVICE_NOT_PASSED_LINE', style: 'hint' })
        }
        return false
    },
    /** Board::DropLootPiece: no money on Wall-nut Bowling. */
    dropLoot() { return true },
}
