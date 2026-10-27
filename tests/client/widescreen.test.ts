import { ModHost } from '@/shared/mod/ModHost'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { register } from '../../mods/widescreen/src/client/index'
import { extendCloud, extendFlower, extendDave } from '../../mods/widescreen/src/client/animations'
import { installDaveAnimation } from '../../mods/widescreen/src/client/dave'
import { installLoadingBackground } from '../../mods/widescreen/src/client/startup'
import { installPageBackgrounds } from '../../mods/widescreen/src/client/pages'
import { installStoreCar } from '../../mods/widescreen/src/client/store'
import { battlePanX, installBattleBackgrounds } from '../../mods/widescreen/src/client/battle'
import { parseReanim, sampleReanimTrack } from '@/shared/content/reanim'

test('failed widescreen assets do not alter the viewport during Mod initialization', async () => {
    let expanded = false
    const host = new ModHost('local:widescreen', { 'client/view/ClientViewport': { expandViewport() { expanded = true } } })
    await assert.rejects(register({ host, assets: { async sprite() { throw new Error('Missing artwork') } } }), /Missing artwork/)
    assert.equal(expanded, false)
})

test('battle camera endpoints fit the image edges while preserving easing and the gameplay origin', () => {
    const left = -862, right = 1033
    for (const width of [800, 600 * 16 / 9, 1400, 1700]) {
        const start = battlePanX(220, 220, -380, width, left, right)
        const end = battlePanX(-380, 220, -380, width, left, right)
        assert.ok(start + left <= -width / 2 && start + right >= width / 2)
        assert.ok(end + left <= -width / 2 && end + right >= width / 2)
        for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
            const x = battlePanX(220 - 600 * progress, 220, -380, width, left, right)
            assert.ok(Math.abs(x - (start + (end - start) * progress)) < 1e-8, 'the existing eased progress spans the adjusted endpoints')
            assert.equal(battlePanX(0, -380, 0, width, left, right), 0)
        }
        assert.equal(battlePanX(220, 0, 220, width, left, right), start, 'the losing camera uses the same house edge')
    }
    assert.equal(battlePanX(220, 220, -380, 1400, left, right), 162)
    assert.equal(battlePanX(-380, 220, -380, 1400, left, right), -333)
    assert.equal(battlePanX(-80, 220, -380, 1400, left, right), -85.5, 'movement is remapped throughout, without stopping abruptly at an edge')
    assert.equal(battlePanX(220, 220, -380, 6400 / 3, left, right), 0, 'a view wider than the image has no additional pan')
})

