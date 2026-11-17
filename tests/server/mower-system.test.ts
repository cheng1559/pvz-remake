import { withProjectileMotions } from '../projectileMotions'
import { readGameplaySource } from '../../tools/mod/content'
import { withFixedBanks } from '../fixedBankLevels'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { mowerY, parseGameplayLevels } from '@/shared/content/gameplay'
import assert from 'node:assert/strict'
import test from 'node:test'

import { CommandBuffer, Schedule, World } from '@/server/state/World'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import {
    EconomyStateResource,
    LevelStateResource,
    RandomResource,
} from '@/server/state/components'
import { createZombieSystem } from '@/server/zombies/system'
import { createMower, createMowerSystem } from '@/server/level/mowers'
import type { MowingProjectile } from '@/server/combat/MowingProjectile'
import { readyMowers } from '@/server/level/lawn'
import { updateMowerCoins } from '@/server/level/loot'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol/index'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { createProjectileSystem } from '@/server/combat/projectiles'
import { EventQueueResource, createEventQueue } from '@/server/state/events'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { newZombie, withZombieTypes } from '../zombieTypes'
import { newPlant, withPlantTypes } from '../plantTypes'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const board = definitions.boards['pvz:day']
/** A level whose row 2 has a mower waiting. */
function mowerWorld(): World {
    const world = withPlantTypes(withZombieTypes(new World(), definitions), definitions)
    world.resources.set(LevelStateResource, { id: 'pvz:test', definition: { lawnMower: 'pvz:lawnmower' } as never, board,
        phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(EventQueueResource, createEventQueue())
    withProjectileMotions(world, definitions).resources.set(RandomResource, new DeterministicRng(1))
    createMower(world, 2)
    return world
}
/** The running mowers, which run as projectiles. */
const mowers = (world: World) => [...world.projectiles].map(projectile => projectile.id)
/** The rows whose mower waits. */
const waiting = (world: World) => [...readyMowers(world).keys()]
/** A row's waiting mower (row 2's by default) sets off: the projectile it runs on as. */
const setOff = (world: World, entity = readyMowers(world).get(2)!) => world.mowers.get(entity)!.setOff(world, definitions)
const chomp = (world: World, entity: number) => (world.projectiles.get(entity) as MowingProjectile).chompCounter

test("a row's mower sets off as a mowing projectile when a zombie with its head reaches it, kills overlaps, and is gone off the board", () => {
    const world = mowerWorld()
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))

    schedule.run(world, 1)
    const [row] = [...world.mowers].map(mower => mower.id)
    assert.equal(world.mowers.get(row)!.typeId, 'pvz:lawnmower', 'it sets off as the level\'s mower')
    assert.deepEqual(world.mowers.get(row)?.position, { x: -21, y: 303, row: 2 }, 'where it waits, at MOWER_READY_X')
    assert.equal(mowers(world).length, 0)

    const zombie = world.createEntity()
    world.insert(world.zombies, newZombie(world, 'pvz:normal', { id: zombie, position: { x: -10, y: 280, row: 2 },
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
        hasHead: false, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, riseTicks: 0,
    }))
    schedule.run(world, 2)
    assert.deepEqual(waiting(world), [2])
    assert.equal(world.zombies.get(zombie)!.state, 'walking')
    world.zombies.get(zombie)!.hasHead = true
    schedule.run(world, 3)
    assert.deepEqual(waiting(world), [])
    const [mowerEntity] = mowers(world)
    assert.equal(world.hasEntity(row), false, 'the mower that waited is gone from its row (LawnMower::StartMower), running on as a projectile')
    assert.deepEqual(world.projectiles.get(mowerEntity)!.typeId, 'pvz:lawnmower')
    assert.equal(world.projectiles.get(mowerEntity)!.position.y, 303)
    assert.equal(world.hasEntity(zombie), true)
    assert.equal(world.zombies.get(zombie)!.state, 'mowered')
    assert.deepEqual(world.zombies.get(zombie)!.animations.body, { clip: 'mowered', time: 0, rate: 16 })
    assert.equal(chomp(world, mowerEntity), 24)
    assert.equal(world.projectiles.get(mowerEntity)!.position.x, -19.996272)

    const secondZombie = world.createEntity()
    world.insert(world.zombies, newZombie(world, 'pvz:normal', { id: secondZombie, position: { x: -10, y: 280, row: 2 },
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
        hasHead: true, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, riseTicks: 0,
    }))
    schedule.run(world, 4)
    assert.equal(world.hasEntity(secondZombie), true)
    assert.equal(world.zombies.get(secondZombie)!.state, 'mowered')
    assert.equal(
        world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieMowered').length,
        2,
    )

    assert.equal(chomp(world, mowerEntity), 50)
    for (let tick = 5; tick <= 28; tick++) schedule.run(world, tick)
    // Half of the driver's 8 frames, 25 ticks into its 50.
    assert.ok(Math.abs(world.zombies.get(zombie)!.animations.body.time - 4) < 1e-9)
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
            .map(event => [event.data.part, event.data.mowered]),
        [['head', true], ['arm', true]],
    )

    world.resources.get(LevelStateResource).result = 'won'
    world.projectiles.get(mowerEntity)!.position.x = 799
    schedule.run(world, 55)
    assert.equal(world.hasEntity(mowerEntity), false)
    assert.deepEqual(waiting(world), [], 'the row has used its mower')
})

