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

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-2-3', randomSeed: 3, initialMoney: 0, firstAdventure: true, mods: [] }
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
    assert.deepEqual([zombie.helmHealth, zombie.health], [1100, 270])
    damageZombie(world, definitions, door, 20, { chillTicks: 1000 })
    assert.deepEqual([zombie.helmHealth, zombie.health, zombie.chilledTicks], [1080, 270, 0], 'TakeShieldDamage applies no DAMAGE_FREEZE')
    damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.deepEqual([zombie.helmHealth, zombie.health], [1060, 250], 'the fume-shroom hits the door and the body')
    for (let hit = 0; hit < 4; hit++) damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.equal(zombie.hasArm, true, 'Zombie::DropArm waits for the door to go')
    events()
    for (let hit = 0; zombie.health > 0; hit++) damageZombie(world, definitions, door, 20, { hitsShieldAndBody: true })
    assert.equal(zombie.state, 'dying')
    assert.equal(zombie.helmHealth, 0)
    assert.ok(events().some(event => event.type === 'zombieHelmDropped' && event.data.helm === 'door' && event.data.bypassed === true),
        'PlayDeathAnim drops the door with DropShield(1U)')

    const broken = spawnZombie(world, definitions, 'pvz:screendoor', 1, 500, 150)
    damageZombie(world, definitions, broken, 1100)
    const dropped = events().filter(event => event.type === 'zombieHelmDropped')
    assert.deepEqual(dropped.map(event => [event.data.helm, event.data.bypassed]), [['door', undefined]])
    assert.equal(world.get(broken, ZombieComponent)!.health, 270)
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
