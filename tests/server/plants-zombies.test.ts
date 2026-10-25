import { readGameplaySource } from '../../tools/content_source'
import assert from 'node:assert/strict'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { DeterministicRng } from '@/server/DeterministicRng'
import { EventQueueResource, createEventQueue } from '@/server/events'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import {
    LevelStateResource,
    PlantAttackComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    ZombieComponent,
} from '@/server/components'
import { createPeashooterSystem } from '@/server/plants/shooter'
import { createPlantAbilitySystem, initialPlantAbility } from '@/server/plants/abilities'
import { createProjectileSystem } from '@/server/projectiles'
import { createZombieSystem } from '@/server/zombies/system'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import type { JsonValue } from '@/shared/protocol/index'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const board = definitions.boards['pvz:day']

function game(config = definitions) {
    const world = new World()
    world.resources.set(RandomResource, new DeterministicRng(7))
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(LevelStateResource, {
        id: 'pvz:test',
        definition: { ...levels.levels['pvz:adventure-1-1'], activeRows: [0, 1, 2, 3, 4] },
        board,
        phase: 'gameplay',
        result: 'playing' as const,
        paused: false,
    })
    const schedule = new Schedule()
    schedule.add('plant', createPeashooterSystem(config))
    schedule.add('plant', createPlantAbilitySystem(config))
    schedule.add('zombie', createZombieSystem(config))
    schedule.add('projectile', createProjectileSystem(config))
    let tick = 0
    const run = (ticks = 1) => { for (let index = 0; index < ticks; index++) schedule.run(world, ++tick) }
    const plant = (typeId: string, row: number, column: number) => {
        const entity = world.createEntity()
        const definition = config.plants[typeId]
        world.add(entity, PositionComponent, { x: board.origin.x + column * board.cell.width, y: board.origin.y + row * board.cell.height, row })
        world.add(entity, PlantComponent, {
            typeId, seedId: typeId, column, health: definition.maxHealth, maxHealth: definition.maxHealth, eatenFlashCounter: 0, recentlyEatenCounter: 0,
            ...(initialPlantAbility(definition) ? { ability: initialPlantAbility(definition) } : {}),
        })
        if (definition.shooter) world.add(entity, PlantAttackComponent, { readyAtTick: definition.shooter.initialDelayTicks })
        return entity
    }
    const zombie = (typeId: string, row: number, x: number) =>
        spawnZombie(world, config, typeId, row, x, board.origin.y + row * board.cell.height - 30)
    const events = (type: string) => world.resources.get(EventQueueResource).events.filter(event => event.type === type)
    return { world, run, plant, zombie, events }
}

test('projectile cleanup follows the current board bounds instead of a fixed screen width', () => {
    const { world, run } = game()
    const level = world.resources.get(LevelStateResource)
    level.board = { ...level.board, bounds: { left: 0, right: 1000 } }
    const id = world.createEntity()
    world.add(id, PositionComponent, { x: 900, y: 280, row: 2 })
    world.add(id, ProjectileComponent, { typeId: 'pvz:pea', sourcePlantId: 0 })
    run()
    assert.equal(world.hasEntity(id), true)
    level.board = { ...level.board, bounds: { left: 0, right: 850 } }
    run()
    assert.equal(world.hasEntity(id), false)
})

test('a cherry bomb burns every zombie in its 3x3 area after the fuse, ignoring helms, while zombies cannot hurt it', () => {
    const { world, run, plant, zombie, events } = game()
    const bomb = plant('pvz:cherrybomb', 2, 4)
    const eater = zombie('pvz:buckethead', 2, 340)
    const above = zombie('pvz:normal', 1, 400)
    const farRow = zombie('pvz:normal', 4, 360)
    const farColumn = zombie('pvz:normal', 2, 700)
    run(99)
    assert.equal(world.get(eater, ZombieComponent)!.state, 'eating')
    assert.equal(world.get(bomb, PlantComponent)!.health, 300, 'a lit cherry bomb is chewed without damage')
    run()
    assert.equal(world.hasEntity(bomb), false)
    assert.deepEqual(events('zombieCharred').map(event => event.data.entityId).sort(), [eater, above].sort())
    assert.equal(world.hasEntity(eater) || world.hasEntity(above), false)
    assert.equal(world.hasEntity(farRow) && world.hasEntity(farColumn), true)
    assert.equal(events('plantExploded')[0].data.typeId, 'pvz:cherrybomb')
})

