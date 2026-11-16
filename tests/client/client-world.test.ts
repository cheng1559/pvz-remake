import assert from 'node:assert/strict'
import test from 'node:test'

import { ClientWorld } from '@/client/game/ClientWorld'
import type { ServerFramePacket, SessionStartedPacket, WorldSnapshot } from '@/shared/protocol/index'

function snapshot(tick: number): WorldSnapshot {
    return {
        levelId: 'pvz:adventure-1-1', tick, gameplayTick: tick, phase: 'gameplay', result: 'playing', paused: false,
        sun: 50, money: 0, wave: { index: 0, total: 4, flagWaves: [], countdown: 10 },
        cursor: { mode: 'none' }, seedPackets: [], conveyorPackets: [],
        plants: [{
            entityId: 1, typeId: 'pvz:peashooter',
            x: 0, y: 0, row: 2, column: 0, health: 300, maxHealth: 300,
        }],
        zombies: [{
            entityId: 2, typeId: 'pvz:normal', state: 'walking',
            x: 10, y: 20, row: 2, health: 270, maxHealth: 270,
            animations: { body: { clip: 'walk', time: 0, rate: 12 } },
            alpha: 255, hasHead: true, hasTongue: false, hasArm: true, helmHealth: 0, shieldHealth: 0,
        }],
        projectiles: [{ entityId: 6, typeId: 'pvz:pea', x: 20, y: 30, row: 2 }],
        items: [{ entityId: 4, typeId: 'pvz:sun', state: 'available', x: 30, y: 40, scale: 1, alpha: 255 }],
        mowers: [{ entityId: 7, typeId: 'pvz:lawnmower', x: -21, y: 303, row: 2, state: 'ready' }],
        tutorial: { step: 'complete' }, extensions: {},
    }
}

test('ClientWorld diffs entities and renders current state at interpolated positions', () => {
    const world = new ClientWorld()
    const first = snapshot(1)
    const started: SessionStartedPacket = {
        protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot: first,
    }
    assert.deepEqual(world.accept(started), { added: [1, 2, 4, 6, 7], removed: [] })
    assert.equal(world.current, first)

    const second = snapshot(2)
    second.plants[0].x = 10
    second.plants[0].health = 200
    second.zombies[0].x = 20
    second.zombies[0].y = 30
    second.zombies[0].state = 'eating'
    second.projectiles = [{ entityId: 3, typeId: 'pvz:pea', x: 50, y: 60, row: 2 }]
    second.items[0].x = 40
    second.items[0].scale = 0.5
    second.items[0].alpha = 155
    second.mowers = [{ ...second.mowers[0], x: -11, state: 'triggered' }]
    const frame: ServerFramePacket = {
        protocolVersion: 1, type: 'frame', serverTick: 2,
        acknowledgedSequence: 2, snapshot: second, events: [],
    }
    assert.deepEqual(world.accept(frame), { added: [3], removed: [6] })
    assert.equal(world.previous, first)
    assert.equal(world.current, second)

    const rendered = world.render(0.5)
    assert.deepEqual(rendered.plants.map(entity => [entity.entityId, entity.x, entity.health]), [[1, 5, 200]])
    assert.deepEqual(rendered.zombies.map(entity => [entity.x, entity.y, entity.state]), [[15, 25, 'eating']])
    assert.deepEqual(rendered.projectiles.map(entity => [entity.entityId, entity.x, entity.y]), [[3, 50, 60]])
    assert.equal(rendered.items[0].x, 35)
    assert.equal(rendered.items[0].scale, 0.75)
    assert.equal(rendered.items[0].alpha, 205)
    assert.equal(rendered.projectiles.some(entity => entity.entityId === 6), false)
    assert.deepEqual(rendered.mowers.map(entity => [entity.entityId, entity.x, entity.state]), [[7, -16, 'triggered']], 'a mower runs smoothly, as a projectile')

    const sameTick = { ...second, sun: 75 }
    assert.throws(() => world.accept(sameTick), /snapshot tick 2; current tick is 2/)
    assert.throws(() => world.accept(snapshot(1)), /snapshot tick 1; current tick is 2/)
    assert.equal(world.current?.sun, 50)
    assert.throws(() => new ClientWorld().render(0.5), /no snapshot/)
})

test('ClientWorld switches the pole vaulter landing origin together with its animation', () => {
    const world = new ClientWorld()
    const jumping = snapshot(1)
    Object.assign(jumping.zombies[0], {
        typeId: 'pvz:pole_vaulter', state: 'vaulting', animations: { body: { clip: 'jump', time: 42.9, rate: 24 } }, x: 400,
    })
    world.accept(jumping)

    const landed = snapshot(2)
    Object.assign(landed.zombies[0], {
        typeId: 'pvz:pole_vaulter', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, x: 249.9,
    })
    world.accept(landed)
    for (const alpha of [0, 0.25, 0.5, 0.999, 1]) {
        const zombie = world.render(alpha).zombies[0]
        assert.equal(zombie.animations.body.clip, 'walk')
        assert.equal(zombie.x, 249.9, 'the walk pose must not use the pre-landing origin')
    }

    const walking = snapshot(3)
    Object.assign(walking.zombies[0], { typeId: 'pvz:pole_vaulter', x: 249.7 })
    world.accept(walking)
    assert.equal(world.render(0).zombies[0].x, 249.9)
    assert.equal(world.render(0.5).zombies[0].x, 249.8, 'normal walking still interpolates')
})

test('ClientWorld hands out the frame it last rendered until its frames or the interpolation change', () => {
    const world = new ClientWorld()
    world.accept(snapshot(1))
    world.accept({ ...snapshot(2), zombies: [{ ...snapshot(2).zombies[0], x: 20 }] })
    // Every button asks for the frame on every hover refresh; interpolating each time cost a fifth of a crowded frame.
    const frame = world.render(0.5)
    assert.equal(world.render(0.5), frame)
    assert.equal(frame.zombies[0].x, 15)
    assert.notEqual(world.render(0.25), frame)
    assert.equal(world.render(0.25).zombies[0].x, 12.5)
    world.accept({ ...snapshot(3), zombies: [{ ...snapshot(3).zombies[0], x: 30 }] })
    assert.equal(world.render(0.25).zombies[0].x, 22.5, 'a new frame renders afresh')
})

test('ClientWorld holds the latest frame through a repick, while the host interpolation clock keeps cycling', () => {
    const world = new ClientWorld()
    world.accept(snapshot(1))
    const moved = snapshot(2)
    moved.projectiles[0].x = 40
    world.accept(moved)
    // `/repick` stands the level still: its frames keep the gameplay tick, so the last two moving frames stay.
    const repick = { ...snapshot(3), gameplayTick: 2, projectiles: moved.projectiles,
        seedChooser: { choosing: true, repick: true, slots: 1, availableSeeds: [], entries: [] } } as unknown as WorldSnapshot
    world.accept(repick)
    for (const alpha of [0, 0.3, 0.7, 1]) assert.equal(world.render(alpha).projectiles[0].x, 40)
})
