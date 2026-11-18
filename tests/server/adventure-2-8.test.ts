import assert from 'node:assert/strict'
import test from 'node:test'
import type { World } from '@/server/state/World'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { chillZombie } from '@/server/zombies/damage'
import { beatPhase, type Dancer } from '@/server/zombies/Dancer'
import { mindControl } from '@/server/zombies/mindControl'
import { startOffBoardPlant } from '@/shared/content/plantAnimation'
import { DANCE_BEAT, parseGameplayDefinitions, parseGameplayLevels, ZOMBIE_BODY_LAYER } from '@/shared/content/gameplay'
import { CRATER } from '@/shared/content/craters'
import type { CraterSnapshot, ServerEvent, StartSessionPacket, ZombieSnapshot } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { startFromSave } from './start-from-save'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-8', randomSeed: 8, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-8'), mods: [] }
const lead = definitions.zombies['pvz:dancer'].dance!.lead!
/** A dancer's phase as its snapshot shows it (Dancer.snapshotOwn). */
const phaseOf = (zombie: ZombieSnapshot | undefined) => zombie?.own?.phase

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

/** 2-8 in play, its chooser through, with no graves in the way of what a test puts down. */
function playing() {
    const server = start({ firstAdventure: false })
    if (server.snapshot().seedChooser) {
        for (const seedId of [...new Set(adventureSeeds(levels, 'pvz:adventure-2-8'))].slice(0, 6)) {
            assert.equal(runCommand(server, { type: 'chooseSeed', seedId }), undefined)
        }
        assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    }
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    const lawn = world(server)
    for (const item of [...lawn.gridItems]) lawn.destroyEntity(item.id)
    return server
}

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    const result = server.drainCommandResults()[0].debug as { ok: boolean }
    assert.equal(result.ok, true, command)
}

function ticks(server: IntegratedGameServer, count: number): ServerEvent[] {
    const events: ServerEvent[] = []
    for (let tick = 0; tick < count; tick++) {
        server.tick()
        events.push(...server.drainEvents())
    }
    return events
}

/** Ticks until `done`, at most `limit` of them; the events heard meanwhile. */
function until(server: IntegratedGameServer, done: () => boolean, limit: number): ServerEvent[] {
    const events: ServerEvent[] = []
    for (let tick = 0; !done(); tick++) {
        assert.ok(tick < limit, `not within ${limit} ticks`)
        events.push(...ticks(server, 1))
    }
    return events
}

const world = (server: IntegratedGameServer) => (server as unknown as { session: { world: World } }).session.world
const zombie = (server: IntegratedGameServer, entityId: number) => server.snapshot().zombies.find(candidate => candidate.entityId === entityId)!
const zombiesOf = (server: IntegratedGameServer, typeId: string) => server.snapshot().zombies.filter(candidate => candidate.typeId === typeId)

/** A dancer put down in the middle row, through its moonwalk and snap, its troupe come up out of the ground. */
function troupe(server: IntegratedGameServer, team = '') {
    debug(server, `/zombie dancer 3 9 ${team}`.trim())
    const leader = zombiesOf(server, 'pvz:dancer')[0].entityId
    const events = until(server, () => phaseOf(zombie(server, leader)) === 'hold', 400)
    return { leader, events, backups: zombiesOf(server, 'pvz:backup_dancer').map(backup => backup.entityId) }
}

