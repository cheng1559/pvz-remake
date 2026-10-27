import assert from 'node:assert/strict'
import test from 'node:test'
import { registerCobShadow } from '../../mods/corn/src/client/cobShadow'
import { ModHost } from '@/shared/mod/ModHost'
import { readModContent } from '../../tools/content_source.mjs'

test('cob shadows follow the reference ground position, altitude scaling and removal across asynchronous loading', async () => {
    class Node {
        isValid = true; active = true; children: Node[] = []; parent?: Node
        position: number[] = []; scale: number[] = []; angle = 0; frame: any
        constructor(readonly name: string) {}
        setPosition(...values: number[]) { this.position = values }
        setScale(...values: number[]) { this.scale = values }
        setSiblingIndex(index: number) {
            const siblings = this.parent?.children
            if (siblings) { siblings.splice(siblings.indexOf(this), 1); siblings.splice(index, 0, this) }
        }
        destroy() {
            this.isValid = false
            for (const child of [...this.children]) child.destroy()
            this.parent?.children.splice(this.parent.children.indexOf(this), 1)
        }
    }
    class Renderer {
        entityLayer = new Node('Entities')
        lastSnapshot: any
        content = { levels: { levels: { level: { board: 'day' } } },
            definitions: { boards: { day: { origin: { y: 80 }, cell: { height: 100 } } } } }
        sync(snapshot: any) { this.lastSnapshot = snapshot }
    }
    let resolveAtlas!: (value: any) => void, loads = 0
    const atlasReady = new Promise(resolve => { resolveAtlas = resolve })
    const modules = {
        cc: { Sprite: { SizeMode: { RAW: 0 } }, SpriteFrame: class {}, isValid: (node: Node) => node.isValid },
        'client/view/uiNode': { uiNode(options: any) {
            const node = new Node(options.name)
            node.active = options.active ?? true
            node.parent = options.parent; node.parent!.children.push(node); node.frame = options.sprite?.frame
            return { node }
        } },
        'client/hud/SeedPacketRenderer': { getAtlasFrame(atlas: any, cell: number, width: number, height: number, columns: number) {
            assert.equal(atlas.originalSize.width, 42)
            assert.deepEqual([cell, width, height, columns], [0, 21, 9, 2])
            return { width, height }
        } },
        'client/game/loadIntegratedGameContent': { async loadIntegratedGameContent() { return {
            registry: { resolve: (_kind: string, id: string) => id }, loader: { async load(id: string) {
                assert.equal(id, 'pvz:pea_shadows'); loads++; return atlasReady
            } },
        } } },
        'client/level/LevelEntityRenderer': { LevelEntityRenderer: Renderer },
    }
    const host = new ModHost('corn:plants', modules)
    const config = readModContent('mods/corn/content.json').presentation.projectiles['corn:cob'].viewConfig.shadow
    const preload = registerCobShadow(host, modules['client/game/loadIntegratedGameContent'].loadIntegratedGameContent, 'corn:cob', config)
    const renderer = new Renderer()
    const body = new Node('Bodies'); body.parent = renderer.entityLayer; renderer.entityLayer.children.push(body)
    const snapshot = { levelId: 'level', projectiles: [{ entityId: 1, typeId: 'corn:cob', x: 200, row: 2 }],
        extensions: { 'corn:cob_flight': { 1: { z: 0 } } } }
    try {
        renderer.sync(snapshot)
        assert.equal(renderer.entityLayer.children[1].active, false, 'no frame at the default origin while loading')
        renderer.sync({ ...snapshot, projectiles: [] })
        resolveAtlas({ originalSize: { width: 42, height: 9 } })
        await preload(); await Promise.resolve()
        assert.deepEqual(renderer.entityLayer.children, [body], 'a removed projectile cannot reappear when loading finishes')

        renderer.sync(snapshot)
        const layer = renderer.entityLayer.children[0], shadow = layer.children[0]
        assert.equal(layer.name, 'CobShadows')
        assert.deepEqual(shadow.position, [-143, -47])
        assert.deepEqual(shadow.scale, [3, 1, 1])
        snapshot.extensions['corn:cob_flight'][1].z = -800
        renderer.sync(snapshot)
        assert.deepEqual(shadow.scale, [1.5, 0.5, 1], 'shadow shrink is capped at 200px altitude')
        Object.assign(snapshot.projectiles[0], { x: 500, row: 4 })
        snapshot.extensions['corn:cob_flight'][1].z = -200
        renderer.sync(snapshot)
        assert.deepEqual(shadow.position, [157, -247], 'ground shadow moves to the target row when the cob turns')
        assert.equal(shadow.angle, 0)
        snapshot.extensions['corn:cob_flight'][1].z = -40
        renderer.sync(snapshot)
        assert.equal(shadow.scale[1], 200 / 240)
        const restored = new Renderer(); restored.sync(snapshot)
        assert.deepEqual(restored.entityLayer.children[0].children[0].position, shadow.position)
        renderer.sync({ ...snapshot, projectiles: [] })
        assert.equal(shadow.isValid, false, 'impact/removal destroys the shadow')
        assert.equal(loads, 1)
    } finally { host.dispose() }
})
