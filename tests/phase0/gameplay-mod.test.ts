import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { GameplaySystemMods, type GameplaySystemEnhancer } from '@/server/GameplaySystemMods'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from '../server/run-command'

interface GameplayDefinition {
    id: string
    kind: string
}

interface GameplayModule {
    register(api: {
        registerDefinition(definition: GameplayDefinition): void
        enhanceSystem(
            targetId: string,
            enhancer: (context: any, next: () => void, bindings: any) => void,
        ): void
    }): void | Promise<void>
}

test('phase0 gameplay module registers without Cocos', async () => {
    const modRoot = resolve('spikes/phase0/example-mod')
    const manifest = JSON.parse(await readFile(resolve(modRoot, 'mod.json'), 'utf8')) as unknown

    assert.deepEqual(manifest, {
        schemaVersion: 1,
        id: 'phase0:example',
        version: '1.0.0',
        apiVersion: 1,
        contentHash: 'phase0-example-v3',
        dependencies: [],
        gameplay: {
            nodeModule: 'gameplay/node/index.js',
            cocosModule: 'gameplay/cocos/index.js',
        },
        client: {
            module: 'client/cocos/index.js',
            bundle: 'client/cocos-bundle',
        },
    })

    const gameplay = await import(pathToFileURL(resolve(modRoot, 'gameplay/node/index.js')).href) as GameplayModule
    assert.equal(typeof gameplay.register, 'function')
    assert.match(
        await readFile(resolve(modRoot, 'gameplay/cocos/index.js'), 'utf8'),
        /^System\.register\(\[\],/,
    )

    const definitions = new Map<string, GameplayDefinition>()
    let enhanced = false
    let registeredEnhancer: GameplaySystemEnhancer | undefined
    const position = { name: 'pvz:position' }
    const plant = { name: 'pvz:plant' }
    const plantAttack = { name: 'pvz:plant_attack' }
    const attack = { readyAtTick: 150, fireAtTick: 32 as number | undefined }
    const events: Array<{ type: string, data: Record<string, unknown> }> = []
    const world = {
        query: () => [1],
        get: (_entity: number, component: typeof position) => {
            if (component === plant) return { typeId: 'pvz:peashooter' }
            if (component === plantAttack) return attack
            return { x: 0, y: 0, row: 0 }
        },
    }
    await gameplay.register({
        registerDefinition(definition) {
            assert.match(definition.id, /^[a-z0-9-]+:[a-z0-9-]+$/)
            assert.equal(definitions.has(definition.id), false)
            definitions.set(definition.id, definition)
        },
        enhanceSystem(targetId, enhancer) {
            assert.equal(targetId, 'pvz:peashooter')
            registeredEnhancer = enhancer as GameplaySystemEnhancer
            const bindings = {
                definitions: {
                    plants: {
                        'pvz:peashooter': {
                            shooter: { cadenceTicks: 150, windupTicks: 33 },
                        },
                    },
                },
                components: { position, plant, plantAttack },
                emitEvent: (_world: unknown, type: string, data: Record<string, unknown>) =>
                    events.push({ type, data }),
            }
            enhancer({ tick: 32, world }, () => {
                enhanced = true
                attack.fireAtTick = undefined
            }, bindings)
            assert.equal(attack.fireAtTick, 58)

            enhancer({ tick: 58, world }, () => { attack.fireAtTick = undefined }, bindings)
        },
    })

    assert.deepEqual(definitions.get('phase0:sunflower'), {
        id: 'phase0:sunflower',
        kind: 'plant',
    })
    assert.equal(enhanced, true)
    assert.deepEqual(events, [{ type: 'plantFiring', data: { plantId: 1 } }])

    const gameplayDefinitions = parseGameplayDefinitionsV2(JSON.parse(
        await readFile('tools/content/pvz-base/gameplay/definitions.json', 'utf8'),
    ))
    const gameplayLevels = parseGameplayLevelsV2(JSON.parse(
        await readFile('tools/content/pvz-base/gameplay/levels.json', 'utf8'),
    ), gameplayDefinitions)
    const systemMods = new GameplaySystemMods()
    systemMods.forMod('phase0:example').enhanceSystem('pvz:peashooter', registeredEnhancer!)
    const packet: StartSessionPacket = {
        protocolVersion: 1,
        sequence: 1,
        type: 'startSession',
        levelId: 'pvz:adventure-1-1',
        randomSeed: 1,
        initialMoney: 0,
        firstAdventure: true,
        mods: [{ id: 'phase0:example', version: '1.0.0', contentHash: 'phase0-example-v3' }],
    }
    const server = new IntegratedGameServer(gameplayDefinitions, gameplayLevels, systemMods)
    server.start(packet)
    runCommand(server, { type: 'completeIntro' })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    ;(server as unknown as { spawnZombie(typeId: string, row: number, x: number): number })
        .spawnZombie('pvz:normal', 2, 700)
    server.drainEvents()
    while (server.save().gameplayTick < 107) server.tick()
    assert.deepEqual(server.drainEvents().map(event => event.type), ['plantFiring', 'projectileFired', 'plantFiring'])

    const saved = server.save()
    const restoredMods = new GameplaySystemMods()
    restoredMods.forMod('phase0:example').enhanceSystem('pvz:peashooter', registeredEnhancer!)
    const restored = new IntegratedGameServer(gameplayDefinitions, gameplayLevels, restoredMods)
    restored.start({ ...packet, save: saved as unknown as JsonValue })
    while (restored.save().gameplayTick < 133) restored.tick()
    assert.deepEqual(restored.drainEvents().map(event => event.type), ['projectileFired'])
})
