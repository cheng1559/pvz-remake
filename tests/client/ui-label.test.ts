import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

function load(path: string, modules: Record<string, any>) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    return module.exports
}

test('UI labels reuse prefab nodes and content fonts while preserving HUD baselines and pixel alignment', () => {
    const modules: Record<string, any> = { cc: { Color: { WHITE: {} } } }
    class Renderer {
        fontSize = 0
        lineSpacing = 0
        builds: number[] = []
        font: unknown
        setFontAssets(font: unknown) { this.font = font }
        forceRebuild() { this.builds.push(this.lineSpacing) }
    }
    class Node {
        name = 'SunText'
        position = { x: 0, y: 0 }
        renderer = new Renderer()
        getComponent() { return this.renderer }
        addComponent() { assert.fail('binding an existing text node must not add another renderer') }
        setPosition(x: number, y: number) { this.position = { x, y } }
    }
    modules['@/client/font'] = { ...load('client/font/FontMetrics', modules), FontRenderer: Renderer }
    modules['@/client/view/uiNode'] = { uiNode: (options: any) => ({ node: options.node ?? new Node() }) }
    modules['./UILabel'] = load('client/ui/UILabel', modules)
    const { UI } = load('client/ui/UI', modules)
    const font = { config: { json: {
        defaultPointSize: 10, layers: [{ ascent: 10, height: 12, spacing: 0, chars: { 49: { width: 3 } } }],
    } } }
    const ui = new UI({ fonts: { label: {} } })
    const node = new Node()
    const label = ui.label({}, { node, font, text: '1', x: 34, y: 78, align: 'center', baseline: true, pixelAlign: true })
    assert.equal(label.node, node)
    assert.equal(label.renderer, node.renderer)
    assert.equal(node.renderer.font, font, 'the content/Mod font takes precedence over the UI preset')
    assert.equal(node.name, 'SunText')
    assert.deepEqual(node.position, { x: 33, y: -68 })
    label.text = '11'
    assert.deepEqual(node.position, { x: 31, y: -68 })
    const level = ui.label({}, { font, text: '11', x: 780, y: 595, align: 'right', baseline: true })
    assert.deepEqual(level.node.position, { x: 774, y: -585 })
    level.setPosition(593, 595)
    level.text = '1'
    assert.deepEqual(level.node.position, { x: 590, y: -585 })
    const description = ui.label({}, { font, text: '11', lineSpacing: 12 })
    assert.deepEqual(description.renderer.builds, [12], 'achievement spacing is applied before the first text build')
})

test('activating prepared bitmap text preserves glyph nodes and still renders later changes', () => {
    const pending: Array<() => void> = []
    let created = 0
    class Color {
        constructor(public r: number, public g: number, public b: number, public a = 255) {}
    }
    const modules: Record<string, any> = {
        cc: {
            Component: class { scheduleOnce(callback: () => void) { pending.push(callback) } },
            Color, Rect: class {}, SpriteFrame: class { destroy() {} },
            Sprite: { SizeMode: { CUSTOM: 0 }, Type: { SIMPLE: 0 } },
            _decorator: { ccclass: () => (value: unknown) => value, executeInEditMode: () => (value: unknown) => value, property() {} },
        },
    }
    modules['./FontMetrics'] = load('client/font/FontMetrics', modules)
    const root = { children: [] as any[], getComponent: () => ({ setContentSize() {} }) }
    modules['@/client/view/uiNode'] = { uiNode: (options: any) => {
        created++
        const node = { isValid: true, name: options.name, removeFromParent() {
            root.children.splice(root.children.indexOf(this), 1)
        }, destroy() { this.isValid = false } }
        root.children.push(node)
        return { node, sprite: { spriteFrame: options.sprite.frame } }
    } }
    const { FontRenderer } = load('client/font/FontRenderer', modules)
    const renderer = new FontRenderer()
    renderer.node = root
    renderer.setFontAssets({
        config: { json: JSON.parse(readFileSync('assets/resources/fonts/dwarventodcraft12.json', 'utf8')) },
        textures: [{}],
    })
    renderer.string = 'AB'
    renderer.forceRebuild()
    const prepared = [...root.children]
    assert.equal(created, 2)
    renderer.onLoad()
    renderer.onEnable()
    while (pending.length) pending.shift()!()
    assert.deepEqual(root.children, prepared, 'activation must preserve the text already built during page preparation')
    assert.equal(created, 2, 'activation cannot create another set of glyphs')
    renderer.string = 'ABC'
    renderer.onEnable()
    while (pending.length) pending.shift()!()
    assert.equal(root.children.length, 3, 'dirty text still rebuilds on activation')
    assert.equal(created, 5)
    renderer.onDestroy()
})
