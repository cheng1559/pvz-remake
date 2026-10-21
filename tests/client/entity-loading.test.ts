import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'

function loadClientModule(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    return module.exports
}

test('preloaded assets bypass bundle callbacks across content loader instances', async () => {
    const assets = new Map<string, unknown>([['ready', {}], ['manifest', { json: {} }]])
    let loads = 0
    const bundle = {
        get: (path: string) => assets.get(path),
        load(path: string, _type: unknown, done: (error: Error | null, asset?: unknown) => void) {
            loads++
            if (loads === 1) { done(new Error('temporary read failure')); return }
            const asset = {}
            assets.set(path, asset)
            done(null, asset)
        },
    }
    const modules = {
        cc: { assetManager: { getBundle: () => bundle }, JsonAsset: class {} },
        '@/shared/content/index': { parseContentManifest: (value: unknown) => value },
    }
    const { ClientContentLoader } = loadClientModule('content/ClientContentLoader', modules)
    const { AssetLoader } = loadClientModule('content/LegacyAssetLoader', { cc: { resources: bundle } })
    const content = { bundle: 'base', contentHash: 'hash', category: 'sprites', id: 'pvz:ready', path: 'ready' }
    class Asset {}
    const loader = new ClientContentLoader()
    assert.equal(await loader.load(content, Asset), assets.get('ready'))
    assert.equal(await new ClientContentLoader().load(content, Asset), assets.get('ready'))
    assert.equal(await loader.loadManifest('base'), (assets.get('manifest') as any).json)
    assert.equal(await AssetLoader.load('ready', Asset), assets.get('ready'))
    assert.equal(loads, 0, 'cache hits must not schedule another engine load callback')
    const missing = { ...content, id: 'pvz:missing', path: 'missing' }
    await assert.rejects(loader.load(missing, Asset), /temporary read failure/)
    const first = loader.load(missing, Asset)
    assert.equal(loader.load(missing, Asset), first, 'pending requests remain shared')
    await first
    assert.equal(loads, 2, 'a failed load can retry')
})

test('preloaded animation frames are shared by registry and failed preparation can retry', async () => {
    let reads = 0, parses = 0
    const sprites: string[] = []
    const asset = { json: {} }
    let fail = true
    const { ReanimRepository } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, JsonAsset: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: () => {
            parses++
            return { id: 'pvz:demo', tracks: [{ keyframes: [{ sprite: 'pvz:leaf' }, { sprite: 'pvz:leaf' }] }] }
        } },
        '@/client/content/ClientContentLoader': { SpriteRepository: class {
            async load(id: string, animation: string) {
                sprites.push(`${animation}:${id}`)
                if (fail) throw new Error('sprite unavailable')
                return {}
            }
        } },
    })
    const registry = { resolve: () => ({}) }, loader = { async load() { reads++; return asset } }
    await assert.rejects(new ReanimRepository(registry, loader).load('pvz:demo'), /sprite unavailable/)
    fail = false
    const preparing = new ReanimRepository(registry, loader).load('pvz:demo')
    assert.equal(new ReanimRepository(registry, loader).load('pvz:demo'), preparing)
    const prepared = await preparing
    assert.equal(await new ReanimRepository(registry, loader).load('pvz:demo'), prepared)
    assert.equal(reads, 2)
    assert.equal(parses, 1)
    assert.deepEqual(sprites, ['pvz:demo:pvz:leaf', 'pvz:demo:pvz:leaf'])
    assert.notEqual(await new ReanimRepository({ resolve: () => ({}) }, loader).load('pvz:demo'), prepared,
        'registries with different sprite overrides must not share prepared frames')
})

