import { withFixedBanks } from '../fixedBankLevels'
import { type World } from '@/ecs'
import { PlantComponent, PositionComponent, ZombieComponent } from '@/server/state/components'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { spawnZombie } from '@/server/zombies/spawn'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'
import { parseServerPacket,type JsonValue,type StartSessionPacket } from '@/shared/protocol'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-1-5', randomSeed: 12345, initialMoney: 0, firstAdventure: true, mods: [] }

function restore(server: IntegratedGameServer): void {
    server.start({ ...options, save: server.save() as unknown as JsonValue })
}
function begin(): IntegratedGameServer {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, firstAdventure: false })
    while (server.snapshot().extensions['pvz:dialog']) runCommand(server, { type: 'advanceDialog' })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}
/** A game past 1-5's intro with a wall-nut just put down in row 2 to roll. */
function rollNut() {
    const server = begin()
    runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
    runCommand(server, { type: 'placePlant', row: 2, column: 1 })
    const world = (server as unknown as { session: { world: World } }).session.world
    return { server, world, plant: server.snapshot().plants[0] }
}


test('1-5 requires Dave, three shovel digs and the second dialogue before gameplay, and restores each stage', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options)
    assert.deepEqual(server.snapshot().plants.map(plant => [plant.row, plant.column]), [[1, 5], [2, 7], [3, 6]])
    assert.equal(runCommand(server, { type: 'completeIntro' }), 'intro-not-complete')
    for (let index = 2400; index <= 2406; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        restore(server)
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    assert.equal(server.snapshot().tutorial.step, 'shovel-pickup')
    for (const [row, column] of [[1, 5], [2, 7], [3, 6]]) {
        assert.equal(runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' }), undefined)
        restore(server)
        assert.deepEqual(server.snapshot().cursor, { mode: 'tool', toolId: 'pvz:shovel' })
        assert.equal(runCommand(server, { type: 'useToolAt', row, column }), undefined)
    }
    assert.equal(server.snapshot().plants.length, 0)
    for (let index = 2410; index <= 2415; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        runCommand(server, { type: 'advanceDialog' })
    }
    assert.equal(server.snapshot().tutorial.step, 'complete')
    restore(server)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    assert.equal(server.snapshot().wave.countdown, 200)
    assert.deepEqual(server.snapshot().conveyorPackets, [{ id: 1, seedId: 'pvz:bowling-wallnut', x: 515, selected: false, availability: {} }])
    assert.equal(server.save().tutorial.sunAtTick, undefined)
    assert.doesNotThrow(() => parseServerPacket({ type: 'frame', protocolVersion: 1, serverTick: server.snapshot().tick, acknowledgedSequence: 1, snapshot: server.snapshot(), events: [] }))
})

test('conveyor packets have distinct identities, cost no sun, obey the line and create independent bowling plants', () => {
    const server = begin()
    for (let tick = 0; tick < 4; tick++) server.tick()
    assert.equal(server.snapshot().conveyorPackets[0].x, 514)
    assert.equal(runCommand(server, { type: 'selectConveyorPacket', packetId: 1 }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 3 }), 'column-out-of-range')
    assert.equal(server.snapshot().conveyorPackets.length, 1)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    assert.equal(server.snapshot().sun, 0)
    assert.equal(server.snapshot().conveyorPackets.length, 0)
    assert.equal(server.snapshot().plants[0].typeId, 'pvz:bowling-wallnut')
    assert.equal(definitions.plants['pvz:wallnut'].behavior, undefined)
    assert.equal(definitions.plants['pvz:explodenut'].behavior, undefined)
    while (server.snapshot().gameplayTick < 400) server.tick()
    assert.equal(server.snapshot().conveyorPackets[0].id, 2)
    assert.equal(server.snapshot().items.length, 0, 'bowling does not spawn sky sun')
})