test('2-8 follows 2-7 with 10 waves over seven graves, brings the dancer in on waves 6 and 10 and awards the doom-shroom', () => {
    const level = levels.levels['pvz:adventure-2-8']
    assert.equal(levels.levels['pvz:adventure-2-7'].nextLevel, 'pvz:adventure-2-8')
    // LawnApp::GetAwardSeedForLevel(18): (2 - 1) * 8 + 8 - 1 = 15, SEED_DOOMSHROOM.
    assert.deepEqual(level.award, { kind: 'seed', id: 'pvz:doomshroom' })
    // 1096 Board::InitLevel groups level 18 with 14 and 16.
    assert.deepEqual(start().snapshot().gridItems, start().snapshot().gridItems, 'same board seed reproduces the opening graves')
    const allowed = new Set(['pvz:normal', 'pvz:flag', 'pvz:conehead', 'pvz:dancer'])
    for (let seed = 1; seed <= 10; seed++) {
        const game = start({ randomSeed: seed })
        const graves = game.snapshot().gridItems!
        assert.deepEqual(graves.map(grave => grave.column).sort((a, b) => a - b), [5, 6, 7, 7, 8, 8, 8])
        assert.equal(new Set(graves.map(grave => `${grave.column},${grave.row}`)).size, 7)
        assert.ok(graves.every(grave => level.activeRows.includes(grave.row)))
        const waves = game.save().wave.plan.map(wave => wave.zombies)
        assert.equal(waves.length, 10)
        assert.deepEqual(waves.flatMap((wave, index) => wave.includes('pvz:flag') ? [index] : []), [9])
        assert.ok(waves.flat().every(id => allowed.has(id)), 'gZombieAllowedLevels for level 18')
        // The dancer comes in on level 18: Board::PickZombieWaves puts one in the middle wave and the last.
        assert.ok(waves[5].includes('pvz:dancer') && waves[9].includes('pvz:dancer'))
    }
    assert.deepEqual(start({ initialMoney: 1000, packetUpgradeOffer: { cost: 750 } }).snapshot().dialog, { index: 1501 })
})

test('the dancers: 500 and 270 health, drawn at 0.8, a backup dancer never picked for a wave', () => {
    const dancer = definitions.zombies['pvz:dancer'], backup = definitions.zombies['pvz:backup_dancer']
    assert.deepEqual([dancer.maxHealth, dancer.scale, dancer.wave], [500, 0.8, { points: 5, weight: 1000, firstWave: 5 }])
    assert.deepEqual([backup.maxHealth, backup.scale, backup.wave.weight, backup.dance], [270, 0.8, 0, {}])
    assert.deepEqual({ ...lead, moonwalkTicks: { ...lead.moonwalkTicks } }, {
        moonwalkTicks: { min: 300, max: 311 }, backup: 'pvz:backup_dancer',
        troupe: [{ row: -1, x: 0 }, { row: 1, x: 0 }, { row: 0, x: -100 }, { row: 0, x: 100 }],
        holdTicks: 200, summonTicks: 100, summonBeforeX: 700, riseTicks: 150,
    })
    assert.deepEqual(definitions.almanac['pvz:backup_dancer'], { place: 9, startingLevel: 18, spawnedOnly: true })
})

test('a dancer moonwalks in drawn turned round, snaps its fingers and calls up its troupe out of the ground around it', () => {
    const server = playing()
    debug(server, '/zombie dancer 3 9')
    const leader = zombiesOf(server, 'pvz:dancer')[0], from = leader.x
    assert.equal(phaseOf(leader), 'moonwalk')
    ticks(server, 100)
    // PlayZombieReanim's 24, which UpdateAnimSpeed leaves: the moonwalk's ground runs backwards (its distance < 1e-6).
    assert.equal(world(server).zombies.get(leader.entityId)!.animations[ZOMBIE_BODY_LAYER].rate, 24)
    assert.ok(zombie(server, leader.entityId).x < from - 40, 'it moonwalks toward the house')
    // Zombie::ZombieInitialize: mPhaseCounter = 300 + Rand(12).
    until(server, () => phaseOf(zombie(server, leader.entityId)) !== 'moonwalk', 220)
    assert.equal(phaseOf(zombie(server, leader.entityId)), 'summon')
    // Its ground at 24 a second and its size: about 0.49 a tick, some 150 in all.
    const moved = from - zombie(server, leader.entityId).x
    assert.ok(moved > 130 && moved < 170, `it moonwalked ${moved}`)
    const x = Math.trunc(zombie(server, leader.entityId).x)
    // The snap plays out (9 frames at 24 a second) before they come.
    const events = until(server, () => phaseOf(zombie(server, leader.entityId)) === 'hold', 40)
    assert.ok(events.some(event => event.type === 'dancerSnapped' && event.data.music === true), 'with the disco music, few zombies about')
    const called = events.filter(event => event.type === 'dancerCalledUp')
    const backups = zombiesOf(server, 'pvz:backup_dancer')
    assert.deepEqual(called.map(event => event.data.entityId), backups.map(backup => backup.entityId))
    assert.deepEqual(backups.map(backup => [backup.row, backup.x]), [[1, x], [3, x], [2, x - 100], [2, x + 100]])
    assert.ok(backups.every(backup => backup.riseTicks === lead.riseTicks && phaseOf(backup) === 'rise'))
    assert.ok(backups.every(backup => backup.animations[ZOMBIE_BODY_LAYER].rate === 0), 'they come up standing still')
    // They are risen once their leader has held its pose, which goes by the beat after.
    ticks(server, lead.holdTicks)
    const tick = server.snapshot().gameplayTick
    assert.ok(server.snapshot().zombies.every(dancer => phaseOf(dancer) === beatPhase(tick) && !dancer.riseTicks))
})

