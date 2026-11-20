import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { GraveSnapshot, JsonValue, StartSessionPacket, WorldSnapshot } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { startFromSave } from './start-from-save'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
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
    assert.equal(snapshot.gridItems!.length, 9)
    assert.equal((snapshot.gridItems as GraveSnapshot[]).filter(grave => grave.special).length, 1)
    assert.ok((snapshot.gridItems as GraveSnapshot[]).every(grave => grave.column >= 3 && grave.riseAtTick === undefined), 'WhackAZombiePlaceGraves from column 3')
    assert.deepEqual(snapshot.seedPackets.map(packet => [packet!.seedId, packet!.ready]),
        [['pvz:potatomine', true], ['pvz:gravebuster', true], ['pvz:cherrybomb', true]])
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.tools, undefined, 'CutScene::ShowShovel: no shovel')
})

test('a first adventure hears Dave out first', () => {
    const server = start({ firstAdventure: true })
    for (let index = 401; index <= 406; index++) {
        assert.deepEqual(server.snapshot().dialog, { index })
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

test('the waves count the shared countdown down and come by Board::NextWaveComing, the siren before the last', () => {
    const server = play({ randomSeed: 11 })
    const comings: Array<[number, unknown]> = [], finals: number[] = []
    assert.equal(server.snapshot().wave.countdown, 200, 'Challenge::StartLevel: mZombieCountDown, which the progress meter follows')
    for (let tick = 0; tick < 2000 * 9 && server.snapshot().wave.index < server.snapshot().wave.total; tick++) {
        const snapshot = server.tick()
        whackAll(server, snapshot)
        for (const event of server.drainEvents()) {
            if (event.type === 'nextWaveComing') comings.push([snapshot.gameplayTick, event.data])
            if (event.type === 'finalWave') finals.push(snapshot.gameplayTick)
        }
    }
    assert.deepEqual(comings.map(([tick]) => tick), Array.from({ length: 8 }, (_, wave) => 195 + 2000 * wave), '5 ticks before each wave')
    assert.deepEqual(comings.map(([, data]) => data), [{ first: true }, {}, {}, {}, {}, {}, {}, { siren: true }])
    assert.deepEqual(finals, [195 + 2000 * 7], 'the final wave\'s banner once, before the last')
    assert.equal(server.snapshot().wave.countdown, 2000)
})

test('with every grave being eaten and no zombie left, the award drops when the final group would have risen', () => {
    const server = play({ randomSeed: 11 })
    const wave = () => (server.save() as unknown as { wave: { nextWaveAtTick?: number, index: number } }).wave
    for (let tick = 0; tick < 2000 * 9 && wave().index < server.snapshot().wave.total; tick++) whackAll(server, server.tick())
    // The final wave has started: its group rises 300 ticks on. A grave buster on each grave by then, and the lawn cleared.
    const graves = server.snapshot().gridItems!
    for (const grave of graves) assert.equal(debug(server, `/plant gravebuster ${grave.row + 1} ${grave.column + 1}`)?.ok, true)
    assert.equal(server.snapshot().plants.filter(plant => plant.typeId === 'pvz:gravebuster').length, graves.length)
    let dropped = -1
    for (let tick = 0; tick < 400 && dropped < 0; tick++) {
        const snapshot = server.tick()
        whackAll(server, snapshot)
        if (snapshot.items.some(item => item.typeId === LEVEL_AWARD)) dropped = tick
        else assert.ok(wave().nextWaveAtTick !== undefined, 'not before the final group is due')
    }
    assert.ok(dropped >= 0, 'the level does not stay stuck')
    assert.equal(server.snapshot().zombies.length, 0)
})

test("a grave of the plants' side raises its zombies on that side, and the mallet only meets the other side's", () => {
    const server = play({ randomSeed: 11 })
    for (const grave of server.snapshot().gridItems!) assert.equal(debug(server, `/griditem grave ${grave.row + 1} ${grave.column + 1} plants`)?.ok, true)
    let snapshot = server.snapshot()
    for (let tick = 0; tick < 2000 && !snapshot.zombies.length; tick++) snapshot = server.tick()
    assert.ok(snapshot.zombies.length > 0)
    assert.ok(snapshot.zombies.every(zombie => zombie.team === 'plants'), 'as the last wave raises them from such a grave')
    // The mallet passes over the plants' own zombies.
    server.drainEvents()
    whackAll(server, snapshot)
    const after = server.tick()
    assert.deepEqual(after.zombies.map(zombie => zombie.entityId), snapshot.zombies.map(zombie => zombie.entityId))
    assert.equal(server.drainEvents().some(event => event.type === 'zombieWhacked'), false)
    // A plant of the other side takes the mallet's 900; one of its own does not.
    for (const line of ['/plant wallnut 1 2 zombies', '/plant wallnut 5 2']) assert.equal(debug(server, line)?.ok, true, line)
    const nuts = () => server.snapshot().plants.filter(plant => plant.typeId === 'pvz:wallnut')
    for (const nut of nuts()) assert.equal(runCommand(server, { type: 'boardClick', x: Math.round(nut.x + 40), y: Math.round(nut.y + 60) }), undefined)
    server.tick()
    assert.deepEqual(nuts().map(nut => [nut.team, nut.health]).sort(), [['zombies', 4000 - 900], [undefined, 4000]].sort())
    const blows = () => server.drainEvents().filter(event => event.type === 'plantWhacked').map(event => event.data.killed === true)
    assert.deepEqual(blows(), [false], 'a blow it outlasts is no POW')
    // The blow ends what has no more than its 900 left, and that is the POW.
    const hostile = () => nuts().find(nut => nut.team === 'zombies')
    for (let blow = 0; blow < 4; blow++) {
        const nut = hostile()!
        runCommand(server, { type: 'boardClick', x: Math.round(nut.x + 40), y: Math.round(nut.y + 60) })
        server.tick()
    }
    assert.equal(hostile(), undefined, '3100, 2200, 1300, 400, gone')
    assert.deepEqual(blows(), [false, false, false, true])
})

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
    const grave = server.snapshot().gridItems![0]
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
        const state = (server.save() as unknown as { wave: { nextWaveAtTick?: number, index: number } }).wave
        if (snapshot.items.some(item => item.typeId === LEVEL_AWARD) && state.nextWaveAtTick !== undefined) awardBeforeEnd = true
        if (snapshot.items.some(item => item.typeId === LEVEL_AWARD)) break
    }
    assert.equal(awardBeforeEnd, false)
    assert.ok(server.snapshot().items.some(item => item.typeId === LEVEL_AWARD), 'the Hypno-shroom drops after the last group')
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
    startFromSave(restored, saved)
    assert.deepEqual(restored.snapshot().gridItems, server.snapshot().gridItems)
    run(server, 300)
    run(restored, 300)
    assert.deepEqual(restored.snapshot().zombies.map(zombie => [zombie.typeId, zombie.x, zombie.row]),
        server.snapshot().zombies.map(zombie => [zombie.typeId, zombie.x, zombie.row]))
})