test('TV115 battle artwork preserves the lawn coordinates, reveal masks and game-over doorway', async () => {
    class Sprite {
        static SizeMode = { CUSTOM: 'custom' }
        spriteFrame: any; sizeMode: any; srcBlendFactor: any; dstBlendFactor: any
        materialUpdates = 0
        updateMaterial() { this.materialUpdates++ }
    }
    class UITransform {
        width = 0; height = 600; anchor: number[] = []
        setContentSize(width: number, height: number) { Object.assign(this, { width, height }) }
        setAnchorPoint(...anchor: number[]) { this.anchor = anchor }
    }
    class Node extends EventEmitter {
        static EventType = { NODE_DESTROYED: 'destroyed' }
        name = ''
        active = true
        position = { x: 0, y: 0, z: 7 }
        sprite = new Sprite(); transform = new UITransform(); children = Object.assign(new Map<string, Node>(), { slice: () => [...this.children.values()] })
        getSiblingIndex() { return 0 }
        setSiblingIndex(_index: number) {}
        getComponent(type: any) { return type === Sprite ? this.sprite : this.transform }
        getChildByName(name: string) { return this.children.get(name) }
        setPosition(x: number, y: number, z: number) { this.position = { x, y, z } }
    }
    class GameOver {
        constructor(readonly board = new Node()) {}
        presentation = { panX: 220 }
        requestedX = 0
        draw() { this.board.setPosition(this.requestedX, 0, 7) }
        sync() {
            if (!this.board.children.has('GameOverDoorInterior')) for (const name of ['GameOverDoorInterior', 'GameOverDoorMask']) {
                const node = new Node(); node.setPosition(name === 'GameOverDoorInterior' ? -526 : -530, name === 'GameOverDoorInterior' ? 75 : 98, 7); this.board.children.set(name, node)
            }
        }
    }
    class Intro {
        elapsedTicks = 0
        requestedX = 220
        constructor(readonly board: Node, readonly layout: any) {}
        sync() { this.board.setPosition(this.layout.stationary ? 0 : this.requestedX, 0, 7) }
    }
    class LevelView {
        static async create(root: any, content: any, levelId: string) {
            const board = root.slots?.board ?? new Node()
            return { level: { board: 'day' }, gameOver: new GameOver(board), intro: new Intro(board, content.presentation.levels[levelId].intro),
                entityRenderer: { syncLayerOrder() {} } }
        }
    }
    const sizes: Record<string, number[]> = { background1: [1880, 720], background1unsodded: [1880, 720],
        sod1row: [771, 127], sod3row: [771, 355], background1_gameover_interior_overlay: [70, 195], background1_gameover_mask: [47, 248] }
    const frames = Object.fromEntries(Object.entries(sizes).map(([name, [width, height]]) => [name, { originalSize: { width, height } }]))
    let width = 800
    const viewport = Object.assign(new EventEmitter(), { getVisibleSize: () => ({ width, height: 600 }) })
    const gfx = { BlendFactor: { ONE: 1, ONE_MINUS_SRC_ALPHA: 2 } }
    class ReanimPlayer {
        async load(id: string) { assert.match(id, /^local:widescreen\/bushes[345]$/) }
        play() {}
        pause() {}
    }
    class LevelEntityRenderer { sync() {}; collectLayerEntries() { return [] } }
    const host = new ModHost('local:widescreen', {
        cc: { Sprite, UITransform, Node, gfx, view: viewport }, 'client/level/LevelView': { LevelView },
        'client/level/LevelEntityRenderer': { LevelEntityRenderer },
        'client/reanim/ReanimPlayer': { ReanimPlayer },
        'client/view/uiNode': { uiNode(options: any) { return { node: {
            ...options, addComponent(Type: any) { return new Type() },
        } } } },
    })
    const originalCreate = LevelView.create, originalSync = GameOver.prototype.sync, originalDraw = GameOver.prototype.draw, originalIntro = Intro.prototype.sync
    await installBattleBackgrounds({ host, assets: { async sprite(path: string) { return frames[path.split('/').at(-1)!.replace('.png', '')] } } })
    const levels = JSON.parse(readFileSync('tools/content/pvz-base/presentation/definitions/levels.json', 'utf8'))
    const boards = { day: { background: 'pvz:background1unsodded', backgroundX: 80 } }
    for (const id of ['pvz:adventure-1-1', 'pvz:adventure-1-2', 'pvz:adventure-1-3', 'pvz:adventure-1-4', 'pvz:adventure-1-6', 'pvz:adventure-1-10']) {
        const slots = Object.fromEntries(['background', 'sodClip', 'sodRow', 'tutorialLawnFlash', 'board', 'entityLayer'].map(name => [name, new Node()]))
        slots.sodClip.transform.width = 193.25 // An in-progress reveal remains in charge of its own width.
        slots.board.children.set('ExistingSod', new Node())
        const root = Object.assign(new EventEmitter(), { slots, isValid: true, getComponentInChildren: () => slots })
        const view = await LevelView.create(root, { presentation: { boards, levels } }, id)
        assert.deepEqual(slots.background.position, { x: -860, y: 360, z: 7 })
        const layout = levels[id].intro
        const fullLawn = layout.sod === 'pvz:background1' && !layout.rolls.length
        assert.equal(slots.background.sprite.spriteFrame, fullLawn ? frames.background1 : frames.background1unsodded)
        assert.equal(slots.sodRow.active, !fullLawn, 'a completed full lawn uses one whole background without the clipped overlay')
        assert.deepEqual([slots.background.transform.width, slots.background.transform.height], [1880, 720])
        assert.equal(slots.sodClip.transform.width, 193.25, 'the intro still controls the reveal width')
        if (layout.sod === 'pvz:background1') {
            assert.deepEqual(slots.sodRow.position, { x: -472, y: 60, z: 7 })
            // Source x=472 now represents the same lawn edge at screen x=12.
            assert.equal(472 + slots.background.position.x + 400, layout.x)
        } else {
            assert.equal(slots.sodClip.position.x + 400, layout.x)
            assert.equal(slots.sodClip.position.y, 300 - layout.y)
            assert.equal(slots.sodRow.position.x, 0)
            assert.deepEqual(slots.tutorialLawnFlash.position, slots.sodClip.position)
        }
        if (layout.existingSod) {
            const node = slots.board.getChildByName('ExistingSod')!
            assert.equal(node.sprite.spriteFrame, frames[layout.existingSod.sprite.replace('pvz:', '')])
            assert.equal(node.position.x + 400, layout.existingSod.x)
        }
        if (id === 'pvz:adventure-1-4') {
            const existing = slots.board.getChildByName('ExistingSod')!
            slots.sodClip.transform.width = layout.width
            view.intro.sync()
            assert.equal(slots.background.sprite.spriteFrame, frames.background1, 'finishing the roll replaces the entire background, including the pavement')
            assert.equal(slots.sodRow.active, false)
            assert.equal(existing.active, false, 'the previous three-row overlay must not add its own edge over the full image')
            slots.sodClip.transform.width = layout.width / 2
            view.intro.sync()
            assert.equal(slots.background.sprite.spriteFrame, frames.background1unsodded, 'restoring an unfinished roll restores the unsodded background')
            assert.equal(slots.sodRow.active, true)
            assert.equal(existing.active, true)
        }
        view.gameOver.sync()
        const door = view.gameOver.board.getChildByName('GameOverDoorInterior')!
        assert.equal(door.sprite.spriteFrame, frames.background1_gameover_interior_overlay)
        assert.deepEqual([door.transform.width, door.transform.height], [70, 195])
        assert.deepEqual(door.position, { x: -526, y: 75, z: 7 }, 'TV artwork keeps the original doorway coordinates')
        const mask = view.gameOver.board.getChildByName('GameOverDoorMask')!
        assert.deepEqual(mask.position, { x: -530, y: 98, z: 7 }, 'the TV door frame keeps the original clipping origin')
        view.gameOver.sync()
        for (const node of [door, mask]) {
            assert.equal(node.sprite.srcBlendFactor, undefined, 'texture decoding in the host owns alpha normalization')
            assert.equal(node.sprite.materialUpdates, 0, 'the Mod no longer patches individual sprite blending')
        }
        assert.equal(slots.background.sprite.materialUpdates, 0, 'the surrounding scene keeps its existing blend mode')
        width = 1400
        viewport.emit('design-resolution-changed')
        view.intro.requestedX = 220
        view.intro.sync()
        assert.equal(slots.board.position.x, 160)
        view.intro.requestedX = -80
        view.intro.sync()
        assert.equal(slots.board.position.x, -80)
        view.intro.requestedX = -380
        view.intro.sync()
        assert.equal(slots.board.position.x, -320)
        width = 800
        viewport.emit('design-resolution-changed')
        assert.equal(slots.board.position.x, -380, 'resize recalculates from the original camera position')
        view.gameOver.requestedX = 220
        view.gameOver.draw()
        width = 1400
        viewport.emit('design-resolution-changed')
        assert.equal(slots.board.position.x, 160, 'resize also updates the losing camera')
        root.emit('destroyed')
        assert.equal(viewport.listenerCount('design-resolution-changed'), 0)
        width = 800
    }
    boards.day.background = 'another-mod:night'
    await LevelView.create({ isValid: true, getComponentInChildren() { throw new Error('unrelated board') } }, { presentation: { boards, levels } }, 'pvz:adventure-1-6')
    host.dispose()
    assert.equal(LevelView.create, originalCreate)
    assert.equal(GameOver.prototype.sync, originalSync)
    assert.equal(GameOver.prototype.draw, originalDraw)
    assert.equal(Intro.prototype.sync, originalIntro)
})

