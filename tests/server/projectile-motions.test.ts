import { readGameplaySource } from '../../tools/mod/content'
import { withFixedBanks } from '../fixedBankLevels'
import { withProjectileMotions } from '../projectileMotions'
import assert from 'node:assert/strict'
import test from 'node:test'

import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { Schedule, World } from '@/server/state/World'
import { mowerY, parseGameplayDefinitions, parseGameplayLevels, PLANT_ATTACKS, type PlantAttack, rowGroundY } from '@/shared/content/gameplay'
import { ProjectileMotionsResource, STRAIGHT } from '@/server/projectiles/motions'
import { launchProjectile } from '@/server/projectiles/Projectile'
import { ProjectileRegistry } from '@/server/projectiles/ProjectileRegistry'
import { createProjectileSystem } from '@/server/projectiles/projectiles'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { LevelStateResource, RandomResource } from '@/server/state/components'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { EventQueueResource, createEventQueue } from '@/server/state/events'
import { spawnZombie } from '@/server/zombies/spawn'
import { startFromSave } from './start-from-save'
import { withZombieTypes } from '../zombieTypes'

const LOB = PLANT_ATTACKS.lobber, HOMING = PLANT_ATTACKS.seeker

/**
 * The base content with the peashooter attacking as `type`, its pea with `overrides`: which way a projectile flies is
 * its launcher's, and a plant has what it likes of its projectile its own way.
 */
function firing(type: PlantAttack, overrides: object = {}) {
    const source = readGameplaySource('definitions')
    const plant = source.plants['pvz:peashooter'], was = Object.keys(PLANT_ATTACKS).find(key => plant[key])!
    const block = plant[was]
    delete plant[was]
    plant[type] = { ...block, projectile: { id: 'pvz:pea', ...overrides } }
    const definitions = parseGameplayDefinitions(source), levels = parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), definitions)
    // What a projectile's kind takes is checked as the content loads (ProjectileRegistry).
    new ProjectileRegistry().validate(definitions, levels)
    return { definitions, levels }
}

function facing(world: World, projectile: number): number {
    const state = world.projectiles.get(projectile)!
    return world.resources.get(ProjectileMotionsResource).of(state).facing!(state.motionState)
}

test('what is thrown or homes comes down on a low plant, which only what flies along the lawn passes over', () => {
    for (const type of ['lobber', 'seeker', 'shooter'] as const) {
        const { definitions, levels } = firing(type)
        const game = new LocalIntegratedGame(definitions, levels, undefined, true)
        game.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
        game.command({ type: 'completeIntro' })
        for (const line of ['/plant peashooter 3 1', '/plant potatomine 3 6 zombies']) assert.equal(game.debugCommand(line).ok, true, line)
        game.command({ type: 'resume' })
        const mine = () => game.render().plants.find(plant => plant.typeId === 'pvz:potatomine')!
        for (let step = 0; step < 600 && mine().health === mine().maxHealth; step++) game.update(0.01)
        assert.equal(mine().health < mine().maxHealth, type !== 'shooter', type)
    }
})