test("the rule keeps Challenge's numbers unless a level writes its own, and checks those it writes", () => {
    // The base level writes only its zombies and its sun.
    assert.deepEqual(Object.keys(levels.levels['pvz:adventure-2-5'].rules!.settings).sort(), ['sun', 'zombies'])
    const variant = (settings: Record<string, unknown>) => {
        const source = structuredClone(readGameplaySource('levels')), level = source.levels['pvz:adventure-2-5']
        level.rules = { ...level.rules, ...settings }
        return new IntegratedGameServer(definitions, parseGameplayLevels(source, definitions))
    }
    for (const [settings, error, message] of [
        [{ graveCount: 9 }, /rules\.graveCount is not supported/],
        [{ hammerRadius: 0 }, /rules\.hammerRadius must be positive/],
        [{ chances: { double: [0, 30] } }, /rules\.chances\.double must have a chance for each of the 6 phases/],
        [{ chances: { treble: [0, 0, 0, 0, 0, 0] } }, /rules\.chances\.treble is not supported/],
        [{ chances: { pail: [0, 0, 0, 80, 15, 15] } }, /add up to at most 100 in phase 3/],
        [{ refillTicks: 2000 }, /does not fit its waves/],
        [{ finalGroupDelayTicks: 1702 }, /does not fit its waves/, 'the final group would never rise'],
    ] as const) assert.throws(() => variant(settings), error, message)
    // A variant: 4 graves from column 7, groups of three from the first wave on, and a mallet that breaks a pail.
    const server = variant({ graves: 4, firstGraveColumn: 6, hammerDamage: 1100,
        chances: { triple: [100, 100, 100, 100, 100, 100], double: [0, 0, 0, 0, 0, 0] } })
    server.start(options)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    const graves = server.snapshot().gridItems!
    assert.equal(graves.length, 4)
    assert.ok(graves.every(grave => grave.column >= 6))
    let risen = server.snapshot().zombies
    for (let tick = 0; tick < 200 && !risen.length; tick++) risen = server.tick().zombies
    assert.equal(risen.length, 3)
    whackAll(server, server.snapshot())
    assert.equal(server.snapshot().zombies.length, 0)
    assert.equal(debug(server, '/zombie buckethead 3 7')?.ok, true)
    whackAll(server, server.snapshot())
    const [pail] = server.snapshot().zombies
    assert.equal(pail.helmHealth, 0, "TakeHelmDamage of the level's own 1100")
    assert.equal(pail.health, definitions.zombies['pvz:buckethead'].maxHealth)
})
