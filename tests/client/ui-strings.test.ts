import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { mergeStringLayers } from '@/shared/content/strings'

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : []
})

test('the base keeps its text only in the string tables: every literal key exists and no call carries a default', () => {
    const strings: Record<string, string> = JSON.parse(readFileSync('mods/pvz-base/assets/json/strings.json', 'utf8'))
    // Generating pvz-base merges the hand-written UI text into the one table the game reads.
    const project: Record<string, string> = JSON.parse(readFileSync('tools/pvz/ui-strings.json', 'utf8'))
    for (const [key, value] of Object.entries(project)) assert.equal(strings[key], value, `${key} is merged into pvz:strings; regenerate pvz-base`)
    assert.deepEqual(mergeStringLayers([{ owner: 'pvz', table: strings }]).strings, strings, 'the real base table loads as it is')
    for (const file of sources('assets/scripts')) {
        const source = readFileSync(file, 'utf8')
        // UI text and failed debug CLI conditions (shown as advice) both name their strings by key.
        for (const [, key] of source.matchAll(/(?:\.text|\.format|debugCondition)\('([A-Z0-9_]+)'/g)) {
            assert.ok(key in strings, `${file}: ${key} is not in the string tables`)
        }
        assert.doesNotMatch(source, /\.text\((?:'[A-Z0-9_]+'|`[^`]+`|[\w.]+),/, `${file} passes a default text`)
    }
})
