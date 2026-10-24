import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ModAssets } from '@/shared/mod/ModAssets'
import { ModHost } from '@/shared/mod/ModHost'
import { parseModManifest } from '@/shared/mod'
import { DefinitionSources, buildGameplayContent, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { parseReanim } from '@/shared/content/reanim'
import { parseParticle, ParticleSimulation } from '@/shared/content/particle'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { createServerModHost } from '@/server/createModHost'
import { runCommand } from '../server/run-command'

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
function loadHostModule(path: string, modules: Record<string, any> = {}): any {
    const exports = {}
    const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    new Function('exports', 'require', code.outputText)(exports, (id: string) => modules[id] ?? {})
    return exports
}
function loadModModule(entry: string): any {
    const cache = new Map<string, any>()
    const load = (path: string): any => {
        if (cache.has(path)) return cache.get(path)
        const exports: any = {}
        cache.set(path, exports)
        const code = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } })
        new Function('exports', 'require', code.outputText)(exports, (id: string) => load(join(dirname(path), id.replace(/\.js$/, '.ts'))))
        return exports
    }
    return load(entry)
}
function setup(levelId = 'corn:testing') {
    const root = 'mods/corn', files: Record<string, Uint8Array> = {}
    for (const file of readdirSync(root, { recursive: true, withFileTypes: true })) if (file.isFile()) {
        const path = join(file.parentPath, file.name)
        files[relative(root, path)] = new Uint8Array(readFileSync(path))
    }
    const assets = new ModAssets(parseModManifest(json(root + '/mod.json')), files)
    const resources = assets.json('assets/content.json')
    for (const [id, path] of Object.entries(resources.reanim)) {
        const clip = parseReanim(assets.json(path as string))
        assert.equal(clip.id, id)
        for (const track of clip.tracks) for (const frame of track.keyframes) {
            if (frame.sprite) assert.ok(resources.sprites[frame.sprite], `Missing Mod sprite: ${frame.sprite}`)
        }
    }
    for (const [id, path] of Object.entries(resources.particles)) {
        const particle = parseParticle(assets.json(path as string))
        assert.equal(particle.id, id)
        for (const emitter of particle.emitters) assert.ok(resources.sprites[emitter.sprite])
    }
    const sources = new DefinitionSources(), registry = new GameplayRegistry()
    const host = createServerModHost(assets.id, registry, sources)
    loadModModule(root + '/src/server/index.ts').register({ host, assets })
    const content = buildGameplayContent(...(['definitions', 'levels', 'strings'].map(name => json(`tools/content/pvz-base/gameplay/${name}.json`)) as [any, any, any]), sources.sources)
    const presentation = buildPresentationDefinitions(json('tools/content/pvz-base/presentation/definitions.json'), [{ ownerId: assets.id, data: assets.json('assets/presentation.json') }])
    assert.equal(presentation.plants['corn:kernel_pult'].visual.preview, undefined, 'new art must not borrow a base plant atlas cell')
    const create = () => new IntegratedGameServer(content.definitions, content.levels, registry)
    const server = create(), mods = [{ id: assets.id, version: assets.manifest.version, contentHash: assets.manifest.contentHash }]
    server.start({ protocolVersion: 1, type: 'startSession', sequence: 1, levelId, randomSeed: 42, initialMoney: 0, firstAdventure: false, mods })
    const command = (text: string) => {
        server.enqueueDebugCommand(100, text); server.processBoundaryCommands()
        const result = server.drainCommandResults()[0]
        assert.equal(result.debug?.ok, true, JSON.stringify(result))
    }
    runCommand(server, { type: 'completeIntro' })
    if (levelId === 'corn:testing') {
        command('/plant corn:kernel_pult 3 1')
        command('/zombie normal 3 7')
    }
    return { server, create, mods, host, command, content }
}

test('cob explosion and blast mark stay visible until the reference fade window', () => {
    for (const [id, ticks] of [['popcornsplash', 50], ['blastmark', 100]] as const) {
        const simulation = new ParticleSimulation(parseParticle(json(`mods/corn/assets/particles/${id}.json`)), 42)
        simulation.advance(Math.floor(ticks * 0.75))
        assert.ok(simulation.pose().length > 0)
        assert.ok(simulation.pose().every(pose => pose.alpha === 1), 'the native fade starts at 80% of the effect lifetime')
        simulation.advance(Math.floor(ticks * 0.2))
        assert.ok(simulation.pose().every(pose => pose.alpha > 0 && pose.alpha < 1))
        simulation.advance(ticks)
        assert.equal(simulation.pose().length, 0)
    }
})