test('Zombie::MowDown drops a worn helm or shield before the mowed animation', () => {
    const world = mowerWorld()
    const zombies = ['pvz:conehead', 'pvz:screendoor'].map(typeId => {
        const entity = world.createEntity()
        world.insert(world.zombies, newZombie(world, typeId, { id: entity, position: { x: -10, y: 280, row: 2 },
            typeId, health: 270, maxHealth: 270, state: 'walking', speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
            walkClip: 'walk', animations: { body: { clip: 'walk', time: 0, rate: 12 } },
            hasHead: true, hasTongue: false, hasArm: true, groanCounter: 300,
            helmHealth: definitions.zombies[typeId].helm?.health ?? 0, shieldHealth: definitions.zombies[typeId].shield?.health ?? 0,
            chilledTicks: 0, riseTicks: 0,
        }))
        return entity
    })
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))
    // The first sets the mower off; it runs into the second on the next tick.
    for (const tick of [1, 2]) schedule.run(world, tick)
    for (const entity of zombies) {
        assert.equal(world.zombies.get(entity)!.state, 'mowered')
        assert.deepEqual([world.zombies.get(entity)!.helmHealth, world.zombies.get(entity)!.shieldHealth], [0, 0])
    }
    assert.deepEqual(world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieHelmDropped' || event.type === 'zombieShieldDropped')
        .map(event => [event.type, event.data]),
        [['zombieHelmDropped', { entityId: zombies[0], helm: 'cone' }], ['zombieShieldDropped', { entityId: zombies[1], shield: 'door' }]],
        'DropHelm(0U) and DropShield(0U) do not bypass')
})

