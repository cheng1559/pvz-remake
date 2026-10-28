import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('FPS display counts draws in real time at the original game area corner', () => {
    let now = 0, draw: (() => void) | undefined
    const director = {
        on(_event: string, callback: () => void, target: unknown) { draw = callback.bind(target) },
        off() { draw = undefined },
    }
    class Node {
        active = true
        parent?: Node
        children: Node[] = []
        position = [0, 0]
        setPosition(x: number, y: number) { this.position = [x, y] }
        getSiblingIndex() { return this.parent!.children.indexOf(this) }
        setSiblingIndex(index: number) {
            const children = this.parent!.children
            children.splice(children.indexOf(this), 1)
            children.splice(index, 0, this)
        }
        destroy() { this.active = false }
    }
    const uiNode = ({ parent, active }: { parent?: Node, active?: boolean }) => {
        const node = new Node()
        if (parent) { node.parent = parent; parent.children.push(node) }
        if (active !== undefined) node.active = active
        return { node }
    }
    const modules: Record<string, unknown> = {
        cc: { Color: { WHITE: {} }, Director: { EVENT_AFTER_DRAW: 'draw' }, director },
        './uiNode': { uiNode },
    }
    const exports: any = {}
    const compiled = transpileModule(readFileSync('assets/scripts/client/view/FpsDisplay.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(compiled.outputText, { exports, require: (id: string) => modules[id], performance: { now: () => now } })
    let options: any
    const ui = { label(parent: Node, value: any) {
        options = value
        const node = uiNode({ parent }).node
        node.setPosition(value.x, -value.y)
        return { node, text: value.text, setPosition(x: number, y: number) { node.setPosition(x, -y) } }
    } }
    const parent = new Node(), display = new exports.FpsDisplay(parent, ui)
    const overlay = parent.children[0], text = overlay.children[0]
    assert.equal(options.font, 'storeItem')
    assert.equal(options.baseline, true)
    assert.deepEqual(text.position, [-392, -295])
    display.update(true)
    draw!()
    for (let frame = 1; frame <= 30; frame++) { now = frame * (1000 / 60); draw!() }
    assert.equal(display.label.text, 'FPS: 60')
    display.update(false)
    assert.equal(overlay.active, false)
    display.update(true)
    assert.equal(display.label.text, 'FPS: --')
    display.dispose()
    assert.equal(draw, undefined)
})
