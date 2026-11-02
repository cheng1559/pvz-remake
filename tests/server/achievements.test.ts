import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { adventureSeeds } from './adventure-seeds'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }

function debug(server: IntegratedGameServer, command: string) {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    return server.drainCommandResults()[0].debug as { ok: boolean, key?: string }
}
/** A replayed level of the adventure (no tutorial), past the intro. */
function begin(levelId: string, packet: Partial<StartSessionPacket> = {}) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, levelId, ownedSeeds: adventureSeeds(levels, levelId), ...packet })
    while (server.snapshot().extensions['pvz:dialog']) runCommand(server, { type: 'advanceDialog' })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}
const earned = (server: IntegratedGameServer) =>
    server.drainEvents().filter(event => event.type === 'achievementEarned').map(event => [event.data.id, event.data.announce])
function tickUntil(server: IntegratedGameServer, ticks: number, done: () => boolean) {
    for (let tick = 0; tick < ticks && !done(); tick++) server.tick()
}

test('a level reports each achievement the player lacks once, with whether it was announced', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, earnedAchievements: ['pvz:spudow'] })
    assert.equal(debug(server, '/achievement give spudow').key, 'DEBUG_ACHIEVEMENT_EARNED', 'the profile already has it')
    assert.equal(debug(server, '/achievement give sunny_days').ok, true)
    assert.deepEqual(earned(server), [['pvz:sunny-days', true]])
    assert.equal(debug(server, '/achievement give sunny-days').ok, false)
    assert.equal(debug(server, '/achievement give nothing').key, 'DEBUG_ACHIEVEMENT_NOT_INSTALLED')
    // A save does not keep them: the profile does, and a restored level takes its list from the start packet.
    server.start({ ...options, save: server.save() as unknown as JsonValue, earnedAchievements: ['pvz:immortal'] })
    assert.equal(debug(server, '/achievement give immortal').key, 'DEBUG_ACHIEVEMENT_EARNED')
    assert.equal(debug(server, '/achievement give sunny-days').ok, true)
    assert.equal(debug(server, '/achievement reset sunny-days').ok, true)
    assert.equal(debug(server, '/achievement give sunny-days').ok, true)
    assert.equal(earned(server).length, 2)
})

test('a potato mine that kills, a cherry bomb that takes out ten zombies and 8000 sun are announced', () => {
    const mine = begin('pvz:adventure-1-4')
    debug(mine, '/plant potatomine 2 3')
    debug(mine, '/zombie normal 2 9')
    mine.drainEvents()
    let events: unknown[][] = []
    tickUntil(mine, 4000, () => (events = earned(mine)).length > 0)
    assert.deepEqual(events, [['pvz:spudow', true]])

    for (const zombies of [9, 10]) {
        const cherry = begin('pvz:adventure-1-4')
        debug(cherry, '/plant cherrybomb 3 5')
        for (let index = 0; index < zombies; index++) debug(cherry, `/zombie normal ${2 + index % 3} 5`)
        cherry.drainEvents()
        for (let tick = 0; tick < 120; tick++) cherry.tick()
        assert.deepEqual(earned(cherry), zombies === 10 ? [['pvz:explodonator', true]] : [], `${zombies} zombies`)
    }

    const sunny = begin('pvz:adventure-1-4')
    debug(sunny, '/sun set 7980')
    debug(sunny, '/item sun 3 3')
    const sun = sunny.snapshot().items.find(item => item.typeId === 'pvz:sun')!
    assert.equal(runCommand(sunny, { type: 'collectItemAt', itemId: sun.entityId }), undefined)
    sunny.drainEvents()
    let sunEvents: unknown[][] = []
    tickUntil(sunny, 500, () => (sunEvents = earned(sunny)).length > 0)
    assert.deepEqual(sunEvents, [['pvz:sunny-days', true]])
})

test('thirty coins in a row grant Penny Pincher, and a silver coin fading away starts the count over', () => {
    const server = begin('pvz:adventure-1-4')
    const collect = (count: number) => {
        for (let index = 0; index < count; index++) {
            debug(server, '/item coin_silver 3 3')
            const coin = server.snapshot().items.find(item => item.typeId === 'pvz:coin_silver' && item.state !== 'collecting')!
            assert.equal(runCommand(server, { type: 'collectItemAt', itemId: coin.entityId }), undefined)
            tickUntil(server, 300, () => !server.snapshot().items.some(item => item.entityId === coin.entityId))
        }
    }
    collect(29)
    debug(server, '/item coin_silver 3 3')
    tickUntil(server, 2000, () => !server.snapshot().items.some(item => item.typeId === 'pvz:coin_silver'))
    collect(29)
    assert.deepEqual(earned(server), [], 'the faded coin broke the run')
    collect(1)
    assert.deepEqual(earned(server), [['pvz:penny-pincher', true]])
})

test('a win lists the board’s planting achievements on the award page, from what the player planted', () => {
    const fresh = begin('pvz:adventure-1-4')
    debug(fresh, '/plant peashooter 3 1')
    debug(fresh, '/win')
    assert.deepEqual(earned(fresh), [['pvz:good-morning', false]], 'a plant from the debug command is not the player planting')

    const planted = begin('pvz:adventure-1-4')
    debug(planted, '/sun set 500')
    assert.equal(runCommand(planted, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(planted, { type: 'placePlant', row: 2, column: 0 }), undefined)
    // The level saves what was planted.
    planted.start({ ...options, levelId: 'pvz:adventure-1-4', save: planted.save() as unknown as JsonValue })
    debug(planted, '/win')
    assert.deepEqual(earned(planted), [])

    const night = begin('pvz:adventure-2-1', { ownedSeeds: ['pvz:peashooter'] })
    debug(night, '/win')
    assert.deepEqual(earned(night), [['pvz:no-fungus-among-us', false]])
    const bowling = begin('pvz:adventure-1-5')
    debug(bowling, '/win')
    assert.deepEqual(earned(bowling), [], 'Wall-nut Bowling grants none')

    const test = begin('pvz:stress-test', { ownedSeeds: ['pvz:peashooter'] })
    assert.equal(debug(test, '/achievement give sunny-days').key, 'DEBUG_ACHIEVEMENTS_OFF')
    debug(test, '/win')
    assert.deepEqual(earned(test), [], 'a level with achievements: false grants none')
})

test('achievement triggers are checked with the content', () => {
    const broken = (trigger: unknown) => {
        const source = readGameplaySource('definitions')
        source.achievements['pvz:spudow'].trigger = trigger
        return () => new IntegratedGameServer(parseGameplayDefinitions(source, readGameplaySource('seed-catalog')), levels)
    }
    assert.throws(broken({ kind: 'pvz:nothing' }), /achievement trigger is not installed: pvz:nothing/)
    assert.throws(broken({ kind: 'pvz:blast', plants: ['pvz:torchwood'], kills: 1 }), /plants references unknown ID pvz:torchwood/)
    assert.throws(broken({ kind: 'pvz:blast', plants: ['pvz:potatomine'], kills: 0 }), /kills must be a positive safe integer/)
})
