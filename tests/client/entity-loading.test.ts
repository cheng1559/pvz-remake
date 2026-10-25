import { readGameplaySource } from '../../tools/content_source'
import { readModContent } from '../../tools/content_source.mjs'
import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import * as animationDefinitions from '@/client/content/ClientAnimationRegistry'
import * as plantDefinitions from '@/client/plants/definitions'
import * as zombieDefinitions from '@/client/zombies/definitions'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { buildModStrings, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import * as modRegistry from '@/shared/mod'
import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'

function loadClientModule(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    return module.exports
}


function plantViewModule(name: string, body: unknown, modules: Record<string, unknown> = {}) {
    const shared = { cc: { Color: class {} }, '@/client/content/ClientAnimationRegistry': animationDefinitions,
        '@/client/view/uiNode': { uiNode: () => ({ node: { addComponent: () => body } }) }, ...modules }
    const base = loadClientModule('plants/AnimatedPlantView', { ...shared, './definitions': plantDefinitions })
    return loadClientModule('plants/' + name, { ...shared, './AnimatedPlantView': base, './definitions': plantDefinitions })
}

test('plant and zombie Mod view factories share registration, conflict and freeze rules', async () => {
    for (const [kind, definitions, className] of [
        ['plant', plantDefinitions, 'PlantViewRegistry'], ['zombie', zombieDefinitions, 'ZombieViewRegistry'],
    ] as const) {
        const module = loadClientModule(`${kind}s/${className}`, {
            '@/client/content/EntityViewRegistry': { EntityViewRegistry }, './definitions': definitions,
        })
        const registry = new module[className]()
        const view = { sync() {}, snapshot() {}, restore() {} }
        registry.register('example:custom', () => view)
        assert.throws(() => registry.register('example:custom', () => view), /duplicate/)
        registry.freeze()
        assert.equal(await registry.create({
            [kind]: { typeId: 'example:entity' }, animations: { definitions: { [`${kind}s`]: { 'example:entity': { view: 'example:custom' } } } },
        }), view)
        assert.throws(() => registry.register('example:late', () => view), /frozen/)
    }
    assert.throws(() => zombieDefinitions.zombieDefinition(presentationFixture, 'example:missing'), /not installed/)
})

test('removing an entity while its custom view loads disposes the completed plant or zombie view', async () => {
    for (const kind of ['plant', 'zombie']) {
        const node = { isValid: true, destroy() { this.isValid = false } }
        const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
            '@/client/view/uiNode': { uiNode: () => ({ node }) },
        })
        let finish!: (view: unknown) => void
        let context: any
        const factory = { create(value: unknown) { context = value; return new Promise(resolve => { finish = resolve }) } }
        const content = { plantViews: factory, zombieViews: factory, levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } } }
        const renderer = new LevelEntityRenderer(0, content, {}, {}, {}, {}, {}, {}, {})
        const entity = { entityId: 1, typeId: 'test:entity', behaviorState: { ticks: 3 } }
        const snapshot = { levelId: 'test:level', gameplayTick: 5, plants: [], zombies: [], lawnMowers: [], projectiles: [], items: [],
            [kind + 's']: [entity] }
        const pending = renderer.create(1, snapshot)
        assert.equal(context[kind], entity)
        renderer.remove(1)
        let disposed = 0
        finish({ destroy() { disposed++ } })
        await pending
        assert.equal(disposed, 1)
        assert.equal(renderer.node(1), undefined)
    }
})

