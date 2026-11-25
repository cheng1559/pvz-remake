import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as teamsModule from '@/shared/content/teams'
import * as zombieStatesModule from '@/shared/content/zombieStates'

const { DEBUG_OVERLAY_ORDER, renderOrder } = renderOrderModule

test("/hitboxes and /hp draw over every row's particles and under what is drawn from the top layer up", () => {
    assert.ok(renderOrder('particle', 5, 100) < DEBUG_OVERLAY_ORDER, "a pool's last row's")
    assert.ok(DEBUG_OVERLAY_ORDER < renderOrder('top', 0, -1), "the magnet's items' (Board::DrawGameObjects)")
})

test('/hitboxes outlines as Board::DrawDebugObjectRects does, each rect with Graphics::DrawRect in whole pixels', () => {
    class Color { constructor(readonly r = 0, readonly g = 0, readonly b = 0, readonly a = 255) {} }
    const fills: Array<[number[], ...number[][]]> = []
    const graphics = {
        fillColor: new Color(), path: [] as number[][],
        clear() { fills.length = 0 },
        rect(x: number, y: number, width: number, height: number) { this.path.push([x, y, width, height]) },
        fill() { fills.push([[this.fillColor.r, this.fillColor.g, this.fillColor.b], ...this.path]); this.path = [] },
    }
    const modules: Record<string, unknown> = {
        cc: { Color }, '@/client/view/uiNode': { uiNode: () => ({ node: {}, graphics }) },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { hitboxesVisible: true } },
        '@/shared/content/renderOrder': renderOrderModule, '@/shared/content/teams': teamsModule, '@/shared/content/zombieStates': zombieStatesModule,
    }
    const { LevelHitboxes } = loadScript('assets/scripts/client/level/LevelHitboxes.ts', id => modules[id] ?? {})
    const body = { x: 10, y: 0, width: 60, height: 80 }
    const definitions = {
        plants: {
            'test:chomper': { body, chomper: { attack: { x: 80, y: 0, width: 40, height: 80 } } },
            'test:puff': { body, shooter: { range: 230 } },
            'test:pea': { body, shooter: {} },
        },
        zombies: { 'test:zombie': { body: { x: 36, y: 0, width: 42, height: 115 }, attack: { x: 20, y: 0, width: 50, height: 115 } } },
        projectiles: { 'test:pea': { hitbox: { x: -15, y: 0, width: 55, height: 40 } } },
    }
    const hitboxes = new LevelHitboxes({ layer: {}, addScenery() {} }, definitions)
    hitboxes.sync({
        plants: [{ typeId: 'test:chomper', x: 100, y: 200 }, { typeId: 'test:puff', x: 300, y: 200, team: 'zombies' }, { typeId: 'test:pea', x: 500, y: 200 }],
        zombies: [{ typeId: 'test:zombie', x: 500.7, y: 100.4, state: 'walking' }, { typeId: 'test:zombie', x: 600, y: 100, state: 'dying' }],
        projectiles: [{ typeId: 'test:pea', x: 300.5, y: 250.2 }], mowers: [],
    })
    const GREEN = [0, 255, 0], RED = [255, 0, 0]
    // Graphics::DrawRect(x, y, w, h) on the board: rows of w + 1 at y and y + h, columns of h - 1 at x and x + w, in the
    // layer, whose y runs up from its middle.
    const outline = (color: number[], x: number, y: number, w: number, h: number) =>
        [color, ...[[x, y, w + 1, 1], [x, y + h, w + 1, 1], [x, y + 1, 1, h - 1], [x + w, y + 1, 1, h - 1]].map(([left, top, across, down]) => [left - 400, 300 - top - down, across, down])]
    assert.deepEqual(fills, [
        // The chomper's body and bite; the puff-shroom on the zombies' side faces left, its 230 running left from 20 in.
        outline(GREEN, 110, 200, 60, 80), outline(RED, 180, 200, 40, 80),
        outline(GREEN, 310, 200, 60, 80), outline(RED, 300 + 20 - 230, 200, 230, 80),
        // The peashooter reaches the whole row: its body alone.
        outline(GREEN, 510, 200, 60, 80),
        // A zombie where it stands in whole pixels; the dying one goes unoutlined.
        outline(GREEN, 536, 100, 42, 115), outline(RED, 520, 100, 50, 115),
        outline(RED, 285, 250, 55, 40),
    ])
})

