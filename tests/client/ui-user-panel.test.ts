import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { MenuApi } from '@/client/api/MenuApi'
import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { GAME_SAVE_V2_KEY } from '@/app/GameSaveV2Store'

function load(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console })
    return module.exports
}

function profiles() {
    const data = new Map<string, string>()
    const storage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value) },
        removeItem: (key: string) => { data.delete(key) },
        key: (index: number) => [...data.keys()][index] ?? null,
        get length() { return data.size },
    }
    const { createProfileStore } = load('server/menu/ProfileStore', {})
    const ProfileStore = createProfileStore(storage)
    return { ProfileStore, data, menuApi: new MenuApi(createLocalMenuTransport(storage)) }
}

function panelFixture() {
    class Node {
        children: Node[] = []
        parent?: Node
        active = true
        isValid = true
        name = ''
        position = { x: 0, y: 0 }
        size = { width: 506, height: 506 }
        button?: any
        get activeInHierarchy(): boolean { return this.active && (this.parent?.activeInHierarchy ?? true) }
        getChildByName(name: string) { return this.children.find(node => node.name === name) }
        getComponent() { return this.size }
        getComponentsInChildren(): any[] { return this.children.flatMap(node => node.button ? [node.button] : node.getComponentsInChildren()) }
        addComponent<T>(Type: new () => T): T { const value = new Type(); this.button = value; return value }
        on() {}
        destroy() { this.active = this.isValid = false }
    }
    class Button { node!: Node; interactable = true }
    const { ProfileStore, data, menuApi } = profiles()
    const dialogs: any[] = [], inputs: any[] = []
    const uiNode = (options: any) => {
        const node = new Node()
        node.name = options.name ?? ''
        node.position = { x: options.position?.x ?? 0, y: options.position?.y ?? 0 }
        node.size = options.size ?? node.size
        node.parent = options.parent
        node.parent?.children.push(node)
        return { node, graphics: { node, fillRect() {}, rect() {}, stroke() {} } }
    }
    const ui = {
        assets: { fonts: { profile: { config: {} } } },
        text: (key: string) => key,
        label: () => ({ renderer: {} }),
        button(parent: Node, options: any) {
            const node = uiNode({ parent }).node
            node.position = { x: options.x ?? 31, y: -(options.y ?? 431) }
            const button = node.addComponent(Button)
            Object.assign(button, { node, ...options })
            return button
        },
        dialog(parent: Node, options: any) {
            const node = uiNode({ parent }).node, content = uiNode({ parent: node }).node
            let resolve!: (value: boolean) => void
            const dialog = {
                node, content, options, result: new Promise<boolean>(done => { resolve = done }),
                close(value: boolean) { if (!node.active) return; node.active = false; resolve(value); options.onClose?.(value) },
            }
            ui.button(content, { text: options.confirmText })
            ui.button(content, { text: options.cancelText })
            dialogs.push(dialog)
            return dialog
        },
        input(parent: Node, options: any) {
            const field = { node: uiNode({ parent }).node, value: options.value, options, focus() {}, blur() {}, selectAll() {} }
            inputs.push(field)
            return field
        },
    }
    const { showUserDialog } = load('client/screens/UserDialog', {
        cc: { Node, Color: class {}, UITransform: class {}, Button: { EventType: { CLICK: 'click' } }, KeyCode: {} },
        '@/client/api/MenuApi': { menuApi },
        '@/client/font': { FontMetricsUtil: { getMetrics: () => ({ height: 20, ascentPadding: 0 }), measureTextWidth: () => 50 } },
        '@/client/ui/UIButton': { UIButton: Button }, '@/client/view/uiNode': { uiNode },
    })
    const action = (dialog: any, name: string) => dialog.content.getComponentsInChildren().find((button: any) => button.text === name).onClick()
    return { ProfileStore, data, dialogs, inputs, action, show: () => showUserDialog(new Node(), ui, () => {}, () => {}) }
}

