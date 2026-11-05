import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/ecs'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { ZombieComponent } from '@/server/state/components'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { adventureSeeds } from './adventure-seeds'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-4',
    randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-4') }

function begin() {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}
function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    return server.drainCommandResults()[0].debug as { ok: boolean }
}
const zombies = (server: IntegratedGameServer) => server.snapshot().zombies
const world = (server: IntegratedGameServer) => (server as unknown as { session: { world: World } }).session.world

test('a zombie on the plants\' side walks right, out of the plants\' reach, and leaves the lawn', () => {
    const server = begin()
    debug(server, '/plant peashooter 3 1')
    debug(server, '/plant cherrybomb 3 4')
    assert.equal(debug(server, '/zombie normal 3 4 plants').ok, true)
    const [ally] = zombies(server)
    assert.equal(ally.team, 'plants')
    const startX = ally.x
    server.drainEvents()
    for (let tick = 0; tick < 300; tick++) server.tick()
    const events = server.drainEvents()
    const after = zombies(server).find(zombie => zombie.team === 'plants')!
    assert.ok(after.x > startX, 'it walks right')
    assert.equal(after.health, after.maxHealth, 'the cherry bomb and the peashooter spare it')
    assert.ok(!events.some(event => event.type === 'projectileFired'), 'the peashooter has no enemy to shoot')
    const allies = () => zombies(server).filter(zombie => zombie.team === 'plants')
    for (let tick = 0; tick < 6000 && allies().length; tick++) server.tick()
    assert.deepEqual(allies(), [], 'past x = 850 it is gone')
    assert.equal(server.snapshot().result, 'playing', 'leaving the lawn loses nothing')
})

