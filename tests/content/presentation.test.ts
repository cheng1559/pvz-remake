import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPresentationSource } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import { parsePresentationDefinitions } from '@/shared/content/presentation'
import { fields, finite, pair, point, range } from '@/shared/validate'

test('presentation definitions take only their own fields, at every depth, as gameplay definitions do', () => {
    for (const [change, message] of [
        [(data: any) => { data.extra = {} }, /^TypeError: presentation\.extra is not supported$/],
        [(data: any) => { data.plants['pvz:fumeshroom'].cloud = {} }, /plants\.pvz:fumeshroom\.cloud is not supported/],
        [(data: any) => { data.projectiles['pvz:pea'].viewConfig = [] }, /pvz:pea\.viewConfig must be an object/],
        [(data: any) => { data.zombies['pvz:pole_vaulter'].vault = true }, /zombies\.pvz:pole_vaulter\.vault is not supported/],
        [(data: any) => { data.zombies['pvz:normal'].packet.facingRightOffsetX = 1 }, /pvz:normal\.packet\.facingRightOffsetX is not supported/],
        [(data: any) => { data.zombies['pvz:newspaper'].shield.showsHair = true }, /pvz:newspaper\.shield\.showsHair is not supported/],
        [(data: any) => { data.projectiles['pvz:pea'].impact.kind = 'particle' }, /pvz:pea\.impact\.kind is not supported/],
        [(data: any) => { data.plants['pvz:peashooter'].clips.body.loop = true }, /pvz:peashooter\.clips\.body\.loop is not supported/],
        [(data: any) => { data.levels['pvz:adventure-1-1'].intro.speed = 2 }, /pvz:adventure-1-1\.intro\.speed is not supported/],
        [(data: any) => { data.mainMenu.buttons[0].hover = 'x' }, /mainMenu\.buttons\[0\]\.hover is not supported/],
        [(data: any) => { data.items['pvz:sun'].collectSounds[0].volume = 1 }, /pvz:sun\.collectSounds\[0\]\.volume is not supported/],
        [(data: any) => { data.rules['pvz:whack-a-zombie'].graveRise.color = 1 }, /graveRise\.color is not supported/],
    ] as const) {
        const data = structuredClone(readPresentationSource())
        change(data)
        assert.throws(() => parsePresentationDefinitions(data), message)
    }
})

test('a clip is checked where the presentation is read', () => {
    for (const clip of [
        { x: 0, y: 0 }, { reanimId: 'pvz:peashooter', x: 0, y: 0, rateScale: 0 }, { reanimId: 'pvz:peashooter', x: 0, y: 0, fps: -12 },
        { reanimId: 'pvz:peashooter', x: 0, y: 0, blend: -1 }, { reanimId: 'pvz:peashooter', x: 0, y: 0, fullLastFrame: false },
        { reanimId: 'pvz:peashooter', x: 0, y: 0, onlyTracks: [''] }, { reanimId: 'pvz:peashooter', x: 0, y: 0, attachmentBase: '' },
    ]) {
        const data = structuredClone(readPresentationSource())
        data.plants['pvz:peashooter'].clips.body = clip
        assert.throws(() => parsePresentationDefinitions(data), TypeError)
    }
})

test('the presentation read is what was read, and reads back the same', () => {
    const source = readPresentationSource(), parsed = parsePresentationDefinitions(source)
    assert.notEqual(parsed.items['pvz:sun'], source.items['pvz:sun'])
    assert.deepEqual(parsePresentationDefinitions(presentationFixture), presentationFixture)
    assert.equal(Object.hasOwn(parsed.plants['pvz:explodenut'].clips!, 'from'), false)
    // The Fume-shroom's cloud, typed (it was an untyped viewConfig).
    assert.deepEqual(parsed.plants['pvz:fumeshroom'].fireParticle, { id: 'pvz:fumecloud', x: 85, y: 31, delayTicks: 35 })
    const data = structuredClone(source)
    data.plants['pvz:fumeshroom'].fireParticle.delayTicks = 0.5
    assert.throws(() => parsePresentationDefinitions(data), /fireParticle\.delayTicks must be a non-negative safe integer/)
    // A rule's own fields are its view's to read: they stay as written, beside what the level view reads.
    assert.deepEqual(parsed.rules!['pvz:whack-a-zombie'], source.rules['pvz:whack-a-zombie'])
    // So does a view's own `viewConfig`, on every kind a Mod may draw with a view of its own.
    const kinds = ['plants', 'zombies', 'projectiles', 'items', 'gridItems'] as const, config = { size: 2, parts: ['a'], on: null }
    const configured = structuredClone(source)
    for (const kind of kinds) configured[kind][Object.keys(configured[kind])[0]].viewConfig = config
    const read = parsePresentationDefinitions(configured)
    for (const kind of kinds) assert.deepEqual(Object.values(read[kind])[0].viewConfig, config, kind)
})

test('points, pairs, ranges and objects of fields are read by one shared copy', () => {
    assert.deepEqual(point({ x: 1, y: 2 }, 'p'), { x: 1, y: 2 })
    assert.throws(() => point({ x: 1, y: 2, z: 3 }, 'p'), /^TypeError: p\.z is not supported$/)
    assert.deepEqual(pair([1, 2], 'p'), [1, 2])
    assert.throws(() => pair([1], 'p'), /p must be a pair/)
    assert.throws(() => pair([1, 'x'], 'p'), /p\[1\] must be finite/)
    assert.deepEqual(range([-1, 1], 'r'), [-1, 1])
    assert.throws(() => range([2, 1], 'r'), /r must be an ordered range$/)
    assert.throws(() => range([-1, 1], 'r', 0), /r must be an ordered range from 0/)
    assert.deepEqual(fields({ a: 1 }, 'f', ['a'], { a: finite, b: finite }), { a: 1 })
    assert.throws(() => fields({ b: 1 }, 'f', ['a'], { a: finite, b: finite }), /f\.a is required/)
})
