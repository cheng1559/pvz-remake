import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('Mod dialog keeps new imports and updates in its draft until Apply, including rejected restart confirmation', async () => {
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/PackageDialog.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText
    for (const id of ['local:new', 'local:existing']) for (const action of ['cancel', 'apply', 'rejectRestart']) {
        const confirmations: string[] = [], saves: any[] = [], discarded: any[] = [], steps: string[] = []
        let confirm = true, restarts = 0, importButton: any
        const imported = { id, version: '2.0.0', stagingId: 'draft' }
        const makeNode = (parent?: any): any => {
            const node: any = { isValid: true, activeInHierarchy: true, active: true, children: [], position: { x: 0, y: 0 },
                getComponent: () => ({ width: 640 }), addComponent: () => ({ node }), setScale() {}, on() {},
                destroy() { this.isValid = false; if (parent) parent.children.splice(parent.children.indexOf(this), 1) },
            }
            parent?.children.push(node)
            return node
        }
        const panel = makeNode()
        panel.getComponentsInChildren = () => [{ node: makeNode() }, { node: makeNode() }]
        let finish!: (value: boolean) => void
        const dialog: any = { node: makeNode(), content: panel,
            result: new Promise<boolean>(resolve => { finish = resolve }),
            close(value: boolean) { this.node.isValid = false; finish(value) },
        }
        const graphics = { fillRect() {}, rect() {}, stroke() {}, clear() {}, moveTo() {}, lineTo() {}, close() {}, fill() {} }
        const ui = {
            assets: { fonts: { profile: { config: {} } } }, text: (key: string, fallback?: string) => fallback ?? key,
            dialog(_parent: unknown, options: any) {
                if (options.title === 'Mods') return dialog
                if (options.title === 'Restarting...') return { close() {}, onConfirm() {}, onCancel() {} }
                assert.notEqual(options.title, 'Error', options.message)
                confirmations.push(options.title)
                return { result: Promise.resolve(confirm) }
            },
            button: () => importButton = {},
            label: (parent: any) => ({ node: makeNode(parent), renderer: {} }),
            checkbox: (parent: any) => ({ node: makeNode(parent), button: {} }),
            scroll: () => ({ content: makeNode(), contentWidth: 500, offset: 0, setContentHeight() {} }),
        }
        const modules: Record<string, unknown> = {
            cc: { Color: class {}, Button: { EventType: { CLICK: 'click' } },
                Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once(_event: string, callback: () => void) { callback() } } },
            '@/client/font': { FontMetricsUtil: { getMetrics: () => ({ height: 20, ascentPadding: 0 }), measureTextWidth: () => 20 } },
            '@/client/content/ModManager': { modManager: {
                running: async () => ['local:existing'], list: async () => ['local:existing'],
                installed: async () => [{ id: 'local:existing', version: '1.0.0' }],
                queueChanges: async (changes: unknown) => { steps.push('queue'); saves.push(changes) },
                discardImports: async (imports: unknown[]) => { discarded.push(...imports) },
                setEnabled: async () => { assert.fail('installation must wait for the next startup') },
            } },
            '@/client/content/preloadTasks': { waitForPreloadFrame: async () => { steps.push('paint') } },
            '@/client/view/uiNode': { uiNode: (options: any) => ({ node: makeNode(options.parent), graphics }) },
        }
        const exports: any = {}
        runInNewContext(compiled, { exports, require: (name: string) => modules[name] ?? {}, setTimeout })
        await exports.showPackageDialog(makeNode(), ui, { import: async () => [imported],
            save: async () => { steps.push('save-game') }, restart: async () => { steps.push('restart'); restarts++ } })
        importButton.onClick()
        await setImmediate()
        assert.equal(saves.length, 0, 'Import must not write files or settings')
        if (action === 'cancel') {
            dialog.onCancel()
            await setImmediate()
            assert.equal(await dialog.result, false)
            assert.deepEqual(confirmations, ['ARE_YOU_SURE'], 'updates with unchanged order and checks still need discard confirmation')
        } else {
            confirm = action !== 'rejectRestart'
            dialog.onConfirm()
            await setImmediate()
            assert.deepEqual(confirmations, ['Restart Game?'])
            if (confirm) {
                assert.equal(saves.length, 1)
                assert.equal(saves[0].imports[0], imported)
                assert.equal(restarts, 1)
                assert.deepEqual(steps, ['paint', 'save-game', 'queue', 'restart'])
                dialog.onConfirm(); importButton.onClick(); dialog.onCancel()
                await setImmediate()
                assert.equal(saves.length, 1, 'the committing dialog rejects further actions')
            } else {
                assert.equal(dialog.node.isValid, true)
                assert.equal(saves.length, 0)
                confirm = true
                dialog.onCancel()
                await setImmediate()
                assert.equal(await dialog.result, false)
            }
        }
        if (action !== 'apply') {
            assert.equal(saves.length, 0); assert.equal(restarts, 0)
            assert.deepEqual(discarded, [imported])
        }
    }
})