test("a lobber's pea arcs over to its target with the damage the plant gives it, and a save keeps it in flight", () => {
    const { definitions, levels } = firing('lobber', { damage: 40 })
    const start = { levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(start)
    game.command({ type: 'completeIntro' })
    for (const line of ['/plant peashooter 3 1', '/zombie normal 3 8']) assert.equal(game.debugCommand(line).ok, true, line)
    game.command({ type: 'resume' })
    const pea = () => game.render().projectiles[0]
    for (let step = 0; step < 1000 && !pea(); step++) game.update(0.01)
    const fired = pea()
    assert.equal(fired.typeId, 'pvz:pea')
    for (let step = 0; step < 40; step++) game.update(0.01)
    assert.ok(pea().y < fired.y - 100 && pea().lift! > 100, 'it rises over the lawn, as far as its shadow shrinks by')
    assert.equal(game.render().zombies[0].health, 270, 'and hits nothing on the way up')

    // A save keeps it in flight: the restored server brings it down as the running game does.
    const loaded = new IntegratedGameServer(definitions, levels)
    assert.deepEqual(startFromSave(loaded, game.saveAtBoundary()).projectiles, game.currentSnapshot!.projectiles)
    for (let step = 0; step < 300 && game.currentSnapshot!.zombies[0].health === 270; step++) { game.update(0.01); loaded.tick() }
    assert.equal(game.currentSnapshot!.zombies[0].health, 230, "it comes down on the zombie with this plant's damage for a pea")
    assert.deepEqual(loaded.snapshot().zombies, game.currentSnapshot!.zombies)
})

test('a homing projectile turns across the rows to its target and hits only that', () => {
    const { definitions } = firing('shooter')
    const world = withZombieTypes(withProjectileMotions(new World(), definitions), definitions)
    world.resources.set(LevelStateResource, { id: 'pvz:test', definition: {} as never, board: definitions.boards['pvz:day'],
        phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(RandomResource, new DeterministicRng(1))
    const bystander = spawnZombie(world, definitions, 'pvz:normal', 2, 300, 250)
    const target = spawnZombie(world, definitions, 'pvz:normal', 0, 600, 50)
    const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: HOMING, target })
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    for (let tick = 1; tick <= 150; tick++) schedule.run(world, tick)
    const turned = facing(world, pea)
    assert.ok(turned < -0.2 && turned > -Math.PI / 2, `it points the way it flies, up and to the right (${turned})`)
    for (let tick = 151; tick < 1000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
    assert.equal(world.hasEntity(pea), false)
    assert.equal(world.zombies.get(target)!.health, 250)
    assert.equal(world.zombies.get(bystander)!.health, 270, 'it passes what is not its target')
    assert.equal(world.zombies.get(target)!.position.row, 0)
})

test('a homing projectile whose target dies flies on as it was going, where it would circle what it cannot hit', () => {
    const { definitions, world, schedule } = flying(false)
    const target = spawnZombie(world, definitions, 'pvz:normal', 0, 600, 50)
    const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: HOMING, target })
    for (let tick = 1; tick <= 60; tick++) schedule.run(world, tick)
    // Dying, it is still there to home on, but nothing can hit it.
    Object.assign(world.zombies.get(target)!, { health: 0, state: 'dying' })
    schedule.run(world, 61)
    const heading = facing(world, pea), { x, y } = world.projectiles.get(pea)!.position
    for (let tick = 62; tick <= 111; tick++) schedule.run(world, tick)
    const after = world.projectiles.get(pea)!.position
    assert.equal(facing(world, pea), heading)
    assert.ok(Math.abs(Math.hypot(after.x - x, after.y - y) - 50 * 2) < 1e-6, 'fifty ticks straight on at its speed of 2')
})

test('a lobbed projectile comes down past a shield onto the body, where a straight one hits the shield', () => {
    const { definitions } = firing('shooter')
    const hit = (motion: string) => {
        const world = withZombieTypes(withProjectileMotions(new World(), definitions), definitions)
        world.resources.set(LevelStateResource, { id: 'pvz:test', definition: {} as never, board: definitions.boards['pvz:day'],
            phase: 'gameplay', result: 'playing', paused: false })
        world.resources.set(EventQueueResource, createEventQueue())
        world.resources.set(RandomResource, new DeterministicRng(1))
        const target = spawnZombie(world, definitions, 'pvz:screendoor', 2, 500, 250)
        const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, target, motion })
        const schedule = new Schedule()
        schedule.add('projectile', createProjectileSystem(definitions))
        for (let tick = 1; tick < 1000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
        const zombie = world.zombies.get(target)!, impact = world.resources.get(EventQueueResource).events.find(event => event.type === 'projectileImpact')!
        const flash = world.resources.get(EventQueueResource).events.find(event => event.type === 'zombieHit')!
        return [zombie.maxHealth - zombie.health, definitions.zombies['pvz:screendoor'].shield!.health - zombie.shieldHealth, impact.data.shield, flash.data.past, impact.data.above]
    }
    assert.deepEqual(hit(STRAIGHT), [0, 20, 'door', undefined, undefined], 'it flies into the door')
    assert.deepEqual(hit(LOB), [20, 0, undefined, true, true], 'Projectile::GetDamageFlags: DAMAGE_BYPASSES_SHIELD, the body flashes, and its splat stays where it came down')
})