test('seed and shovel selection are exclusive, including after save and on a non-bowling level', () => {
    const server = begin()
    runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' })
    runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
    assert.equal(server.snapshot().cursor.mode, 'seed')
    assert.deepEqual(server.save().seedBank.selection, { mode: 'conveyor', packetId: 1 })
    restore(server)
    assert.equal(server.snapshot().cursor.mode, 'seed')
    runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' })
    assert.equal(server.snapshot().cursor.mode, 'tool')
    assert.deepEqual(server.save().seedBank.selection, { mode: 'tool', toolId: 'pvz:shovel' })

    // A replay has the shovel on every level (CutScene::ShowShovel).
    const config = withFixedBanks(source('levels'))
    const normal = new IntegratedGameServer(definitions, parseGameplayLevels(config, definitions))
    normal.start({ ...options, levelId: 'pvz:adventure-1-1', firstAdventure: false })
    runCommand(normal, { type: 'completeIntro' })
    assert.equal(runCommand(normal, { type: 'selectTool', toolId: 'pvz:shovel' }), undefined)
    assert.equal(runCommand(normal, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(normal.snapshot().cursor.mode, 'seed')
    assert.deepEqual(normal.save().seedBank.selection, { mode: 'seed', slot: 0 })
    runCommand(normal, { type: 'placePlant', row: 2, column: 0 })
    runCommand(normal, { type: 'selectTool', toolId: 'pvz:shovel' })
    assert.equal(runCommand(normal, { type: 'useToolAt', row: 2, column: 0 }), undefined)
    assert.equal(normal.snapshot().plants.length, 0)
})







test('a bowling plant hits, ricochets and resumes the same motion after save; an explosive one burns nearby zombies', () => {
    for (const explosive of [false, true]) {
        const server = begin()
        const saved = server.save()
        saved.seedBank.conveyor!.packets[0].seedId = explosive ? 'pvz:bowling-explodenut' : 'pvz:bowling-wallnut'
        server.start({ ...options, save: saved as unknown as JsonValue })
        runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
        runCommand(server, { type: 'placePlant', row: 2, column: 1 })
        const world = (server as unknown as { session: { world: World } }).session.world
        const plant = server.snapshot().plants[0]
        const id = spawnZombie(world, definitions, 'pvz:normal', 2, plant.x + 20, plant.y - 30)
        const events = server.drainEvents()
        server.tick()
        events.push(...server.drainEvents())
        if (explosive) {
            assert.equal(server.snapshot().plants.length, 0)
            assert.ok(events.some(event => event.type === 'plantExploded'))
            assert.ok(!world.get(id, ZombieComponent) || world.get(id, ZombieComponent)!.health === 0)
        } else {
            assert.equal(world.get(id, ZombieComponent)!.health, 0)
            assert.notEqual(server.snapshot().plants[0].row, 2)
            assert.deepEqual(events.find(event => event.type === 'bowlingImpact')!.data, {
                entityId: id, typeId: 'pvz:normal', helm: false, shield: false, plantId: plant.entityId, plantTypeId: 'pvz:bowling-wallnut', hits: 1,
            })
        }
        const restored = new IntegratedGameServer(definitions, levels)
        restored.start({ ...options, save: server.save() as unknown as JsonValue })
        for (let tick = 0; tick < 40; tick++) assert.deepEqual(restored.tick(), server.tick())
    }
})

test('one wall-nut hitting five zombies grants Roll Some Heads, except on a first Adventure', () => {
    for (const firstAdventure of [false, true]) {
        const server = begin()
        const saved = server.save()
        saved.tutorial.firstAdventure = firstAdventure
        server.start({ ...options, save: saved as unknown as JsonValue })
        runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
        runCommand(server, { type: 'placePlant', row: 2, column: 1 })
        const world = (server as unknown as { session: { world: World } }).session.world
        const events = server.drainEvents()
        for (let hit = 0; hit < 5; hit++) {
            const plant = server.snapshot().plants[0]
            // Ahead of the nut in the row it is heading for, where it lines up with the row again.
            spawnZombie(world, definitions, 'pvz:normal', plant.row, plant.x + 80, plant.y - 30)
            let impacts = events.filter(event => event.type === 'bowlingImpact').length
            for (let tick = 0; tick < 200 && impacts === hit; tick++) {
                server.tick()
                events.push(...server.drainEvents())
                impacts = events.filter(event => event.type === 'bowlingImpact').length
            }
            assert.equal(impacts, hit + 1)
        }
        assert.deepEqual(events.filter(event => event.type === 'achievementEarned').map(event => event.data.id),
            firstAdventure ? [] : ['pvz:roll-some-heads'])
    }
})

test('a planting line holds on a level without the bowling rule', () => {
    const lined = { ...levels, levels: { ...levels.levels, 'pvz:adventure-1-4': { ...levels.levels['pvz:adventure-1-4'], plantingLine: { column: 2 } } } }
    const server = new IntegratedGameServer(definitions, lined)
    server.start({ ...options, levelId: 'pvz:adventure-1-4', firstAdventure: false, ownedSeeds: ['pvz:peashooter'] })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    server.enqueueDebugCommand(1, '/sun set 500')
    server.processBoundaryCommands()
    server.drainCommandResults()
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 3 }), 'column-out-of-range')
    assert.ok(server.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_NOT_PASSED_LINE'))
    // The refused seed stays in hand.
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 2 }), undefined)
})

