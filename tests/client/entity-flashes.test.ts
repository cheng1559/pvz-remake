import assert from 'node:assert/strict'
import test from 'node:test'

import { EntityFlashes, type FlashEvent } from '@/client/level/EntityFlashes'
import type { PlantSnapshot, ServerEvent } from '@/shared/protocol/index'

const plant = (produceTicks?: number) => ({ entityId: 1, ...(produceTicks === undefined ? {} : { produceTicks }) }) as PlantSnapshot

/** The board's flashes hear the frame's events at its gameplay tick, by the handlers StageEventRegistry registers. */
function hear(flashes: EntityFlashes, tick: number, ...events: [FlashEvent, string, ServerEvent['data']][]): void {
    for (const [handler, type, data] of events) handler({ flashes }, { eventId: 1, type, data }, { gameplayTick: tick })
}

test('plant flashes fade from bites, rise over the last 100 production ticks and fade once production holds', () => {
    const flashes = new EntityFlashes()
    hear(flashes, 10, [EntityFlashes.plantHit, 'zombieChewedPlant', { zombieId: 2, plantId: 1 }])
    assert.equal(flashes.plant(plant(), 10), 25)
    assert.equal(flashes.plant(plant(), 20), 15)
    assert.equal(flashes.plant(plant(500), 40), 0)
    assert.equal(flashes.plant(plant(60), 480), 40, 'the glow rises toward the sun')
    assert.equal(flashes.plant(plant(60), 481), 39, 'a held countdown starts fading')
    assert.equal(flashes.plant(plant(60), 491), 29)
    hear(flashes, 600, [EntityFlashes.produced, 'sunProduced', { entityId: 1, itemId: 9 }])
    assert.equal(flashes.plant(plant(2400), 610), 90, 'the glow fades after producing')
    hear(flashes, 700, [EntityFlashes.plantHit, 'plantHit', { plantId: 1 }])
    assert.equal(flashes.plant(plant(2400), 700), 25, 'a hostile shot flashes like a bite')
})

test('zombie flashes follow hits, exact shield breaks and burns, and survive a restore', () => {
    const flashes = new EntityFlashes()
    hear(flashes, 5, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, through: true }])
    assert.deepEqual(flashes.zombie(3, 7), { flash: 23, through: true, past: false })
    hear(flashes, 8, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, flash: false }])
    assert.deepEqual(flashes.zombie(3, 8), { flash: 22, through: true, past: false }, 'a body flash through the shield outlasts its exact break')
    hear(flashes, 5, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 4, past: true }])
    assert.deepEqual(flashes.zombie(4, 7), { flash: 23, through: false, past: true }, 'a hit past the shield flashes the body alone')
    hear(flashes, 8, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3 }])
    hear(flashes, 9, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3, flash: false }])
    assert.deepEqual(flashes.zombie(3, 9), { flash: 0, through: false, past: false }, 'an exact break ends a shield-only flash')
    hear(flashes, 9, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 3 }])
    const restored = new EntityFlashes()
    restored.restore(flashes.snapshot(() => true))
    assert.deepEqual(restored.zombie(3, 19), { flash: 15, through: false, past: false })
    assert.deepEqual(restored.zombie(4, 7), { flash: 23, through: false, past: true })
    hear(restored, 20, [EntityFlashes.zombieBurned, 'zombieBurned', { entityId: 3 }])
    assert.equal(restored.zombie(3, 20).flash, 0)
})

test('the board saves the flashes of its entities alone, and a restore puts back exactly those', () => {
    const flashes = new EntityFlashes()
    hear(flashes, 4, [EntityFlashes.zombieHit, 'zombieHit', { entityId: 7, past: true }], [EntityFlashes.plantHit, 'plantHit', { plantId: 2 }],
        [EntityFlashes.produced, 'sunDrained', { entityId: 9, sun: 25 }])
    const saved = flashes.snapshot(entityId => entityId !== 9)
    assert.deepEqual(saved, [{ entityId: 2, tick: 4, ticks: 25 }, { entityId: 7, tick: 4, ticks: 25, past: true }], 'by entity, and none of what is gone')
    const restored = new EntityFlashes()
    hear(restored, 4, [EntityFlashes.plantHit, 'plantHit', { plantId: 5 }])
    restored.restore(saved)
    assert.equal(restored.zombie(5, 4).flash, 0, 'what flashed before the save came back is gone')
    assert.deepEqual(restored.snapshot(() => true), saved)
})