/** A world with the day board and a schedule flying its projectiles; `pierce`: the pea is not used up by a hit. */
function flying(pierce: boolean) {
    const source = readGameplaySource('definitions')
    if (pierce) source.projectiles['pvz:pea'].pierce = true
    const definitions = parseGameplayDefinitions(source)
    const world = withZombieTypes(withProjectileMotions(new World(), definitions), definitions)
    world.resources.set(LevelStateResource, { id: 'pvz:test', definition: { lawnMower: 'pvz:lawnmower' } as never, board: definitions.boards['pvz:day'],
        phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(RandomResource, new DeterministicRng(1))
    const schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    const health = (zombie: number) => world.zombies.get(zombie)?.health
    return { definitions, world, schedule, health }
}

test('whether a hit uses a projectile up is its own (pierce): a piercing pea hits everything on its way once', () => {
    for (const pierce of [false, true]) {
        const { definitions, world, schedule, health } = flying(pierce)
        const zombies = [300, 320, 600].map(x => spawnZombie(world, definitions, 'pvz:normal', 2, x, 250))
        const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: STRAIGHT })
        for (let tick = 1; tick < 1000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
        assert.deepEqual(zombies.map(health), pierce ? [250, 250, 250] : [250, 270, 270], String(pierce))
        const impacts = world.resources.get(EventQueueResource).events.filter(event => event.type === 'projectileImpact')
        assert.deepEqual(impacts.map(event => event.data.through), pierce ? [true, true, true] : [undefined], 'one that flies on stays drawn, without a splat')
    }
    // Thrown, a piercing one splats only where it comes down on the ground, after what it hit on its way down.
    const { definitions, world, schedule, health } = flying(true)
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 2, 500, 250)
    const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: LOB, target: zombie })
    for (let tick = 1; tick < 1000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
    const impacts = world.resources.get(EventQueueResource).events.filter(event => event.type === 'projectileImpact')
    assert.deepEqual([health(zombie), ...impacts.map(event => [event.data.targetId, event.data.through])], [250, [zombie, true], [undefined, undefined]])
})

test('a melon splashes what else its hitbox reaches on its row and the rows next to it, for a third of its damage', () => {
    const { definitions, world, schedule, health } = flying(false)
    const row = (index: number) => definitions.boards['pvz:day'].origin.y + index * definitions.boards['pvz:day'].cell.height - 30
    const [struck, beside, above, far, behind] = [[2, 500], [2, 520], [1, 500], [0, 500], [2, 700]].map(([index, x]) => spawnZombie(world, definitions, 'pvz:normal', index, x, row(index)))
    const melon = launchProjectile(world, definitions, world, { typeId: 'pvz:melon', position: { x: 100, y: 290, row: 2 }, motion: LOB, target: struck })
    for (let tick = 1; tick < 1000 && world.hasEntity(melon); tick++) schedule.run(world, tick)
    assert.deepEqual([struck, beside, above, far, behind].map(health), [190, 244, 244, 270, 270])
    assert.equal(world.resources.get(EventQueueResource).events.filter(event => event.type === 'projectileImpact').length, 1, 'it splats once, on what it hit')

    // Projectile::DoSplashDamage: more than 21 others would take over seven times its damage between them, so each takes less.
    const crowd = flying(false)
    const hit = spawnZombie(crowd.world, definitions, 'pvz:normal', 2, 500, row(2))
    const others = Array.from({ length: 28 }, () => spawnZombie(crowd.world, definitions, 'pvz:normal', 2, 500, row(2)))
    const thrown = launchProjectile(crowd.world, definitions, crowd.world, { typeId: 'pvz:melon', position: { x: 100, y: 290, row: 2 }, motion: LOB, target: hit })
    for (let tick = 1; tick < 1000 && crowd.world.hasEntity(thrown); tick++) crowd.schedule.run(crowd.world, tick)
    // One of them is struck in full; the other 28 share 80 * 560 / (26 * 28 * 3) = 20 each.
    assert.deepEqual([hit, ...others].map(crowd.health).sort((a, b) => a! - b!), [190, ...Array(28).fill(250)])
})

test("a plant has its projectile's attributes its own way, the rest as the projectile is defined", () => {
    const overrides = firing('shooter', { damage: 40, speed: 6.66 }).definitions.plants['pvz:peashooter'].shooter!.overrides!
    assert.deepEqual(overrides, { damage: 40, speed: 6.66 })
    const { definitions, world, schedule, health } = flying(false)
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 2, 300, 250)
    const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: STRAIGHT, overrides })
    schedule.run(world, 1)
    assert.equal(world.projectiles.get(pea)!.position.x, 106.66)
    assert.deepEqual(world.projectiles.get(pea)!.definition.hitbox, definitions.projectiles['pvz:pea'].hitbox)
    for (let tick = 2; tick < 1000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
    assert.equal(health(zombie), 230)
})

