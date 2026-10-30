import assert from 'node:assert/strict'
import test from 'node:test'
import { Schedule, World } from '@/ecs'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { LevelStateResource, PlantComponent, PlantAttackComponent, PositionComponent, ProjectileComponent, RandomResource, ZombieComponent } from '@/server/state/components'
import { createEventQueue, drainServerEvents, EventQueueResource } from '@/server/state/events'
import { createPeashooterSystem } from '@/server/plants/shooter'
import { createPlantAbilitySystem, initialPlantAbility } from '@/server/plants/abilities'
import { createProductionSystem } from '@/server/plants/production'
import { ItemComponent } from '@/server/state/levelState'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createProjectileSystem } from '@/server/combat/projectiles'
import { createZombieSystem } from '@/server/zombies/system'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-1', randomSeed: 7, initialMoney: 0, firstAdventure: true, mods: [] }
function restore(save: ReturnType<IntegratedGameServer['save']>) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, save: save as unknown as JsonValue })
    return server
}

test('2-1 runs Dave before choosing, blocks graves, has no sky sun, and restores the delayed final-wave emergence', () => {
    const server = new IntegratedGameServer(definitions, levels)
    const initial = server.start(options)
    assert.equal(initial.wave.total, 10)
    assert.deepEqual(initial.graves!.map(grave => grave.column), [6, 7, 8, 8])
    assert.equal(new Set(initial.graves!.map(grave => `${grave.row}:${grave.column}`)).size, 4)
    assert.equal(runCommand(server, { type: 'chooseSeed', seedId: 'pvz:puffshroom' }), 'intro-not-complete')
    for (let index = 201; index <= 207; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    for (const seedId of ['puffshroom', 'sunflower', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine']) {
        assert.equal(runCommand(server, { type: 'chooseSeed', seedId: `pvz:${seedId}` }), undefined)
    }
    assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    assert.equal(server.save().tutorial.sunAtTick, undefined)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:puffshroom' })
    const grave = initial.graves![0]
    assert.equal(runCommand(server, { type: 'placePlant', row: grave.row, column: grave.column }), 'cell-has-grave')
    assert.equal(server.snapshot().sun, 50)
    assert.equal(server.snapshot().plants.length, 0)
    assert.ok(server.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_PLANT_NOT_ON_GRAVE'))
    assert.equal(runCommand(server, { type: 'placePlant', row: grave.row, column: grave.column }), 'cell-has-grave')
    assert.ok(!server.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_PLANT_NOT_ON_GRAVE'), 'grave advice is shown only once per game')
    assert.equal(runCommand(server, { type: 'placePlant', row: 0, column: 0 }), undefined)
    assert.ok(server.drainEvents().some(event => event.type === 'adviceCleared' && event.data.key === 'ADVICE_PLANT_NOT_ON_GRAVE'))
    const puff = server.snapshot().plants[0]
    assert.ok(puff.x >= 35 && puff.x <= 44 && puff.y >= 77 && puff.y <= 82)
    assert.notDeepEqual([puff.x, puff.y], [40, 80], 'the original puff-shroom planting jitter changes its stored position')
    const save = server.save()
    assert.deepEqual(restore(save).save(), save)
    const resumed = restore(save)
    assert.equal(runCommand(resumed, { type: 'selectSeed', seedId: 'pvz:sunflower' }), undefined)
    assert.equal(runCommand(resumed, { type: 'placePlant', row: grave.row, column: grave.column }), 'cell-has-grave')
    assert.ok(!resumed.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_PLANT_NOT_ON_GRAVE'), 'clearing advice and restoring the save must preserve its displayed flag')
    save.wave.index = 9
    save.wave.nextWaveAtTick = save.gameplayTick + 1
    save.wave.hugeWaveAnnounced = true
    const final = restore(save)
    final.tick()
    assert.equal(final.snapshot().wave.index, 10)
    assert.ok(final.snapshot().zombies.some(zombie => zombie.typeId === 'pvz:newspaper'))
    const pending = final.save()
    const waveZombies = final.snapshot().zombies.length
    for (let tick = 0; tick < 199; tick++) final.tick()
    assert.equal(final.snapshot().zombies.length, waveZombies)
    final.tick()
    const risen = final.snapshot().zombies.filter(zombie => zombie.riseTicks)
    assert.equal(risen.length, 4)
    assert.ok(risen.every(zombie => zombie.typeId === 'pvz:normal'))
    const emerged = restore(final.save())
    for (let tick = 0; tick < 160; tick++) { final.tick(); emerged.tick() }
    assert.deepEqual(emerged.save(), final.save())
    assert.ok(final.snapshot().zombies.every(zombie => zombie.riseTicks === undefined))
    // A final wave cleared before the graves open drops the award, and then no grave zombie rises.
    pending.entities = pending.entities.filter(entity => !entity.zombie)
    pending.wave.zombieIds = []
    const cleared = restore(pending)
    for (let tick = 0; tick < 250; tick++) cleared.tick()
    assert.equal(cleared.snapshot().items.length, 1)
    assert.equal(cleared.snapshot().zombies.length, 0)
})

function worldFor(night: boolean) {
    const world = new World()
    const definition = levels.levels['pvz:adventure-2-1'], board = definitions.boards[night ? 'pvz:night' : 'pvz:day']
    world.resources.set(LevelStateResource, { id: options.levelId, definition, board, phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(RandomResource, new DeterministicRng(7))
    world.resources.set(EventQueueResource, createEventQueue())
    return world
}

test('puff-shrooms sleep by day, only fire within range, and spores expire before collision at age 75', () => {
    for (const night of [false, true]) {
        const world = worldFor(night), schedule = new Schedule()
        schedule.add('plant', createPeashooterSystem(definitions))
        const plant = world.createEntity()
        world.add(plant, PositionComponent, { x: 40, y: 80, row: 0 })
        world.add(plant, PlantComponent, { typeId: 'pvz:puffshroom', seedId: 'pvz:puffshroom', column: 0,
            health: 300, maxHealth: 300, eatenFlashCounter: 0, recentlyEatenCounter: 0 })
        world.add(plant, PlantAttackComponent, { readyAtTick: 0 })
        const zombie = spawnZombie(world, definitions, 'pvz:normal', 0, 400, 50)
        schedule.run(world, 1)
        assert.equal(world.get(plant, PlantAttackComponent)!.fireAtTick, undefined)
        world.get(zombie, PositionComponent)!.x = 240
        for (let tick = 2; tick <= 200; tick++) schedule.run(world, tick)
        assert.equal([...world.query(ProjectileComponent)].length > 0, night)
    }
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 0, 100, 50)
    const spore = world.createEntity()
    world.add(spore, PositionComponent, { x: 100, y: 80, row: 0 })
    world.add(spore, ProjectileComponent, { typeId: 'pvz:spore', ticksLeft: 1 })
    schedule.run(world, 1)
    assert.equal(world.hasEntity(spore), false)
    assert.equal(world.get(zombie, ZombieComponent)!.health, 270)
})

test('a newspaper blocks chill until damage reaches the body, while cones and buckets do not', () => {
    for (const [type, paperHealth, priorChill, damage, expectedChill] of [
        ['pvz:newspaper', 150, 0, 20, 0],
        ['pvz:newspaper', 150, 0, 150, 0],
        ['pvz:newspaper', 150, 0, 160, 1000],
        ['pvz:newspaper', 0, 0, 20, 1000],
        ['pvz:newspaper', 150, 200, 20, 200],
        ['pvz:conehead', undefined, 0, 20, 1000],
        ['pvz:buckethead', undefined, 0, 20, 1000],
    ] as const) {
        const world = worldFor(true)
        const entity = spawnZombie(world, definitions, type, 0, 500, 50)
        const zombie = world.get(entity, ZombieComponent)!
        if (paperHealth !== undefined) zombie.helmHealth = paperHealth
        const initialArmor = zombie.helmHealth
        zombie.chilledTicks = priorChill
        damageZombie(world, definitions, entity, damage, { chillTicks: 1000 })
        assert.equal(zombie.chilledTicks, expectedChill, `${type}, armor ${initialArmor}, damage ${damage}`)
        assert.equal(zombie.helmHealth, Math.max(0, initialArmor - damage))
        assert.equal(zombie.health, zombie.maxHealth - Math.max(0, damage - initialArmor))
        const chilledEvents = drainServerEvents(world.resources.get(EventQueueResource)).filter(event => event.type === 'zombieChilled')
        assert.equal(chilledEvents.length, priorChill === 0 && expectedChill > 0 ? 1 : 0)
    }
})

test('breaking a newspaper pauses movement and bites, then enrages; chilled gasp takes twice as long', () => {
    for (const chilled of [false, true]) {
        const world = worldFor(true), schedule = new Schedule()
        schedule.add('zombie', createZombieSystem(definitions))
        const entity = spawnZombie(world, definitions, 'pvz:newspaper', 0, 500, 50)
        const zombie = world.get(entity, ZombieComponent)!
        damageZombie(world, definitions, entity, 160, chilled ? { chillTicks: 1000 } : {})
        assert.equal(zombie.helmHealth, 0)
        assert.equal(zombie.health, 260)
        assert.equal(zombie.animation, 'anim_gasp')
        const duration = definitions.zombies['pvz:newspaper'].enrage!.pauseTicks * (chilled ? 2 : 1)
        for (let tick = 1; tick < duration; tick++) schedule.run(world, tick)
        assert.equal(world.get(entity, PositionComponent)!.x, 500)
        assert.equal(zombie.animation, 'anim_gasp')
        schedule.run(world, duration)
        assert.equal(zombie.animation, 'anim_walk')
        const enraged = drainServerEvents(world.resources.get(EventQueueResource)).find(event => event.type === 'zombieEnraged')
        assert.equal(enraged?.data.roar, true, 'a lone headed newspaper roars')
        assert.ok(zombie.speedPerTick >= 0.89 && zombie.speedPerTick <= 0.91)
        assert.equal('enrageTicks' in zombie, false)
        schedule.run(world, duration + 1)
        assert.ok(world.get(entity, PositionComponent)!.x < 500)
    }
})

function plantAt(world: World, typeId: string, x: number) {
    const definition = definitions.plants[typeId]
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x, y: 80, row: 0 })
    world.add(entity, PlantComponent, { typeId, seedId: typeId, column: 0, health: 300, maxHealth: 300, eatenFlashCounter: 0,
        recentlyEatenCounter: 0, ...(initialPlantAbility(definition) ? { ability: initialPlantAbility(definition) } : {}) })
    world.add(entity, PlantAttackComponent, { readyAtTick: 1 })
    return entity
}

test('sun-shrooms drop small sun until they grow, produce nothing while growing, and neither grow nor produce asleep', () => {
    const growth = definitions.plants['pvz:sunshroom'].producer!.growth!
    for (const night of [false, true]) {
        const world = worldFor(night), schedule = new Schedule()
        // The server's order: on the update the sun-shroom finishes growing, it does not produce yet.
        schedule.add('plant', createProductionSystem(definitions))
        schedule.add('plant', createPlantAbilitySystem(definitions))
        const entity = plantAt(world, 'pvz:sunshroom', 40)
        const plant = world.get(entity, PlantComponent)!, timer = world.get(entity, PlantAttackComponent)!
        const sun = () => [...world.query(ItemComponent)].map(item => world.get(item, ItemComponent)!).map(item => [item.typeId, item.value])
        let tick = 0
        const run = (ticks: number) => { for (let index = 0; index < ticks; index++) schedule.run(world, ++tick) }
        run(growth.ticks)
        if (!night) {
            assert.deepEqual([sun(), plant.ability], [[], { state: 'small', ticks: growth.ticks }], 'a sleeping sun-shroom neither grows nor produces')
            continue
        }
        assert.deepEqual(sun()[0], ['pvz:smallsun', 15])
        assert.equal(plant.ability!.state, 'growing')
        const produced = sun().length
        timer.readyAtTick = tick + 1
        run(growth.growingTicks)
        assert.equal(plant.ability!.state, 'big')
        assert.equal(sun().length, produced, 'production waits for anim_grow')
        run(1)
        assert.deepEqual(sun().at(-1), ['pvz:sun', 25])
    }
})

test('fume-shrooms hit every zombie in reach at once, through the newspaper and into the body', () => {
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('plant', createPeashooterSystem(definitions))
    plantAt(world, 'pvz:fumeshroom', 40)
    const paper = spawnZombie(world, definitions, 'pvz:newspaper', 0, 150, 50)
    const near = spawnZombie(world, definitions, 'pvz:normal', 0, 360, 50)
    const far = spawnZombie(world, definitions, 'pvz:normal', 0, 420, 50)
    const health = (entity: number) => [world.get(entity, ZombieComponent)!.helmHealth, world.get(entity, ZombieComponent)!.health]
    const before = [paper, near, far].map(health)
    for (let tick = 1; !drainServerEvents(world.resources.get(EventQueueResource)).some(event => event.type === 'plantAreaAttack'); tick++) {
        assert.ok(tick < 300)
        schedule.run(world, tick)
    }
    assert.deepEqual(health(paper), [before[0][0] - 20, before[0][1] - 20], 'DAMAGE_HITS_SHIELD_AND_BODY')
    assert.equal(world.get(paper, ZombieComponent)!.hitThroughShield, true, 'the paper flashes without recoiling, and the body flashes too')
    damageZombie(world, definitions, paper, 20)
    assert.equal(world.get(paper, ZombieComponent)!.hitThroughShield, undefined, 'a pea hit recoils the paper again')
    assert.deepEqual(health(near), [0, before[1][1] - 20])
    assert.deepEqual(health(far), before[2], 'beyond the 340px reach')
    assert.equal([...world.query(ProjectileComponent)].length, 0)
})

test('grave busters only go on graves, cannot be dug up, then eat the grave and disappear', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start({ ...options, firstAdventure: false })
    game.debugCommand('/cooldown false')
    game.debugCommand('/suncost false')
    const picks = ['pvz:gravebuster', ...definitions.seedCatalog.filter(id => id !== 'pvz:gravebuster').slice(0, 5)]
    for (const seedId of picks) game.command({ type: 'chooseSeed', seedId })
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    const grave = game.render().graves![0]
    const plant = (row: number, column: number) => {
        game.command({ type: 'selectSeed', seedId: 'pvz:gravebuster' })
        game.command({ type: 'placePlant', row, column })
        game.update(0)
    }
    plant(grave.row, 0)
    assert.equal(game.lastRejection?.code, 'cell-needs-grave')
    assert.ok(game.drainEvents().some(event => event.type === 'advice' && event.data.key === 'ADVICE_GRAVEBUSTERS_ON_GRAVES'))
    plant(grave.row, grave.column)
    const buster = game.render().plants.find(value => value.typeId === 'pvz:gravebuster')!
    assert.equal(buster.ability?.state, 'landing')
    game.command({ type: 'selectTool', toolId: 'pvz:shovel' })
    game.command({ type: 'useToolAt', row: grave.row, column: grave.column })
    game.update(0)
    assert.ok(game.render().plants.some(value => value.entityId === buster.entityId), 'Board::ToolHitTestHelper skips grave busters')
    const { landTicks, eatTicks } = definitions.plants['pvz:gravebuster'].graveBuster!
    for (let tick = 0; tick < landTicks.max + eatTicks && game.render().plants.some(value => value.entityId === buster.entityId); tick++) {
        game.update(definitions.tickSeconds)
    }
    assert.ok(!game.render().plants.some(value => value.entityId === buster.entityId))
    assert.ok(!game.render().graves!.some(value => value.row === grave.row && value.column === grave.column))
    assert.equal(game.render().graves!.length, 3)
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, firstAdventure: false, save: game.saveAtBoundary() })
    assert.deepEqual(restored.render().graves, game.render().graves)
})

test('zombies eat grave busters like other plants', () => {
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    const buster = plantAt(world, 'pvz:gravebuster', 40)
    spawnZombie(world, definitions, 'pvz:normal', 0, 40, 50)
    for (let tick = 1; tick <= 300; tick++) schedule.run(world, tick)
    assert.ok(!world.hasEntity(buster) || world.get(buster, PlantComponent)!.health < 300)
})

test('a /seed swap to a locked seed after choosing still restores; /seed waits for the chooser', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(options)
    while (game.render().extensions['pvz:dialog']) { game.command({ type: 'advanceDialog' }); game.update(0) }
    for (const seedId of ['puffshroom', 'sunflower', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine']) game.command({ type: 'chooseSeed', seedId: `pvz:${seedId}` })
    game.update(0)
    assert.equal(game.debugCommand('/seed 1 gravebuster').ok, false, 'the chooser owns the bank until it is confirmed')
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    assert.equal(game.debugCommand('/seed 1 gravebuster').ok, true)
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, save: game.saveAtBoundary() })
    assert.equal(restored.render().seedPackets[0].seedId, 'pvz:gravebuster')
})
