import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { MENU_PAGES, type MenuAction, type MenuPageId } from '@/client/screens/MenuPages'
import { gameClock } from '@/core/GameClock'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import { ModHost } from '@/shared/mod/ModHost'

test('the first main menu uses Mod wrappers installed while UI assets are still loading', async () => {
    const calls: string[] = [], ui = {}
    class MainMenuScreen {
        async initialize(assets: unknown) { assert.equal(assets, ui); calls.push('initialize') }
        show() { calls.push('show') }
    }
    const host = new ModHost('test:menu', {})
    const module = { exports: {} as any }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/MenuScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const modules: Record<string, unknown> = {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        './MainMenuScreen': { MainMenuScreen },
        '@/client/ui/UI': { UI: { async load() {
            await Promise.resolve()
            host.around(MainMenuScreen.prototype, 'initialize', async function (next, ...args) {
                await next(...args)
                calls.push('widescreen-backgrounds')
            })
            return ui
        } } },
        '@/client/view/uiNode': { uiNode: () => {
            const node: any = { isValid: true, active: false, destroy() { this.isValid = false },
                addComponent: (View: any) => Object.assign(new View(), { node }) }
            return { node }
        } },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    try {
        const screen = new module.exports.MenuScreen()
        screen.node = { isValid: true }
        const first = await screen.prepare('main')
        assert.deepEqual(calls, ['initialize', 'widescreen-backgrounds'])
        assert.equal(await screen.prepare('main'), first, 'the already prepared menu must not initialize twice')
        first.enter()
        assert.deepEqual(calls, ['initialize', 'widescreen-backgrounds', 'show'])
    } finally { host.dispose() }
})

test('every menu page is reachable and all navigation targets exist', () => {
    const reached = new Set<MenuPageId>()
    const pending: MenuPageId[] = ['splash']
    while (pending.length) {
        const id = pending.pop()!
        if (reached.has(id)) continue
        reached.add(id)
        const page = MENU_PAGES[id]
        assert.ok(page, `missing page ${id}`)
        const actions: MenuAction[] = page.buttons.map(button => button.target)
        if (page.back) actions.push(page.back)
        for (const action of actions) {
            if (action === 'play' || action === 'restart' || action === 'nextLevel') pending.push('pause', 'gameOptions', 'award', 'gameOver')
            else if (action !== 'back' && action !== 'resume') {
                assert.ok(MENU_PAGES[action], `invalid target ${action} from ${id}`)
                pending.push(action)
            }
        }
    }
    assert.equal(reached.size, Object.keys(MENU_PAGES).length)
})

test('menu navigation preserves caller, pauses gameplay, and resumes without restarting', async () => {
    const errors: unknown[][] = []
    let dialogKeys = 0
    let restoreOnPlay = false
    let prompts = 0
    let chooseContinue!: (action: 'continue' | 'restart' | 'cancel') => void
    let closeCli!: (result: DebugCliResult | null) => void
    const sounds: string[] = []
    const musicFrames: Array<{ ticks: number; zombies: number }> = []
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/app/GameApp.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const modules: Record<string, unknown> = {
        cc: {
            Component: class {}, _decorator: { ccclass: () => (value: unknown) => value },
            KeyCode: { ENTER: 13, SPACE: 32, ESCAPE: 27, KEY_R: 82 },
            game: { restart() { assert.fail('CLI reload must retain loaded assets') } },
        },
        'cc/env': { DEBUG: false },
        '@/core/GameClock': { gameClock },
        '@/client/music/MusicSystem': { MusicSystem: { update(ticks: number, context: { zombiesOnScreen: number }) {
            musicFrames.push({ ticks, zombies: context.zombiesOnScreen })
        } } },
        '@/client/screens/DebugCliDialog': { showDebugCliDialog: () => new Promise(resolve => { closeCli = resolve }) },
        '@/client/screens/MenuPages': { MENU_PAGES },
        '@/client/ui/UIDialog': { UIDialog: { handleKey: () => { dialogKeys++; return false } } },
        '@/client/api/MenuApi': { menuApi: { getCurrentUser: async () => ({ id: 1 }), completeLevel: async () => ({ nextLevelId: 'pvz:adventure-1-2' }) } },
        '@/client/ui/UI': { UI: { load: async () => ({}) } },
        '@/client/ui/UIInput': { UIInput: { handleKeyUp() {} } },
        '@/client/screens/ContinueGameDialog': {
            showContinueGameDialog: () => {
                prompts++
                return new Promise(resolve => { chooseContinue = resolve })
            },
        },
        '@/client/sound/LegacySoundSystem': { SoundEffect: { Pause: 'pause' }, SoundLoader: { play: async (sound: string) => { sounds.push(sound) } } },
    }
    runInNewContext(compiled.outputText, {
        exports: module.exports, require: (id: string) => modules[id] ?? {},
        console: { ...console, error: (...args: unknown[]) => errors.push(args) },
    })
    const app = new module.exports.GameApp()
    const advice: string[] = []
    app.showAdvice = (message: string) => advice.push(message)
    let running = false
    let paused = false
    let introReady = true
    let saves = 0
    const freshGames: boolean[] = []
    const startedLevels: Array<string | undefined> = []
    const commits: string[] = []
    app.node = { isValid: true }
    app.controller = {
        async play(options: { forceNewGame: boolean, levelId?: string, onRestore?: () => void }) {
            freshGames.push(options.forceNewGame)
            startedLevels.push(options.levelId)
            running = true
            if (restoreOnPlay && !options.forceNewGame) { paused = true; options.onRestore?.() }
        },
        resume() { paused = false },
        pause() { if (running) paused = true },
        isRunning: () => running,
        countZombiesOnScreenForMusic: () => running ? 10 : 0,
        isPaused: () => paused,
        canPause: () => running && introReady && !paused,
        debugCommand: () => ({ ok: true, catalog: { plants: [], zombies: [], items: [], levels: ['1-1'] } }),
        hide() { commits.push('hide-game'); running = false },
        deleteSave() {},
        async saveIfRunning() { saves++; return null },
    }
    let prepare = async (id: MenuPageId) => id
    let shown: MenuPageId | null = null
    app.menu = {
        node: { active: false },
        prepare: (id: MenuPageId) => prepare(id),
        async show(id: MenuPageId) { commits.push(`show-${id}`); shown = id },
        hide() { this.node.active = false },
    }
    app.transitions = {
        async run(prepare: () => Promise<() => Promise<void>>) { await (await prepare())() },
    }
    app.gameLayer = { active: false }
    try {
        gameClock.setSpeed(2)
        app.update(0.01)
        assert.deepEqual(musicFrames.pop(), { ticks: 2, zombies: 0 }, 'menu music uses the shared clock')
    } finally { gameClock.setSpeed(1) }

    for (const action of ['splash', 'title', 'main', 'garden', 'mushroom', 'store', 'back']) {
        await app.navigate(action)
        if (action === 'splash' || action === 'title') {
            const recovery = app.showDebugCli()
            await setImmediate()
            assert.equal(app.debugCliOpen, true, 'startup must allow CLI access to update or disable a broken Mod')
            closeCli(null)
            await recovery
        }
    }
    assert.equal(app.currentPage, 'mushroom')
    assert.equal(shown, 'mushroom')

    // Preparing the next page keeps the caller/history intact and ignores duplicate requests.
    let ready!: (page: MenuPageId) => void
    prepare = () => new Promise(resolve => { ready = resolve })
    const pending = app.navigate('almanac')
    assert.equal(app.loading, true)
    assert.equal(shown, 'mushroom')
    await app.navigate('help')
    ready('almanac')
    await pending
    assert.equal(app.currentPage, 'almanac')
    await app.navigate('almanac')
    prepare = async id => id
    await app.navigate('back')
    assert.equal(app.currentPage, 'mushroom')

    const history = [...app.history]
    prepare = async () => { throw new Error('missing background') }
    await app.navigate('help')
    assert.equal(app.loading, false)
    assert.equal(shown, 'mushroom')
    assert.equal(app.currentPage, 'mushroom')
    assert.deepEqual([...app.history], history)
    assert.equal(errors.length, 1)
    assert.match(String(errors[0][1]), /missing background/)
    assert.equal(advice.length, 1, 'navigation failures use advice instead of a temporary centre label')
    assert.match(advice[0], /missing background/)
    prepare = async id => id

    await app.navigate('help')
    assert.equal(app.currentPage, 'help')
    assert.equal(app.loading, false, 'the page fade must not hold the navigation lock')
    app.onKeyDown({ keyCode: 13 })
    await setImmediate()
    assert.equal(app.currentPage, 'main', 'leaving during a page fade must remain possible')

    await app.navigate('play')
    assert.equal(app.currentPage, null)
    assert.equal(app.menu.node.active, false)
    app.update(0.01)
    assert.deepEqual(musicFrames.pop(), { ticks: 1, zombies: 10 }, 'gameplay feeds the current zombie count once per frame')
    const cli = app.showDebugCli()
    await setImmediate()
    assert.equal(paused, true)
    assert.equal(gameClock.delta(1), 0)
    gameClock.setSpeed(2)
    closeCli(null)
    await cli
    assert.equal(paused, false)
    assert.equal(gameClock.delta(1), 2, 'closing the CLI keeps the newly selected speed')
    gameClock.setSpeed(1)
    const packages: string[] = []
    app.installPackage = async (kind: string) => { assert.equal(paused, true); packages.push(`install:${kind}`) }
    app.confirmPackageRestart = async (kind: string) => { assert.equal(paused, true); packages.push(`restart:${kind}`) }
    for (const action of ['installPack', 'restartForPacks', 'installMod', 'restartForMods'] as const) {
        const before = saves
        const pending = app.showDebugCli()
        await setImmediate()
        closeCli({ ok: true, message: '', action })
        await pending
        assert.equal(saves, before + 1, 'package changes save the current level before showing their dialogs')
        assert.equal(paused, false, 'cancelling an install/restart restores the previous pause state')
    }
    assert.deepEqual(packages, ['install:pack', 'restart:pack', 'install:mod', 'restart:mod'])
    introReady = false
    app.onKeyDown({ keyCode: 32 })
    await setImmediate()
    assert.equal(paused, false, 'pause is unavailable during the entrance')
    app.onKeyUp({ keyCode: 32 })
    introReady = true
    const beforeSave = saves
    app.onKeyDown({ keyCode: 32 })
    await setImmediate()
    assert.equal(app.currentPage, 'pause')
    assert.equal(saves, beforeSave + 1, 'the pause shortcut saves the current game')
    assert.equal(paused, true)
    assert.equal(app.gameLayer.active, true)
    const beforeRepeat = dialogKeys
    app.onKeyDown({ keyCode: 32 })
    assert.equal(dialogKeys, beforeRepeat, 'holding Space cannot immediately dismiss the pause dialog')
    app.onKeyUp({ keyCode: 32 })
    assert.equal(sounds.at(-1), 'pause')
    await app.navigate('gameOptions')
    await app.navigate('pause')
    await app.navigate('resume')
    assert.equal(paused, false)
    prepare = async () => { throw new Error('missing game menu') }
    await app.navigate('gameOptions')
    assert.equal(paused, false, 'a failed menu load restores the running game')
    assert.equal(app.currentPage, null)
    prepare = async id => id
    assert.deepEqual(freshGames, [false])
    await app.navigate('main')
    assert.equal(paused, true)
    assert.equal(app.gameLayer.active, false)
    assert.equal(app.menu.node.active, true)
    assert.equal(running, false, 'returning to the main menu disposes the saved board')
    assert.deepEqual(commits.slice(-2), ['hide-game', 'show-main'], 'old battle audio must stop before the new menu starts its music')
    await app.finish('award')
    assert.equal(app.currentPage, 'award')
    assert.equal(running, false)
    app.onKeyDown({ keyCode: 13 })
    await setImmediate()
    assert.equal(running, true)
    assert.deepEqual(freshGames, [false, true])
    assert.equal(startedLevels.at(-1), 'pvz:adventure-1-2')
    assert.equal(prompts, 0, 'fresh levels and explicit restarts skip the save prompt')
    for (const action of ['continue', 'restart', 'cancel'] as const) {
        await app.navigate('main')
        restoreOnPlay = true
        const loaded = app.navigate('play')
        await setImmediate()
        assert.equal(paused, true, 'the restored board waits for the user decision')
        assert.equal(app.loading, false, 'dialog keyboard input must remain available')
        assert.equal(app.gameLayer.active, true)
        const beforeKeys = dialogKeys
        app.onKeyDown({ keyCode: 13 })
        assert.equal(dialogKeys, beforeKeys + 1)
        chooseContinue(action)
        await loaded
        if (action === 'cancel') {
            assert.equal(app.currentPage, 'main')
            assert.equal(running, false)
        } else {
            assert.equal(app.currentPage, null)
            assert.equal(paused, false)
            assert.equal(freshGames.at(-1), action === 'restart')
        }
    }
    assert.equal(prompts, 3)
    restoreOnPlay = false
    let clearedAdvice = 0
    app.advice = { clear() { clearedAdvice++ } }
    for (const source of ['play', 'main']) {
        await app.navigate(source)
        const savesBeforeReload = saves
        const reload = app.showDebugCli()
        await setImmediate()
        closeCli({ ok: true, message: 'Reloading game', action: 'reload' })
        await reload
        assert.equal(saves, savesBeforeReload + 1, 'reload saves before disposing the current board')
        assert.equal(running, false)
        assert.equal(app.gameLayer.active, false)
        assert.equal(app.currentPage, 'splash')
        assert.equal(shown, 'splash')
        assert.equal(app.history.length, 0)
    }
    assert.equal(clearedAdvice, 2, 'reload clears transient advice from the previous UI')
    await app.navigate('play')
    await app.finish('gameOver')
    assert.equal(running, true, 'the failure dialog keeps the real board mounted')
    assert.equal(app.gameLayer.active, true)
    assert.equal(paused, true)
    await app.navigate('restart')
    assert.equal(paused, false)
    assert.equal(freshGames.at(-1), true)
})

test('pack and Mod imports read sequentially, continue after failure, clean all files and offer one restart', async () => {
    const source = transpileModule(readFileSync('assets/scripts/app/GameApp.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    }).outputText
    for (const isNative of [false, true]) for (const kind of ['pack', 'mod']) for (const names of [[], ['a'], ['bad'], ['a', 'bad', 'b']]) {
        const steps: string[] = []
        const module = { exports: {} as Record<string, any> }
        const ui = {
            dialog(_parent: unknown, options: any) {
                steps.push(options.title)
                if (options.title === 'Installing...') {
                    assert.equal(options.message, undefined)
                    assert.equal(options.footer, false)
                }
                if (options.title === 'Installation Failed') assert.match(options.message, /bad.zip/)
                return { close() { steps.push('close') }, result: Promise.resolve(true) }
            },
        }
        const modules: Record<string, unknown> = {
            cc: {
                Component: class {}, _decorator: { ccclass: () => (value: unknown) => value },
                sys: { isNative, restartVM: () => steps.push('native-restart') },
                game: { restart() { assert.fail('package changes must discard the previous VM and its Mod caches') } },
                Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once(_event: string, callback: () => void) { steps.push('paint'); callback() } },
            },
            '@/client/ui/UI': { UI: { load: async () => ui } },
            '@/client/content/InstalledArchives': { selectZips: async () => {
                steps.push('pick')
                return names.map(name => ({ name: `${name}.zip`,
                    read: async () => { steps.push(`read:${name}`); if (name === 'bad') throw new Error('Invalid ZIP'); return name },
                    dispose: () => steps.push(`dispose:${name}`),
                }))
            } },
            '@/client/content/ModResources': { modResources: { install: async (name: string) => { steps.push(`install:${name}`); return name } } },
            '@/client/content/ModManager': { modManager: {
                install: async (name: string, enable: boolean) => {
                    assert.equal(enable, names.length === 1)
                    steps.push(`install:${name}`); return name
                },
                list: async () => [],
                setEnabled: async (ids: string[]) => { assert.deepEqual(Array.from(ids), ['a', 'b']); steps.push('enable:mods') },
            } },
        }
        runInNewContext(source, { exports: module.exports, require: (id: string) => modules[id] ?? {}, setTimeout,
            window: { location: { reload: () => steps.push('web-restart') } } })
        const app = new module.exports.GameApp()
        app.node = { isValid: true }
        const installed = await app.installPackage(kind)
        assert.deepEqual(Array.from(installed), names.filter(name => name !== 'bad'))
        const expected = ['pick']
        if (names.length) {
            expected.push('Installing...', 'paint')
            for (const name of names) { expected.push(`read:${name}`); if (name !== 'bad') expected.push(`install:${name}`) }
            if (kind === 'mod' && names.length > 1) expected.push('enable:mods')
            expected.push('close', ...names.map(name => `dispose:${name}`))
            if (names.includes('bad')) expected.push('Installation Failed')
            if (installed.length) expected.push('Restart Required', isNative ? 'native-restart' : 'web-restart')
        }
        assert.deepEqual(steps, expected)
    }
})

test('mobile CLI receives corner taps in root capture before UI can swallow them', async () => {
    let capture!: (event: any) => void
    let globalTouch!: (event: any) => void
    let now = 1000, opened = 0, viewportInitialized = 0
    const sys = { isMobile: true, localStorage: {} }
    const screen = { devicePixelRatio: 3, windowSize: { width: 2556, height: 1179 } }
    const node = { isValid: true, on(_event: string, callback: Function, owner: any, useCapture: boolean) {
        assert.equal(useCapture, true)
        capture = event => callback.call(owner, event)
    } }
    const modules: Record<string, any> = {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value }, sys, screen,
            Mask: { Type: { GRAPHICS_RECT: 0 } },
            game: { on() {} }, Game: { EVENT_HIDE: 'hide' }, Input: { EventType: { TOUCH_START: 'touch-start' } },
            input: { on(event: string, callback: Function, owner: any) {
                if (event === 'touch-start') globalTouch = value => callback.call(owner, value)
            } } },
        'cc/env': { DEBUG: false },
        '@/client/view/uiNode': { uiNode: (options: any) => ({ node: options.node ?? { addComponent: () => ({}) } }) },
        '@/client/view/ClientViewport': { initializeViewport() { viewportInitialized++ } },
        './LocalMenuApi': { connectLocalMenuApi() {} },
        '@/client/content/ModResources': { modResources: { baseJson: async () => ({}) } },
        '@/server/menu/StoreCatalog': { createStoreCatalog: () => ({}) },
        './LevelController': { createLevelController: () => ({}) },
        '@/client/input/UIHoverManager': { UIHoverManager: { start() {} } },
        '@/platform/OptionsSettings': { OptionsSettings: { start: async () => {} } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => false } },
        '@/client/screens/ScreenTransition': { ScreenTransition: class {} },
        '@/client/ui/UI': { UI: { load: async () => ({ label: () => ({}) }) } },
    }
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/app/GameApp.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
        Date: { now: () => now } })
    const app = new module.exports.GameApp()
    app.node = node
    app.navigate = async () => {}
    app.showDebugCli = async () => { opened++ }
    app.start()
    assert.equal(viewportInitialized, 0, 'startup waits for UI and Mod loading before applying the window constraint')
    await setImmediate()
    assert.equal(viewportInitialized, 1)
    assert.equal(typeof globalTouch, 'function', 'letterbox taps still have a global fallback')
    const tap = () => ({ getLocation: () => ({ x: 2500, y: 50 }), propagationStopped: false })
    capture(tap())
    now += 200
    const second = tap()
    capture(second)
    assert.equal(opened, 1, 'native mobile access remains available when /mobile is off')
    assert.equal(second.propagationStopped, true)
    sys.isMobile = false
    now += 200
    capture(tap())
    now += 200
    capture(tap())
    assert.equal(opened, 1, 'desktop clicks do not open the mobile CLI')
})

