import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import { Schedule,World } from '@/server/state/World'
import { LevelStateResource, RandomResource } from '@/server/state/resources'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { EventQueueResource,createEventQueue } from '@/server/state/events'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { createZombieSystem } from '@/server/zombies/system'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { withZombieTypes } from '../zombieTypes'
import { newPlant, withPlantTypes } from '../plantTypes'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const board = definitions.boards['pvz:day']

function game(content = definitions) {
    const world = withPlantTypes(withZombieTypes(new World(), content), content)
    world.resources.set(RandomResource, new DeterministicRng(1))
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(LevelStateResource, {
        id: 'pvz:test',
        definition: {
            adventureIndex: 1,
            board: 'pvz:day',
            activeRows: [2],
            startingSun: 0,
            seedPackets: ['pvz:peashooter'],
            lawnMower: 'pvz:lawnmower',
            skySun: 'pvz:sun',
            waves: [{ zombies: ['pvz:normal'] }],
            award: { kind: 'seed' as const, id: 'pvz:test' },
        },
        board,
        phase: 'gameplay',
        result: 'playing' as const,
        paused: false,
    })
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(content))
    let tick = 0
    return { world, run: () => schedule.run(world, ++tick) }
}




test('normal zombie uses grounded walking, loses limbs, bites, dies, and loses at the board edge', () => {
    const walking = game()
    const walker = spawnZombie(walking.world, definitions, 'pvz:normal', 2, 700, 280)
    walking.run()
    // Zombie::UpdateZombieWalking: a tick takes it as far as the ground goes between the frames its clip is at, at the
    // clip's rate, which is its speed's (Zombie::UpdateAnimSpeed).
    const body = walking.world.zombies.get(walker)!.animations.body, walk = definitions.zombies['pvz:normal'].animation.clips[body.clip]
    const speed = walking.world.zombies.get(walker)!.speedPerTick
    assert.ok(Math.abs(body.rate - speed * walk.frames / (walk.ground!.at(-1)! - walk.ground![0]) * 47) < 1e-9)
    assert.ok(Math.abs(700 - walking.world.zombies.get(walker)!.position.x - (walk.ground![1] - walk.ground![0]) * body.rate / 100) < 1e-9)
    assert.ok(Math.abs(body.time - body.rate / 100) < 1e-12)
    let previousX = walking.world.zombies.get(walker)!.position.x
    for (let tick = 0; tick < 300; tick++) {
        walking.run()
        const x = walking.world.zombies.get(walker)!.position.x
        assert.equal(previousX - x < 2, true)
        previousX = x
    }

    const eating = game()
    const plant = eating.world.createEntity()
    eating.world.insert(eating.world.plants, newPlant(eating.world, 'pvz:peashooter', { id: plant, position: { x: 40, y: 280, row: 2 } }))
    const eater = spawnZombie(eating.world, definitions, 'pvz:normal', 2, 40, 280)
    for (let tick = 0; tick < 3; tick++) eating.run()
    assert.equal(eating.world.plants.get(plant)!.health, 300)
    eating.run()
    assert.equal(eating.world.zombies.get(eater)!.state, 'eating')
    assert.equal(eating.world.plants.get(plant)!.health, 296)
    for (let tick = 0; tick < 4; tick++) eating.run()
    assert.equal(eating.world.plants.get(plant)!.health, 292)
    // Its first chew, 16 ticks into its eat.
    for (let tick = 0; tick < 11; tick++) eating.run()
    assert.equal(
        eating.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieChewedPlant'),
        true,
        'the client flashes the chewed plant',
    )
    eating.run()
    const eatEvents = eating.world.resources.get(EventQueueResource).events
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 0)
    eating.world.plants.get(plant)!.health = definitions.zombies['pvz:normal'].bite.damage
    const otherEater = spawnZombie(eating.world, definitions, 'pvz:normal', 2, 40, 280)
    for (const zombie of [eater, otherEater]) {
        eating.world.zombies.get(zombie)!.age = definitions.zombies['pvz:normal'].bite.cadenceTicks - 1
    }
    eating.run()
    assert.equal([...eating.world.plants].length, 0)
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 1, 'simultaneous bites emit one eaten event')
    assert.equal(eatEvents.find(event => event.type === 'plantEaten')!.data.plantId, plant)
    eating.run()
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 1)

    const headless = game()
    const ignoredPlant = headless.world.createEntity()
    headless.world.insert(headless.world.plants, newPlant(headless.world, 'pvz:peashooter', { id: ignoredPlant, position: { x: 40, y: 280, row: 2 } }))
    const headlessWalker = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    for (let tick = 0; tick < 4; tick++) headless.run()
    assert.equal(headless.world.zombies.get(headlessWalker)!.state, 'eating')
    const bitten = headless.world.plants.get(ignoredPlant)!.health
    damageZombie(headless.world, definitions, headlessWalker, 200)
    // Past the tick it would look again: without its head it goes on eating, and bites no more.
    for (let tick = 0; tick < 4; tick++) headless.run()
    assert.equal(headless.world.zombies.get(headlessWalker)!.state, 'eating')
    assert.equal(headless.world.plants.get(ignoredPlant)!.health, bitten)

    const neverStartedEating = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    damageZombie(headless.world, definitions, neverStartedEating, 200)
    for (let tick = 0; tick < 4; tick++) headless.run()
    assert.equal(headless.world.zombies.get(neverStartedEating)!.state, 'walking')

    const dying = game()
    const corpse = spawnZombie(dying.world, definitions, 'pvz:normal', 2, 700, 280)
    damageZombie(dying.world, definitions, corpse, 100)
    assert.ok(dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieHit' && event.data.entityId === corpse),
        'the client flashes the hit zombie')
    dying.run()
    assert.equal(dying.world.zombies.get(corpse)!.hasArm, false)
    damageZombie(dying.world, definitions, corpse, 100)
    assert.equal(dying.world.zombies.get(corpse)!.hasHead, false)
    assert.deepEqual(
        dying.world.resources.get(EventQueueResource).events.map(event => event.data.part).filter(Boolean),
        ['arm', 'head'],
    )
    damageZombie(dying.world, definitions, corpse, 70)
    const deathTicks = dying.world.zombies.get(corpse)!.deathTicksRemaining
    const dyingZombie = dying.world.zombies.get(corpse)!
    const death = dyingZombie.animations.body
    assert.equal(deathTicks, Math.ceil((death.clip === 'death2' ? 33 : 39) / death.rate * 100) + 100)
    assert.equal(dying.world.zombies.get(corpse)!.state, 'dying')
    assert.equal(
        dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieDying'),
        false,
    )
    for (let tick = 0; tick < deathTicks &&
        !dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieDying'); tick++) {
        dying.run()
    }
    assert.equal(dying.world.hasEntity(corpse), true)
    assert.equal(
        dying.world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieDying').length,
        1,
    )
    const elapsedDeathTicks = deathTicks - dying.world.zombies.get(corpse)!.deathTicksRemaining
    for (let tick = elapsedDeathTicks; tick < deathTicks - 1; tick++) dying.run()
    assert.equal(dying.world.hasEntity(corpse), true)
    dying.run()
    assert.equal(dying.world.hasEntity(corpse), false)

    const lost = game()
    spawnZombie(lost.world, definitions, 'pvz:normal', 2, -99.9, 280)
    lost.run()
    assert.equal(lost.world.resources.get(LevelStateResource).result, 'lost')
})