test('blink attachments follow both the moving head and its parent stem', () => {
    class Color {
        static WHITE = new Color()
        static BLACK = new Color()
        constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
        clone() { return new Color(this.r, this.g, this.b, this.a) }
    }
    const modules: Record<string, any> = {
        cc: { Color, Component: class {}, toRadian: (degrees: number) => degrees * Math.PI / 180,
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/mod/index': { isQualifiedId: () => true },
    }
    const load = (path: string) => {
        const module = { exports: {} as Record<string, any> }
        const code = transpileModule(readFileSync(path, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
        return module.exports
    }
    modules['@/shared/content/reanim'] = load('assets/scripts/shared/content/reanim.ts')
    const { ReanimPlayer } = load('assets/scripts/client/reanim/ReanimPlayer.ts')
    const player = (trackId: string, from: number[], to = from) => {
        const result = new ReanimPlayer()
        result.data = { id: 'pvz:test', durationSeconds: 2, tracks: [{ id: trackId, zIndex: 0,
            keyframes: [from, to].map(([x, y], timeSeconds) => ({
                timeSeconds, x, y, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
                alpha: 1, sprite: 'pvz:test', interpolation: 'linear',
            })),
        }] }
        result.frames.set('pvz:test', {})
        result.views.set(trackId, { node: { position: { x: 0, y: 0 }, setPosition(x: number, y: number) { this.position = { x, y } }, setScale() {} }, sprite: {}, skew: { setSkew() {} } })
        return result
    }
    const body = player('stem', [0, 0], [20, 40])
    const head = player('face', [10, 20], [20, 30])
    const blink = player('eyelid', [15, 25])
    head.attachToTrack(body, 'stem')
    blink.attachToTrack(head, 'face')
    body.seek(0.5)
    head.seek(0.5)
    blink.seek(0)
    const position = () => blink.views.get('eyelid').node.position
    assert.deepEqual(Object.values(position()), [30, -50])
    body.seek(1)
    blink.seek(0)
    assert.deepEqual(Object.values(position()), [40, -70], 'the eyelid must inherit later movement of the stem too')
    head.data.tracks.length = 0
    blink.seek(0)
    assert.equal(blink.views.get('eyelid').sprite.enabled, false, 'a removed parent track must hide its attachment')
})

test('shooters repeat blinking from the start, skip it during shooting and stop it when firing', () => {
    const module = { exports: {} as Record<string, any> }
    class Color { static WHITE = new Color(); clone() { return new Color() } }
    const code = transpileModule(readFileSync('assets/scripts/client/level/LevelEntityRenderer.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => id === 'cc' ? { Color } : {} })
    const renderer = new module.exports.LevelEntityRenderer(0, {}, new ClientAnimationRegistry(), {}, {}, {}, {}, {}, {})
    const starts: any[] = []
    const player = () => ({ setColorOverride() {}, setExtraAdditiveDraw() {}, hide() {}, play() {}, snapshot: () => ({ playing: true }) })
    let shooting = false, hidden = false
    const view = { animationTarget: 'pvz:peashooter', body: player(), idleHead: player(),
        shootHead: { ...player(), snapshot: () => ({ playing: shooting }), blendFrom() {} },
        blink: { ...player(), play: (options: unknown) => starts.push(options), hide: () => { hidden = true } },
        blinkAtTick: 400, idleRate: 1,
    }
    renderer.shooterPlants.set(1, view)
    renderer.syncShooterPlant(1, 0, false, 399)
    assert.equal(starts.length, 0)
    renderer.syncShooterPlant(1, 0, false, 400)
    renderer.syncShooterPlant(1, 0, false, view.blinkAtTick)
    assert.equal(starts.length, 2)
    assert.ok(starts.every(options => options.timeSeconds === 0 && options.rate === 15 / 12 && !options.loop))
    shooting = true
    renderer.syncShooterPlant(1, 0, false, view.blinkAtTick)
    assert.equal(starts.length, 2)
    renderer.playShooterPlantShoot(1)
    assert.equal(hidden, true)
})

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
    const zombie = { state: 'walking', animation: 'anim_walk', animationTime: 0, animationSpeed: 1, hasHead: true, hasTongue: true, hasArm: true, hitFlashCounter: 0 }
    view.sync(zombie)
    await setImmediate()
    assert.equal(view.snapshot(1).body.id, 'pvz:flag_walk')
    assert.equal(view.snapshot(1).flag.attachmentTrackId, 'Zombie_flaghand')
    assert.equal(view.player.getTrackNode('anim_innerarm1').active, false)
    assert.equal(view.player.getTrackNode('Zombie_flaghand').active, true)
    assert.equal(view.flag.node.getSiblingIndex(), view.player.getTrackNode('Zombie_innerarm_screendoor').getSiblingIndex() + 1)
    assert.ok(view.flag.node.getSiblingIndex() < view.player.getTrackNode('Zombie_body').getSiblingIndex())
    assert.equal(view.player.getTrackNode('anim_tongue').active, true)
    view.sync({ ...zombie, hasTongue: false })
    assert.equal(view.player.getTrackNode('anim_tongue').active, false)
    view.sync(zombie)
    assert.equal(view.player.getTrackNode('anim_tongue').active, true)
    const held = view.snapshot(1)
    view.sync({ ...zombie, hasHead: false })
    assert.equal(view.player.getTrackNode('anim_innerarm1').active, true)
    assert.equal(view.player.getTrackNode('Zombie_flaghand').active, false)
    assert.equal(view.player.getTrackNode('anim_tongue').active, false)
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
