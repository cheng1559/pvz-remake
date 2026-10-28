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
        (data: any) => { data.plants['pvz:explodenut'].animationTarget = 'pvz:missing' },
        (data: any) => { delete data.zombies['pvz:normal'] },
        (data: any) => { data.almanac.cords[20].height = 0 },
        (data: any) => { data.plants['pvz:potatomine'].mine.glow.distance = [50, 50] },
        (data: any) => { data.zombies['pvz:conehead'].helm.damagedSprites = ['pvz:zombie_cone2'] },
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

test('repeater uses its own clips and reference shooting rate', () => {
    const animations = new ClientAnimationRegistry(presentationFixture)
    const repeater = animations.resolve('pvz:repeater')

    assert.equal(repeater.body.reanimId, 'pvz:repeater')
    assert.equal(repeater.idleHead.reanimId, 'pvz:repeater_head_idle')
    assert.equal(repeater.shootHead.reanimId, 'pvz:repeater_shoot')
    assert.equal(repeater.shootHead.rateScale, 45 / 35)
})

test('plant and zombie presentations use registered animations, including shared bodies', () => {
    const animations = new ClientAnimationRegistry(presentationFixture)
    for (const definition of Object.values(presentationFixture.plants)) {
        if (definition.view) assert.ok(animations.resolve(definition.animationTarget!))
    }
    for (const definition of Object.values(presentationFixture.zombies)) {
        assert.deepEqual(animations.resolve(definition.animationTarget), definition.animations)
    }
    assert.equal(plantDefinition(presentationFixture, 'pvz:explodenut').animationTarget, 'pvz:wallnut')
    assert.deepEqual(plantDefinition(presentationFixture, 'pvz:explodenut').visual.tint, [255, 64, 64])
    const custom = { ...presentationFixture, zombies: { ...presentationFixture.zombies, 'mod:plain': presentationFixture.zombies['pvz:normal'] } }
    assert.equal(zombieDefinition(custom, 'mod:plain').animationTarget, 'pvz:normal')
    assert.throws(() => zombieDefinition(presentationFixture, 'mod:missing'), /not installed/)
    assert.equal(zombieDefinition(presentationFixture, 'pvz:pole_vaulter').shadowX, 18)
})