test('zombie targets follow a plant’s position, its state and its removal', () => {
    const { world, run } = game()
    const plant = world.createEntity()
    world.insert(world.plants, newPlant(world, 'pvz:peashooter', { id: plant, position: { x: 40, y: 280, row: 2 } }))
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 2, 70, 280)
    const state = () => world.zombies.get(zombie)!.state
    // Back where it was put, on the tick before one it looks for prey on (CheckIfPreyCaught).
    const looksAgain = () => {
        const looking = world.zombies.get(zombie)!
        looking.position.x = 70
        looking.age = definitions.zombies['pvz:normal'].bite.cadenceTicks - 1
    }
    looksAgain(); run()
    assert.equal(state(), 'eating')
    world.plants.get(plant)!.position = { x: 400, y: 280, row: 2 }
    looksAgain(); run()
    assert.equal(state(), 'walking', 'a new position is seen')
    world.plants.get(plant)!.position.x = 40
    looksAgain(); run()
    assert.equal(state(), 'eating', 'a moved position is seen')
    world.plants.get(plant)!.state = 'mowered'
    looksAgain(); run()
    assert.equal(state(), 'walking', 'a plant out of play is no target')
    world.destroyEntity(plant)
    looksAgain(); run()
    assert.equal(state(), 'walking')
})