test('corn owns its lob and butter behavior; flight, stun, pause, death and save restoration use simulation state', () => {
    const { server, create, mods, host, command } = setup()
    try {
        while (server.snapshot().plants[0].behaviorState!.phase !== 'shooting') server.tick()
        const started = server.save()
        started.entities.find(entity => entity.plant)!.plant!.behaviorState!.butter = true
        server.restore(started, 'corn:testing', mods)
        while (server.snapshot().projectiles.length === 0) server.tick()
        const projectile = server.snapshot().projectiles[0]
        assert.equal(projectile.typeId, 'corn:butter')
        const airborne = server.save()
        assert.ok(airborne.entities.find(entity => entity.projectile)!.extensions?.['corn:lob'])
        const restored = create()
        restored.restore(airborne, 'corn:testing', mods)
        let hit = false, risen = false
        for (let ticks = 0; ticks < 150; ticks++) {
            const current = server.tick()
            assert.deepEqual(restored.tick(), current, 'restoring a flying projectile must preserve the exact future')
            if (current.projectiles.some(p => p.y < projectile.y - 50)) risen = true
            if (Object.keys(current.extensions['corn:buttered'] as object).length) { hit = true; break }
        }
        assert.ok(risen, 'the projectile must follow a lob instead of a straight line')
        assert.ok(hit, 'butter must land and stun the target')
        assert.equal(server.snapshot().zombies[0].health, 230)
        const buttered = server.save(), zombieId = server.snapshot().zombies[0].entityId
        assert.equal(buttered.entities.find(entity => entity.entityId === zombieId)!.extensions!['corn:buttered'].ticks, 400)
        runCommand(server, { type: 'pause' })
        const frozen = server.snapshot()
        for (let i = 0; i < 10; i++) server.tick()
        assert.equal(server.snapshot().gameplayTick, frozen.gameplayTick)
        assert.deepEqual(server.snapshot().extensions, frozen.extensions)
        runCommand(server, { type: 'resume' })
        const position = server.snapshot().zombies[0].x
        for (let i = 0; i < 20; i++) server.tick()
        assert.equal(server.snapshot().zombies[0].x, position)
        const remaining = (server.snapshot().extensions['corn:buttered'] as any)[zombieId].ticks
        assert.equal(remaining, 380)
        const saved = server.save()
        const plant = saved.entities.find(entity => entity.plant)!.plant!
        plant.behaviorState!.readyAtTick = saved.gameplayTick + 10000
        server.restore(saved, 'corn:testing', mods)
        for (let i = 0; i < remaining + 20; i++) server.tick()
        assert.deepEqual(server.snapshot().extensions['corn:buttered'], {})
        assert.ok(server.snapshot().zombies[0].x < position, 'walking must resume when the effect expires')
        server.restore(buttered, 'corn:testing', mods)
        command('/damage 9999')
        const deathTime = server.snapshot().zombies[0].animationTime
        server.tick()
        assert.ok(server.snapshot().zombies[0].animationTime > deathTime, 'butter cannot freeze a death animation')
        const invalid = structuredClone(airborne)
        invalid.entities.find(entity => entity.projectile)!.extensions!['corn:lob'].age = -1
        assert.throws(() => server.restore(invalid, 'corn:testing', mods), /Invalid lob age/)
    } finally { host.dispose() }
})

test('kernel shots deal 20 damage without applying butter', () => {
    const { server, host, mods } = setup()
    try {
        while (server.snapshot().plants[0].behaviorState!.phase !== 'shooting') server.tick()
        const saved = server.save()
        saved.entities.find(entity => entity.plant)!.plant!.behaviorState!.butter = false
        server.restore(saved, 'corn:testing', mods)
        for (let i = 0; i < 200 && server.snapshot().zombies[0].health === 270; i++) server.tick()
        assert.equal(server.snapshot().zombies[0].health, 250)
        assert.deepEqual(server.snapshot().extensions['corn:buttered'], {})
    } finally { host.dispose() }
})

test('reference attack clock cycles without targets and an abandoned windup still releases a ballistic shot', () => {
    const { server, mods, host, command } = setup()
    try {
        const empty = server.save()
        empty.entities = empty.entities.filter(entity => !entity.zombie)
        empty.wave.zombieIds = []
        empty.entities.find(entity => entity.plant)!.plant!.behaviorState!.readyAtTick = empty.gameplayTick + 1
        server.restore(empty, 'corn:testing', mods)
        const cycle = server.tick(), ready = cycle.plants[0].behaviorState!.readyAtTick as number
        assert.ok(ready - cycle.gameplayTick >= 286 && ready - cycle.gameplayTick <= 300)
        command('/zombie normal 3 7')
        while (server.snapshot().gameplayTick < ready - 1) server.tick()
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'idle', 'a newly arriving target does not bypass the clock')
        assert.equal(server.tick().plants[0].behaviorState!.phase, 'shooting')
        const windup = server.save()
        windup.entities = windup.entities.filter(entity => !entity.zombie)
        windup.wave.zombieIds = []
        const state = windup.entities.find(entity => entity.plant)!.plant!.behaviorState!
        state.butter = false
        server.restore(windup, 'corn:testing', mods)
        for (let i = 0; i < 28; i++) server.tick()
        assert.equal(server.snapshot().projectiles.length, 0)
        server.tick()
        const fired = server.save().entities.find(entity => entity.projectile)!
        assert.ok(fired, 'the 29 tick release still fires after its target disappears')
        const flight = fired.extensions!['corn:lob'] as any, originX = windup.entities.find(entity => entity.plant)!.position!.x + 19
        assert.equal(flight.velocityX, (700 - originX) / 120)
        for (let i = 0; i < 40; i++) server.tick()
        const advanced = server.save().entities.find(entity => entity.entityId === fired.entityId)!
        const lob = advanced.extensions!['corn:lob'] as any, age = lob.age
        assert.ok(Math.abs(lob.velocityZ - (-7 + age * 0.115)) < 1e-10)
        assert.ok(Math.abs(advanced.position!.y - (lob.baseY - 7 * age + 0.115 * age * (age + 1) / 2)) < 1e-9)
        assert.ok(Math.abs(advanced.position!.x - (originX + flight.velocityX * age)) < 1e-9)
        for (let i = 0; i < 140 && server.snapshot().projectiles.length; i++) server.tick()
        assert.equal(server.snapshot().projectiles.length, 0, 'a missed lob ends on the ground rather than at a fixed flight duration')
    } finally { host.dispose() }
})

test('reference lob collision waits for descending height and selects the leftmost overlapping body', () => {
    const { server, host, mods, command } = setup()
    try {
        while (server.snapshot().projectiles.length === 0) server.tick()
        command('/zombie normal 3 7')
        const saved = server.save(), shot = saved.entities.find(entity => entity.projectile)!
        shot.projectile!.typeId = 'corn:kernel'
        const lob = shot.extensions!['corn:lob'] as any
        Object.assign(lob, { age: 30, z: -31, velocityX: 0, velocityZ: 0 })
        saved.entities.find(entity => entity.plant)!.plant!.behaviorState!.readyAtTick = saved.gameplayTick + 10000
        const zombies = saved.entities.filter(entity => entity.zombie)
        for (const [index, zombie] of zombies.entries()) zombie.position!.x = shot.position!.x - 36 + (index === 1 ? -5 : 10)
        server.restore(saved, 'corn:testing', mods)
        assert.equal(server.tick().projectiles.length, 1, 'kernel cannot collide below Z=-30 after the first 20 ticks')
        const descending = server.save()
        descending.entities.find(entity => entity.projectile)!.extensions!['corn:lob'].z = -29
        server.restore(descending, 'corn:testing', mods)
        const hit = server.tick()
        assert.equal(hit.projectiles.length, 0)
        assert.equal(hit.zombies.find(zombie => zombie.entityId === zombies[0].entityId)!.health, 270)
        assert.equal(hit.zombies.find(zombie => zombie.entityId === zombies[1].entityId)!.health, 250)
    } finally { host.dispose() }
})

