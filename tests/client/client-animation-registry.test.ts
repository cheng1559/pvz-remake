import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plantDefinition } from '@/client/plants/definitions'
import { zombieDefinition } from '@/client/zombies/definitions'
import { ClientAnimationRegistry } from '../../assets/scripts/client/content/ClientAnimationRegistry'
import { parsePresentationDefinitions } from '@/shared/content/presentation'

test('presentation definitions validate independently and never share global configuration state', () => {
    const current = new ClientAnimationRegistry(presentationFixture)
    const custom: any = structuredClone(presentationFixture)
    custom.animation.rates.plantIdle = [20, 30]
    const other = new ClientAnimationRegistry(parsePresentationDefinitions(custom))
    assert.deepEqual(current.rates.plantIdle, [10, 15])
    assert.deepEqual(other.rates.plantIdle, [20, 30])
    for (const change of [
        (data: any) => { data.animation.plantBlinkTicks = [800, 400] },
        (data: any) => { data.plants['pvz:explodenut'].animationsFrom = 'pvz:missing' },
        (data: any) => { delete data.zombies['pvz:conehead'].animations },
        (data: any) => { delete data.zombies['pvz:normal'] },
        (data: any) => { data.almanac.cords[20].height = 0 },
        (data: any) => { data.plants['pvz:potatomine'].mine.glow.distance = [50, 50] },
        (data: any) => { data.zombies['pvz:conehead'].helm.damagedSprites = ['pvz:zombie_cone2'] },
        (data: any) => { data.zombies['pvz:pole_vaulter'].previewBlockedCells = 'invalid' },
        (data: any) => { data.zombies['pvz:newspaper'].shadowY = 'invalid' },
        (data: any) => { data.zombies['pvz:pole_vaulter'].previewBlockedCells = [{ column: 5, row: 0 }] },
    ]) {
        const invalid = structuredClone(presentationFixture)
        change(invalid)
        assert.throws(() => parsePresentationDefinitions(invalid), TypeError)
        assert.equal(current.definitions, presentationFixture)
    }
})

test('client animation definitions are copied and freeze independently of source data', () => {
    const source: any = structuredClone(presentationFixture)
    const registry = new ClientAnimationRegistry(source)
    source.plants['pvz:peashooter'].animations!.body.x = 12
    assert.equal(registry.resolve('pvz:peashooter').body.x, 0)
    registry.freeze()
    assert.ok(Object.isFrozen(registry.resolve('pvz:peashooter').body))
    assert.throws(() => registry.resolve('mod:missing'), /unknown client animation target/)
})

test('plant and zombie presentations use registered animations, including shared bodies', () => {
    const animations = new ClientAnimationRegistry(presentationFixture)
    for (const [id, definition] of Object.entries(presentationFixture.plants)) {
        if (definition.view) assert.ok(animations.resolve(animations.sourceOf(id)))
    }
    for (const [id, definition] of Object.entries(presentationFixture.zombies)) {
        assert.deepEqual(animations.resolve(animations.sourceOf(id)), definition.animations)
    }
    assert.equal(animations.sourceOf('pvz:explodenut'), 'pvz:wallnut', 'the explode-o-nut plays the wall-nut')
    const plain = { ...presentationFixture.zombies['pvz:normal'], animations: undefined, animationsFrom: 'pvz:normal' }
    const custom = { ...presentationFixture, zombies: { ...presentationFixture.zombies, 'mod:plain': plain } }
    assert.equal(new ClientAnimationRegistry(custom).sourceOf('mod:plain'), 'pvz:normal')
    assert.equal(zombieDefinition(custom, 'mod:plain').animationsFrom, 'pvz:normal')
    assert.throws(() => zombieDefinition(presentationFixture, 'mod:missing'), /not installed/)
})
