import assert from 'node:assert/strict'
import test from 'node:test'
import { World } from '@/ecs'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { LevelStateResource, RandomResource, ZombieComponent } from '@/server/state/components'
import { createEventQueue, drainServerEvents, EventQueueResource } from '@/server/state/events'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-3', randomSeed: 3, initialMoney: 0, firstAdventure: true, ownedSeeds: adventureSeeds(levels, 'pvz:adventure-2-3'), mods: [] }
const offer = { cost: 75 }
const SEEDS = ['puffshroom', 'sunshroom', 'fumeshroom', 'peashooter', 'wallnut', 'cherrybomb', 'potatomine'].map(id => `pvz:${id}`)

function start(packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, ...packet })
    return server
}

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    return server.drainCommandResults()[0].debug
}

function play(server: IntegratedGameServer, slots: number) {
    for (const seedId of SEEDS.slice(0, slots)) assert.equal(runCommand(server, { type: 'chooseSeed', seedId }), undefined)
    assert.equal(runCommand(server, { type: 'confirmSeeds' }), undefined)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
}

test('2-3 introduces the screen door in wave 6 and the flag wave only, over 2-2\'s graves, and awards the Grave Buster', () => {
    const level = levels.levels['pvz:adventure-2-3']
    assert.equal(level.adventureIndex, 13)
    assert.equal(levels.levels['pvz:adventure-2-2'].nextLevel, 'pvz:adventure-2-3')
    assert.deepEqual(level.award, { kind: 'seed', id: 'pvz:gravebuster' })
    assert.deepEqual(level.graves, levels.levels['pvz:adventure-2-2'].graves)
    for (let seed = 1; seed <= 40; seed++) {
        const waves = start({ randomSeed: seed }).save().wave.plan.map(wave => wave.zombies)
        assert.equal(waves.length, 10)
        assert.deepEqual(waves[5], ['pvz:screendoor'], 'Board::PickZombieWaves puts the introduced zombie in wave mNumWaves / 2')
        const final = [...waves[9]].sort()
        assert.deepEqual(final, ['pvz:conehead', 'pvz:flag', 'pvz:normal', 'pvz:normal', 'pvz:normal', 'pvz:normal', 'pvz:screendoor'],
            'four plain zombies and the flag, the introduced door, then PutInMissingZombies adds a cone')
        for (const [index, wave] of waves.entries()) {
            if (index !== 5 && index !== 9) assert.ok(!wave.includes('pvz:screendoor'), `wave ${index} never has the 4 points a door costs`)
            assert.ok(wave.every(id => id === 'pvz:normal' || id === 'pvz:conehead' || id === 'pvz:screendoor' || id === 'pvz:flag'))
        }
        for (const index of [0, 1, 2]) assert.deepEqual(waves[index], ['pvz:normal'])
    }
})

