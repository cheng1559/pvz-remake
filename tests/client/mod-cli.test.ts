import { withFixedBanks } from '../fixedBankLevels'
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as cli from '@/shared/debug/DebugCli'
import { MAX_TICKS_PER_UPDATE } from '@/shared/protocol'
import * as menu from '@/shared/menu'
import { ModHost } from '@/shared/mod/ModHost'
import { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { createServerModHost } from '@/server/session/createModHost'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { EconomyStateResource } from '@/server/state/resources'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'

function load(path: string, modules: Record<string, unknown>) {
    return loadScript(`assets/scripts/${path}.ts`, (id: string) => modules[id] ?? {})
}

function client() {
    const modules: Record<string, any> = {
        '@/shared/mod/ModHost': { ModHost }, '@/shared/mod/ModAssets': { ModAssets: class {} },
        '@/shared/debug/DebugCli': cli,
    }
    const commands = load('platform/debug/DebugCliCommands', modules)
    modules['@/platform/debug/DebugCliCommands'] = commands
    // The host gives its modules by path (hostModules); these two are the ones the commands need.
    modules['./hostModules'] = { CLIENT_HOST_MODULES: { 'shared/debug/DebugCli': cli, 'platform/debug/DebugCliCommands': commands } }
    const { createClientModHost } = load('client/content/createModHost', modules)
    return { host: createClientModHost('test:cli', {}, {}, {}, {}) as ModHost,
        execute: commands.executeDebugCliCommand as (input: string, running: boolean,
            run: (input: string) => cli.DebugCliResult) => Promise<cli.DebugCliResult> }
}

function syntax(host: ModHost, name: string) {
    const { specs } = host.get<typeof cli>('shared/debug/DebugCli')
    host.around(specs, 'list', next => {
        const entries = next()
        return entries.some((spec: cli.CommandSpec) => spec.name === name) ? entries
            : [...entries, { name, parameters: ['{value}'], minimum: 1 }]
    })
}

test('plant invincibility is saved only after a successful server command', async () => {
    const storage = new Map<string, string>()
    const sys = { isMobile: false, localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    } }
    const settings = () => load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings
    const GameDebugSettings = settings()
    const { executeDebugCliCommand } = load('platform/debug/DebugCliCommands', {
        cc: { sys }, '@/shared/debug/DebugCli': cli, './GameDebugSettings': { GameDebugSettings },
    })
    assert.equal(GameDebugSettings.plantInvincible, false)
    assert.equal((await executeDebugCliCommand('/plantinvincible', true, () => cli.debugCondition('rejected'))).ok, false)
    assert.equal(settings().plantInvincible, false)
    // The level turns the switch and says where it stands; the preference follows it, and the advice says so.
    const on = await executeDebugCliCommand('/plantinvincible', true, () => cli.debugSwitched('plantinvincible', true))
    assert.deepEqual([on.ok, on.advice], [true, { key: 'DEBUG_SWITCH_ON', args: ['DEBUG_SWITCH_PLANTINVINCIBLE'] }])
    assert.equal(settings().plantInvincible, true)
    assert.equal((await executeDebugCliCommand('/plantinvincible', true, () => cli.debugSwitched('plantinvincible', false))).ok, true)
    assert.equal(settings().plantInvincible, false)
})