test('viewport expands from 4:3 to 21:9, then letterboxes outside the range without extending input into the bars', () => {
    const crop = {}, letterbox = {}, originalPolicy = {}
    let policy = originalPolicy
    let design = { width: 800, height: 600 }
    const screen = { windowSize: { width: 1600, height: 900 } }
    const sys = { isNative: false, os: 'mac', OS: { OSX: 'mac', WINDOWS: 'windows', IOS: 'ios' } }
    const constraints: number[][] = []
    const scale = () => (policy === crop ? Math.max : Math.min)(
        screen.windowSize.width / design.width, screen.windowSize.height / design.height)
    const view = Object.assign(new EventEmitter(), {
        getDesignResolutionSize: () => ({ ...design, clone: () => ({ ...design }) }),
        getResolutionPolicy: () => policy,
        getVisibleSize: () => ({ ...design }),
        getScaleX: scale, getScaleY: scale,
        setDesignResolutionSize(width: number, height: number, next: object) {
            design = { width, height }
            policy = next
            view.emit('design-resolution-changed')
        },
    })
    class Node extends EventEmitter {
        static EventType = { NODE_DESTROYED: 'destroyed' }
        isValid = true
        width = 0
        height = 0
        getComponent() { return { setContentSize: (size: any) => Object.assign(this, size) } }
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/view/ClientViewport.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports,
        jsb: { setWindowAspectRatio: (...args: number[]) => { constraints.push(args); return true } },
        require: () => ({ Node, view, screen, sys, ResolutionPolicy: { NO_BORDER: crop, SHOW_ALL: letterbox } }),
    })
    exports.constrainNativeWindow(4 / 3, 21 / 9)
    assert.equal(constraints.length, 0, 'web preview does not constrain its host window')
    sys.isNative = true
    for (const os of [sys.OS.OSX, sys.OS.WINDOWS, sys.OS.IOS]) {
        sys.os = os
        exports.constrainNativeWindow(4 / 3, 21 / 9)
    }
    assert.deepEqual(constraints, [[4 / 3, 21 / 9], [4 / 3, 21 / 9]], 'only native desktop windows are constrained')
    sys.os = sys.OS.OSX
    constraints.length = 0
    exports.initializeViewport()
    const menu = new Node(), level = new Node(), dialog = new Node()
    for (const node of [menu, level, dialog]) exports.fitViewport(node)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 21 / 9 })
    exports.expandViewport()
    exports.initializeViewport()
    assert.deepEqual(constraints, [[4 / 3, 4 / 3], [4 / 3, 21 / 9]], 'the Mod opens the default fixed window aspect range')
    assert.equal(view.listenerCount('canvas-resize'), 1)
    for (const node of [menu, level, dialog]) assert.ok(Math.abs(node.width - 600 * 1600 / 900) < 1e-8)
    // Hiding/destroying a menu does not restore the old letterboxed viewport.
    menu.emit('destroyed')
    assert.equal(policy, crop)
    for (const [width, height, stageWidth, visibleWidth, expectedPolicy] of [
        [1200, 900, 800, 800, crop],
        [1600, 900, 600 * 1600 / 900, 600 * 1600 / 900, crop],
        [2100, 900, 1400, 1400, crop],
        [2200, 900, 1400, 1400, letterbox],
        [3200, 900, 1400, 1400, letterbox],
        [4000, 900, 1400, 1400, letterbox],
        [6400, 900, 1400, 1400, letterbox],
        [900, 900, 800, 800, letterbox],
        [900, 1600, 800, 800, letterbox],
    ] as const) {
        screen.windowSize = { width, height }
        view.emit('canvas-resize')
        assert.ok(Math.abs(design.width - stageWidth) < 1e-8)
        assert.equal(design.height, 600)
        assert.equal(policy, expectedPolicy)
        for (const node of [level, dialog]) {
            assert.ok(Math.abs(node.width - visibleWidth) < 1e-8)
            assert.ok(Math.abs(node.height - 600) < 1e-8, 'the full logical content height is preserved')
        }
        const contentWidth = Math.min(width, height * stageWidth / 600)
        const contentHeight = Math.min(height, width * 600 / stageWidth)
        assert.ok(Math.abs(visibleWidth * scale() - contentWidth) < 1e-8)
        assert.ok(Math.abs(600 * scale() - contentHeight) < 1e-8)
        if (width / height < 4 / 3) assert.ok((height - contentHeight) / 2 > 0, 'narrow windows have top and bottom bars')
        if (width / height > 21 / 9) assert.ok((width - contentWidth) / 2 > 0, 'wide windows have side bars')
    }
    exports.resetViewport()
    assert.equal(constraints.length, 2, 'teardown must not constrain the native window back to 4:3')
    assert.equal(policy, originalPolicy)
    assert.equal(level.width, 800)
    assert.equal(level.height, 600)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 21 / 9 })
    exports.initializeViewport()
    assert.deepEqual(constraints.slice(2), [[4 / 3, 21 / 9]], 'restart with the Mod never applies a fixed 4:3 constraint')
    exports.resetViewport()
    exports.initializeViewport()
    assert.deepEqual(constraints.at(-1), [4 / 3, 4 / 3], 'startup without the Mod restores the fixed window ratio')
    for (const node of [level, dialog]) node.emit('destroyed')
    assert.deepEqual(view.eventNames(), [])
})

