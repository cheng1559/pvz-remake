import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadScript } from '../loadScript'
import { animateCurveFloat } from '@/shared/content/animation'
import { PLANT_WAKE_TICKS } from '@/shared/content/plantKinds'
import { TimeBlends } from '@/client/level/TimeBlends'
import { TIME_CHANGE_TICKS } from '@/shared/content/gameplay'

const load = (path: string, modules: Record<string, unknown>) => loadScript(path, (id: string) => modules[id] ?? {}, { console })

test('a waking plant stretches down to 0.8 and up to 1.2 on its base over its 70 ticks, and is itself again (CURVE_EASE_SIN_WAVE)', () => {
    const stretch = (ticks: number) => animateCurveFloat(PLANT_WAKE_TICKS, 0, ticks, 1, 0.8, 'ease-sin-wave')
    const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
    near(stretch(70), 1)
    near(stretch(52.5), 1 - 0.2 * Math.sin(2 * Math.PI * 0.15625))
    near(stretch(35), 1)
    near(stretch(17.5), 1 - 0.2 * Math.sin(2 * Math.PI * 0.84375))
    near(stretch(0), 1)
    const lowest = Math.min(...Array.from({ length: 71 }, (_, ticks) => stretch(ticks)))
    const highest = Math.max(...Array.from({ length: 71 }, (_, ticks) => stretch(ticks)))
    assert.ok(lowest > 0.79 && lowest < 0.81 && highest > 1.19 && highest < 1.21)
})

test("/time's change of time of day blends the level's tune into the time's, whose music the level has once it is over", async () => {
    const calls: string[] = []
    const { LevelAudioPresenter } = load('assets/scripts/client/level/LevelAudioPresenter.ts', {
        '@/client/music/MusicSystem': { MusicSystem: {
            playTune: async (tune: string) => { calls.push(`play ${tune}`) }, keepTune: () => { calls.push('keep') },
            blendTunes: (weight: number) => { calls.push(`blend ${weight}`) }, dropKeptTune: () => { calls.push('drop') },
        } },
    })
    const music = (gameplay: string) => ({ choosing: 'pvz:choose', gameplay })
    const musicOf = (time: string) => music(time === 'night' ? 'pvz:moongrains' : 'pvz:grasswalk')
    const audio = new LevelAudioPresenter(music('pvz:grasswalk'))
    const blend = audio.timeBlend(musicOf)
    // Before play the tune waits for it: the level's music is the time's all the same.
    await blend.show('night')
    blend.end()
    assert.deepEqual(calls.splice(0), ['drop'])
    audio.startGameplay()
    assert.deepEqual(calls.splice(0), ['play pvz:moongrains'], "the night's, the level's now")
    // In play: the old tune kept beside the new one, blended, and the new one the level's once over, not started again.
    await blend.show('day')
    blend.blend(0.5)
    blend.end()
    assert.deepEqual(calls.splice(0), ['keep', 'play pvz:grasswalk', 'blend 0.5', 'drop', 'play pvz:grasswalk'])
    // A time of the same tune plays on as it is.
    await blend.show('day')
    blend.end()
    assert.deepEqual(calls.splice(0), ['drop'])
})

test("a level's lawn is its time's under its sod until that sod, laid, is the whole lawn, which then shows whole; at another time, that time's whole lawn (shownLawn)", () => {
    const loaded = load('assets/scripts/client/level/boards/definitions.ts', {})
    // Its objects are of the script's realm.
    const shownLawn = (...args: unknown[]) => ({ ...loaded.shownLawn(...args) })
    const boards = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/boards.json', 'utf8'))
    const { day, night } = boards['pvz:frontyard'].times, unsodded = boards['pvz:frontyard-unsodded'].times.day
    assert.deepEqual(shownLawn(unsodded, true, 'pvz:sod1row'), { image: 'pvz:background1unsodded', ownSod: true }, '1-1 to 1-3: their rows of sod')
    assert.deepEqual(shownLawn(unsodded, true, undefined), { image: 'pvz:background1unsodded', ownSod: true }, '1-4 rolling its sod')
    assert.deepEqual(shownLawn(unsodded, true, 'pvz:background1'), { image: 'pvz:background1', ownSod: false }, '1-4 rolled')
    assert.deepEqual(shownLawn(day, true, 'pvz:background1'), { image: 'pvz:background1', ownSod: false }, 'from 1-5 on, sodded whole')
    assert.deepEqual(shownLawn(night, true, 'pvz:background2'), { image: 'pvz:background2', ownSod: false }, 'as at night')
    assert.deepEqual(shownLawn(day, false, 'pvz:background2'), { image: 'pvz:background1', ownSod: false })
    assert.deepEqual(shownLawn(night, false, 'pvz:sod1row'), { image: 'pvz:background2', ownSod: false })
})

