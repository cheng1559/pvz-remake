import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

class Color {
    static WHITE = new Color()
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    clone() { return new Color(this.r, this.g, this.b, this.a) }
    equals(other: Color) { return this.r === other.r && this.g === other.g && this.b === other.b && this.a === other.a }
}
class Sprite { color = Color.WHITE.clone() }
class Node {
    isValid = true
    active = false
    children: Node[] = []
    sprite?: Sprite
    constructor(public parent?: Node) { parent?.children.push(this) }
    setScale() {}
    destroy() {
        this.isValid = false
        for (const child of [...this.children]) child.destroy()
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this)
    }
    getComponentsInChildren(): Sprite[] { return [...(this.sprite ? [this.sprite] : []), ...this.children.flatMap(child => child.getComponentsInChildren())] }
}

function setup() {
    const settings = { hdSeedPacketsEnabled: true }
    const classes: Record<string, any> = {}
    const errors: unknown[][] = []
    class Frame { reset(info: unknown) { Object.assign(this, info) } }
    class Rect { constructor(public x: number, public y: number, public width: number, public height: number) {} }
    const modules: Record<string, any> = {
        cc: { Component: class {}, Color, Sprite, SpriteFrame: Frame, Rect, Size: Rect, Vec2: Rect,
            isValid: (node: Node) => node.isValid, _decorator: { ccclass: (name: string) => (value: unknown) => { classes[name] = value; return value } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/client/content/SpriteDensity': { applySpriteDensity() {} },
        '@/client/view/uiNode': { uiNode: (options: any) => {
            const node = new Node(options.parent)
            node.active = options.active ?? true
            return { node }
        } },
    }
    const load = (name: string) => {
        const module = { exports: {} as Record<string, any> }
        const code = transpileModule(readFileSync(`assets/scripts/client/hud/${name}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
            console: { error: (...args: unknown[]) => errors.push(args) } })
        return module.exports
    }
    modules['./PlantPreview'] = load('PlantPreview')
    load('SeedPacketRenderer')
    return { settings, classes, errors }
}
const flush = () => new Promise(setImmediate)

test('packet backgrounds use stable atlas IDs independently of the rendered-portrait setting', async () => {
    const { classes, errors } = setup()
    const paths: string[] = []
    const frame = { originalSize: { width: 450, height: 70 }, rect: { x: 0, y: 0 }, texture: {} }
    const sprite = { spriteFrame: null as any }
    const background = new classes.SeedPacketBackground()
    background.node = new Node()
    background.initialize(sprite, { seedType: 0, loadSprite: (name: string) => {
        paths.push(name)
        return Promise.resolve(frame)
    } })
    await flush()
    assert.deepEqual(paths, ['seeds'])
    assert.equal(sprite.spriteFrame.rect.x, 100)
    assert.equal(sprite.spriteFrame.rect.width, 50)
    const upgrade = new classes.SeedPacketBackground()
    upgrade.node = new Node()
    const upgradeSprite = { spriteFrame: null }
    upgrade.initialize(upgradeSprite, { seedType: 1, upgrade: true, loadSprite: (name: string) => {
        paths.push(name)
        return Promise.reject(new Error('missing selected atlas'))
    } })
    await flush()
    assert.deepEqual(paths, ['seeds', 'seeds'])
    assert.equal(upgradeSprite.spriteFrame, null)
    assert.equal(errors.length, 1)
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
        preview.players.push({ setColorOverride(color: Color) { tint = color.clone() } })
    }
    preview.initialize(2, async (root: Node) => {
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
