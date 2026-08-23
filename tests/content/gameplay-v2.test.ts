import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    parseGameplayDefinitionsV2,
    parseGameplayLevelsV2,
    parseGameplayStringsV2,
} from '@/shared/content/gameplay'

const source = (name: string): any => JSON.parse(readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'))

test('Gameplay v2 parses the 1-1 definitions, level, and strings headlessly', () => {
    const definitions = parseGameplayDefinitionsV2(source('definitions'))
    const levels = parseGameplayLevelsV2(source('levels'), definitions)
    const strings = parseGameplayStringsV2(source('strings'))

    assert.equal(definitions.seeds['pvz:peashooter'].plant, 'pvz:peashooter')
    assert.equal(definitions.seeds['pvz:repeater'].sunCost, 200)
    assert.equal(definitions.plants['pvz:repeater'].shooter.shotsPerBurst, 2)
    assert.equal(definitions.plants['pvz:repeater'].shooter.burstIntervalTicks, 26)
    assert.deepEqual(levels.levels['pvz:adventure-1-1'].activeRows, [2])
    assert.match(strings.entries.ADVICE_CLICK_ON_GRASS, /grass/)
})

test('Gameplay definitions reject unsupported, unsafe, and unresolved data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = source('definitions')
        change(value)
        return () => parseGameplayDefinitionsV2(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.boards.day = value.boards['pvz:day'] }), /qualified ID/)
    assert.throws(invalid(value => { value.boards['pvz:day'].rows = Number.MAX_SAFE_INTEGER + 1 }), /safe integer/)
    assert.throws(invalid(value => { value.projectiles['pvz:pea'].speedPerTick.x = Infinity }), /finite number/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.windupTicks = 0 }), /positive/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].plant = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.projectile = 'pvz:missing' }), /unknown ID/)
})

test('Gameplay levels validate all 1-1 references, active rows, and waves', () => {
    const definitions = parseGameplayDefinitionsV2(source('definitions'))
    const invalid = (change: (level: any) => void) => {
        const value = source('levels')
        change(value.levels['pvz:adventure-1-1'])
        return () => parseGameplayLevelsV2(value, definitions)
    }

    for (const field of ['board', 'lawnMower', 'skySun'] as const) {
        assert.throws(invalid(level => { level[field] = 'pvz:missing' }), /unknown ID/)
    }
    assert.throws(invalid(level => { level.seedPackets[0] = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(level => { level.waves[0].zombies[0] = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(level => { level.activeRows = [2, 2] }), /duplicates/)
    assert.throws(invalid(level => { level.activeRows = [5] }), /outside the board/)
    assert.throws(invalid(level => { level.waves = [] }), /must not be empty/)
    assert.doesNotThrow(invalid(level => { level.award.id = 'pvz:not-defined-yet' }))
})

test('Gameplay strings require exact fields and non-empty string entries', () => {
    const value = source('strings')
    value.entries.BAD = ''
    assert.throws(() => parseGameplayStringsV2(value), /non-empty string/)
    delete value.entries.BAD
    value.extra = true
    assert.throws(() => parseGameplayStringsV2(value), /not supported/)
})