test('every dancer keeps the lawn\'s beat: walking on its first twelve beats and standing with its arm up on the rest', () => {
    const server = playing()
    debug(server, '/zombie backup_dancer 3 9')
    const dancer = zombiesOf(server, 'pvz:backup_dancer')[0].entityId
    let last = zombie(server, dancer)
    const steps = new Set<string>()
    for (let tick = 0; tick < DANCE_BEAT.ticks * DANCE_BEAT.beats; tick++) {
        ticks(server, 1)
        const now = zombie(server, dancer), step = beatPhase(server.snapshot().gameplayTick)
        assert.equal(phaseOf(now), step)
        steps.add(step)
        if (step !== 'walk') assert.equal(now.x, last.x, `it stands still on ${step}`)
        if (step === 'armUp' && phaseOf(last) === 'walk') {
            assert.equal(now.animations[ZOMBIE_BODY_LAYER].clip, 'raise')
            assert.ok(now.animations[ZOMBIE_BODY_LAYER].time >= 22 * DANCE_BEAT.armUpFrom, 'its arm goes up from part of the way')
        }
        last = now
    }
    assert.deepEqual([...steps].sort(), ['armUp', 'raise', 'raise2', 'walk'])
})

test('a troupe stands still while one of it is frozen, and goes slowed while one of it is chilled', () => {
    const server = playing()
    const { leader, backups } = troupe(server)
    ticks(server, lead.holdTicks)
    const lawn = world(server)
    lawn.zombies.get(backups[0])!.frozenTicks = 1000
    const from = zombie(server, leader).x
    ticks(server, DANCE_BEAT.ticks * DANCE_BEAT.beats)
    assert.equal(zombie(server, leader).x, from, 'it never walks')
    delete lawn.zombies.get(backups[0])!.frozenTicks
    chillZombie(lawn, definitions, lawn.zombies.get(backups[1])!, 1000)
    ticks(server, 1)
    const own = lawn.zombies.get(leader)!.animations[ZOMBIE_BODY_LAYER].rate
    assert.equal(zombie(server, leader).animations[ZOMBIE_BODY_LAYER].rate, own / 2, 'its body at half its rate')
    assert.equal(zombie(server, leader).chilled, false, 'not tinted')
})

