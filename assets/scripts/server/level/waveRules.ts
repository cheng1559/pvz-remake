import type { GameplayDefinitions, GameplayLevels, LevelDefinition, WaveRule } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { isWaveRule } from '@/shared/content/gameplay'
import { isModId, isQualifiedId, BASE_MOD_ID } from '@/shared/mod'
import type { DeterministicRng } from '../state/DeterministicRng'

/** A wave as the level plays it. */
export interface WavePlan { zombies: string[]; flagWave?: true }

/** A wave before its random picks: the fixed zombies, and the points left for the rest (none once at or below zero). */
export interface WaveDraft { zombies: string[]; flagWave?: true; points: number }

/** Builds a level's waves from its `waves: {kind, count, ...settings}` and `zombiePool`. */
export interface WaveRuleDefinition {
    /** Throw on settings the rule does not take or that do not fit the level. */
    validate(rule: WaveRule, level: LevelDefinition, name: string): void
    draft(rule: WaveRule, level: LevelDefinition, definitions: GameplayDefinitions): WaveDraft[]
}

export class WaveRuleRegistry {
    private readonly entries = new Map<string, { ownerId: string; rule: WaveRuleDefinition }>()
    private frozen = false

    register(ownerId: string, kind: string, rule: WaveRuleDefinition): void {
        if (this.frozen) throw new Error('wave rules are frozen')
        if (!isModId(ownerId) || !isQualifiedId(kind) || typeof rule?.validate !== 'function' || typeof rule.draft !== 'function') {
            throw new Error(`Invalid wave rule: ${kind}`)
        }
        const existing = this.entries.get(kind)
        if (existing) throw new Error(`wave rule ${kind} is already registered by ${existing.ownerId}`)
        this.entries.set(kind, { ownerId, rule: Object.freeze(rule) })
    }

    has(kind: string): boolean { return this.entries.has(kind) }

    checkpoint(): () => void {
        const kinds = new Set(this.entries.keys())
        return () => { for (const kind of [...this.entries.keys()]) if (!kinds.has(kind)) this.entries.delete(kind) }
    }

    validate(levels: GameplayLevels): void {
        for (const [id, level] of Object.entries(levels.levels)) {
            if (!isWaveRule(level.waves)) continue
            const entry = this.entries.get(level.waves.kind)
            if (!entry) throw new Error(`${id}.waves: wave rule is not installed: ${level.waves.kind}`)
            entry.rule.validate(level.waves, level, `${id}.waves`)
        }
    }

    freeze(): void { this.frozen = true }

    /** The level's waves before the random picks. */
    draft(level: LevelDefinition, definitions: GameplayDefinitions): WaveDraft[] {
        if (!isWaveRule(level.waves)) {
            return level.waves.map(wave => ({ zombies: [...wave.zombies], ...(wave.flagWave ? { flagWave: true as const } : {}),
                points: wave.points === undefined ? 0 : wave.points - wave.zombies.reduce((sum, id) => sum + zombieValue(level, definitions, id), 0) }))
        }
        const entry = this.entries.get(level.waves.kind)
        if (!entry) throw new Error(`wave rule is not installed: ${level.waves.kind}`)
        return entry.rule.draft(level.waves, level, definitions)
    }
}

/** The points a zombie spends: its zombiePool entry, else its definition (mZombieValue). */
function zombieValue(level: LevelDefinition, definitions: GameplayDefinitions, id: string): number {
    const points = level.zombiePool?.find(entry => entry.id === id)?.points ?? definitions.zombies[id].wave?.points
    if (points === undefined) throw new Error(`${id} has no wave points`)
    return points
}

/** The settings of `waves: {kind: "pvz:adventure", count, ...}`. */
export interface AdventureWaveSettings {
    /** The points multiplier of special levels, e.g. 4 on Wall-nut Bowling (Board::PickZombieWaves). */
    pointsScale: number
    /** `count` (default 1) of a zombie placed on these waves (from 1) before the random picks, in this order. */
    fixedZombies: Array<{ zombie: string; waves: number[]; count: number }>
}

