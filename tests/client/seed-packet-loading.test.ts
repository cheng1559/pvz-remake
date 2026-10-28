import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as plantVisuals from '@/client/plants/definitions'
import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'

class Color {
    static WHITE = new Color()
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    clone() { return new Color(this.r, this.g, this.b, this.a) }
    equals(other: Color) { return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a }
}
class Sprite { color = Color.WHITE.clone() }
class Mask {
    static Type = { GRAPHICS_STENCIL: 2 }
    enabled = true
    type = 0
    subComp = { bounds: [] as number[], clear() {}, fill() {}, rect(...bounds: number[]) { this.bounds = bounds } }
}
class Node {
    isValid = true
    active = false
    children: Node[] = []
    sprite?: Sprite
    angle = 0
    position = { x: 0, y: 0 }
    scale = { x: 1, y: 1 }
    constructor(public parent?: Node) { parent?.children.push(this) }
    setPosition(x: number, y: number) { this.position = { x, y } }
    setScale(x: number, y: number) { this.scale = { x, y } }
    addComponent(type: typeof Mask) { return new type() }
    removeFromParent() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this)
        this.parent = undefined
    }
    destroy() {
        this.isValid = false
        for (const child of [...this.children]) child.destroy()
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this)
    }
    getComponentsInChildren(): Sprite[] { return [...(this.sprite ? [this.sprite] : []), ...this.children.flatMap(child => child.getComponentsInChildren())] }
}

function setup() {
    const settings = { hdSeedPacketsEnabled: true, seedPacketStyle: 'rendered' }
    const classes: Record<string, any> = {}
    const errors: unknown[][] = []
    class Frame { reset(info: unknown) { Object.assign(this, info) } }
    class Rect { constructor(public x: number, public y: number, public width: number, public height: number) {} }
    const modules: Record<string, any> = {
        cc: { Component: class {}, Color, Mask, Sprite, SpriteFrame: Frame, Rect, Size: Rect, Vec2: Rect,
            isValid: (node: Node) => node.isValid, _decorator: { ccclass: (name: string) => (value: unknown) => { classes[name] = value; return value } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/client/content/SpriteDensity': { applySpriteDensity() {} },
        '@/client/view/bakeSprite': {},
        '@/client/plants/definitions': plantVisuals,
        '@/client/render/KernelBatch': { KernelBatch: class {} },
        '@/client/reanim/EntityDisplay': { resolveEntityDisplay: (_kind: string, _id: number, layout: unknown) => layout },
        '@/client/view/uiNode': { uiNode: (options: any) => {
            const node = new Node(options.parent)
            node.active = options.active ?? true
            return { node }
        } },
    }
    const load = (name: string) => {
        const module = { exports: {} as Record<string, any> }
        const path = name.includes('/') ? name : `hud/${name}`
        const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
            console: { error: (...args: unknown[]) => errors.push(args) } })
        return module.exports
    }
    modules['./PlantPreview'] = load('PlantPreview')
    const renderer = load('SeedPacketRenderer').SeedPacketRenderer
    return { settings, classes, errors, modules, load, renderer }
}
const flush = () => new Promise(setImmediate)

test('namespaced Mod packets keep their ID and render their registered animation instead of the cached plant pose', async () => {
    const { classes, modules, load, renderer } = setup()
    const plant = structuredClone(presentationFixture.plants['pvz:peashooter']) as any
    plant.animationTarget = 'example:rapid_pea'
    plant.visual.seedType = 'example:rapid_pea'
    plant.animations.body.reanimId = 'example:body'
    const definitions = buildPresentationDefinitions(presentationFixture, [{ ownerId: 'example:showcase', data: { plants: { 'example:rapid_pea': plant } } }])
    const animations = new ClientAnimationRegistry(definitions)
    const { resolveEntityDisplay } = load('reanim/EntityDisplay')
    const layout = resolveEntityDisplay('plants', 0, { animationTarget: 'pvz:peashooter', offset: [0, 0], shadow: false }, animations)
    let selected: any[] = []
    Object.assign(modules['@/client/reanim/EntityDisplay'], {
        resolveEntityDisplay,
        loadEntityDisplayAssets: async () => ({ content: { animations }, catalog: { plants: [layout] } }),
        loadDisplayParts: async (_node: Node, parts: any[]) => {
            selected = parts
            return new Map(parts.map(part => [part.name, { lastFrameTimeSeconds: 1, seek() {} }]))
        },
    })
    const preview = new classes.PlantPreview(), root = new Node()
    preview.definitions = definitions
    preview.rendered = root
    await preview.load(root, 'example:rapid_pea')
    assert.equal(selected[0].id, 'example:body')

    let id: unknown
    modules['./PlantPreview'].PlantPreview = class { initialize(_definitions: unknown, plantId: unknown) { id = plantId } }
    renderer._drawPlantIcon(new Node(), { definitions, seedType: 'example:rapid_pea' }, 1)
    assert.equal(id, 'example:rapid_pea')
})




