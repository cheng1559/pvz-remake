import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options = (index: number): StartSessionPacket => ({
    protocolVersion: 1, sequence: 1, type: 'startSession', levelId: `pvz:adventure-1-${index}`,
    randomSeed: 12345, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, `pvz:adventure-1-${index}`), mods: [],
})
function game(index: number, intro = false) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options(index))
    if (!intro) runCommand(server, { type: 'completeIntro' })
    return server
}

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    assert.equal((server.drainCommandResults()[0].debug as { ok: boolean }).ok, true, command)
}

test('1-1 goes on by the Peashooters planted, no other plant', () => {
    const one = game(1)
    // 1-1's bank has one slot: a second, restored, holds a Sunflower.
    const save = one.save()
    save.seedBank.packets.push({ seedId: 'pvz:sunflower', readyAtTick: 0, cooldownTotal: 0 })
    one.start({ ...options(1), save: save as unknown as JsonValue })
    for (const command of ['/cooldown', '/suncost']) debug(one, command)
    const step = () => one.snapshot().tutorial.step
    const plant = (seedId: string, column: number) => {
        assert.equal(runCommand(one, { type: 'selectSeed', seedId }), undefined)
        assert.equal(runCommand(one, { type: 'placePlant', row: 2, column }), undefined)
    }
    assert.equal(runCommand(one, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(one, { type: 'selectSeed', seedId: 'pvz:sunflower' }), undefined)
    assert.equal(step(), 'pick-first-seed', 'another card picked up puts the Peashooter back')
    plant('pvz:sunflower', 0)
    one.tick()
    assert.deepEqual([step(), one.save().skySun.atTick], ['pick-first-seed', undefined], 'a Sunflower does not count')
    plant('pvz:peashooter', 1)
    assert.equal(step(), 'first-plant-done')
    assert.equal(one.save().skySun.atTick, one.save().gameplayTick + 400, 'the first Peashooter lets the sky sun fall')
    plant('pvz:sunflower', 2)
    one.tick()
    assert.equal(one.save().wave.nextWaveAtTick, undefined)
    plant('pvz:peashooter', 3)
    assert.equal(step(), 'complete')
    assert.equal(one.save().wave.nextWaveAtTick, one.save().gameplayTick + 99, 'the second starts the waves')
})

test('1-1 and 1-2 without the Peashooter or the Sunflower start as replays do', () => {
    for (const [index, ownedSeeds] of [[1, []], [2, ['pvz:peashooter']]] as const) {
        const start = (firstAdventure: boolean) => {
            const server = new IntegratedGameServer(definitions, levels)
            server.start({ ...options(index), firstAdventure, ownedSeeds: [...ownedSeeds] })
            runCommand(server, { type: 'completeIntro' })
            return server
        }
        const first = start(true), replay = start(false)
        const { tutorial, skySun, wave } = first.save()
        assert.deepEqual([tutorial.skipped, tutorial.step], [true, 'complete'])
        assert.deepEqual(skySun, replay.save().skySun, 'the sky sun falls as on a replay')
        // Board::InitZombieWaves: the first adventure's 1-2 waits for its first wave, tutorial or not.
        assert.equal(wave.nextWaveAtTick, index === 2 ? 5000 : replay.save().wave.nextWaveAtTick)
        for (let tick = 0; tick < 600; tick++) first.tick()
        assert.deepEqual(first.drainEvents().filter(event => event.type === 'advice'), [], 'and no tutorial advice comes')
    }
})

test('1-1 and 1-2 skip their tutorial once the Peashooter or the Sunflower leaves the bank', () => {
    const step = (server: IntegratedGameServer) => server.snapshot().tutorial.step
    // Before the first Peashooter: the sky sun and the waves go on as the tutorial's end would let them.
    const one = game(1)
    debug(one, '/seed 1 normal')
    one.tick()
    const { gameplayTick, skySun, wave } = one.save()
    assert.deepEqual([step(one), skySun.atTick, wave.nextWaveAtTick], ['complete', gameplayTick + 400, gameplayTick + 99])
    // After it: the sky sun keeps its time.
    const after = game(1)
    assert.equal(runCommand(after, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(after, { type: 'placePlant', row: 2, column: 0 }), undefined)
    const sunAt = after.save().skySun.atTick
    debug(after, '/seed 1 normal')
    after.tick()
    assert.deepEqual([step(after), after.save().skySun.atTick, after.save().wave.nextWaveAtTick], ['complete', sunAt, after.save().gameplayTick + 99])
    after.start({ ...options(1), save: after.save() as unknown as JsonValue })
    assert.equal(after.save().tutorial.skipped, true, 'a save keeps it skipped')
    // 1-2 holds nothing back: its first wave keeps its time.
    const two = game(2)
    debug(two, '/seed 2 normal')
    two.tick()
    assert.deepEqual([step(two), two.save().wave.nextWaveAtTick], ['complete', 5000])
    debug(two, '/seed 2 sunflower')
    two.tick()
    assert.equal(step(two), 'complete', 'a skipped tutorial stays skipped')
})

test('1-2 goes back to the Sunflower after any card put down, a zombie card too', () => {
    const two = game(2)
    for (const command of ['/cooldown', '/suncost', '/seed 1 normal']) debug(two, command)
    assert.equal(runCommand(two, { type: 'selectSeed', seedId: 'pvz:normal' }), undefined)
    assert.equal(two.snapshot().tutorial.step, 'refresh-sunflower')
    assert.equal(runCommand(two, { type: 'placePlant', row: 2, column: 7 }), undefined)
    assert.equal(two.snapshot().tutorial.step, 'pick-sunflower', 'the Sunflower is ready, so the arrow goes back to it')
})

test('1-3 and 1-4 start on three/five rows, wait 18 seconds and use the original initial packet recharge', () => {
    for (const index of [3, 4]) {
        const server = game(index, true)
        const initial = server.snapshot()
        assert.equal(initial.sun, 50)
        assert.deepEqual(initial.mowers.map(mower => mower.row), index === 3 ? [1, 2, 3] : [0, 1, 2, 3, 4])
        assert.deepEqual(initial.seedPackets.map(packet => packet!.seedId), ['pvz:peashooter', 'pvz:sunflower', 'pvz:cherrybomb', ...index === 4 ? ['pvz:wallnut'] : []],
            'Board::InitLevel fills the bank with the available seeds in order')
        assert.equal(initial.wave.countdown, 1800)
        assert.ok(initial.wave.previewZombies!['pvz:conehead'] > 0)
        for (const [seedId, ticks] of [['pvz:cherrybomb', 3500], ...(index === 4 ? [['pvz:wallnut', 2000]] : [])] as [string, number][]) {
            const packet = initial.seedPackets.find(packet => packet!.seedId === seedId)!
            assert.equal(packet.cooldownRemaining, ticks)
            assert.equal(packet.cooldownTotal, ticks)
            assert.equal(packet.ready, false)
        }
        for (let tick = 0; tick < 30; tick++) server.tick()
        assert.equal(server.snapshot().seedPackets[2]!.cooldownRemaining, 3500, 'intro time cannot recharge packets')
        runCommand(server, { type: 'completeIntro' })
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:cherrybomb' }), 'seed-not-ready')
        for (let tick = 0; tick < 1799; tick++) server.tick()
        assert.equal(server.snapshot().zombies.length, 0)
        server.tick()
        assert.equal(server.snapshot().wave.index, 1)
        assert.equal(server.snapshot().zombies[0].typeId, 'pvz:normal')
        assert.equal(server.snapshot().tutorial.step, 'waiting-for-sunflowers')
    }
})

test('early adventure wave plans obey points, reserve conehead introductions and survive save/restore', () => {
    for (const index of [3, 4]) {
        const server = game(index)
        const plan = server.save().wave.plan.map(wave => wave.zombies)
        const level = levels.levels[options(index).levelId]
        assert.equal(plan.length, index === 3 ? 8 : 10)
        for (let wave = 0; wave < plan.length; wave++) {
            // Board::PickZombieWaves: wave / 3 + 1 points, times 2.5 on the flag wave.
            const points = Math.trunc(wave / 3) + 1
            assert.equal(plan[wave].reduce((sum, id) => sum + definitions.zombies[id].wave.points, 0), wave === plan.length - 1 ? Math.trunc(points * 2.5) : points)
            assert.equal(plan[wave].filter(id => id === 'pvz:flag').length, wave === plan.length - 1 ? 1 : 0)
        }
        if (index === 3) assert.deepEqual(plan[4], ['pvz:conehead'])
        assert.ok(plan.at(-1)!.includes('pvz:conehead'))
        const rows = new Set<number>()
        for (let wave = 0; wave < plan.length; wave++) {
            const save = server.save()
            save.zombies = []
            save.wave.zombieIds = []
            save.wave.nextWaveAtTick = save.gameplayTick + 1
            server.start({ ...options(index), save: save as unknown as JsonValue })
            server.drainEvents()
            server.tick()
            if (wave === plan.length - 1) {
                assert.equal(server.snapshot().wave.index, wave)
                assert.ok(server.drainEvents().some(event => event.type === 'hugeWave'))
                const restored = new IntegratedGameServer(definitions, levels)
                restored.start({ ...options(index), save: server.save() as unknown as JsonValue })
                while (server.snapshot().wave.index === wave) {
                    assert.deepEqual(restored.tick(), server.tick())
                    assert.deepEqual(restored.drainEvents(), server.drainEvents())
                }
            }
            // In the order they came: their slots reuse those of the zombies the save left out.
            assert.deepEqual(server.snapshot().zombies.sort((a, b) => a.entityId - b.entityId).map(zombie => zombie.typeId), plan[wave])
            for (const zombie of server.snapshot().zombies) rows.add(zombie.row)
        }
        assert.deepEqual([...rows].sort(), level.activeRows)
        const save = server.save()
        for (const zombie of save.zombies) zombie.health = 0
        server.start({ ...options(index), save: save as unknown as JsonValue })
        server.tick()
        server.tick()
        const award = server.snapshot().items.find(item => item.typeId === LEVEL_AWARD)!
        assert.ok(award)
        assert.equal(level.award.id, index === 3 ? 'pvz:wallnut' : 'pvz:shovel')
        assert.equal(runCommand(server, { type: 'collectItemAt', x: award.x + 1, y: award.y + 1 }), undefined)
        assert.equal(server.snapshot().result, 'won')
    }
})

test('the optional sunflower reminder starts after wave five, persists and never delays the wave timer', () => {
    const server = game(3)
    const save = server.save()
    save.economy.sun = 1000
    save.wave.index = 5
    save.wave.nextWaveAtTick = 2000
    server.start({ ...options(3), save: save as unknown as JsonValue })
    server.tick()
    assert.equal(server.snapshot().tutorial.step, 'pick-sunflower')
    assert.ok(server.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_PLANT_SUNFLOWER4' && event.data.style === 'tutorial-later-stay'))
    server.start({ ...options(3), save: server.save() as unknown as JsonValue })
    let followupCount = 0
    for (let column = 0; column < 3; column++) {
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:sunflower' }), undefined)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column }), undefined)
        if (column < 2) for (let tick = 0; tick < 750; tick++) server.tick()
        followupCount += server.drainEvents().filter(event => event.type === 'advice' && event.data.key === 'ADVICE_PLANT_SUNFLOWER5').length
        server.start({ ...options(3), save: server.save() as unknown as JsonValue })
    }
    assert.equal(server.snapshot().tutorial.step, 'complete')
    assert.equal(server.save().wave.nextWaveAtTick, 2000)
    assert.equal(followupCount, 1, 'finishing the tutorial cannot repeat the timed advice, including after restore')
})

test('seed rejection advice is excluded before the first sun prompt and from later levels', () => {
    for (const index of [1, 2, 3, 4]) {
        const server = game(index)
        if (index > 1) while (!server.save().skySun.fallen) server.tick()
        const save = server.save()
        save.economy.sun = 0
        const packet = save.seedBank.packets[0]!
        packet.readyAtTick = 0
        server.start({ ...options(index), save: save as unknown as JsonValue })
        server.drainEvents()
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.equal(runCommand(server, { type: 'selectSeed', seedId: packet.seedId }), 'not-enough-sun')
            assert.deepEqual(server.drainEvents().map(event => event.type), ['sunFlash'])
        }
        packet.readyAtTick = save.gameplayTick + 1000
        server.start({ ...options(index), save: save as unknown as JsonValue })
        server.drainEvents()
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: packet.seedId }), 'seed-not-ready')
        assert.deepEqual(server.drainEvents(), [])
    }
})
