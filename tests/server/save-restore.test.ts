import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseServerSaveSnapshotV2 } from '@/server/save'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { GameCommand, JsonValue, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import { runCommand } from './run-command'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)
const start: StartSessionPacket = {
    protocolVersion: 1,
    sequence: 1,
    type: 'startSession',
    levelId: 'pvz:adventure-1-1',
    randomSeed: 12345,
    initialMoney: 25,
    firstAdventure: true,
    mods: [{ id: 'phase3:test', version: '1.0.0', contentHash: 'content-a' }],
}

test('server save resumes a mowered zombie through its final limb drops', () => {
    const original = new IntegratedGameServer(definitions, levels)
    original.start(start)
    runCommand(original, { type: 'completeIntro' })
    const zombieId = (original as unknown as {
        spawnZombie(typeId: string, row: number, x: number): number
    }).spawnZombie('pvz:normal', 2, -10)
    original.tick()
    assert.equal(original.snapshot().zombies[0].state, 'mowered')
    const saved = original.save()
    const savedZombie = saved.entities.find(entity => entity.entityId === zombieId)!.zombie!
    assert.ok(Number.isInteger(savedZombie.groanCounter))
    assert.throws(() => parseServerSaveSnapshotV2({
        ...saved,
        entities: saved.entities.map(entity => entity.entityId === zombieId
            ? { ...entity, zombie: { ...entity.zombie!, groanCounter: 0.5 } }
            : entity),
    }), /groanCounter/)

    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...start, save: saved as unknown as JsonValue })
    assert.equal(restored.save().entities.find(entity => entity.entityId === zombieId)!.zombie!.groanCounter,
        savedZombie.groanCounter)
    assert.deepEqual(restored.snapshot(), original.snapshot())
    original.drainEvents()
    restored.drainEvents()
    for (let tick = 0; tick < 50; tick++) {
        assert.deepEqual(restored.tick(), original.tick())
        assert.deepEqual(restored.drainEvents(), original.drainEvents())
    }
    assert.equal(original.snapshot().zombies.some(zombie => zombie.entityId === zombieId), false)
})

test('server save restores IDs, pending events, and deterministic 1-1 completion', () => {
    const original = new IntegratedGameServer(definitions, levels)
    original.start(start)
    runCommand(original, { type: 'completeIntro' })
    runCommand(original, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(original, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = original.snapshot()
    while (snapshot.items.length === 0) snapshot = original.tick()
    runCommand(original, { type: 'collectItemAt', itemId: snapshot.items[0].entityId })
    snapshot = original.snapshot()
    while (snapshot.items.length === 0) snapshot = original.tick()

    const saved = original.save()
    assert.deepEqual(saved.mods, start.mods)
    assert.equal(saved.entities.some(entity => entity.item !== undefined), true)
    assert.deepEqual(parseServerSaveSnapshotV2(saved), saved)
    assert.throws(() => parseServerSaveSnapshotV2({ ...saved, tick: -1 }), /tick/)
    assert.throws(() => parseServerSaveSnapshotV2({ ...saved, gameplayTick: -1 }), /gameplayTick/)
    assert.throws(() => parseServerSaveSnapshotV2({ ...saved, gameplayTick: saved.tick + 1 }), /must not exceed/)
    const restored = new IntegratedGameServer(definitions, levels)
    assert.deepEqual(restored.start({
        ...start,
        randomSeed: 999,
        initialMoney: 999,
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
    commandBoth({
        type: 'collectItemAt',
        itemId: snapshot.items.find(item => item.state === 'available')!.entityId,
    })
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
        const award = frame.items.find(item => item.typeId === 'pvz:sunflower')
        if (award) commandBoth({ type: 'collectItemAt', itemId: award.entityId })
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
        () => parseServerSaveSnapshotV2({ ...saved, mods: [...saved.mods, saved.mods[0]] }),
        /duplicate IDs/,
    )

    const savedEntityId = saved.entities[0]?.entityId
    if (savedEntityId !== undefined) {
        const duplicateWaveZombie = {
            ...saved,
            wave: { ...saved.wave, zombieIds: [savedEntityId, savedEntityId] },
        }
        assert.throws(
            () => new IntegratedGameServer(definitions, levels).restore(duplicateWaveZombie),
            /must be unique/,
        )
    }
    const plantId = saved.entities.find(entity => entity.plant)?.entityId
    if (plantId !== undefined) {
        const nonZombieWaveEntity = {
            ...saved,
            wave: { ...saved.wave, zombieIds: [plantId] },
        }
        assert.throws(
            () => new IntegratedGameServer(definitions, levels).restore(nonZombieWaveEntity),
            /is invalid/,
        )
    }
    const missingWaveEntity = {
        ...saved,
        wave: { ...saved.wave, zombieIds: [saved.allocator.nextEntity] },
    }
    assert.throws(
        () => new IntegratedGameServer(definitions, levels).restore(missingWaveEntity),
        /is invalid/,
    )
    const invalidMower = {
        ...saved,
        entities: saved.entities.map((entity, index) => index === 0
            ? {
                ...entity,
                plant: {
                    typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0,
                    health: 300, maxHealth: 300, eatenFlashCounter: 0,
                },
                plantAttack: { readyAtTick: 0 },
            }
            : entity),
    }
    assert.throws(
        () => new IntegratedGameServer(definitions, levels).restore(invalidMower),
        /exactly one domain component/,
    )
})
