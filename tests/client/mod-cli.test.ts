import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as cli from '@/shared/debug/DebugCli'
import { ModHost } from '@/shared/mod/ModHost'
import { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { createServerModHost } from '@/server/createModHost'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { EconomyStateResource } from '@/server/components'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'

function client() {
    const modules: Record<string, any> = {
        '@/shared/mod/ModHost': { ModHost }, '@/shared/mod/ModAssets': { ModAssets: class {} },
        '@/shared/debug/DebugCli': cli,
    }
    const load = (path: string) => {
        const exports: any = {}
        const code = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
        })
        runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
        return exports
    }
    const commands = load('platform/debug/DebugCliCommands')
    modules['@/platform/debug/DebugCliCommands'] = commands
    const { createClientModHost } = load('client/content/createModHost')
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
    const load = (path: string, modules: Record<string, unknown>) => {
        const exports: any = {}
        const code = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
        })
        runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
        return exports
    }
    const settings = () => load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings
    const GameDebugSettings = settings()
    const { executeDebugCliCommand } = load('platform/debug/DebugCliCommands', {
        cc: { sys }, '@/shared/debug/DebugCli': cli, './GameDebugSettings': { GameDebugSettings },
    })
    assert.equal(GameDebugSettings.plantInvincible, false)
    assert.equal((await executeDebugCliCommand('/plantinvincible true', true, () => cli.debugCondition('rejected'))).ok, false)
    assert.equal(settings().plantInvincible, false)
    assert.equal((await executeDebugCliCommand('/plantinvincible true', true, () => cli.debugSuccess('ok'))).ok, true)
    assert.equal(settings().plantInvincible, true)
    assert.equal((await executeDebugCliCommand('/plantinvincible false', true, () => cli.debugSuccess('ok'))).ok, true)
    assert.equal(settings().plantInvincible, false)
})

test('FPS command persists its setting and works without an active level', async () => {
    const storage = new Map<string, string>()
    const sys = { isMobile: false, localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    } }
    const load = (path: string, modules: Record<string, unknown>) => {
        const exports: any = {}
        const code = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
        })
        runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
        return exports
    }
    const settings = () => load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings
    const GameDebugSettings = settings()
    const { executeDebugCliCommand } = load('platform/debug/DebugCliCommands', {
        cc: { sys }, '@/shared/debug/DebugCli': cli, './GameDebugSettings': { GameDebugSettings },
    })
    assert.equal(GameDebugSettings.fpsVisible, false)
    assert.deepEqual(cli.getDebugCliCompletions('/fps ', undefined, true), ['/fps true', '/fps false'])
    const run = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('FPS is a client setting'))
    assert.equal((await run('/fps true')).ok, true)
    assert.equal(settings().fpsVisible, true)
    assert.equal((await run('/fps invalid')).failure, 'syntax')
    assert.equal(settings().fpsVisible, true)
    assert.equal((await run('/fps false')).ok, true)
    assert.equal(settings().fpsVisible, false)
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
        assert.equal((await run('/TEST:HELLO "Pea Shooter"')).message, 'Hello Pea Shooter')
        assert.equal((await run('/test:hello')).failure, 'syntax')
        assert.equal((await run('/test:hello a b')).failure, 'syntax')
        assert.equal(calls, 1)
        assert.equal((await run('/home')).action, 'home')
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
    const { executor } = serverHost.get('server/debug/DebugCommands')
    serverHost.around(executor, 'execute', (next, world, definitions, tick, command, createPlant) => {
        if (command.name !== name) return next(world, definitions, tick, command, createPlant)
        const amount = cli.debugInteger(command.args[0])
        if (amount === null || amount < 0) return cli.debugSyntax('Use a non-negative integer')
        const economy = world.resources.get(EconomyStateResource)
        economy.sun += amount
        return cli.debugSuccess(`Sun: ${economy.sun}`)
    })
    const definitions = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
    const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
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
        assert.equal((await run(`/${name} 125`)).message, 'Sun: 175')
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