test('target insets are configured interactions and do not depend on vault capability', () => {
    for (const inset of [0, 40]) {
        const config = structuredClone(definitions)
        config.plants['pvz:potatomine'].mine!.targeting.insetKey = 'test:ground'
        config.zombies['test:walker'] = { ...config.zombies['pvz:normal'], targetingInsets: { 'test:ground': inset } }
        const { world, plant, zombie, run } = game(config)
        const mine = plant('pvz:potatomine', 2, 2)
        world.get(mine, PlantComponent)!.ability = { state: 'armed', ticks: 0 }
        zombie('test:walker', 2, 145)
        run()
        assert.equal(world.hasEntity(mine), inset > 0)
    }
})

test('a potato mine arms after 15 seconds, rises, then blows up the first zombie that reaches it without leaving a body', () => {
    const { world, run, plant, zombie, events } = game()
    const mine = plant('pvz:potatomine', 2, 2)
    const ability = () => world.get(mine, PlantComponent)!.ability!
    run(1499)
    assert.equal(ability().state, 'arming')
    run()
    assert.equal(ability().state, 'rising')
    assert.equal(events('mineRising').length, 1)
    run(106)
    assert.equal(ability().state, 'armed')

    const vaulter = zombie('pvz:pole_vaulter', 2, 210)
    world.get(vaulter, PositionComponent)!.x = 150
    world.get(vaulter, ZombieComponent)!.speedPerTick = 0
    run()
    assert.equal(world.hasEntity(mine), true, 'a running pole vaulter does not set the mine off')
    world.destroyEntity(vaulter)

    const bucket = zombie('pvz:buckethead', 2, 220)
    const safe = zombie('pvz:normal', 2, 400)
    for (let tick = 0; tick < 400 && world.hasEntity(mine); tick++) run()
    assert.equal(world.hasEntity(mine), false)
    assert.equal(world.hasEntity(bucket), false, '1800 damage removes the bucket and body together')
    assert.equal(events('zombieDying').length, 0, 'mine victims vanish instead of falling')
    assert.equal(world.hasEntity(safe), true)
})

test('a chomper swallows a zombie in reach, digests for 40 seconds and misses pole vaulters still holding the pole', () => {
    const { world, run, plant, zombie, events } = game()
    const chomper = plant('pvz:chomper', 2, 2)
    const ability = () => world.get(chomper, PlantComponent)!.ability!
    const meal = zombie('pvz:conehead', 2, 250)
    for (let tick = 0; tick < 300 && ability().state === 'ready'; tick++) run()
    assert.equal(ability().state, 'biting')
    run(70)
    assert.equal(world.hasEntity(meal), false)
    assert.equal(ability().state, 'got-one')
    assert.equal(events('chomperBit')[0].data.ate, true)
    run(35)
    assert.equal(ability().state, 'digesting')
    run(4000)
    assert.equal(ability().state, 'swallowing')
    run(234)
    assert.equal(ability().state, 'ready')

    const vaulter = zombie('pvz:pole_vaulter', 2, 260)
    world.get(vaulter, ZombieComponent)!.speedPerTick = 0
    run()
    assert.equal(ability().state, 'biting')
    run(70)
    assert.equal(world.hasEntity(vaulter), true)
    assert.equal(ability().state, 'missed')
    run(35)
    assert.equal(ability().state, 'ready')
})

