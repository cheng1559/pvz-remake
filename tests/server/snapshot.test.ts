import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/server/state/World'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { PlantComponent } from '@/server/state/components'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { parseServerPacket, type StartSessionPacket, type WorldSnapshot } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-1-5', randomSeed: 1, initialMoney: 0, firstAdventure: true, mods: [] }

function start(packet: Partial<StartSessionPacket> = {}): IntegratedGameServer {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

function debug(server: IntegratedGameServer, command: string): void {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    server.drainCommandResults()
}

/** The snapshot as the client takes it in: through the protocol's checks. */
function received(snapshot: unknown): WorldSnapshot {
    const packet = parseServerPacket({ protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 0, snapshot })
    assert.equal(packet.type, 'sessionStarted')
    return (packet as { snapshot: WorldSnapshot }).snapshot
}

test("the base game's own state has fields of its own, and `extensions` holds only the level rule's and Mods'", () => {
    // 1-5 on a first adventure: Dave's lines, the shovel he hands over, and the conveyor.
    const bowling = start()
    let snapshot = received(bowling.snapshot())
    assert.deepEqual(snapshot.dialog, { index: 2400 })
    assert.deepEqual(snapshot.tools, { owned: ['pvz:shovel'], available: [] })
    assert.deepEqual(snapshot.conveyor, { ticks: 0 })
    assert.equal(snapshot.debug, undefined, 'no debug rule has been set')
    assert.deepEqual(snapshot.extensions, {})
    while (bowling.snapshot().dialog) runCommand(bowling, { type: 'advanceDialog' })
    for (const [row, column] of [[1, 5], [2, 7], [3, 6]]) {
        runCommand(bowling, { type: 'selectTool', toolId: 'pvz:shovel' })
        runCommand(bowling, { type: 'useToolAt', row, column })
    }
    while (bowling.snapshot().dialog) runCommand(bowling, { type: 'advanceDialog' })
    assert.equal(runCommand(bowling, { type: 'completeIntro' }), undefined)
    for (let tick = 0; tick < 5; tick++) bowling.tick()
    snapshot = received(bowling.snapshot())
    assert.equal(snapshot.dialog, undefined)
    assert.deepEqual(snapshot.tools, { owned: ['pvz:shovel'], available: ['pvz:shovel'] })
    assert.ok(snapshot.conveyor!.ticks > 0, 'the belt moves in play')

    // `/collect move` and the switches after it show in `debug`.
    debug(bowling, '/collect move')
    debug(bowling, '/cooldown')
    assert.deepEqual(received(bowling.snapshot()).debug,
        { cooldown: false, sunCost: true, plantInvincible: false, collect: 'move', cheatSeeds: false })

    // 2-5: no shovel and no belt; its rule shows the mallet under its kind.
    snapshot = received(start({ levelId: 'pvz:adventure-2-5', firstAdventure: false }).snapshot())
    assert.equal(snapshot.tools, undefined)
    assert.equal(snapshot.conveyor, undefined)
    assert.deepEqual(snapshot.extensions, { 'pvz:whack-a-zombie': { hammer: true } })
})

test('the protocol checks the tools, the conveyor, the dialog and the debug rules', () => {
    const server = start()
    debug(server, '/collect move')
    const valid = server.snapshot()
    received(valid)
    const broken: Array<[Partial<Record<keyof WorldSnapshot, unknown>>, RegExp]> = [
        [{ tools: { owned: [], available: [] } }, /tools\.owned must list distinct tools/],
        [{ tools: { owned: ['pvz:shovel', 'pvz:shovel'], available: [] } }, /tools\.owned must list distinct tools/],
        [{ tools: { owned: ['pvz:shovel'], available: ['pvz:hammer'] } }, /tools\.available\[0\] is not owned/],
        [{ tools: { owned: ['pvz:shovel'] } }, /tools\.available must be an array/],
        [{ conveyor: { ticks: -1 } }, /conveyor\.ticks/],
        [{ dialog: { index: 1.5 } }, /dialog\.index/],
        [{ dialog: { index: 1503, question: { cost: 75 } } }, /dialog\.question\.kind/],
        [{ debug: { ...valid.debug, collect: 'hover' } }, /debug\.collect/],
        [{ debug: { ...valid.debug, cooldown: 'yes' } }, /debug\.cooldown/],
    ]
    for (const [change, message] of broken) assert.throws(() => received({ ...valid, ...change }), message, JSON.stringify(change))
})

test("a plant's snapshot lists its own fields: the server's counters, and anything new on it, stay on the server", () => {
    const server = start({ levelId: 'pvz:adventure-1-1', ownedSeeds: ['pvz:peashooter'] })
    runCommand(server, { type: 'completeIntro' })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), undefined)
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    const [entity] = world.query(PlantComponent)
    const plant = world.get(entity, PlantComponent)!
    Object.assign(plant, { chilledTicks: 30, blinkTicks: 400, recentlyEatenCounter: 5, serverOnly: 1 })
    const [shown] = received(server.snapshot()).plants
    assert.deepEqual(Object.keys(shown).sort(),
        ['animations', 'chilledTicks', 'column', 'entityId', 'health', 'maxHealth', 'row', 'typeId', 'x', 'y'])
    assert.equal(shown.chilledTicks, 30)
})
