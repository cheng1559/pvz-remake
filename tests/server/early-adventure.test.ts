import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from './run-command'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options = (index: number): StartSessionPacket => ({
    protocolVersion: 1, sequence: 1, type: 'startSession', levelId: `pvz:adventure-1-${index}`,
    randomSeed: 12345, initialMoney: 0, firstAdventure: true, mods: [],
})
function game(index: number, intro = false) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options(index))
    if (!intro) runCommand(server, { type: 'completeIntro' })
    return server
}

test('1-3 and 1-4 start on three/five rows, wait 18 seconds and use the original initial packet recharge', () => {
    for (const index of [3, 4]) {
        const server = game(index, true)
        const initial = server.snapshot()
        assert.equal(initial.sun, 50)
        assert.equal(initial.lawnMowers.length, index === 3 ? 3 : 5)
        assert.deepEqual(initial.seedPackets.map(packet => packet.seedId), levels.levels[initial.levelId].seedPackets)
        assert.equal(initial.wave.countdown, 1800)
        assert.ok(initial.wave.previewZombies!['pvz:conehead'] > 0)
        for (const [seedId, ticks] of [['pvz:cherrybomb', 3500], ...(index === 4 ? [['pvz:wallnut', 2000]] : [])] as [string, number][]) {
            const packet = initial.seedPackets.find(packet => packet.seedId === seedId)!
            assert.equal(packet.cooldownRemaining, ticks)
            assert.equal(packet.cooldownTotal, ticks)
            assert.equal(packet.ready, false)
        }
        for (let tick = 0; tick < 30; tick++) server.tick()
        assert.equal(server.snapshot().seedPackets[2].cooldownRemaining, 3500, 'intro time cannot recharge packets')
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
        const plan = server.save().wave.zombiesByWave!
        const level = levels.levels[options(index).levelId]
        assert.equal(plan.length, index === 3 ? 8 : 10)
        for (let wave = 0; wave < plan.length; wave++) {
            assert.equal(plan[wave].reduce((sum, id) => sum + level.zombiePool!.find(entry => entry.id === id)!.points, 0), level.waves[wave].points)
            assert.equal(plan[wave].filter(id => id === 'pvz:flag').length, wave === plan.length - 1 ? 1 : 0)
        }
        if (index === 3) assert.deepEqual(plan[4], ['pvz:conehead'])
        assert.ok(plan.at(-1)!.includes('pvz:conehead'))
        const rows = new Set<number>()
        for (let wave = 0; wave < plan.length; wave++) {
            const save = server.save()
            save.entities = save.entities.filter(entity => !entity.zombie)
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
            assert.deepEqual(server.snapshot().zombies.map(zombie => zombie.typeId), plan[wave])
            for (const zombie of server.snapshot().zombies) rows.add(zombie.row)
        }
        assert.deepEqual([...rows].sort(), level.activeRows)
        const save = server.save()
        for (const entity of save.entities) if (entity.zombie) entity.zombie.health = 0
        server.start({ ...options(index), save: save as unknown as JsonValue })
        server.tick()
        server.tick()
        const award = server.snapshot().items.find(item => item.typeId === level.award.id)!
        assert.ok(award)
        assert.equal(award.typeId, index === 3 ? 'pvz:wallnut' : 'pvz:shovel')
        assert.equal(runCommand(server, { type: 'collectItemAt', itemId: award.entityId }), undefined)
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
        if (index > 1) while (!server.save().tutorial.sunsFallen) server.tick()
        const save = server.save()
        save.economy.sun = 0
        const packet = save.seedBank.packets[0]
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
