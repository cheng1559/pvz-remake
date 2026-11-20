import type { GameSystem, Schedule, World } from '@/server/state/World'
import type { GameplayDefinitions, GameplayLevels, LevelDefinition, LevelRule } from '@/shared/content/gameplay'
import type { LevelPlantingRule } from '@/shared/content/planting'
import type { JsonObject } from '@/shared/protocol'
import { isModId, isQualifiedId, Registry } from '@/shared/mod'
import { pickWeighted } from '@/shared/random'
import { defineResource } from '@/server/state/World'
import type { DeterministicRng } from '../state/DeterministicRng'
import type { CommandRejectionCode, Session } from '../session/session'

/** A wave as the level plays it. */
export interface WavePlan { zombies: string[]; flagWave?: true }

/** A wave before its random picks: the fixed zombies, and the points left for the rest (none once at or below zero). */
export interface WaveDraft { zombies: string[]; flagWave?: true; points: number }

/**
 * A level's rules, by its `rules: {kind, count, ...settings}`: they build the waves, and the optional hooks change the
 * level's play where the original's Board calls into Challenge. The generic systems only call these hooks, so a mode's
 * whole design stays in its own module. Its share of Board::CanPlantAt (`canPlantAt`) is the shared LevelPlantingRule,
 * which its client view takes too.
 */
export interface LevelRuleDefinition extends LevelPlantingRule {
    /** Throw on settings the rule does not take or that do not fit the level. */
    validate(rule: LevelRule, level: LevelDefinition, definitions: GameplayDefinitions, name: string): void
    /** The level's waves before the random picks. */
    draft(rule: LevelRule, level: LevelDefinition, definitions: GameplayDefinitions): WaveDraft[]
    /** Systems the level adds to the schedule, after the wave system in their phase. */
    systems?(definitions: GameplayDefinitions): ReadonlyArray<{ phase: Parameters<Schedule['add']>[0]; system: GameSystem }>
    /** Challenge::UpdateZombieSpawning: the rule raises the zombies itself and the wave system stands by. */
    readonly spawnsZombies?: true
    /** Board::InitLevel and Challenge::StartLevel, before the level's script. */
    initialize?(world: World, definitions: GameplayDefinitions): void
    /** Checks a saved `wave.ruleState` and returns it as the rule keeps it; required for a rule that keeps one. */
    parseState?(value: JsonObject): JsonObject
    /** What the client sees of the rule, under `extensions[kind]`; the rule's client view (LevelRuleView) parses it. */
    snapshot?(world: World): JsonObject | undefined
    /** Challenge::MouseDown: a click on the board that hit nothing else. */
    boardClick?(session: Session, x: number, y: number): CommandRejectionCode | undefined
    /** Challenge::ClearCursor, after Board::ClearCursor empties the cursor. */
    cursorCleared?(world: World): void
    /** Board::MouseDownWithPlant: a seed that cannot go where it is placed is dropped instead of staying in hand. */
    readonly dropsRefusedSeeds?: true
    /** Board::DropLootPiece after the roll: true when the rule has dealt with the drop. */
    dropLoot?(world: World, definitions: GameplayDefinitions, x: number, y: number, roll: number, factor: number): boolean
    /** True while the level award must not drop yet. */
    holdsAward?(world: World): boolean
}

export const LevelRuleResource = defineResource<LevelRuleDefinition | undefined>('pvz:level-rule')

/** The running level's rules; undefined for a level with listed waves. */
export function levelRule(world: World): LevelRuleDefinition | undefined {
    return world.resources.has(LevelRuleResource) ? world.resources.get(LevelRuleResource) : undefined
}

/** The points a zombie spends and its loot's odds: its zombiePool entry, else its definition (mZombieValue). */
export function zombieValue(level: LevelDefinition, definitions: GameplayDefinitions, id: string): number {
    return level.zombiePool?.find(entry => entry.id === id)?.points ?? definitions.zombies[id].wave.points
}

export class LevelRuleRegistry {
    private readonly rules = new Registry<LevelRuleDefinition>('level rule')

    register(ownerId: string, kind: string, rule: LevelRuleDefinition): void {
        if (!isModId(ownerId) || !isQualifiedId(kind) || typeof rule?.validate !== 'function' || typeof rule.draft !== 'function') {
            throw new Error(`Invalid level rule: ${kind}`)
        }
        this.rules.register(kind, Object.freeze(rule), ownerId)
    }

    has(kind: string): boolean { return this.rules.has(kind) }

    /** The installed rule of `level`; undefined for listed waves. */
    get(level: LevelDefinition): LevelRuleDefinition | undefined {
        if (!level.rules) return undefined
        const rule = this.rules.get(level.rules.kind)
        if (!rule) throw new Error(`level rule is not installed: ${level.rules.kind}`)
        return rule
    }

    checkpoint(): () => void { return this.rules.checkpoint() }

    validate(levels: GameplayLevels, definitions: GameplayDefinitions): void {
        for (const [id, level] of Object.entries(levels.levels)) {
            if (!level.rules) continue
            const rule = this.rules.get(level.rules.kind)
            if (!rule) throw new Error(`${id}.rules: level rule is not installed: ${level.rules.kind}`)
            rule.validate(level.rules, level, definitions, `${id}.rules`)
        }
    }

    freeze(): void { this.rules.freeze() }

    /** The level's waves before the random picks. */
    draft(level: LevelDefinition, definitions: GameplayDefinitions): WaveDraft[] {
        if (!level.rules) {
            return level.waves!.map(wave => ({ zombies: [...wave.zombies], ...(wave.flagWave ? { flagWave: true as const } : {}),
                points: wave.points === undefined ? 0 : wave.points - wave.zombies.reduce((sum, id) => sum + zombieValue(level, definitions, id), 0) }))
        }
        return this.get(level)!.draft(level.rules, level, definitions)
    }
}

/** Board::PickZombieWaves: after the fixed zombies, spend the remaining points by weight. */
export function planWaves(drafts: WaveDraft[], level: LevelDefinition, random: DeterministicRng): WavePlan[] {
    return drafts.map((draft, index) => {
        const zombies = [...draft.zombies]
        let remaining = draft.points
        while (remaining > 0) {
            const choices = level.zombiePool!.filter(entry => entry.weight > 0 && entry.points <= remaining && index + 1 >= (entry.firstWave ?? 1))
            const picked = pickWeighted(choices, random)
            zombies.push(picked.id)
            remaining -= picked.points
        }
        return { zombies, ...(draft.flagWave ? { flagWave: true as const } : {}) }
    })
}