test('a moonwalk is not slowed by a chill, and one frozen in it stands once thawed until it is through', () => {
    const server = playing()
    debug(server, '/zombie dancer 3 9')
    const leader = zombiesOf(server, 'pvz:dancer')[0].entityId, lawn = world(server)
    ticks(server, 20)
    // UpdateAnimSpeed sets its moonwalk no rate (its ground runs backwards), so ApplyAnimRate's chill never comes to it.
    chillZombie(lawn, definitions, lawn.zombies.get(leader)!, 1000)
    ticks(server, 1)
    assert.deepEqual([zombie(server, leader).chilled, zombie(server, leader).animations[ZOMBIE_BODY_LAYER].rate], [true, 24], 'tinted, at its own pace')
    const frames = definitions.zombies['pvz:dancer'].animation.clips.moonwalk.frames, before = zombie(server, leader).animations[ZOMBIE_BODY_LAYER].time
    ticks(server, 10)
    const gone = (zombie(server, leader).animations[ZOMBIE_BODY_LAYER].time - before + frames) % frames
    assert.ok(Math.abs(gone - 2.4) < 1e-6, `it moonwalks on at full speed: ${gone} frames in 10 ticks`)
    let from = zombie(server, leader).x

    // HitIceTrap stops its rate, and RemoveIceTrap's UpdateAnimSpeed sets it none again.
    const dancer = lawn.zombies.get(leader) as Dancer
    dancer.frozenTicks = 50
    const left = dancer.phaseTicks
    ticks(server, 50)
    assert.equal(dancer.frozenTicks, undefined, 'thawed')
    assert.equal(dancer.phaseTicks, left, 'its moonwalk does not count down while frozen')
    from = zombie(server, leader).x
    const time = zombie(server, leader).animations[ZOMBIE_BODY_LAYER].time
    ticks(server, left - 1)
    assert.deepEqual([phaseOf(zombie(server, leader)), zombie(server, leader).x, zombie(server, leader).animations[ZOMBIE_BODY_LAYER].time],
        ['moonwalk', from, time], 'thawed, it stands in its moonwalk')
    until(server, () => phaseOf(zombie(server, leader)) !== 'moonwalk', 3)
    assert.equal(phaseOf(zombie(server, leader)), 'summon', 'its moonwalk through, it snaps its fingers')
    assert.ok(zombie(server, leader).animations[ZOMBIE_BODY_LAYER].rate > 0)
})

test('a leader missing some of its troupe calls them up again on the beat its arm goes up', () => {
    const server = playing()
    const { leader, backups } = troupe(server)
    ticks(server, lead.holdTicks)
    world(server).destroyEntity(backups[2])
    const events = until(server, () => phaseOf(zombie(server, leader)) === 'resummon', lead.summonTicks + DANCE_BEAT.ticks * DANCE_BEAT.beats + 2)
    assert.equal(beatPhase(server.snapshot().gameplayTick), 'armUp')
    until(server, () => phaseOf(zombie(server, leader)) === 'hold', 40)
    const again = zombiesOf(server, 'pvz:backup_dancer').filter(backup => !backups.includes(backup.entityId))
    assert.equal(again.length, 1)
    assert.equal(again[0].row, 2)
    assert.ok(!events.some(event => event.type === 'dancerSnapped'), 'without the music this time')
})

test('a dancer on the plants\' side calls up its troupe on its side; a mind-controlled leader lets its troupe go, still leading it', () => {
    const plants = playing()
    const side = troupe(plants, 'plants')
    assert.ok(plants.snapshot().zombies.every(dancer => dancer.team === 'plants' && !dancer.mindControlled))
    const backups = zombiesOf(plants, 'pvz:backup_dancer')
    assert.deepEqual(backups.slice(2).map(backup => backup.x - Math.trunc(zombie(plants, side.leader).x)), [100, -100], 'its places turned round')

    const server = playing()
    const { leader } = troupe(server)
    ticks(server, lead.holdTicks)
    debug(server, '/plant hypnoshroom 1 1')
    const lawn = world(server), shroom = server.snapshot().plants[0].entityId
    mindControl(lawn, definitions, leader, shroom, { destroyEntity: entity => lawn.destroyEntity(entity) })
    assert.deepEqual((lawn.zombies.get(leader) as Dancer).troupe, [null, null, null, null])
    // Zombie::StartMindControlled leaves those it let go their mRelatedZombieID: they still stand while it eats.
    const letGo = zombiesOf(server, 'pvz:backup_dancer').map(backup => backup.entityId)
    assert.ok(letGo.every(id => (lawn.zombies.get(id) as Dancer).leader === leader), 'those it let go keep it as their leader')
    const hypnotized = lawn.zombies.get(leader)!, stander = lawn.zombies.get(letGo[0]) as Dancer
    const [state, phase] = [hypnotized.state, stander.phase]
    stander.phase = 'walk'
    assert.equal(stander.walks(lawn), true)
    hypnotized.state = 'eating'
    assert.equal(stander.walks(lawn), false, 'one it let go stands while it eats')
    hypnotized.state = state
    stander.phase = phase
    until(server, () => phaseOf(zombie(server, leader)) === 'hold', lead.summonTicks + 2 * DANCE_BEAT.ticks * DANCE_BEAT.beats)
    const called = zombiesOf(server, 'pvz:backup_dancer').filter(backup => backup.mindControlled)
    assert.equal(called.length, 4, 'four of its own side, mind-controlled as it is')
    assert.ok(called.every(backup => backup.team === 'plants'))
})