test('user panel validates names, keeps rename IDs/saves, and confirms isolated profile deletion', async () => {
    const fixture = panelFixture()
    const { ProfileStore: store, data, dialogs, inputs } = fixture
    const alice = store.createProfile('Alice'), bob = store.createProfile('Bob')
    data.set(`${GAME_SAVE_V2_KEY}:${alice.id}:adventure`, 'alice save')
    data.set(`${GAME_SAVE_V2_KEY}:${bob.id}:adventure`, 'bob save')
    data.set(`${GAME_SAVE_V2_KEY}:${bob.id}:adventure:temp`, 'bob temp')
    data.set(`pvz-remake:saves:${bob.id}:adventure`, 'bob legacy save')
    const panel = await fixture.show()
    fixture.action(panel, 'RENAME_BUTTON')
    inputs.at(-1).value = '  Bob   Two  '
    await dialogs.at(-1).onConfirm()
    assert.equal(store.getCurrentProfile().name, 'Bob Two')
    assert.equal(store.getCurrentProfile().id, bob.id)
    assert.equal(data.get(`${GAME_SAVE_V2_KEY}:${bob.id}:adventure`), 'bob save')
    fixture.action(panel, 'RENAME_BUTTON')
    inputs.at(-1).value = 'alice'
    await dialogs.at(-1).onConfirm()
    assert.equal(dialogs.at(-1).options.title, 'NAME_CONFLICT')
    dialogs.at(-1).close(false)
    await dialogs.at(-2).onCancel()
    fixture.action(panel, 'DELETE_BUTTON')
    dialogs.at(-1).close(false)
    await setImmediate()
    assert.equal(store.loadProfiles().length, 2, 'cancel deletion keeps all data')
    fixture.action(panel, 'DELETE_BUTTON')
    dialogs.at(-1).close(true)
    await setImmediate()
    assert.equal(store.getCurrentProfile().id, alice.id)
    assert.equal(data.get(`${GAME_SAVE_V2_KEY}:${alice.id}:adventure`), 'alice save')
    assert.equal([...data.keys()].some(key => key.startsWith(`${GAME_SAVE_V2_KEY}:${bob.id}:`)), false)
    assert.equal(data.has(`pvz-remake:saves:${bob.id}:adventure`), false)
    fixture.action(panel, 'DELETE_BUTTON')
    dialogs.at(-1).close(true)
    await setImmediate()
    assert.equal(dialogs.at(-1).options.title, 'NEW_USER', 'deleting the last profile requires creating a replacement')
    const nameDialog = dialogs.at(-1)
    inputs.at(-1).value = '   '
    await nameDialog.onConfirm()
    assert.equal(dialogs.at(-1).options.title, 'ENTER_YOUR_NAME')
    dialogs.at(-1).close(false)
    inputs.at(-1).value = 'New Player'
    await nameDialog.onConfirm()
    assert.equal(store.getCurrentProfile().name, 'New Player')
    assert.equal(panel.node.active, false)
})

test('user selection is committed by confirmation or double click, while cancel preserves the current profile', async () => {
    const fixture = panelFixture()
    const setup = await fixture.show()
    assert.equal(fixture.dialogs.length, 1, 'first-time setup must not create a user-selection dialog underneath')
    assert.equal(setup.options.title, 'NEW_USER')
    fixture.inputs.at(-1).value = 'Alice'
    await setup.onConfirm()
    const alice = fixture.ProfileStore.getCurrentProfile()
    assert.equal(alice.name, 'Alice')
    assert.equal(setup.node.active, false)
    const bob = fixture.ProfileStore.createProfile('Bob')
    let panel = await fixture.show()
    assert.equal(panel.options.title, 'WHO_ARE_YOU', 'existing players can still open user selection')
    panel.content.getChildByName('UserList').children[1].button.onClick()
    assert.equal(fixture.ProfileStore.getCurrentProfile().id, bob.id)
    await panel.onCancel()
    assert.equal(fixture.ProfileStore.getCurrentProfile().id, bob.id)
    panel = await fixture.show()
    const aliceRow = panel.content.getChildByName('UserList').children[1].button
    aliceRow.onPress()
    aliceRow.onClick()
    aliceRow.onPress()
    await setImmediate()
    assert.equal(fixture.ProfileStore.getCurrentProfile().id, alice.id)
    assert.equal(panel.node.active, false)
})

test('input keeps programmatic values silent, filters pasted text, and releases modal keyboard focus', () => {
    const scope = { activeModalRoot: null as any, isInputBlocked: false }
    const { UIInput } = load('client/ui/UIInput', {
        cc: { Component: class {}, Color: class {}, KeyCode: { SPACE: 32, ENTER: 13, ESCAPE: 27 }, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: scope },
    })
    const field = new UIInput()
    field.enabledInHierarchy = true
    field.node = { activeInHierarchy: true, isChildOf: () => false }
    field.draw = () => {}
    field.options = { maxLength: 12, filter: (value: string) => value.replace(/[^a-zA-Z0-9 ]/g, '') }
    let blurs = 0, changes = 0, submitted = '', focusOptions: FocusOptions | undefined
    const element = {
        value: '', selectionStart: 0, selectionEnd: 0, style: {},
        addEventListener() {}, removeEventListener() {},
        focus(options?: FocusOptions) { focusOptions = options },
        setSelectionRange(start: number, end: number) { this.selectionStart = start; this.selectionEnd = end },
    }
    const domFocus = element.focus
    field.native = { string: '', focus() { element.focus() }, blur() { blurs++ }, _impl: { _edTxt: element } }
    field.onChange = () => { changes++ }
    field.onSubmit = (value: string) => { submitted = value }
    field.value = 'Abc!?1234567890'
    assert.equal(field.value, 'Abc123456789')
    assert.equal(changes, 0)
    field.focus()
    assert.equal(focusOptions?.preventScroll, true, 'opening the input must not scroll the game page')
    assert.equal(element.focus, domFocus, 'the DOM override is scoped to the EditBox focus call')
    field.selectAll()
    assert.deepEqual([element.selectionStart, element.selectionEnd], [0, 12])
    field.native.string = 'New!! Name\nOther'
    element.selectionStart = element.selectionEnd = 10
    field.changed()
    assert.equal(field.value, 'New Name')
    assert.equal(element.value, 'New Name')
    assert.equal(changes, 1)
    assert.equal(UIInput.handleKey({ keyCode: 32 }), true)
    field.domKey({ key: 'Enter', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} })
    assert.equal(submitted, 'New Name')
    scope.activeModalRoot = {}
    UIInput.hoverClient.clearHover()
    assert.equal(field.hasFocus, false)
    assert.equal(blurs, 1)
    assert.equal(UIInput.handleKey({ keyCode: 32 }), false, 'the top modal receives keys after the field loses focus')
})