test('helms absorb damage first and drop once, and snow peas chill through them, halving walking and biting', () => {
    const { world, run, zombie, events } = game()
    const cone = zombie('pvz:conehead', 0, 600)
    damageZombie(world, definitions, cone, 360)
    assert.equal(world.get(cone, ZombieComponent)!.helmHealth, 10)
    assert.equal(world.get(cone, ZombieComponent)!.health, 270)
    damageZombie(world, definitions, cone, 30, { chillTicks: 1000 })
    assert.equal(world.get(cone, ZombieComponent)!.helmHealth, 0)
    assert.equal(world.get(cone, ZombieComponent)!.health, 250, 'overflow reaches the body')
    assert.equal(world.get(cone, ZombieComponent)!.chilledTicks, 1000)
    assert.deepEqual(events('zombieHelmDropped').map(event => event.data.helm), ['cone'])
    assert.equal(events('zombieChilled').length, 1)

    const warm = zombie('pvz:normal', 1, 600)
    const cold = zombie('pvz:normal', 3, 600)
    world.get(cold, ZombieComponent)!.speedPerTick = world.get(warm, ZombieComponent)!.speedPerTick
    damageZombie(world, definitions, cold, 1, { chillTicks: 1000 })
    run(200)
    // Walking follows the `_ground` track, so the halved animation also halves the pace.
    const warmFrames = world.get(warm, ZombieComponent)!.animationTime
    const coldFrames = world.get(cold, ZombieComponent)!.animationTime
    assert.ok(Math.abs(coldFrames * 2 - warmFrames) < 1e-6, `${coldFrames} should be half of ${warmFrames}`)
    assert.equal(world.get(cold, ZombieComponent)!.chilledTicks, 800)

    const plants = game()
    for (const row of [1, 3]) plants.plant('pvz:wallnut', row, 2)
    const biter = plants.zombie('pvz:normal', 1, 180)
    const slowBiter = plants.zombie('pvz:normal', 3, 180)
    damageZombie(plants.world, definitions, slowBiter, 1, { chillTicks: 1000 })
    plants.run(400)
    const bitten = (row: number) => 4000 - plants.world.get([...plants.world.query(PlantComponent)]
        .find(entity => plants.world.get(entity, PositionComponent)!.row === row)!, PlantComponent)!.health
    assert.ok(plants.world.get(biter, ZombieComponent)!.state === 'eating' && plants.world.get(slowBiter, ZombieComponent)!.state === 'eating')
    assert.ok(Math.abs(bitten(3) * 2 - bitten(1)) <= 8, `chilled bites ${bitten(3)} should be half of ${bitten(1)}`)
})

test('snow peas carry the chill and the impact reports the helm worn when hit', () => {
    const { world, run, plant, zombie, events } = game()
    plant('pvz:snowpea', 2, 0)
    const bucket = zombie('pvz:buckethead', 2, 400)
    for (let tick = 0; tick < 400 && events('projectileImpact').length === 0; tick++) run()
    const impact = events('projectileImpact')[0]
    assert.equal(impact.data.typeId, 'pvz:snow_pea')
    assert.equal(impact.data.helm, 'bucket')
    assert.equal(impact.data.targetTypeId, 'pvz:buckethead')
    assert.equal(world.get(bucket, ZombieComponent)!.helmHealth, 1080)
    assert.ok(world.get(bucket, ZombieComponent)!.chilledTicks > 990)
})

test('a pole vaulter runs at the first plant, vaults past it and walks on slowly to eat the next one', () => {
    const { world, run, plant, zombie, events } = game()
    const wall = plant('pvz:wallnut', 2, 5)
    const behind = plant('pvz:peashooter', 2, 1)
    const vaulter = zombie('pvz:pole_vaulter', 2, 700)
    const state = () => world.get(vaulter, ZombieComponent)!
    assert.ok(state().speedPerTick >= 0.66 && state().speedPerTick <= 0.68)
    assert.equal(state().animation, 'anim_run')
    for (let tick = 0; tick < 2000 && state().state !== 'vaulting'; tick++) run()
    assert.equal(state().state, 'vaulting')
    assert.equal(state().hasPole, false)
    const takeoff = world.get(vaulter, PositionComponent)!.x
    for (let tick = 0; tick < 400 && state().state === 'vaulting'; tick++) run()
    assert.equal(state().animation, 'anim_walk')
    assert.ok(world.get(vaulter, PositionComponent)!.x < world.get(wall, PositionComponent)!.x - 40, 'lands behind the wall-nut')
    // Takeoff is about 79px right of the plant, so the original formula adds almost nothing to the 150px landing.
    assert.ok(takeoff - world.get(vaulter, PositionComponent)!.x > 140)
    assert.ok(state().speedPerTick >= 0.23 && state().speedPerTick <= 0.37)
    assert.deepEqual(events('zombieVaultSound').map(event => event.data.sound), ['grassstep', 'polevault'])
    assert.equal(world.get(wall, PlantComponent)!.health, 4000)
    for (let tick = 0; tick < 4000 && state().state !== 'eating'; tick++) run()
    assert.equal(state().state, 'eating', 'after landing it eats the next plant')
    assert.equal(world.hasEntity(behind), true)
    const behindX = world.get(behind, PositionComponent)!.x
    world.get(vaulter, PositionComponent)!.x = behindX + 1
    run()
    assert.equal(state().state, 'walking', 'the narrow post-vault attack needs 20px overlap before eating')
    world.get(vaulter, PositionComponent)!.x = behindX
    run()
    assert.equal(state().state, 'eating', 'the post-vault attack reaches the plant at x + 50')
})

