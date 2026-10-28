import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseGameplayDefinitions,
    parseGameplayLevels,
    parseGameplayStrings,
} from '@/shared/content/gameplay'

const source = readGameplaySource

test('Gameplay parses the 1-1 definitions, level, and strings headlessly', () => {
    const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
    const levels = parseGameplayLevels(source('levels'), definitions)
    const strings = parseGameplayStrings(source('strings'))

    assert.equal(definitions.seeds['pvz:peashooter'].plant, 'pvz:peashooter')
    assert.equal(definitions.seeds['pvz:repeater'].sunCost, 200)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.shotsPerBurst, 2)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.burstIntervalTicks, 26)
    assert.equal(definitions.zombies['pvz:normal'].boardEdgeX, -100)
    assert.equal(definitions.zombies['pvz:pole_vaulter'].boardEdgeX, -150)
    assert.deepEqual(definitions.zombies['pvz:normal'].spawn, { minX: 780, maxX: 819, flagWaveOffset: 40 })
    assert.deepEqual(definitions.zombies['pvz:pole_vaulter'].spawn, { minX: 870, maxX: 879, flagWaveOffset: 0 })
    assert.deepEqual(levels.levels['pvz:adventure-1-1'].activeRows, [2])
    assert.match(strings.entries.ADVICE_CLICK_ON_GRASS, /grass/)
})

test('Gameplay definitions reject unsupported, unsafe, and unresolved data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = source('definitions')
        change(value)
        return () => parseGameplayDefinitions(value, source('seed-catalog'))
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.boards.day = value.boards['pvz:day'] }), /qualified ID/)
    assert.throws(invalid(value => { value.boards['pvz:day'].rows = Number.MAX_SAFE_INTEGER + 1 }), /safe integer/)
    assert.throws(invalid(value => { value.boards['pvz:day'].bounds.right = 0 }), /must be ordered/)
    assert.throws(invalid(value => { value.zombies['pvz:flag'].dropsFlag = 1 }), /must be boolean/)
    assert.throws(invalid(value => { value.projectiles['pvz:pea'].speedPerTick.x = Infinity }), /finite number/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].boardEdgeX = Infinity }), /finite number/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].gait = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].tongueChance = 2 }), /between 0 and 1/)
    assert.throws(invalid(value => { value.zombieGaits['pvz:normal'].walkGround = [0, 0] }), /move forward/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].spawn.minX = 820 }), /ordered safe integer bounds/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].spawn.maxX = 819.5 }), /safe integer bounds/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.windupTicks = 0 }), /positive/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].plant = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.projectile = 'pvz:missing' }), /unknown ID/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), ['pvz:missing']), /unknown ID/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), ['pvz:peashooter', 'pvz:peashooter']), /duplicates/)
})

test('Gameplay levels validate all 1-1 references, active rows, and waves', () => {
    const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
    const invalid = (change: (level: any) => void) => {
        const value = source('levels')
        change(value.levels['pvz:adventure-1-1'])
        return () => parseGameplayLevels(value, definitions)
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
    assert.throws(() => parseGameplayStrings(value), /non-empty string/)
    delete value.entries.BAD
    value.extra = true
    assert.throws(() => parseGameplayStrings(value), /not supported/)
})