test('a screen door absorbs peas without chill, lets fume through, and falls when its zombie dies holding it', () => {
    const world = new World()
    const definition = levels.levels['pvz:adventure-2-3']
    world.resources.set(LevelStateResource, { id: options.levelId, definition, board: definitions.boards['pvz:night'], phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(RandomResource, new DeterministicRng(7))
    world.resources.set(EventQueueResource, createEventQueue())
    const events = () => drainServerEvents(world.resources.get(EventQueueResource))
    const door = spawnZombie(world, definitions, 'pvz:screendoor', 0, 500, 50)
    const zombie = world.get(door, ZombieComponent)!
    assert.deepEqual([zombie.shieldHealth, zombie.health], [1100, 270])
    damageZombie(world, definitions, door, 20, { chillTicks: 1000 })
    assert.deepEqual([zombie.shieldHealth, zombie.health, zombie.chilledTicks], [1080, 270, 0], 'TakeShieldDamage applies no DAMAGE_FREEZE')
    damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.deepEqual([zombie.shieldHealth, zombie.health], [1060, 250], 'the fume-shroom hits the door and the body')
    for (let hit = 0; hit < 4; hit++) damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.equal(zombie.hasArm, true, 'Zombie::DropArm waits for the door to go')
    events()
    for (let hit = 0; zombie.health > 0; hit++) damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.equal(zombie.state, 'dying')
    assert.equal(zombie.shieldHealth, 0)
    assert.ok(events().some(event => event.type === 'zombieShieldDropped' && event.data.shield === 'door' && event.data.bypassed === true),
        'PlayDeathAnim drops the door with DropShield(1U)')

    const broken = spawnZombie(world, definitions, 'pvz:screendoor', 1, 500, 150)
    damageZombie(world, definitions, broken, 1100)
    const dropped = events().filter(event => event.type === 'zombieShieldDropped')
    assert.deepEqual(dropped.map(event => [event.data.shield, event.data.bypassed]), [['door', undefined]])
    assert.equal(world.get(broken, ZombieComponent)!.health, 270)
})

test('Zombie::TakeDamage: a zombie with a helm and a shield loses the shield, then the helm, then its body', () => {
    // A Mod zombie: the screen door zombie wearing a cone as well.
    const armored = { ...definitions, zombies: { ...definitions.zombies, 'pvz:screendoor': { ...definitions.zombies['pvz:screendoor'], helm: { type: 'cone', health: 370 } } } }
    const world = new World()
    world.resources.set(LevelStateResource, { id: options.levelId, definition: levels.levels['pvz:adventure-2-3'], board: definitions.boards['pvz:night'], phase: 'gameplay', result: 'playing', paused: false })
    world.resources.set(RandomResource, new DeterministicRng(7))
    world.resources.set(EventQueueResource, createEventQueue())
    const entity = spawnZombie(world, armored, 'pvz:screendoor', 0, 500, 50)
    const zombie = world.get(entity, ZombieComponent)!
    const armor = () => [zombie.shieldHealth, zombie.helmHealth, zombie.health]
    assert.deepEqual(armor(), [1100, 370, 270])
    damageZombie(world, armored, entity, 1200)
    assert.deepEqual(armor(), [0, 270, 270], 'the door takes 1100 and the cone the rest')
    damageZombie(world, armored, entity, 20, { hitsShieldAndBody: true })
    assert.deepEqual(armor(), [0, 250, 270], 'without the door, a fume hit reaches the cone first')
    damageZombie(world, armored, entity, 300)
    assert.deepEqual(armor(), [0, 0, 220])
    const dropped = drainServerEvents(world.resources.get(EventQueueResource)).filter(event => event.type === 'zombieShieldDropped' || event.type === 'zombieHelmDropped')
    assert.deepEqual(dropped.map(event => event.type), ['zombieShieldDropped', 'zombieHelmDropped'])
})

test('wave health counts a screen door at 0.2, so the next wave can come early', () => {
    const server = start()
    play(server, 6)
    for (let wave = 0; wave < 6; wave++) assert.equal(debug(server, '/nextwave')?.ok, true)
    const save = server.save()
    assert.equal(save.wave.index, 6)
    // Board::TotalZombiesHealthInWave: 270 + 1100 * 0.2f = 490, and the next wave comes below 0.5-0.65 of it.
    const threshold = save.wave.healthToNextWave!
    assert.ok(threshold >= 490 * 0.5 && threshold <= 490 * 0.65, `threshold ${threshold}`)
})

test('Crazy Dave sells the first seed slot in the 2-3 intro, and the chooser takes the seventh seed at once', () => {
    const server = start({ initialMoney: 75, packetUpgradeOffer: offer })
    assert.equal(runCommand(server, { type: 'chooseSeed', seedId: SEEDS[0] }), 'intro-not-complete')
    for (const index of [1501, 1502]) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index: 1503, question: { kind: 'pvz:packetUpgrade', cost: 75, slots: 7 } },
        '{NO_CLICK}: the line asks for the Yes/No dialog, with its price and mPurchases + 7 slots, and only the answer moves on')
    assert.equal(server.snapshot().tutorial.dave, true, 'the offer brings Dave like other scripted dialogue')
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'answerDialog', accept: true }), undefined)
    assert.deepEqual(server.drainEvents().filter(event => event.type.startsWith('packetUpgrade')).map(event => [event.type, event.data]),
        [['packetUpgradePurchased', { cost: 75, upgrades: 1 }]])
    assert.equal(server.snapshot().money, 0)
    assert.equal(server.snapshot().seedChooser!.slots, 7)
    for (const index of [1510, 1511]) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    assert.equal(server.snapshot().extensions['pvz:dialog'], undefined)
    assert.equal(runCommand(server, { type: 'answerDialog', accept: true }), undefined)
    assert.equal(server.snapshot().money, 0, 'an answer with no question changes nothing')
    play(server, 7)
    assert.equal(server.snapshot().seedPackets.length, 7)
    // The profile now owns the upgrade; a restored game keeps the bank it was chosen with.
    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...options, packetUpgrades: 1, save: server.save() as unknown as JsonValue })
    assert.equal(restored.snapshot().seedPackets.length, 7)
})