test('FPS and cursor commands persist their settings and work without an active level', async () => {
    const storage = new Map<string, string>()
    const sys = { isMobile: false, localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    } }
    const settings = () => load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings
    const GameDebugSettings = settings()
    let cursorRefreshes = 0
    const { executeDebugCliCommand } = load('platform/debug/DebugCliCommands', {
        cc: { sys }, '@/shared/debug/DebugCli': cli, './GameDebugSettings': { GameDebugSettings },
        '@/client/input/CursorManager': { CursorManager: { refresh: () => cursorRefreshes++ } },
    })
    assert.equal(GameDebugSettings.fpsVisible, false)
    assert.equal(GameDebugSettings.originalCursorsEnabled, true)
    assert.deepEqual(cli.getDebugCliCompletions('/fps ', undefined, true), [])
    const run = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('FPS is a client setting'))
    const shown = await run('/fps')
    assert.deepEqual([shown.ok, shown.advice], [true, { key: 'DEBUG_SWITCH_ON', args: ['DEBUG_SWITCH_FPS'] }])
    assert.equal(settings().fpsVisible, true)
    assert.equal(settings().autoPauseEnabled, true)
    assert.deepEqual((await run('/autopause')).advice, { key: 'DEBUG_SWITCH_OFF', args: ['DEBUG_SWITCH_AUTOPAUSE'] })
    assert.equal(settings().autoPauseEnabled, false)
    assert.equal((await run('/autopause on')).failure, 'syntax')
    assert.deepEqual((await executeDebugCliCommand('/autopause', true, () => assert.fail())).advice,
        { key: 'DEBUG_SWITCH_ON', args: ['DEBUG_SWITCH_AUTOPAUSE'] })
    assert.equal(settings().autoPauseEnabled, true)
    assert.equal((await run('/fps true')).failure, 'syntax', 'a switch takes nothing')
    assert.equal(settings().fpsVisible, true)
    assert.deepEqual((await run('/fps')).advice, { key: 'DEBUG_SWITCH_OFF', args: ['DEBUG_SWITCH_FPS'] })
    assert.equal(settings().fpsVisible, false)
    assert.equal((await run('/cursor')).ok, true)
    assert.equal(settings().originalCursorsEnabled, false)
    assert.equal(cursorRefreshes, 1)
    assert.deepEqual((await run('/perf plants')).advice, { key: 'DEBUG_SWITCH_OFF', args: ['DEBUG_SWITCH_PERF_PLANTS'] })
    assert.equal(GameDebugSettings.perfPlantsVisible, false, 'performance switches last only while the game runs')
})

test('/step asks the level to run that many ticks at once, from one to as many as an update runs', async () => {
    const { executeDebugCliCommand } = load('platform/debug/DebugCliCommands', {
        '@/shared/debug/DebugCli': cli, '@/shared/protocol': { MAX_TICKS_PER_UPDATE } })
    // Its results come from the script's own realm: spread, they compare as plain objects.
    const run = async (command: string, running = true) =>
        ({ ...await executeDebugCliCommand(command, running, () => assert.fail('the level runs them, not a game command')) })
    assert.deepEqual(await run('/step 1000'), { ...cli.debugSuccess('Running 1000 ticks'), action: 'step', ticks: 1000 })
    for (const command of ['/step', '/step 0', '/step -3', '/step 1.5', '/step many', '/step 1001']) {
        assert.equal((await run(command)).failure, 'syntax', command)
    }
    assert.deepEqual(await run('/step 10', false), { ...cli.debugCondition('DEBUG_REQUIRES_LEVEL', 'step') })
})

test('client Mod commands reuse parsing and completion, and disappear when their host is disposed', async () => {
    const { host, execute } = client()
    syntax(host, 'test:hello')
    const { executor } = host.get('platform/debug/DebugCliCommands')
    let calls = 0
    host.around(executor, 'execute', (next, input, ...rest) => {
        const parsed = cli.parseDebugCliCommand(input)
        if (!('name' in parsed)) return parsed
        if (parsed.name !== 'test:hello') return next(input, ...rest)
        calls++
        return cli.debugSuccess(`Hello ${parsed.args[0]}`)
    })
    const run = (input: string) => execute(input, false, () => assert.fail('client command must not reach the server'))
    try {
        assert.deepEqual(cli.getDebugCliCompletions('/test:h'), ['/test:hello'])
        assert.equal(cli.getDebugCliSuffix('/test:hello'), ' {value}')
        assert.deepEqual(await run('/TEST:HELLO "Pea Shooter"'), { ok: true, message: 'Hello Pea Shooter' })
        assert.equal((await run('/test:hello')).failure, 'syntax')
        assert.equal((await run('/test:hello a b')).failure, 'syntax')
        assert.equal(calls, 1)
        const goto = await run('/goto MINIGAMES')
        assert.deepEqual([goto.action, goto.page], ['goto', 'minigames'], '/goto opens any menu page')
        assert.equal((await run('/goto award')).failure, 'syntax', 'only pages the menu can open directly')
        assert.deepEqual(cli.getDebugCliCompletions('/goto mi'), ['/goto minigames'])
    } finally { host.dispose() }
    assert.deepEqual(cli.getDebugCliCompletions('/test:h'), [])
    assert.equal((await run('/test:hello world')).failure, 'syntax')
})