test('butter damages vaulting zombies without stunning them; grounded repeat hits refresh the full duration', () => {
    const { server, host, mods, command } = setup()
    try {
        while (server.snapshot().projectiles.length === 0) server.tick()
        command('/zombie pole_vaulter 3 7')
        const saved = server.save(), shot = saved.entities.find(entity => entity.projectile)!
        shot.projectile!.typeId = 'corn:butter'
        Object.assign(shot.extensions!['corn:lob'], { age: 30, z: 0, velocityX: 0, velocityZ: 0 })
        const target = saved.entities.find(entity => entity.zombie?.typeId === 'pvz:pole_vaulter')!
        saved.entities = saved.entities.filter(entity => !entity.zombie || entity === target)
        saved.wave.zombieIds = []
        Object.assign(target.zombie!, { state: 'vaulting', animation: 'anim_jump', animationTime: 1, speedPerTick: 0, hasPole: false })
        target.position!.x = shot.position!.x - 36
        server.restore(saved, 'corn:testing', mods)
        const airborne = server.tick()
        assert.equal(airborne.zombies[0].health, 460)
        assert.deepEqual(airborne.extensions['corn:buttered'], {}, 'CanBeFrozen excludes a vault in progress')
        Object.assign(target.zombie!, { state: 'walking', animation: 'anim_walk', animationTime: 0, speedPerTick: 0.3 })
        target.extensions = { 'corn:buttered': { ticks: 120 } }
        server.restore(saved, 'corn:testing', mods)
        const repeated = server.tick()
        assert.equal((repeated.extensions['corn:buttered'] as any)[target.entityId].ticks, 400)
        assert.equal(repeated.zombies[0].health, 460)
    } finally { host.dispose() }
})