test('saved-game prompt offers continue/restart/cancel and confirms a restart before closing', async () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/ContinueGameDialog.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(compiled.outputText, { exports: module.exports })
    const dialogs: Array<{ dialog: any, options: any }> = []
    const ui = {
        text: (key: string) => key,
        dialog(_parent: unknown, options: any) {
            let resolve!: (confirmed: boolean) => void
            const dialog = {
                node: { isValid: true },
                result: new Promise<boolean>(done => { resolve = done }),
                close(confirmed: boolean) { this.node.isValid = false; resolve(confirmed) },
                onConfirm() { this.close(true) }, onCancel() { this.close(false) },
            }
            dialogs.push({ dialog, options })
            return dialog
        },
    }
    for (const action of ['continue', 'cancel', 'restart', 'rejectRestart'] as const) {
        dialogs.length = 0
        const result = module.exports.showContinueGameDialog({}, ui)
        const prompt = dialogs[0]
        assert.deepEqual(Array.from(prompt.options.buttons, (button: any) => button.text),
            ['CONTINUE_BUTTON', 'RESTART_LEVEL_BUTTON', 'DIALOG_BUTTON_CANCEL'])
        assert.equal(prompt.options.clickSound, null)
        if (action === 'continue') prompt.dialog.onConfirm()
        else if (action === 'cancel') prompt.dialog.onCancel()
        else {
            prompt.options.buttons[1].onClick(prompt.dialog)
            const confirm = dialogs[1]
            assert.equal(confirm.options.title, 'RESTART_LEVEL_HEADER')
            if (action === 'restart') confirm.dialog.onConfirm()
            else {
                confirm.dialog.onCancel()
                await setImmediate()
                assert.equal(prompt.dialog.node.isValid, true, 'rejecting restart keeps the saved-game prompt open')
                prompt.dialog.onConfirm()
            }
        }
        assert.equal(await result, action === 'rejectRestart' ? 'continue' : action)
    }
})

