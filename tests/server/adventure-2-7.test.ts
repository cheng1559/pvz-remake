import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/server/state/World'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { LevelStateResource } from '@/server/state/resources'
import { freezeHostiles } from '@/server/combat/freeze'
import { chillZombie, damageZombie } from '@/server/zombies/damage'
import { damagePlant, destroyEatenPlant } from '@/server/plants/damage'
import type { PotatoMine } from '@/server/plants/PotatoMine'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { ZOMBIE_BODY_LAYER } from '@/shared/content/gameplay'
import type { ServerEvent, StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { startFromSave } from './start-from-save'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-7', randomSeed: 7, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-7'), mods: [] }
const ice = definitions.plants['pvz:iceshroom'].fuse!.freeze!

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

/** A level in play, its chooser through with the first seeds it offers. */
function playing(levelId = 'pvz:adventure-2-7', seeds: string[] = []) {
    const ownedSeeds = [...adventureSeeds(levels, levelId), ...seeds]
    const server = start({ firstAdventure: false, levelId, ownedSeeds })
    if (server.snapshot().seedChooser) {
        for (const seedId of [...seeds, ...new Set(ownedSeeds)].filter((id, index, all) => all.indexOf(id) === index).slice(0, 6)) {
            assert.equal(runCommand(server, { type: 'chooseSeed', seedId }), undefined)
        }
        assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    }
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    const result = server.drainCommandResults()[0].debug as { ok: boolean }
    assert.equal(result.ok, true, command)
}

const world = (server: IntegratedGameServer) => (server as unknown as { session: { world: World } }).session.world
const zombieAt = (server: IntegratedGameServer, row: number, team?: 'plants') =>
    server.snapshot().zombies.find(zombie => zombie.row === row - 1 && zombie.team === team)!.entityId
const plantAt = (server: IntegratedGameServer, row: number, column: number) =>
    server.snapshot().plants.find(plant => plant.row === row - 1 && plant.column === column - 1)?.entityId