test("the board's shadows are drawn with the new board's picture (BoardShadows.swap), the others' as they were", () => {
    const { BoardShadows } = load('assets/scripts/client/level/BoardShadows.ts', {})
    const day = { name: 'day' }, night = { name: 'night' }, other = { name: 'other' }
    const shadows = new BoardShadows({})
    const [first, second, third] = [shadows.add(day), shadows.add(day), shadows.add(other)]
    shadows.swap(day, night)
    assert.deepEqual([first, second, third].map(shadow => shadow.frame), [night, night, other])
})

test("as the board changes, its shadows are drawn with both pictures, the new one's coming up as the old one's goes (BoardShadows.blend)", () => {
    const rows: Array<{ name: string, opacity: number, frame?: unknown, source?: any }> = []
    const uiNode = (options: { node?: any, name?: string, opacity?: number }) => {
        const node = options.node ?? {
            name: options.name, isValid: true, opacity: 255,
            addComponent: () => ({ setSource(source: unknown, frame: unknown) { Object.assign(node, { source, frame }) }, clear() {} }),
        }
        if (!options.node) rows.push(node)
        if (options.opacity !== undefined) node.opacity = options.opacity
        return { node }
    }
    const { BoardShadows } = load('assets/scripts/client/level/BoardShadows.ts', {
        cc: { Sprite: { SizeMode: { CUSTOM: 0 } } },
        '@/client/view/uiNode': { uiNode },
        '@/client/reanim/ReanimPlayer': { frameGeometry: () => ({ data: new Array(12).fill(0) }) },
        '@/client/render/KernelBatch': { KernelBatch: class {} },
        '@/shared/content/renderOrder': { renderOrder: () => 0, SHADOW_RENDER_OFFSET: 0 },
    })
    const day = { name: 'day' }, night = { name: 'night' }
    const shadows = new BoardShadows({})
    for (const row of [0, 0, 1]) Object.assign(shadows.add(day), { row, visible: true })
    // How many shadows each row's batch draws, and at what opacity.
    const drawn = () => rows.map(row => [row.name, (row.frame as { name: string }).name, row.opacity,
        row.source.writeQuads(new Float32Array(100), new Float32Array(100), 1, 9, 10)])
    shadows.sync()
    assert.deepEqual(drawn(), [['Shadows-0', 'day', 255, 2], ['Shadows-1', 'day', 255, 1]])
    shadows.blend(day, night, 0.25)
    shadows.sync()
    assert.deepEqual(drawn(), [['Shadows-0', 'day', 191, 2], ['Shadows-1', 'day', 191, 1], ['Shadows-0', 'night', 64, 2], ['Shadows-1', 'night', 64, 1]])
    shadows.blend(day, undefined, 0)
    shadows.sync()
    assert.deepEqual(drawn().map(row => row.slice(1)), [['day', 255, 2], ['day', 255, 1], ['night', 255, 0], ['night', 255, 0]], 'called off, as they were')
})