test('modal pages retain their caller, full pages destroy it, and achievements stay cached through gameplay', async () => {
    const music: string[] = []
    const navigation: string[] = []
    let quitOptions: any
    let gameOptions: any
    let quits = 0
    let achievementInitializations = 0, achievementRefreshes = 0, warmDraws = 0
    let achievementRoot: any, achievementView: any
    let preload!: (progress: (value: number) => void) => Promise<void>
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/MenuScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: () => ({
            Component: class {}, _decorator: { ccclass: () => (value: unknown) => value },
            DEBUG: false, preloadAssets: async (progress: (value: number) => void) => progress(1),
            Director: { EVENT_AFTER_DRAW: 'draw' }, director: { once(_event: string, callback: () => void) {
                assert.equal(achievementRoot.active, true, 'the loading screen warms the cached components before opening them')
                warmDraws++
                callback()
            } },
            UIHoverManager: { beginModalBlock() {}, endModalBlock() {} },
            isValid: () => false, loadEntityDisplayAssets: async () => ({}),
            MENU_PAGES, MusicSystem: { playTune: async (tune: string) => { music.push(tune) } },
            game: { end() { quits++ } },
            showOptionsDialog: async (_parent: unknown, _ui: unknown, options: unknown) => { gameOptions = options },
            UI: { load: async () => ({
                text: (key: string) => key,
                dialog: (_parent: unknown, options: unknown) => { quitOptions = options; return { content: {} } },
            }) },
            uiNode: (options: any) => {
                const node = {
                    name: options.name, isValid: true, active: options.active ?? true, children: [] as any[],
                    addComponent() {
                        const component = { node: this, show() {}, refresh: async () => { achievementRefreshes++ },
                            initialize: async (_ui: unknown, callback: any) => {
                                if (this.name === 'Startup') preload = callback
                                if (this.name === 'Controls') { achievementInitializations++; achievementView = component }
                            } }
                        return component
                    },
                    getComponentInChildren: () => achievementView,
                    setPosition(x: number, y: number) { (this as any).position = { x, y } },
                    setSiblingIndex(index: number) { (this as any).siblingIndex = index },
                    destroy() { this.isValid = false },
                }
                options.parent?.children?.push(node)
                if (options.name === 'achievements') achievementRoot = node
                return { node }
            },
        }),
    })
    const screen = new module.exports.MenuScreen()
    screen.node = { isValid: true, active: true, children: [] }
    const page = (id: MenuPageId) => ({
        id, retainPrevious: MENU_PAGES[id].retainPrevious,
        root: { isValid: true, active: false, destroy() { this.isValid = false } },
    })
    let main = page('main')
    screen.mainMenu = { node: main.root }
    screen.onNavigate = (action: string) => { navigation.push(action) }
    await screen.show(main)
    for (const confirmed of [false, true]) {
        const quit = await screen.prepare('quit')
        await screen.show(quit)
        assert.deepEqual([quitOptions.title, quitOptions.message, quitOptions.confirmText, quitOptions.cancelText],
            ['QUIT_HEADER', 'QUIT_MESSAGE', 'QUIT_BUTTON', 'DIALOG_BUTTON_CANCEL'])
        quitOptions.onClose(confirmed)
        assert.equal(quits, Number(confirmed), 'cancel never ends the game; confirmation ends it once')
        assert.equal(navigation.at(-1), 'main')
        await screen.show(main)
        assert.equal(main.root.isValid, true)
    }
    const pause = await screen.prepare('pause')
    assert.deepEqual([quitOptions.title, quitOptions.message, quitOptions.confirmText], ['GAME_PAUSED', 'CLICK_TO_RESUME', 'RESUME_GAME'])
    assert.equal(quitOptions.spaceAfterHeader, 155)
    assert.equal(quitOptions.clickSound, null)
    quitOptions.onClose(true)
    assert.equal(navigation.at(-1), 'resume')
    pause.root.destroy()
    const options = await screen.prepare('gameOptions')
    assert.equal(gameOptions.inGame, true)
    gameOptions.onClose()
    gameOptions.onRestart()
    gameOptions.onMainMenu()
    assert.deepEqual(navigation.slice(-3), ['resume', 'restart', 'main'])
    options.root.destroy()
    for (const id of ['options', 'players', 'quit', 'almanac', 'store', 'achievements'] as const) {
        const modal = page(id)
        await screen.show(modal)
        assert.equal(main.root.isValid, true, `${id} preserves the menu instance`)
        assert.equal(main.root.active, true)
        assert.equal((await screen.prepare('main')).root, main.root)
        await screen.show(main)
        assert.equal(modal.root.isValid, id === 'achievements', 'only achievements keep their prepared page')
        assert.equal(modal.root.active, false)
    }
    for (const id of ['help', 'minigames', 'puzzle', 'survival', 'garden', 'mushroom', 'aquarium', 'tree', 'title'] as const) {
        const full = page(id)
        await screen.show(full)
        assert.equal(main.root.isValid, false, `${id} destroys the menu`)
        assert.equal(screen.mainMenu, null)
        main = page('main')
        screen.mainMenu = { node: main.root }
        await screen.show(main)
        assert.equal(full.root.isValid, false)
    }
    assert.deepEqual(music, ['choose_seeds', 'choose_seeds', 'choose_seeds', 'zen_garden', 'zen_garden', 'zen_garden', 'zen_garden'])
    const store = page('store')
    await screen.show(store)
    screen.hide()
    assert.equal(store.root.isValid, false)
    assert.equal(main.root.isValid, false)
    assert.equal(screen.mainMenu, null)
    const prepared = await screen.prepare('main')
    assert.equal(prepared.root.active, false, 'preparing the main menu keeps it hidden')
    await screen.show(prepared)
    assert.equal(prepared.root.active, true, 'show activates the prepared page')
    await screen.show(await screen.prepare('splash'))
    let progress = 0
    await preload(value => { progress = value })
    assert.equal(progress, 1)
    assert.equal(warmDraws, 1)
    assert.equal(achievementInitializations, 1)
    assert.equal(achievementRoot.active, false, 'prewarmed achievements stay hidden on the loading screen')
    const cached = await screen.prepare('achievements')
    assert.equal(cached.root, achievementRoot)
    assert.equal(achievementRefreshes, 1, 'entering refreshes user data after preloading')
    const menu = await screen.prepare('main')
    await screen.show(menu)
    await screen.show(cached)
    await screen.show(menu)
    assert.equal(cached.root.active, false)
    assert.equal(cached.root.isValid, true)
    cached.root.setPosition(0, -599)
    assert.equal(await screen.prepare('achievements'), cached)
    assert.deepEqual(cached.root.position, { x: 0, y: 0 }, 'cached slides start from the original page position')
    assert.equal(achievementRefreshes, 2)
    await screen.show(cached)
    screen.hide()
    assert.equal(cached.root.isValid, true, 'gameplay keeps the reusable achievement page')
    assert.equal(cached.root.active, false)
    assert.equal(await screen.prepare('achievements'), cached)
    assert.equal(achievementInitializations, 1, 'returning from gameplay cannot rebuild static content')
})

