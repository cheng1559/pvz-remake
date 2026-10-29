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
    let packageDialogs = 0
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
        '@/client/screens/PackageDialog': { showPackageDialog: async () => {
            assert.equal(paused, true)
            packageDialogs++
            return { result: Promise.resolve() }
        } },
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
        '@/client/sound/SoundSystem': { SoundEffect: { Pause: 'pause' }, SoundSystem: { play: async (sound: string) => { sounds.push(sound) } } },
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
    let cursorMode = 'none'
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
        cancelCursor() {
            if (cursorMode === 'none') return false
            cursorMode = 'none'
            return true
        },
        getLevelDefinition: () => ({}),
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
    const savesBeforeManager = saves
    const manager = app.showDebugCli()
    await setImmediate()
    closeCli({ ok: true, message: '', action: 'manageMods' })
    await manager
    assert.equal(packageDialogs, 1)
    assert.equal(saves, savesBeforeManager, 'opening the manager does not write an unchanged level save')
    assert.equal(paused, false, 'closing the manager restores the previous pause state')
    introReady = false
    app.onKeyDown({ keyCode: 32 })
    app.onKeyDown({ keyCode: 27 })
    await setImmediate()
    assert.equal(paused, false, 'pause is unavailable during the entrance')
    app.onKeyUp({ keyCode: 32 })
    introReady = true
    const beforeEscape = sounds.length
    for (const held of ['seed', 'tool']) {
        cursorMode = held
        app.onKeyDown({ keyCode: 27 })
        await setImmediate()
        assert.equal(cursorMode, 'none')
        assert.equal(app.currentPage, null, `Escape cancels ${held} selection before opening the menu`)
        assert.equal(paused, false)
        assert.equal(sounds.length, beforeEscape)
    }
    app.onKeyDown({ keyCode: 27 })
    await setImmediate()
    assert.equal(app.currentPage, 'gameOptions', 'Escape opens the same menu as the board Menu button')
    assert.equal(paused, true)
    assert.equal(sounds.length, beforeEscape, 'Escape opens the menu silently, as in the original')
    app.onKeyDown({ keyCode: 27 })
    await setImmediate()
    assert.equal(app.currentPage, null)
    assert.equal(paused, false)
    assert.equal(sounds.length, beforeEscape, 'Escape also closes the menu silently')
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
    assert.equal(sounds.length, beforeEscape + 1, 'Space still plays the pause sound once')
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