test('clouds leave the new viewport and right-hand flowers fly farther before fading', () => {
    const manifest = JSON.parse(readFileSync('tools/generated/pvz-base/manifest.json', 'utf8'))
    const spriteSize = (id: string) => {
        const path = manifest.client.sprites[id].replace(/\/spriteFrame$/, '.png')
        const png = readFileSync('tools/generated/pvz-base/' + path)
        return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
    }
    for (const [width, height] of [[800, 600], [1066, 600], [1600, 600], [6400 / 3, 600], [800, 1400]]) {
        for (const name of ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']) {
            const source = parseReanim(JSON.parse(readFileSync('tools/generated/pvz-base/reanim/selector_' + name + '.json', 'utf8')))
            const animation = parseReanim(extendCloud(source, width, height, spriteSize))
            for (const track of animation.tracks) {
                const frames = track.keyframes.filter(frame => frame.sprite)
                if (!frames.length) continue
                const size = spriteSize(frames[0].sprite!)
                const radius = Math.hypot(size.width, size.height) * Math.max(...frames.map(frame => Math.max(Math.abs(frame.scaleX), Math.abs(frame.scaleY))))
                for (const frame of [frames[0], frames[frames.length - 1]]) {
                    assert.ok(frame.x + radius <= 400 - width / 2 + 1e-6 || frame.x - radius >= 400 + width / 2 - 1e-6
                        || frame.y + radius <= 300 - height / 2 + 1e-6 || frame.y - radius >= 300 + height / 2 - 1e-6,
                    name + ' must be fully outside the viewport at both ends')
                }
                const original = source.tracks.find(candidate => candidate.id === track.id)!.keyframes.filter(frame => frame.sprite)
                const middle = original[Math.floor(original.length / 2)]
                const kept = frames.find(frame => frame.x === middle.x && frame.y === middle.y)!
                assert.ok(kept, 'the original path is retained')
                const shift = kept.timeSeconds - middle.timeSeconds
                for (const frame of original) assert.ok(frames.some(candidate =>
                    Math.abs(candidate.timeSeconds - frame.timeSeconds - shift) < 1e-6
                    && candidate.x === frame.x && candidate.y === frame.y), 'original cloud motion keeps its timing')
            }
        }
    }
    for (const name of ['flower1', 'flower3']) {
        const source = parseReanim(JSON.parse(readFileSync('tools/generated/pvz-base/reanim/selector_' + name + '.json', 'utf8')))
        const animation = parseReanim(extendFlower(source))
        for (const track of animation.tracks.filter(track => track.keyframes[0].sprite)) {
            const original = source.tracks.find(candidate => candidate.id === track.id)!.keyframes
            assert.deepEqual(track.keyframes.slice(0, original.length), original, 'the original flight stays fully visible')
            const last = original[original.length - 1], flight = track.keyframes[track.keyframes.length - 2]
            const faded = track.keyframes[track.keyframes.length - 1]
            assert.ok(Math.abs(Math.hypot(flight.x - last.x, flight.y - last.y) - 180) < 1e-6)
            assert.equal(flight.alpha, 1, 'fading only starts after the extra flight')
            assert.ok(Math.abs(faded.timeSeconds - flight.timeSeconds - 0.25) < 1e-6)
            assert.equal(track.keyframes[0].alpha, 1)
            assert.equal(faded.alpha, 0)
        }
        assert.equal(source.tracks[1].keyframes[source.tracks[1].keyframes.length - 1].alpha, 1)
    }
})

