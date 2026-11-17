import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { framePosition } from '@/shared/content/animation'
import type { StartSessionPacket } from '@/shared/protocol'
import { adventureSeeds } from './adventure-seeds'
import { runCommand } from './run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1, levelId: 'pvz:adventure-1-4',
    randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [], ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-4') }

function begin(...commands: string[]) {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    for (const command of commands) debug(server, command)
    return server
}

function debug(server: IntegratedGameServer, command: string): void {
    server.enqueueDebugCommand(1, command)
    server.processBoundaryCommands()
    assert.equal((server.drainCommandResults()[0].debug as { ok: boolean }).ok, true, command)
}

test('a potato mine rises and arms on its layers, its light flashing faster as a zombie nears', () => {
    const server = begin('/plant potatomine 3 3')
    const mine = () => server.snapshot().plants[0]
    const until = (state: string) => { for (let tick = 0; tick < 2000 && mine().own!.state !== state; tick++) server.tick() }
    assert.deepEqual(mine().animations, { body: { clip: 'buried', time: 0, rate: 12 } })
    until('rising')
    assert.deepEqual(Object.entries(mine().animations!).map(([layer, state]) => [layer, state.clip]), [['body', 'rise']])
    // Its 19 frames at 18 a second are through within the 106 ticks it rises for, and it holds the last.
    for (let tick = 0; tick < 105; tick++) server.tick()
    assert.deepEqual([mine().own!.state, mine().animations!.body.time], ['rising', 19])
    until('armed')
    server.tick()
    const { body, light } = mine().animations!
    assert.deepEqual([body.clip, light.clip], ['armed', 'glow'])
    assert.ok(body.rate >= 12 && body.rate <= 15, `armed at ${body.rate}`)
    // Plant::UpdatePotato: the light goes round its 10 frames 2 a second slower than the body, lit for the first of each round.
    assert.equal(light.rate, body.rate - 2)
    let lit = 0
    const round = Math.round(10 / (light.rate / 100))
    for (let tick = 0; tick < round; tick++) if (!server.tick().plants[0].animations!.light.hidden) lit++
    assert.ok(Math.abs(lit - round / 9) <= 1, `lit for ${lit} of ${round} ticks`)

    // A zombie within 50 of its reach shortens the round to 3 frames.
    debug(server, '/zombie normal 3 5')
    let fastest = 0
    for (let tick = 0; tick < 3000 && server.snapshot().plants.length; tick++) {
        fastest = Math.max(fastest, server.tick().plants[0]?.animations!.light.rate ?? 0)
    }
    assert.equal(server.snapshot().plants.length, 0, 'the zombie sets it off')
    assert.equal(fastest, (body.rate - 2) * 10 / 3)
})

test('a mushroom by day sleeps on its body layer under a Z, without blinking', () => {
    const server = begin('/plant puffshroom 3 1', '/zombie normal 3 9')
    const { sleeping, ...layers } = server.snapshot().plants[0].animations!
    assert.deepEqual(Object.entries(layers).map(([layer, state]) => [layer, state.clip]), [['body', 'sleep']])
    // Plant::SetSleeping: the Z loops at 6 to 8 frames a second from somewhere in its first nine tenths.
    assert.ok(sleeping.clip === 'sleeping' && sleeping.rate >= 6 && sleeping.rate <= 8 && sleeping.time <= 17 * 0.9, JSON.stringify(sleeping))
    for (let tick = 0; tick < 900; tick++) {
        const { animations } = server.tick().plants[0]
        assert.deepEqual(Object.keys(animations!), ['body', 'sleeping'], `tick ${tick}: it neither blinks nor shoots`)
    }
})

test('a chomper bites, chews and swallows on its body layer, then idles at its Reanim rate', () => {
    const server = begin('/plant chomper 3 1')
    const body = () => server.snapshot().plants[0].animations!.body
    // Plant::PlantInitialize: it idles at 10 to 15 frames a second until its first bite.
    assert.ok(body().clip === 'idle' && body().rate >= 10 && body().rate <= 15, JSON.stringify(body()))
    debug(server, '/zombie normal 3 2')
    const clips = ['idle']
    for (let tick = 0; tick < 6000 && clips.at(-1) !== 'ready'; tick++) {
        const { clip } = server.tick().plants[0].animations!.body
        if (clip !== clips.at(-1)) clips.push(clip)
    }
    assert.deepEqual(clips, ['idle', 'bite', 'chew', 'swallow', 'ready'])
    // Plant::UpdateChomper: PlayIdleAnim at the Reanim's 12 frames a second.
    assert.deepEqual([server.snapshot().plants[0].own!.state, body().rate], ['ready', 12])
})

test('a grave buster lands for as long as its landing clip takes, then chews', () => {
    const server = begin('/plant gravebuster 3 3')
    const buster = () => server.snapshot().plants[0]
    const ticks = Number(buster().own!.ticks)
    assert.deepEqual(buster().animations, { body: { clip: 'land', time: 0, rate: 700 / ticks } })
    for (let tick = 1; tick < ticks; tick++) server.tick()
    assert.deepEqual([buster().own!.state, buster().animations!.body.clip], ['landing', 'land'])
    server.tick()
    assert.deepEqual([buster().own!.state, buster().animations!.body.clip, buster().animations!.body.rate], ['eating', 'body', 12])
})

test('a wall-nut all but stops while it is chewed, and blinks one of its three ways', () => {
    const server = begin('/plant peashooter 3 1', '/plant wallnut 3 3', '/zombie normal 3 4')
    const nut = () => server.snapshot().plants.find(plant => plant.typeId === 'pvz:wallnut')!
    // Plant::AnimateNuts: with the zombie shot, it goes on at a rate drawn anew.
    let slowed = false, resumed = false
    const blinks = new Set<string>()
    for (let tick = 0; tick < 5000; tick++) {
        server.tick()
        const { body, blink } = nut().animations!
        if (body.rate === 0.1) slowed = true
        else if (slowed && body.rate >= 10 && body.rate <= 15) resumed = true
        if (blink) blinks.add(blink.clip)
    }
    assert.deepEqual([slowed, resumed], [true, true])
    assert.ok(blinks.size > 0 && [...blinks].every(clip => ['blinkTwitch', 'blinkTwice', 'blinkThrice'].includes(clip)), [...blinks].join())
})

test('Reanimation::GetFrameTime: a clip spreads its frames over its whole length, its last reached as it ends', () => {
    const loop = { frames: 25, fps: { min: 12, max: 12 } }, once = { ...loop, hold: true as const }
    assert.equal(framePosition(loop, 0), 0)
    assert.equal(framePosition(loop, 12.5), 12)
    assert.ok(Math.abs(framePosition(loop, 24.999) - 23.999) < 1e-3, 'a loop comes round to its first from its last')
    assert.equal(framePosition(once, 25), 24)
    assert.equal(framePosition(once, 40), 24, 'a clip that ends stays on its last')
})
