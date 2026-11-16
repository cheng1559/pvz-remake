import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import { readGameplaySource } from '../../tools/mod/content'
import { presentationFixture } from './presentationFixture'
import * as animationModule from '@/shared/content/animation'
import * as gameplayModule from '@/shared/content/gameplay'
import * as plantAnimationModule from '@/shared/content/plantAnimation'
import * as protocolModule from '@/shared/protocol'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as teamsModule from '@/shared/content/teams'
import * as zombieAnimationModule from '@/shared/content/zombieAnimation'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))

class Node {
    isValid = true
    name = ''
    parent?: Node
    siblingIndex?: number
    active = true
    position = { x: 0, y: 0 }
    scale = 1
    readonly children: Node[] = []
    constructor(parent?: Node) { if (parent) { this.parent = parent; parent.children.push(this) } }
    setPosition(x: number, y: number) { this.position = { x, y } }
    setScale(x: number) { this.scale = x }
    setSiblingIndex(index: number) { this.siblingIndex = index }
    getChildByName(name: string) { return this.children.find(child => child.name === name) ?? null }
    destroy() { this.isValid = false }
}

/** The layers' players: what each frame shows, by the view's own rule (`shown`), is recorded. */
class LayerPlayers {
    static shown: Array<Record<string, unknown>> = []
    readonly shown: unknown[] = []
    player() { return { loadedId: null, node: new Node(), setTracksVisible() {} } }
    show(shown: (layer: string) => unknown) { LayerPlayers.shown.push({ body: shown('body') }) }
}

/** A client module with what views draw with stubbed, and the shared rules real. */
function load(path: string, modules: Record<string, unknown> = {}): Record<string, any> {
    const shared: Record<string, unknown> = {
        '@/shared/content/animation': animationModule, '@/shared/content/gameplay': gameplayModule,
        '@/shared/content/plantAnimation': plantAnimationModule, '@/shared/content/zombieAnimation': zombieAnimationModule,
        '@/shared/protocol': protocolModule, '@/shared/protocol/index': protocolModule, '@/shared/content/renderOrder': renderOrderModule,
        '@/shared/content/teams': teamsModule, cc: { Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/level/LevelStage': { plantShadow: async () => ({ originalSize: { width: 80, height: 30 } }), boardToLayer: (x: number, y: number) => ({ x, y }) },
        '@/client/reanim/ReanimAssets': { prepareReanims: async () => {} },
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = new Node(options.parent)
            node.name = options.name ?? ''
            if (options.active === false) node.active = false
            return { node }
        } },
        '@/client/view/layerPlayback': { LayerPlayers, shownLayer: (state: unknown) => state },
        '@/client/view/EntityAttachments': { EntityAttachments: class { add() {} } },
        './zombieParts': { MIRRORED_SHIFT: 90, zombiePartVisibility: () => [] },
    }
    return loadScript(`assets/scripts/client/${path}.ts`, (id: string) => modules[id] ?? shared[id] ?? {})
}

/** Every clip a view asks its presentation for, by its name. */
const clips = new Proxy({}, { get: (_target, name) => ({ reanimId: String(name), x: 0, y: 0 }) })
const content = { definitions, presentation: presentationFixture, animations: { resolve: () => clips } }

