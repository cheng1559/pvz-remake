import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import { Schedule,World } from '@/server/state/World'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import {
EconomyStateResource,
LevelStateResource,
RandomResource,
SeedBankResource,
} from '@/server/state/components'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { EventQueueResource,createEventQueue } from '@/server/state/events'
import { createItemSystem } from '@/server/items/items'
import { createLevelProgressSystem,initializeLevel } from '@/server/level/level'
import { TutorialResource,WaveResource } from '@/server/state/levelState'
import { createWaveSystem } from '@/server/level/waves'
import { TutorialsResource } from '@/server/tutorials'
import { damageZombie, flattenZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { createZombieSystem } from '@/server/zombies/system'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'
import { withZombieTypes } from '../zombieTypes'
import { newPlant, withPlantTypes } from '../plantTypes'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)

function setup() {
    const world = withPlantTypes(withZombieTypes(new World(), definitions), definitions)
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
    world.resources.set(EconomyStateResource, { sun: definition.startingSun, money: 0, pendingSunSpend: 0, packetUpgrades: 0, ownedUpgrades: 0 })
    world.resources.set(SeedBankResource, { selection: { mode: 'none' }, packets: [{ seedId: 'pvz:peashooter', readyAtTick: 0, cooldownTotal: 0 }] })
    const gameplay = new GameplayRegistry()
    gameplay.freeze(definitions, levels)
    world.resources.set(TutorialsResource, gameplay.tutorials)
    initializeLevel(world, true, definitions, gameplay.levelRules)
    const schedule = new Schedule()
    schedule.add('tutorial', createLevelProgressSystem(definitions))
    schedule.add('spawn', createWaveSystem(definitions))
    return { world, schedule }
}

function addPlant(world: World, column: number) {
    world.insert(world.plants, newPlant(world, 'pvz:peashooter', { id: world.createEntity(), position: { x: 40 + column * 80, y: 280, row: 2 }, column }))
}

test('level one schedules tutorial sun and the first wave from planted Peashooters', () => {
    const { world, schedule } = setup()
    addPlant(world, 0)
    schedule.run(world, 1)

    schedule.run(world, 400)
    assert.equal([...world.items].length, 0)
    schedule.run(world, 401)
    assert.equal([...world.items].length, 1)
    assert.equal(world.resources.get(TutorialResource).step, 'collect-first-sun')

    addPlant(world, 1)
    schedule.run(world, 402)
    assert.equal(world.resources.get(WaveResource).nextWaveAtTick, 501)
    schedule.run(world, 500)
    assert.equal([...world.zombies].length, 0)
    schedule.run(world, 501)
    assert.equal([...world.zombies].length, 1)
})



test('level one drops its award from the last effective zombie before its corpse disappears', () => {
    const { world } = setup()
    world.resources.get(WaveResource).index = world.resources.get(WaveResource).plan.length
    const zombieId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    world.zombies.get(zombieId)!.health = 0
    const headless = spawnZombie(world, definitions, 'pvz:normal', 2, 100, 250)
    world.zombies.get(headless)!.hasHead = false
    const mowered = spawnZombie(world, definitions, 'pvz:normal', 2, 500, 250)
    flattenZombie(world, definitions, world.zombies.get(mowered)!)
    const schedule = new Schedule()
    schedule.add('spawn', createWaveSystem(definitions))
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('item', createItemSystem(definitions))

    schedule.run(world, 1)
    assert.equal([...world.items].length, 0)
    schedule.run(world, 2)
    const [award] = world.items, awardPosition = award.position
    assert.equal(world.hasEntity(zombieId), true)
    assert.equal(world.hasEntity(headless), false, 'award drop removes active headless zombies without starting a death animation')
    assert.equal(world.zombies.get(zombieId)!.state, 'dying')
    assert.equal(world.zombies.get(mowered)!.state, 'mowered', 'award drop preserves mowered animation')
    assert.equal(awardPosition.x, 750)
    assert.ok(awardPosition.y >= 302.5 && awardPosition.y < 304.5)
    assert.equal(award.width, 50)
    assert.ok(award.velocityX >= -0.8 && award.velocityX <= -0.4)
    assert.ok(award.velocityY >= -4.85 && award.velocityY < -2.85)
    assert.ok(award.groundY >= 322.5 && award.groundY <= 341.5, 'awards land 30 above the coin ground')
    assert.equal(award.landed, undefined, 'the pickup arrow waits for the award to land')
    for (let tick = 3; tick < 200 && !award.landed; tick++) schedule.run(world, tick)
    assert.deepEqual([award.landed, awardPosition.y], [true, award.groundY])
    assert.equal(world.resources.get(LevelStateResource).result, 'playing')
})

test('the last zombie vanishes when losing its head drops the award, while burned corpses stay', () => {
    const { world } = setup()
    world.resources.get(WaveResource).index = world.resources.get(WaveResource).plan.length
    const last = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    const burned = spawnZombie(world, definitions, 'pvz:normal', 1, 400, 250)
    Object.assign(world.zombies.get(burned)!, { hasHead: false, state: 'burned', deathTicksRemaining: 100 })

    damageZombie(world, definitions, last, world.zombies.get(last)!.health - 1)

    assert.equal([...world.items].length, 1)
    assert.equal(world.hasEntity(last), false, 'Board::RemoveAllZombies also removes the zombie that dropped the award')
    assert.equal(world.zombies.get(burned)!.state, 'burned', 'award drop preserves burned animation')
})