test('Mod game commands cross the normal client/server boundary while paused and respect the debug gate', async () => {
    const { host, execute } = client()
    const serverHost = createServerModHost('test:cli', new GameplayRegistry(), new DefinitionSources())
    const name = 'test:addsun'
    syntax(host, name)
    syntax(serverHost, name)
    const { executor } = serverHost.get('server/debug/debugCommands')
    serverHost.around(executor, 'execute', (next, session, command) => {
        if (command.name !== name) return next(session, command)
        const amount = cli.debugInteger(command.args[0])
        if (amount === null || amount < 0) return cli.debugSyntax('Use a non-negative integer')
        const economy = session.world.resources.get(EconomyStateResource)
        economy.sun += amount
        return cli.debugSuccess(`Sun: ${economy.sun}`)
    })
    const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
    const levels = parseGameplayLevels(withFixedBanks(readGameplaySource('levels')), definitions)
    const setup = (debugEnabled = true) => {
        const game = new LocalIntegratedGame(definitions, levels, undefined, debugEnabled)
        game.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
        game.command({ type: 'completeIntro' })
        game.command({ type: 'pause' })
        game.update(0)
        return game
    }
    try {
        assert.deepEqual(cli.getDebugCliCompletions('/test:a'), [`/${name}`], 'client/server registration must not duplicate completions')
        const game = setup(), tick = game.render().gameplayTick
        const run = (input: string) => execute(input, true, value => game.debugCommand(value))
        assert.equal((await run('/sun set 50')).ok, true, 'built-in commands retain their original dispatch')
        assert.deepEqual(await run(`/${name} 125`), { ok: true, message: 'Sun: 175' })
        assert.equal(game.render().sun, 175)
        assert.equal(game.render().paused, true)
        assert.equal(game.render().gameplayTick, tick)
        assert.equal((await run(`/${name} -1`)).failure, 'syntax')
        assert.equal(game.render().sun, 175)
        assert.equal((await execute(`/${name} 1`, false, () => assert.fail('no active level'))).failure, 'condition')
        assert.throws(() => setup(false).debugCommand(`/${name} 1`), /unsupported-command/)
        serverHost.dispose()
        assert.equal((await run(`/${name} 1`)).ok, false)
        assert.equal(game.render().sun, 175)
    } finally { serverHost.dispose(); host.dispose() }
    assert.equal(cli.getDebugCliSuffix(`/${name}`), '')
    assert.equal((cli.parseDebugCliCommand(`/${name} 1`) as cli.DebugCliResult).failure, 'syntax')
})

test('/money sets the profile purse outside a level and runs on the board inside one', async () => {
    let coins = 120, player: object | null = null
    const menuApi = {
        async getCurrentUser() { return player },
        async getPurse() { return { coins } },
        async setCoins(value: number) { coins = value; return { coins } },
    }
    const modules: Record<string, unknown> = { '@/shared/debug/DebugCli': cli, '@/shared/menu': menu, '@/client/api/MenuApi': { menuApi }, './GameDebugSettings': { GameDebugSettings: {} },
        // The coin cap comes from the gameplay settings.
        '@/client/game/loadIntegratedGameContent': { loadGameplayContent: async () => ({ definitions: readGameplaySource('definitions') }) } }
    const exports = load('platform/debug/DebugCliCommands', modules)
    const run = (command: string, running = false) => exports.executeDebugCliCommand(command, running, () => cli.debugSuccess('board'))
    const noPlayer = await run('/money set 5')
    assert.deepEqual([noPlayer.ok, noPlayer.key], [false, 'DEBUG_REQUIRES_PLAYER'])
    player = { id: 1 }
    assert.equal((await run('/money add 30')).ok, true)
    assert.equal(coins, 150)
    await run('/money set 200000')
    assert.equal(coins, 99999, 'PlayerInfo::AddCoins caps the purse')
    await run('/money add -999999')
    assert.equal(coins, 0)
    assert.equal((await run('/money add 1', true)).message, 'board', 'a running level owns the purse')
    assert.equal(coins, 0)
})
