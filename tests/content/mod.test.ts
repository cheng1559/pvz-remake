import assert from 'node:assert/strict'
import test from 'node:test'

import { parseModManifest, Registry } from '@/shared/mod/index'

function manifest(id: string, version: string) {
    return parseModManifest({
        schemaVersion: 1,
        id,
        version,
        apiVersion: 1,
        contentHash: `${id}@${version}`,
        gameplay: {
            nodeModule: 'gameplay/node/index.js',
            cocosModule: 'gameplay/cocos/index.js',
        },
    })
}

test('manifests validate, and definitions register once before freeze', () => {
    const screenMod = parseModManifest({
        schemaVersion: 1, id: 'widescreen', version: '0.1.0', apiVersion: 1,
        contentHash: 'widescreen-0.1.0', client: { module: 'client/cocos/index.js' },
    })
    assert.deepEqual(screenMod.client, { module: 'client/cocos/index.js' })
    // A Mod ID is a bare name that doubles as its namespace; namespaced IDs are for resources and definitions.
    assert.throws(() => manifest('author:addon', '1.0.0'), /Mod name/)
    assert.throws(() => parseModManifest({ schemaVersion: 1, id: 'bad', version: '1.0.0', client: { bundle: 'x' } }))
    assert.throws(() => parseModManifest({
        schemaVersion: 1,
        id: 'escape',
        version: '1.0.0',
        apiVersion: 1,
        contentHash: 'escape',
        gameplay: { nodeModule: '../escape.js', cocosModule: 'gameplay/cocos/index.js' },
    }), /relative path/)
    assert.throws(() => parseModManifest({
        schemaVersion: 1,
        id: 'encoded-escape',
        version: '1.0.0',
        apiVersion: 1,
        contentHash: 'escape',
        gameplay: { nodeModule: '%2e%2e/escape.js', cocosModule: 'gameplay/cocos/index.js' },
    }), /relative path/)
    assert.throws(() => manifest('huge-version', '9007199254740992.0.0'), /safe integers/)

    const definition = { kind: 'plant', costs: { sun: 50 } }
    const registry = new Registry<typeof definition>()
    registry.register('pvz:sunflower', definition)
    assert.equal(registry.get('pvz:sunflower'), definition)
    assert.throws(() => registry.register('pvz:sunflower', definition), /duplicate/)
    registry.freeze()
    assert.throws(() => { definition.costs.sun = 25 }, TypeError)
    assert.throws(() => registry.register('pvz:peashooter', definition), /frozen/)
})