for (const kind of ['plant', 'zombie'] as const) test(`${kind} factories stay hidden while loading and paused restore reveals the current state`, async () => {
    const node = { isValid: true, active: true, setPosition() {}, destroy() { this.isValid = false } }
    const settings = { perfPlantsVisible: true, perfZombiesVisible: true }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
        '@/client/view/uiNode': { uiNode: (options: any) => { node.active = options.active; return { node } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
    })
    let finish!: () => void
    const loading = new Promise<void>(resolve => { finish = resolve })
    const synced: unknown[] = []
    let restored = false
    const view = { sync(plant: unknown) {
        if (synced.length === 0) assert.equal(node.active, false, 'the initial pose must be applied before showing the entity')
        synced.push(plant)
    }, restore() { restored = true } }
    const content = { levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } },
        [kind + 'Views']: { async create() {
            assert.equal(node.active, false, 'raw animation tracks must stay hidden while the factory loads')
            await loading
            return view
        } } }
    const renderer = new LevelEntityRenderer(0, content, {}, {}, {}, {}, {}, {}, { complete: true })
    renderer.syncLayerOrder = () => {}
    const plant = { entityId: 1, typeId: 'test:plant', x: 40, y: 280, health: 300 }
    const snapshot = { levelId: 'test:level', gameplayTick: 0, paused: true, plants: [], zombies: [], [kind + 's']: [plant], projectiles: [],
        items: [], lawnMowers: [], cursor: { mode: 'none' } }
    const changes = { added: [1], removed: [] }
    renderer.sync(snapshot, changes, [])
    const creation = renderer.creationTasks.get(1)
    renderer.sync(snapshot, changes, [])
    assert.equal(node.active, false, 'normal visibility updates must not reveal a pending plant')
    const current = { ...plant, health: 200 }
    renderer.sync({ ...snapshot, [kind + 's']: [current] }, { added: [], removed: [] }, [])
    finish()
    await creation
    assert.equal(node.active, false, 'factory completion alone must not expose its stale initial state')
    await renderer.restore([{ kind, entityId: 1 }])
    assert.equal(restored, true)
    assert.deepEqual(synced, [current])
    assert.equal(node.active, true, 'paused restore must reveal entities without waiting for another tick')
    settings.perfPlantsVisible = settings.perfZombiesVisible = false
    renderer.sync(snapshot, { added: [], removed: [] }, [])
    assert.equal(node.active, false, 'the performance visibility switch still applies')
})

test('plant explosions and projectile impacts use configured visuals and audio for custom IDs', () => {
    const definitions: any = structuredClone(presentationFixture)
    definitions.projectiles['test:shot'] = {
        ...definitions.projectiles['pvz:snow_pea'], fireSounds: [{ id: 'test:fire', foley: true, pitchRange: 3 }],
    }
    definitions.plants['test:bomb'] = { explosionSounds: [{ id: 'test:explode', foley: false }],
        explosion: { effect: 'test:blast', x: 7, rowOrder: true } }
    definitions.zombies['test:armored'] = definitions.zombies['pvz:buckethead']
    const calls: unknown[] = []
    const { LevelAudioPresenter } = loadClientModule('level/LevelAudioPresenter', {
        '@/client/sound/LegacySoundSystem': { SoundEffect: {}, SoundLoader: {
            playFoley(id: string, pitch: number) { calls.push(['foley', id, pitch]) },
            play(id: string) { calls.push(['play', id]) },
        } },
    })
    const audio = new LevelAudioPresenter({}, definitions)
    audio.play({ type: 'projectileFired', data: { typeId: 'test:shot' } })
    audio.play({ type: 'plantExploded', data: { typeId: 'test:bomb' } })
    assert.deepEqual(calls, [['foley', 'test:fire', 3], ['play', 'test:explode']])

    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {})
    const renderer = new LevelEntityRenderer(0, { presentation: definitions }, {}, {}, {}, {}, {}, audio, {})
    const impacts: unknown[] = []
    renderer.spawnProjectileImpact = (_snapshot: unknown, _event: unknown, impact: unknown) => impacts.push(impact)
    const snapshot = { zombies: [{ entityId: 1, typeId: 'test:armored' }] }
    const event = { type: 'projectileImpact', data: { targetId: 1, targetTypeId: 'test:armored', typeId: 'test:shot' } }
    renderer.playEvents(snapshot, [event])
    renderer.playEvents({ zombies: [] }, [{ ...event, data: { ...event.data, helm: 'bucket' } }])
    assert.equal(impacts[0], definitions.projectiles['test:shot'].impact)
    assert.equal(impacts[1], definitions.projectiles['test:shot'].impact)
    assert.deepEqual(calls.slice(2), [['foley', 'splat', 10], ['foley', 'shieldhit', undefined]])

    const explosions: unknown[][] = []
    renderer.spawnBoardParticle = (...args: unknown[]) => explosions.push(args)
    const explosion = { type: 'plantExploded', data: { typeId: 'test:bomb', x: 300, y: 200, row: 2 } }
    renderer.playEvents(snapshot, [explosion])
    assert.deepEqual(explosions, [['test:blast', 307, 200, 20.5]])
    audio.play({ type: 'bowlingImpact', data: { typeId: 'test:armored', helm: true } })
    assert.deepEqual(calls.at(-1), ['foley', 'shieldhit', undefined], 'bowling armor audio uses the target definition')
})

