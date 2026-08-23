import assert from 'node:assert/strict'
import test from 'node:test'

import { parseFontV2 } from '@/shared/content/font'

function font() {
    return {
        schemaVersion: 2,
        id: 'pvz:test-font',
        defaultPointSize: 18,
        charMap: { 8217: 39 },
        layers: [{
            name: 'Main',
            image: 'TestFont_atlas',
            ascent: 18,
            ascentPadding: 0,
            lineSpacingOffset: 1,
            pointSize: 18,
            height: 0,
            spacing: 0,
            offset: [0, 0],
            drawMode: -1,
            baseOrder: 0,
            colorMult: [255, 255, 255, 255],
            colorAdd: [0, 0, 0, 0],
            chars: {
                65: {
                    rect: [0, 0, 12, 18],
                    offset: [-1, 0],
                    width: 10,
                    order: 0,
                    kerning: { 86: -1 },
                },
            },
        }],
    }
}

test('FontV2 strictly parses PVZ glyph and kerning data', () => {
    const parsed = parseFontV2(font())
    assert.equal(parsed.id, 'pvz:test-font')
    assert.equal(parsed.layers[0].chars['65'].kerning['86'], -1)
})

test('FontV2 rejects unsupported fields and unsafe asset references', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(font())
        change(value)
        return () => parseFontV2(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.id = 'font' }), /qualified ID/)
    assert.throws(invalid(value => { value.layers[0].image = '../atlas' }), /asset name/)
    assert.throws(invalid(value => { value.layers[0].chars['65'].rect[2] = -1 }), /non-negative/)
    assert.throws(invalid(value => { value.layers[0].chars.bad = value.layers[0].chars['65'] }), /character code/)
})
