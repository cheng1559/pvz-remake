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
}
class Node {
    isValid = true
    setScale() {}
    addComponent(Type: new () => object) { return new Type() }
}

function setup() {
    const classes: Record<string, any> = {}
    const modules: Record<string, any> = {
        cc: { Component: class {}, Color,
            isValid: (node: Node) => node.isValid, _decorator: { ccclass: (name: string) => (value: unknown) => { classes[name] = value; return value } } },
        '@/client/plants/definitions': plantVisuals,
        '@/client/reanim/EntityDisplay': { resolveEntityDisplay: (_kind: string, _id: number, layout: unknown) => layout },
        '@/client/view/uiNode': { uiNode: () => ({ node: new Node() }) },
    }
    const load = (name: string) => {
        const module = { exports: {} as Record<string, any> }
        const path = name.includes('/') ? name : `hud/${name}`
        const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
        return module.exports
    }
    modules['./PlantPreview'] = load('PlantPreview')
    const renderer = load('SeedPacketRenderer').SeedPacketRenderer
    return { classes, modules, load, renderer }
}

test('namespaced Mod packets keep their ID and render their registered animation instead of the cached plant pose', async () => {
    const { classes, modules, load, renderer } = setup()
    const plant = structuredClone(presentationFixture.plants['pvz:peashooter']) as any
    plant.animationTarget = 'example:rapid_pea'
    plant.visual.seedType = 'example:rapid_pea'
    plant.animations.body.reanimId = 'example:body'
    const definitions = buildPresentationDefinitions(presentationFixture, [{ ownerId: 'example', data: { plants: { 'example:rapid_pea': plant } } }])
    const animations = new ClientAnimationRegistry(definitions)
    const { resolveEntityDisplay } = load('reanim/EntityDisplay')
    const layout = resolveEntityDisplay('plants', 0, { animationTarget: 'pvz:peashooter', offset: [0, 0], shadow: false }, animations)
    let selected: any[] = []
    Object.assign(modules['@/client/reanim/EntityDisplay'], {
        resolveEntityDisplay,
        loadEntityDisplayAssets: async () => ({ content: { animations }, catalog: { plants: [layout] } }),
        loadDisplayParts: async (_node: Node, parts: any[]) => {
            selected = parts
            return new Map(parts.map(part => [part.name, { lastFrameTimeSeconds: 1, seek() {}, setTracksVisible() {} }]))
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

test('a packet drawn above 1x uses the larger background, as DrawSeedPacket does', async () => {
    const { classes } = setup()
    for (const [scale, upgrade, expected] of [[2, false, 'seedpacket_larger'], [2, true, 'seedpacket_larger'], [1, false, 'seeds']] as const) {
        const loaded: string[] = [], sprite: { spriteFrame?: unknown } = {}
        const background = new classes.SeedPacketBackground()
        background.node = new Node()
        background.initialize(sprite, { seedType: 0, upgrade, loadSprite: async (name: string) => { loaded.push(name); return { name } } }, scale)
        await new Promise(setImmediate)
        assert.deepEqual(loaded, [expected], `scale ${scale}${upgrade ? ' upgrade' : ''}`)
        if (scale > 1) assert.deepEqual(sprite.spriteFrame, { name: 'seedpacket_larger' })
    }
})