test('zombies of the two sides bite each other through shields, and the side survives a save', () => {
    const server = begin()
    debug(server, '/zombie buckethead 3 4 plants')
    debug(server, '/zombie screendoor 3 5')
    server.drainEvents()
    const before = new Map(zombies(server).map(zombie => [zombie.team ?? 'zombies', zombie]))
    let events: { type: string, data: Record<string, unknown> }[] = []
    const door = () => zombies(server).find(zombie => zombie.typeId === 'pvz:screendoor')!
    // Until the screen door zombie's body is half gone: both bite, and the bites pass its shield.
    for (let tick = 0; tick < 1000 && door().health > 135; tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    const chews = events.filter(event => event.type === 'zombieChewedZombie')
    assert.equal(new Set(chews.map(event => event.data.zombieId)).size, 2, 'both bite')
    assert.equal(door().shieldHealth, before.get('zombies')!.shieldHealth, 'the bite passes the screen door')
    const ally = zombies(server).find(zombie => zombie.team === 'plants')!
    assert.ok(ally.helmHealth! < before.get('plants')!.helmHealth!, 'bites still hit a helm (only the shield is passed)')
    assert.ok(!events.some(event => event.type === 'zombieHit'), 'bites do not flash')

    server.start({ ...options, save: server.save() as unknown as JsonValue })
    assert.deepEqual(zombies(server).map(zombie => zombie.team ?? 'zombies').sort(), ['plants', 'zombies'])
    const allies = [...world(server).query(ZombieComponent)].filter(entity => world(server).get(entity, ZombieComponent)!.team === 'plants')
    assert.equal(allies.length, 1)
    events = []
    // The screen door zombie loses its head first and stops biting; the bucket head bites on until it swallows.
    for (let tick = 0; tick < 3000 && !events.some(event => event.type === 'zombieAteZombie'); tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    assert.ok(events.some(event => event.type === 'zombieAteZombie'), 'the last bite is swallowed')
})

const plants = (server: IntegratedGameServer) => server.snapshot().plants
function run(server: IntegratedGameServer, ticks: number) {
    const events: { type: string, data: Record<string, unknown> }[] = []
    for (let tick = 0; tick < ticks; tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    return events
}

test('plants of the two sides shoot each other, the zombies\' side firing left', () => {
    const server = begin()
    debug(server, '/plant peashooter 3 1')
    assert.equal(debug(server, '/plant peashooter 3 7 zombies').ok, true)
    const enemy = plants(server).find(plant => plant.team === 'zombies')!, ally = plants(server).find(plant => !plant.team)!
    server.drainEvents()
    let leftward = false
    const events: { type: string, data: Record<string, unknown> }[] = []
    for (let tick = 0; tick < 600; tick++) {
        const before = new Map(server.snapshot().projectiles.map(projectile => [projectile.entityId, projectile.x]))
        server.tick()
        events.push(...server.drainEvents())
        for (const projectile of server.snapshot().projectiles) {
            if (projectile.team === 'zombies' && before.has(projectile.entityId)) leftward ||= projectile.x < before.get(projectile.entityId)!
        }
    }
    assert.ok(leftward, 'the zombies\' side fires left')
    const hits = events.filter(event => event.type === 'projectileImpact' && event.data.target === 'plant')
    assert.ok(hits.some(event => event.data.targetId === enemy.entityId) && hits.some(event => event.data.targetId === ally.entityId), 'both are hit')
    assert.ok(events.some(event => event.type === 'plantHit'), 'a hit plant flashes')
    const health = (id: number) => plants(server).find(plant => plant.entityId === id)?.health ?? 0
    assert.ok(health(enemy.entityId) < enemy.health && health(ally.entityId) < ally.health)
})

test('blasts and chompers take out hostile plants only', () => {
    const server = begin()
    debug(server, '/plant cherrybomb 3 3')
    debug(server, '/plant sunflower 3 4 zombies')
    debug(server, '/plant sunflower 2 4')
    debug(server, '/plant chomper 1 1')
    debug(server, '/plant sunflower 1 2 zombies')
    server.drainEvents()
    const events = run(server, 300)
    assert.deepEqual(plants(server).map(plant => [plant.row, plant.column, plant.team ?? 'plants']).sort(),
        [[0, 0, 'plants'], [1, 3, 'plants']], 'the cherry bomb spares its own side; the chomper swallows the other')
    assert.ok(events.some(event => event.type === 'chomperBit' && event.data.ate === true && typeof event.data.plantId === 'number'))
})

test('zombies eat the plants of the other side and pass their own', () => {
    const server = begin()
    debug(server, '/plant wallnut 3 3 zombies')
    debug(server, '/zombie normal 3 5')
    debug(server, '/zombie normal 1 1 plants')
    debug(server, '/plant wallnut 1 3 zombies')
    server.drainEvents()
    const events = run(server, 1500)
    // Snapshot rows count from 0, debug rows from 1.
    const nut = (row: number) => plants(server).find(plant => plant.row === row - 1)!
    assert.equal(nut(3).health, nut(3).maxHealth, 'a zombie walks past a plant of its own side')
    assert.ok(zombies(server).find(zombie => zombie.row === 2)!.x < nut(3).x)
    assert.ok(nut(1).health < nut(1).maxHealth, 'a zombie on the plants\' side eats a plant of the zombies\'')
    assert.ok(events.some(event => event.type === 'zombieChewedPlant'))
})

test('the teams demo level places plants of both sides, and they fight', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, levelId: 'pvz:teams-demo', ownedSeeds: [] })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    const enemies = plants(server).filter(plant => plant.team === 'zombies')
    assert.equal(enemies.length, 9)
    assert.ok(enemies.every(plant => plant.column >= 6))
    const events = run(server, 900)
    assert.ok(events.some(event => event.type === 'plantHit'), 'the sides hit each other')
})