test('manager imports read sequentially, continue after failure and leave installation to the next startup', async () => {
    const source = transpileModule(readFileSync('assets/scripts/app/GameApp.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    }).outputText
    for (const isNative of [false, true]) for (const names of [[], ['a'], ['bad'], ['a', 'bad', 'b']]) {
        const steps: string[] = []
        const module = { exports: {} as Record<string, any> }
        const ui = {
            dialog(_parent: unknown, options: any) {
                steps.push(options.title)
                if (options.title === 'Importing...') {
                    assert.equal(options.message, undefined)
                    assert.equal(options.footer, false)
                }
                if (options.title === 'Import Failed') assert.match(options.message, /bad.zip/)
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
            '@/client/content/ModManager': { modManager: {
                prepareImport: (name: string) => {
                    steps.push(`prepare:${name}`); return { id: name, archive: name, version: '1.0.0' }
                },
                list: async () => [],
                setEnabled: async (ids: string[]) => { assert.deepEqual(Array.from(ids), ['a', 'b']); steps.push('enable:mods') },
            } },
        }
        runInNewContext(source, { exports: module.exports, require: (id: string) => modules[id] ?? {}, setTimeout,
            window: { location: { reload: () => steps.push('web-restart') } } })
        const app = new module.exports.GameApp()
        app.node = { isValid: true }
        const imported = await app.importPackage()
        assert.deepEqual(Array.from(imported, (mod: any) => mod.id), names.filter(name => name !== 'bad'))
        const expected = ['pick']
        if (names.length) {
            expected.push('Importing...', 'paint')
            for (const name of names) { expected.push(`read:${name}`); if (name !== 'bad') expected.push(`prepare:${name}`) }
            expected.push('close', ...names.map(name => `dispose:${name}`))
            if (names.includes('bad')) expected.push('Import Failed')
        }
        assert.deepEqual(steps, expected)
    }
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

test('options use direct exit during seed selection and confirmed exit during gameplay', async () => {
    const exports: Record<string, any> = {}
    const modules: Record<string, unknown> = {
        cc: { Color: class {} },
        '@/client/api/MenuApi': { menuApi: { getSettings: async () => ({ musicVolume: 1, sfxVolume: 0.65, fullScreen: false }) } },
        '@/platform/OptionsSettings': { OptionsSettings: { fullScreenForced: false, setFullScreen: async () => {} } },
        '@/client/sound/SoundSystem': { SoundEffect: { ButtonClick: 'click' }, SoundSystem: { play: async () => {} } },
        '@/shared/menu': { SFX_VOLUME_SCALE: 0.65 },
    }
    runInNewContext(transpileModule(readFileSync('assets/scripts/client/screens/OptionsDialog.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText, { exports, require: (id: string) => modules[id] ?? {} })
    for (const [inGame, levelIntro, expected] of [
        [true, true, ['MAIN_MENU_BUTTON', 'BACK_TO_GAME']],
        [true, false, ['RESTART_LEVEL_BUTTON', 'MAIN_MENU_BUTTON', 'BACK_TO_GAME']],
        [false, false, ['OPTIONS_GITHUB_BUTTON', 'DIALOG_BUTTON_OK']],
    ] as const) {
        const buttons: Array<{ text: string; onClick: () => void }> = [], dialogs: any[] = []
        let exits = 0
        const ui = {
            assets: { sprites: {} }, text: (key: string) => key,
            dialog(_parent: unknown, options: unknown) {
                let resolve!: (accepted: boolean) => void
                const dialog = { options, content: {}, node: { isValid: true },
                    result: new Promise<boolean>(done => { resolve = done }),
                    close(accepted: boolean) { this.node.isValid = false; resolve(accepted) },
                }
                dialogs.push(dialog)
                return dialog
            },
            label() {}, slider() {}, checkbox: () => ({ value: false }),
            button(_parent: unknown, options: { text: string; onClick: () => void }) { buttons.push(options) },
        }
        await exports.showOptionsDialog({}, ui, { inGame, levelIntro, onClose() {}, onRestart() {}, onMainMenu() { exits++ } })
        assert.deepEqual(buttons.map(button => button.text), expected)
        if (!inGame) continue
        const main = buttons.find(button => button.text === 'MAIN_MENU_BUTTON')!
        main.onClick()
        await setImmediate()
        if (levelIntro) {
            assert.equal(dialogs.length, 1, 'seed selection exits without a saved-game confirmation')
        } else {
            assert.equal(dialogs[1].options.message, 'LEAVE_GAME')
            dialogs[1].close(false)
            await setImmediate()
            assert.equal(exits, 0, 'cancelling keeps the game open')
            assert.equal(dialogs[0].node.isValid, true)
            main.onClick()
            dialogs[2].close(true)
            await setImmediate()
        }
        assert.equal(exits, 1)
        assert.equal(dialogs[0].node.isValid, false)
    }
})

test('modal pages retain their caller, full pages destroy it, and achievements stay cached through gameplay', async () => {
    const music: string[] = []
    const navigation: string[] = []
    let quitOptions: any
    let gameOptions: any
    let quits = 0
    let achievementInitializations = 0, achievementRefreshes = 0, warmDraws = 0, preparationYields = 0
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
            waitForPreloadFrame: async () => { preparationYields++ },
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
                assets: { presentation: { screens: {} } },
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
                                if (this.name === 'Controls') {
                                    assert.equal(achievementRoot.active, true, 'prewarm activates the page before constructing its components')
                                    assert.equal(achievementRoot.siblingIndex, 0, 'incremental initialization stays behind the loading screen')
                                    achievementInitializations++
                                    achievementView = component
                                }
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
    assert.equal(gameOptions.levelIntro, false)
    gameOptions.onClose()
    gameOptions.onRestart()
    gameOptions.onMainMenu()
    assert.deepEqual(navigation.slice(-3), ['resume', 'restart', 'main'])
    options.root.destroy()
    screen.isLevelIntro = () => true
    const chooserOptions = await screen.prepare('gameOptions')
    assert.equal(gameOptions.inGame, true, 'seed selection retains the in-game options layout')
    assert.equal(gameOptions.levelIntro, true)
    chooserOptions.root.destroy()
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
    assert.equal(preparationYields, 2, 'resource preloading, main-menu construction and achievement construction use separate frames')
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