test('presentation definitions use the common ZIP resolver without mutating base data', async () => {
    const asset = { json: presentationFixture }
    let current: unknown = asset
    const manifest = { id: 'pvz:base', presentation: { definitions: 'presentation/definitions.json' } }
    const { loadPresentationDefinitions } = loadClientModule('content/loadPresentationDefinitions', {
        cc: { JsonAsset: class {} },
        './ModResources': { modResources: { async asset(id: string) {
            assert.equal(id, 'pvz:presentation/definitions')
            return current
        } } },
        '@/app/ModLoader': { loadInstalledMods: async () => ({ presentationDefinitions: [] }) },
        '@/shared/content/DefinitionRegistry': { buildPresentationDefinitions },
    })
    assert.deepEqual(await loadPresentationDefinitions(manifest), presentationFixture)
    const alternate = structuredClone(presentationFixture)
    current = { json: alternate }
    assert.deepEqual(await loadPresentationDefinitions(manifest), alternate)
    assert.equal(asset.json, presentationFixture)
    current = undefined
    await assert.rejects(loadPresentationDefinitions(manifest), /Missing presentation/)
})

test('UI assets include registered Mod presentations and names before opening a level', async () => {
    const sources = [{ ownerId: 'example:plants', data: readModContent('mods/example-plant/content.json').presentation }]
    const presentation = buildPresentationDefinitions(presentationFixture, sources)
    const { loadUIAssets } = loadClientModule('ui/UIAssets', {
        cc: { JsonAsset: class {} },
        '@/client/content/ClientContentLoader': { ClientContentLoader: class { async loadManifest() { return {} } } },
        '@/client/content/loadPresentationDefinitions': { loadPresentationDefinitions: async () => presentation },
        '@/app/ModLoader': { loadInstalledMods: async () => ({ presentationDefinitions: sources }) },
        '@/shared/content/DefinitionRegistry': { buildModStrings },
        '@/client/content/ModResources': { modResources: { ready: async () => {}, revision: 0 } },
        '@/client/content/LegacyAssetLoader': { AssetLoader: { load: async () => ({ json: { EXISTING: 'Existing' } }) } },
        '@/core/SpriteLoader': { SpriteLoader: { load: async () => ({}) } },
        '@/client/font/BitmapFontLoader': { loadBitmapFont: async () => ({}) },
    })
    const assets = await loadUIAssets()
    assert.equal(assets.presentation, presentation)
    assert.equal(assets.strings['example:rapid_pea'], 'Rapid Pea')
    assert.equal(assets.strings.EXISTING, 'Existing')
    assert.equal(await loadUIAssets(), assets)
})

