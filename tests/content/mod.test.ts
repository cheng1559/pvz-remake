import assert from 'node:assert/strict'
import test from 'node:test'

import { parseModManifest, Registry, sortModManifests } from '@/shared/mod/index'

function manifest(id: string, version: string, dependencies: { id: string; version: string }[] = []) {
    return parseModManifest({
        schemaVersion: 1,
        id,
        version,
        apiVersion: 1,
        contentHash: `${id}@${version}`,
        dependencies,
        gameplay: {
            nodeModule: 'gameplay/node/index.js',
            cocosModule: 'gameplay/cocos/index.js',
        },
    })
}

test('manifests validate, sort deterministically, and register once before freeze', () => {
    const base = manifest('pvz:base', '2.1.0')
    const independent = manifest('zzz:independent', '1.0.0')
    const addon = manifest('author:addon', '1.0.0', [{ id: 'pvz:base', version: '>=2.0.0' }])
    const exact = manifest('author:exact', '1.0.0', [{ id: 'author:addon', version: '1.0.0' }])

    assert.deepEqual(sortModManifests([exact, addon, independent, base]).map(mod => mod.id), [
        'pvz:base',
        'zzz:independent',
        'author:addon',
        'author:exact',
    ])
    assert.throws(() => parseModManifest({ schemaVersion: 1, id: 'bad', version: '1.0.0', client: { bundle: 'x' } }))
    assert.throws(() => parseModManifest({
        schemaVersion: 1,
        id: 'author:escape',
        version: '1.0.0',
        apiVersion: 1,
        contentHash: 'escape',
        dependencies: [],
        gameplay: { nodeModule: '../escape.js', cocosModule: 'gameplay/cocos/index.js' },
    }), /relative path/)
    assert.throws(() => parseModManifest({
        schemaVersion: 1,
        id: 'author:encoded-escape',
        version: '1.0.0',
        apiVersion: 1,
        contentHash: 'escape',
        dependencies: [],
        gameplay: { nodeModule: '%2e%2e/escape.js', cocosModule: 'gameplay/cocos/index.js' },
    }), /relative path/)
    assert.throws(() => manifest('author:huge-version', '9007199254740992.0.0'), /safe integers/)
    assert.throws(() => sortModManifests([
        base,
        manifest('author:bad-version', '1.0.0', [{ id: 'pvz:base', version: '3.0.0' }]),
    ]), /requires pvz:base 3\.0\.0/)
    assert.throws(() => sortModManifests([
        manifest('author:a', '1.0.0', [{ id: 'author:b', version: '1.0.0' }]),
        manifest('author:b', '1.0.0', [{ id: 'author:a', version: '1.0.0' }]),
    ]), /cycle/)

    const definition = { kind: 'plant', costs: { sun: 50 } }
    const registry = new Registry<typeof definition>()
    registry.register('pvz:sunflower', definition)
    assert.equal(registry.get('pvz:sunflower'), definition)
    assert.throws(() => registry.register('pvz:sunflower', definition), /duplicate/)
    registry.freeze()
    assert.throws(() => { definition.costs.sun = 25 }, TypeError)
    assert.throws(() => registry.register('pvz:peashooter', definition), /frozen/)
})
