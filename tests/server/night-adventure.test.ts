import { withProjectileMotions } from '../projectileMotions'
import assert from 'node:assert/strict'
import test from 'node:test'
import { Schedule, World } from '@/server/state/World'
import { STRAIGHT } from '@/server/projectiles/motions'
import { launchProjectile } from '@/server/projectiles/Projectile'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { LevelStateResource, RandomResource } from '@/server/state/resources'
import { createEventQueue, drainServerEvents, EventQueueResource } from '@/server/state/events'
import { createPlantAttackSystem } from '@/server/plants/attacks'
import { createPlantAbilitySystem } from '@/server/plants/abilities'
import { Shooter } from '@/server/plants/Shooter'
import { Producer } from '@/server/plants/Producer'
import type { ScaredyShroom } from '@/server/plants/ScaredyShroom'
import type { SunShroom } from '@/server/plants/SunShroom'
import { createProductionSystem } from '@/server/plants/production'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createProjectileSystem } from '@/server/projectiles/projectiles'
import { createZombieSystem } from '@/server/zombies/system'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { chooserSeeds, parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { GraveSnapshot, JsonValue, StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { TICK_SECONDS } from '@/shared/protocol'
import { withZombieTypes } from '../zombieTypes'
import { newPlant, withPlantTypes } from '../plantTypes'
import type { Newspaper } from '@/server/zombies/Newspaper'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-1', randomSeed: 7, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-1'), mods: [] }
function restore(save: ReturnType<IntegratedGameServer['save']>) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, save: save as unknown as JsonValue })
    return server
}

test('grave zombies default to Board::PickGraveRisingZombieType over the zombies each level allows, and lawns with graves name theirs', () => {
    const picks = (id: string) => levels.levels[`pvz:adventure-${id}`].graveZombies!.map(entry => `${entry.id.slice(4)}:${entry.weight}`)
    assert.deepEqual(picks('1-1'), ['normal:4000'], '1-1 allows only normal zombies')
    assert.deepEqual(picks('1-3'), ['normal:4000', 'conehead:4000'])
    assert.deepEqual(picks('1-8'), ['normal:4000', 'conehead:4000', 'buckethead:3000'])
    assert.deepEqual(picks('2-1'), ['normal:4000'])
    assert.deepEqual(picks('2-2'), ['normal:4000', 'conehead:4000'], '2-2 names no bucketheads for its own graves')
})

