import assert from 'node:assert/strict'
import test from 'node:test'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { parseModManifest } from '@/shared/mod'
import { parseModContent, type ContentArchive } from '@/shared/mod/content'

function archive(id = 'pvz:base'): ContentArchive {
    const image = new Uint8Array(24), view = new DataView(image.buffer)
    view.setUint32(0, 0x89504e47); view.setUint32(12, 0x49484452)
    view.setUint32(16, 1); view.setUint32(20, 1)
    const files = { 'sprite.png': image, 'gameplay.json': new TextEncoder().encode('{}'),
        'presentation.json': new TextEncoder().encode('{}') }
    return {
        manifest: parseModManifest({ schemaVersion: 1, id, version: '2.0.0', apiVersion: 1,
            contentHash: id + '@2', dependencies: [] }),
        content: parseModContent({ gameplay: 'gameplay.json', presentation: 'presentation.json',
            resources: { sprites: { [id.split(':')[0] + ':sunflower']: { file: 'sprite.png', width: 1, height: 1 } } } }, files),
        files,
    }
}

test('base and Mod archives use the same manifest, content parser and file validation', () => {
    for (const id of ['pvz:base', 'example:showcase']) {
        const base = archive(id)
        assert.equal(base.manifest.schemaVersion, 1)
        assert.equal(base.content.presentation, 'presentation.json')
        assert.throws(() => parseModContent({ ...base.content, extra: true }, base.files), /Unknown content field/)
        assert.throws(() => parseModContent({ ...base.content, gameplay: '../gameplay.json' }, base.files), /Invalid content file/)
        assert.throws(() => parseModContent({ ...base.content, presentation: 'missing.json' }, base.files), /Missing ZIP file/)
        assert.throws(() => parseModContent({ ...base.content, resources: { unknown: {} } }, base.files), /Unknown resource category/)
    }
})

test('ContentRegistry resolves common archive resources by category, rejects duplicates, and freezes', () => {
    const base = archive()
    const registry = new ContentRegistry()
    registry.register(base)
    assert.deepEqual(registry.resolve('sprites', 'pvz:sunflower'), {
        category: 'sprites', id: 'pvz:sunflower', contentId: 'pvz:base', contentVersion: '2.0.0',
        contentHash: 'pvz:base@2', bundle: 'pvzmod:///pvz%3Abase/', path: 'sprite.png', schemaVersion: 2,
    })
    assert.equal(registry.resolve('sounds', 'pvz:sunflower'), undefined)
    const warmed = new ContentRegistry()
    warmed.register({ ...base, files: {} })
    assert.equal(warmed.resolve('sprites', 'pvz:sunflower')?.path, 'sprite.png', 'decoded Native image bytes are not needed for metadata')
    assert.throws(() => registry.register(base), /duplicate content manifest/)
    assert.throws(() => registry.register(archive('pvz:addon')), /duplicate sprites content/)
    assert.equal([...registry.entries('sprites')].length, 1)

    const other = archive('pvz:addon')
    other.content.resources.sprites = {}
    other.content.resources.audio['pvz:sunflower'] = 'hit.mp3'
    const files = { ...other.files, 'hit.mp3': new Uint8Array([1]) }
    const second = new ContentRegistry()
    second.register(base)
    second.register({ ...other, files })
    assert.equal(second.resolve('sounds', 'pvz:sunflower')?.path, 'hit.mp3')
    second.registerEntry({
        category: 'reanim', id: 'example:solar_peashooter', contentId: 'example:solar-mod',
        contentVersion: '1.0.0', contentHash: 'example-solar-mod@1',
        bundle: 'pvzmod:///example%3Asolar-mod/', path: 'solar.json', schemaVersion: 2,
    })
    assert.throws(() => second.registerEntry(second.resolve('reanim', 'example:solar_peashooter')!), /duplicate reanim/)
    second.freeze()
    assert.throws(() => second.register(base), /frozen/)
    assert.throws(() => second.registerEntry(second.resolve('reanim', 'example:solar_peashooter')!), /frozen/)
    assert.throws(() => {
        ;(second.resolve('sprites', 'pvz:sunflower') as { path: string }).path = 'changed'
    }, TypeError)
})