function ticks(server: IntegratedGameServer, count: number): ServerEvent[] {
    const events: ServerEvent[] = []
    for (let tick = 0; tick < count; tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    return events
}

test('2-7 follows 2-6 with 20 waves over eleven graves and awards the ice-shroom', () => {
    const level = levels.levels['pvz:adventure-2-7']
    assert.equal(levels.levels['pvz:adventure-2-6'].nextLevel, 'pvz:adventure-2-7')
    // LawnApp::GetAwardSeedForLevel(17): (2 - 1) * 8 + 7 - 1 = 14, SEED_ICESHROOM.
    assert.deepEqual(level.award, { kind: 'seed', id: 'pvz:iceshroom' })
    // Board::InitLevel: AddGraveStones(4, 1), (5, 2), (6, 2), (7, 3), (8, 3) on levels 17-19.
    const graves = start().snapshot().gridItems!
    assert.deepEqual([4, 5, 6, 7, 8].map(column => graves.filter(grave => grave.column === column).length), [1, 2, 2, 3, 3])
    const allowed = new Set(['pvz:normal', 'pvz:flag', 'pvz:conehead', 'pvz:screendoor', 'pvz:football'])
    for (let seed = 1; seed <= 10; seed++) {
        const waves = start({ randomSeed: seed }).save().wave.plan.map(wave => wave.zombies)
        // gZombieWaves[16] is 20, every tenth a flag wave.
        assert.equal(waves.length, 20)
        assert.deepEqual(waves.flatMap((wave, index) => wave.includes('pvz:flag') ? [index] : []), [9, 19])
        assert.ok(waves.flat().every(id => allowed.has(id)), 'gZombieAllowedLevels for level 17')
    }
    // CutScene::StartLevelIntro offers the first seed slot on levels 13-24 to one who has none.
    assert.deepEqual(start({ initialMoney: 1000, packetUpgradeOffer: { cost: 750 } }).snapshot().dialog, { index: 1501 })
})

test('the ice-shroom costs 75, recharges for 5000 and starts the level at 3500, as every 5000 seed does', () => {
    assert.deepEqual({ ...definitions.seeds['pvz:iceshroom'] }, {
        id: 'pvz:iceshroom', kind: 'plant', position: 14, sunCost: 75, cooldownTicks: 5000, initialCooldownTicks: 3500, placement: 'ground',
    })
    const packet = playing('pvz:adventure-2-7', ['pvz:iceshroom']).snapshot().seedPackets.find(packet => packet?.seedId === 'pvz:iceshroom')!
    assert.equal(packet.cooldownTotal, 3500, 'SeedPacket::SetActivate refreshes a 5000 seed for 3500 at the start')
})

test('an awake ice-shroom goes off after 100 ticks: every hostile zombie is frozen, chilled and hurt through its shield', () => {
    const server = playing()
    debug(server, '/plant iceshroom 3 2')
    debug(server, '/zombie normal 3 9')
    debug(server, '/zombie screendoor 1 9')
    debug(server, '/zombie normal 5 3 plants')
    const normal = zombieAt(server, 3), door = zombieAt(server, 1), ally = zombieAt(server, 5, 'plants')
    const shroom = plantAt(server, 3, 2)!
    const component = (entity: number) => world(server).zombies.get(entity)!
    server.drainEvents()
    assert.ok(!ticks(server, 99).some(event => event.type === 'plantFroze'))
    assert.ok(server.snapshot().zombies.every(zombie => !zombie.frozen))
    const events = ticks(server, 1)
    assert.deepEqual(events.filter(event => event.type === 'plantFroze').map(event => event.data.entityId), [shroom])
    assert.equal(plantAt(server, 3, 2), undefined, 'it is gone')
    for (const entity of [normal, door]) {
        const zombie = component(entity)
        // Zombie::HitIceTrap: 400-600 for one not cold, counted down once already this tick, as the chill.
        assert.ok(zombie.frozenTicks! >= 399 && zombie.frozenTicks! <= 599, `frozen for ${zombie.frozenTicks}`)
        assert.equal(zombie.chilledTicks, ice.chillTicks - 1)
        assert.equal(zombie.health, 250, 'TakeDamage(20) past the shield')
    }
    assert.equal(component(door).shieldHealth, 1100, 'the screen door takes none of it')
    assert.equal(component(ally).frozenTicks, undefined, 'a zombie of its own side is spared')
    assert.equal(component(ally).chilledTicks, 0)
    assert.deepEqual(server.snapshot().iceTrap, { zombies: 300 }, 'Board::mIceTrapCounter')
    assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === normal)!.frozen, true)
    assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === normal)!.animations[ZOMBIE_BODY_LAYER].rate, 0, 'its body stands still')

    // It stands still until its ice breaks off, and walks on from that tick.
    const x = server.snapshot().zombies.find(zombie => zombie.entityId === normal)!.x
    const left = component(normal).frozenTicks!
    const held = ticks(server, left - 1)
    assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === normal)!.x, x)
    assert.ok(!held.some(event => event.type === 'iceReleased' && event.data.entityId === normal))
    const thawed = ticks(server, 1)
    assert.deepEqual(thawed.filter(event => event.type === 'iceReleased' && event.data.entityId === normal).map(event => event.data.kind), ['zombie'])
    assert.equal(component(normal).frozenTicks, undefined)
    assert.ok(server.snapshot().zombies.find(zombie => zombie.entityId === normal)!.x < x, 'it walks on')
    assert.equal(server.snapshot().iceTrap, undefined, 'the board\'s count is out by then')
})

test('a cold zombie freezes for less, one in the air of its vault is only chilled, and one rising or dying is spared', () => {
    const server = playing()
    debug(server, '/zombie normal 1 9')
    debug(server, '/zombie pole_vaulter 2 9')
    debug(server, '/zombie normal 3 9')
    debug(server, '/zombie normal 4 9')
    const [cold, vaulting, rising, dying] = [1, 2, 3, 4].map(row => world(server).zombies.get(zombieAt(server, row))!)
    cold.chilledTicks = 500
    vaulting.state = 'airborne'
    rising.riseTicks = 50
    dying.state = 'dying'
    freezeHostiles(world(server), definitions, 'plants', ice, world(server))
    assert.ok(cold.frozenTicks! >= 300 && cold.frozenTicks! <= 400, 'Zombie::HitIceTrap: 300-400 for one chilled or frozen already')
    assert.equal(cold.chilledTicks, 2000)
    assert.equal(vaulting.frozenTicks, undefined, 'Zombie::CanBeFrozen')
    assert.equal(vaulting.chilledTicks, 2000, 'ApplyChill comes first')
    assert.equal(vaulting.health, vaulting.maxHealth, 'nor hurt')
    for (const spared of [rising, dying]) {
        assert.equal(spared.frozenTicks, undefined, 'Zombie::CanBeChilled')
        assert.equal(spared.chilledTicks, 0)
        assert.equal(spared.health, spared.maxHealth)
    }
})