test('/money works in the intro and tells the client to show the coin bank', () => {
    const server = start()
    server.drainEvents()
    assert.equal(debug(server, '/money set 75')?.ok, true)
    assert.equal(server.snapshot().money, 75)
    assert.deepEqual(server.drainEvents().filter(event => event.type === 'moneyChanged').map(event => event.data), [{ money: 75 }])
    assert.equal(debug(server, '/sun set 100')?.ok, false, 'board commands still wait for play')
})

test('turning Dave down keeps six slots, and he only offers what the player can afford on a first adventure', () => {
    const declined = start({ initialMoney: 80, packetUpgradeOffer: offer })
    for (let line = 0; line < 3; line++) runCommand(declined, { type: 'advanceDialog' })
    declined.drainEvents()
    assert.equal(runCommand(declined, { type: 'answerDialog', accept: false }), undefined)
    assert.ok(declined.drainEvents().some(event => event.type === 'packetUpgradeDeclined'))
    assert.deepEqual(declined.snapshot().extensions['pvz:dialog'], { index: 1520 })
    runCommand(declined, { type: 'advanceDialog' })
    assert.equal(declined.snapshot().extensions['pvz:dialog'], undefined)
    assert.equal(declined.snapshot().money, 80)
    assert.equal(declined.snapshot().seedChooser!.slots, 6)
    play(declined, 6)

    for (const packet of [
        { initialMoney: 74, packetUpgradeOffer: offer },
        { initialMoney: 2000, packetUpgradeOffer: offer, packetUpgrades: 1 },
        { initialMoney: 2000 },
        { initialMoney: 2000, packetUpgradeOffer: offer, firstAdventure: false },
    ]) {
        const server = start(packet)
        assert.equal(server.snapshot().extensions['pvz:dialog'], undefined, JSON.stringify(packet))
        assert.equal(server.snapshot().tutorial.step, 'complete')
        assert.equal(server.snapshot().seedChooser!.slots, 6 + (packet.packetUpgrades ?? 0))
    }
})

test('a game saved during the seed-slot pitch can still sell it after a restore', () => {
    const server = start({ initialMoney: 75, packetUpgradeOffer: offer })
    for (let line = 0; line < 2; line++) runCommand(server, { type: 'advanceDialog' })
    const restored = new IntegratedGameServer(definitions, levels)
    restored.restore(JSON.parse(JSON.stringify(server.save())) as JsonValue)
    assert.deepEqual(restored.snapshot().extensions['pvz:dialog'], { index: 1503, question: { kind: 'pvz:packetUpgrade', cost: 75, slots: 7 } })
    assert.equal(runCommand(restored, { type: 'answerDialog', accept: true }), undefined)
    assert.equal(restored.snapshot().money, 0)
    assert.equal(restored.snapshot().seedChooser!.slots, 7)
})

test('a slot bought in the store while the level is up widens an open chooser; a bank in play keeps its size', () => {
    // StoreScreen::PurchaseItem calls SeedBank::UpdateWidth when a board is up; the store opens from the chooser.
    const choosing = start({ initialMoney: 100 })
    assert.equal(runCommand(choosing, { type: 'pause' }), undefined)
    assert.equal(runCommand(choosing, { type: 'syncPurse', money: 25, packetUpgrades: 1 }), undefined, 'the level is paused under the store')
    assert.equal(runCommand(choosing, { type: 'resume' }), undefined)
    assert.deepEqual([choosing.snapshot().seedChooser!.slots, choosing.snapshot().money], [7, 25])
    play(choosing, 7)
    assert.equal(choosing.snapshot().seedPackets.length, 7)

    const playing = start({ initialMoney: 100 })
    play(playing, 6)
    assert.equal(runCommand(playing, { type: 'syncPurse', money: 25, packetUpgrades: 1 }), undefined)
    assert.deepEqual([playing.snapshot().seedPackets.length, playing.snapshot().money], [6, 25], 'the coins follow the profile, the bank waits for the next level')
})
