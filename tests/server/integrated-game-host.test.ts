import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { IntegratedGameHost } from '@/server/IntegratedGameHost'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { LocalGameChannel } from '@/shared/channel/index'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { ClientPacket, StartSessionPacket } from '@/shared/protocol/index'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)
const startPacket: StartSessionPacket = {
    protocolVersion: 1,
    sequence: 1,
    type: 'startSession',
    levelId: 'pvz:adventure-1-1',
    randomSeed: 1,
    initialMoney: 0,
    firstAdventure: false,
    mods: [],
}

function setup() {
    const channel = new LocalGameChannel()
    const server = new IntegratedGameServer(definitions, levels)
    return { channel, host: new IntegratedGameHost(server, channel) }
}

function send(channel: LocalGameChannel, packet: ClientPacket): void {
    channel.sendToServer(packet)
}

test('integrated host processes FIFO commands, acknowledgements, pause, resume, and stop', () => {
    const { channel, host } = setup()
    send(channel, startPacket)
    send(channel, {
        protocolVersion: 1, sequence: 2, type: 'command',
        command: { type: 'completeIntro' },
    })
    send(channel, {
        protocolVersion: 1, sequence: 3, type: 'command',
        command: { type: 'selectSeed', seedId: 'pvz:peashooter' },
    })
    send(channel, {
        protocolVersion: 1, sequence: 4, type: 'command',
        command: { type: 'placePlant', row: 2, column: 0 },
    })
    host.update(0.01)

    const started = channel.drainClientPackets()
    assert.deepEqual(started.map(packet => packet.type), ['sessionStarted', 'frame'])
    assert.deepEqual(started.map(packet =>
        'acknowledgedSequence' in packet ? packet.acknowledgedSequence : -1), [1, 4])
    assert.equal(started[1].type === 'frame' && started[1].snapshot.plants.length, 1)
    assert.deepEqual(started[1].type === 'frame' && started[1].events.map(event => event.type), [
        'plantPlaced',
        'zombieSpawned',
    ])

    send(channel, {
        protocolVersion: 1, sequence: 5, type: 'command',
        command: { type: 'placePlant', row: 2, column: 1 },
    })
    send(channel, {
        protocolVersion: 1, sequence: 5, type: 'command', command: { type: 'clearCursor' },
    })
    host.update(0.01)
    const rejected = channel.drainClientPackets()
    assert.deepEqual(rejected.map(packet => packet.type === 'commandRejected'
        ? [packet.sequence, packet.code]
        : [packet.type]), [
        [5, 'sequence-out-of-order'],
        [5, 'no-seed-selected'],
        ['frame'],
    ])

    send(channel, {
        protocolVersion: 1, sequence: 6, type: 'command', command: { type: 'pause' },
    })
    host.update(0.005)
    const paused = channel.drainClientPackets()
    assert.equal(paused.length, 1)
    assert.equal(paused[0].type === 'frame' && paused[0].snapshot.paused, true)
    host.update(1)
    assert.deepEqual(channel.drainClientPackets(), [])

    send(channel, {
        protocolVersion: 1, sequence: 7, type: 'command', command: { type: 'resume' },
    })
    host.update(0.015)
    const resumed = channel.drainClientPackets()
    assert.deepEqual(resumed.map(packet => packet.type), ['frame', 'frame'])
    assert.deepEqual(resumed.map(packet => packet.type === 'frame' ? packet.serverTick : -1), [5, 6])

    send(channel, { protocolVersion: 1, sequence: 8, type: 'requestSave' })
    send(channel, { protocolVersion: 1, sequence: 9, type: 'requestSave' })
    host.update(0)
    const saved = channel.drainClientPackets()
    assert.deepEqual(saved.map(packet => packet.type), ['frame', 'saveReady', 'saveReady'])
    assert.equal(saved[0].type === 'frame' && saved[0].serverTick, 6)
    assert.equal(saved[1].type === 'saveReady' &&
        (saved[1].save as { schemaVersion: number }).schemaVersion, 2)
    assert.deepEqual(saved.slice(1).map(packet =>
        packet.type === 'saveReady' ? packet.acknowledgedSequence : -1), [8, 9])

    send(channel, { protocolVersion: 1, sequence: 10, type: 'stopSession' })
    host.update(1)
    assert.deepEqual(channel.drainClientPackets(), [{
        protocolVersion: 1,
        type: 'sessionStopped',
        acknowledgedSequence: 10,
    }])
    host.update(1)
    assert.deepEqual(channel.drainClientPackets(), [])
})

test('integrated host fatally stops before an oversized catch-up', () => {
    const { channel, host } = setup()
    send(channel, startPacket)
    host.update(10.01)
    const packets = channel.drainClientPackets()
    assert.deepEqual(packets.map(packet => packet.type), ['sessionStarted', 'fatalServerError'])
    assert.equal(packets[1].type === 'fatalServerError' && packets[1].code, 'tick-limit-exceeded')
    assert.equal(packets[0].type === 'sessionStarted' && packets[0].snapshot.tick, 0)
    host.update(1)
    assert.deepEqual(channel.drainClientPackets(), [])
})
