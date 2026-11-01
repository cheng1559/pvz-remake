import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { isWaveRule, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { adventureWaves, adventureWaveSettings } from '@/server/level/waveRules'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
// ZombieType order and ZombieDefinition::mStartingLevel of the zombies the adventure levels use.
const STARTING_LEVEL: Record<string, number> = { 'pvz:normal': 1, 'pvz:conehead': 3, 'pvz:pole_vaulter': 6, 'pvz:buckethead': 8, 'pvz:newspaper': 11, 'pvz:screendoor': 13 }

test('adventure fixed zombies are the introduced zombie; the final wave gets every pool type (PutInMissingZombies)', () => {
    for (const [id, level] of Object.entries(levels.levels)) {
        if (!isWaveRule(level.waves) || level.waves.kind !== 'pvz:adventure') continue
        const count = level.waves.count, pool = level.zombiePool!.map(entry => entry.id)
        // GetIntroducedZombieType: the zombie that starts on this level, none on level 1; it goes in wave
        // mNumWaves / 2 (from 0) and the final wave.
        const introduced = level.adventureIndex === 1 ? undefined : pool.find(zombie => STARTING_LEVEL[zombie] === level.adventureIndex)
        assert.deepEqual(adventureWaveSettings(level.waves, level, id).fixedZombies,
            introduced ? [{ zombie: introduced, waves: [Math.trunc(count / 2) + 1, count], count: 1 }] : [], id)
        // The pools list zombies in ZombieType order, the order PutInMissingZombies adds them in.
        assert.deepEqual(pool, Object.keys(STARTING_LEVEL).filter(zombie => pool.includes(zombie)), `${id} pool order`)
        const final = adventureWaves.draft(level.waves, level, definitions).at(-1)!.zombies
        for (const zombie of pool) assert.ok(final.includes(zombie), `${id} final wave has ${zombie}`)
    }
})

test('the final wave adds only the pool types it lacks, after the fixed zombies', () => {
    const level = levels.levels['pvz:adventure-1-6']
    assert.ok(isWaveRule(level.waves))
    assert.deepEqual(adventureWaves.draft(level.waves, level, definitions).at(-1)!.zombies.slice(-2), ['pvz:pole_vaulter', 'pvz:conehead'],
        'the flag wave has normal zombies, the introduced zombie comes first, then the missing conehead')
})

test('a fixed zombie entry places count zombies, spending points past zero like PutZombieInWave', () => {
    const source = readGameplaySource('levels')
    source.levels['pvz:adventure-1-1'].waves.fixedZombies = [{ zombie: 'pvz:normal', waves: [1], count: 3 }]
    const server = new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions))
    server.start({ type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    assert.deepEqual(server.save().wave.plan[0], { zombies: ['pvz:normal', 'pvz:normal', 'pvz:normal'] }, 'the 1 point of wave 1 goes to -2, and nothing more is picked')
})

test('levels name only installed wave rules, which check their settings', () => {
    const source = readGameplaySource('levels')
    source.levels['pvz:adventure-1-1'].waves.kind = 'test:missing'
    assert.throws(() => new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions)), /wave rule is not installed: test:missing/)
    const rejects = (waves: object, error: RegExp) => {
        source.levels['pvz:adventure-1-1'].waves = waves
        assert.throws(() => new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions)), error)
    }
    rejects({ kind: 'pvz:adventure', count: 4, extra: true }, /waves\.extra is not supported/)
    rejects({ kind: 'pvz:adventure', count: 4, pointsScale: 0 }, /pointsScale must be a positive/)
    rejects({ kind: 'pvz:adventure', count: 4, fixedZombies: [{ zombie: 'pvz:conehead', waves: [4] }] }, /not in the zombiePool/)
    rejects({ kind: 'pvz:adventure', count: 4, fixedZombies: [{ zombie: 'pvz:normal', waves: [5] }] }, /past the last/)
    const gameplay = new GameplayRegistry()
    gameplay.waveRules.register('test', 'test:waves', { validate() {}, draft: (rule) => Array.from({ length: rule.count }, () => ({ zombies: ['pvz:normal'], points: 0 })) })
    source.levels['pvz:adventure-1-1'].waves = { kind: 'test:waves', count: 2 }
    const server = new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions), gameplay)
    server.start({ type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    assert.deepEqual(server.save().wave.plan, [{ zombies: ['pvz:normal'] }, { zombies: ['pvz:normal'] }], 'a Mod rule builds the waves')
    assert.deepEqual([server.snapshot().wave.total, server.snapshot().wave.flagWaves], [2, []])
})