export function adventureWaveSettings(rule: WaveRule, level: LevelDefinition, name: string): AdventureWaveSettings {
    const { pointsScale = 1, fixedZombies = [], ...rest } = rule.settings
    if (Object.keys(rest).length) throw new Error(`${name}.${Object.keys(rest)[0]} is not supported`)
    const positive = (value: unknown, field: string) => {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${field} must be a positive safe integer`)
        return value
    }
    if (!Array.isArray(fixedZombies)) throw new Error(`${name}.fixedZombies must be an array`)
    return {
        pointsScale: positive(pointsScale, `${name}.pointsScale`),
        fixedZombies: fixedZombies.map((value, index) => {
            const field = `${name}.fixedZombies[${index}]`
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`)
            const { zombie, waves, count = 1, ...extra } = value as JsonObject
            if (Object.keys(extra).length) throw new Error(`${field}.${Object.keys(extra)[0]} is not supported`)
            if (typeof zombie !== 'string' || !level.zombiePool?.some(entry => entry.id === zombie)) {
                throw new Error(`${field}.zombie: ${String(zombie)} is not in the zombiePool`)
            }
            if (!Array.isArray(waves) || !waves.length) throw new Error(`${field}.waves must be a non-empty array`)
            return {
                zombie, count: positive(count, `${field}.count`),
                waves: waves.map(wave => {
                    if (positive(wave, `${field}.waves`) > rule.count) throw new Error(`${field}.waves: wave ${String(wave)} is past the last`)
                    return wave as number
                }),
            }
        }),
    }
}

/**
 * Board::PickZombieWaves for a first adventure: wave points are wave / 3 + 1; a flag wave (the last of every ten, or
 * of a shorter level; none on level 1, Board::IsFlagWave) first gets min(points, 8) normal zombies and a flag zombie
 * after multiplying its points by 2.5; then the points take `pointsScale`, and the fixed zombies spend them. The final
 * wave then gets each weighted zombiePool type it still lacks, in pool order (PutInMissingZombies).
 */
export const adventureWaves: WaveRuleDefinition = {
    validate(rule, level, name) {
        adventureWaveSettings(rule, level, name)
        if (!level.zombiePool?.some(entry => entry.id === 'pvz:normal')) throw new Error(`${name} needs pvz:normal in the zombiePool`)
    },
    draft(rule, level, definitions) {
        const { pointsScale, fixedZombies } = adventureWaveSettings(rule, level, 'waves')
        const perFlag = rule.count < 10 ? rule.count : 10
        return Array.from({ length: rule.count }, (_, wave) => {
            const zombies: string[] = []
            let points = Math.trunc(wave / 3) + 1
            const put = (id: string) => { zombies.push(id); points -= zombieValue(level, definitions, id) }
            const flagWave = level.adventureIndex !== 1 && wave % perFlag === perFlag - 1
            if (flagWave) {
                const plain = Math.min(points, 8)
                points = Math.trunc(points * 2.5)
                for (let index = 0; index < plain; index++) put('pvz:normal')
                put('pvz:flag')
            }
            points *= pointsScale
            for (const fixed of fixedZombies) {
                if (fixed.waves.includes(wave + 1)) for (let index = 0; index < fixed.count; index++) put(fixed.zombie)
            }
            if (wave === rule.count - 1) {
                for (const entry of level.zombiePool!) if (entry.weight > 0 && !zombies.includes(entry.id)) put(entry.id)
            }
            return { zombies, ...(flagWave ? { flagWave: true as const } : {}), points }
        })
    },
}

export function installBuiltinWaveRules(registry: WaveRuleRegistry): void {
    if (!registry.has('pvz:adventure')) registry.register(BASE_MOD_ID, 'pvz:adventure', adventureWaves)
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
