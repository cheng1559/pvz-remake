import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { adventureRule, adventureWaveSettings } from '@/server/rules/adventure'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
// ZombieType order and ZombieDefinition::mStartingLevel of the zombies the adventure levels use.
const STARTING_LEVEL: Record<string, number> = { 'pvz:normal': 1, 'pvz:conehead': 3, 'pvz:pole_vaulter': 6, 'pvz:buckethead': 8, 'pvz:newspaper': 11, 'pvz:screendoor': 13, 'pvz:football': 16, 'pvz:dancer': 18 }

test('adventure fixed zombies are the introduced zombie; the final wave gets every pool type (PutInMissingZombies)', () => {
    for (const [id, level] of Object.entries(levels.levels)) {
        if (level.rules?.kind !== 'pvz:adventure') continue
        const count = level.rules.count, pool = level.zombiePool!.map(entry => entry.id)
        // GetIntroducedZombieType: the zombie that starts on this level, none on level 1; it goes in wave
        // mNumWaves / 2 (from 0) and the final wave.
        const introduced = level.adventureIndex === 1 ? undefined : pool.find(zombie => STARTING_LEVEL[zombie] === level.adventureIndex)
        assert.deepEqual(adventureWaveSettings(level.rules, level, id).fixedZombies,
            introduced ? [{ zombie: introduced, waves: [Math.trunc(count / 2) + 1, count], count: 1 }] : [], id)
        // The pools list zombies in ZombieType order, the order PutInMissingZombies adds them in.
        assert.deepEqual(pool, Object.keys(STARTING_LEVEL).filter(zombie => pool.includes(zombie)), `${id} pool order`)
        const final = adventureRule.draft(level.rules, level, definitions).at(-1)!.zombies
        for (const zombie of pool) assert.ok(final.includes(zombie), `${id} final wave has ${zombie}`)
    }
})

test('the final wave adds only the pool types it lacks, after the fixed zombies', () => {
    const level = levels.levels['pvz:adventure-1-6']
    assert.ok(level.rules)
    assert.deepEqual(adventureRule.draft(level.rules, level, definitions).at(-1)!.zombies.slice(-2), ['pvz:pole_vaulter', 'pvz:conehead'],
        'the flag wave has normal zombies, the introduced zombie comes first, then the missing conehead')
})

test('a fixed zombie entry places count zombies, spending points past zero like PutZombieInWave', () => {
    const source = readGameplaySource('levels')
    source.levels['pvz:adventure-1-1'].rules.fixedZombies = [{ zombie: 'pvz:normal', waves: [1], count: 3 }]
    const server = new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions))
    server.start({ type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    assert.deepEqual(server.save().wave.plan[0], { zombies: ['pvz:normal', 'pvz:normal', 'pvz:normal'] }, 'the 1 point of wave 1 goes to -2, and nothing more is picked')
})

test('levels name only installed level rules, which check their settings', () => {
    const source = readGameplaySource('levels')
    source.levels['pvz:adventure-1-1'].rules.kind = 'test:missing'
    assert.throws(() => new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions)), /level rule is not installed: test:missing/)
    const rejects = (rules: object, error: RegExp) => {
        source.levels['pvz:adventure-1-1'].rules = rules
        assert.throws(() => new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions)), error)
    }
    rejects({ kind: 'pvz:adventure', count: 4, extra: true }, /rules\.extra is not supported/)
    rejects({ kind: 'pvz:adventure', count: 4, pointsScale: 0 }, /pointsScale must be positive/)
    rejects({ kind: 'pvz:adventure', count: 4, fixedZombies: [{ zombie: 'pvz:conehead', waves: [4] }] }, /not in the zombiePool/)
    rejects({ kind: 'pvz:adventure', count: 4, fixedZombies: [{ zombie: 'pvz:normal', waves: [5] }] }, /past the last/)
    const gameplay = new GameplayRegistry()
    gameplay.levelRules.register('test', 'test:waves', { validate() {}, draft: rule => Array.from({ length: rule.count }, () => ({ zombies: ['pvz:normal'], points: 0 })) })
    source.levels['pvz:adventure-1-1'].rules = { kind: 'test:waves', count: 2 }
    const server = new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions), gameplay)
    server.start({ type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
    assert.deepEqual(server.save().wave.plan, [{ zombies: ['pvz:normal'] }, { zombies: ['pvz:normal'] }], 'a Mod rule builds the waves')
    assert.deepEqual([server.snapshot().wave.total, server.snapshot().wave.flagWaves], [2, []])
})

test('a flag wave brings on the zombies the settings name (GameplayDefinitions.flagWave): its plain ones, then the flag zombie in the base', () => {
    const level = levels.levels['pvz:adventure-1-10']
    const flagWaves = (content: typeof definitions) => adventureRule.draft(level.rules!, level, content).filter(wave => wave.flagWave)
    assert.deepEqual(definitions.flagWave, { zombie: 'pvz:flag', plain: 'pvz:normal', maxPlain: 8 })
    const base = flagWaves(definitions)
    assert.ok(base.length > 0 && base.every(wave => wave.zombies.includes('pvz:flag')))
    const changed = flagWaves({ ...definitions, flagWave: { zombie: 'pvz:conehead', plain: 'pvz:buckethead', maxPlain: 1 } })
    assert.ok(changed.every(wave => wave.zombies.includes('pvz:conehead') && !wave.zombies.includes('pvz:flag')))
    assert.deepEqual(changed.map(wave => wave.zombies.slice(0, 2)), base.map(() => ['pvz:buckethead', 'pvz:conehead']), 'up to maxPlain of its plain ones first')
    assert.throws(() => adventureRule.validate!(level.rules!, level, { ...definitions, flagWave: { ...definitions.flagWave, plain: 'pvz:dancer' } }, 'rules'),
        /rules needs pvz:dancer in the zombiePool/)
    const source = readGameplaySource('definitions')
    source.flagWave = { ...source.flagWave, zombie: 'example:missing' }
    assert.throws(() => parseGameplayDefinitions(source), /flagWave\.zombie/)
})