test('main menu flowers play once on press and stay unavailable after animation and profile refresh', () => {
    const plays: any[] = [], sounds: unknown[] = []
    class Button {}
    const module = { exports: {} as any }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/MainMenuScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const modules: Record<string, unknown> = {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/ui/UIButton': { UIButton: Button },
        '@/client/view/uiNode': { uiNode: () => ({ node: {
            active: false, addComponent: () => ({ node: { destroy() {} } }),
        } }) },
        '@/client/sound/LegacySoundSystem': { SoundEffect: { LimbsPop: 'pop' }, SoundLoader: { playFoley: (id: unknown) => sounds.push(id) } },
        './MainMenuConfig': { MAIN_MENU_BUTTONS: [], MAIN_MENU_FLOWERS: [{ x: 765, y: 483 }] },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    const menu = new module.exports.MainMenuScreen()
    const animation = { setTrackPrefixVisible() {} }
    menu.open = menu.sign = menu.grass = animation
    menu.flowers = [{ ...animation, play: (options: unknown) => plays.push(options) }]
    menu.user = { name: 'test', adventureLevel: 1 }
    menu.profileLabel = {}
    menu.numbersRoot = { children: [] }
    menu.setButtonsEnabled = menu.syncPositions = () => {}
    menu.refreshButtons()
    const button = menu.flowerButtons[0]
    assert.equal(button.canInteract(), true)
    button.onPress()
    assert.equal(button.canInteract(), false)
    plays[0].onFinish?.()
    assert.equal(button.canInteract(), false, 'the completed flight cannot be replayed from its old hitbox')
    menu.refreshButtons()
    assert.equal(menu.flowerButtons[0].canInteract(), false, 'recreating profile controls preserves the played flower')
    assert.equal(plays.length, 1)
    assert.deepEqual(sounds, ['pop'])
})

test('main menu entrance starts after the first draw and excludes the loading frame', () => {
    const pending = new Map<string, () => void>()
    const plays: any[] = []
    const director = {
        once(event: string, callback: () => void, owner: unknown) { pending.set(event, () => callback.call(owner)) },
        off(event: string) { pending.delete(event) },
    }
    const emit = (event: string) => { const callback = pending.get(event); pending.delete(event); callback?.() }
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/MainMenuScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: (id: string) => ({
            cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value },
                director, Director: { EVENT_AFTER_DRAW: 'draw', EVENT_AFTER_UPDATE: 'update' } },
            '@/client/music/MusicSystem': { MusicSystem: { playTune() {} } },
            '@/client/sound/LegacySoundSystem': { SoundEffect: {}, SoundLoader: { play() {} } },
        })[id] ?? {},
    })
    const menu = new module.exports.MainMenuScreen()
    menu.node = { isValid: true, activeInHierarchy: true }
    menu.ready = true
    menu.refreshButtons = () => assert.fail('show must reuse the controls prepared before activating the page')
    menu.open = { play: (options: unknown) => plays.push(options) }
    menu.show()
    menu.lateUpdate(0.5)
    assert.equal(plays.length, 0, 'loading time must not advance menu animations')
    emit('draw')
    assert.equal(plays.length, 0)
    emit('update')
    assert.equal(plays.length, 1)
    assert.equal(plays[0].timeSeconds, 0)
    assert.equal(plays[0].rate, 30 / 20, 'the original animation rate is unchanged')
    menu.show()
    emit('draw')
    menu.onDestroy()
    emit('update')
    assert.equal(plays.length, 1, 'a disposed page cannot start its queued entrance')
})

