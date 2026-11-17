import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/server/state/World'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { Session } from '@/server/session/session'
import { planting } from '@/server/seeds/planting'
import { whackAZombieRule } from '@/server/rules/whackAZombie'
import { GRAVE, graveAt } from '@/shared/content/graves'
import { parseGameplayDefinitions, parseGameplayLevels, type LevelDefinition, type PlantSeedDefinition } from '@/shared/content/gameplay'
import { canShovel, cellOutOfPlay, cellPlant, holdsCell, type LevelPlantingRule, type PlantingLawn, plantingRefusal, snapshotLawn } from '@/shared/content/planting'
import type { StartSessionPacket, WorldSnapshot } from '@/shared/protocol'
import { adventureSeeds } from './adventure-seeds'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const { plants, seeds } = definitions
/** A day lawn playing rows 1-3, with a red line after column 4. */
const level: LevelDefinition = { ...levels.levels['pvz:adventure-1-4'], activeRows: [1, 2, 3], plantingLine: { column: 4 } }

/** A lawn of the given plants and graves, as a snapshot lists them. */
function lawn(lawnPlants: WorldSnapshot['plants'] = [], graves: Array<{ row: number, column: number, team?: 'plants' }> = [], rule?: LevelPlantingRule): PlantingLawn {
    const gridItems = graves.map((grave, index) => ({ entityId: 100 + index, typeId: GRAVE as typeof GRAVE, variant: 0, riseDelay: 0, offsetX: 0, offsetY: 0, ...grave }))
    return snapshotLawn(definitions, level, { plants: lawnPlants, gridItems }, rule)
}
function plant(typeId: string, row: number, column: number, more: Partial<WorldSnapshot['plants'][number]> = {}): WorldSnapshot['plants'][number] {
    return { entityId: row * 10 + column, typeId, x: 0, y: 0, row, column, health: 300, maxHealth: 300, ...more }
}

test('a plant holds its own cell only, while it is one that occupies its cell and no mower has crushed it', () => {
    const nut = plant('pvz:wallnut', 2, 3)
    assert.equal(holdsCell(plants, nut, 2, 3), true)
    assert.equal(holdsCell(plants, nut, 2, 4), false)
    assert.equal(holdsCell(plants, nut, 1, 3), false)
    assert.equal(holdsCell(plants, plant('pvz:bowling-wallnut', 2, 3), 2, 3), false, 'a rolling nut keeps its column but holds no cell')
    assert.equal(holdsCell(plants, plant('pvz:wallnut', 2, 3, { mowered: { time: 0 } }), 2, 3), false, 'a mowed plant is no plant any more')
    const lawnPlants = [plant('pvz:bowling-wallnut', 2, 3), plant('pvz:wallnut', 2, 3, { mowered: { time: 4 } }), nut]
    assert.equal(cellPlant(plants, lawnPlants, 2, 3), nut)
    assert.equal(cellPlant(plants, lawnPlants, 2, 2), undefined)
})

test('the shovel digs up neither a grave buster nor a plant on the zombies’ side', () => {
    assert.equal(canShovel(plants, { typeId: 'pvz:sunflower' }), true)
    assert.equal(canShovel(plants, { typeId: 'pvz:sunflower', team: 'zombies' }), false)
    assert.equal(canShovel(plants, { typeId: 'pvz:gravebuster' }), false)
})

test('graveAt finds the grave of a cell among the things of the cells, as they are given', () => {
    const items = [{ entity: 7, typeId: 'example:crater', row: 1, column: 1 }, { entity: 8, typeId: GRAVE, row: 1, column: 1 }]
    assert.equal(graveAt(items, 1, 1)?.entity, 8, 'only a grave, and the item itself')
    assert.equal(graveAt(items, 1, 2), undefined)
    assert.equal(graveAt(undefined, 1, 1), undefined)
})