test('ZIP caches are shared across content loaders and failed requests can retry', async () => {
    const assets = new Map<string, unknown>([['pvz:ready', {}]])
    const manifest = {}
    let loads = 0
    const packs = {
        async baseJson() { return manifest },
        async asset(id: string) {
            if (assets.has(id)) return assets.get(id)
            if (++loads === 1) throw new Error('temporary read failure')
            const asset = {}
            assets.set(id, asset)
            return asset
        },
    }
    const { ClientContentLoader } = loadClientModule('content/ClientContentLoader', {
        cc: { JsonAsset: class {} },
        '@/shared/content/index': { parseContentManifest: (value: unknown) => value },
        './ModResources': { modResources: packs },
    })
    const { AssetLoader } = loadClientModule('content/LegacyAssetLoader', {
        cc: { EffectAsset: class {} }, './ModResources': { modResources: packs },
    })
    const content = { bundle: 'base', contentHash: 'hash', category: 'sprites', id: 'pvz:ready', path: 'ready' }
    class Asset {}
    const loader = new ClientContentLoader()
    assert.equal(await loader.load(content, Asset), assets.get('pvz:ready'))
    assert.equal(await new ClientContentLoader().load(content, Asset), assets.get('pvz:ready'))
    assert.equal(await loader.loadManifest(), manifest)
    assert.equal(await AssetLoader.load('pvz:ready', Asset), assets.get('pvz:ready'))
    assert.equal(loads, 0)
    const missing = { ...content, id: 'pvz:missing', path: 'missing' }
    await assert.rejects(loader.load(missing, Asset), /temporary read failure/)
    const first = loader.load(missing, Asset)
    assert.equal(loader.load(missing, Asset), first)
    await first
    assert.equal(loads, 2)
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

test('Dave keeps an active blink attached through talk, idle and leave transitions', () => {
    const { CrazyDaveView } = loadClientModule('level/CrazyDaveView', {})
    const player = (duration: number) => ({
        node: { active: false }, time: 0, playing: false, loop: false, parent: undefined as unknown,
        eyes: true, onFinish: undefined as (() => void) | undefined,
        blendFrom() {}, setTrackSpriteOverride() {},
        setTrackPrefixVisible(prefix: string, visible: boolean) { if (prefix === 'Dave_eye') this.eyes = visible },
        attachToTrack(parent: unknown, track: string) { assert.equal(track, 'Dave_head'); this.parent = parent },
        play(options: any) { this.time = options.timeSeconds; this.loop = options.loop; this.playing = true; this.onFinish = options.onFinish },
        advance(dt: number) {
            if (!this.playing) return
            this.time += dt
            if (!this.loop && this.time >= duration) { this.playing = false; this.onFinish?.() }
        },
    })
    const talk = player(0.2), idle = player(1), leave = player(1), blink = player(0.4)
    const players = new Map([['smalltalk', talk], ['idle', idle], ['leave', leave], ['blink', blink]])
    const view = new CrazyDaveView({ active: true }, { active: false }, {}, players,
        { node: { active: false } }, new Map(), {}, presentationFixture.dave)
    view.play('smalltalk', false, 12, () => view.play('idle', true, 12))
    view.blinkSeconds = 0
    view.update(0.1)
    assert.equal(blink.node.active, true)
    assert.equal(blink.parent, talk)
    assert.equal(talk.eyes, false)

    view.update(0.15)
    assert.equal(view.current, idle)
    assert.equal(blink.parent, idle, 'the blink must follow the new head after the talk finishes')
    assert.equal(idle.eyes, false, 'the new body must not show open eyes over the active blink')
    assert.equal(blink.time, 0.25, 'switching bodies must preserve blink progress')

    view.play('leave', false, 24)
    assert.equal(blink.parent, leave)
    assert.equal(leave.eyes, false)
    assert.equal(blink.time, 0.25)
    view.update(0.2)
    assert.equal(blink.node.active, false)
    assert.equal(leave.eyes, true, 'blink completion restores the current body eyes')
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
        result.data = { schemaVersion: 2, id: 'pvz:test', durationSeconds: 2, tracks: [{ id: trackId, zIndex: 0,
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
    const trackNode = head.getTrackNode('face'), replacement = head.getAnimation()
    replacement.tracks[0].keyframes[1].x += 5
    head.replaceAnimation(replacement)
    assert.equal(head.getTrackNode('face'), trackNode, 'animation replacement must preserve attached UI nodes')
    assert.equal(head.timeSeconds, 0.5)
    assert.equal(head.playing, false, 'replacement cannot resume a paused animation')
    const other = player('other', [0, 0])
    head.data.tracks.push(other.data.tracks[0])
    head.views.set('other', other.views.get('other'))
    other.views.get('other').node.setPosition = () => assert.fail('a sprite override must not rebuild unrelated tracks')
    const frame = {}
    head.setTrackSpriteOverride('face', frame)
    assert.equal(head.views.get('face').sprite.spriteFrame, frame)
    head.setTrackSpriteOverride('face', null)
    assert.equal(head.views.get('face').sprite.spriteFrame, head.frames.get('pvz:test'))
    head.data.tracks.pop()
    assert.throws(() => head.replaceAnimation({ ...replacement, tracks: [] }))
    assert.equal(head.getTrackNode('face'), trackNode, 'invalid replacements leave the original intact')

    head.setTrackColorOverride('face', new Color(55, 55, 55))
    head.seek(0.75)
    head.setColorOverride(new Color(128, 128, 128))
    assert.equal(head.views.get('face').sprite.color.r, 28, 'track color survives animation redraws and multiplies the body tint')
    head.setTrackColorOverride('face', null)
    assert.equal(head.views.get('face').sprite.color.r, 128)
    assert.throws(() => head.setTrackColorOverride('missing', new Color()), /unknown reanim track/)

    // Interrupted shots must capture the blended local pose, without applying the stem twice.
    const idle = player('face', [10, 20])
    const shoot = player('face', [70, 80], [110, 120])
    shoot.attachToTrack(body, 'stem')
    shoot.blendFrom(idle, 0.2)
    shoot.play({ loop: false, timeSeconds: 0, rate: 45 / 12, hideOnFinish: false })
    shoot.advance(0.05)
    assert.equal(shoot.blendElapsed, 0.05, 'blend duration is independent of the clip playback rate')
    const visiblePosition = { ...shoot.views.get('face').node.position }
    shoot.blendFrom(shoot, 0.2)
    shoot.play({ loop: false, timeSeconds: 0, rate: 45 / 12, hideOnFinish: false })
    assert.deepEqual(shoot.views.get('face').node.position, visiblePosition, 'repeated shots retain the visible pose')
    shoot.advance(0.05)
    const returning = player('face', [10, 20])
    returning.attachToTrack(body, 'stem')
    returning.blendFrom(shoot, 0.2)
    returning.play({ timeSeconds: 0 })
    assert.deepEqual(returning.views.get('face').node.position, shoot.views.get('face').node.position,
        'switching players also retains an unfinished blend')

    head.data.tracks.length = 0
    blink.seek(0)
    assert.equal(blink.views.get('eyelid').sprite.enabled, false, 'a removed parent track must hide its attachment')
})

test('shooters repeat blinking from the start, skip it during shooting and stop it when firing', () => {
    const module = { exports: {} as Record<string, any> }
    class Color { static WHITE = new Color(); clone() { return new Color() } }
    const code = transpileModule(readFileSync('assets/scripts/client/plants/ShooterView.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) =>
        id === 'cc' ? { Color } : id === '@/client/content/ClientAnimationRegistry' ? animationDefinitions : {} })
    const starts: any[] = []
    const blends: { from: unknown, duration: number }[] = []
    const player = () => ({ setColorOverride() {}, setExtraAdditiveDraw() {}, hide() {}, play() {},
        blendFrom(from: unknown, duration: number) { blends.push({ from, duration }) },
        snapshot: () => ({ playing: true, timeSeconds: 0.375 }) })
    let shooting = false, hidden = false
    const view = Object.assign(Object.create(module.exports.ShooterView.prototype), {
        context: { animations: new ClientAnimationRegistry(presentationFixture) }, animationTarget: 'pvz:peashooter', body: player(), idleHead: player(),
        shootHead: { ...player(), snapshot: () => ({ playing: shooting, visible: shooting }),
            play() { shooting = true } },
        blink: { ...player(), play: (options: unknown) => starts.push(options), hide: () => { hidden = true } },
        blinkAtTick: 400, idleRate: 1,
    })
    view.sync({ eatenFlashCounter: 0 }, { gameplayTick: 399 }, () => {}, false)
    assert.equal(starts.length, 0)
    view.sync({ eatenFlashCounter: 0 }, { gameplayTick: 400 }, () => {}, false)
    view.sync({ eatenFlashCounter: 0 }, { gameplayTick: view.blinkAtTick }, () => {}, false)
    assert.equal(starts.length, 2)
    assert.ok(starts.every(options => options.timeSeconds === 0 && options.rate === 15 / 12 && !options.loop))
    shooting = true
    view.sync({ eatenFlashCounter: 0 }, { gameplayTick: view.blinkAtTick }, () => {}, false)
    assert.equal(starts.length, 2)
    shooting = false
    view.fire()
    assert.equal(hidden, true)
    view.fire()
    view.finishShoot()
    assert.deepEqual(blends, [
        { from: view.idleHead, duration: 0.2 },
        { from: view.shootHead, duration: 0.2 },
        { from: view.shootHead, duration: 0.2 },
    ])
})

test('chewing slows both wall-nut variants and leaves their independent blink running', () => {
    for (const type of ['pvz:wallnut', 'pvz:explodenut']) {
        let rate = 1, cracks = 0, blinkStarts = 0
        const body = { snapshot: () => ({ rate }), setExtraAdditiveDraw() {}, setTrackPrefixVisible() {},
            setTrackSpriteOverride() { cracks++ }, play(options: any) { rate = options.rate } }
        const blink = { setExtraAdditiveDraw() {}, play() { blinkStarts++ } }
        const extras = new Map(['BlinkTwitch', 'BlinkTwice', 'BlinkThrice'].map(name => [name, blink]))
        const { WallNutView } = plantViewModule('WallNutView', body)
        const view = new WallNutView({ node: {}, content: {}, animations: new ClientAnimationRegistry(presentationFixture),
            assets: { wallnutCracked: [{}, {}] }, plant: { typeId: type }, tick: 0 })
        view.extras = extras
        view.blinkAtTick = 100
        const plant = { health: 500, maxHealth: 4000, eatenFlashCounter: 0, recentlyEatenCounter: 50 }
        view.sync(plant, { gameplayTick: 100 }, () => {})
        assert.equal(rate, 0.1 / 12)
        assert.equal(cracks, 1)
        assert.equal(blinkStarts, 1, 'chewing cannot suppress blinks')
        view.sync({ ...plant, recentlyEatenCounter: 0 }, { gameplayTick: 101 }, () => {})
        assert.ok(rate >= 10 / 12 && rate <= 15 / 12)
    }
})

test('potato mine light keeps its own phase, shortens its cycle and shares the body transform', async () => {
    const player = (loadedId: string) => ({
        loadedId, durationSeconds: 1 / 12, rate: 1, timeSeconds: 0, playing: false,
        tracks: new Map<string, boolean>(),
        node: { isValid: true, position: [] as number[], scale: [] as number[],
            setPosition(...values: number[]) { this.position = values },
            setScale(...values: number[]) { this.scale = values } },
        async load(id: string) { this.loadedId = id },
        play(options: any) { this.playing = true; this.rate = options.rate; this.timeSeconds = options.timeSeconds ?? this.timeSeconds },
        snapshot() { return { rate: this.rate, timeSeconds: this.timeSeconds } },
        attachToTrack() {}, hide() {},
        setTrackPrefixVisible(prefix: string, visible: boolean) { this.tracks.set(prefix, visible) },
    })
    const body = player('pvz:potatomine_rise'), blink = player('pvz:potatomine_blink'), glow = player('pvz:potatomine_glow')
    const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
    const { PotatoMineView } = plantViewModule('PotatoMineView', body)
    const view = new PotatoMineView({ node: { isValid: true }, content: { definitions }, animations: new ClientAnimationRegistry(presentationFixture),
        assets: {}, plant: { typeId: 'pvz:potatomine' }, tick: 0 })
    view.extras = new Map([['Blink', blink], ['Glow', glow]])
    view.abilityState = 'rising'
    await view.syncAbility('armed', 2000)
    assert.ok(view.blinkAtTick >= 2400 && view.blinkAtTick < 6400, 'arming starts a fresh first-blink countdown')
    assert.equal(body.tracks.get('anim_glow'), false, 'only the separate light draws the glow')
    assert.equal(glow.tracks.get(''), false, 'the light cannot draw another copy of the body')
    for (const extra of [blink, glow]) {
        assert.deepEqual(extra.node.position, [12, -12])
        assert.deepEqual(extra.node.scale, [0.8, 0.8, 1])
    }
    assert.equal(glow.playing, true)
    assert.equal(glow.timeSeconds, 0)
    glow.timeSeconds = glow.durationSeconds / 4
    const plant = { typeId: 'pvz:potatomine', x: 200, row: 2, ability: { state: 'armed' } }
    view.syncVisuals(plant, { gameplayTick: 100000, zombies: [] })
    const slowRate = glow.rate
    assert.equal(glow.tracks.get('anim_glow'), false)
    const zombie = { typeId: 'pvz:normal', row: 2, x: 220, state: 'walking' }
    view.syncVisuals(plant, { gameplayTick: 100000, zombies: [zombie] })
    assert.ok(Math.abs(glow.rate / slowRate - 10 / 3) < 1e-10)
    assert.equal(glow.timeSeconds, glow.durationSeconds / 4, 'changing distance must preserve normalized phase')
    assert.equal(glow.tracks.get('anim_glow'), true)
    definitions.zombies['pvz:normal'].body.x = 500
    view.syncVisuals(plant, { gameplayTick: 100000, zombies: [zombie] })
    assert.equal(glow.rate, slowRate, 'glow distance uses configured body bounds')
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
        0, { loadedMods: {} }, {}, {}, { children: [] }, {}, {}, {}, { complete: true },
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

function zombieViewFixture() {
    const manifest = JSON.parse(readFileSync('tools/generated/pvz-base/manifest.json', 'utf8'))
    const errors: unknown[] = []
    let loadGate: Promise<void> | null = null
    class Color {
        static WHITE = new Color(255, 255, 255)
        constructor(public r = 0, public g = 0, public b = 0, public a = 255) {}
    }
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
        lastFrameTimeSeconds = 0
        timeSeconds = 0
        paused = false
        color = Color.WHITE
        additive = { enabled: false, color: new Color() }
        constructor(readonly node: Node) {}
        async load(id: string) {
            if (loadGate) await loadGate
            const path = manifest.client.reanim[id]
            assert.ok(path, `missing installed animation ${id}`)
            this.id = id
            const data = JSON.parse(readFileSync(`tools/generated/pvz-base/${path}.json`, 'utf8'))
            this.tracks = data.tracks.map((track: any) => track.id)
            this.lastFrameTimeSeconds = Math.max(...data.tracks.flatMap((track: any) => track.keyframes.map((frame: any) => frame.timeSeconds)))
            for (const track of this.tracks) new Node(track).setParent(this.node)
        }
        attachToTrack(parent: Player, track: string) { assert.ok(parent.tracks.includes(track), `${parent.id} has no ${track}`); this.attachmentTrackId = track }
        reattachAfterRestore(parent: Player) { this.attachToTrack(parent, this.attachmentTrackId!) }
        snapshot() { return { id: this.id, attachmentTrackId: this.attachmentTrackId } }
        restore(value: any) { this.attachmentTrackId = value.attachmentTrackId }
        play(options: any) { this.paused = false; this.timeSeconds = options.timeSeconds ?? this.timeSeconds }
        pause() { this.paused = true }
        hide() {}
        seek(time: number) { this.timeSeconds = time }
        blendFrom() {}
        getTrackNode(id: string) { return this.node.children.find(child => child.name === id) }
        setTrackPrefixVisible(prefix: string, visible: boolean) {
            this.node.children.filter(child => child.name.startsWith(prefix)).forEach(child => { child.active = visible })
        }
        setTrackSpriteOverride() {}
        setExtraAdditiveDraw(enabled: boolean, color: Color) { this.additive = { enabled, color } }
        setColorOverride(color: Color) { this.color = color }
    }
    const uiNode = (options: any) => {
        const node = options.node ?? new Node(options.name)
        node.active = options.active ?? node.active
        if (options.parent) { node.parent = options.parent; options.parent.children.push(node) }
        if (options.position) node.setPosition(options.position.x ?? 0, options.position.y ?? 0)
        return { node }
    }
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/zombies/ZombieView.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    const modules: Record<string, unknown> = {
        cc: { Color, Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/view/uiNode': { uiNode }, '@/client/reanim/ReanimPlayer': { ReanimPlayer: Player },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console: { error: (...args: unknown[]) => errors.push(args) } })
    const create = (typeId = 'pvz:flag') => new module.exports.ZombieView(new Node(), {}, {}, new ClientAnimationRegistry(presentationFixture), new Node(), {}, {}, zombieDefinitions.zombieDefinition(presentationFixture, typeId), undefined, 150)
    const blockLoads = () => {
        let finish!: () => void
        loadGate = new Promise<void>(resolve => { finish = resolve })
        return () => { loadGate = null; finish() }
    }
    return { create, errors, blockLoads }
}

test('flag zombie loads its installed clips and restores attachments through walking, eating, mowing and death', async () => {
    const { create, errors } = zombieViewFixture()
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
    assert.equal(restored.snapshot(1).body.id, 'pvz:zombie_death')
    assert.equal(restored.snapshot(1).flag, undefined)
    assert.deepEqual(errors, [])
})

test('pole vaulter landing holds the final jump pose until its new animation is ready', async () => {
    const { create, blockLoads, errors } = zombieViewFixture()
    const view = create('pvz:pole_vaulter')
    const jump = { state: 'vaulting', animation: 'anim_jump', animationTime: 20, animationSpeed: 2,
        hasHead: true, hasTongue: false, hasArm: true, hitFlashCounter: 0 }
    view.sync(jump)
    await setImmediate()
    const previous = view.player
    const finish = blockLoads()
    const walking = { ...jump, state: 'walking', animation: 'anim_walk', animationTime: 0 }
    view.sync(walking)
    assert.equal(previous.timeSeconds, previous.lastFrameTimeSeconds)
    assert.equal(previous.paused, true)
    assert.equal(previous.node.position.x, 159)
    assert.equal(view.node.children.find((node: any) => node.name === 'ZombieAnimationPending').active, false)
    view.sync({ ...walking, animationTime: 6 })
    finish()
    await setImmediate()
    assert.notEqual(view.player, previous)
    assert.equal(view.player.node.position.x, 9)
    assert.equal(view.player.timeSeconds, 0.5)
    assert.equal(view.player.node.active, true)
    assert.equal(previous.node.active, false)
    assert.deepEqual(errors, [])
})

test('a pole vaulter mowed on landing uses its grounded body even while the walk clip is loading', async () => {
    for (const walkingFrame of [false, true]) {
        const { create, blockLoads, errors } = zombieViewFixture()
        const view = create('pvz:pole_vaulter')
        const jump = { state: 'vaulting', animation: 'anim_jump', animationTime: 41, animationSpeed: 2,
            hasPole: false, hasHead: true, hasTongue: false, hasArm: true, hitFlashCounter: 0 }
        view.sync(jump)
        await setImmediate()
        const previous = view.player
        const finish = blockLoads()
        if (walkingFrame) view.sync({ ...jump, state: 'walking', animation: 'anim_walk', animationTime: 0 })
        const mowed = { ...jump, state: 'mowered', animation: 'mowered', animationTime: 0, animationSpeed: 16 / 12 }
        view.sync(mowed)
        assert.equal(previous.timeSeconds, previous.lastFrameTimeSeconds)
        assert.equal(previous.node.position.x, 159)
        view.sync({ ...mowed, animationTime: 6 })
        finish()
        await setImmediate()
        assert.equal(view.snapshot(1).body.id, 'pvz:pole_vaulter_walk')
        assert.equal(view.snapshot(1).body.attachmentTrackId, 'locator')
        assert.equal(view.player.node.position.x, 9)
        assert.equal(view.player.node.position.y, 19)
        assert.equal(view.player.timeSeconds, 0, 'freeze the grounded pose, not the mower animation time')
        assert.equal(view.mowerDriver.timeSeconds, 0.5, 'catch the driver up to the latest frame')
        assert.equal(view.player.paused, true)
        assert.equal(previous.node.active, false)
        assert.deepEqual(errors, [])
    }
})

test('chilled zombies add the original blue overlay and combine it with hit flashes', async () => {
    const { create, errors } = zombieViewFixture()
    const view = create()
    const zombie = { state: 'walking', animation: 'anim_walk', animationTime: 0, animationSpeed: 1,
        hasHead: true, hasTongue: false, hasArm: true, hitFlashCounter: 0, chilled: true }
    view.sync(zombie)
    await setImmediate()
    for (const player of [view.player, view.flag]) {
        assert.equal(player.color.r, 75)
        assert.equal(player.additive.enabled, true)
        assert.equal(player.additive.color.r, 75)
        assert.equal(player.additive.color.b, 255)
    }
    view.sync({ ...zombie, hitFlashCounter: 5 })
    assert.equal(view.player.additive.color.r, 125)
    assert.equal(view.player.additive.color.b, 255)
    view.sync({ ...zombie, chilled: false })
    assert.equal(view.player.color.r, 255)
    assert.equal(view.player.additive.enabled, false)
    assert.deepEqual(errors, [])
})
