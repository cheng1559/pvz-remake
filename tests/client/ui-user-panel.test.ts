import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { MenuApi } from '@/client/api/MenuApi'
import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { GAME_SAVE_KEY } from '@/app/GameSaveStore'

function load(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console, ...globals })
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
    const { createProfileStore } = load('server/menu/profileStore', {})
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
    return { ProfileStore, data, dialogs, inputs, action, show: (mods?: any) => showUserDialog(new Node(), ui, () => {}, () => {}, mods) }
}

test('user panel validates names, keeps rename IDs/saves, and confirms isolated profile deletion', async () => {
    const fixture = panelFixture()
    const { ProfileStore: store, data, dialogs, inputs } = fixture
    const alice = store.createProfile('Alice'), bob = store.createProfile('Bob')
    data.set(`${GAME_SAVE_KEY}:${alice.id}:adventure`, 'alice save')
    data.set(`${GAME_SAVE_KEY}:${bob.id}:adventure`, 'bob save')
    data.set(`${GAME_SAVE_KEY}:${bob.id}:adventure:temp`, 'bob temp')
    data.set(`pvz-remake:saves:${bob.id}:adventure`, 'bob legacy save')
    const panel = await fixture.show()
    fixture.action(panel, 'RENAME_BUTTON')
    inputs.at(-1).value = '  Bob   Two  '
    await dialogs.at(-1).onConfirm()
    assert.equal(store.getCurrentProfile().name, 'Bob Two')
    assert.equal(store.getCurrentProfile().id, bob.id)
    assert.equal(data.get(`${GAME_SAVE_KEY}:${bob.id}:adventure`), 'bob save')
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
    assert.equal(data.get(`${GAME_SAVE_KEY}:${alice.id}:adventure`), 'alice save')
    assert.equal([...data.keys()].some(key => key.startsWith(`${GAME_SAVE_KEY}:${bob.id}:`)), false)
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

test('a new player may copy the previous Mods, and switching to other Mods asks to restart', async () => {
    const fixture = panelFixture()
    const { ProfileStore: store, dialogs, inputs } = fixture
    const alice = store.createProfile('Alice'), bob = store.createProfile('Bob')
    const copies: unknown[] = [], restarts: number[] = []
    const mods = {
        needsRestartFor: async (id: number) => id === alice.id,
        hasMods: (id: number) => id === bob.id,
        copyMods: (...args: unknown[]) => { copies.push(args) },
        restart: () => { restarts.push(store.getCurrentProfile().id) },
    }
    let panel = await fixture.show(mods)
    panel.content.getChildByName('UserList').children[2].button.onPress()
    inputs.at(-1).value = 'Carol'
    const creating = dialogs.at(-1).onConfirm()
    await setImmediate()
    assert.equal(dialogs.at(-1).options.title, 'PLAYER_MODS_COPY_HEADER', 'Bob has Mods, so the new player is offered them')
    dialogs.at(-1).close(true)
    await creating
    const carol = store.getCurrentProfile().id
    assert.deepEqual(copies, [[bob.id, carol]])
    assert.deepEqual(restarts, [], 'the copied Mods match the running ones')
    panel = await fixture.show(mods)
    // The current player (Carol) is listed first, then Alice.
    panel.content.getChildByName('UserList').children[1].button.onClick()
    for (const accept of [false, true]) {
        const switching = panel.onConfirm()
        await setImmediate()
        assert.equal(dialogs.at(-1).options.title, 'PLAYER_MODS_RESTART_HEADER')
        dialogs.at(-1).close(accept)
        await switching
        assert.equal(store.getCurrentProfile().id, accept ? alice.id : carol, accept ? 'confirming switches, then restarts' : 'cancel keeps the current player')
    }
    assert.deepEqual(restarts, [alice.id])
})

test('input keeps programmatic values silent, filters pasted text, and releases modal keyboard focus', () => {
    const scope = { activeModalRoot: null as any, isInputBlocked: false }
    let canvasFocuses = 0
    const { UIInput } = load('client/ui/UIInput', {
        cc: {
            Component: class {}, Color: class {}, KeyCode: { SPACE: 32, ENTER: 13, ESCAPE: 27 },
            _decorator: { ccclass: () => (value: unknown) => value },
            game: { canvas: { focus(options: FocusOptions) { assert.equal(options.preventScroll, true); canvasFocuses++ } } },
        },
        '@/client/input/UIHoverManager': { UIHoverManager: scope },
        // BrianneTod16 has no glyphs for backslash or the vertical bar.
        '@/client/font': { FontMetricsUtil: { hasGlyph: (_: unknown, char: string) => char !== '|' && char !== '\\' } },
    })
    const field = new UIInput()
    field.enabledInHierarchy = true
    field.node = { activeInHierarchy: true, isChildOf: () => false }
    field.draw = () => {}
    field.options = { maxLength: 12, filter: (value: string) => value.replace(/[^a-zA-Z0-9 |]/g, '') }
    field.font = { config: null }
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
    field.value = 'Abc!?|1234567890'
    assert.equal(field.value, 'Abc123456789', 'characters without a glyph are dropped even when the filter allows them')
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
    field.blur()
    assert.equal(canvasFocuses, 1, 'closing text entry returns keyboard focus to the game without another click')
    assert.equal(UIInput.handleKey({ keyCode: 191 }), false, 'slash can reach the game after submission')
    field.focus()
    scope.activeModalRoot = {}
    UIInput.hoverClient.clearHover()
    assert.equal(field.hasFocus, false)
    assert.equal(blurs, 2)
    assert.equal(UIInput.handleKey({ keyCode: 32 }), false, 'the top modal receives keys after the field loses focus')
})

test('native input keeps its caret and text through completion and repeated submission', () => {
    let text = '', start = 0, end = 0, focuses = 0, submissions = 0
    const shown: Record<string, unknown>[] = []
    const bridge = {
        showInputBox: (options: Record<string, unknown>) => { shown.push(options) },
        onInputBoxKey: undefined as ((key: string, shift: boolean) => boolean) | undefined,
        // Native editors keep ordered ranges, without a direction.
        setInputBoxText(value: string, from: number, to: number) { text = value; start = Math.min(from, to); end = Math.max(from, to) },
        getInputBoxSelection: () => ({ start, end }),
    }
    const { UIInput } = load('client/ui/UIInput', {
        cc: { Component: class {}, Color: class {}, KeyCode: { ENTER: 13 }, sys: { isNative: true, os: 'ios', OS: { IOS: 'ios' } }, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { activeModalRoot: null, isInputBlocked: false } },
        '@/client/font': { FontMetricsUtil: { hasGlyph: () => true } },
    }, { jsb: bridge })
    const field = new UIInput()
    field.font = { config: null }
    field.enabledInHierarchy = true
    field.node = { activeInHierarchy: true }
    field.draw = () => {}
    field.native = {
        string: '', _impl: {}, blur() {},
        focus() { focuses++; text = this.string; start = 0; end = text.length; bridge.showInputBox({ inputType: 'text', defaultValue: text }) },
    }
    field.options = { onKey: (key: string) => { if (key !== 'Tab') return false; field.value = '/speed'; return true } }
    field.onSubmit = () => { submissions++; field.focus() }
    field.value = '/'
    const originalShow = bridge.showInputBox
    field.focus()
    assert.equal(shown.at(-1)!.inputType, 'ascii')
    assert.equal(shown.at(-1)!.autocorrect, false)
    assert.equal(bridge.showInputBox, originalShow, 'keyboard options never replace the shared bridge permanently')
    assert.deepEqual([start, end], [1, 1], 'opening native entry puts the caret after the slash')
    const type = (value: string) => {
        text = text.slice(0, start) + value + text.slice(end)
        start += value.length; end = start
        field.native.string = text
        field.changed()
    }
    type('sp')
    assert.equal(field.value, '/sp')
    assert.equal(bridge.onInputBoxKey?.('Tab', false), true, 'Tab is consumed before native focus traversal')
    assert.equal(text, '/speed', 'completion updates the native editor as well as the game label')
    assert.deepEqual([start, end], [6, 6])
    assert.equal(bridge.onInputBoxKey?.('Enter', false), true)
    UIInput.handleKey({ keyCode: 13 })
    assert.equal(submissions, 1, 'native Return and the game key event must not submit twice')
    UIInput.handleKeyUp({ keyCode: 13 })
    assert.equal(focuses, 1, 'keeping focus after an error must not reopen and select all text')
    type(' 2')
    assert.equal(field.value, '/speed 2')
    field.update(0.2)
    assert.equal(field.blink, 0.2, 'caret blinking advances while the gameplay clock is paused')
    field.selectAll()
    assert.deepEqual([start, end], [0, 8])
    field.indexAt = () => 3
    field.press({ getUILocation: () => ({ x: 20, y: 0 }) })
    assert.equal(focuses, 1, 'moving the caret must keep the current native editor open')
    assert.deepEqual([start, end], [3, 3])
    type('X')
    type('Y')
    assert.equal(field.value, '/spXYeed 2', 'successive typing stays at the selected insertion point')
    field.indexAt = () => 8
    field.press({ getUILocation: () => ({ x: 80, y: 0 }) })
    for (const index of [6, 4]) { field.caret = index; field.syncSelection(); field.update(0) }
    assert.deepEqual([field.anchor, field.caret], [8, 4], 'a selection dragged leftward keeps its anchor')
    start = 3
    field.update(0)
    assert.deepEqual([field.anchor, field.caret], [8, 3], 'native Shift+Left extends the moving end')
    field.onSubmit = () => field.blur()
    assert.equal(bridge.onInputBoxKey?.('Enter', false), true)
    assert.equal(bridge.onInputBoxKey, undefined, 'closing entry releases the native key handler')
    assert.equal(UIInput.handleKey({ keyCode: 13 }), true, 'the submitting Return must not confirm a newly opened dialog')
    UIInput.handleKeyUp({ keyCode: 13 })
    assert.equal(UIInput.handleKey({ keyCode: 13 }), false, 'a fresh Return can confirm the next dialog')
    field.focus()
    assert.equal(bridge.onInputBoxKey, field.nativeKey, 'the native key capability survives closing and reopening the field')
    field.blur()
    Reflect.deleteProperty(bridge, 'onInputBoxKey')
    field.focus()
    assert.equal('onInputBoxKey' in bridge, false, 'selection support does not imply native key-event forwarding on iOS')
    assert.equal(UIInput.handleKey({ keyCode: 13 }), true)
    assert.equal(field.hasFocus, false, 'game key events still submit when the platform has no native key callback')
    UIInput.handleKeyUp({ keyCode: 13 })
    for (const keyboardType of ['default', 'email', 'number', 'url']) {
        field.options.keyboardType = keyboardType
        field.options.autocorrect = true
        field.focus()
        assert.equal(shown.at(-1)!.inputType, keyboardType === 'default' ? 'text' : keyboardType)
        assert.equal(shown.at(-1)!.autocorrect, true)
        field.blur()
    }
    bridge.showInputBox({ inputType: 'text' })
    assert.equal(shown.at(-1)!.inputType, 'text', 'other Cocos inputs retain their requested keyboard')
    assert.equal(shown.at(-1)!.autocorrect, undefined, 'other Cocos inputs retain system correction defaults')
})

test('dialogs and wrapped text follow LawnDialog: 3px after the header, button height plus 8, integer centering', () => {
    const font = { height: 20, ascentPadding: 0, lineSpacing: 20 }
    const { UI } = load('client/ui/UI', {
        '@/client/font': { FontMetricsUtil: { getMetrics: () => font, measureTextWidth: () => 50, measureWordWrappedHeight: () => 40 } },
    })
    const size = (width: number, height: number) => ({ originalSize: { width, height } })
    const ui = Object.assign(Object.create(UI.prototype), { assets: {
        fonts: { title: { config: {} }, body: { config: {} } },
        sprites: { dialog_topleft: size(10, 1), dialog_topright: size(10, 1), dialog_topmiddle: size(10, 1),
            dialog_bottomleft: size(10, 1), dialog_centerleft: size(10, 1) },
    } })
    // 35 + 36 + 45 + 24 + 8, the header 20 + 3, the body 40 + 30; 1px center tiles leave it unrounded.
    assert.equal(ui.dialogSize({ title: 'Title', message: 'Body' }).height, 148 + 23 + 70)
    assert.equal(ui.dialogSize({ title: 'Title', message: 'Body', spaceAfterHeader: 155 }).height, 148 + 175 + 70)

    // Bare class decorators keep the class; decorator factories return an identity decorator.
    const decorator = (...args: unknown[]) => args.length === 1 && typeof args[0] === 'function' ? undefined : (value: unknown) => value
    const { FontRenderer } = load('client/font/FontRenderer', { cc: { _decorator: new Proxy({}, { get: () => decorator }), Component: class {} } })
    const offset = (align: number, line: number, width: number, scale = 1) => FontRenderer.prototype._getLineOffsetX.call({ _textAlign: align }, line, width, scale)
    assert.deepEqual([offset(2, 7, 10), offset(2, 13, 10), offset(1, 7, 10, 2), offset(0, 7, 10)], [1, -1, 6, 0],
        'Graphics::WriteString: (width - line) / 2 truncated, and a wider line extends past both sides')
})
