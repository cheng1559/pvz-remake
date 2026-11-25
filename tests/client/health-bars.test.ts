import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as zombieStatesModule from '@/shared/content/zombieStates'

const { DEBUG_OVERLAY_ORDER, renderOrder } = renderOrderModule

test("/hitboxes and /hp draw over every row's particles and under what is drawn from the top layer up", () => {
    assert.ok(renderOrder('particle', 5, 100) < DEBUG_OVERLAY_ORDER, "a pool's last row's")
    assert.ok(DEBUG_OVERLAY_ORDER < renderOrder('top', 0, -1), "the magnet's items' (Board::DrawGameObjects)")
})

test('/hitboxes outlines as Board::DrawDebugObjectRects does, each rect with Graphics::DrawRect, where the frame draws it', () => {
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
        '@/shared/content/renderOrder': renderOrderModule, '@/shared/content/zombieStates': zombieStatesModule,
        '@/client/plants/PlantView': { PlantView: class {} }, '@/client/zombies/ZombieView': { ZombieView: class {} },
    }
    const { LevelHitboxes } = loadScript('assets/scripts/client/level/LevelHitboxes.ts', id => modules[id] ?? {})
    const definitions = { projectiles: { 'test:pea': { hitbox: { x: -15, y: 0, width: 55, height: 40 } } } }
    // The plants' and zombies' rects as their views have them (PlantView.hitRects, ZombieView.hitRects): a chomper, a
    // puff-shroom facing left, one reaching the whole row, a zombie halfway up out of a grave.
    const rising = { body: { x: 536, y: 160, width: 42, height: 55 }, attack: { x: 520, y: 160, width: 50, height: 55 } }
    const views = new Map(Object.entries({
        11: { body: { x: 110, y: 200, width: 60, height: 80 }, attack: { x: 180, y: 200, width: 40, height: 80 } },
        12: { body: { x: 310, y: 200, width: 60, height: 80 }, attack: { x: 90, y: 200, width: 230, height: 80 } },
        13: { body: { x: 510, y: 200, width: 60, height: 80 }, attack: { x: 570, y: 200, width: 800, height: 80 } },
        1: rising, 2: rising,
    }).map(([id, rects]) => [Number(id), { hitRects: () => rects }]))
    const hitboxes = new LevelHitboxes({ layer: {}, addScenery() {}, view: (id: number) => views.get(id) }, definitions)
    hitboxes.sync({
        // Neither one whose view is still being made, nor a dying zombie, is outlined.
        plants: [11, 12, 13, 14].map(entityId => ({ entityId })),
        zombies: [{ entityId: 1, state: 'walking' }, { entityId: 2, state: 'dying' }, { entityId: 3, state: 'walking' }],
        projectiles: [{ typeId: 'test:pea', x: 300.5, y: 250.2 }], mowers: [],
    })
    const GREEN = [0, 255, 0], RED = [255, 0, 0]
    // Graphics::DrawRect(x, y, w, h) on the board: rows of w + 1 at y and y + h, columns of h - 1 at x and x + w, in the
    // layer, whose y runs up from its middle.
    const outline = (color: number[], x: number, y: number, w: number, h: number) =>
        [color, ...[[x, y, w + 1, 1], [x, y + h, w + 1, 1], [x, y + 1, 1, h - 1], [x + w, y + 1, 1, h - 1]].map(([left, top, across, down]) => [left - 400, 300 - top - down, across, down])]
    assert.deepEqual(fills, [
        outline(GREEN, 110, 200, 60, 80), outline(RED, 180, 200, 40, 80),
        outline(GREEN, 310, 200, 60, 80), outline(RED, 90, 200, 230, 80),
        // An attack rect that spans the board goes unoutlined.
        outline(GREEN, 510, 200, 60, 80),
        outline(GREEN, 536, 160, 42, 55), outline(RED, 520, 160, 50, 55),
        // The pea where the frame draws it, between two ticks.
        outline(RED, 285.5, 250.2, 55, 40),
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
        '@/shared/content/renderOrder': renderOrderModule,
        '@/client/zombies/ZombieView': { ZombieView: class {} },
    }
    const { LevelHealthBars } = loadScript('assets/scripts/client/level/LevelHealthBars.ts', id => modules[id] ?? {})
    const definitions = { zombies: { 'test:cone': { helm: { type: 'cone', health: 370 } } } }
    // The bodies as their views have them (PlantView.hitRects, ZombieView.hitRects): a plant's; a zombie's standing,
    // half up out of a grave, all under.
    const bodies = new Map([[3, { x: 110, y: 205, width: 40, height: 60 }],
        [7, { x: 530, y: 110, width: 50, height: 100 }], [8, { x: 530, y: 160, width: 50, height: 50 }], [9, { x: 530, y: 300, width: 50, height: 0 }]])
    const layer = new Node('EntityLayer'), scenery: Array<[string, number]> = []
    const bars = new LevelHealthBars({
        layer, addScenery: (node: Node, order: number) => scenery.push([node.name, order]),
        view: (id: number) => bodies.has(id) ? { hitRects: () => ({ body: bodies.get(id) }) } : undefined,
    }, definitions, ui, {})
    const plant = { entityId: 3, slot: 1, health: 2000, maxHealth: 4000 }
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

    // A rising zombie's bar over what is up out of the ground (its top 140 up the layer), its slot in that part's bottom
    // left; none for one all under the ground.
    Object.assign(settings, { hpVisible: true, idVisible: true })
    bars.sync({ plants: [], zombies: [{ ...zombie, entityId: 8, slot: 5 }, { ...zombie, entityId: 9, slot: 6 }] })
    const rising = labels.filter(({ node }) => node.parent!.children.includes(node)).map(({ text, at }) => [text, ...at])
    assert.deepEqual([rects.slice(0, 4), rects.length, rising], [frame(130, 142), 7, [['5', 132, -91]]])
    // One whose view is still being made goes without.
    bars.sync({ plants: [{ ...plant, entityId: 4 }], zombies: [] })
    assert.deepEqual([rects.length, shown()], [0, []])
    Object.assign(settings, { hpVisible: false, idVisible: false })
    bars.sync({ plants: [plant], zombies: [zombie] })
    assert.equal(layer.children[0].active, false)
})