/** SpriteBlend with stub pictures, which `pictures` collects as they are made. */
function spriteBlends() {
    class Color { constructor(public r = 255, public g = 255, public b = 255, public a = 255) {} }
    const pictures: any[] = []
    const uiNode = (options: any) => {
        const node: any = { name: options.name, isValid: true, destroy() { node.isValid = sprite.isValid = false } }
        const sprite: any = { node, isValid: true, spriteFrame: options.sprite.frame, color: new Color(), size: options.size, anchor: options.anchor, trim: options.sprite.trim }
        pictures.push(sprite)
        return { node, sprite }
    }
    const cc = { Color, Sprite: { SizeMode: { CUSTOM: 0 } }, UITransform: class {} }
    const module = load('assets/scripts/client/view/SpriteBlend.ts', { cc, './uiNode': { uiNode } })
    const transform = { anchorX: 0, anchorY: 1, width: 86, height: 36 }
    const sprite = (frame: object): any => ({ isValid: true, enabled: true, spriteFrame: frame, trim: false, color: new Color(), node: { getComponent: () => transform } })
    return { module, cc, pictures, sprite, drawn: () => pictures.map(picture => [picture.spriteFrame.name, picture.color.a, picture.isValid]) }
}

test("a plant's, projectile's or mower's shadow blends with the zombies': both pictures in its place, each at its share (BoardShadows.attach, SpriteBlend)", () => {
    const { module, cc, pictures, sprite: shadowOf, drawn } = spriteBlends()
    const { BoardShadows } = load('assets/scripts/client/level/BoardShadows.ts', { cc, '@/client/view/SpriteBlend': module })
    const day = { name: 'day' }, night = { name: 'night' }
    const sprite = shadowOf(day)
    const shadows = new BoardShadows({})
    const held = shadows.attach(sprite)
    shadows.blend(day, night, 0.25)
    assert.deepEqual([sprite.enabled, drawn()], [false, [['night', 64, true], ['day', 191, true]]], 'its own sprite draws neither, the old one over the new')
    // Its objects are of the script's realm.
    assert.deepEqual(JSON.parse(JSON.stringify([pictures[0].size, pictures[0].anchor, pictures[0].trim])), [{ width: 86, height: 36 }, { x: 0, y: 1 }, false])
    shadows.blend(day, night, 0.75)
    assert.deepEqual(drawn(), [['night', 191, true], ['day', 64, true]])
    shadows.blend(day, undefined, 0)
    assert.deepEqual([sprite.enabled, sprite.spriteFrame.name, drawn()], [true, 'day', [['night', 191, false], ['day', 64, false]]], 'as it was')
    shadows.swap(day, night)
    assert.equal(sprite.spriteFrame, night)
    held.remove()
    shadows.swap(night, day)
    assert.equal(sprite.spriteFrame, night, 'gone with its entity')
})