test("/hp draws over each plant and zombie a bar as wide for any, a zombie's armor in it after its body, and its slot in its bottom left", () => {
    class Color {
        static readonly WHITE = new Color(255, 255, 255)
        constructor(readonly r = 0, readonly g = 0, readonly b = 0, readonly a = 255) {}
    }
    class Node {
        active = true
        parent?: Node
        readonly children: Node[] = []
        constructor(readonly name = '') {}
        setParent(parent: Node) { parent.children.push(this); this.parent = parent }
        destroy() { this.parent!.children.splice(this.parent!.children.indexOf(this), 1) }
    }
    const rects: number[][] = []
    const graphics = {
        fillColor: undefined as Color | undefined, path: [] as number[][],
        clear() { rects.length = 0 },
        rect(x: number, y: number, width: number) { this.path.push([x, y, width]) },
        fill() { rects.push(...this.path); this.path = [] },
    }
    const uiNode = (options: { name: string, parent: Node, graphics?: boolean }) => {
        const node = new Node(options.name)
        node.setParent(options.parent)
        return { node, ...options.graphics ? { graphics } : {} }
    }
    const labels: Array<{ node: Node, text: string, at: number[] }> = []
    const ui = {
        label(parent: Node, options: { text: string }) {
            const node = new Node('Label')
            node.setParent(parent)
            const label = { node, text: options.text, at: [] as number[], setPosition(x: number, y: number) { this.at = [x, y] } }
            labels.push(label)
            return label
        },
    }
    const settings = { hpVisible: true, idVisible: true }
    const modules: Record<string, unknown> = {
        cc: { Color }, '@/client/view/uiNode': { uiNode }, '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/shared/content/renderOrder': renderOrderModule, '@/shared/content/teams': teamsModule,
    }
    const { LevelHealthBars } = loadScript('assets/scripts/client/level/LevelHealthBars.ts', id => modules[id] ?? {})
    const definitions = {
        plants: { 'test:nut': { body: { x: 10, y: 5, width: 40, height: 60 } } },
        zombies: { 'test:cone': { body: { x: 30, y: 10, width: 50, height: 100 }, helm: { type: 'cone', health: 370 } } },
    }
    const layer = new Node('EntityLayer'), scenery: Array<[string, number]> = []
    const bars = new LevelHealthBars({ layer, addScenery: (node: Node, order: number) => scenery.push([node.name, order]) }, definitions, ui, {})
    const plant = { entityId: 3, slot: 1, typeId: 'test:nut', x: 100, y: 200, health: 2000, maxHealth: 4000 }
    const zombie = { entityId: 7, slot: 4, typeId: 'test:cone', x: 500, y: 100, health: 270, maxHealth: 270, helmHealth: 185, shieldHealth: 0 }
    bars.sync({ plants: [plant], zombies: [zombie] })
    assert.deepEqual(scenery, [['HealthBars', DEBUG_OVERLAY_ORDER]], 'among the entities, over their particles')
    // The plant's body tops 205 down the board, 95 up the layer from its middle: one above that, its bar's frame of a
    // pixel round it, the bar centred over its narrower body and half full. The zombie's is as wide as its body: its
    // body's 270 and its cone's 185 of the 640 of both at their full.
    const frame = (x: number, y: number) => [[x - 1, y - 1, 52], [x - 1, y + 3, 52], [x - 1, y, 1], [x + 50, y, 1]]
    assert.deepEqual(rects, [...frame(-295, 97), [-295, 97, 50], [-295, 97, 25],
        ...frame(130, 192), [130, 192, 50], [130, 192, 21.09375], [151.09375, 192, 14.453125]])
    // Each slot in its body's bottom left, two in and one up: the plant's body bottoms 35 up the layer, the zombie's 90.
    assert.deepEqual(labels.map(({ text, at }) => [text, ...at]), [['1', -288, -36], ['4', 132, -91]], 'a label\'s y running down')

    const shown = () => labels.filter(({ node }) => node.parent!.children.includes(node)).map(({ text }) => text)
    bars.sync({ plants: [], zombies: [{ ...zombie, slot: 0 }] })
    assert.deepEqual(shown(), ['0'], "a gone one's slot goes with it, and a slot taken anew shows")
    settings.idVisible = false
    bars.sync({ plants: [plant], zombies: [zombie] })
    assert.deepEqual([rects.length, shown()], [13, []], '/hp alone: the bars without the slots')
    Object.assign(settings, { hpVisible: false, idVisible: true })
    bars.sync({ plants: [plant], zombies: [zombie] })
    const at = labels.filter(({ node }) => node.parent!.children.includes(node)).map(({ text, at }) => [text, ...at])
    assert.deepEqual([rects.length, at], [0, [['1', -288, -36], ['4', 132, -91]]], '/id alone: the slots without the bars, where they were')

    // Over a body as it faces: a plant on the zombies' side has its body mirrored across its cell.
    Object.assign(settings, { hpVisible: true, idVisible: false })
    bars.sync({ plants: [{ ...plant, team: 'zombies' }], zombies: [] })
    assert.deepEqual(rects[0], [100 + (teamsModule.PLANT_WIDTH - 10 - 40) + (40 - 50) / 2 - 400 - 1, 96, 52])
    settings.hpVisible = false
    bars.sync({ plants: [plant], zombies: [zombie] })
    assert.equal(layer.children[0].active, false)
})