test('Board::CanPlantAt: where each kind of seed may go and why it may not', () => {
    const peashooter = seeds['pvz:peashooter'], buster = seeds['pvz:gravebuster'], zombie = seeds['pvz:normal'], grave = seeds['pvz:grave']
    assert.ok(peashooter.kind === 'plant' && buster.kind === 'plant' && zombie.kind === 'zombie' && grave?.kind === 'grave')
    const empty = lawn()
    assert.equal(plantingRefusal(empty, peashooter, 'plants', 0, 1), 'row-not-active', 'a row the level does not play')
    assert.equal(plantingRefusal(empty, peashooter, 'plants', 1.5, 1), 'row-not-active')
    assert.equal(plantingRefusal(empty, peashooter, 'plants', 1, 9), 'column-out-of-range')
    assert.equal(cellOutOfPlay(empty, 1, -1), 'column-out-of-range')
    assert.equal(plantingRefusal(empty, peashooter, 'plants', 1, 4), undefined)
    assert.equal(plantingRefusal(empty, peashooter, 'plants', 1, 5), 'past-line')
    assert.equal(plantingRefusal(empty, zombie, 'zombies', 1, 5), undefined, 'the line holds back plants only')

    const taken = lawn([plant('pvz:wallnut', 2, 2)], [{ row: 3, column: 1 }, { row: 3, column: 2, team: 'plants' }])
    assert.equal(plantingRefusal(taken, peashooter, 'plants', 2, 2), 'cell-occupied')
    assert.equal(plantingRefusal(taken, peashooter, 'plants', 3, 1), 'not-on-grave')
    assert.equal(plantingRefusal(taken, buster, 'plants', 2, 1), 'cell-needs-grave')
    assert.equal(plantingRefusal(taken, buster, 'plants', 2, 2), 'cell-occupied')
    assert.equal(plantingRefusal(taken, buster, 'plants', 3, 1), undefined, 'a grave buster eats a grave of the other side')
    assert.equal(plantingRefusal(taken, buster, 'plants', 3, 2), 'cell-has-own-grave')
    assert.equal(plantingRefusal(taken, buster, 'zombies', 3, 2), undefined)
    for (const [row, column] of [[2, 2], [3, 1], [2, 1]]) {
        assert.equal(plantingRefusal(taken, zombie, 'zombies', row, column), undefined, 'a zombie goes in whatever stands there')
    }
    assert.equal(plantingRefusal(taken, grave, 'zombies', 2, 2), undefined, 'a grave goes on a plant')
    assert.equal(plantingRefusal(taken, grave, 'zombies', 3, 1), 'cell-has-grave')

    // The rule's share comes first, for plant seeds only, and reads the same lawn.
    const asked: Array<[PlantingLawn, PlantSeedDefinition, number, number]> = []
    const closed = lawn([plant('pvz:wallnut', 2, 2)], [], { canPlantAt: (...args) => { asked.push(args); return args[3] !== 2 } })
    assert.equal(plantingRefusal(closed, peashooter, 'plants', 2, 2), 'rule-closed')
    assert.equal(plantingRefusal(closed, peashooter, 'plants', 2, 5), 'past-line')
    assert.equal(plantingRefusal(closed, zombie, 'zombies', 2, 2), undefined)
    assert.deepEqual(asked.map(([lawn, seed, row, column]) => [lawn === closed, seed.id, row, column]), [[true, 'pvz:peashooter', 2, 2], [true, 'pvz:peashooter', 2, 5]])
    assert.equal(asked[0][0].plantAt(2, 2)?.typeId, 'pvz:wallnut')
})

const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-4',
    randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-4') }
const session = (server: IntegratedGameServer) => (server as unknown as { session: Session }).session
function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    assert.equal((server.drainCommandResults()[0].debug as { ok: boolean }).ok, true, command)
}

test('the planting preview and the server agree on a cell whose plant a mower is crushing: it is free', () => {
    // A mower crushes the zombies' plants; the crushed one stays in the snapshot while it is squashed.
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    for (const command of ['/sun set 500', '/cooldown', '/seed 1 peashooter', '/plant wallnut 3 2 zombies']) debug(server, command)
    const preview = () => plantingRefusal(snapshotLawn(definitions, levels.levels[options.levelId], server.snapshot()),
        seeds['pvz:peashooter'], 'plants', 2, 1)
    assert.equal(preview(), 'cell-occupied')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter', slot: 0 }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), 'cell-occupied')

    debug(server, '/lawnmower trigger 3')
    for (let tick = 0; tick < 500 && !server.snapshot().plants.some(plant => plant.mowered); tick++) server.tick()
    assert.ok(server.snapshot().plants.some(plant => plant.typeId === 'pvz:wallnut' && plant.mowered), 'the snapshot still shows it, squashed')
    assert.equal(preview(), undefined, 'the preview offers the cell')
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined, 'and the server plants there')
})

test('Whack-a-Zombie’s graves kill the plant holding their cell, and a rolling nut rolls on', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, levelId: 'pvz:adventure-2-5', ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-5') })
    const game = session(server), world: World = game.world, whack = levels.levels['pvz:adventure-2-5']
    // Every cell the graves may take holds a plant and a rolling nut planted in it.
    for (const row of whack.activeRows) {
        for (let column = 3; column < definitions.boards[whack.board].columns; column++) {
            planting.createPlant(game, 'pvz:peashooter', row, column)
            planting.createPlant(game, 'pvz:bowling-wallnut', row, column)
        }
    }
    const before = server.snapshot().plants
    whackAZombieRule.initialize!(world, definitions)
    const after = server.snapshot()
    assert.equal(after.gridItems!.length, 9)
    const graved = (row: number, column: number) => after.gridItems!.some(grave => grave.row === row && grave.column === column)
    assert.deepEqual(after.plants.map(plant => plant.entityId),
        before.filter(plant => plant.typeId === 'pvz:bowling-wallnut' || !graved(plant.row, plant.column)).map(plant => plant.entityId))
})
