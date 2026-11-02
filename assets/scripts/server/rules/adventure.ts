import type { LevelDefinition, LevelRule } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { type LevelRuleDefinition, zombieValue } from './registry'

/** The settings of `rules: {kind: "pvz:adventure", count, ...}`. */
export interface AdventureWaveSettings {
    /** The points multiplier of special levels, e.g. 3 on the conveyor levels (Board::PickZombieWaves). */
    pointsScale: number
    /** `count` (default 1) of a zombie placed on these waves (from 1) before the random picks, in this order. */
    fixedZombies: Array<{ zombie: string; waves: number[]; count: number }>
}

export function adventureWaveSettings(rule: LevelRule, level: LevelDefinition, name: string): AdventureWaveSettings {
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
export const adventureRule: LevelRuleDefinition = {
    validate(rule, level, _definitions, name) {
        adventureWaveSettings(rule, level, name)
        if (!level.zombiePool?.some(entry => entry.id === 'pvz:normal')) throw new Error(`${name} needs pvz:normal in the zombiePool`)
    },
    draft(rule, level, definitions) {
        const { pointsScale, fixedZombies } = adventureWaveSettings(rule, level, 'rules')
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