test("a crater blends its day picture into its night one as the time of day does, and is one again once that is over (CraterView)", async () => {
    const { module, cc, sprite: spriteOf, drawn } = spriteBlends()
    const cel = (atlas: { name: string }, index: number) => ({ name: `${atlas.name}:${index ? 'night' : 'day'}` })
    const atlas = (name: string) => ({ name, originalSize: { width: 200, height: 100 } })
    const made: any[] = []
    const uiNode = (options: any) => {
        if (options.node) return { node: options.node }
        const sprite = spriteOf({ name: 'none' }), node = { isValid: true }
        sprite.node.getComponent = () => ({ anchorX: 0, anchorY: 1, width: 100, height: 100 })
        made.push(sprite)
        return { node, sprite }
    }
    const { CraterView } = load('assets/scripts/client/gridItems/CraterView.ts', {
        cc: { ...cc, Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/content/ModResources': { modResources: { sprite: async (id: string) => atlas(id) } },
        '@/client/render/atlasFrame': { getAtlasFrame: cel },
        '@/client/view/SpriteBlend': module,
        '@/client/view/uiNode': { uiNode },
        '@/shared/content/animation': { animateCurve: () => 255 },
        '@/shared/content/craters': { CRATER_FADE_TICKS: 25, CRATER_WORN_TICKS: 9000 },
        '@/shared/content/gameplay': { cellPosition: () => ({ x: 0, y: 0 }) },
        '@/shared/content/presentation': { gridItemCell: () => [0, 0] },
        '@/client/level/LevelStage': { worldTime: (_content: unknown, world: { time?: string }) => world.time ?? 'day' },
    })
    let blending: { from: string, to: string, weight: number } | undefined
    const content = { definitions: { boards: { 'pvz:frontyard': { times: { day: {}, night: { night: true } } } } },
        levels: { levels: { 'pvz:test': { board: 'pvz:frontyard', time: 'day' } } } }
    const node = { isValid: true, setPosition() {}, setScale() {} }
    const view = new CraterView({ node, content, stage: { timeBlend: () => blending } })
    await view.initialize()
    const [picture] = made
    const crater = { row: 2, column: 3, ticks: 18000, typeId: 'pvz:crater' }
    view.sync(crater, { levelId: 'pvz:test' })
    assert.deepEqual([picture.spriteFrame.name, picture.enabled, drawn()], ['pvz:crater:day', true, []])
    blending = { from: 'day', to: 'night', weight: 0.25 }
    view.sync(crater, { levelId: 'pvz:test' })
    assert.deepEqual([picture.enabled, drawn()], [false, [['pvz:crater:night', 255, true], ['pvz:crater:day', 191, true]]],
        'covering the lawn, the new one whole under the old one going out')
    // Worn meanwhile, it blends its worn pictures.
    view.sync({ ...crater, ticks: 8000 }, { levelId: 'pvz:test' })
    assert.deepEqual(drawn().map(each => each[0]), ['pvz:crater_fading:night', 'pvz:crater_fading:day'])
    // Past halfway the level is at night: its picture blends on from the day's all the same.
    blending = { from: 'day', to: 'night', weight: 0.75 }
    view.sync({ ...crater, ticks: 8000 }, { levelId: 'pvz:test', time: 'night' })
    assert.deepEqual(drawn(), [['pvz:crater_fading:night', 255, true], ['pvz:crater_fading:day', 64, true]])
    blending = undefined
    view.sync({ ...crater, ticks: 8000 }, { levelId: 'pvz:test', time: 'night' })
    assert.deepEqual([picture.spriteFrame.name, picture.enabled, drawn().map(each => each[2])], ['pvz:crater_fading:night', true, [false, false]], 'at night')
})

test("zombies getting in as the time of day changes find the door blending as the lawn does, held where the change stopped; after one, the new time's door (LevelGameOverPresenter.timeBlend)", async () => {
    const { module, cc, pictures, sprite: spriteOf, drawn } = spriteBlends()
    const made: any[] = []
    const uiNode = (options: any) => {
        const sprite = spriteOf(options.sprite?.frame ?? { name: 'none' })
        Object.assign(sprite.node, { name: options.name, position: options.position, setSiblingIndex() {} })
        made.push(sprite)
        return { node: sprite.node, sprite, graphics: { node: sprite.node } }
    }
    const { LevelGameOverPresenter } = load('assets/scripts/client/level/LevelGameOverPresenter.ts', {
        cc: { ...cc, Mask: { Type: { GRAPHICS_RECT: 0 } } },
        '@/client/content/ModResources': { modResources: { sprite: async (id: string) => ({ name: id }) } },
        '@/client/sound/SoundSystem': { SoundEffect: {}, SoundSystem: { load: async () => {}, play: async () => {} } },
        '@/client/view/SpriteBlend': module,
        '@/client/view/uiNode': { uiNode },
        '@/client/view/ClientViewport': { fitViewport() {} },
    })
    // Every time's pictures of the door lie alike (tools/pvz/doors.py): the board's game over says where.
    const house = { title: 'pvz:zombieswon', interior: { x: -126, y: 196 }, doorway: { x: -130, y: 202 }, clipX: -123, winnerY: 290, panX: 220 }
    const door = (time: string) => ({ interior: `${time} interior`, doorway: `${time} doorway` })
    const presenter = async () => {
        made.length = pictures.length = 0
        const shown = new LevelGameOverPresenter({}, {}, { getSiblingIndex: () => 3 }, {}, {}, { stop() {} }, house, { name: 'pvz:zombieswon' },
            await LevelGameOverPresenter.loadDoor(door('day')))
        return { shown, blend: shown.timeBlend(door) }
    }
    const doors = () => made.filter(sprite => sprite.node.name.startsWith('GameOverDoor'))
        .map(sprite => [sprite.node.name, sprite.spriteFrame.name, { ...sprite.node.position }, sprite.enabled])
    {
        const { shown, blend } = await presenter()
        blend.begin()
        await blend.show('night')
        blend.blend(0.25)
        shown.sync({ zombies: [] }, [])
        assert.deepEqual(doors(), [['GameOverDoorInterior', 'day interior', { x: -526, y: 104 }, false], ['GameOverDoorMask', 'day doorway', { x: -530, y: 98 }, false]],
            "where the board's house has its door, drawing the old time's and the new one's")
        assert.deepEqual(drawn(), [['night interior', 255, true], ['day interior', 191, true], ['night doorway', 255, true], ['day doorway', 191, true]],
            "each covering what is under it: the new time's whole under the old one going out")
        // The level stopped, the change is held as each frame comes.
        blend.blend(0.25)
        assert.deepEqual(drawn().map(each => each[1]), [255, 191, 255, 191])
    }
    {
        const { shown, blend } = await presenter()
        blend.begin()
        await blend.show('night')
        blend.blend(0.5)
        blend.end()
        shown.sync({ zombies: [] }, [])
        assert.deepEqual([doors(), drawn()], [[['GameOverDoorInterior', 'night interior', { x: -526, y: 104 }, true],
            ['GameOverDoorMask', 'night doorway', { x: -530, y: 98 }, true]], []], "after the change, the new time's door alone")
    }
})

test("/time's change of time of day is drawn the same by everything it blends: begun, shown the new time, blended, ended (TimeBlends)", async () => {
    const calls: string[] = []
    const blend = (name: string) => ({
        begin: () => { calls.push(`${name} begin`) },
        show: async (time: string) => { calls.push(`${name} show ${time}`) },
        blend: (weight: number) => { calls.push(`${name} blend ${weight}`) },
        end: () => { calls.push(`${name} end`) },
    })
    const settle = () => new Promise(resolve => setImmediate(resolve))
    const taken = () => calls.splice(0)
    const blends = new TimeBlends('day')
    blends.add(blend('lawn'))
    blends.sync('day', undefined)
    assert.deepEqual([taken(), blends.blending], [[], undefined])
    blends.sync('day', { from: 'day', to: 'night', ticks: 0 })
    assert.deepEqual(taken(), ['lawn begin', 'lawn show night', 'lawn blend 0'])
    blends.add(blend('covers'))
    assert.deepEqual(taken(), ['covers begin', 'covers show night', 'covers blend 0'], 'one added meanwhile joins it as it is')
    // Halfway the level goes on at the new time; the blends go by the lawn's turning, and on.
    blends.sync('night', { from: 'day', to: 'night', ticks: TIME_CHANGE_TICKS * 3 / 4 })
    assert.deepEqual([taken(), blends.blending], [['lawn blend 0.75', 'covers blend 0.75'], { from: 'day', to: 'night', weight: 0.75 }])
    blends.sync('night', undefined)
    assert.deepEqual([taken(), blends.blending], [['lawn end', 'covers end'], undefined], 'turned all the way: what they kept goes')
    // One change over and the next begun between two frames: the first ends, the next begins from where it went.
    blends.sync('night', { from: 'night', to: 'day', ticks: TIME_CHANGE_TICKS - 1 })
    taken()
    blends.sync('night', { from: 'day', to: 'night', ticks: 1 })
    assert.deepEqual(taken(), ['lawn end', 'covers end', 'lawn begin', 'covers begin', 'lawn show night', 'covers show night',
        'lawn blend 0.01', 'covers blend 0.01'])
    blends.sync('night', undefined)
    taken()
    // At a time no change was drawn to (all its frames came between two of the view's): at once.
    blends.sync('day', undefined)
    await settle()
    assert.deepEqual(taken(), ['lawn show day', 'covers show day', 'lawn end', 'covers end'])
})
