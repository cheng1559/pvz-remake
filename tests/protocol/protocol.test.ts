import assert from 'node:assert/strict'
import test from 'node:test'

import { LocalGameChannel } from '../../assets/scripts/shared/channel'
import {
    isJsonValue,
    jsonRoundTrip,
    parseClientPacket,
    parseServerPacket,
    type ClientPacket,
    type ServerPacket,
} from '../../assets/scripts/shared/protocol'

test('protocol values survive JSON and reject unsafe values', () => {
    const packet: ClientPacket = {
        protocolVersion: 1,
        sequence: 1,
        type: 'command',
        command: { type: 'placePlant', row: 2, column: 4 },
    }

    assert.deepEqual(jsonRoundTrip(packet), packet)
    assert.equal(isJsonValue({ value: Number.NaN }), false)
    assert.equal(isJsonValue({ value: undefined }), false)
    assert.equal(isJsonValue(new Map()), false)

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    assert.equal(isJsonValue(cyclic), false)

    const hidden = { value: 1 }
    Object.defineProperty(hidden, 'toJSON', { value: () => null })
    assert.equal(isJsonValue(hidden), false)
    assert.equal(isJsonValue({ [Symbol('hidden')]: 1 }), false)

    let getterCalled = false
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { getterCalled = true; return 1 } })
    assert.equal(isJsonValue(accessor), false)
    assert.equal(getterCalled, false)
})

test('packet validators reject invalid envelopes and commands', () => {
    assert.throws(() => parseClientPacket({ protocolVersion: 2, sequence: 1, type: 'requestSave' }), /protocolVersion/)
    assert.throws(() => parseClientPacket({ protocolVersion: 1, sequence: -1, type: 'requestSave' }), /sequence/)
    assert.throws(() => parseClientPacket({
        protocolVersion: 1,
        sequence: 1,
        type: 'command',
        command: { type: 'placePlant', row: 1 },
    }), /column/)
    assert.throws(() => parseClientPacket({
        protocolVersion: 1,
        sequence: 1,
        type: 'startSession',
        levelId: 'pvz:adventure-1-1',
        randomSeed: 0x100000000,
        initialMoney: 0,
        firstAdventure: true,
        mods: [],
    }), /uint32/)
    assert.throws(() => parseServerPacket({ protocolVersion: 1, type: 'unknown' }), /unknown/)
})

test('local channel preserves FIFO order and drains each direction', () => {
    const channel = new LocalGameChannel()
    const first: ClientPacket = { protocolVersion: 1, sequence: 1, type: 'requestSave' }
    const second: ClientPacket = { protocolVersion: 1, sequence: 2, type: 'stopSession' }
    const reply: ServerPacket = {
        protocolVersion: 1,
        type: 'commandRejected',
        sequence: 2,
        code: 'session-stopped',
    }

    channel.sendToServer(first)
    channel.sendToServer(second)
    channel.sendToClient(reply)

    first.sequence = 99
    reply.code = 'mutated'

    assert.deepEqual(channel.drainServerPackets(), [
        { protocolVersion: 1, sequence: 1, type: 'requestSave' },
        second,
    ])
    assert.deepEqual(channel.drainServerPackets(), [])
    assert.deepEqual(channel.drainClientPackets(), [{
        protocolVersion: 1,
        type: 'commandRejected',
        sequence: 2,
        code: 'session-stopped',
    }])
    assert.deepEqual(channel.drainClientPackets(), [])

    assert.throws(() => channel.sendToServer({
        protocolVersion: 1,
        sequence: 3,
        type: 'command',
        command: { type: 'placePlant', row: 0, column: Number.NaN },
    }), /finite numbers/)
})

test('world snapshot validates migrated authoritative entity DTOs', () => {
    const snapshot = {
        levelId: 'pvz:adventure-1-1', tick: 0, gameplayTick: 0, phase: 'gameplay', result: 'playing', paused: false,
        sun: 50, availableSun: 50, money: 0,
        wave: { index: 0, total: 4, countdown: 0 },
        cursor: { mode: 'seed', seedId: 'pvz:peashooter' },
        seedPackets: [{
            seedId: 'pvz:peashooter', ready: false, selected: true,
            cooldownRemaining: 0, cooldownTotal: 0,
        }],
        conveyorPackets: [],
        plants: [{
            entityId: 2, typeId: 'pvz:peashooter', seedId: 'pvz:peashooter',
            x: 40, y: 280, row: 2, column: 0, health: 300, maxHealth: 300, eatenFlashCounter: 0,
        }],
        zombies: [{
            entityId: 3, typeId: 'pvz:normal', x: 700, y: 280, row: 2,
            state: 'walking', health: 270, maxHealth: 270,
            animation: 'anim_walk', animationTime: 0, animationSpeed: 1,
            moweredTicksRemaining: 0,
            hasHead: true, hasArm: true, hitFlashCounter: 0,
        }],
        projectiles: [{ entityId: 4, typeId: 'pvz:pea', x: 96, y: 290, row: 2 }],
        items: [{
            entityId: 5, typeId: 'pvz:sun', state: 'available', x: 100, y: 60, scale: 1, alpha: 255,
        }],
        lawnMowers: [{
            entityId: 1, typeId: 'pvz:standard', state: 'ready', x: 40, y: 280, row: 2,
        }],
        tutorial: { id: 'pvz:adventure-1-1', step: 'pick-first-seed' }, extensions: {},
    }
    const packet = { protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot }
    assert.doesNotThrow(() => parseServerPacket(packet))
    snapshot.plants[0].eatenFlashCounter = -1
    assert.throws(() => parseServerPacket(packet), /eatenFlashCounter/)
    snapshot.plants[0].eatenFlashCounter = 0
    snapshot.zombies[0].hitFlashCounter = -1
    assert.throws(() => parseServerPacket(packet), /hitFlashCounter/)
    snapshot.zombies[0].hitFlashCounter = 0
    snapshot.items[0].alpha = -1
    assert.throws(() => parseServerPacket(packet), /non-negative/)
    snapshot.items[0].alpha = 255

    const frame = {
        protocolVersion: 1, type: 'frame', serverTick: 1, acknowledgedSequence: 1,
        snapshot, events: [{ eventId: 1, type: 'test', data: {} }],
    }
    assert.throws(() => parseServerPacket(frame), /must match/)
    frame.serverTick = 0
    frame.events = [
        { eventId: 2, type: 'test', data: {} },
        { eventId: 1, type: 'test', data: {} },
    ]
    assert.throws(() => parseServerPacket(frame), /strictly increasing/)
    frame.events = [{ eventId: 0, type: 'test', data: {} }]
    assert.throws(() => parseServerPacket(frame), /positive/)

    snapshot.gameplayTick = snapshot.tick + 1
    assert.throws(() => parseServerPacket(packet), /gameplayTick must not exceed tick/)
    snapshot.gameplayTick = snapshot.tick

    snapshot.seedPackets[0].cooldownRemaining = 1
    assert.throws(() => parseServerPacket(packet), /must not exceed/)
    snapshot.seedPackets[0].cooldownRemaining = 0
    snapshot.cursor = { mode: 'none', seedId: 'pvz:peashooter' }
    assert.throws(() => parseServerPacket(packet), /does not match/)
})