test('2-1 runs Dave before choosing, blocks graves, has no sky sun, and restores the delayed final-wave emergence', () => {
    const server = new IntegratedGameServer(definitions, levels)
    const initial = server.start(options)
    assert.equal(initial.wave.total, 10)
    assert.deepEqual(initial.gridItems!.map(grave => grave.column), [6, 7, 8, 8])
    assert.equal(new Set(initial.gridItems!.map(grave => `${grave.row}:${grave.column}`)).size, 4)
    assert.equal((initial.gridItems as GraveSnapshot[]).filter(grave => grave.special).length, 1, 'Board::PickSpecialGraveStone marks one stone')
    assert.deepEqual(restore(server.save()).snapshot().gridItems, initial.gridItems, 'the special stone survives a save')
    assert.equal(runCommand(server, { type: 'chooseSeed', seedId: 'pvz:puffshroom' }), 'intro-not-complete')
    for (let index = 201; index <= 207; index++) {
        assert.deepEqual(server.snapshot().dialog, { index })
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    for (const seedId of ['puffshroom', 'sunflower', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine']) {
        assert.equal(runCommand(server, { type: 'chooseSeed', seedId: `pvz:${seedId}` }), undefined)
    }
    assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    assert.equal(server.save().skySun.atTick, undefined)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:puffshroom' })
    const grave = initial.gridItems![0]
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
    pending.zombies = []
    pending.wave.zombieIds = []
    const cleared = restore(pending)
    for (let tick = 0; tick < 250; tick++) cleared.tick()
    assert.equal(cleared.snapshot().items.length, 1)
    assert.equal(cleared.snapshot().zombies.length, 0)
})

test('2-9 offers the doom-shroom and drops the second note after two flags on the night lawn', () => {
    const levelId = 'pvz:adventure-2-9'
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start({ ...options, levelId, ownedSeeds: adventureSeeds(levels, levelId) })
    assert.equal(game.render().gridItems!.length, 11)
    for (const seed of ['doomshroom', 'puffshroom', 'sunshroom', 'fumeshroom', 'gravebuster', 'iceshroom']) {
        game.command({ type: 'chooseSeed', seedId: `pvz:${seed}` })
    }
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    assert.equal(game.render().seedPackets[0]?.seedId, 'pvz:doomshroom')
    assert.equal(game.render().wave.total, 20)
    const flags: number[] = []
    for (let wave = 1; wave <= 20; wave++) {
        assert.equal(game.debugCommand('/nextwave').ok, true)
        const types = game.render().zombies.map(zombie => zombie.typeId)
        if (types.includes('pvz:flag')) flags.push(wave)
        if (wave === 20) assert.deepEqual(new Set(types), new Set(['pvz:normal', 'pvz:flag', 'pvz:conehead', 'pvz:screendoor', 'pvz:dancer']))
        assert.equal(game.debugCommand('/kill').ok, true)
    }
    assert.deepEqual(flags, [10, 20])
    game.update(TICK_SECONDS)
    const note = game.render().items.find(item => item.typeId === 'pvz:level-award')
    assert.ok(note)
    game.command({ type: 'collectItemAt', x: note.x + 1, y: note.y + 1 })
    game.update(0)
    assert.equal(game.render().result, 'won')
    assert.ok(game.drainEvents().some(event => event.type === 'levelAwardCollected' && event.data.awardId === 'pvz:zombie-note-2'))
})

function worldFor(night: boolean) {
    const world = withPlantTypes(withZombieTypes(new World(), definitions), definitions)
    const definition = levels.levels['pvz:adventure-2-1'], board = definitions.boards[night ? 'pvz:night' : 'pvz:day']
    world.resources.set(LevelStateResource, { id: options.levelId, definition, board, phase: 'gameplay', result: 'playing', paused: false })
    withProjectileMotions(world, definitions).resources.set(RandomResource, new DeterministicRng(7))
    world.resources.set(EventQueueResource, createEventQueue())
    return world
}

test('puff-shrooms sleep by day, only fire within range, and spores expire before collision at age 75', () => {
    for (const night of [false, true]) {
        const world = worldFor(night), schedule = new Schedule()
        schedule.add('plant', createPlantAttackSystem(definitions))
        const plant = world.createEntity()
        world.insert(world.plants, newPlant<Shooter>(world, 'pvz:puffshroom', { id: plant, position: { x: 40, y: 80, row: 0 }, health: 300, maxHealth: 300 }, { readyAtTick: 0 }))
        const zombie = spawnZombie(world, definitions, 'pvz:normal', 0, 400, 50)
        schedule.run(world, 1)
        assert.equal((world.plants.get(plant) as Shooter).burst, undefined)
        world.zombies.get(zombie)!.position.x = 240
        for (let tick = 2; tick <= 200; tick++) schedule.run(world, tick)
        assert.equal([...world.projectiles].map(projectile => projectile.id).length > 0, night)
    }
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('projectile', createProjectileSystem(definitions))
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 0, 100, 50)
    // The puff-shroom's own spores (its shooter's overrides) go only so far; the scaredy-shroom's do not.
    const spore = launchProjectile(world, definitions, world, { typeId: 'pvz:spore', position: { x: 100, y: 80, row: 0 }, motion: STRAIGHT,
        overrides: definitions.plants['pvz:puffshroom'].shooter!.overrides })
    const far = launchProjectile(world, definitions, world, { typeId: 'pvz:spore', position: { x: 100, y: 80, row: 1 }, motion: STRAIGHT })
    assert.equal(world.projectiles.get(far)!.motionState, undefined)
    assert.deepEqual(world.projectiles.get(spore)!.motionState, { ticksLeft: 75 })
    world.projectiles.get(spore)!.motionState = { ticksLeft: 1 }
    schedule.run(world, 1)
    assert.equal(world.hasEntity(spore), false)
    assert.equal(world.zombies.get(zombie)!.health, 270)
    assert.equal(world.projectiles.get(far)!.age, 1, 'Projectile::Update counts its age first')
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
        const zombie = world.zombies.get(entity)!
        const slot = definitions.zombies[type].shield ? 'shieldHealth' : 'helmHealth'
        if (paperHealth !== undefined) zombie[slot] = paperHealth
        const initialArmor = zombie[slot]
        zombie.chilledTicks = priorChill
        damageZombie(world, definitions, entity, damage, { chillTicks: 1000 })
        assert.equal(zombie.chilledTicks, expectedChill, `${type}, armor ${initialArmor}, damage ${damage}`)
        assert.equal(zombie[slot], Math.max(0, initialArmor - damage))
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
        const zombie = world.zombies.get(entity)!
        damageZombie(world, definitions, entity, 160, chilled ? { chillTicks: 1000 } : {})
        assert.equal(zombie.shieldHealth, 0)
        assert.equal(zombie.health, 260)
        assert.equal(zombie.animations.body.clip, 'gasp')
        const duration = definitions.zombies['pvz:newspaper'].enrage!.pauseTicks * (chilled ? 2 : 1)
        for (let tick = 1; tick < duration; tick++) schedule.run(world, tick)
        assert.equal(world.zombies.get(entity)!.position.x, 500)
        assert.equal(zombie.animations.body.clip, 'gasp')
        schedule.run(world, duration)
        assert.equal(zombie.animations.body.clip, 'walk')
        const enraged = drainServerEvents(world.resources.get(EventQueueResource)).find(event => event.type === 'zombieEnraged')
        assert.equal(enraged?.data.roar, true, 'a lone headed newspaper roars')
        assert.ok(zombie.speedPerTick >= 0.89 && zombie.speedPerTick <= 0.91)
        assert.equal((zombie as Newspaper).gaspTicks, 0)
        schedule.run(world, duration + 1)
        assert.ok(world.zombies.get(entity)!.position.x < 500)
    }
})

