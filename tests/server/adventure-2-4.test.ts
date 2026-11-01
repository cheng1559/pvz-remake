import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-4', randomSeed: 3, initialMoney: 0, firstAdventure: true, mods: [] }

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

test('2-4 follows 2-3 with 20 waves of the allowed zombies over seven graves and drops the almanac', () => {
    const level = levels.levels['pvz:adventure-2-4']
    assert.equal(levels.levels['pvz:adventure-2-3'].nextLevel, 'pvz:adventure-2-4')
    assert.equal(level.award.kind, 'unlock', 'COIN_ALMANAC is collected and shown, not a usable tool')
    // Board::InitLevel: AddGraveStones(5, 1), (6, 1), (7, 2), (8, 3) on levels 14 and 16.
    const graves = start().save().wave.graves!
    assert.deepEqual([5, 6, 7, 8].map(column => graves.filter(grave => grave.column === column).length), [1, 1, 2, 3])
    const allowed = new Set(['pvz:normal', 'pvz:flag', 'pvz:conehead', 'pvz:pole_vaulter', 'pvz:screendoor'])
    for (let seed = 1; seed <= 20; seed++) {
        const waves = start({ randomSeed: seed }).save().wave.plan.map(wave => wave.zombies)
        assert.equal(waves.length, 20)
        assert.deepEqual(waves.flatMap((wave, index) => wave.includes('pvz:flag') ? [index] : []), [9, 19])
        assert.ok(waves.flat().every(id => allowed.has(id)), 'gZombieAllowedLevels for level 14')
        for (const id of ['pvz:conehead', 'pvz:pole_vaulter', 'pvz:screendoor']) assert.ok(waves[19].includes(id), `PutInMissingZombies adds ${id}`)
    }
})

test('Crazy Dave offers the seed slot in the 2-4 intro too', () => {
    const server = start({ initialMoney: 75, packetUpgradeOffer: { cost: 75 } })
    assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index: 1501 })
    assert.equal(runCommand(server, { type: 'chooseSeed', seedId: 'pvz:peashooter' }), 'intro-not-complete')
})