test('a dancer that reaches the house on a raised arm walks in on its walk', () => {
    const server = playing()
    // Put down at the house's edge while the beat has every dancer standing with its arm up.
    until(server, () => beatPhase(server.snapshot().gameplayTick + 1) === 'raise', DANCE_BEAT.ticks * DANCE_BEAT.beats)
    debug(server, '/zombie backup_dancer 3 1')
    const dancer = zombiesOf(server, 'pvz:backup_dancer')[0].entityId
    world(server).zombies.get(dancer)!.position.x = definitions.zombies['pvz:backup_dancer'].boardEdgeX
    const events = ticks(server, 1)
    assert.ok(events.some(event => event.type === 'levelLost' && event.data.zombieId === dancer))
    const body = zombie(server, dancer).animations[ZOMBIE_BODY_LAYER]
    assert.deepEqual([phaseOf(zombie(server, dancer)), body.clip, body.rate > 0], ['walk', 'walk', true])
})

test('a hypnotized Dancing Zombie earns Disco is Undead, a backup dancer does not', () => {
    const server = playing()
    const { leader, backups } = troupe(server)
    debug(server, '/plant hypnoshroom 1 1')
    debug(server, '/plant hypnoshroom 1 2')
    const lawn = world(server), [first, second] = server.snapshot().plants.map(plant => plant.entityId)
    const remover = { destroyEntity: (entity: number) => lawn.destroyEntity(entity) }
    const earned = () => server.drainEvents().filter(event => event.type === 'achievementEarned').map(event => [event.data.id, event.data.announce])
    server.drainEvents()
    mindControl(lawn, definitions, backups[0], first, remover)
    assert.deepEqual(earned(), [])
    mindControl(lawn, definitions, leader, second, remover)
    assert.deepEqual(earned(), [['pvz:disco-is-undead', true]], 'announced in the level (Zombie::StartMindControlled)')
})

test('a dancing troupe goes on the same from a save', () => {
    const server = playing()
    troupe(server)
    ticks(server, 50)
    const restored = new IntegratedGameServer(definitions, levels)
    startFromSave(restored, JSON.parse(JSON.stringify(server.save())))
    for (let tick = 0; tick < 600; tick++) {
        server.tick()
        restored.tick()
    }
    const shown = (zombies: ZombieSnapshot[]) => zombies.map(({ entityId, x, row, own, animations }) => ({ entityId, x, row, own, animations }))
    assert.deepEqual(shown(restored.snapshot().zombies), shown(server.snapshot().zombies))
})

test('the doom-shroom: 125 sun, recharging for 5000 and 3500 at the start, a night ash plant the ice keeps nothing of', () => {
    assert.deepEqual({ ...definitions.seeds['pvz:doomshroom'] }, {
        id: 'pvz:doomshroom', kind: 'plant', position: 15, sunCost: 125, cooldownTicks: 5000, initialCooldownTicks: 3500, placement: 'ground',
    })
    const plant = definitions.plants['pvz:doomshroom']
    assert.equal(plant.unfreezable, true)
    assert.deepEqual(plant.fuse!.crater, { ticks: 18000 })
})

