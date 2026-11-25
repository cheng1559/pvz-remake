import { readGameplaySource, readPresentationSource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseGameplayDefinitions,
    parseGameplayLevels,
} from '@/shared/content/gameplay'

const source = readGameplaySource

test('Gameplay parses the 1-1 definitions and level headlessly', () => {
    const definitions = parseGameplayDefinitions(source('definitions'))
    const levels = parseGameplayLevels(source('levels'), definitions)

    assert.deepEqual(definitions.seeds['pvz:peashooter'], { kind: 'plant', id: 'pvz:peashooter', position: 0, sunCost: 100, cooldownTicks: 750, placement: 'ground' })
    assert.equal(definitions.seeds['pvz:repeater'].sunCost, 200)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.shotsPerBurst, 2)
    assert.equal(definitions.plants['pvz:repeater'].shooter!.burstIntervalTicks, 26)
    assert.equal(definitions.zombies['pvz:normal'].boardEdgeX, -100)
    assert.equal(definitions.zombies['pvz:pole_vaulter'].boardEdgeX, -150)
    assert.deepEqual(definitions.zombies['pvz:normal'].spawn, { minX: 780, maxX: 819, flagWaveOffset: 40 })
    // `from`: a cone zombie plays the plain zombie's animation.
    assert.deepEqual(definitions.zombies['pvz:conehead'].animation, definitions.zombies['pvz:normal'].animation)
    // What a zombie writes of its own adds to it: the flag zombie carries its flag over the plain zombie's body.
    assert.deepEqual(Object.keys(definitions.zombies['pvz:flag'].animation.layers), ['body', 'flag'])
    assert.deepEqual(definitions.zombies['pvz:flag'].animation.clips.walk, definitions.zombies['pvz:normal'].animation.clips.walk)
    assert.deepEqual(definitions.zombies['pvz:pole_vaulter'].spawn, { minX: 870, maxX: 879, flagWaveOffset: 0 })
    assert.deepEqual(levels.levels['pvz:adventure-1-1'].activeRows, [2])
})

test('Gameplay definitions reject unsupported, unsafe, and unresolved data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = source('definitions')
        change(value)
        return () => parseGameplayDefinitions(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.boards.day = value.boards['pvz:day'] }), /qualified ID/)
    assert.throws(invalid(value => { value.boards['pvz:day'].rows = Number.MAX_SAFE_INTEGER + 1 }), /safe integer/)
    assert.throws(invalid(value => { value.boards['pvz:day'].bounds.right = 0 }), /must be ordered/)
    assert.throws(invalid(value => { value.boards['pvz:day'].graveZombies = ['pvz:no_such'] }), /unknown ID/)
    assert.throws(invalid(value => { value.boards['pvz:day'].graveZombies = [] }), /graveZombies must not be empty/)
    assert.throws(invalid(value => { value.zombies['pvz:flag'].animation.layers.flag = null }), /must start a clip/)
    assert.throws(invalid(value => { value.projectiles['pvz:pea'].hitbox.x = Infinity }), /must be finite/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].boardEdgeX = Infinity }), /must be finite/)
    assert.throws(invalid(value => { delete value.zombies['pvz:flag'].wave }), /pvz:flag\.wave is required/, 'every zombie has a value, also one no wave picks')
    assert.throws(invalid(value => { value.zombies['pvz:conehead'].animation = { from: 'pvz:missing' } }), /whose animation is its own/)
    assert.throws(invalid(value => { value.zombies['pvz:conehead'].animation = { from: 'pvz:flag' } }), /whose animation is its own/)
    assert.throws(invalid(value => { delete value.zombies['pvz:normal'].animation.clips.eat.marks }), /marks its bites/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].animation.clips.walk.frames = 46 }), /a place for each/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].tongueChance = 2 }), /between 0 and 1/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].animation.clips.walk.ground = [0, 0] }), /move forward/)
    // A clip of its own pace may have a ground (a bowled nut's roll); a zombie's walk goes at its speed, and a synced clip has none.
    assert.throws(invalid(value => { value.zombies['pvz:normal'].animation.clips.walk.fps = 12 }), /walks on its ground at its speed/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].animation.clips.idleHead.ground = Array.from({ length: 25 }, (_, x) => x) }), /exactly one of fps, sync and ground/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].spawn.minX = 820 }), /ordered safe integer bounds/)
    assert.throws(invalid(value => { value.zombies['pvz:normal'].spawn.maxX = 819.5 }), /safe integer bounds/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.windupTicks = 0 }), /positive/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].id = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.seeds['pvz:normal'].id = 'pvz:peashooter' }), /unknown ID/, 'a zombie seed names a zombie')
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].kind = 'tree' }), /kind must be plant, zombie, grave or crater/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].plant = 'pvz:peashooter' }), /plant is not supported/)
    assert.throws(invalid(value => { value.seeds['pvz:normal'].placement = 'ground' }), /placement is for plant seeds/)
    assert.throws(invalid(value => { value.seeds['pvz:grave'].id = 'pvz:normal' }), /id is for plant and zombie seeds/)
    assert.throws(invalid(value => { value.plants['pvz:peashooter'].shooter.projectile = 'pvz:missing' }), /unknown ID/)
    assert.throws(invalid(value => { value.seeds['pvz:sunflower'].position = 0 }), /share position 0 in their group/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].position = -1 }), /non-negative/)
    assert.throws(invalid(value => { delete value.seeds['pvz:peashooter'].position }), /position is required/)
    assert.throws(invalid(value => { value.seeds['pvz:peashooter'].hidden = false }), /hidden must be true/)
})

test('Gameplay levels validate all 1-1 references, active rows, and waves', () => {
    const definitions = parseGameplayDefinitions(source('definitions'))
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
    assert.throws(invalid(level => { level.waves = [{ zombies: ['pvz:normal'] }] }), /cannot combine waves and rules/)
    assert.throws(invalid(level => { level.waves = level.rules; delete level.rules }), /waves must be an array/, 'a level rule is no list of waves')
    assert.throws(invalid(level => { level.zombiePool = [] }), /one-point zombie/)
    assert.throws(invalid(level => { level.graveZombies = [{ id: 'pvz:no_such', weight: 100 }] }), /unknown ID/, 'a weighted grave zombie is still looked up')
    assert.doesNotThrow(invalid(level => { level.award.id = 'pvz:not-defined-yet' }))
})

test('every base gameplay level has a level presentation', () => {
    const presentation = readPresentationSource().levels
    for (const id of Object.keys(source('levels').levels)) assert.ok(presentation[id], `${id} has no presentation level`)
})