test('a zombie looks for prey as CheckIfPreyCaught does: on every fourth tick of its age, every eighth chilled, from where it stood in whole pixels, at the first plant put down', () => {
    const { attack, bite } = definitions.zombies['pvz:normal'], body = definitions.plants['pvz:peashooter'].body
    // Coming from the right, its attack reaches a plant at `x` by 20 from here on.
    const reach = (x: number) => x + body.x + body.width - attack.x - 20
    const put = (lawn: ReturnType<typeof game>, x: number) => {
        const entity = lawn.world.createEntity()
        lawn.world.insert(lawn.world.plants, newPlant(lawn.world, 'pvz:peashooter', { id: entity, position: { x, y: 280, row: 2 } }))
        return entity
    }

    const walking = game(), walked = put(walking, 200)
    const walker = walking.world.zombies.get(spawnZombie(walking.world, definitions, 'pvz:normal', 2, reach(200), 280))!
    for (let tick = 1; tick < bite.cadenceTicks; tick++) walking.run()
    assert.equal(walker.state, 'walking', 'it walks on with the plant in reach until it looks')
    walking.run()
    assert.deepEqual([walker.state, walking.world.plants.get(walked)!.health], ['eating', 300 - bite.damage], 'it bites as it catches it')

    // Zombie::mX: half a pixel short of reaching it reaches it, a whole one does not.
    for (const [offset, state] of [[0.5, 'eating'], [1, 'walking']] as const) {
        const near = game()
        put(near, 200)
        const zombie = near.world.zombies.get(spawnZombie(near.world, definitions, 'pvz:normal', 2, reach(200) + offset, 280))!
        zombie.age = bite.cadenceTicks - 1
        near.run()
        assert.equal(zombie.state, state, `${offset} px short`)
    }

    const chilled = game()
    put(chilled, 200)
    const entity = spawnZombie(chilled.world, definitions, 'pvz:normal', 2, reach(200) - 5, 280), cold = chilled.world.zombies.get(entity)!
    damageZombie(chilled.world, definitions, entity, 1, { chillTicks: 1000 })
    cold.age = bite.cadenceTicks - 1
    chilled.run()
    assert.equal(cold.state, 'walking', 'chilled, it does not look on the fourth tick')
    cold.age = 2 * bite.cadenceTicks - 1
    chilled.run()
    assert.equal(cold.state, 'eating', 'but on the eighth')

    // Of two plants a wide attack reaches, the one put down first, though the other is nearer the house.
    const wide = { ...definitions, zombies: { ...definitions.zombies, 'pvz:normal': { ...definitions.zombies['pvz:normal'], attack: { ...attack, x: -100, width: 300 } } } }
    const both = game(wide), first = put(both, 280), second = put(both, 200)
    both.world.zombies.get(spawnZombie(both.world, wide, 'pvz:normal', 2, 200, 280))!.age = bite.cadenceTicks - 1
    both.run()
    assert.deepEqual([first, second].map(plant => both.world.plants.get(plant)!.health), [300 - bite.damage, 300])
})

