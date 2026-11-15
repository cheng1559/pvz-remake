import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as plantVisuals from '@/client/plants/definitions'
import * as modApi from '@/shared/mod'
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
    destroy() {}
    addComponent(Type: new () => object) { return new Type() }
}

function setup() {
    const classes: Record<string, any> = {}
    const modules: Record<string, any> = {
        cc: { Component: class {}, Color,
            isValid: (node: Node) => node.isValid, _decorator: { ccclass: (name: string) => (value: unknown) => { classes[name] = value; return value } } },
        '@/client/plants/definitions': plantVisuals,
        '@/shared/mod': modApi,
        '@/client/view/offBoard': {},
        '@/client/view/uiNode': { uiNode: () => ({ node: new Node() }) },
    }
    const resources: { sprite?: (name: string) => Promise<unknown> } = {}
    modules['@/client/content/ModResources'] = { modResources: resources }
    const load = (name: string) => {
        const path = name.includes('/') ? name : `hud/${name}`
        return loadScript(`assets/scripts/client/${path}.ts`, (id: string) => modules[id] ?? {})
    }
    modules['./PlantPreview'] = load('PlantPreview')
    const renderer = load('SeedPacketRenderer').SeedPacketRenderer
    return { classes, modules, load, renderer, resources }
}

test('namespaced Mod packets keep their ID and are drawn by their plant view instead of the cached plant pose', async () => {
    const { classes, modules, load, renderer } = setup()
    const plant = structuredClone(presentationFixture.plants['pvz:peashooter']) as any
    plant.visual.seedType = 'example:rapid_pea'
    plant.clips.body.reanimId = 'example:body'
    plant.packet = { x: 12, y: 12, scale: 0.85 }
    const definitions = buildPresentationDefinitions(presentationFixture, [{ ownerId: 'example', data: { plants: { 'example:rapid_pea': plant } } }])
    // The plant as a packet's picture has it: by its view, without a shadow, at the packet's place and size, held still.
    const drawn: any[] = [], paused: string[] = [], cached: unknown[] = []
    let view: { players: any[] } | null = { players: [{ pause() { paused.push('body') } }, { pause() { paused.push('head') } }] }
    modules['@/client/view/offBoard'].createOffBoardPlant = async (_node: Node, typeId: string, options: unknown) => {
        drawn.push([typeId, options])
        return view && { view }
    }
    const preview = new classes.PlantPreview(), root = new Node()
    Object.assign(preview, { definitions, rendered: root, loadCached: async (_root: Node, plantId: unknown) => { cached.push(plantId) } })
    await preview.load(root, 'example:rapid_pea')
    // The preview runs in a realm of its own: its values are compared as JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(drawn)), [['example:rapid_pea', { packet: true, draw: { position: { x: 0, y: 0 }, scale: 0.85, shadow: false } }]])
    assert.deepEqual([paused, preview.players.length, cached.length], [['body', 'head'], 2, 0])
    // A plant its view does not draw off the board keeps the cached picture.
    view = null
    await preview.load(root, 'example:rapid_pea')
    assert.deepEqual(cached, ['example:rapid_pea'])

    let id: unknown
    modules['./PlantPreview'].PlantPreview = class { initialize(_definitions: unknown, plantId: unknown) { id = plantId } }
    renderer._drawPlantIcon(new Node(), { definitions, seedType: 'example:rapid_pea' }, 1)
    assert.equal(id, 'example:rapid_pea')
})

test('a packet drawn above 1x uses the larger background, as DrawSeedPacket does', async () => {
    const { classes, resources } = setup()
    for (const [scale, upgrade, expected] of [[2, false, 'seedpacket_larger'], [2, true, 'seedpacket_larger'], [1, false, 'seeds']] as const) {
        const loaded: string[] = [], sprite: { spriteFrame?: unknown } = {}
        resources.sprite = async (name: string) => { loaded.push(name); return { name } }
        const background = new classes.SeedPacketBackground()
        background.node = new Node()
        background.initialize(sprite, { seedType: 0, upgrade }, scale)
        await new Promise(setImmediate)
        assert.deepEqual(loaded, [expected], `scale ${scale}${upgrade ? ' upgrade' : ''}`)
        if (scale > 1) assert.deepEqual(sprite.spriteFrame, { name: 'seedpacket_larger' })
    }
})

test('a scaled packet cost reads HD font glyphs at their texture scale and skips other pages', () => {
    const { modules, renderer } = setup()
    const frames: any[] = [], nodes: any[] = []
    class SpriteFrame { reset(options: any) { frames.push(options) } }
    Object.assign(modules.cc, {
        SpriteFrame, Sprite: { SizeMode: { CUSTOM: 0, RAW: 2 } },
        Rect: class { constructor(...v: number[]) { Object.assign(this, { v }) } },
        Size: class { constructor(...v: number[]) { Object.assign(this, { v }) } },
        Vec2: class {},
    })
    modules['@/client/view/uiNode'].uiNode = (options: any) => { nodes.push(options); return { node: Object.assign(new Node(), { getComponent: () => null }) } }
    const glyph = (rect: number[]) => ({ rect, offset: [0, 0], width: 5, order: 0, kerning: {} })
    const layer = (name: string, chars: Record<string, unknown>) => ({ name, textureScale: 4, ascent: 9, offset: [0, 0], spacing: 0,
        baseOrder: 0, colorMult: [255, 255, 255, 255], colorAdd: [0, 0, 0, 0], chars })
    // '7' lives on page 0, '5' on page 1; each page lists the other's glyph with an empty rect.
    const config = { charMap: {}, layers: [layer('Main_0', { 55: glyph([10, 2, 4, 9]), 53: glyph([0, 0, 0, 0]) }), layer('Main_1', { 55: glyph([0, 0, 0, 0]), 53: glyph([1, 1, 4, 9]) })] }
    renderer._drawScaledCostMatrix(new Node(), 75, { config: { json: config }, textures: [{}, {}] }, undefined, 2)
    assert.deepEqual(frames.map(frame => frame.rect.v), [[40, 8, 16, 36], [4, 4, 16, 36]], 'texture pixels = logical rect x textureScale')
    assert.deepEqual(nodes.filter(node => node.sprite).map(node => [node.size.width, node.size.height]), [[8, 18], [8, 18]], 'drawn at logical size x packet scale')
})

test('a grave packet of the other side turns its picture round within the packet', () => {
    const { classes, load } = setup()
    load('PacketGrave')
    const node = {
        scaleX: 1, position: { x: 0, y: -3 },
        setScale(x: number) { this.scaleX = x },
        setPosition(x: number, y: number) { this.position = { x, y } },
        getComponent: () => ({ width: 50 }),
    }
    const grave = new classes.PacketGrave()
    grave.node = node
    grave.setMirrored(true)
    assert.deepEqual([node.scaleX, node.position], [-1, { x: 50, y: -3 }])
    grave.setMirrored(false)
    assert.deepEqual([node.scaleX, node.position], [1, { x: 0, y: -3 }])
})

test('every script defines at most one component, as Cocos allows (error 3615)', () => {
    const scripts = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? scripts(`${dir}/${entry.name}`) : entry.name.endsWith('.ts') ? [`${dir}/${entry.name}`] : [])
    const crowded = scripts('assets/scripts').filter(path => (readFileSync(path, 'utf8').match(/^\s*@(?:_decorator\.)?ccclass\(/gm) ?? []).length > 1)
    assert.deepEqual(crowded, [])
})
