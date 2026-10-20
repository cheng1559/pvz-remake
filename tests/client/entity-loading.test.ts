import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'

test('repeated entity additions keep restore waiting for the original animation load', async () => {
    // Exercise the renderer's task scheduling without initializing the Cocos runtime.
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(
        readFileSync('assets/scripts/client/level/LevelEntityRenderer.ts', 'utf8'),
        { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } },
    )
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: () => ({}),
        console,
    })
    const renderer = new module.exports.LevelEntityRenderer(
        0, { loadedMods: { plantUpgrades: [] } }, {}, {}, { children: [] }, {}, {}, {}, { complete: true },
    )
    let release!: () => void
    const loading = new Promise<void>(resolve => { release = resolve })
    let loaded = false
    let restored = false
    let failure: unknown
    const player = {
        restore() {
            assert.ok(loaded, 'animation must finish loading before restore')
            restored = true
        },
    }
    renderer.create = async (id: number) => {
        if (renderer.entities.has(id)) return
        renderer.entities.set(id, { getComponent: () => player })
        await loading
        loaded = true
    }
    const world = {
        plants: [], zombies: [], projectiles: [], items: [], lawnMowers: [],
        cursor: { mode: 'none' },
    }
    const added = { added: [1], removed: [] }
    renderer.sync(world, added, [])
    const creation = renderer.creationTasks.get(1)
    renderer.sync(world, added, [])
    const restoring = renderer.restore([{ kind: 'sun', entityId: 1, animation: {} }])
        .catch((error: unknown) => { failure = error })
    try {
        await setImmediate()
        assert.equal(failure, undefined)
        assert.equal(restored, false)
        release()
        await restoring
        assert.equal(failure, undefined)
        assert.equal(restored, true)
    } finally {
        release()
        await Promise.all([creation, restoring])
    }
})

test('flag zombie loads its installed clips and restores attachments through walking, eating, mowing and death', async () => {
    const manifest = JSON.parse(readFileSync('assets/bundles/pvz-base/manifest.json', 'utf8'))
    const errors: unknown[] = []
    class Node {
        isValid = true
        parent: Node | null = null
        children: Node[] = []
        position = { x: 0, y: 0 }
        active = true
        constructor(public name = '') {}
        setParent(parent: Node) {
            if (this.parent === parent) return
            if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this)
            this.parent = parent
            parent.children.push(this)
        }
        getSiblingIndex() { return this.parent?.children.indexOf(this) ?? 0 }
        setSiblingIndex(index: number) {
            const parent = this.parent!
            parent.children = parent.children.filter(child => child !== this)
            parent.children.splice(index, 0, this)
        }
        setPosition(x: number, y: number) { this.position = { x, y } }
        addComponent() { return new Player(this) }
        destroy() { this.isValid = false; this.children.forEach(child => child.destroy()) }
    }
    class Player {
        id = ''
        tracks: string[] = []
        attachmentTrackId: string | null = null
        constructor(readonly node: Node) {}
        async load(id: string) {
            const path = manifest.client.reanim[id]
            assert.ok(path, `missing installed animation ${id}`)
            this.id = id
            this.tracks = JSON.parse(readFileSync(`assets/bundles/pvz-base/${path}.json`, 'utf8')).tracks.map((track: any) => track.id)
            for (const track of this.tracks) new Node(track).setParent(this.node)
        }
        attachToTrack(parent: Player, track: string) { assert.ok(parent.tracks.includes(track), `${parent.id} has no ${track}`); this.attachmentTrackId = track }
        reattachAfterRestore(parent: Player) { this.attachToTrack(parent, this.attachmentTrackId!) }
        snapshot() { return { id: this.id, attachmentTrackId: this.attachmentTrackId } }
        restore(value: any) { this.attachmentTrackId = value.attachmentTrackId }
        play() {}
        pause() {}
        hide() {}
        seek() {}
        blendFrom() {}
        getTrackNode(id: string) { return this.node.children.find(child => child.name === id) }
        setTrackPrefixVisible(prefix: string, visible: boolean) {
            this.node.children.filter(child => child.name.startsWith(prefix)).forEach(child => { child.active = visible })
        }
        setTrackSpriteOverride() {}
        setExtraAdditiveDraw() {}
    }
    const uiNode = (options: any) => {
        const node = options.node ?? new Node(options.name)
        if (options.parent) { node.parent = options.parent; options.parent.children.push(node) }
        if (options.position) node.setPosition(options.position.x ?? 0, options.position.y ?? 0)
        return { node }
    }
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/level/LevelZombieView.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    const modules: Record<string, unknown> = {
        cc: { Color: class {}, Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/view/uiNode': { uiNode }, '@/client/reanim/ReanimPlayer': { ReanimPlayer: Player },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console: { error: (...args: unknown[]) => errors.push(args) } })
    const create = () => new module.exports.LevelZombieView(new Node(), {}, {}, new ClientAnimationRegistry(), new Node(), {}, {}, 'pvz:flag')
    const view = create()
    const zombie = { state: 'walking', animation: 'anim_walk', animationTime: 0, animationSpeed: 1, hasHead: true, hasArm: true, hitFlashCounter: 0 }
    view.sync(zombie)
    await setImmediate()
    assert.equal(view.snapshot(1).body.id, 'pvz:flag_walk')
    assert.equal(view.snapshot(1).flag.attachmentTrackId, 'Zombie_flaghand')
    assert.equal(view.player.getTrackNode('anim_innerarm1').active, false)
    assert.equal(view.player.getTrackNode('Zombie_flaghand').active, true)
    assert.equal(view.flag.node.getSiblingIndex(), view.player.getTrackNode('Zombie_innerarm_screendoor').getSiblingIndex() + 1)
    assert.ok(view.flag.node.getSiblingIndex() < view.player.getTrackNode('Zombie_body').getSiblingIndex())
    const held = view.snapshot(1)
    view.sync({ ...zombie, hasHead: false })
    assert.equal(view.player.getTrackNode('anim_innerarm1').active, true)
    assert.equal(view.player.getTrackNode('Zombie_flaghand').active, false)
    const restored = create()
    await restored.restore(held)
    assert.equal(restored.flag.node.parent, restored.player.node)
    for (const [state, animation] of [['eating', 'anim_eat'], ['mowered', 'mowered'], ['dying', 'anim_death']]) {
        zombie.state = state
        zombie.animation = animation
        restored.sync(zombie)
        await setImmediate()
        if (state === 'mowered') assert.equal(restored.snapshot(1).mowerDriver.id, 'pvz:lawnmowered_zombie')
    }
    assert.equal(restored.snapshot(1).body.id, 'pvz:flag_death')
    assert.equal(restored.snapshot(1).flag, undefined)
    assert.deepEqual(errors, [])
})
