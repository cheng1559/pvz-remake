import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/ecs'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { ZombieComponent } from '@/server/state/components'
import { damageZombie } from '@/server/zombies/damage'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-6', randomSeed: 3, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-6'), mods: [] }

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}
const world = (server: IntegratedGameServer) => (server as unknown as { session: { world: World } }).session.world

test('2-6 follows 2-5 with 10 waves over seven graves, brings in the football zombie and awards the scaredy-shroom', () => {
    const level = levels.levels['pvz:adventure-2-6']
    assert.equal(levels.levels['pvz:adventure-2-5'].nextLevel, 'pvz:adventure-2-6')
    // LawnApp::GetAwardSeedForLevel(16): (2 - 1) * 8 + 6 - 1 = 13, SEED_SCAREDYSHROOM.
    assert.deepEqual(level.award, { kind: 'seed', id: 'pvz:scaredyshroom' })
    // Board::InitLevel: AddGraveStones(5, 1), (6, 1), (7, 2), (8, 3) on levels 14 and 16.
    const graves = start().snapshot().gridItems!
    assert.deepEqual([5, 6, 7, 8].map(column => graves.filter(grave => grave.column === column).length), [1, 1, 2, 3])
    const allowed = new Set(['pvz:normal', 'pvz:flag', 'pvz:conehead', 'pvz:football'])
    for (let seed = 1; seed <= 20; seed++) {
        const waves = start({ randomSeed: seed }).save().wave.plan.map(wave => wave.zombies)
        // gZombieWaves[15] is 10, the last a flag wave.
        assert.equal(waves.length, 10)
        assert.deepEqual(waves.flatMap((wave, index) => wave.includes('pvz:flag') ? [index] : []), [9])
        assert.ok(waves.flat().every(id => allowed.has(id)), 'gZombieAllowedLevels for level 16')
        // GetIntroducedZombieType: the football zombie starts on level 16, so it comes in wave mNumWaves / 2 and the last.
        for (const index of [5, 9]) assert.ok(waves[index].includes('pvz:football'), `wave ${index + 1} has the football zombie`)
        // Its ZombieDefinition::mFirstAllowedWave is 5: none is picked before.
        assert.ok(waves.slice(0, 4).every(wave => !wave.includes('pvz:football')))
    }
})

test('the football zombie runs at 0.66-0.68 in a 1400 helmet that drops when the hits get past it', () => {
    const server = start({ firstAdventure: false })
    for (const seedId of [...new Set(options.ownedSeeds)].slice(0, 6)) assert.equal(runCommand(server, { type: 'chooseSeed', seedId }), undefined)
    assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    server.enqueueDebugCommand(1, '/zombie football 3 8')
    server.processBoundaryCommands()
    const [football] = server.snapshot().zombies
    const zombie = world(server).get(football.entityId, ZombieComponent)!
    assert.ok(zombie.speedPerTick >= 0.66 && zombie.speedPerTick <= 0.68, `speed ${zombie.speedPerTick}`)
    assert.equal(zombie.helmHealth, 1400)
    server.drainEvents()
    damageZombie(world(server), definitions, football.entityId, 1399)
    assert.equal(zombie.health, 270, 'the helmet takes it all')
    damageZombie(world(server), definitions, football.entityId, 21)
    assert.deepEqual(server.drainEvents().filter(event => event.type === 'zombieHelmDropped').map(event => event.data.helm), ['football'])
    assert.equal(zombie.health, 250, 'what is past the helmet reaches the body')
})

test('Crazy Dave sells the second seed slot in the 2-6 intro to one who owns the first, and the first to one who owns none', () => {
    const offer = { cost: 5000 }
    const second = start({ initialMoney: 5000, packetUpgradeOffer: offer, packetUpgrades: 1 })
    for (const index of [1551, 1552]) {
        assert.deepEqual(second.snapshot().dialog, { index })
        assert.equal(runCommand(second, { type: 'advanceDialog' }), undefined)
    }
    assert.deepEqual(second.snapshot().dialog, { index: 1553, question: { kind: 'pvz:packetUpgrade', cost: 5000, slots: 8 } },
        'CutScene: the dialog quotes mPurchases + 7 slots')
    assert.equal(runCommand(second, { type: 'advanceDialog' }), undefined)
    assert.equal(second.snapshot().dialog?.index, 1553, 'only the answer moves on')
    second.drainEvents()
    assert.equal(runCommand(second, { type: 'answerDialog', accept: true }), undefined)
    assert.deepEqual(second.drainEvents().filter(event => event.type.startsWith('packetUpgrade')).map(event => [event.type, event.data]),
        [['packetUpgradePurchased', { cost: 5000, upgrades: 2 }]])
    assert.equal(second.snapshot().seedChooser!.slots, 8)
    assert.deepEqual(second.snapshot().dialog, { index: 1560 })
    assert.equal(runCommand(second, { type: 'advanceDialog' }), undefined)
    assert.equal(second.snapshot().dialog, undefined)

    const declined = start({ initialMoney: 5000, packetUpgradeOffer: offer, packetUpgrades: 1 })
    for (let line = 0; line < 3; line++) runCommand(declined, { type: 'advanceDialog' })
    declined.drainEvents()
    assert.equal(runCommand(declined, { type: 'answerDialog', accept: false }), undefined)
    assert.ok(declined.drainEvents().some(event => event.type === 'packetUpgradeDeclined'))
    assert.deepEqual(declined.snapshot().dialog, { index: 1570 })
    assert.equal(declined.snapshot().seedChooser!.slots, 7)

    assert.deepEqual(start({ initialMoney: 750, packetUpgradeOffer: { cost: 750 } }).snapshot().dialog, { index: 1501 },
        'CanGetPacketUpgrade comes first')
    for (const packet of [
        { initialMoney: 4999, packetUpgradeOffer: offer, packetUpgrades: 1 },
        { initialMoney: 20000, packetUpgradeOffer: offer, packetUpgrades: 2 },
    ]) assert.equal(start(packet).snapshot().dialog, undefined, JSON.stringify(packet))
})