test('an eaten explode-o-nut chars the zombies around it', () => {
    const { world, run, plant, zombie, events } = game()
    const nut = plant('pvz:explodenut', 2, 3)
    world.get(nut, PlantComponent)!.health = 8
    const eater = zombie('pvz:normal', 2, 260)
    for (let tick = 0; tick < 1500 && world.hasEntity(nut); tick++) run()
    assert.equal(world.hasEntity(nut), false)
    assert.equal(world.hasEntity(eater), false)
    assert.equal(events('zombieCharred')[0].data.entityId, eater)
    assert.equal(events('plantExploded')[0].data.typeId, 'pvz:explodenut')
})

test('a pole vaulter ground track can move backwards locally without jumping a full stride, including after losing its head', () => {
    for (const headless of [false, true]) {
        const { world, run, zombie } = game()
        const id = zombie('pvz:pole_vaulter', 2, 600)
        const body = world.get(id, ZombieComponent)!
        body.hasPole = false
        body.animation = 'anim_walk'
        body.animationTime = 40
        body.speedPerTick = 0.3
        if (headless) damageZombie(world, definitions, id, 350)
        let previous = world.get(id, PositionComponent)!.x
        for (let tick = 0; tick < 50; tick++) {
            run()
            const x = world.get(id, PositionComponent)!.x
            assert.ok(Math.abs(x - previous) < 2, `unexpected displacement: ${previous} -> ${x}`)
            previous = x
        }
    }
})

test('a pole vaulter keeps its landing position when the chill expires during the jump', () => {
    const land = (chilledTicks: number) => {
        const { world, run, plant, zombie } = game()
        const obstacle = plant('pvz:wallnut', 2, 2)
        const id = zombie('pvz:pole_vaulter', 2, world.get(obstacle, PositionComponent)!.x + 40)
        const body = world.get(id, ZombieComponent)!
        body.chilledTicks = chilledTicks
        run()
        assert.equal(body.state, 'vaulting')
        for (let tick = 0; body.state === 'vaulting' && tick < 500; tick++) run()
        assert.equal(body.state, 'walking')
        return world.get(id, PositionComponent)!.x
    }
    const normal = land(0)
    assert.ok(Math.abs(land(1000) - normal) < 1)
    assert.ok(Math.abs(land(20) - normal) < 1)
})

test('plant abilities and new zombie state survive a server save', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({
        protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-2',
        randomSeed: 3, initialMoney: 0, firstAdventure: false, mods: [],
    })
    server.enqueueCommand(2, { type: 'completeIntro' })
    server.tick()
    for (const command of ['/plant potatomine 3 3', '/plant chomper 3 5', '/plant cherrybomb 1 9', '/zombie pole_vaulter 3', '/zombie buckethead 2']) {
        server.enqueueDebugCommand(3, command)
    }
    for (let tick = 0; tick < 20; tick++) server.tick()
    const saved = server.save()
    const restored = new IntegratedGameServer(definitions, levels)
    const snapshot = restored.start({
        protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-2',
        randomSeed: 3, initialMoney: 0, firstAdventure: false, mods: [], save: saved as unknown as JsonValue,
    })
    assert.deepEqual(restored.save(), saved)
    assert.deepEqual(snapshot.plants.map(plant => plant.ability?.state).sort(), ['arming', 'fuse', 'ready'])
    assert.equal(snapshot.zombies.find(zombie => zombie.typeId === 'pvz:pole_vaulter')?.hasPole, true)
    assert.equal(snapshot.zombies.find(zombie => zombie.typeId === 'pvz:buckethead')?.helmHealth, 1100)
    assert.equal([...(restored as unknown as { session: { world: World } }).session.world.query(ProjectileComponent)].length, 0)
})