test('page fades use 180 game ticks, preserve their color, and do not block navigation', () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/PageFade.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: (id: string) => id === 'cc'
            ? { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } }
            : { gameClock },
    })
    try {
        for (const [color, speed] of [[0, 1], [255, 2]] as const) {
            const fade = new module.exports.PageFade()
            fade.color = { r: color, g: color, b: color, a: 255 }
            fade.node = { isValid: true, getComponent: () => ({ contentSize: { width: 1200, height: 600 } }), destroy() { this.isValid = false } }
            fade.graphics = { clear() {}, fillRect(...bounds: number[]) { assert.deepEqual(bounds, [-600, -300, 1200, 600]) } }
            gameClock.setSpeed(speed)
            fade.update(0.9 / speed)
            assert.equal(fade.color.a, 128)
            assert.equal(fade.graphics.fillColor.r, color)
            assert.equal(fade.graphics.fillColor.g, color)
            assert.equal(fade.graphics.fillColor.b, color)
            fade.update(0.9 / speed)
            assert.equal(fade.color.a, 0)
            assert.equal(fade.node.isValid, false)
        }
    } finally { gameClock.setSpeed(1) }
})

test('startup uses the game clock and accepts start only after resource preparation completes', async () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/StartupScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const hover = { isModalBlocked: false }
    const modules: Record<string, unknown> = {
        cc: {
            Component: class {}, Color: class {},
            _decorator: { ccclass: () => (value: unknown) => value },
        },
        '@/core/GameClock': { gameClock },
        '@/client/music/MusicSystem': { MusicSystem: { playTune: async () => {} } },
        '@/client/sound/LegacySoundSystem': { SoundEffect: {}, SoundLoader: { play: async () => {} } },
        '@/client/input/UIHoverManager': { UIHoverManager: hover },
    }
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: (id: string) => modules[id] ?? {},
        console,
    })
    const startup = new module.exports.StartupScreen()
    startup.node = { isValid: true }
    startup.logoOpacity = { opacity: 0 }
    startup.loadTitle = async () => {}
    let finishLoading!: () => void
    startup.preload = (report: (progress: number) => void) => {
        report(0.25)
        return new Promise<void>(resolve => { finishLoading = resolve })
    }
    let starts = 0
    startup.onStart = () => { starts++ }
    try {
        gameClock.setSpeed(2)
        startup.show()
        await setImmediate()
        startup.update(0.125)
        assert.equal(startup.age, 25)
        assert.equal(startup.logoOpacity.opacity, 128)
        gameClock.setSpeed(0)
        startup.update(1)
        assert.equal(startup.age, 25)
        startup.tryStart()
        assert.equal(starts, 0, 'the logo cannot skip resource preparation')
        gameClock.setSpeed(1)
        startup.update(1.75)
        assert.equal(startup.logoOpacity.opacity, 0)
        assert.equal(startup.phase, 'logo', 'wait for the loading-page assets before revealing it')
        startup.title = { active: false }
        startup.startButton = { interactable: false }
        startup.render = () => {}
        startup.update(0.01)
        assert.equal(startup.phase, 'loading')
        assert.equal(startup.startButton.interactable, false)
        startup.tryStart()
        assert.equal(starts, 0, 'loading-page input is gated by the actual preload promise')
        finishLoading()
        await setImmediate()
        assert.equal(startup.progress, 1)
        assert.equal(startup.startButton.interactable, true)
        startup.keyDown({ propagationStopped: true })
        assert.equal(starts, 0, 'opening the CLI cannot also start the menu')
        hover.isModalBlocked = true
        startup.keyDown({ propagationStopped: false })
        assert.equal(starts, 0, 'typing in a dialog cannot start the menu')
        hover.isModalBlocked = false
        startup.keyDown({ propagationStopped: false })
        startup.tryStart()
        assert.equal(starts, 1, 'repeated key/pointer events start the menu once')
    } finally { gameClock.setSpeed(1) }
})
