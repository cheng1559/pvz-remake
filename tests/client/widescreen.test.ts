import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { register } from '../../mods/widescreen/src/client/index'
import { extendCloud, extendFlower } from '../../mods/widescreen/src/client/animations'
import { parseReanim } from '@/shared/content/reanim'

test('screen Mod context supplies the Sprite component used by installed extensions', async () => {
    class Sprite {}
    class Node extends EventEmitter {
        static EventType = { NODE_DESTROYED: 'destroyed' }
        isValid = true
        addComponent(type: any) {
            if (!type) throw new TypeError('getComponent: Type must be non-nil')
            return new type()
        }
    }
    const node = new Node()
    let applied = false, disposed = false
    const modules: Record<string, any> = {
        cc: { Node, Sprite },
        './ModLoader': { loadInstalledMods: async () => ({ clientScreens: [{
            targetId: 'pvz:main-menu',
            apply(context: any) {
                assert.ok(context.node.addComponent(context.engine.Sprite) instanceof Sprite)
                applied = true
                return () => { disposed = true }
            },
        }] }) },
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/content/ClientScreenMods.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] })
    await exports.applyClientScreenMods('pvz:main-menu', { node })
    assert.equal(applied, true)
    node.emit('destroyed')
    assert.equal(disposed, true)
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
    exports.constrainNativeWindow(4 / 3, 4 / 3)
    const menu = new Node(), level = new Node(), dialog = new Node()
    for (const node of [menu, level, dialog]) exports.fitViewport(node)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })
    exports.expandViewport()
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
    assert.deepEqual(constraints.at(-1), [4 / 3, 4 / 3], 'removing the viewport expansion restores the fixed window ratio')
    assert.equal(policy, originalPolicy)
    assert.equal(level.width, 800)
    assert.equal(level.height, 600)
    for (const node of [level, dialog]) node.emit('destroyed')
    assert.deepEqual(view.eventNames(), [])
})

test('clouds leave the new viewport and right-hand flowers fly farther before fading', () => {
    const manifest = JSON.parse(readFileSync('assets/bundles/pvz-base/manifest.json', 'utf8'))
    const spriteSize = (id: string) => {
        const path = manifest.client.sprites[id].replace(/\/spriteFrame$/, '.png')
        const png = readFileSync('assets/bundles/pvz-base/' + path)
        return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
    }
    for (const [width, height] of [[800, 600], [1066, 600], [1600, 600], [6400 / 3, 600], [800, 1400]]) {
        for (const name of ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7']) {
            const source = parseReanim(JSON.parse(readFileSync('assets/bundles/pvz-base/reanim/selector_' + name + '.json', 'utf8')))
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
        const source = parseReanim(JSON.parse(readFileSync('assets/bundles/pvz-base/reanim/selector_' + name + '.json', 'utf8')))
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
    let visible = { width: 1066, height: 600 }, apply!: (context: any) => () => void
    const view = Object.assign(new EventEmitter(), { getVisibleSize: () => visible })
    let expanded = false
    await register({
        expandViewport(options) {
            assert.deepEqual(options, { minAspect: 4 / 3, maxAspect: 32 / 9 })
            expanded = true
        },
        async loadSprite(path) { return { originalSize: path.includes('left') ? { width: 1173, height: 1360 } : { width: 3060, height: 1120 } } },
        enhanceScreen(target, callback) { assert.equal(target, 'pvz:main-menu'); apply = callback },
    })
    assert.equal(expanded, true)
    const dispose = apply({ node: { getChildByName: () => selector }, background: { node: sky }, engine: { view, Sprite, UITransform } })
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
    dispose()
    for (const animation of animations) {
        for (const sprite of animation.sprites.values()) assert.equal(sprite.sizeMode, Sprite.SizeMode.RAW)
        for (const target of animation.transforms.values()) assert.deepEqual([target.width, target.height], [800, 600])
    }
    assert.deepEqual([transform.width, transform.height, sky.position.x, sky.position.y], [800, 600, 0, 0])
    assert.deepEqual(view.eventNames(), [])
})