test('client butter visuals and cannon mouse/touch input preserve death playback and collectible priority', async () => {
    class Transform {
        anchor: number[] = []
        convertToNodeSpaceAR(point: any) { return point }
        setAnchorPoint(...value: number[]) { this.anchor = value }
        hitTest() { return false }
    }
    class Sprite { static SizeMode = { RAW: 0 }; spriteFrame = { originalSize: { width: 49, height: 50 } } }
    class Node {
        active = true; children: Node[] = []; position: any; scale: any; angle = 0
        transform = new Transform(); sprite = new Sprite()
        constructor(readonly name = '') {}
        getComponent(type: any) { return type === Transform ? this.transform : this.sprite }
        addComponent(type: any) { const component = new type(); component.node = this; return component }
        setPosition(...args: any[]) { this.position = args.length === 1 ? args[0] : { x: args[0], y: args[1] } }
        setScale(...args: any[]) { this.scale = args }
        setSiblingIndex() {}
    }
    class Player {
        time = 0; visible = true; id = ''; durationSeconds = 1; lastFrameTimeSeconds = 1; parent: any; blend: any
        track = new Node()
        trackColor: any = { r: 255, g: 255, b: 255, a: 255 }
        color: any
        async load(id: string) {
            this.id = id
            const data = json('mods/corn/' + json('mods/corn/assets/content.json').reanim[id])
            this.durationSeconds = data.durationSeconds
            this.lastFrameTimeSeconds = Math.max(...data.tracks.flatMap((track: any) => track.keyframes.map((frame: any) => frame.timeSeconds)))
        }
        advance(dt: number) { this.time += dt; this.applyPose() }
        hide() { this.visible = false }
        play() { this.visible = true }
        seek(time: number) { this.time = time; this.applyPose() }
        blendFrom(previous: any) { this.blend = previous }
        attachToTrack(parent: any, track: string) {
            const data = json('mods/corn/' + json('mods/corn/assets/content.json').reanim[parent.id])
            assert.ok(data.tracks.some((value: any) => value.id === track))
            this.parent = parent
        }
        getTrackNode(id: string) { assert.equal(id, 'CobCannon_cob'); return this.track }
        applyPose() { (this.track.sprite as any).color = this.trackColor }
        setTrackColorOverride(id: string, color: any) { assert.equal(id, 'CobCannon_cob'); this.trackColor = color; this.applyPose() }
        setColorOverride(color: any) { this.color = color }
        setTrackPrefixVisible() {}
        setExtraAdditiveDraw() {}
        snapshot() { return { visible: this.visible } }
        restore(saved: any) { this.visible = saved.visible }
        reattachAfterRestore(parent: any) { this.parent = parent }
    }
    class ZombieView {
        node = new Node(); player = new Player(); flag = new Player()
        sync() {}
        async load() { this.player = new Player() }
        getTrackWorldPosition() { return { x: 80, y: -40 } }
    }
    class Renderer { sync() {}; playEvents() {}; syncLayerOrder() {} }
    class Preview { load() {}; initialize() {} }
    const fallback: string[] = []
    let mobile = false
    const BaseInput = loadHostModule('level/LevelInputPresenter', {
        cc: { UITransform: Transform, EventMouse: class {} },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
        '@/platform/Haptics': { Haptics: { play() {} } },
    }).LevelInputPresenter
    class LevelInput extends BaseInput {
        onMouseDown() { fallback.push('mouse') }
        onTouchStart(event: any) { fallback.push('touch'); super.onTouchStart(event) }
        start() { this.started = true }
        selectSeedPacket() { fallback.push('select') }
    }
    class LevelHud { syncPreviews(this: any) { if (this.mobileGridGuide) this.mobileGridGuide.active = false }; isPointerOverItem() {}; syncAdvice() {} }
    class LevelView { syncShake() {} }
    const { LevelSeedBank } = loadHostModule('level/LevelSeedBank', {
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
    })
    const requested: string[] = [], frames: any[] = [], factories = new Map<string, any>()
    const content = { registry: { resolve: (_kind: string, id: string) => id },
        loader: { load: async (id: string) => { requested.push(id); return { id } } } }
    const modules = {
        'content/definitions': { register() {} }, 'content/resources': { register() {} },
        'cc': { Sprite, Color: class { constructor(readonly r: number, readonly g: number, readonly b: number, readonly a = 255) {} }, UITransform: Transform,
            Vec3: class { constructor(readonly x: number, readonly y: number) {} }, isValid: () => true },
        'client/view/uiNode': { uiNode: (options: any) => {
            const node = new Node(options.name)
            Object.assign(node, { parent: options.parent })
            if (options.anchor) node.transform.setAnchorPoint(options.anchor.x, options.anchor.y)
            if (options.sprite) frames.push(options.sprite.frame)
            options.parent?.children.push(node)
            return { node }
        } },
        'client/reanim/ReanimPlayer': { ReanimPlayer: Player },
        'client/game/loadIntegratedGameContent': { loadIntegratedGameContent: async () => content },
        'client/sound/LegacySoundSystem': { SoundLoader: { load() {} } },
        'client/views': { plants: { register: (id: string, factory: any) => factories.set(id, factory) } },
        'client/hud/PlantPreview': { PlantPreview: Preview },
        'client/hud/SeedPacketRenderer': { SeedPacketRenderer: { _drawPlantIcon() {}, drawSeedPacket() {} } },
        'client/zombies/ZombieView': { ZombieView }, 'client/level/LevelEntityRenderer': { LevelEntityRenderer: Renderer },
        'client/level/LevelInputPresenter': { LevelInputPresenter: LevelInput },
        'client/level/LevelHudPresenter': { LevelHudPresenter: LevelHud },
        'client/level/LevelSeedBank': { LevelSeedBank },
        'client/level/LevelView': { LevelView },
        'platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
        'platform/Haptics': { Haptics: { play() {} } },
    }
    const host = new ModHost('corn:plants', modules)
    try {
        loadModModule('mods/corn/src/client/index.ts').register({ host, assets: { id: 'corn:plants', json: (path: string) => json('mods/corn/' + path) } })
        const view = new ZombieView(), zombie = { entityId: 1, hasHead: true, state: 'walking' }
        const sync = () => (view.sync as any)(zombie, { extensions: { 'corn:buttered': { 1: { ticks: 400 } } } })
        sync()
        await new Promise(resolve => setImmediate(resolve))
        assert.deepEqual(requested, ['corn:cornpult_butter_splat'])
        assert.equal(frames[0].id, 'corn:cornpult_butter_splat')
        const overlay = view.node.children[0]
        assert.deepEqual(overlay.transform.anchor, [0, 1])
        assert.deepEqual({ ...overlay.position }, { x: 50.5, y: -3.5 })
        view.player.advance(1)
        assert.equal(view.player.time, 0)
        await view.load()
        view.player.advance(1)
        assert.equal(view.player.time, 0, 'an asynchronous body swap must stay frozen')
        zombie.state = 'dying'; sync()
        assert.equal(overlay.active, false)
        view.player.advance(1)
        assert.equal(view.player.time, 1, 'dying bodies must advance normally')

        const cannon = { entityId: 2, typeId: 'corn:cob_cannon', x: 80, y: 280, behaviorState: { phase: 'ready' } }
        const snapshot: any = { phase: 'gameplay', result: 'playing', paused: false, plants: [cannon], items: [], seedPackets: [], cursor: { mode: 'none' }, extensions: {} }
        const commands: any[] = [], input: any = new LevelInput()
        let pointer: any
        Object.assign(input, {
            node: { isValid: true }, enabled: true,
            buttons: [{ canInteract: () => true, interactable: true, node: { activeInHierarchy: true, getComponent: () => new Transform() } }],
            boardPixel: (event: any) => event.point,
            onMenu: () => fallback.push('menu'),
            view: { introComplete: true, setPointer(value?: any) { pointer = value }, resetCursor() {} },
            game: { render: () => snapshot, definitions: { ...json('mods/corn/assets/gameplay.json'), items: { sun: { width: 60, height: 60 } } }, command: (command: any) => commands.push(command) },
        })
        const event = (x: number, y: number, button = 0, id = 1) => ({ point: { x, y }, getLocation: () => ({ x, y }),
            touch: { getID: () => id }, windowId: 0, getButton: () => button, propagationStopped: false })
        input.onMouseDown(event(120, 320))
        assert.deepEqual(commands.pop(), { type: 'mod', id: 'corn:aim_cannon', data: { x: 120, y: 320, entityId: 2 } })
        snapshot.extensions['corn:cob_aim'] = { 2: { startedAtTick: 0, x: 120, y: 320 } }
        input.onMouseDown(event(600, 420))
        assert.deepEqual(commands.pop(), { type: 'mod', id: 'corn:fire_cannon', data: { x: 600, y: 420 } })
        input.onMouseDown(event(600, 420, 2))
        assert.deepEqual(commands.pop(), { type: 'clearCursor' })
        input.start()
        assert.equal(input.buttons[0].canInteract(), true, 'native aiming still allows Menu and seed packets')
        input.onMenu()
        assert.deepEqual(commands.pop(), { type: 'clearCursor' })
        assert.equal(fallback.pop(), 'menu')
        input.onMouseDown(event(500, 30))
        assert.deepEqual(commands.pop(), { type: 'clearCursor' })
        assert.equal(fallback.pop(), 'mouse', 'top-bar clicks clear aiming and continue to normal UI handling')
        snapshot.items = [{ typeId: 'sun', state: 'falling', x: 550, y: 400 }]
        input.onMouseDown(event(600, 420))
        assert.deepEqual(fallback, ['mouse'], 'sun collection keeps priority while aiming')
        assert.equal(commands.length, 0)
        mobile = true
        input.game.command = (command: any) => {
            commands.push(command)
            if (command.type === 'clearCursor' || command.id === 'corn:fire_cannon') snapshot.extensions['corn:cob_aim'] = {}
            if (command.id === 'corn:aim_cannon') snapshot.extensions['corn:cob_aim'] = { [command.data.entityId]: {} }
            if (command.type === 'collectItemAt') snapshot.items[0].state = 'collecting'
        }
        input.onTouchStart(event(600, 420))
        assert.deepEqual(fallback, ['mouse', 'touch'])
        assert.equal(commands.pop().type, 'collectItemAt', 'mobile collecting still takes priority over aiming')
        input.onTouchEnd(event(600, 420))
        snapshot.items = []
        input.onTouchStart(event(600, 420))
        assert.equal(commands.length, 0, 'touch down only positions the target')
        input.onPointerMove(event(500, 400))
        input.onTouchStart(event(120, 320, 0, 2))
        input.onTouchEnd(event(120, 320, 0, 2))
        assert.equal(commands.length, 0, 'another finger cannot select or fire')
        input.onTouchEnd(event(0, 0))
        assert.deepEqual(commands.pop(), { type: 'mod', id: 'corn:fire_cannon', data: { x: 500, y: 400 } }, 'release uses the last tracked aim point')
        assert.equal(pointer, undefined)

        const pick = () => {
            input.onTouchStart(event(120, 320))
            assert.equal(commands.pop().id, 'corn:aim_cannon')
            assert.equal(pointer, undefined, 'the source cannon hides the target like a source seed packet')
        }
        pick()
        input.onTouchEnd(event(120, 320))
        assert.ok(snapshot.extensions['corn:cob_aim'][2], 'tapping the source keeps it selected')
        input.onTouchStart(event(120, 320))
        input.onTouchEnd(event(120, 320))
        assert.deepEqual(commands.pop(), { type: 'clearCursor' }, 'tapping the selected source again cancels')

        pick()
        input.onPointerMove(event(600, 420))
        assert.deepEqual(pointer, { x: 600, y: 420 })
        assert.equal(commands.length, 0, 'dragging previews the target without firing')
        input.onTouchEnd(event(0, 0))
        assert.equal(commands.pop().id, 'corn:fire_cannon', 'dragging directly from the source fires on release')

        pick()
        input.onPointerMove(event(600, 420))
        input.onPointerMove(event(120, 320))
        input.onTouchEnd(event(120, 320))
        assert.deepEqual(commands.pop(), { type: 'clearCursor' }, 'dragging back to the source cancels')
        pick()
        input.onPointerMove(event(900, 420))
        input.onTouchEnd(event(0, 0))
        assert.deepEqual(commands.pop(), { type: 'clearCursor' }, 'releasing outside the targeting area cancels')

        pick()
        input.onPointerMove(event(600, 420))
        input.suspend()
        input.onTouchEnd(event(600, 420))
        input.resume()
        input.onTouchEnd(event(600, 420))
        assert.equal(commands.length, 0, 'suspending discards the active gesture')
        assert.equal(input.buttons[0].canInteract(), true)
        snapshot.paused = true
        input.onTouchStart(event(120, 320))
        assert.equal(commands.length, 0, 'paused input cannot aim or fire')
        snapshot.extensions['corn:cob_aim'] = {}

        const plant: any = { ...cannon, eatenFlashCounter: 0, behaviorState: { phase: 'ready', startedAtTick: 625 } }
        const cannonView = await factories.get('corn:cob_cannon')({ node: new Node(), plant, content, tick: 625,
            animations: { nextPlantBlinkTicks: () => 1000 } })
        assert.deepEqual(Object.keys(cannonView.players).filter(name => cannonView.players[name].visible), ['ready'])
        assert.equal(cannonView.players.blink.parent, cannonView.players.ready)
        const flash = cannonView.players.ready.track.sprite.color.r
        assert.ok(flash < 255)
        cannonView.players.ready.advance(0.01)
        assert.equal(cannonView.players.ready.track.sprite.color.r, flash, 'Reanim advance cannot overwrite the ready cob flash')
        cannonView.sync(plant, { gameplayTick: 637 })
        assert.notEqual(cannonView.players.ready.track.sprite.color.r, flash, 'a loaded cob must flash as the game clock advances')
        plant.behaviorState = { phase: 'firing', startedAtTick: 625 }
        cannonView.sync(plant, { gameplayTick: 830 })
        assert.equal(cannonView.players.shoot.blend, cannonView.players.ready)
        assert.equal(cannonView.players.ready.visible, false)
        assert.ok(cannonView.players.shoot.time > 2 && cannonView.players.shoot.time < 2.05)
        const saved = cannonView.snapshot(2)
        cannonView.restore(saved)
        assert.equal(cannonView.phase, 'firing')
        assert.equal(cannonView.players.blink.parent, cannonView.players.shoot)
        plant.behaviorState = { phase: 'arming', startedAtTick: 975 }
        cannonView.sync(plant, { gameplayTick: 975 })
        assert.equal(cannonView.players.shoot.visible, false)
        assert.equal(cannonView.players.body.visible, true)

        const bank: any = Object.create(LevelSeedBank.prototype), states: any[] = [], warnings: string[] = []
        const tooltip = { set warning(value: string) { warnings.push(value) } }
        bank.packets = [{ seedId: 'corn:cob_cannon', tooltip, view: { sync: (state: any) => states.push(state) }, button: {} }]
        const strings = json('mods/corn/assets/presentation.json').strings
        bank.options = { ui: { text: (key: string) => strings[key] ?? key }, content: { definitions: json('mods/corn/assets/gameplay.json') }, presentation: {} }
        const packets = { extensions: {}, availableSun: 2000, phase: 'gameplay', result: 'playing', cursor: { mode: 'none' },
            seedPackets: [{ seedId: 'corn:cob_cannon', ready: true, cooldownRemaining: 0 }] }
        bank.sync(packets, [], true, null)
        assert.equal(states.pop().active, false, 'a missing base pair dims the upgrade packet')
        assert.deepEqual(warnings.splice(0), ['requires 2 kernel-pults'], 'tooltip must receive its final warning exactly once per sync')
        assert.equal(packets.seedPackets[0].ready, true, 'client presentation cannot alter the authoritative cooldown')
        const shown: any[] = [], hud: any = new LevelHud()
        hud.seedBank = bank; hud.advice = { show: (...args: any[]) => shown.push(args) }
        const rejection = { type: 'corn:advice', data: { key: 'corn:needs_kernel_pults', style: 'hint-long' } }
        hud.syncAdvice({}, [rejection])
        assert.deepEqual(shown.pop(), ['Plant a pair of kernel-pults first!', 'hint-long'])
        const { AdviceWidget } = loadHostModule('hud/advice/AdviceWidget')
        const advice = Object.assign(Object.create(AdviceWidget.prototype), {
            node: { isValid: true }, _label: {}, _applyLayout() {}, _drawBackdrop() {},
        })
        advice.show('Plant a pair of kernel-pults first!', 'hint-long')
        assert.equal(advice._durationTicks, 1500)
        advice.show('Can only be planted on a pair of kernel-pults', 'hint')
        assert.equal(advice._durationTicks, 500)
        Object.assign(snapshot, { paused: false, seedPackets: packets.seedPackets, availableSun: 2000 })
        const sounds: string[] = []
        const { LevelAudioPresenter } = loadHostModule('level/LevelAudioPresenter', {
            '@/client/sound/LegacySoundSystem': { SoundLoader: { play: (id: string) => sounds.push(id) } },
        })
        input.view.audio = new LevelAudioPresenter({}, {})
        input.selectSeedPacket('corn:cob_cannon')
        assert.equal(sounds.length, 0, 'selection waits for the authoritative rejection rather than playing seed pickup')
        assert.deepEqual(commands.pop(), { type: 'selectSeed', seedId: 'corn:cob_cannon' })
        const renderer: any = new Renderer(); renderer.audio = input.view.audio
        renderer.playEvents(snapshot, [rejection])
        assert.deepEqual(sounds, [], 'invalid planting advice is silent')
        renderer.playEvents(snapshot, [{ type: 'corn:sound', data: { id: 'buzzer' } }])
        assert.deepEqual(sounds.splice(0), ['buzzer'], 'the real audio presenter must play exactly one rejection sound')
        packets.availableSun = 499; bank.sync(packets, [], true, null)
        assert.deepEqual(warnings.splice(0), ['NOT_ENOUGH_SUN'])
        packets.seedPackets[0].ready = false; bank.sync(packets, [], true, null)
        assert.deepEqual(warnings.splice(0), ['WAITING_FOR_SEED'])
        packets.seedPackets[0].ready = true
        snapshot.extensions['corn:cob_upgrade'] = { targets: [3, 4] }
        bank.sync(snapshot, [], true, null)
        assert.equal(states.pop().active, true)
        input.selectSeedPacket('corn:cob_cannon')
        assert.equal(fallback.pop(), 'select', 'a valid pair keeps normal seed selection')

        mobile = false
        Object.assign(hud, { pointer: { x: 173, y: 330 }, hoverClient: {},
            cursorPreview: { parent: { children: [] }, position: { x: 138, y: -270 }, setPosition(x: number, y: number) { this.position = { x, y } } },
            gridPreview: { position: { x: 0, y: 0 }, setPosition(x: number, y: number) { this.position = { x, y } } }, mobileGridGuide: {},
            content: { definitions: { boards: { day: { origin: { x: 80, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 } } } },
            level: { board: 'day', activeRows: [2] } })
        hud.syncPreviews({ ...snapshot, cursor: { mode: 'seed', seedId: 'corn:cob_cannon' },
            plants: [{ entityId: 3, row: 2, column: 0 }, { entityId: 4, row: 2, column: 1 }] })
        assert.deepEqual(hud.cursorPreview.position, { x: 138, y: -270 }, 'the held cannon must keep following the pointer')
        assert.deepEqual(hud.gridPreview.position, { x: 80, y: -280 }, 'only the planting ghost snaps to the left base cell')
        const aiming = { ...snapshot, cursor: { mode: 'none' }, extensions: { 'corn:cob_aim': { 3: {} } } }
        for (const [x, y, valid] of [[200, 300, true], [200, 70, false], [-1, 300, false], [800, 300, false], [200, 600, false]]) {
            hud.pointer = { x, y }
            hud.syncPreviews(aiming)
            assert.equal(!!hud.isPointerOverItem(aiming), valid, `aim cursor at ${x},${y}`)
            assert.equal(hud.hoverClient.cursor, valid ? 'none' : undefined)
        }

        mobile = true
        const guideRects: number[][] = []
        const graphics = { fillColor: undefined as any, clear() { guideRects.length = 0 }, fillRect(...rect: number[]) { guideRects.push(rect) } }
        hud.mobileGridGuide = { active: false, getComponent: () => graphics }
        hud.pointer = { x: 173, y: 330 }
        hud.syncPreviews({ ...snapshot, cursor: { mode: 'seed', seedId: 'corn:cob_cannon' },
            plants: [{ entityId: 3, row: 2, column: 0 }, { entityId: 4, row: 2, column: 1 }] })
        assert.deepEqual(guideRects, [[80, -380, 720, 100], [80, -580, 160, 500]], 'upgrade planting highlights both columns')
        hud.pointer = { x: 90, y: 300 }
        hud.syncPreviews(aiming)
        assert.equal(hud.mobileGridGuide.active, true)
        assert.equal(graphics.fillColor.a, 72)
        assert.deepEqual(guideRects, [[80, -380, 720, 100], [80, -580, 80, 500]], 'aiming uses the planting guide with a single target column')
        hud.pointer = { x: 280, y: 300 }
        hud.syncPreviews(aiming)
        assert.deepEqual(guideRects[1], [240, -580, 80, 500], 'the cross follows the dragged target cell')
        for (const point of [undefined, { x: 40, y: 300 }, { x: 200, y: 200 }, { x: 800, y: 300 }]) {
            hud.pointer = point
            hud.syncPreviews(aiming)
            assert.equal(hud.mobileGridGuide.active, false, 'no cross without a finger or on an invalid cell')
        }
        hud.pointer = { x: 280, y: 300 }
        hud.syncPreviews({ ...aiming, paused: true })
        assert.equal(hud.mobileGridGuide.active, false)
        hud.syncPreviews({ ...aiming, extensions: {} })
        assert.equal(hud.mobileGridGuide.active, false, 'firing or cancelling removes the cross')
        mobile = false

        const kernel = { entityId: 3, typeId: 'corn:kernel_pult', eatenFlashCounter: 0, behaviorState: { phase: 'idle', released: false } }
        const kernelView = await factories.get('corn:kernel_pult')({ node: new Node(), plant: kernel, content, tick: 0, assets: { shadow: {} },
            animations: { nextPlantBlinkTicks: () => 1000 } })
        const world = { gameplayTick: 45, cursor: { mode: 'seed', seedId: 'corn:cob_cannon' }, extensions: { 'corn:cob_upgrade': { targets: [3, 4] } } }
        kernelView.sync(kernel, world)
        assert.equal(kernelView.players.body.color.r, 55, 'both eligible bases flash at the original 90 tick period')
        world.cursor.mode = 'none'; kernelView.sync(kernel, world)
        assert.equal(kernelView.players.body.color.r, 255, 'cancelling the upgrade restores the normal plant tint')
    } finally { host.dispose() }
})

test('CLI creates initialized cannons without bases and allows overlaps without consuming existing plants', () => {
    const { server, host, mods, command } = setup('corn:cannon_testing')
    try {
        runCommand(server, { type: 'pause' })
        command('/sun set 0')
        const before = server.snapshot()
        command('/plant corn:cob_cannon 1 9')
        command('/plant corn:kernel_pult 3 1')
        command('/plant corn:kernel_pult 3 2')
        const bases = server.snapshot().plants.filter(plant => plant.typeId === 'corn:kernel_pult').map(plant => plant.entityId)
        command('/plant corn:cob_cannon 3 1')
        command('/plant corn:cob_cannon 3 1')
        const after = server.snapshot()
        assert.equal(after.plants.length, 5)
        assert.deepEqual(after.plants.filter(plant => plant.typeId === 'corn:kernel_pult').map(plant => plant.entityId), bases)
        assert.ok(after.plants.filter(plant => plant.typeId === 'corn:cob_cannon').every(plant => plant.behaviorState!.phase === 'arming'))
        assert.equal(after.sun, 0)
        assert.equal(after.gameplayTick, before.gameplayTick)
        assert.deepEqual(after.seedPackets, before.seedPackets)
        assert.equal(server.drainEvents().some(event => event.type === 'corn:advice' || event.type === 'corn:sound'), false)
        server.restore(server.save(), 'corn:cannon_testing', mods)
        assert.deepEqual(server.snapshot(), after)
    } finally { host.dispose() }
})

test('cannon upgrades either half of a horizontal pair, spends once, reserves both cells and preserves bases on rejection', () => {
    const { server, host, mods, command } = setup('corn:cannon_testing')
    try {
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'corn:cob_cannon' }), 'seed-not-available')
        assert.deepEqual(server.drainEvents().find(event => event.type === 'corn:advice')?.data,
            { key: 'corn:needs_kernel_pults', style: 'hint-long' })
        const seen = server.save()
        server.restore(seen, 'corn:cannon_testing', mods)
        runCommand(server, { type: 'selectSeed', seedId: 'corn:cob_cannon' })
        const repeated = server.drainEvents()
        assert.equal(repeated.filter(event => event.type === 'corn:advice').length, 0, 'advice remains shown after restoring')
        assert.equal(repeated.filter(event => event.type === 'corn:sound' && event.data.id === 'buzzer').length, 1, 'each disabled packet click still plays buzzer')
        assert.equal(server.snapshot().cursor.mode, 'none')
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), 'no-seed-selected')
        assert.equal(server.snapshot().sun, 2000)
        command('/plant corn:kernel_pult 3 1')
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'corn:cob_cannon' }), 'seed-not-available', 'one base is insufficient')
        command('/plant corn:kernel_pult 3 2')
        const bases = server.snapshot().plants.map(plant => plant.entityId)
        assert.deepEqual((server.snapshot().extensions['corn:cob_upgrade'] as any).targets, bases)
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'corn:cob_cannon' }), undefined)
        server.drainEvents()
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 5 }), 'cell-occupied')
            const events = server.drainEvents()
            assert.equal(events.filter(event => event.type === 'corn:advice').length, attempt === 0 ? 1 : 0)
            assert.equal(events.filter(event => event.type === 'corn:sound').length, 0, 'illegal planting positions do not play buzzer')
        }
        const poor = server.save()
        poor.economy.sun = 499
        server.restore(poor, 'corn:cannon_testing', mods)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), 'not-enough-sun')
        assert.deepEqual(server.snapshot().plants.map(plant => plant.entityId), bases)
        const rich = server.save(); rich.economy.sun = 2000
        server.restore(rich, 'corn:cannon_testing', mods)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
        const upgraded = server.snapshot()
        assert.equal(upgraded.plants.length, 1)
        assert.equal(upgraded.plants[0].typeId, 'corn:cob_cannon')
        assert.equal(upgraded.plants[0].column, 0, 'clicking the right base anchors the cannon on the left')
        assert.equal(upgraded.sun, 1500)
        assert.equal(upgraded.seedPackets.find(packet => packet.seedId === 'corn:cob_cannon')!.cooldownRemaining, 5000)
        runCommand(server, { type: 'selectSeed', seedId: 'corn:kernel_pult' })
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), 'cell-occupied')
        assert.equal(server.snapshot().sun, 1500)
        const saved = server.save(); server.restore(saved, 'corn:cannon_testing', mods)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), 'cell-occupied', 'the second cell remains occupied after restoring')
    } finally { host.dispose() }
})

