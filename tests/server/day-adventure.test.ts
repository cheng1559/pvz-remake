import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue,StartSessionPacket } from '@/shared/protocol'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options = (index: number): StartSessionPacket => ({ type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: `pvz:adventure-1-${index}`, randomSeed: 12345, initialMoney: 0, firstAdventure: true, mods: [] })
function start(index: number) {
    const game = new IntegratedGameServer(definitions, levels)
    game.start(options(index))
    return game
}
function choose(game: IntegratedGameServer) {
    const chooser = game.snapshot().seedChooser
    if (!chooser) return
    for (const seedId of chooser.availableSeeds.slice(0, chooser.slots)) assert.equal(runCommand(game, { type: 'chooseSeed', seedId }), undefined)
    assert.equal(runCommand(game, { type: 'confirmSeeds' }), undefined)
}

test('stress level starts with configured plants, spawns its wave on demand and restores without duplicating plants', () => {
    const packet = { ...options(9), levelId: 'pvz:stress-test' }
    const game = new IntegratedGameServer(definitions, levels)
    const initial = game.start(packet)
    assert.equal(levels.levels['pvz:stress-test'].persistent, false)
    assert.equal(initial.plants.length, 40)
    assert.equal(initial.zombies.length, 0)
    assert.equal(initial.wave.countdown, 1200)
    assert.equal(new Set(initial.plants.map(plant => `${plant.row}:${plant.column}`)).size, 40)
    assert.equal(runCommand(game, { type: 'completeIntro' }), undefined)
    game.enqueueDebugCommand(500, '/nextwave')
    game.processBoundaryCommands()
    assert.equal(game.drainCommandResults()[0].debug?.ok, true)
    assert.equal(game.snapshot().zombies.length, 160)
    const restored = new IntegratedGameServer(definitions, levels)
    const snapshot = restored.start({ ...packet, save: game.save() as unknown as JsonValue })
    assert.equal(snapshot.plants.length, 40)
    assert.equal(snapshot.zombies.length, 160)
    assert.deepEqual(snapshot, game.snapshot())
})

test('initial plants reject unknown seeds and positions outside active rows', () => {
    const data = readGameplaySource('levels')
    data.levels['pvz:stress-test'].initialPlants[0].seedId = 'test:missing'
    assert.throws(() => parseGameplayLevels(data, definitions), /missing/)
    data.levels['pvz:stress-test'].initialPlants[0].seedId = 'pvz:sunflower'
    data.levels['pvz:stress-test'].initialPlants[0].row = 5
    assert.throws(() => parseGameplayLevels(data, definitions), /outside the lawn/)
})


test('day wave plans match original counts, flags, introduction waves and zombie restrictions', () => {
    for (const [index, count] of [[6, 10], [7, 20], [8, 10], [9, 20], [10, 20]]) {
        // Several seeds exercise weighted filling as well as guaranteed introductions.
        for (let randomSeed = 1; randomSeed <= 20; randomSeed++) {
            const game = start(index)
            game.start({ ...options(index), randomSeed })
            const plan = game.save().wave.zombiesByWave!
            assert.equal(plan.length, count)
            assert.deepEqual(levels.levels[options(index).levelId].waves.flatMap((wave, i) => wave.flagWave ? [i + 1] : []), count === 10 ? [10] : [10, 20])
            for (let wave = 0; wave < count; wave++) {
                assert.equal(plan[wave].includes('pvz:flag'), wave % 10 === 9)
                if (wave < 4 || index === 8) assert.equal(plan[wave].includes('pvz:pole_vaulter'), false)
                if (index < 8) assert.equal(plan[wave].includes('pvz:buckethead'), false)
                const base = Math.floor(wave / 3) + 1
                const fixedFlag = wave % 10 === 9 ? Math.min(base, 8) + 1 : 0
                const budget = wave % 10 === 9 ? Math.floor(base * 2.5) : base
                const expected = index === 10 ? fixedFlag + (budget - fixedFlag) * 3
                    : index === 8 && wave === 5 ? 4 : index === 8 && wave === 9 ? 11 : budget
                assert.equal(plan[wave].reduce((sum, id) => sum + levels.levels[options(index).levelId].zombiePool!.find(entry => entry.id === id)!.points, 0), expected)
            }
            for (const id of levels.levels[options(index).levelId].zombiePool!.filter(entry => entry.weight).map(entry => entry.id)) assert.ok(plan.at(-1)!.includes(id))
            if (index === 6) assert.ok(plan[5].includes('pvz:pole_vaulter'))
            if (index === 8) assert.ok(plan[5].includes('pvz:buckethead'))
        }
    }
})

