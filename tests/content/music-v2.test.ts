import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMusicV2 } from '@/shared/content/music'

function music() {
    return {
        schemaVersion: 2,
        id: 'pvz:title-theme',
        durationSeconds: 87.465079,
        loopStartSeconds: 0,
        loopEndSeconds: 87.465079,
        stems: {
            main: 'music/title_theme',
            drums: null,
            hihats: null,
        },
    }
}

test('MusicV2 strictly parses a single-stem looping tune', () => {
    assert.deepEqual(parseMusicV2(music()), music())
})

test('MusicV2 rejects invalid fields, timing, and stem paths', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(music())
        change(value)
        return () => parseMusicV2(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { delete value.stems.hihats }), /required/)
    assert.throws(invalid(value => { value.id = 'title-theme' }), /qualified ID/)
    assert.throws(invalid(value => { value.durationSeconds = Infinity }), /finite number/)
    assert.throws(invalid(value => { value.durationSeconds = 3601 }), /at most 3600/)
    assert.throws(invalid(value => { value.loopStartSeconds = -1 }), /music loop/)
    assert.throws(invalid(value => { value.loopStartSeconds = value.loopEndSeconds }), /music loop/)
    assert.throws(invalid(value => { value.loopEndSeconds = value.durationSeconds + 1 }), /music loop/)
    assert.throws(invalid(value => { value.stems.main = null }), /non-empty string/)
    assert.throws(invalid(value => { value.stems.drums = 1 }), /non-empty string/)

    for (const path of ['/music/title', 'C:\\music\\title', 'https://example.test/title', '../title', '%2e%2e/title', '%252e%252e/title']) {
        assert.throws(invalid(value => { value.stems.main = path }), /bundle-relative path/)
    }
})