test('a projectile that finishes a hostile plant reports it and the plant leaves the lawn', () => {
    const server = begin()
    debug(server, '/plant repeater 3 1')
    debug(server, '/plant sunflower 3 3 zombies')
    server.drainEvents()
    const enemy = () => plants(server).find(plant => plant.team === 'zombies')
    const events: { type: string, data: Record<string, unknown> }[] = []
    for (let tick = 0; tick < 4000 && enemy(); tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    assert.equal(enemy(), undefined, 'the sunflower is shot down')
    const last = events.filter(event => event.type === 'projectileImpact' && event.data.target === 'plant').at(-1)!
    assert.equal(last.data.targetTypeId, 'pvz:sunflower')
})

test('a hostile snow pea chills a plant, which then does everything at half speed', () => {
    const server = begin()
    // Unhurt, the plants trade shots for the whole count; invincible plants still chill.
    debug(server, '/plantinvincible true')
    debug(server, '/plant peashooter 3 1')
    debug(server, '/plant snowpea 3 8 zombies')
    debug(server, '/plant peashooter 2 1')
    debug(server, '/plant peashooter 2 8 zombies')
    const shooter = (row: number) => plants(server).find(plant => plant.row === row - 1 && plant.column === 0)!.entityId
    const chilled = shooter(3), control = shooter(2)
    server.drainEvents()
    // Until the first snow pea lands.
    for (let tick = 0; tick < 2000 && !plants(server).find(plant => plant.entityId === chilled)!.chilledTicks; tick++) server.tick()
    assert.ok(plants(server).find(plant => plant.entityId === chilled)!.chilledTicks! > 0, 'the snow pea chills the plant')
    server.drainEvents()
    const events = run(server, 3000)
    const shots = (id: number) => events.filter(event => event.type === 'projectileFired' && event.data.plantId === id).length
    assert.ok(shots(chilled) > 0 && shots(chilled) * 1.5 < shots(control), `the chilled shooter fires about half as often (${shots(chilled)} vs ${shots(control)})`)
    assert.equal(plants(server).find(plant => plant.entityId === control)!.chilledTicks, undefined, 'a plain pea does not chill')
    server.start({ ...options, save: server.save() as unknown as JsonValue })
    assert.ok(plants(server).find(plant => plant.row === 2 && plant.column === 0)!.chilledTicks! > 0, 'the chill survives a save')
})

test('peas fly over low plants and hit the plant behind', () => {
    const server = begin()
    debug(server, '/plant peashooter 3 1')
    debug(server, '/plant potatomine 3 4 zombies')
    debug(server, '/plant puffshroom 3 5 zombies')
    debug(server, '/plant sunflower 3 7 zombies')
    server.drainEvents()
    const events = run(server, 600)
    const hits = events.filter(event => event.type === 'projectileImpact' && event.data.target === 'plant')
    assert.ok(hits.length > 0 && hits.every(event => event.data.targetTypeId === 'pvz:sunflower'), 'only the sunflower is hit')
    for (const low of plants(server).filter(plant => plant.typeId !== 'pvz:sunflower' && plant.team === 'zombies')) assert.equal(low.health, low.maxHealth)
})

test('a shooter with only low plants ahead holds its fire', () => {
    const server = begin()
    debug(server, '/plant peashooter 3 1')
    debug(server, '/plant potatomine 3 5 zombies')
    server.drainEvents()
    assert.ok(!run(server, 600).some(event => event.type === 'projectileFired'))
})

test('an armed potato mine reaches half a cell further for hostile plants', () => {
    const server = begin()
    debug(server, '/plant potatomine 3 3 zombies')
    const mine = plants(server).find(plant => plant.typeId === 'pvz:potatomine')!
    for (let tick = 0; tick < 2000 && plants(server)[0].ability?.state !== 'armed'; tick++) server.tick()
    assert.equal(plants(server)[0].ability?.state, 'armed', 'the mine arms')
    // Two cells ahead is out of reach.
    debug(server, '/plant wallnut 3 1')
    server.drainEvents()
    assert.ok(!run(server, 100).some(event => event.type === 'plantExploded'), 'a plant two cells ahead does not set it off')
    // The next cell is in reach, and in the blast.
    debug(server, '/plant chomper 3 2')
    server.drainEvents()
    const events = run(server, 100)
    const blast = events.find(event => event.type === 'plantExploded' && event.data.entityId === mine.entityId)
    assert.ok(blast, 'the plant in the next cell sets it off')
    assert.equal(blast.data.x, mine.x + 80 - 20, 'the effect plays at the mirrored center')
    assert.equal(blast.data.team, 'zombies', 'the client mirrors the offset of the effect')
    assert.ok(!events.some(event => event.type === 'chomperBit' && event.data.ate === true), 'the chomper swallows nothing')
    assert.deepEqual(plants(server).map(plant => plant.typeId), ['pvz:wallnut'], 'the blast takes the plant in the next cell')
})

test('a chomper chewing a plant remembers it until it is ready again', () => {
    const server = begin()
    debug(server, '/plant chomper 3 1')
    debug(server, '/plant sunflower 3 2 zombies')
    const chomper = () => plants(server).find(plant => plant.typeId === 'pvz:chomper')!
    for (let tick = 0; tick < 500 && chomper().ability?.state !== 'digesting'; tick++) server.tick()
    assert.deepEqual(chomper().ability, { ...chomper().ability!, state: 'digesting', prey: 'plant' })
    server.start({ ...options, save: server.save() as unknown as JsonValue })
    assert.equal(chomper().ability?.prey, 'plant', 'it survives a save')
    for (let tick = 0; tick < 6000 && chomper().ability?.state !== 'ready'; tick++) server.tick()
    assert.deepEqual(chomper().ability, { state: 'ready', ticks: 0 })
})

test('a plant chilled by a hostile snow pea reports the chill once', () => {
    const server = begin()
    debug(server, '/plantinvincible true')
    debug(server, '/plant wallnut 3 1')
    debug(server, '/plant snowpea 3 8 zombies')
    server.drainEvents()
    const chills = run(server, 1500).filter(event => event.type === 'plantChilled')
    assert.equal(chills.length, 1, 'the frozen sound plays once while it stays chilled')
})

test('the shovel cannot dig up a plant on the zombies’ side', () => {
    const server = begin()
    debug(server, '/plant sunflower 3 3 zombies')
    assert.equal(runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' }), undefined)
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'useToolAt', row: 2, column: 2 }), undefined)
    assert.ok(server.drainEvents().some(event => event.type === 'toolMissed'), 'the shovel misses')
    assert.equal(plants(server).length, 1, 'the plant stays')
    // The same dig at a plant of the player's side takes it.
    debug(server, '/plant sunflower 3 4')
    runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' })
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'useToolAt', row: 2, column: 3 }), undefined)
    assert.ok(server.drainEvents().some(event => event.type === 'plantShoveled'))
    assert.deepEqual(plants(server).map(plant => plant.team), ['zombies'])
})

