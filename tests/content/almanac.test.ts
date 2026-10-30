import { readBaseContent } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { ALMANAC_PLANTS, ALMANAC_ZOMBIES } from '@/server/menu/almanacCatalog'
import { parseReanim, sampleReanimTrack } from '@/shared/content/reanim'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as animationDefinitions from '@/client/content/ClientAnimationRegistry'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const bundle = 'mods/pvz-base'
const resources = readBaseContent().resources
interface Part { name: string, id: string, parent?: string, track?: string, blink?: boolean, packetId?: string }
const displayModule = { exports: {} as Record<string, any> }
const displayCode = transpileModule(readFileSync('assets/scripts/client/reanim/EntityDisplay.ts', 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
})
runInNewContext(displayCode.outputText, { exports: displayModule.exports,
    require: (id: string) => id === '@/client/content/ClientAnimationRegistry' ? animationDefinitions : {} })
const layouts = json(`${bundle}/${resources.json['pvz:almanac-animations']}`)
const registry = new animationDefinitions.ClientAnimationRegistry(presentationFixture)
const catalog = Object.fromEntries(['plants', 'zombies'].map(kind => [kind,
    layouts[kind].map((entry: any, id: number) => displayModule.exports.resolveEntityDisplay(kind, id, entry, registry)),
])) as Record<'plants' | 'zombies', Array<{ parts: Part[] }>>
const animation = (part: Part) => parseReanim(json(`${bundle}/${resources.reanim[part.id]}`))

test('every almanac entry has renderable animation clips, valid attachments and installed sprites', () => {
    const sprites = new Set<string>()
    for (const [kind, entries] of [['plants', ALMANAC_PLANTS], ['zombies', ALMANAC_ZOMBIES]] as const) {
        assert.equal(catalog[kind].length, entries.length)
        for (const entry of entries) {
            const parts = catalog[kind][entry.id].parts
            assert.ok(parts.length, entry.key)
            const loaded = new Map(parts.map(part => [part.name, animation(part)]))
            for (const part of parts) {
                const data = loaded.get(part.name)!
                if (!part.blink) assert.ok(data.tracks.some(track => sampleReanimTrack(track, 0)?.sprite), `${entry.key}: empty ${part.name}`)
                if (part.parent) {
                    const parent = loaded.get(part.parent)
                    assert.ok(parent, `${entry.key}: missing parent ${part.parent}`)
                    const track = parent.tracks.find(track => track.id === part.track)
                    assert.ok(track && sampleReanimTrack(track, 0), `${entry.key}: missing attachment ${part.track}`)
                }
                const clips = [data, ...(part.packetId ? [animation({ ...part, id: part.packetId })] : [])]
                for (const clip of clips) for (const track of clip.tracks) for (const frame of track.keyframes) if (frame.sprite) sprites.add(frame.sprite)
            }
        }
    }
    for (const id of sprites) {
        const path = resources.sprites[id]?.file
        assert.ok(path && existsSync(`${bundle}/${path}`), `Missing sprite: ${id}`)
    }
})