test('a piercing homing projectile turns to the nearest thing it has not hit after each hit', () => {
    const { definitions, world, schedule, health } = flying(true)
    const first = spawnZombie(world, definitions, 'pvz:normal', 2, 300, 250), second = spawnZombie(world, definitions, 'pvz:normal', 0, 500, 50)
    const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: HOMING, target: first })
    for (let tick = 1; tick < 3000 && world.hasEntity(pea); tick++) schedule.run(world, tick)
    assert.deepEqual([health(first), health(second)], [250, 250])
})

test("coming down on the ground ends a projectile, a piercing one too: a lobbed mower crushes what it comes down on and is gone", () => {
    const { definitions, world, schedule } = flying(false)
    const ground = mowerY(definitions.boards['pvz:day'], 2)
    const zombies = [600, 720].map(x => spawnZombie(world, definitions, 'pvz:normal', 2, x, 250))
    const mower = launchProjectile(world, definitions, world, { typeId: 'pvz:lawnmower', position: { x: 96, y: 290, row: 2 }, motion: LOB, target: zombies[0] })
    const position = world.projectiles.get(mower)!.position
    let ticks = 0
    while (world.hasEntity(mower) && ticks < 1000) schedule.run(world, ++ticks)
    assert.ok(ticks < 200 && position.y === ground && position.x > 500 && position.x < 700, `it comes down by its target, onto the ground (${ticks}: ${position.x}, ${position.y})`)
    assert.deepEqual(zombies.map(zombie => world.zombies.get(zombie)!.state), ['mowered', 'walking'], 'and does not run on along the row')

    // Fired straight from a mouth, it mows what stands right before the shooter and flies on flat at that height.
    const flat = flying(false)
    const close = spawnZombie(flat.world, definitions, 'pvz:normal', 2, 110, 250)
    const fired = launchProjectile(flat.world, definitions, flat.world, { typeId: 'pvz:lawnmower', position: { x: 96, y: 290, row: 2 }, motion: STRAIGHT })
    for (let tick = 1; tick <= 30; tick++) flat.schedule.run(flat.world, tick)
    assert.equal(flat.world.zombies.get(close)!.state, 'mowered')
    assert.equal(flat.world.projectiles.get(fired)!.position.y, 290)
})

test('a lobbed projectile tumbles forward as it flies, and with nothing to aim at comes down at 700 as the original does', () => {
    for (const team of ['plants', 'zombies'] as const) {
        const { definitions, world, schedule } = flying(false)
        const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: team === 'plants' ? 100 : 700, y: 290, row: 2 },
            motion: LOB, ...(team === 'zombies' ? { team } : {}) })
        const position = world.projectiles.get(pea)!.position
        const start = facing(world, pea)
        for (let tick = 1; tick <= 120; tick++) schedule.run(world, tick)
        // Clockwise thrown right, the other way thrown left, at the cabbage's 0.02 to 0.08 a tick when it gives none.
        const turned = (facing(world, pea) - start) * (team === 'plants' ? 1 : -1)
        assert.ok(turned >= 0.02 * 120 && turned <= 0.08 * 120, `${team} turned ${turned}`)
        // Plant::Fire: 700 - origin, and the mirror image of that for one thrown left, across the board and across its
        // own hitbox (the pea's reaches 15 behind its corner and 40 ahead); it is back at its height by then.
        assert.ok(Math.abs(position.x - (team === 'plants' ? 700 : 100 - 25)) < 1 && Math.abs(position.y - 290) < 8, `${team} at ${position.x}, ${position.y}`)
    }
})

test('a thrown projectile hits at its landing height over the ground, wherever it was thrown from', () => {
    // A melon thrown from a mouth and from a basket 56 higher: both are 144 over the ground, their bottoms, when they
    // hit a zombie, the 105 any thrown projectile comes down to and the melon's own 39 more.
    const heights = [290, 234].map(y => {
        const { definitions, world, schedule } = flying(false)
        const board = definitions.boards['pvz:day']
        const zombie = spawnZombie(world, definitions, 'pvz:normal', 2, 600, 250)
        const melon = launchProjectile(world, definitions, world, { typeId: 'pvz:melon', position: { x: 100, y, row: 2 }, motion: LOB, target: zombie })
        const position = world.projectiles.get(melon)!.position
        for (let tick = 1; tick < 1000 && world.hasEntity(melon) && world.zombies.get(zombie)!.health === 270; tick++) schedule.run(world, tick)
        assert.equal(world.zombies.get(zombie)!.health, 190)
        return rowGroundY(board, 2) - (position.y + 40)
    })
    for (const height of heights) assert.ok(height < 144 && height > 144 - 9, `it hits within a tick's fall of 144 (${height})`)
})