test('1-10 starts empty, spawns at ticks 100/200, permits free planting across the lawn and restores supply state', () => {
    const game = start(10)
    assert.equal(game.snapshot().seedChooser, undefined)
    assert.deepEqual(game.snapshot().seedPackets, [])
    assert.deepEqual(game.snapshot().conveyorPackets, [])
    assert.equal(game.save().tutorial.sunAtTick, undefined)
    runCommand(game, { type: 'completeIntro' })
    for (let tick = 0; tick < 99; tick++) game.tick()
    assert.equal(game.snapshot().wave.index, 0)
    game.tick()
    assert.equal(game.snapshot().wave.index, 1)
    for (let tick = 100; tick < 199; tick++) game.tick()
    assert.deepEqual(game.snapshot().conveyorPackets, [])
    game.tick()
    const packet = game.snapshot().conveyorPackets[0]
    assert.ok(packet)
    assert.equal(runCommand(game, { type: 'selectConveyorPacket', packetId: packet.id }), undefined)
    const saved = game.save()
    const restored = start(10)
    restored.start({ ...options(10), save: saved as unknown as JsonValue })
    assert.deepEqual(restored.save(), saved)
    for (const server of [game, restored]) {
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 8 }), undefined)
        assert.equal(server.snapshot().sun, 0)
        assert.equal(server.snapshot().plants[0].typeId, definitions.seeds[packet.seedId].plant)
        assert.equal(server.snapshot().conveyorPackets.length, 0)
    }
    for (let tick = 0; tick < 1000; tick++) assert.deepEqual(restored.tick(), game.tick())
    assert.deepEqual(restored.save(), game.save())
    assert.equal(game.snapshot().items.some(item => item.typeId === 'pvz:sun'), false)
})


test('each day level runs both flag warnings, restores the planned waves and collects its own reward', () => {
    for (const index of [6, 7, 8, 9, 10]) {
        const game = start(index)
        choose(game)
        runCommand(game, { type: 'completeIntro' })
        const plan = game.save().wave.zombiesByWave!
        let flags = 0
        for (let wave = 0; wave < plan.length; wave++) {
            const saved = game.save()
            saved.entities = saved.entities.filter(entity => !entity.zombie)
            saved.wave.zombieIds = []
            saved.wave.nextWaveAtTick = saved.gameplayTick + 1
            game.start({ ...options(index), save: saved as unknown as JsonValue })
            game.drainEvents()
            game.tick()
            if (wave % 10 === 9) {
                flags++
                assert.ok(game.drainEvents().some(event => event.type === 'hugeWave'))
                const resumed = start(index)
                resumed.start({ ...options(index), save: game.save() as unknown as JsonValue })
                while (game.snapshot().wave.index === wave) {
                    assert.deepEqual(resumed.tick(), game.tick())
                    assert.deepEqual(resumed.drainEvents(), game.drainEvents())
                }
            }
            assert.deepEqual(game.snapshot().zombies.map(zombie => zombie.typeId), plan[wave])
        }
        assert.equal(flags, index === 6 || index === 8 ? 1 : 2)
        const saved = game.save()
        for (const entity of saved.entities) if (entity.zombie) entity.zombie.health = 0
        game.start({ ...options(index), save: saved as unknown as JsonValue })
        game.tick(); game.tick()
        const id = levels.levels[options(index).levelId].award.id
        const award = game.snapshot().items.find(item => item.typeId === id)!
        assert.ok(award)
        game.start({ ...options(index), save: game.save() as unknown as JsonValue })
        assert.equal(runCommand(game, { type: 'collectItemAt', itemId: award.entityId }), undefined)
        assert.equal(game.snapshot().result, 'won')
        const won = game.save()
        game.start({ ...options(index), save: won as unknown as JsonValue })
        assert.deepEqual(game.save(), won)
    }
})
