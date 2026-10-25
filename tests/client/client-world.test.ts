import assert from 'node:assert/strict'
import test from 'node:test'

import { ClientWorld } from '@/client/game/ClientWorld'
import type { ServerFramePacket, SessionStartedPacket, WorldSnapshot } from '@/shared/protocol/index'

function snapshot(tick: number): WorldSnapshot {
    return {
        levelId: 'pvz:adventure-1-1', tick, gameplayTick: tick, phase: 'gameplay', result: 'playing', paused: false,
        sun: 50, availableSun: 50, money: 0, wave: { index: 0, total: 4, countdown: 10 },
        cursor: { mode: 'none' }, seedPackets: [], conveyorPackets: [],
        plants: [{
            entityId: 1, typeId: 'pvz:peashooter', seedId: 'pvz:peashooter',
            x: 0, y: 0, row: 2, column: 0, health: 300, maxHealth: 300, eatenFlashCounter: 0,
        }],
        zombies: [{
            entityId: 2, typeId: 'pvz:normal', state: 'walking',
            x: 10, y: 20, row: 2, health: 270, maxHealth: 270,
            animation: 'anim_walk', animationTime: 0, animationSpeed: 1,
            moweredTicksRemaining: 0,
            hasHead: true, hasTongue: false, hasArm: true, hitFlashCounter: 0,
        }],
        projectiles: [{ entityId: 6, typeId: 'pvz:pea', x: 20, y: 30, row: 2 }],
        items: [{ entityId: 4, typeId: 'pvz:sun', state: 'available', x: 30, y: 40, scale: 1, alpha: 255 }],
        lawnMowers: [{
            entityId: 5, typeId: 'pvz:standard', state: 'ready', x: -21, y: 303, row: 2,
        }],
        tutorial: { id: 'pvz:adventure-1-1', step: 'complete' }, extensions: {},
    }
}

test('house entry keeps rolling plants at the final authoritative position across interpolation cycles', () => {
    const world = new ClientWorld()
    world.accept(snapshot(1))
    const lost = snapshot(2)
    lost.result = 'lost'
    Object.assign(lost.plants[0], { typeId: 'pvz:bowling-wallnut', x: 120, y: 230, behaviorState: { frame: 3 } })
    world.accept(lost)
    for (let tick = 3; tick < 7; tick++) {
        world.accept({ ...lost, tick })
        for (const alpha of [0, 0.9, 0.1, 1]) {
            const plant = world.render(alpha).plants[0]
            assert.deepEqual([plant.x, plant.y, plant.behaviorState?.frame], [120, 230, 3])
        }
    }
    const won = new ClientWorld()
    won.accept(snapshot(1))
    won.accept({ ...lost, result: 'won' })
    assert.equal(won.render(0.5).plants[0].x, 60, 'victory still interpolates moving plants')
})

test('ClientWorld diffs entities and renders current state at interpolated positions', () => {
    const world = new ClientWorld()
    const first = snapshot(1)
    const started: SessionStartedPacket = {
        protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot: first,
    }
    assert.deepEqual(world.accept(started), { added: [1, 2, 4, 5, 6], removed: [] })
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
    second.lawnMowers[0].x = -11
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
    assert.equal(rendered.lawnMowers[0].x, -16)
    assert.equal(rendered.projectiles.some(entity => entity.entityId === 6), false)

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
        typeId: 'pvz:pole_vaulter', state: 'vaulting', animation: 'anim_jump', animationTime: 41.9, x: 400,
    })
    world.accept(jumping)

    const landed = snapshot(2)
    Object.assign(landed.zombies[0], {
        typeId: 'pvz:pole_vaulter', animation: 'anim_walk', x: 249.9,
    })
    world.accept(landed)
    for (const alpha of [0, 0.25, 0.5, 0.999, 1]) {
        const zombie = world.render(alpha).zombies[0]
        assert.equal(zombie.animation, 'anim_walk')
        assert.equal(zombie.x, 249.9, 'the walk pose must not use the pre-landing origin')
    }

    const walking = snapshot(3)
    Object.assign(walking.zombies[0], { typeId: 'pvz:pole_vaulter', x: 249.7 })
    world.accept(walking)
    assert.equal(world.render(0).zombies[0].x, 249.9)
    assert.equal(world.render(0.5).zombies[0].x, 249.8, 'normal walking still interpolates')
})