test('Dave transitions cover the added margin without changing timing, deforming poses or accumulating on replay', () => {
    const sources = Object.fromEntries(['enter', 'leave'].map(name => [name,
        parseReanim(JSON.parse(readFileSync(`tools/generated/pvz-base/reanim/dave_${name}.json`, 'utf8'))),
    ]))
    for (const width of [800, 1066, 1400, 6400 / 3]) for (const name of ['enter', 'leave']) {
        const source = sources[name], original = structuredClone(source)
        const extended = parseReanim(extendDave(source, width, name === 'enter'))
        const body = source.tracks.find(track => track.id === 'Dave_innerpants')!
        const shiftedBody = extended.tracks.find(track => track.id === 'Dave_innerpants')!
        const originalTravel = body.keyframes.at(-1)!.x - body.keyframes[0].x
        const newTravel = shiftedBody.keyframes.at(-1)!.x - shiftedBody.keyframes[0].x
        const speedScale = newTravel / originalTravel
        for (let index = 1; index < body.keyframes.length; index++) {
            const originalStep = body.keyframes[index].x - body.keyframes[index - 1].x
            const newStep = shiftedBody.keyframes[index].x - shiftedBody.keyframes[index - 1].x
            assert.ok(Math.abs(newStep - originalStep * speedScale) < 1e-6, 'the original movement curve scales uniformly, including its stationary frames')
        }
        assert.equal(extended.durationSeconds, source.durationSeconds, 'widescreen must not delay either transition')
        assert.deepEqual(source, original, 'cached source data must not change')
        if (width === 800) assert.deepEqual(extended, source)
        for (const [index, track] of source.tracks.entries()) {
            const target = extended.tracks[index]
            assert.equal(target.keyframes.length, track.keyframes.length)
            for (const [frameIndex, frame] of track.keyframes.entries()) {
                const pose = target.keyframes[frameIndex]
                assert.deepEqual({ ...pose, x: frame.x }, frame, 'only horizontal translation changes')
                const reference = source.tracks[0].keyframes[frameIndex]
                const translated = extended.tracks[0].keyframes[frameIndex]
                assert.ok(Math.abs((pose.x - frame.x) - (translated.x - reference.x)) < 1e-6, 'all body parts move together')
            }
            const time = name === 'enter' ? 0 : extended.durationSeconds
            const endpoint = sampleReanimTrack(target, time)!
            const originalEnd = name === 'enter' ? track.keyframes[0] : track.keyframes.at(-1)!
            assert.ok(Math.abs(endpoint.x - originalEnd.x + (width - 800) / 2) < 1e-6)
            const stationaryFrame = name === 'enter' ? track.keyframes.length - 1 : 0
            assert.deepEqual(target.keyframes[stationaryFrame], track.keyframes[stationaryFrame], 'the idle-side pose stays in place')
        }
    }

    let width = 1400, played = 0
    class ReanimPlayer {
        loadedId = 'pvz:dave_enter'
        data = structuredClone(sources.enter)
        getAnimation() { return structuredClone(this.data) }
        replaceAnimation(data: typeof this.data) { this.data = data }
        play() { played++ }
    }
    const host = new ModHost('local:widescreen', {
        cc: { view: { getVisibleSize: () => ({ width, height: 600 }) } },
        'client/reanim/ReanimPlayer': { ReanimPlayer },
    })
    installDaveAnimation({ host, assets: {} as any })
    try {
        const player = new ReanimPlayer()
        player.play()
        const first = structuredClone(player.data)
        player.play()
        assert.deepEqual(player.data, first)
        width = 800
        player.play()
        assert.deepEqual(player.data, sources.enter, 'a later 4:3 entry restores the original clip')
        assert.equal(played, 3)
    } finally { host.dispose() }
})