test('a pole vaulter vaults over a rolling nut from afar, where it stands', () => {
    const { server, world, plant } = rollNut()
    // Zombie::ZombieInitialize on Wall-nut Bowling: the vault rect starts 229 ahead, against the nut's GetPlantRect.
    const far = spawnZombie(world, definitions, 'pvz:pole_vaulter', 2, plant.x + 290, plant.y - 30)
    server.tick()
    assert.equal(world.get(far, ZombieComponent)!.state, 'walking')
    const near = spawnZombie(world, definitions, 'pvz:pole_vaulter', 2, server.snapshot().plants[0].x + 270, plant.y - 30)
    const x = server.snapshot().zombies.find(zombie => zombie.entityId === near)!.x
    server.tick()
    const zombie = world.get(near, ZombieComponent)!
    assert.equal(zombie.state, 'vaulting')
    assert.equal(zombie.speedPerTick, 0)
    assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === near)!.x, x)
})

test('no zombie bites a rolling nut', () => {
    const { server, world, plant } = rollNut()
    // The nut is bouncing into the row, so it strikes nothing yet, while a zombie overlaps it.
    world.get(plant.entityId, PositionComponent)!.y += 40
    ;(world.get(plant.entityId, PlantComponent)!.behaviorState as { direction: number }).direction = -1
    const id = spawnZombie(world, definitions, 'pvz:normal', 2, plant.x + 24, plant.y - 30)
    server.tick()
    const zombie = world.get(id, ZombieComponent)!
    assert.equal(zombie.health, zombie.maxHealth)
    assert.equal(zombie.state, 'walking')
})

test('a bowled nut takes 400 off a shield alone, but breaks a screen door through once it has bounced', () => {
    for (const [typeId, bounced] of [['pvz:newspaper', false], ['pvz:newspaper', true], ['pvz:screendoor', false], ['pvz:screendoor', true]] as const) {
        const { server, world, plant } = rollNut()
        // Plant::UpdateBowling checks mState != STATE_NOTREADY: a nut that has bounced rolls on a slant.
        if (bounced) (world.get(plant.entityId, PlantComponent)!.behaviorState as { direction: number }).direction = 1
        const id = spawnZombie(world, definitions, typeId, 2, plant.x + 20, plant.y - 30)
        const shield = definitions.zombies[typeId].shield!.health
        server.drainEvents()
        server.tick()
        const zombie = world.get(id, ZombieComponent)!
        const impact = server.drainEvents().find(event => event.type === 'bowlingImpact')!
        assert.equal(impact.data.shield, true, `${typeId} ${bounced}`)
        if (typeId === 'pvz:screendoor' && bounced) {
            assert.equal(zombie.shieldHealth, 0)
            assert.equal(zombie.health, 0)
        } else {
            assert.equal(zombie.shieldHealth, Math.max(0, shield - 400), `${typeId} ${bounced}`)
            assert.equal(zombie.health, zombie.maxHealth, `${typeId} ${bounced}`)
        }
    }
})