test('two hostile bowling nuts that meet strike each other whichever the run reaches first', () => {
    const meet = (left: string, right: string, rightFirst: boolean) => {
        const server = begin()
        const commands = [`/plant ${left} 3 1`, `/plant ${right} 3 9 zombies`]
        for (const command of rightFirst ? commands.reverse() : commands) debug(server, command)
        server.drainEvents()
        let events: string[] = []
        for (let tick = 0; tick < 600 && !events.length; tick++) {
            server.tick()
            events = server.drainEvents().filter(event => ['bowlingImpact', 'plantExploded'].includes(event.type))
                .map(event => `${event.type} ${event.data.plantTypeId ?? event.data.typeId}`)
        }
        return { plants: plants(server).map(plant => [plant.typeId, plant.team ?? 'plants', plant.health, plant.row !== 2]).sort(), events: events.sort() }
    }
    const nut = 'pvz:bowling-wallnut'
    const cases = [
        ['bowling-wallnut', 'bowling-wallnut', [[nut, 'plants', 2200, true], [nut, 'zombies', 2200, true]]],
        ['bowling-wallnut', 'bowling-explodenut', [[nut, 'plants', 2200, true]]],
        ['bowling-explodenut', 'bowling-wallnut', [[nut, 'zombies', 2200, true]]],
        ['bowling-explodenut', 'bowling-explodenut', []],
    ] as const
    for (const [left, right, expected] of cases) {
        const first = meet(left, right, false), second = meet(left, right, true)
        assert.deepEqual(first.plants, [...expected].map(entry => [...entry]).sort(), `${left} meeting ${right}: both blows land, the survivors bounce`)
        assert.deepEqual(second, first, `${left} meeting ${right} the other way round: the same plants and the same events`)
    }
    // An explode-o-nut blows up before the plain nut's blow, which then finds nothing to strike.
    assert.deepEqual(meet('bowling-wallnut', 'bowling-explodenut', false).events, ['plantExploded pvz:bowling-explodenut'])
})