test('a zombies\' ice-shroom freezes the plants\' side: its plants stop, its zombies too, and the zombies are spared', () => {
    const server = playing()
    debug(server, '/plantinvincible')
    debug(server, '/plant peashooter 3 1')
    debug(server, '/plant iceshroom 2 7 zombies')
    debug(server, '/zombie normal 3 9')
    debug(server, '/zombie normal 4 4 plants')
    const shooter = plantAt(server, 3, 1)!, enemy = zombieAt(server, 3), ally = zombieAt(server, 4, 'plants')
    debug(server, '/plantinvincible')
    server.drainEvents()
    ticks(server, 100)
    const plant = world(server).plants.get(shooter)!
    assert.ok(plant.frozenTicks! >= 400 && plant.frozenTicks! <= 600, `the plant is frozen for ${plant.frozenTicks}`)
    assert.equal(plant.chilledTicks, ice.chillTicks)
    assert.equal(plant.health, 280, 'and hurt as a zombie is')
    assert.ok(world(server).zombies.get(ally)!.frozenTicks !== undefined, 'a zombie on the plants\' side is frozen')
    assert.equal(world(server).zombies.get(enemy)!.frozenTicks, undefined)
    assert.deepEqual(server.snapshot().iceTrap, { plants: 300 })
    const snapshot = server.snapshot().plants.find(entry => entry.entityId === shooter)!
    assert.equal(snapshot.frozen, true)
    assert.ok(Object.values(snapshot.animations!).every(layer => layer.rate === 0), 'its animation stands still')

    // Frozen it fires at nothing, though a hostile zombie is on its row; once its ice breaks off, it shoots again.
    const frozen = ticks(server, plant.frozenTicks! - 1)
    assert.ok(!frozen.some(event => event.type === 'projectileFired' && event.data.plantId === shooter))
    const after = ticks(server, 400)
    assert.deepEqual(after.filter(event => event.type === 'iceReleased' && event.data.entityId === shooter).map(event => event.data.kind), ['plant'])
    assert.ok(after.some(event => event.type === 'projectileFired' && event.data.plantId === shooter), 'it fires once thawed')
})

test('an ice-shroom asleep by day is eaten as any plant, and an awake one is not hurt while its fuse burns', () => {
    const day = playing('pvz:adventure-1-4')
    debug(day, '/plant iceshroom 3 3')
    debug(day, '/zombie normal 3 4')
    const asleep = plantAt(day, 3, 3)!
    const dayEvents = ticks(day, 600)
    assert.ok(!dayEvents.some(event => event.type === 'plantFroze'), 'Plant::UpdateIceShroom waits while it sleeps')
    assert.ok((world(day).plants.get(asleep)?.health ?? 0) < 300, 'Zombie::EatPlant eats it')

    const night = playing()
    debug(night, '/plant iceshroom 3 3')
    debug(night, '/zombie normal 3 4')
    const awake = plantAt(night, 3, 3)!
    ticks(night, 99)
    assert.equal(world(night).plants.get(awake)!.health, 300)
})

test('the ice survives a save, and a zombie that dies in it or a plant destroyed in it breaks it off', () => {
    const server = playing()
    debug(server, '/plant iceshroom 3 2')
    debug(server, '/zombie normal 3 9')
    debug(server, '/zombie normal 4 9')
    ticks(server, 100)
    const saved = server.save()
    const restored = new IntegratedGameServer(definitions, levels)
    startFromSave(restored, JSON.parse(JSON.stringify(saved)))
    assert.deepEqual(restored.snapshot().iceTrap, { zombies: 300 })
    for (let tick = 0; tick < 50; tick++) assert.deepEqual(restored.tick().zombies, server.tick().zombies)

    const doomed = zombieAt(server, 3)
    server.drainEvents()
    damageZombie(world(server), definitions, doomed, 1000)
    const died = ticks(server, 1)
    assert.deepEqual(died.filter(event => event.type === 'iceReleased').map(event => event.data.entityId), [doomed], 'Zombie::PlayDeathAnim')
    assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === doomed)!.state, 'dying')

    const enemies = playing()
    debug(enemies, '/plant wallnut 3 1')
    debug(enemies, '/plant iceshroom 2 7 zombies')
    ticks(enemies, 100)
    const wallnut = plantAt(enemies, 3, 1)!
    enemies.drainEvents()
    destroyEatenPlant(world(enemies), definitions, wallnut, world(enemies))
    assert.deepEqual(enemies.drainEvents().filter(event => event.type === 'iceReleased').map(event => [event.data.entityId, event.data.kind]), [[wallnut, 'plant']])
    assert.equal(world(enemies).resources.get(LevelStateResource).iceTrap?.plants, 300)
})

