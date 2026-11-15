import { withProjectileMotions } from '../projectileMotions'
import { readGameplaySource } from '../../tools/mod/content'
import { withFixedBanks } from '../fixedBankLevels'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayLevels } from '@/shared/content/gameplay'
import assert from 'node:assert/strict'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import {
    LevelStateResource,
    MowedPlantComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    ZombieComponent,
} from '@/server/state/components'
import { createZombieSystem } from '@/server/zombies/system'
import { createMowerSystem, startMower } from '@/server/level/mower'
import { createProjectileSystem } from '@/server/combat/projectiles'
import { EventQueueResource, createEventQueue } from '@/server/state/events'
import { DeterministicRng } from '@/server/state/DeterministicRng'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const board = definitions.boards['pvz:day']
/** A level whose row 2 has a mower waiting. */
function mowerWorld(): World {
    const world = new World()
    world.resources.set(LevelStateResource, { id: 'pvz:test', definition: { lawnMower: 'pvz:lawnmower' } as never, board,
        phase: 'gameplay', result: 'playing', paused: false, mowerRows: [2] })
    world.resources.set(EventQueueResource, createEventQueue())
    withProjectileMotions(world).resources.set(RandomResource, new DeterministicRng(1))
    return world
}
/** The running mowers, which are projectiles. */
const mowers = (world: World) => [...world.query(PositionComponent, ProjectileComponent)]

test("a row's mower sets off as a mowing projectile when a zombie with its head reaches it, kills overlaps, and is gone off the board", () => {
    const world = mowerWorld()
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))

    schedule.run(world, 1)
    assert.deepEqual(world.resources.get(LevelStateResource).mowerRows, [2])
    assert.equal(mowers(world).length, 0)

    const zombie = world.createEntity()
    world.add(zombie, PositionComponent, { x: -10, y: 280, row: 2 })
    world.add(zombie, ZombieComponent, {
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
        hasHead: false, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, hasPole: false, enrageTicks: 0, riseTicks: 0,
    })
    schedule.run(world, 2)
    assert.deepEqual(world.resources.get(LevelStateResource).mowerRows, [2])
    assert.equal(world.get(zombie, ZombieComponent)!.state, 'walking')
    world.get(zombie, ZombieComponent)!.hasHead = true
    schedule.run(world, 3)
    assert.deepEqual(world.resources.get(LevelStateResource).mowerRows, [])
    const [mowerEntity] = mowers(world)
    assert.deepEqual(world.get(mowerEntity, ProjectileComponent)!.typeId, 'pvz:lawnmower')
    assert.equal(world.get(mowerEntity, PositionComponent)!.y, 303)
    assert.equal(world.hasEntity(zombie), true)
    assert.equal(world.get(zombie, ZombieComponent)!.state, 'mowered')
    assert.deepEqual(world.get(zombie, ZombieComponent)!.animations.body, { clip: 'mowered', time: 0, rate: 16 })
    assert.equal(world.get(mowerEntity, ProjectileComponent)!.chompCounter, 24)
    assert.equal(world.get(mowerEntity, PositionComponent)!.x, -19.996272)

    const secondZombie = world.createEntity()
    world.add(secondZombie, PositionComponent, { x: -10, y: 280, row: 2 })
    world.add(secondZombie, ZombieComponent, {
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
        hasHead: true, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, hasPole: false, enrageTicks: 0, riseTicks: 0,
    })
    schedule.run(world, 4)
    assert.equal(world.hasEntity(secondZombie), true)
    assert.equal(world.get(secondZombie, ZombieComponent)!.state, 'mowered')
    assert.equal(
        world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieMowered').length,
        2,
    )

    assert.equal(world.get(mowerEntity, ProjectileComponent)!.chompCounter, 50)
    for (let tick = 5; tick <= 28; tick++) schedule.run(world, tick)
    // Half of the driver's 8 frames, 25 ticks into its 50.
    assert.ok(Math.abs(world.get(zombie, ZombieComponent)!.animations.body.time - 4) < 1e-9)
    for (let tick = 29; tick <= 52; tick++) schedule.run(world, tick)
    assert.equal(world.hasEntity(zombie), true)
    schedule.run(world, 53)
    assert.equal(world.hasEntity(zombie), false)
    assert.equal(world.hasEntity(secondZombie), true)
    schedule.run(world, 54)
    assert.equal(world.hasEntity(secondZombie), false)
    assert.deepEqual(
        world.resources.get(EventQueueResource).events
            .filter(event => event.type === 'zombiePartDropped' && event.data.entityId === zombie)
            .map(event => [event.data.part, event.data.mowered, event.data.row]),
        [['head', true, 2], ['arm', true, 2]],
    )

    world.resources.get(LevelStateResource).result = 'won'
    world.get(mowerEntity, PositionComponent)!.x = 799
    schedule.run(world, 55)
    assert.equal(world.hasEntity(mowerEntity), false)
    assert.deepEqual(world.resources.get(LevelStateResource).mowerRows, [], 'the row has used its mower')
})

