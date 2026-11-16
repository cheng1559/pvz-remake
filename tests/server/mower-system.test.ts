import { withProjectileMotions } from '../projectileMotions'
import { readGameplaySource } from '../../tools/mod/content'
import { withFixedBanks } from '../fixedBankLevels'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { mowerY, parseGameplayLevels } from '@/shared/content/gameplay'
import assert from 'node:assert/strict'
import test from 'node:test'

import { CommandBuffer, Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import {
    EconomyStateResource,
    LevelStateResource,
    MowedPlantComponent,
    MowerComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    ZombieComponent,
} from '@/server/state/components'
import { createZombieSystem } from '@/server/zombies/system'
import { createMower, createMowerSystem, startMower } from '@/server/level/mower'
import { readyMowers } from '@/server/level/lawn'
import { updateMowerCoins } from '@/server/level/loot'
import { ItemComponent } from '@/server/state/levelState'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol/index'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { createProjectileSystem } from '@/server/combat/projectiles'
import { EventQueueResource, createEventQueue } from '@/server/state/events'
import { DeterministicRng } from '@/server/state/DeterministicRng'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const board = definitions.boards['pvz:day']
/** A level whose row 2 has a mower waiting. */
function mowerWorld(): World {
    const world = new World()
    world.resources.set(LevelStateResource, { id: 'pvz:test', definition: { lawnMower: 'pvz:lawnmower' } as never, board,
        phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(EventQueueResource, createEventQueue())
    withProjectileMotions(world).resources.set(RandomResource, new DeterministicRng(1))
    createMower(world, 2)
    return world
}
/** The running mowers, which run as projectiles. */
const mowers = (world: World) => [...world.query(PositionComponent, ProjectileComponent)]
/** The rows whose mower waits. */
const waiting = (world: World) => [...readyMowers(world).keys()]

test("a row's mower sets off as a mowing projectile when a zombie with its head reaches it, kills overlaps, and is gone off the board", () => {
    const world = mowerWorld()
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))

    schedule.run(world, 1)
    const [row] = [...world.query(MowerComponent)]
    assert.deepEqual(world.get(row, MowerComponent), { state: 'ready' })
    assert.deepEqual(world.get(row, PositionComponent), { x: -21, y: 303, row: 2 }, 'where it waits, at MOWER_READY_X')
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
    assert.deepEqual(waiting(world), [2])
    assert.equal(world.get(zombie, ZombieComponent)!.state, 'walking')
    world.get(zombie, ZombieComponent)!.hasHead = true
    schedule.run(world, 3)
    assert.deepEqual(waiting(world), [])
    const [mowerEntity] = mowers(world)
    assert.equal(mowerEntity, row, 'the mower that waited runs on: one entity throughout (LawnMower::StartMower)')
    assert.deepEqual(world.get(mowerEntity, MowerComponent), { state: 'triggered' })
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
    assert.deepEqual(waiting(world), [], 'the row has used its mower')
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
    startMower(world, definitions, readyMowers(world).get(2)!)
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
    assert.deepEqual(waiting(world), [2])
    assert.equal(world.get(enemy, PlantComponent)!.health, 4000)

    startMower(world, definitions, readyMowers(world).get(2)!)
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
    // What runs as a mower: the shooters' mowing projectiles, and the level's own once set off.
    const running = (game: LocalIntegratedGame) => [...game.render().projectiles, ...game.render().mowers.filter(mower => mower.state === 'triggered')]
        .filter(projectile => projectile.typeId === 'pvz:lawnmower')
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
    assert.deepEqual(ours.render().mowers.map(mower => [mower.row, mower.state]), [[2, 'ready']], "the row's own mower still waits")

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

test("a row's mower is one entity from the level's start to its end, saved and restored as it is, and a save of another shape is refused", () => {
    const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
    const start: StartSessionPacket = { protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-2', randomSeed: 7,
        initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-2'), mods: [] }
    const server = new IntegratedGameServer(definitions, levels)
    // Board::InitLawnMowers: every row in play has one from the intro on, waiting where the intro rolls it in.
    const initial = server.start(start)
    assert.equal(initial.phase, 'intro')
    assert.deepEqual(initial.mowers.map(mower => [mower.row, mower.x, mower.state]), [[1, -21, 'ready'], [2, -21, 'ready'], [3, -21, 'ready']])
    runCommand(server, { type: 'completeIntro' })
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    const [first, second] = initial.mowers
    startMower(world, definitions, second.entityId)
    for (let tick = 0; tick < 30; tick++) server.tick()
    const running = server.snapshot().mowers
    assert.deepEqual(running.map(mower => [mower.entityId, mower.state]), [[first.entityId, 'ready'], [second.entityId, 'triggered'], [initial.mowers[2].entityId, 'ready']])
    assert.ok(running[1].x > -21 + 30 * 3)
    assert.ok(!server.snapshot().projectiles.length, 'a running mower is listed with the mowers, not the projectiles')

    // Saved through its component: a ready one alone, a running one with the projectile it runs as.
    const saved = server.save()
    assert.equal(saved.schemaVersion, 3)
    assert.deepEqual(Object.keys(saved.level), ['phase', 'result', 'paused'], 'no list of rows: the mowers are entities')
    const entity = (id: number) => saved.entities.find(entity => entity.entityId === id)!
    assert.deepEqual(entity(first.entityId), { entityId: first.entityId, position: { x: -21, y: first.y, row: 1 }, mower: { state: 'ready' } })
    assert.equal(entity(second.entityId).mower!.state, 'triggered')
    assert.equal(entity(second.entityId).projectile!.typeId, 'pvz:lawnmower')
    const restored = new IntegratedGameServer(definitions, levels)
    assert.deepEqual(restored.start({ ...start, save: saved as unknown as JsonValue }).mowers, running)
    for (let tick = 0; tick < 20; tick++) assert.deepEqual(restored.tick().mowers, server.tick().mowers, 'it runs on as it did')

    const refused = (change: (save: any) => void, message: RegExp, why: string) => {
        const save = structuredClone(saved) as any
        change(save)
        assert.throws(() => new IntegratedGameServer(definitions, levels).start({ ...start, save }), message, why)
    }
    const saveOf = (save: any, id: number) => save.entities.find((entity: any) => entity.entityId === id)
    refused(save => { save.schemaVersion = 2 }, /schemaVersion must be 3/, 'an older save is refused, not read as this one')
    refused(save => { save.level.mowerRows = [1, 2, 3] }, /server save\.level/, "the old rows' list")
    refused(save => { saveOf(save, first.entityId).mower.state = 'rolling-in' }, /mower\.state/, 'LawnMowerState: ready or triggered')
    refused(save => { saveOf(save, first.entityId).position.x = 0 }, /Saved mower .* is invalid/, 'a ready one waits at MOWER_READY_X')
    refused(save => { saveOf(save, first.entityId).projectile = saveOf(save, second.entityId).projectile }, /Saved mower .* is invalid/, 'a ready one runs as nothing')
    refused(save => { delete saveOf(save, second.entityId).projectile }, /Saved mower .* is invalid/, 'a triggered one runs as the level\'s mower')
})

test("at the level's end each ready mower turns into gold where it waits, the lowest first, and is gone", () => {
    const world = mowerWorld()
    createMower(world, 0)
    createMower(world, 4)
    const running = readyMowers(world).get(0)!
    startMower(world, definitions, running)
    world.resources.set(EconomyStateResource, { sun: 0, money: 0, pendingSunSpend: 0, packetUpgrades: 0, mowerCoinTicks: 1 })
    const commands = new CommandBuffer(world), coins: Array<[number, number]> = []
    for (let tick = 0; tick < 200; tick++) {
        updateMowerCoins(world, definitions, commands)
        commands.flush()
    }
    for (const entity of world.query(PositionComponent, ItemComponent)) {
        const { x, y } = world.get(entity, PositionComponent)!
        coins.push([x, y])
    }
    // Board::UpdateLevelEndSequence: AddCoin(mPosX + 40, mPosY + 40), the coin drawn from its corner 10 left and 8 up.
    assert.deepEqual(coins, [4, 2].map(row => [-21 + 40 - 10, mowerY(board, row) + 40 - 8]))
    assert.deepEqual(world.resources.get(EventQueueResource).events.filter(event => event.type === 'mowerScored').map(event => event.data),
        [{ row: 4, remaining: 2 }, { row: 2, remaining: 1 }], 'CountUntriggerLawnMowers counts the one scored')
    assert.deepEqual([...world.query(MowerComponent)], [running], 'only the running one is left')
    assert.equal(world.resources.get(EconomyStateResource).mowerCoinTicks, undefined, 'and the scoring is through')
})