function plantAt(world: World, typeId: string, x: number) {
    const entity = world.createEntity()
    const plant = newPlant(world, typeId, { id: entity, position: { x, y: 80, row: 0 }, health: 300, maxHealth: 300 })
    // Its first shot or sun on the first tick.
    if (plant instanceof Shooter || plant instanceof Producer) plant.readyAtTick = 1
    world.insert(world.plants, plant)
    return entity
}

test('scaredy-shrooms shoot the whole row, hide while a hostile zombie is near, and shoot a whole cadence after they are up', () => {
    const world = worldFor(true), schedule = new Schedule(), queue = world.resources.get(EventQueueResource)
    schedule.add('plant', createPlantAttackSystem(definitions))
    schedule.add('plant', createPlantAbilitySystem(definitions))
    const { fright, shooter } = definitions.plants['pvz:scaredyshroom']
    const plant = plantAt(world, 'pvz:scaredyshroom', 40)
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 0, 700, 50)
    const at = world.zombies.get(zombie)!.position
    const state = () => (world.plants.get(plant) as ScaredyShroom).phase
    let tick = 0
    const run = (ticks: number, until?: () => boolean) => {
        const types: string[] = []
        for (const end = tick + ticks; tick < end && !until?.();) {
            schedule.run(world, ++tick)
            types.push(...drainServerEvents(queue).map(event => event.type))
        }
        return types
    }
    assert.ok(run(400).includes('projectileFired'), 'far beyond the puff-shroom’s 230 reach')
    assert.equal(state(), 'calm')
    // Plant::UpdateScaredyShroom: a zombie's body within 120 of (x, y + 20), here 96 away.
    at.x = 100
    const hidden = run(200, () => state() === 'lowering')
    assert.equal(state(), 'lowering', 'it waits for a shot it has begun')
    hidden.push(...run(fright!.lowerTicks - 1))
    assert.equal(state(), 'lowering')
    hidden.push(...run(1))
    assert.equal(state(), 'scared', 'down after anim_scared')
    at.row = 1
    hidden.push(...run(50))
    assert.equal(state(), 'scared', 'a zombie on the row beside it scares it too')
    at.row = 2
    hidden.push(...run(1))
    assert.equal(state(), 'raising', 'two rows away it is not near')
    at.row = 0
    at.x = 700
    hidden.push(...run(fright!.raiseTicks.max, () => state() === 'calm'))
    assert.equal(state(), 'calm')
    assert.ok(!hidden.includes('plantFiring'), 'it holds its shots until it is up')
    // Its launch counter was a whole cadence (mLaunchRate, 150) the tick before it was up, and counted down that tick
    // (UpdateShooter), so it comes to 0 on the 148th tick after.
    assert.ok(!run(shooter!.cadenceTicks.max - 3).includes('plantFiring'))
    assert.deepEqual(run(1).filter(type => type === 'plantFiring'), ['plantFiring'])
    // A zombie on its side does not scare it.
    world.zombies.get(zombie)!.team = 'plants'
    at.x = 100
    run(300)
    assert.equal(state(), 'calm')
})