test('conveyor slots retain their bindings and draw mobile selection above the full gray overlay', () => {
    const { modules, load } = setup()
    const draws: any[] = []
    modules['@/client/hud/SeedPacketRenderer'] = { SeedPacketRenderer: { drawSeedPacket(args: any) {
        draws.push(args)
        const node = args.node ?? new Node(args.parent)
        if (node.parent !== args.parent) {
            node.removeFromParent()
            node.parent = args.parent
            args.parent.children.push(node)
        }
        node.setPosition(args.x, args.y)
        return node
    } } }
    const { SeedPacketView } = load('SeedPacketView')
    SeedPacketView.prototype._createSelectedHighlight = function () { return new Node(this.node) }
    SeedPacketView.prototype._createCooldownClip = function () { return new Node(this.node) }
    const hiddenBank = new Node(), conveyorClip = new Node()
    const packet = new SeedPacketView({ parent: hiddenBank, x: 0, y: 0, drawCost: false })
    packet.applyColor = () => {}
    assert.equal(packet.node.children.length, 0)
    assert.equal(draws.length, 0, 'empty slots must not render a placeholder seed')
    const node = packet.node, button = {}
    node.button = button
    node.removeFromParent()
    node.parent = conveyorClip
    conveyorClip.children.push(node)
    node.active = true
    node.setPosition(250, -4)
    for (const seedType of ['explodenut', 'wallnut', 'explodenut']) {
        packet.setSeed(seedType, 0)
        assert.equal(packet.node, node)
        assert.equal(node.parent, conveyorClip)
        assert.deepEqual(node.position, { x: 250, y: -4 })
        assert.equal(node.active, true)
        assert.equal(node.button, button)
        assert.equal(draws.at(-1).seedType, seedType)
        assert.equal(draws.at(-1).drawCost, false)
        packet.sync({ gameStarted: true, active: true, selected: true, cooldownRemaining: 0, cooldownTotal: 0,
            canAfford: true, tutorialColor: null, mobile: true, conveyor: true })
        assert.equal(packet.cooldownClip.active, true, 'selection retains the gray packet overlay')
        assert.equal(packet.selectedHighlight.active, true)
        assert.ok(node.children.indexOf(packet.selectedHighlight) > node.children.indexOf(packet.cooldownClip),
            'the yellow frame must draw above the overlay even without a cost label')
        packet.sync({ gameStarted: true, active: true, selected: true, cooldownRemaining: 0, cooldownTotal: 0,
            canAfford: true, tutorialColor: null, mobile: false, conveyor: true })
        assert.equal(packet.selectedHighlight.active, false, 'desktop packets do not draw the mobile frame')
    }
})

test('plant previews create one selected representation and preserve tint across asynchronous loads', async () => {
    const { settings, classes, errors } = setup()
    const preview = new classes.PlantPreview()
    preview.node = new Node()
    const calls: string[] = []
    let tint: Color | undefined
    let fail = false
    let finish!: () => void
    let preparing: Promise<void> | undefined = new Promise(resolve => { finish = resolve })
    preview.load = async () => {
        calls.push('HD')
        await preparing
        if (fail) throw new Error('missing Reanim')
        preview.players.push({ setColorOverride(color: Color) { tint = color.clone() }, flushPose() {} })
    }
    preview.initialize(presentationFixture, 2, async (root: Node) => {
        calls.push('original')
        root.sprite = new Sprite()
        root.sprite.color = new Color(255, 0, 0)
    }, { x: 5, y: -9, scale: 0.5 })
    preview.setColor(new Color(128, 128, 128, 100))
    let ready = false
    void preview.ready.then(() => { ready = true })
    await flush()
    assert.equal(ready, false, 'the page must be able to wait for portrait preparation')
    assert.equal(preview.rendered.active, false)
    finish()
    preparing = undefined
    await preview.ready
    assert.deepEqual(calls, ['HD'])
    assert.deepEqual(tint, new Color(128, 128, 128, 100))
    const old = preview.rendered
    settings.hdSeedPacketsEnabled = false
    preview.update()
    await flush()
    assert.deepEqual(calls, ['HD', 'original'])
    assert.equal(old.isValid, false)
    assert.equal(preview.node.children.length, 1)
    assert.deepEqual(preview.rendered.sprite.color, new Color(128, 0, 0, 100), 'cached art retains its base tint')
    fail = true
    settings.hdSeedPacketsEnabled = true
    preview.update()
    await flush()
    assert.deepEqual(calls, ['HD', 'original', 'HD'])
    assert.equal(preview.rendered.active, false)
    assert.equal(preview.node.children.length, 1)
    assert.equal(errors.length, 1)
})