test('menu artwork preserves track origins and follows its parent without owning the viewport policy', async () => {
    const point = (x = 0, y = 0, z = 0): any => ({ x, y, z, clone: () => point(x, y, z) })
    class Sprite { static SizeMode = { RAW: 0, CUSTOM: 1 } }
    class UITransform {}
    const animations = ['open', 'sign'].map(() => ({
        isValid: true, overrides: new Map(),
        sprites: new Map(['Left', 'Center', 'Right'].map(name => ['SelectorScreen_BG_' + name, { sizeMode: Sprite.SizeMode.RAW }])),
        transforms: new Map(['Left', 'Center', 'Right'].map(name => ['SelectorScreen_BG_' + name, {
            width: 800, height: 600,
            get contentSize() { return { clone: () => ({ width: this.width, height: this.height }) } },
            setContentSize(width: any, height?: number) {
                this.width = typeof width === 'number' ? width : width.width
                this.height = typeof width === 'number' ? height! : width.height
            },
            anchorPoint: point(0, 1),
            setAnchorPoint(x: any, y?: number) { this.anchorPoint = typeof x === 'number' ? point(x, y) : x },
        }])),
        getTrackNode(id: string): any { return { getComponent: (type: any) => type === Sprite ? this.sprites.get(id) : this.transforms.get(id) } },
        setTrackSpriteOverride(id: string, frame: any) { this.overrides.set(id, frame) },
    }))
    const selector = { children: [{ name: 'flower2', getComponent() { assert.fail('the leftmost flower must keep its original animation') } }], getChildByName: (name: string) => ({
        getComponent: () => animations[name === 'open' ? 0 : 1],
    }) }
    const transform = {
        width: 800, height: 600, contentSize: { clone: () => ({ width: 800, height: 600 }) },
        setContentSize(width: number | { width: number, height: number }, height?: number) {
            this.width = typeof width === 'number' ? width : width.width
            this.height = typeof width === 'number' ? height! : width.height
        },
    }
    const sky = { isValid: true, parent: selector, position: point(),
        getComponent: () => transform,
        setPosition(x: any, y?: number, z = 0) { this.position = typeof x === 'number' ? point(x, y, z) : x },
    }
    let visible = { width: 1066, height: 600 }
    const view = Object.assign(new EventEmitter(), { getVisibleSize: () => visible })
    let expanded = false
    const node = Object.assign(new EventEmitter(), { isValid: true, getChildByName: () => selector })
    let initialized = false
    class MainMenuScreen {
        node = node
        background = { node: sky }
        async initialize() { initialized = true }
    }
    class StartupScreen { render() {} }
    class MenuScreen { async prepare() {} }
    class StoreScreen { async initialize() {}; renderItem() {}; turnPage() {}; update() {} }
    const host = new ModHost('local:widescreen', {
        'cc': { view, Sprite, UITransform, Node: { EventType: { NODE_DESTROYED: 'destroyed' } },
            js: { getClassByName: (name: string) => name === 'StartupScreen' ? StartupScreen : name === 'PvZStoreScreen' ? StoreScreen : MenuScreen } },
        'client/screens/MainMenuScreen': { MainMenuScreen },
        'client/level/LevelView': { LevelView: class { static async create() {} } },
        'client/view/uiNode': {},
        'client/level/LevelEntityRenderer': { LevelEntityRenderer: class { sync() {}; collectLayerEntries() { return [] } } },
        'client/reanim/ReanimPlayer': { ReanimPlayer: class { play() {} } },
        'client/view/ClientViewport': { expandViewport(options: any) {
            assert.deepEqual(options, { minAspect: 4 / 3, maxAspect: 21 / 9 }); expanded = true
        } },
    })
    await register({ host, assets: {
        async sprite(path: string) { return { originalSize: path.includes('left') ? { width: 1173, height: 1360 } : { width: 3060, height: 1120 } } },
    } })
    assert.equal(expanded, true)
    await new MainMenuScreen().initialize()
    assert.equal(initialized, true, 'artwork must be installed after the real screen initialization')
    assert.equal(sky.parent, selector, 'sky remains attached during achievement slides and page visibility changes')
    assert.deepEqual([transform.width, transform.height, sky.position.x, sky.position.y], [1066, 600, -133, 0])
    for (const animation of animations) {
        const anchor = animation.transforms.get('SelectorScreen_BG_Left')!.anchorPoint
        assert.equal(anchor.x * 928, 452)
        assert.ok(Math.abs((1 - anchor.y) * 1076 - 396) < 1e-9)
        const left = animation.transforms.get('SelectorScreen_BG_Left')!
        const right = animation.transforms.get('SelectorScreen_BG_Right')!
        assert.deepEqual([left.width, left.height, right.width, right.height], [928, 1076, 1530, 560], 'HD pixels cannot enlarge the scene')
    }
    visible = { width: 6400 / 3, height: 600 }
    view.emit('design-resolution-changed')
    assert.deepEqual([transform.width, transform.height, sky.position.x, sky.position.y], [6400 / 3, 600, 400 - 3200 / 3, 0])
    node.emit('destroyed')
    host.dispose()
    for (const animation of animations) {
        for (const sprite of animation.sprites.values()) assert.equal(sprite.sizeMode, Sprite.SizeMode.RAW)
        for (const target of animation.transforms.values()) assert.deepEqual([target.width, target.height], [800, 600])
    }
    assert.deepEqual([transform.width, transform.height, sky.position.x, sky.position.y], [800, 600, 0, 0])
    assert.deepEqual(view.eventNames(), [])
})

