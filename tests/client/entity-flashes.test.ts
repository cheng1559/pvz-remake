import assert from 'node:assert/strict'
import test from 'node:test'

import { EntityFlashes } from '@/client/level/EntityFlashes'
import type { PlantSnapshot, ServerEvent } from '@/shared/protocol/index'

const event = (type: string, data: ServerEvent['data']): ServerEvent => ({ eventId: 1, type, data })
const plant = (produceTicks?: number) => ({ entityId: 1, ...(produceTicks === undefined ? {} : { produceTicks }) }) as PlantSnapshot

test('plant flashes fade from bites, rise over the last 100 production ticks and fade once production holds', () => {
    const flashes = new EntityFlashes()
    flashes.applyEvents([event('zombieChewedPlant', { zombieId: 2, plantId: 1 })], 10)
    assert.equal(flashes.plant(plant(), 10), 25)
    assert.equal(flashes.plant(plant(), 20), 15)
    assert.equal(flashes.plant(plant(500), 40), 0)
    assert.equal(flashes.plant(plant(60), 480), 40, 'the glow rises toward the sun')
    assert.equal(flashes.plant(plant(60), 481), 39, 'a held countdown starts fading')
    assert.equal(flashes.plant(plant(60), 491), 29)
    flashes.applyEvents([event('sunProduced', { entityId: 1, itemId: 9 })], 600)
    assert.equal(flashes.plant(plant(2400), 610), 90, 'the glow fades after producing')
})

test('zombie flashes follow hits, exact shield breaks and burns, and survive a restore', () => {
    const flashes = new EntityFlashes()
    flashes.applyEvents([event('zombieHit', { entityId: 3, through: true })], 5)
    assert.deepEqual(flashes.zombie(3, 7), { flash: 23, through: true })
    flashes.applyEvents([event('zombieHit', { entityId: 3, flash: false })], 8)
    assert.deepEqual(flashes.zombie(3, 8), { flash: 22, through: true }, 'a body flash through the shield outlasts its exact break')
    flashes.applyEvents([event('zombieHit', { entityId: 3 })], 8)
    flashes.applyEvents([event('zombieHit', { entityId: 3, flash: false })], 9)
    assert.deepEqual(flashes.zombie(3, 9), { flash: 0, through: false }, 'an exact break ends a shield-only flash')
    flashes.applyEvents([event('zombieHit', { entityId: 3 })], 9)
    const restored = new EntityFlashes()
    restored.restore(3, flashes.snapshot(3))
    assert.deepEqual(restored.zombie(3, 19), { flash: 15, through: false })
    restored.applyEvents([event('zombieBurned', { entityId: 3 })], 20)
    assert.equal(restored.zombie(3, 20).flash, 0)
})
