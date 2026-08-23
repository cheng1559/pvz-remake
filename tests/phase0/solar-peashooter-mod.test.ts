import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { GameplaySystemMods, type GameplaySystemEnhancer } from '@/server/GameplaySystemMods'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { ItemComponent } from '@/server/levelOne'
import type { World } from '@/ecs'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { parseModManifest } from '@/shared/mod'
import { runCommand } from '../server/run-command'

interface GameplayModule {
    register(api: {
        registerDefinition(value: { id: string; kind: string }): void
        enhanceSystem(targetId: string, enhancer: unknown): void
    }): void | Promise<void>
}

test('solar Peashooter Mod produces one small sun when a pea hits a zombie', async () => {
    const root = resolve('spikes/phase0/solar-peashooter-mod')
    const manifest = parseModManifest(JSON.parse(await readFile(resolve(root, 'mod.json'), 'utf8')))
    const module = await import(pathToFileURL(resolve(root, manifest.gameplay!.nodeModule)).href) as GameplayModule
    let enhancer: GameplaySystemEnhancer | undefined
    await module.register({
        registerDefinition: () => {},
        enhanceSystem(targetId, value) {
            assert.equal(targetId, 'pvz:projectile')
            assert.equal(typeof value, 'function')
            enhancer = value as GameplaySystemEnhancer
        },
    })

    const definitions = parseGameplayDefinitionsV2(JSON.parse(
        await readFile('tools/content/pvz-base/gameplay/definitions.json', 'utf8'),
    ))
    const levels = parseGameplayLevelsV2(JSON.parse(
        await readFile('tools/content/pvz-base/gameplay/levels.json', 'utf8'),
    ), definitions)
    const mods = new GameplaySystemMods()
    mods.forMod(manifest.id).enhanceSystem('pvz:projectile', enhancer!)
    const packet: StartSessionPacket = {
        protocolVersion: 1,
        sequence: 1,
        type: 'startSession',
        levelId: 'pvz:adventure-1-1',
        randomSeed: 1,
        initialMoney: 0,
        firstAdventure: true,
        mods: [{ id: manifest.id, version: manifest.version, contentHash: manifest.contentHash }],
    }
    const server = new IntegratedGameServer(definitions, levels, mods)
    server.start(packet)
    runCommand(server, { type: 'completeIntro' })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    ;(server as unknown as { spawnZombie(typeId: string, row: number, x: number): number })
        .spawnZombie('pvz:normal', 2, 400)
    server.drainEvents()

    while (server.save().gameplayTick < 107) server.tick()

    assert.equal(server.snapshot().items.length, 0)
    assert.deepEqual(server.drainEvents().map(event => event.type), [
        'plantFiring',
        'projectileFired',
    ])
    while (server.snapshot().items.length === 0 && server.save().gameplayTick < 400) server.tick()

    assert.deepEqual(server.snapshot().items.map(item => ({
        typeId: item.typeId,
        state: item.state,
    })), [{ typeId: 'pvz:sun', state: 'available' }])
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    const sunId = [...world.query(ItemComponent)][0]
    assert.deepEqual(world.get(sunId, ItemComponent), {
        typeId: 'pvz:sun',
        value: 15,
        state: 'available',
        velocityX: -0.35,
        velocityY: -2.35,
        accelerationY: 0.15,
        width: 60,
        groundY: 330,
        disappearTicks: 0,
        fadeTicks: 0,
        scale: 0.65,
        alpha: 255,
    })
    assert.deepEqual(server.drainEvents().map(event => event.type), [
        'projectileImpact',
        'itemSpawned',
    ])

    const restored = new IntegratedGameServer(definitions, levels, mods)
    restored.start({ ...packet, save: server.save() as unknown as JsonValue })
    assert.equal(restored.snapshot().items[0]?.typeId, 'pvz:sun')

    runCommand(server, { type: 'collectItemAt', itemId: sunId })
    server.tick()
    assert.equal(server.snapshot().items[0]?.scale, 0.65)
})
