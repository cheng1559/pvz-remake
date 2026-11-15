import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

function load(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    return module.exports
}

test('flavor text draws its line ends and the spaces before them as one space, each counted in the width of the line', () => {
    const { almanacLines } = load('assets/scripts/client/screens/AlmanacText.ts', { cc: { Color: class { constructor(...values: number[]) { Object.assign(this, values) } } } })
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
