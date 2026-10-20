import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('UI labels reuse prefab nodes and content fonts while preserving HUD baselines and pixel alignment', () => {
    const modules: Record<string, any> = { cc: { Color: { WHITE: {} } } }
    const load = (path: string) => {
        const module = { exports: {} as Record<string, any> }
        const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
        })
        runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
        return module.exports
    }
    class Renderer {
        fontSize = 0
        font: unknown
        setFontAssets(font: unknown) { this.font = font }
        forceRebuild() {}
    }
    class Node {
        name = 'SunText'
        position = { x: 0, y: 0 }
        renderer = new Renderer()
        getComponent() { return this.renderer }
        addComponent() { assert.fail('binding an existing text node must not add another renderer') }
        setPosition(x: number, y: number) { this.position = { x, y } }
    }
    modules['@/client/font'] = { ...load('client/font/FontMetrics'), FontRenderer: Renderer }
    modules['@/client/view/uiNode'] = { uiNode: (options: any) => ({ node: options.node ?? new Node() }) }
    modules['./UILabel'] = load('client/ui/UILabel')
    const { UI } = load('client/ui/UI')
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
})
