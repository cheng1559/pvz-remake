import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket, WorldSnapshot } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-5', randomSeed: 5, initialMoney: 0, firstAdventure: false, mods: [] }

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

function play(packet: Partial<StartSessionPacket> = {}) {
    const server = start(packet)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}

function run(server: IntegratedGameServer, ticks: number, each?: (snapshot: WorldSnapshot) => void) {
    for (let tick = 0; tick < ticks; tick++) {
        const snapshot = server.tick()
        each?.(snapshot)
    }
}

/** The mallet on every standing zombie's middle. */
function whackAll(server: IntegratedGameServer, snapshot: WorldSnapshot) {
    for (const zombie of snapshot.zombies) {
        const body = definitions.zombies[zombie.typeId].body
        runCommand(server, { type: 'boardClick', x: Math.max(0, Math.round(zombie.x + body.x + body.width / 2)),
            y: Math.max(0, Math.round(zombie.y + body.y + body.height / 2 + 20)) })
    }
}

test('2-5 opens on nine graves from column 4 with three ready packets, no sun and no shovel', () => {
    assert.equal(levels.levels['pvz:adventure-2-4'].nextLevel, 'pvz:adventure-2-5')
    assert.deepEqual(levels.levels['pvz:adventure-2-5'].award, { kind: 'seed', id: 'pvz:hypnoshroom' })
    const server = play()
    const snapshot = server.snapshot()
    assert.equal(snapshot.graves!.length, 9)
    assert.ok(snapshot.graves!.every(grave => grave.column >= 3 && grave.riseAtTick === undefined), 'WhackAZombiePlaceGraves from column 3')
    assert.deepEqual(snapshot.seedPackets.map(packet => [packet!.seedId, packet!.ready]),
        [['pvz:potatomine', true], ['pvz:gravebuster', true], ['pvz:cherrybomb', true]])
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.extensions['pvz:tools'], undefined, 'CutScene::ShowShovel: no shovel')
})

test('a first adventure hears Dave out first', () => {
    const server = start({ firstAdventure: true })
    for (let index = 401; index <= 406; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        runCommand(server, { type: 'advanceDialog' })
    }
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
})

test('zombies rise from graves at once and fast, and the mallet takes helms then kills', () => {
    const server = play()
    const events: string[] = []
    let risen: WorldSnapshot['zombies'] = []
    for (let tick = 1; tick <= 200 && !risen.length; tick++) {
        server.step()
        events.push(...server.drainEvents().map(event => event.type))
        risen = server.snapshot().zombies
    }
    assert.ok(events.includes('nextWaveComing'), 'the awooga before the first wave')
    assert.equal(server.snapshot().gameplayTick, 200, 'Challenge::StartLevel counts the first wave down from 200')
    assert.ok(risen.length >= 1 && risen.every(zombie => zombie.typeId === 'pvz:normal'), 'wave 1 raises one plain zombie')
    whackAll(server, server.snapshot())
    assert.equal(server.snapshot().zombies.length, 0, 'a bare zombie dies at once')
    assert.ok(server.drainEvents().some(event => event.type === 'zombieWhacked'))

    // TakeHelmDamage(900): a cone breaks and leaves the body whole; a pail keeps 200 of its 1100.
    for (const [name, row] of [['conehead', 2], ['buckethead', 4]] as const) {
        debug(server, `/zombie ${name} ${row} 7`)
        const zombie = server.snapshot().zombies.at(-1)!
        whackAll(server, server.snapshot())
        const after = server.snapshot().zombies.find(candidate => candidate.entityId === zombie.entityId)!
        assert.ok(after, `${name} survives the first blow`)
        assert.equal(after.health, definitions.zombies[`pvz:${name}`].maxHealth, `${name}'s body is untouched`)
        assert.equal(after.helmHealth, Math.max(0, definitions.zombies[`pvz:${name}`].helm!.health - 900))
        whackAll(server, server.snapshot())
    }
    // MouseDownWhackAZombie only checks mHelmType: a shield is no helm, and the zombie behind it dies at once.
    debug(server, '/zombie screendoor 1 7')
    whackAll(server, server.snapshot())
    assert.ok(!server.snapshot().zombies.some(zombie => zombie.typeId === 'pvz:screendoor'), 'the mallet ignores a shield')
})

/** The rule's `pvz:whack-a-zombie` extension: whether the empty cursor is still the mallet. */
function hammer(server: IntegratedGameServer) {
    return (server.snapshot().extensions['pvz:whack-a-zombie'] as { hammer: boolean }).hammer
}

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    return server.drainCommandResults()[0].debug
}

test('planting recharges the packet, and the award only drops once the final group has risen', () => {
    const server = play({ randomSeed: 11 })
    debug(server, '/sun set 500')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:potatomine' }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 0, column: 0 }), undefined)
    // SeedPacket::SetPacketType skips only the opening recharge; SeedPacket::WasPlanted recharges as usual.
    assert.equal(server.snapshot().seedPackets[0]!.ready, false, 'planting recharges the packet')
    // Challenge::ClearCursor: before the award, an emptied cursor is the mallet again.
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:cherrybomb' }), undefined)
    assert.equal(runCommand(server, { type: 'clearCursor' }), undefined)
    assert.equal(hammer(server), true)
    // Board::MouseDownWithPlant: a seed refused by CanPlantAt is dropped rather than kept in hand.
    const grave = server.snapshot().graves![0]
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:cherrybomb' }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: grave.row, column: grave.column }), 'cell-has-grave')
    assert.equal(server.snapshot().cursor.mode, 'none')
    assert.ok(server.drainEvents().some(event => event.type === 'seedDropped'))
    let seen = 0
    let awardBeforeEnd = false
    for (let tick = 0; tick < 2000 * 9 + 400; tick++) {
        const snapshot = server.tick()
        seen = Math.max(seen, snapshot.zombies.length)
        whackAll(server, snapshot)
        const state = (server.save() as unknown as { wave: { ruleState: { countdown: number }, index: number } }).wave
        if (snapshot.items.some(item => item.typeId === 'pvz:hypnoshroom') && state.ruleState.countdown > 0) awardBeforeEnd = true
        if (snapshot.items.some(item => item.typeId === 'pvz:hypnoshroom')) break
    }
    assert.equal(awardBeforeEnd, false)
    assert.ok(server.snapshot().items.some(item => item.typeId === 'pvz:hypnoshroom'), 'the Hypno-shroom drops after the last group')
    assert.ok(seen >= 3)
    // Challenge::MouseDownWhackAZombie clears the cursor after the killing blow, and with the award down it stays plain.
    assert.equal(hammer(server), false, 'the blow that drops the award puts the mallet away')
    assert.equal(runCommand(server, { type: 'boardClick', x: 400, y: 300 }), 'unsupported-command')
})

test('a game saved mid-wave restores its countdown and graves', () => {
    const server = play({ randomSeed: 7 })
    run(server, 2600)
    const saved = JSON.parse(JSON.stringify(server.save())) as JsonValue
    const restored = new IntegratedGameServer(definitions, levels)
    restored.restore(saved)
    assert.deepEqual(restored.snapshot().graves, server.snapshot().graves)
    run(server, 300)
    run(restored, 300)
    assert.deepEqual(restored.snapshot().zombies.map(zombie => [zombie.typeId, zombie.x, zombie.row]),
        server.snapshot().zombies.map(zombie => [zombie.typeId, zombie.x, zombie.row]))
})