test('cannon follows reference arming, guarded aiming, release and recharge; a restored shell burns only the blast area', () => {
    const { server, create, host, mods, command } = setup('corn:cannon_testing')
    try {
        command('/plant corn:kernel_pult 3 1'); command('/plant corn:kernel_pult 3 2')
        runCommand(server, { type: 'selectSeed', seedId: 'corn:cob_cannon' })
        runCommand(server, { type: 'placePlant', row: 2, column: 0 })
        const isolated = server.save()
        isolated.entities = isolated.entities.filter(entity => !entity.zombie)
        Object.assign(isolated.wave, { index: 0, nextWaveAtTick: 100000, zombieIds: [] })
        server.restore(isolated, 'corn:cannon_testing', mods)
        for (let i = 0; i < 499; i++) server.tick()
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'arming')
        assert.equal(server.tick().plants[0].behaviorState!.phase, 'loading')
        for (let i = 0; i < 124; i++) server.tick()
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'loading')
        assert.equal(server.tick().plants[0].behaviorState!.phase, 'ready')
        const cannon = server.snapshot().plants[0]
        const aim = { type: 'mod', id: 'corn:aim_cannon', data: { entityId: cannon.entityId, x: cannon.x + 40, y: cannon.y + 40 } } as const
        const stationaryTick = server.snapshot().gameplayTick
        server.enqueueCommand(500, aim)
        assert.equal(server.processBoundaryCommands(true), true, 'aiming must work through the zero-speed input boundary')
        assert.equal(server.drainCommandResults()[0].rejection, undefined)
        assert.equal(server.snapshot().gameplayTick, stationaryTick)
        const selected = server.save()
        server.restore(selected, 'corn:cannon_testing', mods)
        assert.equal(Object.keys(server.snapshot().extensions['corn:cob_aim'] as object).length, 1)
        runCommand(server, { type: 'mod', id: 'corn:fire_cannon', data: { x: cannon.x + 40, y: cannon.y + 40 } })
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'ready', 'the 30 tick, 100px guard rejects an accidental second click')
        runCommand(server, { type: 'pause' })
        assert.equal(runCommand(server, { type: 'mod', id: 'corn:fire_cannon', data: { x: 600, y: 420 } }), 'game-paused')
        runCommand(server, { type: 'resume' })
        runCommand(server, { type: 'clearCursor' })
        assert.deepEqual(server.snapshot().extensions['corn:cob_aim'], {})
        runCommand(server, aim)
        server.enqueueCommand(501, { type: 'mod', id: 'corn:fire_cannon', data: { x: 600, y: 420 } })
        assert.equal(server.processBoundaryCommands(true), true)
        assert.equal(server.drainCommandResults()[0].rejection, undefined)
        assert.equal(server.snapshot().gameplayTick, stationaryTick, 'firing at zero speed changes state without advancing the shell')
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'firing')
        for (let i = 0; i < 204; i++) server.tick()
        assert.equal(server.snapshot().projectiles.length, 0)
        const released = server.tick()
        assert.equal(released.projectiles[0].typeId, 'corn:cob')
        assert.ok(released.projectiles[0].y < cannon.y - 184)
        command('/zombie normal 3 8'); command('/zombie buckethead 4 8'); command('/zombie normal 5 8'); command('/zombie normal 2 8')
        const targets = server.snapshot().zombies
        const flying = server.save(), restored = create()
        restored.restore(flying, 'corn:cannon_testing', mods)
        let crossed = false, hit = false
        for (let i = 0; i < 200; i++) {
            const frame = server.tick()
            assert.deepEqual(restored.tick(), frame)
            if (frame.projectiles[0]?.row === 3 && frame.projectiles[0]?.x > 500) crossed = true
            if (frame.projectiles.length === 0) { hit = true; break }
        }
        assert.ok(crossed, 'the rising shell must reappear above the target row and fall there')
        assert.ok(hit)
        for (const zombie of targets.filter(zombie => zombie.row >= 2)) {
            assert.ok(!server.snapshot().zombies.some(value => value.entityId === zombie.entityId), 'the three-row blast chars targets in radius')
        }
        assert.ok(server.snapshot().zombies.some(value => value.entityId === targets.find(value => value.row === 1)!.entityId), 'targets outside the row range survive')
        const beforeRecharge = server.save()
        beforeRecharge.entities = beforeRecharge.entities.filter(entity => !entity.zombie)
        Object.assign(beforeRecharge.wave, { index: 0, nextWaveAtTick: 100000, zombieIds: [] })
        server.restore(beforeRecharge, 'corn:cannon_testing', mods)
        while (server.snapshot().plants[0].behaviorState!.phase === 'firing') server.tick()
        const start = server.snapshot().plants[0].behaviorState!.startedAtTick as number
        while (server.snapshot().gameplayTick < start + 2999) server.tick()
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'arming')
        assert.equal(server.tick().plants[0].behaviorState!.phase, 'loading')
        for (let i = 0; i < 125; i++) server.tick()
        assert.equal(server.snapshot().plants[0].behaviorState!.phase, 'ready')
        assert.equal(server.snapshot().gameplayTick - start, 3125)
    } finally { host.dispose() }
})
