import { array, exact, nonEmptyString, positiveInteger } from '@/shared/validate'
import type { LevelDefinition, LevelRule } from '@/shared/content/gameplay'
import { type LevelRuleDefinition, zombieValue } from './registry'

/** The settings of `rules: {kind: "pvz:adventure", count, ...}`. */
export interface AdventureWaveSettings {
    /** The points multiplier of special levels, e.g. 3 on the conveyor levels (Board::PickZombieWaves). */
    pointsScale: number
    /** `count` (default 1) of a zombie placed on these waves (from 1) before the random picks, in this order. */
    fixedZombies: Array<{ zombie: string; waves: number[]; count: number }>
}

export function adventureWaveSettings(rule: LevelRule, level: LevelDefinition, name: string): AdventureWaveSettings {
    const settings = exact(rule.settings, [], name, ['pointsScale', 'fixedZombies'])
    return {
        pointsScale: settings.pointsScale === undefined ? 1 : positiveInteger(settings.pointsScale, `${name}.pointsScale`),
        fixedZombies: (settings.fixedZombies === undefined ? [] : array(settings.fixedZombies, `${name}.fixedZombies`)).map((value, index) => {
            const field = `${name}.fixedZombies[${index}]`
            const entry = exact(value, ['zombie', 'waves'], field, ['count'])
            const zombie = nonEmptyString(entry.zombie, `${field}.zombie`)
            if (!level.zombiePool?.some(pooled => pooled.id === zombie)) throw new Error(`${field}.zombie: ${zombie} is not in the zombiePool`)
            const waves = array(entry.waves, `${field}.waves`)
            if (!waves.length) throw new TypeError(`${field}.waves must not be empty`)
            return {
                zombie, count: entry.count === undefined ? 1 : positiveInteger(entry.count, `${field}.count`),
                waves: waves.map(value => {
                    const wave = positiveInteger(value, `${field}.waves[]`)
                    if (wave > rule.count) throw new Error(`${field}.waves: wave ${wave} is past the last`)
                    return wave
                }),
            }
        }),
    }
}

/**
 * Board::PickZombieWaves for a first adventure: wave points are wave / 3 + 1; a flag wave (the last of every ten, or
 * of a shorter level; none on level 1, Board::IsFlagWave) first gets min(points, `maxPlain`) of its `plain` zombies and
 * the zombie that leads it (GameplayDefinitions.flagWave: 8 normal zombies, the flag zombie) after multiplying its
 * points by 2.5; then the points take `pointsScale`, and the fixed zombies spend them. The final
 * wave then gets each weighted zombiePool type it still lacks, in pool order (PutInMissingZombies).
 */
export const adventureRule: LevelRuleDefinition = {
    validate(rule, level, definitions, name) {
        adventureWaveSettings(rule, level, name)
        const plain = definitions.flagWave.plain
        if (!level.zombiePool?.some(entry => entry.id === plain)) throw new Error(`${name} needs ${plain} in the zombiePool`)
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
                const { zombie, plain, maxPlain } = definitions.flagWave, plains = Math.min(points, maxPlain)
                points = Math.trunc(points * 2.5)
                for (let index = 0; index < plains; index++) put(plain)
                put(zombie)
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
