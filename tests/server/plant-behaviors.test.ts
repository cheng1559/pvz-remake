import { readGameplaySource } from '../../tools/content_source'
import assert from 'node:assert/strict'
import test from 'node:test'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { PlantBehavior } from '@/server/plants/behaviors'
import { runCommand } from './run-command'

const json = readGameplaySource
const source = json('definitions')
source.plants['test:plant'] = { maxHealth: 300, body: source.plants['pvz:peashooter'].body, behavior: { intervalTicks: 10 } }
source.seeds['test:plant'] = { plant: 'test:plant', sunCost: 0, cooldownTicks: 1, placement: 'ground' }
const definitions = parseGameplayDefinitions(source, json('seed-catalog'))
const levelSource = json('levels')
levelSource.levels['pvz:adventure-1-1'].seedPackets.push('test:plant')
const levels = parseGameplayLevels(levelSource, definitions)
type State = { ticks: number, history: { heals: number } }
const behavior: PlantBehavior<State> = {
    createState: () => ({ ticks: 0, history: { heals: 0 } }),
    validateState(state, definition) {
        if (!Number.isInteger(state.ticks) || state.ticks < 0 || state.ticks >= Number(definition.behavior!.intervalTicks) ||
            !state.history || !Number.isInteger(state.history.heals) || state.history.heals < 0) throw new Error('Invalid test plant state')
    },
    tick({ plant, state, definition }) {
        if (++state.ticks < Number(definition.behavior!.intervalTicks)) return
        state.ticks = 0
        state.history.heals++
        plant.health = Math.min(plant.maxHealth, plant.health + 10)
    },
}
const start = {
    protocolVersion: 1 as const, type: 'startSession' as const, sequence: 1,
    levelId: 'pvz:adventure-1-1', randomSeed: 42, initialMoney: 0, firstAdventure: false,
    mods: [{ id: 'test:mod', version: '0.1.0', contentHash: 'behavior-test' }],
}
function setup() {
    const mods = new GameplayRegistry()
    mods.plantBehaviors.register('test:mod', 'test:plant', behavior)
    const server = new IntegratedGameServer(definitions, levels, mods)
    server.start(start)
    runCommand(server, { type: 'completeIntro' })
    return { mods, server }
}
function plant(server: IntegratedGameServer, seed: string, column: number) {
    server.enqueueDebugCommand(1000 + column, `/plant ${seed} 3 ${column + 1}`)
    server.processBoundaryCommands()
    assert.equal(server.drainCommandResults()[0].debug?.ok, true)
}

test('plant behavior registration rejects conflicts, unknown targets, missing handlers and non-JSON state', () => {
    const mods = new GameplayRegistry()
    mods.plantBehaviors.register('test:mod', 'test:plant', behavior)
    assert.throws(() => mods.plantBehaviors.register('other:mod', 'test:plant', behavior), /already registered by test:mod/)
    new IntegratedGameServer(definitions, levels, mods)
    assert.throws(() => mods.plantBehaviors.register('test:mod', 'test:plant', behavior), /frozen/)
    const unknown = new GameplayRegistry()
    unknown.plantBehaviors.register('test:mod', 'test:missing', behavior)
    assert.throws(() => new IntegratedGameServer(definitions, levels, unknown), /unknown plant/)
    assert.throws(() => new IntegratedGameServer(definitions, levels), /not installed: test:plant/)
    const invalid = new GameplayRegistry()
    invalid.plantBehaviors.register('test:mod', 'test:plant', { createState: () => ({ ticks: NaN }), tick() {} })
    new IntegratedGameServer(definitions, levels, invalid)
    assert.throws(() => invalid.plantBehaviors.createState('test:plant', definitions.plants['test:plant']), /finite numbers/)
})

test('per-plant state is isolated, follows simulation ticks, survives saves and resets after removal', () => {
    const { server, mods } = setup()
    plant(server, 'test:plant', 0)
    for (let i = 0; i < 3; i++) server.tick()
    plant(server, 'test:plant', 1)
    plant(server, 'peashooter', 2)
    const plants = server.snapshot().plants
    assert.deepEqual(plants.map(plant => plant.behaviorState?.ticks), [3, 0, undefined])
    ;(plants[0].behaviorState!.history as { heals: number }).heals = 999
    assert.equal((server.snapshot().plants[0].behaviorState!.history as { heals: number }).heals, 0)
    const saved = server.save()
    const savedPlant = saved.entities.find(entity => entity.plant?.typeId === 'test:plant')!.plant!
    savedPlant.health = 100
    assert.equal(server.snapshot().plants[0].health, 300)
    ;(savedPlant.behaviorState!.history as { heals: number }).heals = 5
    assert.equal((server.snapshot().plants[0].behaviorState!.history as { heals: number }).heals, 0)
    server.restore(saved, start.levelId, start.mods)
    const restored = new IntegratedGameServer(definitions, levels, mods)
    restored.restore(saved, start.levelId, start.mods)
    ;(savedPlant.behaviorState!.history as { heals: number }).heals = 999
    assert.equal((restored.snapshot().plants[0].behaviorState!.history as { heals: number }).heals, 5)

    for (const target of [server, restored]) runCommand(target, { type: 'pause' })
    const paused = server.snapshot()
    for (let i = 0; i < 20; i++) {
        assert.deepEqual(server.tick(), paused)
        assert.deepEqual(restored.tick(), paused)
    }
    for (const target of [server, restored]) runCommand(target, { type: 'resume' })
    for (let i = 0; i < 7; i++) assert.deepEqual(restored.tick(), server.tick())
    assert.equal(server.snapshot().plants[0].health, 110)
    assert.deepEqual(server.snapshot().plants.map(plant => plant.behaviorState?.ticks), [0, 7, undefined])
    const invalid = server.save()
    const invalidPlant = invalid.entities.find(entity => entity.plant?.typeId === 'test:plant')!.plant!
    invalidPlant.behaviorState!.ticks = -1
    assert.throws(() => restored.restore(invalid), /Invalid test plant state/)
    delete invalidPlant.behaviorState
    assert.throws(() => restored.restore(invalid), /Invalid plant behavior state/)
    server.enqueueDebugCommand(2000, '/removeplant 3 1')
    server.processBoundaryCommands()
    assert.equal(server.drainCommandResults()[0].debug?.ok, true)
    plant(server, 'test:plant', 0)
    const replacement = server.snapshot().plants.find(plant => plant.column === 0)!
    assert.deepEqual(replacement.behaviorState, { ticks: 0, history: { heals: 0 } })
})