test('store car matches widescreen-pvz in both hatch states and keeps the original controls', async () => {
    const open = { originalSize: { width: 788, height: 495 } }, closed = {}, hatch = {}, originalOpen = {}, originalClosed = {}
    class UITransform {}
    class Sprite { static SizeMode = { CUSTOM: 'custom' } }
    const transform = { width: 604, height: 462,
        setContentSize(width: number, height: number) { Object.assign(this, { width, height }) },
    }
    const node = { position: { x: 196, y: -138 }, getComponent: () => transform }
    class StoreScreen {
        node = { isValid: true }
        sprites = { store_car: originalOpen, store_carclosed: originalClosed }
        car = { node, spriteFrame: originalOpen }
        hatchSprite = { spriteFrame: null }
        hatch = { getComponent: () => this.hatchSprite }
        controls = {}
        async initialize(shut: boolean) { this.car.spriteFrame = shut ? originalClosed : originalOpen }
        turnPage(shut: boolean) { this.car.spriteFrame = this.sprites[shut ? 'store_carclosed' : 'store_car'] }
    }
    const host = new ModHost('local:widescreen', { cc: { Sprite, UITransform, js: { getClassByName: () => StoreScreen } } })
    await installStoreCar({ host, assets: { async sprite(path: string) { return path.endsWith('store_car.png') ? open : path.endsWith('store_carclosed.png') ? closed : hatch } } })
    try {
        for (const shut of [false, true]) {
            const store = new StoreScreen(), controls = store.controls
            await store.initialize(shut)
            assert.equal(store.car.spriteFrame, shut ? closed : open)
            assert.equal(store.hatchSprite.spriteFrame, hatch)
            store.turnPage(!shut)
            assert.equal(store.car.spriteFrame, shut ? open : closed)
            assert.deepEqual([transform.width, transform.height], [788, 495])
            assert.deepEqual(node.position, { x: 196, y: -138 })
            assert.equal(store.controls, controls)
        }
        const wide = JSON.parse(readFileSync('mods/widescreen/content.json', 'utf8')).resources.sprites
        const pvz = JSON.parse(readFileSync('mods/widescreen-pvz/content.json', 'utf8')).resources.sprites
        for (const name of ['store_car', 'store_carclosed', 'store_hatchbackopen']) {
            const entry = wide[`local:widescreen/${name}`], original = pvz[`local:widescreen-pvz/${name}`]
            assert.deepEqual(entry, original, 'dimensions, pixel density and alpha mode match the other Mod')
            assert.deepEqual(readFileSync(`mods/widescreen/${entry.file}`), readFileSync(`mods/widescreen-pvz/${original.file}`))
        }
    } finally { host.dispose() }
})

