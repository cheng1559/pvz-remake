import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseServerSaveSnapshot } from '@/server/session/save'
import { LEVEL_AWARD, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { GameCommand, JsonValue, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { startFromSave } from './start-from-save'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)
const start: StartSessionPacket = {
    protocolVersion: 1,
    sequence: 1,
    type: 'startSession',
    levelId: 'pvz:adventure-1-1',
    randomSeed: 12345,
    initialMoney: 25,
    firstAdventure: true,
    ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-1'),
    mods: [{ id: 'phase3:test', version: '1.0.0', contentHash: 'content-a' }],
}




test('server save restores IDs, pending events, and deterministic 1-1 completion', () => {
    const original = new IntegratedGameServer(definitions, levels)
    original.start(start)
    runCommand(original, { type: 'completeIntro' })
    runCommand(original, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(original, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = original.snapshot()
    while (snapshot.items.length === 0) snapshot = original.tick()
    runCommand(original, { type: 'collectItemAt', x: snapshot.items[0].x + 1, y: snapshot.items[0].y + 1 })
    snapshot = original.snapshot()
    while (snapshot.items.length === 0) snapshot = original.tick()

    const saved = original.save()
    assert.deepEqual(saved.mods, start.mods)
    assert.equal(saved.items.length > 0, true)
    assert.deepEqual(parseServerSaveSnapshot(saved), saved)
    assert.throws(() => parseServerSaveSnapshot({ ...saved, tick: -1 }), /tick/)
    assert.throws(() => parseServerSaveSnapshot({ ...saved, gameplayTick: -1 }), /gameplayTick/)
    assert.throws(() => parseServerSaveSnapshot({ ...saved, gameplayTick: saved.tick + 1 }), /must not exceed/)
    // The purse belongs to the profile: a restore takes the session's money, not the save's.
    const purse = new IntegratedGameServer(definitions, levels)
    assert.equal(purse.start({ ...start, initialMoney: 999, save: saved as unknown as JsonValue }).money, 999)
    const restored = new IntegratedGameServer(definitions, levels)
    assert.deepEqual(restored.start({
        ...start,
        randomSeed: 999,
        save: saved as unknown as JsonValue,
    }), original.snapshot())
    assert.deepEqual(restored.drainEvents(), original.drainEvents())

    const commandBoth = (command: GameCommand) => {
        assert.equal(runCommand(original, command), runCommand(restored, command))
        assert.deepEqual(restored.snapshot(), original.snapshot())
        assert.deepEqual(restored.drainEvents(), original.drainEvents())
    }
    const tickBoth = () => {
        const frame = original.tick()
        assert.deepEqual(restored.tick(), frame)
        assert.deepEqual(restored.drainEvents(), original.drainEvents())
        return frame
    }
    snapshot = original.snapshot()
    while (!snapshot.items.some(item => item.state === 'available')) snapshot = tickBoth()
    const available = snapshot.items.find(item => item.state === 'available')!
    commandBoth({ type: 'collectItemAt', x: available.x + 1, y: available.y + 1 })
    snapshot = original.snapshot()
    assert.equal(snapshot.sun, 75)
    const nextEntityId = original.save().allocator.nextEntity
    commandBoth({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    commandBoth({ type: 'placePlant', row: 2, column: 1 })
    assert.equal(original.snapshot().sun, 0)
    assert.equal(
        original.snapshot().plants.find(plant => plant.column === 1)?.entityId,
        nextEntityId,
    )

    let frame: WorldSnapshot = original.snapshot()
    while (frame.result === 'playing' && frame.tick < 30000) {
        frame = tickBoth()
        const award = frame.items.find(item => item.typeId === LEVEL_AWARD)
        if (award) commandBoth({ type: 'collectItemAt', x: award.x + 1, y: award.y + 1 })
        frame = original.snapshot()
    }

    assert.equal(frame.result, 'won')
    assert.deepEqual(restored.save(), original.save())
    assert.throws(
        () => new IntegratedGameServer(definitions, levels).start({
            ...start,
            levelId: 'pvz:not-the-saved-level',
            save: saved as unknown as JsonValue,
        }),
        /does not match requested level/,
    )
    assert.throws(
        () => new IntegratedGameServer(definitions, levels).start({
            ...start,
            mods: [{ id: 'phase3:test', version: '1.0.0', contentHash: 'content-b' }],
            save: saved as unknown as JsonValue,
        }),
        /enabled mods do not match/,
    )
    assert.throws(
        () => parseServerSaveSnapshot({ ...saved, mods: [...saved.mods, saved.mods[0]] }),
        /duplicate IDs/,
    )

    const savedEntityId = saved.items[0]?.id
    if (savedEntityId !== undefined) {
        const duplicateWaveZombie = {
            ...saved,
            wave: { ...saved.wave, zombieIds: [savedEntityId, savedEntityId] },
        }
        assert.throws(
            () => startFromSave(new IntegratedGameServer(definitions, levels), duplicateWaveZombie),
            /must be unique/,
        )
    }
    const plantId = saved.plants[0]?.id
    if (plantId !== undefined) {
        const nonZombieWaveEntity = {
            ...saved,
            wave: { ...saved.wave, zombieIds: [plantId] },
        }
        assert.throws(
            () => startFromSave(new IntegratedGameServer(definitions, levels), nonZombieWaveEntity),
            /is invalid/,
        )
    }
    const missingWaveEntity = {
        ...saved,
        wave: { ...saved.wave, zombieIds: [saved.allocator.nextEntity] },
    }
    assert.throws(
        () => startFromSave(new IntegratedGameServer(definitions, levels), missingWaveEntity),
        /is invalid/,
    )
    // An entity is in one list: a plant of a sun's id is refused.
    const [sun] = saved.items
    const twoLists = {
        ...saved,
        plants: [...saved.plants, {
            id: sun.id, position: sun.position,
            typeId: 'pvz:peashooter', state: 'idle', seedId: 'pvz:peashooter', column: 0,
            health: 300, maxHealth: 300, recentlyEatenCounter: 0, chilledTicks: 0, readyAtTick: 0,
        }],
    }
    assert.throws(
        () => startFromSave(new IntegratedGameServer(definitions, levels), twoLists),
        /duplicate entity IDs/,
    )
})