test('a zombie that cannot be flattened (dying, in the air, rising) goes in a puff: its parts drop and it is gone at once', () => {
    const world = mowerWorld()
    const zombie = world.createEntity()
    world.insert(world.zombies, newZombie(world, 'pvz:normal', { id: zombie, position: { x: -10, y: 280, row: 2 },
        typeId: 'pvz:normal', health: 0, maxHealth: 270, state: 'dying', speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 100,
        walkClip: 'walk', animations: { body: { clip: 'death', time: 0, rate: 12 } },
        hasHead: false, hasTongue: false, hasArm: true, groanCounter: 300,
        helmHealth: 0, shieldHealth: 0, chilledTicks: 0, riseTicks: 0,
    }))
    setOff(world)
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
        world.insert(world.plants, newPlant(world, typeId, { id: entity, position: { x: board.origin.x + column * board.cell.width, y: 280, row },
            column, health: 4000, maxHealth: 4000, ...(team === 'zombies' ? { team } : {}) }))
        return entity
    }
    const enemy = plant('zombies', 0), friend = plant('plants', 1), otherRow = plant('zombies', 0, 3)
    const explosive = plant('zombies', 3, 2, 'pvz:explodenut')
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))
    schedule.run(world, 1)
    assert.deepEqual(waiting(world), [2])
    assert.equal(world.plants.get(enemy)!.health, 4000)

    const mower = setOff(world)
    let tick = 2
    while (world.plants.get(enemy)?.state !== 'mowered') schedule.run(world, tick++)
    assert.equal(world.plants.get(enemy)!.inPlay, false, 'it is out of play')
    let squashing = 0
    while (world.hasEntity(enemy)) { schedule.run(world, tick++); squashing++ }
    assert.equal(squashing, 50, 'it stays for its squashing, as long as a mowed zombie')
    while (world.hasEntity(mower)) schedule.run(world, tick++)
    const events = world.resources.get(EventQueueResource).events
    assert.deepEqual(events.filter(event => event.type === 'plantMowered').map(event => event.data),
        [{ mowerId: mower, plantId: enemy }, { mowerId: mower, plantId: explosive }], 'the client squashes them')
    assert.equal(world.isQueryable(explosive), false)
    assert.ok(!events.some(event => event.type === 'plantExploded'), 'an explode-o-nut is crushed, not set off')
    assert.equal(world.plants.get(friend)!.health, 4000)
    assert.equal(world.plants.get(otherRow)!.health, 4000)
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
    assert.deepEqual(ours.render().mowers.map(mower => mower.row), [2], "the row's own mower still waits")

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
    assert.deepEqual([nut()?.state, nut()?.mowered], ['mowered', { time: 0 }])
    const squashed = new LocalIntegratedGame(firing, levels, undefined, true)
    squashed.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: planted.saveAtBoundary() })
    assert.deepEqual(squashed.render().plants, planted.render().plants, 'a save keeps it mid-squash')
    const save = planted.saveAtBoundary() as unknown as { entities: Array<{ plant?: { state: string, mowered?: unknown } }> }
    const mowed = save.entities.find(entity => entity.plant?.state === 'mowered')!
    mowed.plant!.state = 'idle'
    assert.throws(() => new IntegratedGameServer(firing, levels).start({ protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-1',
        randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], save: save as unknown as JsonValue }), /invalid squash/, 'only a plant mowed down is squashed')
    run(planted, () => !nut())
})