test('a zombie off the board is its view, of no entity: whole as it is given, without a shadow when drawn without, and it turns', async () => {
    const { ZombieView } = load('zombies/ZombieView', { './definitions': { zombieDefinition: () => presentationFixture.zombies['pvz:normal'] } })
    const make = async (draw?: object) => {
        const parent = new Node(), node = new Node(parent)
        const zombie = { typeId: 'pvz:normal', x: 0, y: 0, row: 0, state: 'walking', health: 270, maxHealth: 270, alpha: 255, hasHead: true, hasArm: true,
            hasTongue: false, helmHealth: 0, shieldHealth: 0, animations: { body: { clip: 'idle', time: 0, rate: 12 } } }
        const view = new ZombieView({ node, content, zombie, draw })
        await view.initialize()
        return { view, parent, node }
    }
    LayerPlayers.shown = []
    const bare = await make({ shadow: false })
    assert.equal(bare.view.shadowNode, undefined, 'no shadow node at all, as a plant drawn without one')
    assert.deepEqual(bare.parent.children, [bare.node])
    assert.deepEqual(LayerPlayers.shown, [{ body: { clip: 'idle', time: 0, rate: 12 } }], 'it stands as it was given from the start')
    const shaded = await make()
    assert.deepEqual([shaded.view.shadowNode.parent, shaded.view.shadowNode.siblingIndex, shaded.view.shadowNode.active], [shaded.parent, 0, true],
        'its shadow beside its node, under the rest')
    // Zombie::IsWalkingBackwards: a picture of one on the plants' side faces right.
    bare.view.turn(true)
    assert.equal(bare.view.mirrored, true)
    bare.view.turn(false)
    assert.equal(bare.view.mirrored, false)
    assert.equal(LayerPlayers.shown.length, 4, 'shown again each time it turns')
    const board = new ZombieView({ node: new Node(), content, zombie: { typeId: 'pvz:normal', animations: {} }, stage: {} })
    assert.throws(() => board.turn(true), /faces its side's way/)
})

test("a plant off the board keeps its animation on by the server's rules, from where it is given", async () => {
    const random = { nextFloat: () => 0.5, integer: (min: number) => min }
    const { PlantView } = load('plants/PlantView', {
        './definitions': { plantDefinition: () => ({ ...presentationFixture.plants['pvz:peashooter'], packet: undefined }) },
        '@/client/view/offBoard': { offBoardRandom: random },
    })
    const plant = { typeId: 'pvz:peashooter', ...plantAnimationModule.startOffBoardPlant(definitions.plants['pvz:peashooter'].animation!, random) }
    const view = new PlantView({ node: new Node(), content, plant, draw: { shadow: false } })
    LayerPlayers.shown = []
    await view.initialize()
    const before = plant.animations!.body.time
    view.advance(10)
    assert.ok(plant.animations!.body.time > before, 'its layers went on')
    const stepped = plantAnimationModule.startOffBoardPlant(definitions.plants['pvz:peashooter'].animation!, random)
    for (let tick = 0; tick < 10; tick++) plantAnimationModule.stepPlantAnimation(definitions.plants['pvz:peashooter'].animation!, stepped, random)
    assert.deepEqual([plant.animations, plant.blinkTicks], [stepped.animations, stepped.blinkTicks], 'as stepPlantAnimation steps one')
    assert.equal(LayerPlayers.shown.length, 2, 'posed as it starts, then as it went on')
    const board = new PlantView({ node: new Node(), content, plant: { typeId: 'pvz:peashooter' }, stage: {} })
    assert.throws(() => board.advance(1), /animated by the server/)
})

test("a sun-shroom's shadow is the size of the state it is in: small, growing with its grow clip, grown, and grown off the board", async () => {
    const random = { nextFloat: () => 0, integer: (min: number) => min }
    const { PlantView } = load('plants/PlantView', {
        './definitions': { plantDefinition: () => presentationFixture.plants['pvz:sunshroom'] },
        '@/client/view/offBoard': { offBoardRandom: random },
    })
    // Plant::DrawShadow: 0.5 small, 0.5 + 0.5 * its anim_grow's time growing, 1 grown; about its 80 by 30 middle.
    const shadow = async (plant: object) => {
        const node = new Node(), view = new PlantView({ node, content, plant: { typeId: 'pvz:sunshroom', ...plant } })
        await view.initialize()
        const { scale, position } = node.getChildByName('PlantShadow')!
        return [scale, position.x, position.y]
    }
    const at = (state: string, clip: string, time: number) => ({ ability: { state, ticks: 0 }, animations: { body: { clip, time, rate: 12 } } })
    assert.deepEqual(await shadow(at('small', 'small', 3)), [0.5, -3 + 20, -42 - 7.5])
    assert.deepEqual(await shadow(at('growing', 'grow', 6)), [0.75, -3 + 10, -42 - 3.75])
    assert.deepEqual(await shadow(at('big', 'body', 3)), [1, -3, -42])
    // The almanac's is grown (its animation's offBoard), and so is its shadow.
    const almanac = plantAnimationModule.startOffBoardPlant(definitions.plants['pvz:sunshroom'].animation!, random)
    assert.deepEqual(await shadow({ animations: almanac.animations, ability: { state: almanac.state, ticks: 0 } }), [1, -3, -42])
})