test('a chilled zombie body goes at half its rate and its flag at its own, which it lets go with its head', () => {
    const { world, run } = game()
    const entity = spawnZombie(world, definitions, 'pvz:flag', 2, 700, 280)
    const zombie = world.zombies.get(entity)!
    damageZombie(world, definitions, entity, 1, { chillTicks: 1000 })
    const before = { body: zombie.animations.body.time, flag: zombie.animations.flag.time }
    run()
    // Zombie::ApplyAnimRate halves the body alone; the flag is a Reanim of its own at 15 a second.
    assert.ok(Math.abs(zombie.animations.body.time - before.body - zombie.animations.body.rate / 2 / 100) < 1e-9)
    assert.ok(Math.abs(zombie.animations.flag.time - before.flag - 15 / 100) < 1e-9)
    damageZombie(world, definitions, entity, 200)
    assert.equal(zombie.animations.flag, undefined, 'Zombie::DropFlag')
    // The client draws what falls by the zombie's type, which the event says.
    assert.ok(world.resources.get(EventQueueResource).events.some(event => event.type === 'zombiePartDropped' && event.data.part === 'flag'
        && event.data.typeId === 'pvz:flag'))
})

test('a zombie that stops eating sets off again as StartWalkAnim does: a new speed and walk; the flag zombie always takes walk2', () => {
    const eating = game()
    const plant = eating.world.createEntity()
    eating.world.insert(eating.world.plants, newPlant(eating.world, 'pvz:peashooter', { id: plant, position: { x: 300, y: 280, row: 2 }, column: 3 }))
    const zombies = Array.from({ length: 12 }, () => spawnZombie(eating.world, definitions, 'pvz:normal', 2, 330, 280))
    const flags = Array.from({ length: 4 }, () => spawnZombie(eating.world, definitions, 'pvz:flag', 2, 330, 280))
    const before = new Map([...zombies, ...flags].map(entity => [entity, { ...eating.world.zombies.get(entity)! }]))
    // They catch the plant as they first look, on the fourth tick of their age, each biting it once.
    for (let tick = 0; tick < 4; tick++) eating.run()
    assert.deepEqual([...zombies, ...flags].map(entity => eating.world.zombies.get(entity)!.state), Array(16).fill('eating'))
    eating.world.destroyEntity(plant)
    // They stop as they look again, four ticks on.
    for (let tick = 0; tick < 4; tick++) eating.run()
    const after = [...zombies, ...flags].map(entity => eating.world.zombies.get(entity)!)
    assert.deepEqual(after.map(zombie => zombie.state), Array(16).fill('walking'))
    const { min, max } = definitions.zombies['pvz:normal'].speedPerTick
    assert.ok(zombies.every(entity => { const speed = eating.world.zombies.get(entity)!.speedPerTick; return speed >= min && speed <= max }))
    assert.ok(zombies.some(entity => eating.world.zombies.get(entity)!.speedPerTick !== before.get(entity)!.speedPerTick), 'PickRandomSpeed')
    const walks = zombies.map(entity => eating.world.zombies.get(entity)!)
    assert.ok(walks.some(zombie => zombie.walkClip === 'walk') && walks.some(zombie => zombie.walkClip === 'walk2'), 'Rand(2)')
    assert.ok(walks.every(zombie => zombie.animations.body.clip === zombie.walkClip))
    // StartWalkAnim fixes the flag zombie's variant at 0: anim_walk2, from its start too.
    assert.ok(flags.every(entity => before.get(entity)!.walkClip === 'walk2' && eating.world.zombies.get(entity)!.walkClip === 'walk2'))
})

test('a zombie rising from a grave plays its walk in place (Zombie::UpdateReanim) and sets off once it is up', () => {
    const { world, run } = game()
    const entity = spawnZombie(world, definitions, 'pvz:normal', 2, 400, 270)
    const zombie = world.zombies.get(entity)!
    zombie.riseTicks = 3
    const start = zombie.animations.body.time, x = world.zombies.get(entity)!.position.x
    run()
    run()
    assert.ok(zombie.animations.body.time > start, 'its arms swing as it comes up')
    assert.equal(world.zombies.get(entity)!.position.x, x, 'it stays at its grave')
})
