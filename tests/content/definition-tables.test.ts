import { readBaseContent, readGameplaySource, readPresentationSource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPresented } from '@/client/content/assertPresented'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { TutorialResource } from '@/server/state/levelState'
import { buildGameplayContent, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { almanacGround, parsePresentationDefinitions } from '@/shared/content/presentation'
import type { StartSessionPacket } from '@/shared/protocol'
import { adventureSeeds } from '../server/adventure-seeds'
import { runCommand } from '../server/run-command'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const start = (levelId: string, levels: Parameters<typeof adventureSeeds>[0], firstAdventure: boolean): StartSessionPacket => ({ type: 'startSession',
    protocolVersion: 1, sequence: 1, levelId, randomSeed: 1, initialMoney: 0, firstAdventure, mods: [], ownedSeeds: adventureSeeds(levels, levelId) })

test('the store and the almanac are definition tables: a Mod adds its own entries, overrides any, and their looks go the same way', () => {
    const { store } = readGameplaySource('definitions')
    const built = buildGameplayContent(readBaseContent().gameplay, [{ ownerId: 'test', data: {
        storePages: { 'test:page': { level: 5 } },
        store: { 'test:hat': { page: 'test:page', place: 0, cost: 10, message: 2000, purchase: { kind: 'set', value: 1 } } },
        overrides: { store: { 'pvz:rake': { ...store['pvz:rake'], cost: 30 } }, almanac: { 'pvz:screendoor': { place: 10, startingLevel: 13 } } },
    } }]).definitions
    assert.deepEqual(Object.keys(built.storePages), ['pvz:slot-upgrades', 'pvz:plant-upgrades', 'pvz:zen-garden-1', 'pvz:zen-garden-2', 'test:page'],
        "a Mod's pages come after the base's")
    assert.deepEqual([built.store['test:hat'].page, built.store['pvz:rake'].cost, built.almanac['pvz:screendoor'].place], ['test:page', 30, 10])
    for (const kind of ['store', 'storePages', 'almanac', 'tools']) {
        assert.throws(() => buildGameplayContent(readBaseContent().gameplay, [{ ownerId: 'test', data: { [kind]: { 'pvz:extra': {} } } }]), /cannot register pvz:extra/)
    }
    const looks = buildPresentationDefinitions(readPresentationSource(), [{ ownerId: 'test', data: {
        store: { 'test:hat': { sprite: 'test:hat', highlight: { type: 'none' } } },
        almanac: { 'test:walker': { ground: 'night' } },
        overrides: { store: { 'pvz:rake': { sprite: 'icon_rake' } }, almanac: { 'pvz:normal': { ground: 'ice' } } },
    } }])
    assert.deepEqual([looks.store['test:hat'], looks.store['pvz:rake']], [{ sprite: 'test:hat', highlight: { type: 'none' } }, { sprite: 'icon_rake' }])
    assert.deepEqual(['pvz:normal', 'test:walker', 'pvz:puffshroom', 'pvz:explodenut'].map(id => almanacGround(looks, id)), ['ice', 'night', 'night', 'day'],
        'a plant or zombie without an entry stands on the day ground')
})

test('the store, the almanac, the tools and the Zen Garden take only what they support, checked as they are read', () => {
    const invalid = (change: (value: any) => void) => {
        const value = readGameplaySource('definitions')
        change(value)
        return () => parseGameplayDefinitions(value)
    }
    for (const [change, message] of [
        [(value: any) => { value.store['pvz:rake'].sprite = 'icon_rake' }, /store\.pvz:rake\.sprite is not supported/],
        [(value: any) => { value.store['pvz:rake'].place = 1 }, /store\.pvz:pool-cleaner and store\.pvz:rake share place 1 of pvz:slot-upgrades/],
        [(value: any) => { value.store['pvz:rake'].place = 8 }, /place must be below 8/],
        [(value: any) => { value.store['pvz:rake'].page = 'pvz:missing' }, /store\.pvz:rake\.page references unknown ID pvz:missing/],
        [(value: any) => { value.store['pvz:rake'].prices = [20, 40] }, /exactly one of cost and prices/],
        [(value: any) => { delete value.store['pvz:rake'].message }, /exactly one of message and messages/],
        [(value: any) => { value.store['pvz:rake'].level = 2; value.store['pvz:rake'].completed = true }, /at most one of level and completed/],
        [(value: any) => { value.store['pvz:rake'].purchase = { kind: 'gift' } }, /purchase\.kind must be set, count, stock, timestamp, plant or seed/],
        [(value: any) => { value.store['pvz:wheelbarrow'].requires.anyPurchases = ['pvz:moon-garden'] }, /requires\.anyPurchases\[0\] references unknown ID/],
        [(value: any) => { value.store['pvz:rake'].effect = 'seedSlots' }, /exactly one item with the seedSlots effect/],
        [(value: any) => { value.storePages['pvz:plant-upgrades'].level = 0 }, /storePages\.pvz:plant-upgrades\.level must be positive/],
        [(value: any) => { value.almanac['pvz:flag'].place = 0 }, /almanac\.pvz:normal and almanac\.pvz:flag share place 0/],
        [(value: any) => { value.almanac['pvz:yeti'] = { place: 30, startingLevel: 1 } }, /almanac key references unknown ID pvz:yeti/],
        [(value: any) => { value.almanac['pvz:normal'].ground = 'day' }, /almanac\.pvz:normal\.ground is not supported/],
        [(value: any) => { value.tools['pvz:shovel'].kind = 'hammer' }, /tools\.pvz:shovel\.kind must be shovel/],
        [(value: any) => { value.zenGarden.template.facing = 'up' }, /zenGarden\.template\.facing must be left or right/],
    ] as const) assert.throws(invalid(change), message)

    // The looks are as strict.
    for (const [change, message] of [
        [(data: any) => { data.store['pvz:rake'].cost = 20 }, /store\.pvz:rake\.cost is not supported/],
        [(data: any) => { data.store['pvz:rake'].highlight = { type: 'additive' } }, /highlight\.opacity is required/],
        [(data: any) => { data.store['pvz:imitater'].highlight.opacity = 32 }, /highlight\.opacity is not supported/],
        [(data: any) => { data.almanac['pvz:peashooter'].ground = 'moon' }, /almanac\.pvz:peashooter\.ground must be day, night, pool, nightpool, roof or ice/],
        [(data: any) => { data.storeDialogue.ambient.interval = [5, 0] }, /storeDialogue\.ambient\.interval must be an ordered range/],
        [(data: any) => { data.storeDialogue.ambient.messages[0].weight = 0.5 }, /messages\[0\]\.weight must be a non-negative safe integer/],
    ] as const) {
        const data = structuredClone(readPresentationSource())
        change(data)
        assert.throws(() => parsePresentationDefinitions(data), message)
    }
})

test("a level's tools, tool award and tutorial name what is installed, and a level without a script leaves the tutorial out", () => {
    const source = () => readGameplaySource('levels')
    const levels = parseGameplayLevels(source(), definitions)
    const invalid = (id: string, change: (level: any) => void) => {
        const value = source()
        change(value.levels[id])
        return () => parseGameplayLevels(value, definitions)
    }
    assert.throws(invalid('pvz:adventure-2-5', level => { level.tools = ['pvz:hammer'] }), /pvz:adventure-2-5\.tools\[0\] references unknown ID pvz:hammer/)
    assert.throws(invalid('pvz:adventure-1-4', level => { level.award.id = 'pvz:hammer' }), /pvz:adventure-1-4\.award\.id references unknown ID pvz:hammer/)
    assert.deepEqual(Object.keys(levels.levels).filter(id => levels.levels[id].tutorial === undefined),
        ['pvz:stress-test', 'pvz:seed-chooser-test', 'pvz:teams-demo', 'pvz:adventure-1-8', 'pvz:adventure-1-9', 'pvz:adventure-1-10'])

    const scripted = (tutorial: string) => {
        const value = source()
        value.levels['pvz:adventure-1-8'].tutorial = tutorial
        return parseGameplayLevels(value, definitions)
    }
    // Once named a "pvz:standard" script that never existed; an unknown name now fails at load instead of meaning none.
    assert.throws(() => new GameplayRegistry().validate(definitions, scripted('pvz:standard')), /pvz:adventure-1-8\.tutorial: tutorial is not installed: pvz:standard/)
    // A Mod registers its script as it does its other server registrations, and the level's start runs it.
    const gameplay = new GameplayRegistry()
    gameplay.tutorials.register('test', 'test:script', { initialize(world) { world.resources.get(TutorialResource).step = 'test:step' } })
    assert.throws(() => gameplay.tutorials.register('other', 'test:script', {}), /tutorial test:script is already registered by test/)
    const server = new IntegratedGameServer(definitions, scripted('test:script'), gameplay)
    assert.equal(server.start(start('pvz:adventure-1-8', levels, true)).tutorial.step, 'test:step', 'with steps of its own, in its namespace')
    assert.equal(server.start({ ...start('pvz:adventure-1-8', levels, true), save: server.save() as never }).tutorial.step, 'test:step', 'which a save keeps')
})

test('a tool does what its kind does: a Mod\'s shovel digs as the base\'s, and it needs its look', () => {
    const content = buildGameplayContent(readBaseContent().gameplay, [{ ownerId: 'test', data: {
        tools: { 'test:spade': { kind: 'shovel' } }, levelPatches: { 'pvz:adventure-1-4': { tools: ['test:spade'] } },
    } }])
    const server = new IntegratedGameServer(content.definitions, content.levels)
    server.start(start('pvz:adventure-1-4', content.levels, false))
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    assert.deepEqual(server.snapshot().tools, { owned: ['test:spade'], available: ['test:spade'] })
    assert.equal(runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' }), 'unsupported-command', 'the level offers only its own tools')
    server.enqueueDebugCommand(1, '/plant sunflower 3 4')
    server.processBoundaryCommands()
    server.drainCommandResults()
    assert.equal(runCommand(server, { type: 'selectTool', toolId: 'test:spade' }), undefined)
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'useToolAt', row: 2, column: 3 }), undefined)
    assert.ok(server.drainEvents().some(event => event.type === 'plantShoveled'))
    assert.deepEqual(server.snapshot().plants, [])

    const any = { draws: () => true }, views = { plants: any, zombies: any, projectiles: any, gridItems: any, items: any }
    const source = readPresentationSource()
    assert.throws(() => assertPresented(content, buildPresentationDefinitions(source), views), /Tool presentation is not installed: test:spade/)
    const look = buildPresentationDefinitions(source, [{ ownerId: 'test', data: { tools: { 'test:spade': source.tools['pvz:shovel'] } } }])
    assert.doesNotThrow(() => assertPresented(content, look, views))
})