test("a row's mower waits from the level's start until it sets off as a projectile of its own, each saved and restored as it is, and a save of another shape is refused", () => {
    const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
    const start: StartSessionPacket = { protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-2', randomSeed: 7,
        initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-2'), mods: [] }
    const server = new IntegratedGameServer(definitions, levels)
    // Board::InitLawnMowers: every row in play has one from the intro on, waiting where the intro rolls it in.
    const initial = server.start(start)
    assert.equal(initial.phase, 'intro')
    assert.deepEqual(initial.mowers.map(mower => [mower.row, mower.x]), [[1, -21], [2, -21], [3, -21]])
    runCommand(server, { type: 'completeIntro' })
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    const [first, second] = initial.mowers
    const runningId = world.mowers.get(second.entityId)!.setOff(world, definitions)
    for (let tick = 0; tick < 30; tick++) server.tick()
    const snapshot = server.snapshot()
    assert.deepEqual(snapshot.mowers.map(mower => mower.entityId), [first.entityId, initial.mowers[2].entityId], 'the one set off waits no more')
    const [running] = snapshot.projectiles
    assert.deepEqual([running.entityId, running.typeId, running.row], [runningId, 'pvz:lawnmower', 2], 'it runs on as a projectile of its own')
    assert.ok(running.x > -21 + 30 * 3)

    // Saved through their components: a waiting one as a mower, a running one as a projectile.
    const saved = server.save()
    assert.equal(saved.schemaVersion, 3)
    assert.deepEqual(Object.keys(saved.level), ['phase', 'result', 'paused'], 'no list of rows: the mowers are entities')
    const entity = (id: number) => saved.entities.find(entity => entity.entityId === id)!
    assert.deepEqual(entity(first.entityId), { entityId: first.entityId, position: { x: -21, y: first.y, row: 1 }, mower: { typeId: 'pvz:lawnmower' } })
    assert.deepEqual([entity(runningId).mower, entity(runningId).projectile!.typeId], [undefined, 'pvz:lawnmower'])
    const restored = new IntegratedGameServer(definitions, levels)
    const back = restored.start({ ...start, save: saved as unknown as JsonValue })
    assert.deepEqual([back.mowers, back.projectiles], [snapshot.mowers, snapshot.projectiles])
    for (let tick = 0; tick < 20; tick++) {
        const [left, right] = [restored.tick(), server.tick()]
        assert.deepEqual([left.mowers, left.projectiles], [right.mowers, right.projectiles], 'it runs on as it did')
    }

    const refused = (change: (save: any) => void, message: RegExp, why: string) => {
        const save = structuredClone(saved) as any
        change(save)
        assert.throws(() => new IntegratedGameServer(definitions, levels).start({ ...start, save }), message, why)
    }
    const saveOf = (save: any, id: number) => save.entities.find((entity: any) => entity.entityId === id)
    refused(save => { save.schemaVersion = 2 }, /schemaVersion must be 3/, 'an older save is refused, not read as this one')
    refused(save => { save.level.mowerRows = [1, 2, 3] }, /server save\.level/, "the old rows' list")
    refused(save => { saveOf(save, first.entityId).mower.typeId = 'pvz:pea' }, /Saved mower .* is invalid/, 'it sets off as the level\'s mower')
    refused(save => { saveOf(save, first.entityId).position.x = 0 }, /Saved mower .* is invalid/, 'it waits at MOWER_READY_X')
    refused(save => { saveOf(save, first.entityId).projectile = saveOf(save, runningId).projectile }, /exactly one domain component/, 'a waiting one is no projectile')
    refused(save => { delete saveOf(save, runningId).projectile.chompCounter }, /chompCounter/, 'a running one chews')
})

test("at the level's end each ready mower turns into gold where it waits, the lowest first, and is gone", () => {
    const world = mowerWorld()
    createMower(world, 0)
    createMower(world, 4)
    const running = setOff(world, readyMowers(world).get(0)!)
    world.resources.set(EconomyStateResource, { sun: 0, money: 0, pendingSunSpend: 0, packetUpgrades: 0, ownedUpgrades: 0, mowerCoinTicks: 1 })
    const commands = new CommandBuffer(world), coins: Array<[number, number]> = []
    for (let tick = 0; tick < 200; tick++) {
        updateMowerCoins(world, definitions, commands)
        commands.flush()
    }
    for (const { position: { x, y } } of world.items) coins.push([x, y])
    // Board::UpdateLevelEndSequence: AddCoin(mPosX + 40, mPosY + 40), the coin drawn from its corner 10 left and 8 up.
    assert.deepEqual(coins, [4, 2].map(row => [-21 + 40 - 10, mowerY(board, row) + 40 - 8]))
    assert.deepEqual(world.resources.get(EventQueueResource).events.filter(event => event.type === 'mowerScored').map(event => event.data),
        [{ row: 4, remaining: 2 }, { row: 2, remaining: 1 }], 'CountUntriggerLawnMowers counts the one scored')
    assert.deepEqual([[...world.mowers].map(mower => mower.id), world.hasEntity(running)], [[], true], 'none waits any more; the running one runs on')
    assert.equal(world.resources.get(EconomyStateResource).mowerCoinTicks, undefined, 'and the scoring is through')
})
