import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'

test('flavor text draws its line ends and the spaces before them as one space, each counted in the width of the line', () => {
    const modules: Record<string, unknown> = { cc: { Color: class { constructor(...values: number[]) { Object.assign(this, values) } } } }
    const { almanacLines } = loadScript('assets/scripts/client/screens/AlmanacText.ts', (id: string) => modules[id] ?? {})
    // The lines come from the module's own realm: copied, to compare as arrays of this one.
    // A space the line ends on draws nothing.
    const text = (lines: Array<{ runs: Array<{ text: string }> }>) => Array.from(lines, line => Array.from(line.runs, run => run.text).join('').trimEnd())
    // The strings wrap their own lines after a space (LawnStrings.txt): TodWriteString draws the two as one.
    const flavor = '{FLAVOR}sunlight and high-fiber \ncarbon dioxide'
    assert.deepEqual(text(almanacLines(flavor, (value: string) => value.length, 100)), ['sunlight and high-fiber carbon dioxide'])
    // TodDrawStringWrapped still counts both: 23 letters, 2 spaces and 6 letters do not fit 30, though 30 would be drawn.
    assert.deepEqual(text(almanacLines(flavor, (value: string) => value.length, 30)), ['sunlight and high-fiber', 'carbon dioxide'])
    // Outside flavor text a line end ends the line, and spaces are drawn as written.
    assert.deepEqual(text(almanacLines('{KEYWORD}Damage:{STAT}  normal\nnext', (value: string) => value.length, 100)), ['Damage:  normal', 'next'])
})