test('Zombie::MowDown drops a worn helm or shield before the mowed animation', () => {
    const world = mowerWorld()
    const zombies = ['pvz:conehead', 'pvz:screendoor'].map(typeId => {
        const entity = world.createEntity()
        world.add(entity, PositionComponent, { x: -10, y: 280, row: 2 })
        world.add(entity, ZombieComponent, {
            typeId, health: 270, maxHealth: 270, state: 'walking', speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
            walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
            hasHead: true, hasTongue: false, hasArm: true, groanCounter: 300,
            helmHealth: definitions.zombies[typeId].helm?.health ?? 0, shieldHealth: definitions.zombies[typeId].shield?.health ?? 0,
            chilledTicks: 0, hasPole: false, enrageTicks: 0, riseTicks: 0,
        })
        return entity
    })
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))
    // The first sets the mower off; it runs into the second on the next tick.
    for (const tick of [1, 2]) schedule.run(world, tick)
    for (const entity of zombies) {
        assert.equal(world.get(entity, ZombieComponent)!.state, 'mowered')
        assert.deepEqual([world.get(entity, ZombieComponent)!.helmHealth, world.get(entity, ZombieComponent)!.shieldHealth], [0, 0])
    }
    assert.deepEqual(world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieHelmDropped' || event.type === 'zombieShieldDropped')
        .map(event => [event.type, event.data]),
        [['zombieHelmDropped', { entityId: zombies[0], helm: 'cone' }], ['zombieShieldDropped', { entityId: zombies[1], shield: 'door' }]],
        'DropHelm(0U) and DropShield(0U) do not bypass')
})

test('a zombie that cannot be flattened (dying, vaulting, rising) goes in a puff: its parts drop and it is gone at once', () => {
    const world = mowerWorld()
    const zombie = world.createEntity()
    world.add(zombie, PositionComponent, { x: -10, y: 280, row: 2 })
    world.add(zombie, ZombieComponent, {
        typeId: 'pvz:normal', health: 0, maxHealth: 270, state: 'dying', speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 100,
        walkClip: 'walk', animations: { body: { clip: 'death', time: 0, rate: 12 } },
        hasHead: false, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, hasPole: false, enrageTicks: 0, riseTicks: 0,
    })
    startMower(world, definitions, 2)
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))
    schedule.run(world, 1)
    assert.equal(world.hasEntity(zombie), false)
    assert.deepEqual(world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombiePuffed' || event.type === 'zombiePartDropped' || event.type === 'zombieMowered')
        .map(event => [event.type, event.data.part]), [['zombiePuffed', undefined], ['zombiePartDropped', 'arm']])
})

test("a running mower crushes the zombies' plants in its row, and they do not set a waiting one off", () => {
    const world = mowerWorld()
    const plant = (team: 'plants' | 'zombies', column: number, row = 2, typeId = 'pvz:wallnut') => {
        const entity = world.createEntity()
        world.add(entity, PositionComponent, { x: board.origin.x + column * board.cell.width, y: 280, row })
        world.add(entity, PlantComponent, {
            typeId, seedId: typeId, column, health: 4000, maxHealth: 4000,
            recentlyEatenCounter: 0, chilledTicks: 0, ...(team === 'zombies' ? { team } : {}),
        })
        return entity
    }
    const enemy = plant('zombies', 0), friend = plant('plants', 1), otherRow = plant('zombies', 0, 3)
    const explosive = plant('zombies', 3, 2, 'pvz:explodenut')
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))
    schedule.run(world, 1)
    assert.deepEqual(world.resources.get(LevelStateResource).mowerRows, [2])
    assert.equal(world.get(enemy, PlantComponent)!.health, 4000)

    startMower(world, definitions, 2)
    const [mower] = mowers(world)
    let tick = 2
    while (!world.get(enemy, MowedPlantComponent)) schedule.run(world, tick++)
    assert.equal(world.get(enemy, PlantComponent), undefined, 'it is no plant any more')
    let squashing = 0
    while (world.hasEntity(enemy)) { schedule.run(world, tick++); squashing++ }
    assert.equal(squashing, 50, 'it stays for its squashing, as long as a mowed zombie')
    while (world.hasEntity(mower)) schedule.run(world, tick++)
    const events = world.resources.get(EventQueueResource).events
    assert.deepEqual(events.filter(event => event.type === 'plantMowered').map(event => event.data),
        [{ mowerId: mower, plantId: enemy }, { mowerId: mower, plantId: explosive }], 'the client squashes them')
    assert.equal(world.isQueryable(explosive), false)
    assert.ok(!events.some(event => event.type === 'plantExploded'), 'an explode-o-nut is crushed, not set off')
    assert.equal(world.get(friend, PlantComponent)!.health, 4000)
    assert.equal(world.get(otherRow, PlantComponent)!.health, 4000)
})

