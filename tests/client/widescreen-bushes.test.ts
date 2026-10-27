import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import { ModHost } from '@/shared/mod/ModHost'
import { parseReanim } from '@/shared/content/reanim'
import { installBattleBushes } from '../../mods/widescreen/src/client/bushes'

test('both widescreen Mods retain independent bush resources, row triggers, timing and ordering', async () => {
    const root = 'mods/widescreen'
    const content = JSON.parse(readFileSync(`${root}/content.json`, 'utf8'))
    const pvz = JSON.parse(readFileSync('mods/widescreen-pvz/content.json', 'utf8'))
    assert.equal(readFileSync('mods/widescreen-pvz/src/client/bushes.ts', 'utf8').replaceAll('local:widescreen-pvz/', 'local:widescreen/'),
        readFileSync(`${root}/src/client/bushes.ts`, 'utf8'))
    const clips = new Map()
    const sprites = new Set<string>()
    for (const variant of [3, 4, 5]) {
        const id = `local:widescreen/bushes${variant}`
        const clip = parseReanim(JSON.parse(readFileSync(`${root}/${content.resources.reanim[id]}`, 'utf8')))
        const originalId = id.replace('local:widescreen/', 'local:widescreen-pvz/')
        assert.equal(readFileSync(`mods/widescreen-pvz/${pvz.resources.reanim[originalId]}`, 'utf8').replaceAll('local:widescreen-pvz/', 'local:widescreen/'),
            readFileSync(`${root}/${content.resources.reanim[id]}`, 'utf8'))
        clips.set(id, clip)
        for (const track of clip.tracks) for (const frame of track.keyframes) if (frame.sprite) {
            if (sprites.has(frame.sprite)) continue
            sprites.add(frame.sprite)
            assert.ok(frame.sprite.startsWith('local:widescreen/'))
            const sprite = content.resources.sprites[frame.sprite]
            assert.equal(sprite.scale, 2)
            assert.equal(sprite.alphaMode, 'premultiplied')
            assert.ok(existsSync(`${root}/${sprite.file}`))
            const originalSprite = pvz.resources.sprites[frame.sprite.replace('local:widescreen/', 'local:widescreen-pvz/')]
            assert.deepEqual(readFileSync(`mods/widescreen-pvz/${originalSprite.file}`), readFileSync(`${root}/${sprite.file}`))
        }
    }
    assert.equal(sprites.size, 12)
    const players: any[] = [], layer = { children: [] as any[] }
    class Player {
        time = 0
        lastFrameTimeSeconds = 3.5 - 1 / 12
        constructor(readonly node: any) { players.push(this) }
        async load(id: string) { assert.ok(clips.has(id)) }
        play(options: any) { assert.equal(options.loop, false); assert.equal(options.rate, 10 / 12) }
        pause() {}
        seek(time: number) { this.time = time }
    }
    class Renderer {
        entityLayer = layer
        collectLayerEntries(_snapshot: any): any[] { return [] }
        sync(snapshot: any, _changes: any, _events: any[]) { return this.collectLayerEntries(snapshot) }
    }
    const host = new ModHost('local:widescreen', {
        'client/level/LevelEntityRenderer': { LevelEntityRenderer: Renderer },
        'client/reanim/ReanimPlayer': { ReanimPlayer: Player },
        'client/view/uiNode': { uiNode(options: any) {
            const node = { ...options, addComponent(Type: any) { return new Type(this) } }
            options.parent.children.push(node)
            return { node }
        } },
    })
    try {
        await installBattleBushes({ host, assets: {} as any })({ entityLayer: layer }, { registry: {}, loader: {} })
        const renderer = new Renderer()
        assert.equal(players.length, 5)
        const sync = (tick: number, events: any[] = []) => renderer.sync({ gameplayTick: tick }, {}, events)
        const spawn = (row: number, typeId = 'pvz:normal') => ({ type: 'zombieSpawned', data: { row, typeId } })
        assert.deepEqual(sync(0).map(entry => entry.order), [6, 16, 26, 36, 46])
        sync(100, [spawn(2), spawn(3, 'pvz:bungee')])
        sync(200)
        assert.equal(players[2].time, 10 / 12)
        assert.equal(players[3].time, 0, 'bungees do not rustle the bushes')
        sync(200)
        assert.equal(players[2].time, 10 / 12, 'a frozen game clock keeps the pose')
        sync(200, [spawn(2)])
        assert.equal(players[2].time, 0, 'a later spawn restarts the row animation')
        sync(1000)
        assert.equal(players[2].time, players[2].lastFrameTimeSeconds)
        sync(1100)
        assert.equal(players[2].time, players[2].lastFrameTimeSeconds, 'the completed animation holds its final pose')
        sync(0)
        assert.ok(players.every(player => player.time === 0), 'rewinding to a save resets transient rustles')
    } finally { host.dispose() }
})
