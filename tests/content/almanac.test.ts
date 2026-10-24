import { presentationFixture } from '../client/presentationFixture'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { ALMANAC_PLANTS, ALMANAC_ZOMBIES } from '@/server/menu/AlmanacCatalog'
import { parseContentManifest } from '@/shared/content'
import { parseReanim, sampleReanimTrack } from '@/shared/content/reanim'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as animationDefinitions from '@/client/content/ClientAnimationRegistry'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const bundle = 'tools/generated/pvz-base'
const manifest = parseContentManifest(json(`${bundle}/manifest.json`))
interface Part { name: string, id: string, parent?: string, track?: string, blink?: boolean, packetId?: string }
const displayModule = { exports: {} as Record<string, any> }
const displayCode = transpileModule(readFileSync('assets/scripts/client/reanim/EntityDisplay.ts', 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
})
runInNewContext(displayCode.outputText, { exports: displayModule.exports,
    require: (id: string) => id === '@/client/content/ClientAnimationRegistry' ? animationDefinitions : {} })
const layouts = json('tools/generated/resources/almanac-animations.json')
const registry = new animationDefinitions.ClientAnimationRegistry(presentationFixture)
const catalog = Object.fromEntries(['plants', 'zombies'].map(kind => [kind,
    layouts[kind].map((entry: any, id: number) => displayModule.exports.resolveEntityDisplay(kind, id, entry, registry)),
])) as Record<'plants' | 'zombies', Array<{ parts: Part[] }>>
const animation = (part: Part) => parseReanim(json(`${bundle}/${manifest.client.reanim[part.id]}.json`))

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
        const path = manifest.client.sprites[id]
        assert.ok(path && existsSync(`${bundle}/${path.replace(/\/spriteFrame$/, '')}.png`), `Missing sprite: ${id}`)
    }
})

test('almanac variants retain their equipment and composite plants retain their heads', () => {
    const tracks = (id: number) => animation(catalog.zombies[id].parts[0]).tracks
        .filter(track => sampleReanimTrack(track, 0)?.sprite).map(track => track.id)
    assert.ok(tracks(2).some(name => name.startsWith('anim_cone')))
    assert.ok(tracks(4).some(name => name.startsWith('anim_bucket')))
    assert.ok(tracks(6).some(name => name.startsWith('anim_screendoor')))
    assert.ok(tracks(10).some(name => name.startsWith('Zombie_duckytube')))
    assert.ok(!tracks(0).some(name => /^(anim_cone|anim_bucket|anim_screendoor|Zombie_duckytube)/.test(name)))
    assert.ok(catalog.zombies[1].parts.some(part => part.track === 'Zombie_flaghand'))
    assert.ok(catalog.zombies[25].parts.some(part => part.track === 'Boss_head2'))
    assert.ok(tracks(20).includes('Zombie_bungi_body'))
    assert.ok(existsSync(`${bundle}/${manifest.client.sprites['pvz:bungeecord'].replace(/\/spriteFrame$/, '')}.png`))
    assert.equal(catalog.plants[18].parts.filter(part => part.name.startsWith('head')).length, 3)
    assert.ok(catalog.plants[28].parts.some(part => part.name === 'backHead'))
    assert.ok(catalog.plants[41].parts.some(part => part.name === 'face2'))
})
