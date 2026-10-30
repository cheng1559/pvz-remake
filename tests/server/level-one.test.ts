import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import { Schedule,World } from '@/ecs/index'
import {
EconomyStateResource,
LevelStateResource,
PlantComponent,
PositionComponent,
RandomResource,
SeedBankResource,
ZombieComponent,
} from '@/server/state/components'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { EventQueueResource,createEventQueue } from '@/server/state/events'
import { createItemSystem } from '@/server/level/items'
import { createLevelProgressSystem,initializeLevel } from '@/server/level/level'
import { ItemComponent,TutorialResource,WaveResource } from '@/server/state/levelState'
import { createWaveSystem } from '@/server/level/waves'
import { mowZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { createZombieSystem } from '@/server/zombies/system'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)

function setup() {
    const world = new World()
    const definition = levels.levels['pvz:adventure-1-1']
    world.resources.set(LevelStateResource, {
        id: 'pvz:adventure-1-1',
        definition,
        board: definitions.boards[definition.board],
        phase: 'gameplay',
        result: 'playing',
        paused: false,
    })
    world.resources.set(RandomResource, new DeterministicRng(1))
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(EconomyStateResource, { sun: definition.startingSun, money: 0, pendingSunSpend: 0 })
    world.resources.set(SeedBankResource, { selection: { mode: 'none' }, packets: definition.seedPackets.map(seedId => ({ seedId, readyAtTick: 0 })) })
    initializeLevel(world, true)
    const schedule = new Schedule()
    schedule.add('tutorial', createLevelProgressSystem(definitions))
    schedule.add('spawn', createWaveSystem(definitions))
    return { world, schedule }
}

function addPlant(world: World, column: number) {
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x: 40 + column * 80, y: 280, row: 2 })
    world.add(entity, PlantComponent, {
        typeId: 'pvz:peashooter',
        seedId: 'pvz:peashooter',
        column,
        health: 300,
        maxHealth: 300,
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
    })
}

test('level one schedules tutorial sun and the first wave from planted Peashooters', () => {
    const { world, schedule } = setup()
    addPlant(world, 0)
    schedule.run(world, 1)

    schedule.run(world, 400)
    assert.equal([...world.query(ItemComponent)].length, 0)
    schedule.run(world, 401)
    assert.equal([...world.query(ItemComponent)].length, 1)
    assert.equal(world.resources.get(TutorialResource).step, 'collect-first-sun')

    addPlant(world, 1)
    schedule.run(world, 402)
    assert.equal(world.resources.get(WaveResource).nextWaveAtTick, 501)
    schedule.run(world, 500)
    assert.equal([...world.query(ZombieComponent)].length, 0)
    schedule.run(world, 501)
    assert.equal([...world.query(ZombieComponent)].length, 1)
})



test('level one drops its award from the last effective zombie before its corpse disappears', () => {
    const { world } = setup()
    world.resources.get(WaveResource).index = levels.levels['pvz:adventure-1-1'].waves.length
    const zombieId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    world.get(zombieId, ZombieComponent)!.health = 0
    const headless = spawnZombie(world, definitions, 'pvz:normal', 2, 100, 250)
    world.get(headless, ZombieComponent)!.hasHead = false
    const mowered = spawnZombie(world, definitions, 'pvz:normal', 2, 500, 250)
    mowZombie(world.get(mowered, ZombieComponent)!)
    const schedule = new Schedule()
    schedule.add('spawn', createWaveSystem(definitions))
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('cleanup', createItemSystem(definitions))

    schedule.run(world, 1)
    assert.equal([...world.query(ItemComponent)].length, 0)
    schedule.run(world, 2)
    const awardId = [...world.query(ItemComponent)][0]
    const awardPosition = world.get(awardId, PositionComponent)!
    const award = world.get(awardId, ItemComponent)!
    assert.equal(world.hasEntity(zombieId), true)
    assert.equal(world.hasEntity(headless), false, 'award drop removes active headless zombies without starting a death animation')
    assert.equal(world.get(zombieId, ZombieComponent)!.state, 'dying')
    assert.equal(world.get(mowered, ZombieComponent)!.state, 'mowered', 'award drop preserves mowered animation')
    assert.equal(awardPosition.x, 750)
    assert.ok(awardPosition.y >= 302.5 && awardPosition.y < 304.5)
    assert.equal(award.width, 50)
    assert.ok(award.velocityX >= -0.8 && award.velocityX <= -0.4)
    assert.ok(award.velocityY >= -4.85 && award.velocityY < -2.85)
    assert.ok(award.groundY >= 352.5 && award.groundY <= 371.5)
    assert.equal(world.resources.get(LevelStateResource).result, 'playing')
})
