import assert from 'node:assert/strict'
import test from 'node:test'
import { parseModManifest } from '@/shared/mod'
import { parseModContent, type ContentArchive } from '@/shared/mod/content'

function archive(id = 'pvz'): ContentArchive {
    const image = new Uint8Array(24), view = new DataView(image.buffer)
    view.setUint32(0, 0x89504e47); view.setUint32(12, 0x49484452)
    view.setUint32(16, 1); view.setUint32(20, 1)
    const files = { 'sprite.png': image, 'gameplay.json': new TextEncoder().encode('{}'),
        'presentation.json': new TextEncoder().encode('{}') }
    return {
        manifest: parseModManifest({ schemaVersion: 1, id, version: '2.0.0', apiVersion: 1,
            contentHash: id + '@2' }),
        content: parseModContent({ gameplay: 'gameplay.json', presentation: 'presentation.json',
            resources: { sprites: { [id + ':sunflower']: { file: 'sprite.png', width: 1, height: 1 } } } }, files),
        files,
    }
}

test('base and Mod archives use the same manifest, content parser and file validation', () => {
    for (const id of ['pvz', 'example']) {
        const base = archive(id)
        assert.equal(base.manifest.schemaVersion, 1)
        assert.equal(base.content.presentation, 'presentation.json')
        assert.throws(() => parseModContent({ ...base.content, extra: true }, base.files), /Unknown content field/)
        assert.throws(() => parseModContent({ ...base.content, gameplay: '../gameplay.json' }, base.files), /Invalid content file/)
        assert.throws(() => parseModContent({ ...base.content, presentation: 'missing.json' }, base.files), /Missing ZIP file/)
        assert.throws(() => parseModContent({ ...base.content, resources: { unknown: {} } }, base.files), /Unknown resource category/)
    }
})

test('a Mod manifest may name its author for the Mod list', () => {
    const base = { schemaVersion: 1, id: 'example', version: '1.0.0', apiVersion: 1, contentHash: 'x' }
    assert.equal(parseModManifest({ ...base, author: '  Cheng ' }).author, 'Cheng')
    assert.equal(parseModManifest(base).author, undefined)
    assert.throws(() => parseModManifest({ ...base, author: '' }), /manifest.author/)
    assert.throws(() => parseModManifest({ ...base, author: 7 }), /manifest.author/)
})