test('an enemy snow pea chills a zombie on the plants\u2019 side', () => {
    const server = begin()
    debug(server, '/plant snowpea 3 8 zombies')
    debug(server, '/zombie buckethead 3 2 plants')
    server.drainEvents()
    const events: { type: string, data: Record<string, unknown> }[] = []
    for (let tick = 0; tick < 600 && !events.some(event => event.type === 'zombieChilled'); tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    assert.ok(events.some(event => event.type === 'zombieChilled'), 'the hit zombie chills')
    assert.equal(zombies(server)[0].chilled, true)
})

test('a seed packet of the zombies’ side, from /seed, plants on that side and survives a save', () => {
    const server = begin()
    debug(server, '/sun set 500')
    assert.equal(debug(server, '/seed 1 peashooter zombies').ok, true)
    assert.equal(server.snapshot().seedPackets[0].team, 'zombies')
    server.start({ ...options, save: server.save() as unknown as JsonValue })
    assert.equal(server.snapshot().seedPackets[0].team, 'zombies', 'the packet keeps its side')
    debug(server, '/cooldown false')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter', slot: 0 }), undefined)
    assert.deepEqual(server.snapshot().cursor, { mode: 'seed', seedId: 'pvz:peashooter', team: 'zombies' })
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 6 }), undefined)
    assert.equal(plants(server).at(-1)!.team, 'zombies')
    debug(server, '/seed 1 peashooter')
    assert.equal(server.snapshot().seedPackets[0].team, undefined, 'without a side the packet is the plants’ again')
})

test('a zombie seed puts a zombie into any cell of an active row, of the zombies’ side unless its packet says otherwise', () => {
    const server = begin()
    debug(server, '/sun set 500')
    debug(server, '/plant peashooter 3 3')
    assert.equal(debug(server, '/seed 1 normal').ok, true)
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:normal', slot: 0 }), undefined)
    assert.deepEqual(server.snapshot().cursor, { mode: 'seed', seedId: 'pvz:normal' })
    // Challenge::IZombiePlaceZombie: on a plant's cell too, 30 left of it.
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 2 }), undefined)
    const [placed] = zombies(server)
    assert.deepEqual([placed.typeId, placed.row, placed.team], ['pvz:normal', 2, undefined])
    const board = definitions.boards[levels.levels['pvz:adventure-1-4'].board]
    assert.equal(placed.x, board.origin.x + 2 * board.cell.width - 30)
    assert.equal(server.snapshot().sun, 450)
    assert.ok(server.drainEvents().some(event => event.type === 'zombiePlaced'))
    assert.equal(plants(server).length, 1, 'no plant is made')
    // No recharge (Plant::GetRefreshTime): it can go down again at once.
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:normal', slot: 0 }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 7, column: 8 }), 'row-not-active')

    debug(server, '/seed 1 normal plants')
    assert.equal(server.snapshot().seedPackets[0].team, 'plants')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:normal', slot: 0 }), undefined)
    assert.deepEqual(server.snapshot().cursor, { mode: 'seed', seedId: 'pvz:normal', team: 'plants' })
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 5 }), undefined)
    const ally = zombies(server).at(-1)!
    assert.equal(ally.team, 'plants', 'a packet of the plants’ side puts down a zombie of that side')
    assert.equal(ally.mindControlled, undefined, 'one put down on the plants’ side is not mind-controlled, so it is not tinted')
    const allyEntity = [...world(server).query(ZombieComponent)].find(entity => entity === ally.entityId)!
    world(server).get(allyEntity, ZombieComponent)!.mindControlled = true
    assert.equal(zombies(server).at(-1)!.mindControlled, true, 'a mind-controlled zombie shows it')
    server.start({ ...options, save: server.save() as unknown as JsonValue })
    assert.equal(zombies(server).find(zombie => zombie.team === 'plants')!.mindControlled, true, 'and keeps it through a save')
    debug(server, '/sun set 500')
    debug(server, '/seed 1 normal zombies')
    assert.equal(server.snapshot().seedPackets[0].team, undefined, 'its own side is not stored')
    assert.equal(debug(server, '/plant normal 3 1').ok, false, '/plant only plants')
})

