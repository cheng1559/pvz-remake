import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import type { ZombieBehavior } from '@/server/zombies/behaviors'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { runCommand } from './run-command'

const json = readGameplaySource
const source = json('definitions')
source.zombies['test:zombie'] = { ...source.zombies['pvz:normal'], maxHealth: 540, behavior: { intervalTicks: 10 } }
const definitions = parseGameplayDefinitions(source, json('seed-catalog'))
const levelSource = json('levels')
levelSource.levels['pvz:adventure-1-1'].waves[0].zombies = ['test:zombie', 'pvz:normal']
const levels = parseGameplayLevels(levelSource, definitions)
type State = { ticks: number, history: { heals: number } }
const behavior: ZombieBehavior<State> = {
    createState: () => ({ ticks: 0, history: { heals: 0 } }),
    validateState(state, definition) {
        if (!Number.isInteger(state.ticks) || state.ticks < 0 || state.ticks >= Number(definition.behavior!.intervalTicks) ||
            !state.history || !Number.isInteger(state.history.heals)) throw new Error('Invalid test zombie state')
    },
    tick({ zombie, state, definition }) {
        if (++state.ticks < Number(definition.behavior!.intervalTicks)) return
        state.ticks = 0
        state.history.heals++
        zombie.health = Math.min(zombie.maxHealth, zombie.health + 10)
    },
}
const start = {
    protocolVersion: 1 as const, type: 'startSession' as const, sequence: 1,
    levelId: 'pvz:adventure-1-1', randomSeed: 42, initialMoney: 0, firstAdventure: false,
    mods: [{ id: 'test:mod', version: '0.1.0', contentHash: 'behavior-test' }],
}
function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1000, command)
    server.processBoundaryCommands()
    assert.equal(server.drainCommandResults()[0].debug?.ok, true)
}

test('zombie behaviors use the same conflict, target, state and freeze rules as plants', () => {
    const mods = new GameplayRegistry()
    mods.zombieBehaviors.register('test:mod', 'test:zombie', behavior)
    assert.throws(() => mods.zombieBehaviors.register('other:mod', 'test:zombie', behavior), /already registered by test:mod/)
    new IntegratedGameServer(definitions, levels, mods)
    assert.throws(() => mods.zombieBehaviors.register('test:mod', 'test:zombie', behavior), /frozen/)
    assert.throws(() => new IntegratedGameServer(definitions, levels), /not installed: test:zombie/)
    const unknown = new GameplayRegistry()
    unknown.zombieBehaviors.register('test:mod', 'test:missing', behavior)
    assert.throws(() => new IntegratedGameServer(definitions, levels, unknown), /unknown zombie/)
})

test('CLI and wave zombies have isolated persisted state that stops during pause and after death', () => {
    const mods = new GameplayRegistry()
    mods.zombieBehaviors.register('test:mod', 'test:zombie', behavior)
    const server = new IntegratedGameServer(definitions, levels, mods)
    server.start(start)
    runCommand(server, { type: 'completeIntro' })
    const ready = server.save()
    ready.wave.nextWaveAtTick = 10000
    server.restore(ready, start.levelId, start.mods)
    debug(server, '/zombie test:zombie 3 7')
    for (let i = 0; i < 3; i++) server.tick()
    debug(server, '/nextwave')
    const zombies = server.snapshot().zombies
    assert.deepEqual(zombies.map(zombie => zombie.behaviorState?.ticks), [3, 0, undefined])
    const exposedHistory = zombies[0].behaviorState!.history as { heals: number }
    exposedHistory.heals = 999
    assert.equal((server.snapshot().zombies[0].behaviorState!.history as { heals: number }).heals, 0)

    const saved = server.save()
    const savedZombie = saved.entities.find(entity => entity.entityId === zombies[0].entityId)!.zombie!
    savedZombie.health = 400
    const history = savedZombie.behaviorState!.history as { heals: number }
    history.heals = 5
    assert.equal((server.snapshot().zombies[0].behaviorState!.history as { heals: number }).heals, 0)
    server.restore(saved, start.levelId, start.mods)
    const restored = new IntegratedGameServer(definitions, levels, mods)
    restored.restore(saved, start.levelId, start.mods)
    history.heals = 999
    assert.equal((restored.snapshot().zombies[0].behaviorState!.history as { heals: number }).heals, 5)
    for (const target of [server, restored]) runCommand(target, { type: 'pause' })
    const paused = server.snapshot()
    for (let i = 0; i < 20; i++) {
        assert.deepEqual(server.tick(), paused)
        assert.deepEqual(restored.tick(), paused)
    }
    for (const target of [server, restored]) runCommand(target, { type: 'resume' })
    for (let i = 0; i < 7; i++) assert.deepEqual(restored.tick(), server.tick())
    assert.equal(server.snapshot().zombies[0].health, 410)
    assert.deepEqual(server.snapshot().zombies.map(zombie => zombie.behaviorState?.ticks), [0, 7, undefined])
    const invalid = server.save()
    const invalidZombie = invalid.entities.find(entity => entity.entityId === zombies[0].entityId)!.zombie!
    invalidZombie.behaviorState!.ticks = -1
    assert.throws(() => restored.restore(invalid), /Invalid test zombie state/)
    delete invalidZombie.behaviorState
    assert.throws(() => restored.restore(invalid), /Invalid zombie behavior state/)
    debug(server, '/kill')
    const dead = server.snapshot().zombies.map(zombie => zombie.behaviorState)
    for (let i = 0; i < 5; i++) server.tick()
    assert.deepEqual(server.snapshot().zombies.map(zombie => zombie.behaviorState), dead)
})