test('a doom-shroom idles at 10 to 15 a second off the board; awake, it goes down with its fuse lit, its explode at 23', () => {
    const middle = { nextFloat: () => 0.5, integer: (min: number) => min }
    assert.deepEqual(startOffBoardPlant(definitions.plants['pvz:doomshroom'].animation!, middle).animations, { body: { clip: 'idle', time: 0, rate: 12.5 } },
        'Plant::PlantInitialize: RandRangeFloat(10, 15), its anim_idle')
    const server = playing()
    debug(server, '/plant doomshroom 3 5')
    assert.deepEqual(server.snapshot().plants[0].animations!.body, { clip: 'explode', time: 0, rate: 23 }, 'Plant::UpdateDoomShroom')
})

test('an awake doom-shroom blows up the lawn around it and leaves a crater no plant goes in, which wears away', () => {
    const server = playing()
    debug(server, '/plant doomshroom 3 5')
    debug(server, '/zombie normal 1 6')
    debug(server, '/zombie normal 5 3')
    debug(server, '/zombie normal 3 9')
    const events = ticks(server, 101)
    assert.equal(events.filter(event => event.type === 'zombieCharred').length, 2, 'those within 250 and three rows burn')
    assert.deepEqual(server.snapshot().zombies.map(zombie => zombie.row), [2], 'one further off is spared')
    const crater = server.snapshot().gridItems!.find(item => item.typeId === CRATER) as CraterSnapshot
    assert.deepEqual([crater.row, crater.column, crater.team], [2, 4, undefined])
    assert.ok(crater.ticks > 18000 - 5)
    debug(server, '/sun set 1000')
    debug(server, '/seed 1 peashooter')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter', slot: 0 }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 4 }), 'cell-has-crater')
    // It wears away: down to its last ticks, then gone.
    const lawn = world(server)
    ;([...lawn.gridItems].find(item => item.typeId === CRATER) as { ticks: number }).ticks = 3
    ticks(server, 3)
    assert.ok(!server.snapshot().gridItems?.some(item => item.typeId === CRATER))
})

test('a crater seed puts a crater down on any cell but a crater or a grave, the plants there dying, and a grave seed keeps off a crater', () => {
    const server = playing()
    debug(server, '/plantinvincible')
    debug(server, '/plant wallnut 2 3')
    debug(server, '/plantinvincible')
    debug(server, '/seed 1 crater')
    debug(server, '/seed 2 grave')
    debug(server, '/seed 3 crater zombies')
    debug(server, '/griditem grave 4 4')
    const place = (seedId: string, slot: number, row: number, column: number) => {
        assert.equal(runCommand(server, { type: 'selectSeed', seedId, slot }), undefined)
        return runCommand(server, { type: 'placePlant', row, column })
    }
    assert.equal(place('pvz:crater', 0, 1, 2), undefined)
    assert.ok(!server.snapshot().plants.some(plant => plant.row === 1 && plant.column === 2), 'the plant in the cell is gone')
    const crater = server.snapshot().gridItems!.find(item => item.typeId === CRATER) as CraterSnapshot
    assert.deepEqual([crater.row, crater.column, crater.ticks, crater.team], [1, 2, 18000, undefined], "the plants' own")
    assert.equal(place('pvz:crater', 0, 1, 2), 'cell-has-crater')
    assert.equal(place('pvz:crater', 0, 3, 3), 'cell-has-grave')
    assert.equal(place('pvz:grave', 1, 1, 2), 'cell-has-crater')
    assert.equal(place('pvz:crater', 2, 0, 6), undefined)
    assert.equal((server.snapshot().gridItems!.find(item => item.typeId === CRATER && item.row === 0) as CraterSnapshot).team, 'zombies')
    // A save keeps them, with their side and ticks.
    const restored = new IntegratedGameServer(definitions, levels)
    startFromSave(restored, JSON.parse(JSON.stringify(server.save())))
    assert.deepEqual(restored.snapshot().gridItems, server.snapshot().gridItems)
})