test('a pole vaulter facing right vaults right over a hostile plant, and one put down on a plant does not vault back', () => {
    const server = begin()
    debug(server, '/plant wallnut 3 6 zombies')
    debug(server, '/zombie pole_vaulter 3 2 plants')
    const nut = plants(server)[0]
    let vaulted = false
    for (let tick = 0; tick < 3000 && !(vaulted && zombies(server)[0].state === 'walking'); tick++) {
        server.tick()
        vaulted ||= zombies(server)[0].state === 'vaulting'
    }
    assert.ok(vaulted, 'it vaults')
    assert.ok(zombies(server)[0].x > nut.x, 'it lands past the nut, to the right')
    assert.equal(plants(server)[0].health, nut.maxHealth, 'the nut is untouched')

    const other = begin()
    debug(other, '/sun set 500')
    debug(other, '/plant wallnut 3 5')
    debug(other, '/seed 1 pole_vaulter')
    runCommand(other, { type: 'selectSeed', seedId: 'pvz:pole_vaulter', slot: 0 })
    assert.equal(runCommand(other, { type: 'placePlant', row: 2, column: 4 }), undefined)
    const start = zombies(other)[0].x
    let max = start
    for (let tick = 0; tick < 600; tick++) { other.tick(); max = Math.max(max, zombies(other)[0].x) }
    assert.equal(max, start, 'it never moves back right')
})

test('every zombie has a seed, the flag and newspaper zombies too', () => {
    const server = begin()
    for (const name of ['normal', 'flag', 'conehead', 'pole_vaulter', 'buckethead', 'newspaper', 'screendoor']) {
        assert.equal(debug(server, `/seed 1 ${name}`).ok, true, name)
    }
})

test('a zombie of the plants’ side charred by an enemy blast crumbles facing right', () => {
    const server = begin()
    debug(server, '/plant cherrybomb 3 4 zombies')
    debug(server, '/zombie normal 3 3 plants')
    server.drainEvents()
    const charred = run(server, 200).find(event => event.type === 'zombieCharred')
    assert.ok(charred, 'the blast chars it')
    assert.equal(charred.data.team, 'plants')
})

test('a zombie put down facing right stands its own facingRightOffsetX further; one facing left does not', () => {
    const server = begin()
    debug(server, '/sun set 500')
    const put = (seed: string, row: number, team = 'plants') => {
        debug(server, `/seed 1 ${seed} ${team}`)
        runCommand(server, { type: 'selectSeed', seedId: `pvz:${seed}`, slot: 0 })
        assert.equal(runCommand(server, { type: 'placePlant', row, column: 4 }), undefined)
        return zombies(server).find(zombie => zombie.row === row)!.x
    }
    const offset = definitions.zombies['pvz:pole_vaulter'].facingRightOffsetX!
    assert.ok(Math.abs(put('pole_vaulter', 1) - put('normal', 2) - offset) < 1e-9)
    assert.equal(put('pole_vaulter', 3, 'zombies'), put('normal', 0, 'zombies'))
})