test('sun-shrooms drop small sun until they grow, produce nothing while growing, and neither grow nor produce asleep', () => {
    const growth = definitions.plants['pvz:sunshroom'].producer!.growth!
    for (const night of [false, true]) {
        const world = worldFor(night), schedule = new Schedule()
        // The server's order: on the update the sun-shroom finishes growing, it does not produce yet.
        schedule.add('plant', createProductionSystem(definitions))
        schedule.add('plant', createPlantAbilitySystem(definitions))
        const entity = plantAt(world, 'pvz:sunshroom', 40)
        const plant = world.plants.get(entity) as SunShroom
        const sun = () => [...world.items].map(item => [item.typeId, item.value])
        let tick = 0
        const run = (ticks: number) => { for (let index = 0; index < ticks; index++) schedule.run(world, ++tick) }
        run(growth.ticks)
        if (!night) {
            assert.deepEqual([sun(), plant.phase, plant.phaseTicks], [[], 'small', growth.ticks], 'a sleeping sun-shroom neither grows nor produces')
            continue
        }
        assert.deepEqual(sun()[0], ['pvz:smallsun', 15])
        assert.equal(plant.phase, 'growing')
        const produced = sun().length
        plant.readyAtTick = tick + 1
        run(growth.growingTicks)
        assert.equal(plant.phase, 'big')
        assert.equal(sun().length, produced, 'production waits for anim_grow')
        run(1)
        assert.deepEqual(sun().at(-1), ['pvz:sun', 25])
    }
})

test('fume-shrooms hit every zombie in reach at once, through the newspaper and into the body', () => {
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('plant', createPlantAttackSystem(definitions))
    plantAt(world, 'pvz:fumeshroom', 40)
    const paper = spawnZombie(world, definitions, 'pvz:newspaper', 0, 150, 50)
    const near = spawnZombie(world, definitions, 'pvz:normal', 0, 360, 50)
    const far = spawnZombie(world, definitions, 'pvz:normal', 0, 420, 50)
    const health = (entity: number) => [world.zombies.get(entity)!.shieldHealth, world.zombies.get(entity)!.health]
    const before = [paper, near, far].map(health)
    let events = drainServerEvents(world.resources.get(EventQueueResource))
    for (let tick = 1; !events.some(event => event.type === 'plantAreaAttack'); tick++) {
        assert.ok(tick < 300)
        schedule.run(world, tick)
        events = drainServerEvents(world.resources.get(EventQueueResource))
    }
    const paperHit = () => events.find(event => event.type === 'zombieHit' && event.data.entityId === paper)!.data
    assert.deepEqual(health(paper), [before[0][0] - 20, before[0][1] - 20], 'DAMAGE_HITS_SHIELD_AND_BODY')
    assert.deepEqual(paperHit(), { entityId: paper, through: true }, 'the paper flashes without recoiling, and the body flashes too')
    damageZombie(world, definitions, paper, 20)
    events = drainServerEvents(world.resources.get(EventQueueResource))
    assert.deepEqual(paperHit(), { entityId: paper }, 'a pea hit recoils the paper again')
    assert.deepEqual(health(near), [0, before[1][1] - 20])
    assert.deepEqual(health(far), before[2], 'beyond the 340px reach')
    assert.equal([...world.projectiles].map(projectile => projectile.id).length, 0)
})