test('a shooter can fire mowing projectiles, each from its mouth on its side, crushing the other side, and gone off the board', () => {
    // A peashooter that fires mowers in place of peas.
    const source = readGameplaySource('definitions')
    source.plants['pvz:peashooter'].shooter.projectile = 'pvz:lawnmower'
    const firing = parseGameplayDefinitions(source)
    const levels = parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), firing)
    const play = (lines: string[]) => {
        const game = new LocalIntegratedGame(firing, levels, undefined, true)
        game.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
        game.command({ type: 'completeIntro' })
        for (const line of lines) assert.equal(game.debugCommand(line).ok, true, line)
        game.command({ type: 'resume' })
        game.update(0)
        return game
    }
    const running = (game: LocalIntegratedGame) => game.render().projectiles.filter(projectile => projectile.typeId === 'pvz:lawnmower')
    const run = (game: LocalIntegratedGame, until: () => boolean) => {
        for (let step = 0; step < 3000 && !until(); step++) game.update(0.01)
        assert.ok(until())
    }

    const ours = play(['/plant peashooter 3 1', '/zombie normal 3 8'])
    run(ours, () => running(ours).length > 0)
    const flat = ours.currentSnapshot!.projectiles[0]
    assert.equal(flat.team, undefined)
    run(ours, () => ours.render().zombies.some(zombie => zombie.state === 'mowered'))
    assert.ok(ours.currentSnapshot!.projectiles[0].y === flat.y && flat.height! > 0, 'fired from a mouth, it flies flat at that height, over its shadow on the ground')
    run(ours, () => running(ours).length === 0)
    assert.deepEqual(ours.render().mowerRows, [2], "the row's own mower still waits")

    const theirs = play(['/plant peashooter 3 9 zombies', '/plant wallnut 3 3'])
    run(theirs, () => running(theirs).some(mower => mower.team === 'zombies'))
    const fired = running(theirs).find(mower => mower.team === 'zombies')!
    const loaded = new LocalIntegratedGame(firing, levels, undefined, true)
    loaded.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: theirs.saveAtBoundary() })
    assert.deepEqual(running(loaded), running(theirs), 'a save keeps it')
    run(theirs, () => running(theirs).find(mower => mower.entityId === fired.entityId)!.x < fired.x)
    run(theirs, () => !theirs.render().plants.some(plant => plant.typeId === 'pvz:wallnut'))
    run(theirs, () => !running(theirs).some(mower => mower.entityId === fired.entityId))
    assert.ok(theirs.render().plants.some(plant => plant.team === 'zombies'), 'it passes its own side')

    // A plant put down on a running mower is mowed in the same tick: the client first sees it mowed, and squashes it.
    const planted = play(['/seed 1 wallnut zombies', '/sun set 1000', '/lawnmower trigger 3'])
    run(planted, () => running(planted)[0].x >= 150)
    planted.command({ type: 'selectSeed', seedId: 'pvz:wallnut', slot: 0 })
    planted.command({ type: 'placePlant', row: 2, column: 1 })
    planted.update(0.01)
    const nut = () => planted.render().plants.find(plant => plant.typeId === 'pvz:wallnut')
    assert.deepEqual(nut()?.mowered, { time: 0 })
    const squashed = new LocalIntegratedGame(firing, levels, undefined, true)
    squashed.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: planted.saveAtBoundary() })
    assert.deepEqual(squashed.render().plants, planted.render().plants, 'a save keeps it mid-squash')
    run(planted, () => !nut())
})
