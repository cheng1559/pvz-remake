import assert from 'node:assert/strict'
import test from 'node:test'

import { ContentRegistry } from '@/client/content/ContentRegistry'
import { parseContentManifestV2 } from '@/shared/content/index'

function manifest(id = 'pvz:base') {
    return parseContentManifestV2({
        schemaVersion: 2,
        id,
        version: '2.0.0',
        contentHash: `${id}@2`,
        gameplay: {
            definitions: 'gameplay/definitions.json',
            levels: 'gameplay/levels.json',
            strings: 'gameplay/strings.json',
        },
        client: {
            bundle: id.replace(':', '-'),
            sprites: { [`${id.slice(0, id.indexOf(':'))}:sunflower`]: 'sprites/sunflower/spriteFrame' },
            reanim: {},
            particles: {},
            fonts: {},
            sounds: {},
            music: {},
            prefabs: {},
        },
    })
}

test('ContentManifestV2 validates its complete shape and trust boundaries', () => {
    const base = manifest()
    assert.equal(base.client.sprites['pvz:sunflower'], 'sprites/sunflower/spriteFrame')

    const invalid = (change: (value: any) => void) => {
        const value: any = structuredClone(base)
        change(value)
        return () => parseContentManifestV2(value)
    }
    assert.throws(invalid(value => { value.schemaVersion = 1 }), /schemaVersion must be 2/)
    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.gameplay.levels = '%2e%2e/levels.json' }), /relative path/)
    assert.throws(invalid(value => { value.client.sounds['other:hit'] = 'audio/hit' }), /outside pvz:/)
    assert.throws(invalid(value => { delete value.client.music }), /music is required/)
})

test('ContentRegistry resolves by category, rejects duplicates, and freezes', () => {
    const base = manifest()
    const registry = new ContentRegistry()
    registry.register(base)

    assert.deepEqual(registry.resolve('sprites', 'pvz:sunflower'), {
        category: 'sprites',
        id: 'pvz:sunflower',
        contentId: 'pvz:base',
        contentVersion: '2.0.0',
        contentHash: 'pvz:base@2',
        bundle: 'pvz-base',
        path: 'sprites/sunflower/spriteFrame',
        schemaVersion: 2,
    })
    assert.equal(registry.resolve('sounds', 'pvz:sunflower'), undefined)
    assert.throws(() => registry.register(base), /duplicate content manifest/)

    const conflicting = manifest('pvz:addon')
    assert.throws(() => registry.register(conflicting), /duplicate sprites content/)
    assert.equal([...registry.entries('sprites')].length, 1)

    const sameIdInAnotherCategory = structuredClone(base)
    sameIdInAnotherCategory.id = 'pvz:addon'
    sameIdInAnotherCategory.client.sprites = {}
    sameIdInAnotherCategory.client.sounds = { 'pvz:sunflower': 'audio/sunflower' }
    const second = new ContentRegistry()
    second.register(base)
    second.register(sameIdInAnotherCategory)
    assert.equal(second.resolve('sounds', 'pvz:sunflower')?.path, 'audio/sunflower')
    second.registerEntry({
        category: 'reanim',
        id: 'example:solar_peashooter',
        contentId: 'example:solar-mod',
        contentVersion: '1.0.0',
        contentHash: 'example-solar-mod@1',
        bundle: 'example-solar-mod',
        path: 'reanim/solar_peashooter',
        schemaVersion: 2,
    })
    assert.equal(second.resolve('reanim', 'example:solar_peashooter')?.bundle, 'example-solar-mod')
    assert.throws(() => second.registerEntry(second.resolve('reanim', 'example:solar_peashooter')!), /duplicate reanim/)

    second.freeze()
    assert.throws(() => second.register(base), /frozen/)
    assert.throws(() => second.registerEntry(second.resolve('reanim', 'example:solar_peashooter')!), /frozen/)
    assert.throws(() => {
        ;(second.resolve('sprites', 'pvz:sunflower') as { path: string }).path = 'changed'
    }, TypeError)
})