test('grave busters only go on graves, cannot be dug up, then eat the grave and disappear', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    // A replay's player owns every seed.
    game.start({ ...options, firstAdventure: false, ownedSeeds: chooserSeeds(definitions) })
    game.debugCommand('/cooldown')
    game.debugCommand('/suncost')
    const picks = ['pvz:gravebuster', ...chooserSeeds(definitions).filter(id => id !== 'pvz:gravebuster').slice(0, 5)]
    for (const seedId of picks) game.command({ type: 'chooseSeed', seedId })
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    const grave = game.render().gridItems![0]
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
    assert.equal(buster.own?.phase, 'landing')
    game.command({ type: 'selectTool', toolId: 'pvz:shovel' })
    game.command({ type: 'useToolAt', row: grave.row, column: grave.column })
    game.update(0)
    assert.ok(game.render().plants.some(value => value.entityId === buster.entityId), 'Board::ToolHitTestHelper skips grave busters')
    const { landTicks, eatTicks } = definitions.plants['pvz:gravebuster'].graveBuster!
    for (let tick = 0; tick < landTicks.max + eatTicks && game.render().plants.some(value => value.entityId === buster.entityId); tick++) {
        game.update(TICK_SECONDS)
    }
    assert.ok(!game.render().plants.some(value => value.entityId === buster.entityId))
    assert.ok(!game.render().gridItems!.some(value => value.row === grave.row && value.column === grave.column))
    assert.equal(game.render().gridItems!.length, 3)
    // Plant::UpdateGraveBuster drops loot at factor 12, which always reaches at least a silver coin (2500 * 12 >= 30000).
    const loot = game.render().items.filter(item => definitions.items[item.typeId]?.kind === 'money')
    assert.equal(loot.length, 1, 'an eaten grave leaves a coin')
    assert.ok(Math.abs(loot[0].x - (buster.x - 10)) <= 30, 'dropped where the grave buster stood')
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, firstAdventure: false, save: game.saveAtBoundary() })
    assert.deepEqual(restored.render().gridItems, game.render().gridItems)
})

test('zombies eat grave busters like other plants', () => {
    const world = worldFor(true), schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    const buster = plantAt(world, 'pvz:gravebuster', 40)
    spawnZombie(world, definitions, 'pvz:normal', 0, 40, 50)
    for (let tick = 1; tick <= 300; tick++) schedule.run(world, tick)
    assert.ok(!world.hasEntity(buster) || world.plants.get(buster)!.health < 300)
})

test('a /seed swap to a locked seed after choosing still restores; /seed waits for the chooser', () => {
    const game = new LocalIntegratedGame(definitions, levels, undefined, true)
    game.start(options)
    while (game.render().dialog) { game.command({ type: 'advanceDialog' }); game.update(0) }
    for (const seedId of ['puffshroom', 'sunflower', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine']) game.command({ type: 'chooseSeed', seedId: `pvz:${seedId}` })
    game.update(0)
    assert.equal(game.debugCommand('/seed 1 gravebuster').ok, false, 'the chooser owns the bank until it is confirmed')
    game.command({ type: 'confirmSeeds' })
    game.command({ type: 'completeIntro' })
    game.update(0)
    assert.equal(game.debugCommand('/seed 1 gravebuster').ok, true)
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, save: game.saveAtBoundary() })
    assert.equal(restored.render().seedPackets[0]!.seedId, 'pvz:gravebuster')
})
