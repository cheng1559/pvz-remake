import { readGameplaySource, readPresentationSource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseGameplayDefinitions,
    parseGameplayLevels,
} from '@/shared/content/gameplay'

const source = readGameplaySource

test('Gameplay parses the 1-1 definitions and level headlessly', () => {
    const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
    const levels = parseGameplayLevels(source('levels'), definitions)

    assert.deepEqual(definitions.seeds['pvz:peashooter'], { kind: 'plant', id: 'pvz:peashooter', sunCost: 100, cooldownTicks: 750, placement: 'ground' })
    assert.equal(definitions.seeds['pvz:repeater'].sunCost, 200)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.shotsPerBurst, 2)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.burstIntervalTicks, 26)
    assert.equal(definitions.zombies['pvz:normal'].boardEdgeX, -100)
    assert.equal(definitions.zombies['pvz:pole_vaulter'].boardEdgeX, -150)
    assert.deepEqual(definitions.zombies['pvz:normal'].spawn, { minX: 780, maxX: 819, flagWaveOffset: 40 })
    assert.deepEqual(definitions.zombies['pvz:pole_vaulter'].spawn, { minX: 870, maxX: 879, flagWaveOffset: 0 })
    assert.deepEqual(levels.levels['pvz:adventure-1-1'].activeRows, [2])
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
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].id = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.seeds['pvz:normal'].id = 'pvz:peashooter' }), /unknown ID/, 'a zombie seed names a zombie')
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].kind = 'tree' }), /kind must be plant, zombie or grave/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].plant = 'pvz:peashooter' }), /plant is not supported/)
    assert.throws(invalid(value => { value.seeds['pvz:normal'].placement = 'ground' }), /placement is for plant seeds/)
    assert.throws(invalid(value => { value.seeds['pvz:grave'].id = 'pvz:normal' }), /id is for plant and zombie seeds/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.projectile = 'pvz:missing' }), /unknown ID/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), { 'pvz:missing': { position: 0 } }), /unknown ID/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), { 'pvz:peashooter': { position: 0 }, 'pvz:sunflower': { position: 0 } }),
        /same place/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), { 'pvz:peashooter': { position: -1 } }), /non-negative/)
    assert.throws(() => parseGameplayDefinitions(source('definitions'), ['pvz:peashooter']), /must be an object/)
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
    assert.throws(invalid(level => { level.seedPackets = ['pvz:missing'] }), /unknown ID/)
    assert.throws(invalid(level => { delete level.rules; level.waves = [{ zombies: ['pvz:missing'] }] }), /unknown ID/)
    assert.throws(invalid(level => { level.activeRows = [2, 2] }), /duplicates/)
    assert.throws(invalid(level => { level.activeRows = [5] }), /outside the board/)
    assert.throws(invalid(level => { delete level.rules; level.waves = [] }), /must not be empty/)
    assert.throws(invalid(level => { level.rules.count = 0 }), /count/)
    assert.throws(invalid(level => { level.waves = [{ zombies: ['pvz:normal'] }] }), /either waves or rules/)
    assert.throws(invalid(level => { level.waves = level.rules; delete level.rules }), /write a level rule as rules/, 'the old rule form points to rules')
    assert.throws(invalid(level => { level.zombiePool = [] }), /one-point zombie/)
    assert.throws(invalid(level => { level.graveZombies = [{ id: 'pvz:no_such', weight: 100 }] }), /unknown ID/, 'a weighted grave zombie is still looked up')
    assert.doesNotThrow(invalid(level => { level.award.id = 'pvz:not-defined-yet' }))
})

test('every base gameplay level has a level presentation', () => {
    const presentation = readPresentationSource().levels
    for (const id of Object.keys(source('levels').levels)) assert.ok(presentation[id], `${id} has no presentation level`)
})