test('a thrown projectile comes down lower before it hits a plant than before it hits a zombie', () => {
    // The height over the ground it was last seen at before it hit: 105 for a zombie and 77 for a plant, and as much
    // higher for either as the projectile says (the melon's 39).
    const lastHeight = (projectile: string, target: string) => {
        const { definitions, levels } = firing('lobber', { id: projectile })
        const game = new LocalIntegratedGame(definitions, levels, undefined, true)
        game.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
        game.command({ type: 'completeIntro' })
        for (const line of ['/plant peashooter 3 1', target]) assert.equal(game.debugCommand(line).ok, true, line)
        game.command({ type: 'resume' })
        let last: number | undefined
        for (let step = 0; step < 3000; step++) {
            game.update(0.01)
            const thrown = game.currentSnapshot!.projectiles[0]
            if (thrown) last = thrown.height
            else if (last !== undefined) break
        }
        return last!
    }
    for (const [projectile, offset] of [['pvz:cabbage', 0], ['pvz:melon', 39]] as const) {
        const zombie = lastHeight(projectile, '/zombie normal 3 8'), plant = lastHeight(projectile, '/plant wallnut 3 7 zombies')
        assert.ok(zombie >= 105 + offset && zombie < 105 + offset + 9, `${projectile} hits a zombie at ${zombie}`)
        assert.ok(plant >= 77 + offset && plant < 77 + offset + 9, `${projectile} hits a plant at ${plant}`)
    }
})

test('a thrown projectile with a shorter flight is thrown lower under the same gravity, and still comes down at its target', () => {
    const top = (flightTicks: number) => {
        const { definitions, world, schedule } = flying(false)
        const pea = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: LOB, overrides: { flightTicks } })
        const position = world.projectiles.get(pea)!.position
        let highest = 0
        for (let tick = 1; tick <= flightTicks; tick++) {
            schedule.run(world, tick)
            highest = Math.max(highest, 290 - position.y)
        }
        assert.ok(Math.abs(position.x - 700) < 1 && Math.abs(position.y - 290) < 8, `${flightTicks}: at ${position.x}, ${position.y}`)
        return Math.round(highest * 100) / 100
    }
    assert.deepEqual([top(120), top(60)], [209.55, 51.52], 'the original rises 209.55 in its 120 ticks')
})

test('a homing mower keeps homing: it crushes its target, then turns to the next across the rows, and never takes to the ground', () => {
    const { definitions, world, schedule } = flying(false)
    const zombies = [[2, 300, 250], [0, 500, 50], [4, 650, 450]].map(([row, x, y]) => spawnZombie(world, definitions, 'pvz:normal', row, x, y))
    const mower = launchProjectile(world, definitions, world, { typeId: 'pvz:lawnmower', position: { x: 96, y: 290, row: 2 }, motion: HOMING, target: zombies[0] })
    const order: number[] = []
    for (let tick = 1; tick < 3000 && world.hasEntity(mower); tick++) {
        schedule.run(world, tick)
        assert.equal(world.projectiles.get(mower)?.motion ?? HOMING, HOMING)
        for (const zombie of zombies) if (world.zombies.get(zombie)!.state === 'mowered' && !order.includes(zombie)) order.push(zombie)
    }
    assert.deepEqual(order, zombies)
})

test("a plant's own way with its projectile is checked as the projectile's attributes are, and leaves what it is alone", () => {
    for (const [type, overrides, message] of [['shooter', { speed: 0 }, /speed must be positive/], ['lobber', { gravity: 1 }, /gravity is not supported/],
        ['lobber', { flightTicks: 1.5 }, /flightTicks must be/], ['lobber', { landingOffset: 'low' }, /landingOffset must be finite/],
        ['lobber', { spin: 1 }, /spin must be an array/], ['lobber', { spin: [2, 1] }, /spin must be an ordered range/], ['seeker', { homingSpeed: 0 }, /homingSpeed must be positive/],
        ['shooter', { hitbox: { x: 0, y: 0, width: 1, height: 1 } }, /hitbox is not supported/], ['shooter', { id: 'pvz:lawnmower', damage: 5 }, /damage is not supported: pvz:lawnmower is of kind mowing/],
        ['seeker', { homingSpeed: 4, turn: 0.01, pierce: true }, undefined]] as const) {
        if (message) assert.throws(() => firing(type, overrides), message)
        else assert.doesNotThrow(() => firing(type, overrides))
    }
})
