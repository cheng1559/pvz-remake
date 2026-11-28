import assert from 'node:assert/strict'
import test from 'node:test'

import { EntityFlashes, type FlashEvent } from '@/client/level/EntityFlashes'
import type { ServerEvent } from '@/shared/protocol/index'

/** The board's flashes hear the frame's events at its gameplay tick, by the handlers StageEventRegistry registers. */
function hear(flashes: EntityFlashes, tick: number, ...events: [FlashEvent, string, ServerEvent['data']][]): void {
    for (const [handler, type, data] of events) handler({ flashes }, { eventId: 1, type, data }, { gameplayTick: tick })
}

test('plant flashes fade from bites, rise over the last 100 production ticks and fade once production holds', () => {
    const flashes = new EntityFlashes()
    hear(flashes, 10, [EntityFlashes.plantHit, 'zombieChewedPlant', { zombieId: 2, plantId: 1 }])
    assert.equal(flashes.plant(1, 10), 25)
    assert.equal(flashes.plant(1, 20), 15)
    assert.equal(flashes.producer(1, 40, 500), 0)
    assert.equal(flashes.producer(1, 480, 60), 40, 'the glow rises toward the sun')
    assert.equal(flashes.producer(1, 481, 60), 39, 'a held countdown starts fading')
    assert.equal(flashes.producer(1, 491, 60), 29)
    hear(flashes, 600, [EntityFlashes.produced, 'sunProduced', { entityId: 1, itemId: 9 }])
    assert.equal(flashes.producer(1, 610, 2400), 90, 'the glow fades after producing')
    assert.equal(flashes.plant(1, 610), 90, 'which is its flash')
    hear(flashes, 700, [EntityFlashes.plantHit, 'plantHit', { plantId: 1 }])
    assert.equal(flashes.producer(1, 700, 2400), 25, 'a hostile shot flashes like a bite')
})

test('a zombie\'s body, shield and recoil each flash by their own counter, through burns and a restore', () => {
    const flashes = new EntityFlashes()
    // A lobbed shot past the screen door flashes the body; a pea on the door then flashes the door, and the body runs on.
    hear(flashes, 5, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, body: true }])
    hear(flashes, 10, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, shield: true, recoil: true }])
    assert.deepEqual(flashes.zombie(3, 10), { body: 20, shield: 25, recoil: 12 }, 'a hit on the shield leaves the body\'s flash as it is')
    hear(flashes, 15, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, body: true }])
    assert.deepEqual(flashes.zombie(3, 15), { body: 25, shield: 20, recoil: 7 }, 'and one past it the shield\'s')
    // The Fume-shroom's DAMAGE_HITS_SHIELD_AND_BODY flashes the newspaper and the body, without a recoil.
    hear(flashes, 5, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 4, body: true, shield: true }])
    assert.deepEqual(flashes.zombie(4, 7), { body: 23, shield: 23, recoil: 0 })
    hear(flashes, 16, [EntityFlashes.zombieBurned, 'zombieBurned', { entityId: 3 }])
    assert.deepEqual(flashes.zombie(3, 16), { body: 0, shield: 19, recoil: 6 }, 'Zombie::ApplyBurn: mJustGotShotCounter = 0')
    const restored = new EntityFlashes()
    restored.restore(flashes.snapshot(() => true))
    assert.deepEqual(restored.zombie(3, 20), { body: 0, shield: 15, recoil: 2 })
    assert.deepEqual(restored.zombie(4, 7), { body: 23, shield: 23, recoil: 0 })
    restored.hitZombie(5, 7)
    assert.deepEqual(restored.zombie(5, 8), { body: 24, shield: 0, recoil: 0 }, 'a hit given no parts flashes the body')
})

test('the board saves the flashes of its entities alone, and a restore puts back exactly those', () => {
    const flashes = new EntityFlashes()
    hear(flashes, 4, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 7, shield: true, recoil: true }], [EntityFlashes.plantHit, 'plantHit', { plantId: 2 }],
        [EntityFlashes.produced, 'sunDrained', { entityId: 9, sun: 25 }])
    const saved = flashes.snapshot(entityId => entityId !== 9)
    assert.deepEqual(saved, [
        { entityId: 2, tick: 4, ticks: 25 }, { entityId: 7, tick: 4, ticks: 25, part: 'shield' }, { entityId: 7, tick: 4, ticks: 12, part: 'recoil' },
    ], 'by part, and none of what is gone')
    const restored = new EntityFlashes()
    hear(restored, 4, [EntityFlashes.plantHit, 'plantHit', { plantId: 5 }])
    restored.restore(saved)
    assert.equal(restored.zombie(5, 4).body, 0, 'what flashed before the save came back is gone')
    assert.deepEqual(restored.snapshot(() => true), saved)
})
