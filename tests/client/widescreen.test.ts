import { ModHost } from '@/shared/mod/ModHost'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { register } from '../../mods/widescreen/src/client/index'
import { extendCloud, extendFlower } from '../../mods/widescreen/src/client/animations'
import { installLoadingBackground } from '../../mods/widescreen/src/client/startup'
import { installGardenBackgrounds } from '../../mods/widescreen/src/client/garden'
import { parseReanim } from '@/shared/content/reanim'

test('failed widescreen assets do not alter the viewport during Mod initialization', async () => {
    let expanded = false
    const host = new ModHost('local:widescreen', { 'client/view/ClientViewport': { expandViewport() { expanded = true } } })
    await assert.rejects(register({ host, assets: { async sprite() { throw new Error('Missing artwork') } } }), /Missing artwork/)
    assert.equal(expanded, false)
})

test('viewport expands up to 32:9, then letterboxes without cropping height or extending input into the bars', () => {
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
    exports.constrainNativeWindow(4 / 3, 32 / 9)
    assert.equal(constraints.length, 0, 'web preview does not constrain its host window')
    sys.isNative = true
    for (const os of [sys.OS.OSX, sys.OS.WINDOWS, sys.OS.IOS]) {
        sys.os = os
        exports.constrainNativeWindow(4 / 3, 32 / 9)
    }
    assert.deepEqual(constraints, [[4 / 3, 32 / 9], [4 / 3, 32 / 9]], 'only native desktop windows are constrained')
    sys.os = sys.OS.OSX
    constraints.length = 0
    exports.initializeViewport()
    const menu = new Node(), level = new Node(), dialog = new Node()
    for (const node of [menu, level, dialog]) exports.fitViewport(node)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })
    exports.expandViewport()
    exports.initializeViewport()
    assert.deepEqual(constraints, [[4 / 3, 4 / 3], [4 / 3, 32 / 9]], 'the Mod opens the default fixed window aspect range')
    assert.equal(view.listenerCount('canvas-resize'), 1)
    for (const node of [menu, level, dialog]) assert.ok(Math.abs(node.width - 600 * 1600 / 900) < 1e-8)
    // Hiding/destroying a menu does not restore the old letterboxed viewport.
    menu.emit('destroyed')
    assert.equal(policy, crop)
    for (const [width, height, stageWidth, visibleWidth, expectedPolicy] of [
        [1200, 900, 800, 800, crop],
        [1600, 900, 600 * 1600 / 900, 600 * 1600 / 900, crop],
        [2100, 900, 1400, 1400, crop],
        [3200, 900, 6400 / 3, 6400 / 3, crop],
        [4000, 900, 6400 / 3, 6400 / 3, letterbox],
        [6400, 900, 6400 / 3, 6400 / 3, letterbox],
        [900, 1600, 800, 337.5, crop],
    ] as const) {
        screen.windowSize = { width, height }
        view.emit('canvas-resize')
        assert.ok(Math.abs(design.width - stageWidth) < 1e-8)
        assert.equal(design.height, 600)
        assert.equal(policy, expectedPolicy)
        for (const node of [level, dialog]) {
            assert.ok(Math.abs(node.width - visibleWidth) < 1e-8)
            assert.ok(Math.abs(node.height - 600) < 1e-8, 'wide screens always preserve the full content height')
        }
        const contentWidth = expectedPolicy === letterbox ? height * 32 / 9 : width
        assert.ok(Math.abs(visibleWidth * scale() - contentWidth) < 1e-8)
        assert.ok(Math.abs(600 * scale() - height) < 1e-8, 'content always fills the window vertically')
        if (expectedPolicy === letterbox) assert.ok((width - contentWidth) / 2 > 0, 'extra width becomes equal side bars')
    }
    exports.resetViewport()
    assert.equal(constraints.length, 2, 'teardown must not constrain the native window back to 4:3')
    assert.equal(policy, originalPolicy)
    assert.equal(level.width, 800)
    assert.equal(level.height, 600)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })
    exports.initializeViewport()
    assert.deepEqual(constraints.slice(2), [[4 / 3, 32 / 9]], 'restart with the Mod never applies a fixed 4:3 constraint')
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
    const host = new ModHost('local:widescreen', {
        'cc': { view, Sprite, UITransform, Node: { EventType: { NODE_DESTROYED: 'destroyed' } },
            js: { getClassByName: (name: string) => name === 'StartupScreen' ? StartupScreen : MenuScreen } },
        'client/screens/MainMenuScreen': { MainMenuScreen },
        'client/view/ClientViewport': { expandViewport(options: any) {
            assert.deepEqual(options, { minAspect: 4 / 3, maxAspect: 32 / 9 }); expanded = true
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

test('loading and garden backgrounds preserve scene height across viewport widths and in-flight initialization', async () => {
    class Sprite {}
    class UITransform {}
    const frame = { originalSize: { width: 2800, height: 1200 } }
    const sprite = { spriteFrame: null }
    const transform = { width: 800, height: 600, setContentSize(width: number, height: number) { Object.assign(this, { width, height }) } }
    const background = Object.assign(new EventEmitter(), { position: { x: 0, y: 0, z: 0 },
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
    class MenuScreen { async prepare(_id: string) { await Promise.resolve(); return page } }
    const gardenHost = new ModHost('local:widescreen', { cc: { Sprite, UITransform, view,
        Node: { EventType: { NODE_DESTROYED: 'destroyed' } }, js: { getClassByName: () => MenuScreen },
    } })
    await installGardenBackgrounds({ host: gardenHost, assets: { async sprite() { return frame } } })
    const menu = new MenuScreen()
    await menu.prepare('main')
    assert.equal(view.listenerCount('design-resolution-changed'), 0, 'other pages are unchanged')
    assert.equal(await menu.prepare('garden'), page)
    assert.equal(background.position.x + transform.width / 2, 0, 'garden background uses the centered page origin')
    assert.equal(background.position.y - transform.height / 2, 0)
    assert.equal(transform.height, 600, 'garden shares the fixed scene height')
    await menu.prepare('garden')
    assert.equal(view.listenerCount('design-resolution-changed'), 0, 'fixed artwork placement needs no resize listener')
    background.emit('destroyed')
    assert.equal(view.listenerCount('design-resolution-changed'), 0)
    gardenHost.dispose()
})