test('a fuse goes off with exactly one of an explosion and a freeze', () => {
    const source = structuredClone(readGameplaySource('definitions')) as Record<string, any>
    source.plants['pvz:iceshroom'].fuse.explosion = source.plants['pvz:cherrybomb'].fuse.explosion
    assert.throws(() => parseGameplayDefinitions(source), /fuse needs exactly one of explosion and freeze/)
    delete source.plants['pvz:iceshroom'].fuse.explosion
    delete source.plants['pvz:iceshroom'].fuse.freeze
    assert.throws(() => parseGameplayDefinitions(source), /fuse needs exactly one of explosion and freeze/)
})

test('the plants kept from the ice and a pole vaulter in the air are only chilled; a potato mine is kept only rising', () => {
    const server = playing()
    // The zombies' ice reaches every plant of the plants' side.
    const planted = ['cherrybomb 1 1', 'bowling-wallnut 1 3', 'bowling-explodenut 1 5', 'gravebuster 2 1', 'iceshroom 2 3', 'potatomine 3 1', 'potatomine 3 3', 'peashooter 4 1']
    for (const plant of planted) debug(server, `/plant ${plant}`)
    const plant = (row: number, column: number) => world(server).plants.get(plantAt(server, row, column)!)!
    const mine = (row: number, column: number) => plant(row, column) as PotatoMine
    mine(3, 1).phase = 'rising'
    mine(3, 3).phase = 'armed'
    freezeHostiles(world(server), definitions, 'zombies', ice, world(server))
    for (const [row, column] of [[1, 1], [1, 3], [1, 5], [2, 1], [2, 3], [3, 1]]) {
        const kept = plant(row, column)
        assert.deepEqual([kept.typeId, kept.frozenTicks, kept.chilledTicks, kept.health], [kept.typeId, undefined, ice.chillTicks, kept.maxHealth],
            `${kept.typeId} on row ${row} is only chilled (unfreezable)`)
    }
    for (const [row, column] of [[3, 3], [4, 1]]) {
        const frozen = plant(row, column)
        assert.ok(frozen.frozenTicks !== undefined && frozen.health === frozen.maxHealth - ice.damage, `${frozen.typeId} on row ${row} is frozen and hurt`)
    }
    assert.deepEqual(definitions.zombies['pvz:pole_vaulter'].unfreezable, ['airborne'], 'Zombie::CanBeFrozen by its type')
})

test('a type kept from the cold takes neither a snow pea’s chill nor the ice', () => {
    const source = structuredClone(readGameplaySource('definitions')) as Record<string, any>
    source.plants['pvz:peashooter'].unchillable = true
    source.zombies['pvz:normal'].unchillable = true
    const cold = parseGameplayDefinitions(source)
    const server = new IntegratedGameServer(cold, parseGameplayLevels(readGameplaySource('levels'), cold))
    server.start({ ...options, levelId: 'pvz:adventure-1-4', firstAdventure: false, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-4') })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    debug(server, '/plant peashooter 3 1')
    debug(server, '/zombie normal 3 9')
    const shooter = plantAt(server, 3, 1)!, walker = zombieAt(server, 3)
    const plant = world(server).plants.get(shooter)!, zombie = world(server).zombies.get(walker)!
    damagePlant(world(server), cold, shooter, 20, world(server), 1000)
    chillZombie(world(server), cold, walker, zombie, 1000)
    freezeHostiles(world(server), cold, 'plants', ice, world(server))
    freezeHostiles(world(server), cold, 'zombies', ice, world(server))
    assert.deepEqual([plant.chilledTicks, plant.frozenTicks, plant.health], [0, undefined, plant.maxHealth - 20], 'only the pea’s damage')
    assert.deepEqual([zombie.chilledTicks, zombie.frozenTicks, zombie.health], [0, undefined, zombie.maxHealth])
})

test('a plant type is kept from the cold always (its kind keeps it in states of its own); a zombie type always or in states it lists', () => {
    const invalid = (change: (source: Record<string, any>) => void) => () => {
        const source = structuredClone(readGameplaySource('definitions')) as Record<string, any>
        change(source)
        parseGameplayDefinitions(source)
    }
    assert.throws(invalid(source => { source.plants['pvz:potatomine'].unfreezable = ['rising'] }), /potatomine\.unfreezable must be true/, 'a mine rising is its kind’s (PotatoMine.keptFromIce)')
    assert.throws(invalid(source => { source.plants['pvz:wallnut'].unchillable = ['rising'] }), /wallnut\.unchillable must be true/)
    assert.throws(invalid(source => { source.zombies['pvz:pole_vaulter'].unfreezable = ['flying'] }), /unfreezable\[0\]/)
    assert.throws(invalid(source => { source.zombies['pvz:normal'].unchillable = false }), /unchillable/)
})
