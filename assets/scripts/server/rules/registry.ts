import type { GameSystem, Schedule, World } from '@/ecs/index'
import type { GameplayDefinitions, GameplayLevels, LevelDefinition, LevelRule } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { isModId, isQualifiedId } from '@/shared/mod'
import { defineResource } from '@/ecs/index'
import type { DeterministicRng } from '../state/DeterministicRng'
import type { CommandRejectionCode, Session } from '../session/session'

/** A wave as the level plays it. */
export interface WavePlan { zombies: string[]; flagWave?: true }

/** A wave before its random picks: the fixed zombies, and the points left for the rest (none once at or below zero). */
export interface WaveDraft { zombies: string[]; flagWave?: true; points: number }

/**
 * A level's rules, by its `rules: {kind, count, ...settings}`: they build the waves, and the optional hooks change the
 * level's play where the original's Board calls into Challenge. The generic systems only call these hooks, so a mode's
 * whole design stays in its own module.
 */
export interface LevelRuleDefinition {
    /** Throw on settings the rule does not take or that do not fit the level. */
    validate(rule: LevelRule, level: LevelDefinition, definitions: GameplayDefinitions, name: string): void
    /** The level's waves before the random picks. */
    draft(rule: LevelRule, level: LevelDefinition, definitions: GameplayDefinitions): WaveDraft[]
    /** Systems the level adds to the schedule, after the wave system in their phase. */
    systems?(definitions: GameplayDefinitions): ReadonlyArray<{ phase: Parameters<Schedule['add']>[0]; system: GameSystem }>
    /** Challenge::UpdateZombieSpawning: the rule raises the zombies itself and the wave system stands by. */
    readonly spawnsZombies?: true
    /** Board::InitLevel and Challenge::StartLevel, before the level's script. */
    initialize?(world: World): void
    /** Checks a saved `wave.ruleState` and returns it as the rule keeps it; required for a rule that keeps one. */
    parseState?(value: JsonObject): JsonObject
    /** What the client sees of the rule, under `extensions[kind]`. */
    snapshot?(world: World): JsonObject | undefined
    /** Challenge::MouseDown: a click on the board that hit nothing else. */
    boardClick?(session: Session, x: number, y: number): CommandRejectionCode | undefined
    /** Challenge::ClearCursor, after Board::ClearCursor empties the cursor. */
    cursorCleared?(world: World): void
    /** Board::MouseDownWithPlant: a seed that cannot go where it is placed is dropped instead of staying in hand. */
    readonly dropsRefusedSeeds?: true
    /** Board::CanPlantAt: false keeps the cell closed (the rule shows its own advice). */
    canPlantAt?(world: World, row: number, column: number): boolean
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

/** The points a zombie spends: its zombiePool entry, else its definition (mZombieValue). */
export function zombieValue(level: LevelDefinition, definitions: GameplayDefinitions, id: string): number {
    const points = level.zombiePool?.find(entry => entry.id === id)?.points ?? definitions.zombies[id].wave?.points
    if (points === undefined) throw new Error(`${id} has no wave points`)
    return points
}

export class LevelRuleRegistry {
    private readonly entries = new Map<string, { ownerId: string; rule: LevelRuleDefinition }>()
    private frozen = false

    register(ownerId: string, kind: string, rule: LevelRuleDefinition): void {
        if (this.frozen) throw new Error('level rules are frozen')
        if (!isModId(ownerId) || !isQualifiedId(kind) || typeof rule?.validate !== 'function' || typeof rule.draft !== 'function') {
            throw new Error(`Invalid level rule: ${kind}`)
        }
        const existing = this.entries.get(kind)
        if (existing) throw new Error(`level rule ${kind} is already registered by ${existing.ownerId}`)
        this.entries.set(kind, { ownerId, rule: Object.freeze(rule) })
    }

    has(kind: string): boolean { return this.entries.has(kind) }

    /** The installed rule of `level`; undefined for listed waves. */
    get(level: LevelDefinition): LevelRuleDefinition | undefined {
        if (!level.rules) return undefined
        const entry = this.entries.get(level.rules.kind)
        if (!entry) throw new Error(`level rule is not installed: ${level.rules.kind}`)
        return entry.rule
    }

    checkpoint(): () => void {
        const kinds = new Set(this.entries.keys())
        return () => { for (const kind of [...this.entries.keys()]) if (!kinds.has(kind)) this.entries.delete(kind) }
    }

    validate(levels: GameplayLevels, definitions: GameplayDefinitions): void {
        for (const [id, level] of Object.entries(levels.levels)) {
            if (!level.rules) continue
            const entry = this.entries.get(level.rules.kind)
            if (!entry) throw new Error(`${id}.rules: level rule is not installed: ${level.rules.kind}`)
            entry.rule.validate(level.rules, level, definitions, `${id}.rules`)
        }
    }

    freeze(): void { this.frozen = true }

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
            let roll = random.integer(0, choices.reduce((sum, entry) => sum + entry.weight, 0) - 1)
            const picked = choices.find(entry => (roll -= entry.weight) < 0)!
            zombies.push(picked.id)
            remaining -= picked.points
        }
        return { zombies, ...(draft.flagWave ? { flagWave: true as const } : {}) }
    })
}
