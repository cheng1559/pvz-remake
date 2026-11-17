import { readPresentationSource } from '../../tools/mod/content'
import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plantDefinition } from '@/client/plants/definitions'
import { zombieDefinition } from '@/client/zombies/definitions'
import { ClientAnimationRegistry } from '../../assets/scripts/client/content/ClientAnimationRegistry'
import { parsePresentationDefinitions } from '@/shared/content/presentation'

test('presentation definitions validate independently and never share global configuration state', () => {
    const current = new ClientAnimationRegistry(presentationFixture)
    for (const change of [
        (data: any) => { data.plants['pvz:sunshroom'].shadow.states = { small: [0.5] } },
        (data: any) => { data.plants['pvz:explodenut'].clips = { from: 'pvz:missing' } },
        (data: any) => { delete data.zombies['pvz:conehead'].clips },
        (data: any) => { delete data.zombies['pvz:normal'] },
        (data: any) => { data.plants['pvz:potatomine'].packet = { scale: 0 } },
        (data: any) => { data.zombies['pvz:normal'].portrait = { x: 0, y: 0 } },
        (data: any) => { data.zombies['pvz:conehead'].helm.damagedSprites = ['pvz:zombie_cone2'] },
        (data: any) => { data.zombies['pvz:pole_vaulter'].previewBlockedCells = 'invalid' },
        (data: any) => { data.zombies['pvz:newspaper'].shadow.y = 'invalid' },
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
    source.plants['pvz:peashooter'].clips!.body.x = 12
    assert.equal(registry.resolve('pvz:peashooter').body.x, 0)
    registry.freeze()
    assert.ok(Object.isFrozen(registry.resolve('pvz:peashooter').body))
    assert.throws(() => registry.resolve('mod:missing'), /unknown client animation target/)
})

test('plant and zombie presentations use registered animations, including shared bodies', () => {
    const animations = new ClientAnimationRegistry(presentationFixture)
    for (const [id, definition] of Object.entries(presentationFixture.plants)) {
        if (definition.clips) assert.ok(animations.resolve(id))
    }
    for (const [id, definition] of Object.entries(presentationFixture.zombies)) {
        // The registry fills in what the data leaves out (rateScale 1).
        assert.deepEqual(animations.resolve(id), Object.fromEntries(Object.entries(definition.clips).map(([slot, clip]) => [slot, { rateScale: 1, ...clip }])))
    }
    // `from`: the explode-o-nut draws the wall-nut's clips, and what a definition writes beside it adds to them.
    assert.deepEqual(animations.resolve('pvz:explodenut'), animations.resolve('pvz:wallnut'))
    const plain = { ...readPresentationSource().zombies['pvz:normal'], clips: { from: 'pvz:normal', walk: { reanimId: 'mod:walk', rateScale: 1, x: 0, y: 0 } } }
    const custom = parsePresentationDefinitions({ ...readPresentationSource(), zombies: { ...readPresentationSource().zombies, 'mod:plain': plain } })
    assert.equal(custom.zombies['mod:plain'].clips.walk.reanimId, 'mod:walk')
    assert.deepEqual(custom.zombies['mod:plain'].clips.eat, custom.zombies['pvz:normal'].clips.eat)
    assert.equal(zombieDefinition(custom, 'mod:plain').clips.walk.reanimId, 'mod:walk')
    assert.throws(() => zombieDefinition(presentationFixture, 'mod:missing'), /not installed/)
})