test('loading, gardens, store, almanac and challenge pages retain their standard background sizes', async () => {
    class Sprite { static SizeMode = { CUSTOM: 0 } }
    class UITransform {}
    const frame = { originalSize: { width: 2800, height: 1200 } }
    const sprite = { spriteFrame: null }
    const transform = { width: 800, height: 600, setContentSize(width: number, height: number) { Object.assign(this, { width, height }) } }
    const background = Object.assign(new EventEmitter(), { position: { x: 0, y: 0, z: 0 },
        getSiblingIndex: () => 2,
        getComponent: (type: any) => type === Sprite ? sprite : transform,
        setPosition(x: number, y: number, z: number) { this.position = { x, y, z } },
    })
    const logo = {}, bar = {}
    const title = Object.assign(new EventEmitter(), { children: [background, logo, bar] })
    let visible = { width: 1400, height: 600 }, draws = 0
    const view = Object.assign(new EventEmitter(), { getVisibleSize: () => visible })
    class StartupScreen {
        title?: typeof title
        render() {
            if (!this.title) return
            assert.equal(sprite.spriteFrame, frame, 'replacement is installed before the first title draw')
            draws++
        }
    }
    const startup = new StartupScreen()
    startup.render() // Original startup exists before Mod registration finishes.
    const host = new ModHost('local:widescreen', { cc: { Sprite, UITransform, view,
        Node: { EventType: { NODE_DESTROYED: 'destroyed' } },
        js: { getClassByName(name: string) { assert.equal(name, 'StartupScreen'); return StartupScreen } },
    } })
    await installLoadingBackground({ host, assets: { async sprite() { return frame } } })
    startup.render()
    startup.title = title // Its original loadTitle completes after registration.
    startup.render()
    startup.render()
    assert.equal(draws, 2)
    assert.equal(view.listenerCount('design-resolution-changed'), 0)
    for (const width of [800, 1066, 1400, 6400 / 3]) {
        visible = { width, height: 600 }
        view.emit('design-resolution-changed')
        assert.equal(transform.height, 600, 'wide viewports must not enlarge or crop the scene vertically')
        assert.equal(transform.width, 1400, 'artwork width stays proportional; wider viewports show black side bars')
        assert.equal(background.position.x + transform.width / 2, 400)
        assert.equal(background.position.y - transform.height / 2, -300)
        assert.deepEqual(title.children.slice(1), [logo, bar], 'existing foreground and interaction nodes stay in place')
    }
    background.emit('destroyed')
    assert.equal(view.listenerCount('design-resolution-changed'), 0)
    host.dispose()

    const page = { root: { isValid: true, getChildByName: () => background } }
    const storePage = { root: { isValid: true, getChildByName(name: string) {
        assert.equal(name, 'store_background')
        return background
    } } }
    const menuBackgrounds: Record<string, string> = {
        almanac: 'almanac_indexback', plants: 'almanac_plantback', zombies: 'almanac_zombieback',
        minigames: 'challenge_background', puzzle: 'challenge_background', survival: 'challenge_background',
    }
    const pages = new Map(['mushroom', 'aquarium', 'tree', ...Object.keys(menuBackgrounds)].map(id => [id, {
        root: { isValid: true, getChildByName(name: string) {
            if (menuBackgrounds[id]) assert.equal(name, menuBackgrounds[id], `${id} replaces its own background node`)
            return background
        } },
    }]))
    class MenuScreen { async prepare(id: string) { await Promise.resolve(); return id === 'store' ? storePage : pages.get(id) ?? page } }
    const gardenHost = new ModHost('local:widescreen', { cc: { Sprite, UITransform, view,
        Node: { EventType: { NODE_DESTROYED: 'destroyed' } }, js: { getClassByName: () => MenuScreen },
    } })
    const sprites = JSON.parse(readFileSync('mods/widescreen/content.json', 'utf8')).resources.sprites
    const pvzSprites = JSON.parse(readFileSync('mods/widescreen-pvz/content.json', 'utf8')).resources.sprites
    const loaded: string[] = []
    await installPageBackgrounds({ host: gardenHost, assets: { async sprite(path: string) {
        loaded.push(path)
        const name = path.split('/').at(-1)!.replace('.png', '')
        const entry = sprites[`local:widescreen/${name}`]
        if (['background_greenhouse', 'background_mushroomgarden', 'aquarium1', 'tree_bg'].includes(name)) {
            const original = pvzSprites[`local:widescreen-pvz/${name}`]
            assert.deepEqual(entry, original, 'garden dimensions, density and alpha mode match widescreen-pvz')
            assert.deepEqual(readFileSync(`mods/widescreen/${entry.file}`), readFileSync(`mods/widescreen-pvz/${original.file}`))
        }
        return { originalSize: { width: entry.width, height: entry.height } }
    } } })
    assert.equal(loaded.filter(path => path.endsWith('/challenge_background.png')).length, 1, 'three challenge pages share one loaded frame')
    const menu = new MenuScreen()
    await menu.prepare('main')
    assert.equal(view.listenerCount('design-resolution-changed'), 0, 'other pages are unchanged')
    for (const id of ['garden', 'mushroom', 'aquarium', 'tree', 'store', ...Object.keys(menuBackgrounds)]) {
        const prepared = await menu.prepare(id)
        assert.equal(prepared, id === 'store' ? storePage : pages.get(id) ?? page)
        const width = id === 'store' ? 1280 : 1066, height = id === 'store' ? 720 : 600
        assert.deepEqual([transform.width, transform.height], [width, height], `${id} uses its standard scene size`)
        assert.deepEqual(background.position, { x: -width / 2, y: height / 2, z: 0 }, 'backgrounds remain centered')
        const source = (sprite.spriteFrame as any).originalSize
        assert.equal(transform.width / source.width, transform.height / source.height, 'background proportions are preserved')
        for (const visibleWidth of [800, 1066, 1400]) {
            visible = { width: visibleWidth, height: 600 }
            view.emit('design-resolution-changed')
            await menu.prepare(id)
            assert.deepEqual([transform.width, transform.height], [width, height], 'retained pages keep their standard artwork size')
        }
    }
    assert.equal(view.listenerCount('design-resolution-changed'), 0, 'fixed artwork placement needs no resize listener')
    background.emit('destroyed')
    assert.equal(view.listenerCount('design-resolution-changed'), 0)
    gardenHost.dispose()
})
