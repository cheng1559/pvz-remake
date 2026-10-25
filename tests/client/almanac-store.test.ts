import { readGameplaySource } from '../../tools/content_source'
import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { MenuApi } from '@/client/api/MenuApi'
import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ModHost } from '@/shared/mod/ModHost'
import * as animationDefinitions from '@/client/content/ClientAnimationRegistry'

test('almanac shares level clips, attachments and mod overrides while retaining UI poses', () => {
    const { resolveEntityDisplay } = load('client/reanim/EntityDisplay', {
        '@/client/content/ClientAnimationRegistry': animationDefinitions,
    })
    const catalog = JSON.parse(readFileSync('tools/generated/resources/almanac-animations.json', 'utf8'))
    const animations = new animationDefinitions.ClientAnimationRegistry(presentationFixture)
    const display = (kind: string, id: number) => resolveEntityDisplay(kind, id, catalog[kind][id], animations)
    const nut = display('plants', 3)
    assert.equal(nut.parts[0].id, animations.resolve('pvz:wallnut').body.reanimId)
    assert.equal(nut.nutBlink, true)
    assert.equal(nut.parts.filter((part: any) => part.blink).length, 3)
    assert.deepEqual(nut.drawOffset, catalog.plants[3].drawOffset)
    assert.equal(display('plants', 2).parts[0].id, animations.resolve('pvz:cherrybomb').idle.reanimId)
    assert.equal(display('zombies', 0).parts[0].id, animations.resolve('pvz:normal').idle.reanimId)
    assert.equal(display('zombies', 0).parts[0].idle2Id, animations.resolve('pvz:normal').idle2.reanimId)
    assert.equal(display('plants', 23), catalog.plants[23], 'display-only plants retain their existing definition')

    // Validate actual shared resources and sockets for animated details and static portraits.
    const manifest = JSON.parse(readFileSync('tools/generated/pvz-base/manifest.json', 'utf8'))
    for (const kind of ['plants', 'zombies']) for (let id = 0; id < catalog[kind].length; id++) {
        const entry = display(kind, id)
        for (const parts of [entry.parts, entry.portrait?.parts ?? []]) {
            const clips = new Map(parts.map((part: any) => [part.name,
                JSON.parse(readFileSync(`tools/generated/pvz-base/${manifest.client.reanim[part.id]}.json`, 'utf8'))]))
            for (const part of parts) if (part.parent) {
                const parent = clips.get(part.parent) as any
                assert.ok(parent?.tracks.some((track: any) => track.id === part.track), `${kind} ${id}: missing ${part.track}`)
            }
        }
    }

    const host = new ModHost('test:animations', {})
    host.around(animations, 'resolve', function (next, target) {
        const clips = next(target)
        if (target === 'pvz:peashooter') return { ...clips, idleHead: { ...clips.idleHead,
            reanimId: 'test:head', attachmentTrackId: 'test_stem', rateScale: 2 } }
        if (target === 'pvz:flag') return { ...clips, flag: { ...clips.flag, reanimId: 'test:flag' } }
        return clips
    })
    try {
        const pea = display('plants', 0)
        assert.equal(pea.parts[1].id, 'test:head')
        assert.equal(pea.parts[1].track, 'test_stem')
        assert.equal(pea.parts[1].rateScale, 2)
        assert.equal(display('zombies', 1).portrait.parts[0].id, 'test:flag')
    } finally { host.dispose() }
})

function load(path: string, modules: Record<string, unknown> = {}) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, console })
    return module.exports
}

function fixture() {
    const data = new Map<string, string>()
    const storage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key, value) },
        removeItem: (key: string) => { data.delete(key) },
        key: (index: number) => [...data.keys()][index] ?? null,
        get length() { return data.size },
    }
    const ProfileStore = load('server/menu/ProfileStore').createProfileStore(storage)
    const sourceCatalog = load('server/menu/StoreCatalog').createStoreCatalog(readGameplaySource('store'))
    // VM-created objects cross into the host-realm transport used by this fixture.
    const catalog = { ...sourceCatalog, speech: (profile: unknown) => JSON.parse(JSON.stringify(sourceCatalog.speech(profile))) }
    const store = { ...catalog, ...load('client/ui/formatMoney') }
    const menuApi = new MenuApi(createLocalMenuTransport(storage, undefined, undefined, catalog))
    const item = (id: number) => store.STORE_PAGES.flat().find((item: { id: number }) => item.id === id)
    return { store, ProfileStore, item, menuApi, profile: ProfileStore.createProfile('Alice') }
}

test('store respects progress, escalating slot prices, balance and one-time purchase limits', () => {
    const { profile, ProfileStore, item, store: { storePages, itemCost, itemState, purchaseItem, formatMoney } } = fixture()
    assert.equal(JSON.stringify(storePages(profile)), '[0]')
    assert.equal(itemState(item(23), profile), 'hidden')
    profile.adventureLevel = 45
    assert.equal(JSON.stringify(storePages(profile)), '[0,1,2]')
    assert.equal(itemState(item(4), profile), 'hidden')
    profile.finishedAdventure = 1
    assert.equal(JSON.stringify(storePages(profile)), '[0,1,2,3]')
    assert.equal(formatMoney(123456), '$1,234,560')
    assert.equal(purchaseItem(item(0), profile), false)
    assert.equal(profile.coins, 0)
    assert.equal(profile.purchases[0], 0)
    profile.coins = 20000
    for (const [index, price] of [75, 500, 2000, 8000].entries()) {
        assert.equal(itemCost(item(21), profile), price)
        assert.equal(purchaseItem(item(21), profile), true)
        assert.equal(profile.purchases[21], index + 1)
    }
    assert.equal(profile.coins, 9425)
    assert.equal(itemState(item(21), profile), 'soldOut')
    assert.equal(purchaseItem(item(21), profile), false)
    assert.equal(purchaseItem(item(0), profile), true)
    assert.equal(purchaseItem(item(0), profile), false)
    ProfileStore.saveProfile(profile)
    const saved = ProfileStore.getCurrentProfile()
    assert.equal(saved.coins, 8925)
    assert.equal(saved.purchases[0], 1)
    assert.equal(saved.purchases[21], 4)
})

test('garden stock uses the original count offset, daily plant limits and unique garden positions', () => {
    const { profile, item, store: { itemState, purchaseItem } } = fixture()
    const now = Date.UTC(2026, 9, 20)
    profile.finishedAdventure = 1
    profile.coins = 100000
    assert.equal(itemState(item(19), profile), 'comingSoon')
    assert.equal(purchaseItem(item(18), profile), true)
    assert.equal(itemState(item(19), profile), 'available')
    for (let count = 0; count < 4; count++) assert.equal(purchaseItem(item(14), profile), true)
    assert.equal(profile.purchases[14], item(14).purchase.minimum + 20)
    assert.equal(itemState(item(14), profile), 'soldOut')
    assert.equal(purchaseItem(item(14), profile), false)
    assert.equal(purchaseItem(item(10), profile, now), true)
    assert.equal(purchaseItem(item(10), profile, now), false)
    assert.equal(purchaseItem(item(11), profile, now), true)
    assert.equal(purchaseItem(item(10), profile, now + 86400000), true)
    assert.equal(profile.numPottedPlants, 3)
    assert.equal(new Set(profile.pottedPlants.map((plant: { x: number, y: number }) => `${plant.x},${plant.y}`)).size, 3)
    assert.equal(itemState(item(28), profile), 'comingSoon')
})

test('store confirmation cancels without changes, persists a confirmed purchase, and rejects insufficient funds', async () => {
    const catalog = fixture()
    const { ProfileStore, profile, item } = catalog
    profile.coins = 1000
    ProfileStore.saveProfile(profile)
    const { StoreScreen } = load('client/screens/StoreScreen', {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/api/MenuApi': { menuApi: catalog.menuApi },
        '@/client/input/UIHoverManager': { UIHoverManager: { refreshHoverStates() {} } },
    })
    const screen = new StoreScreen()
    screen.node = { isValid: true }
    screen.age = 2
    screen.data = await catalog.menuApi.getStore()
    let stopped = 0
    screen.dave = { stopTalking() { stopped++ } }
    screen.refreshEnabled = screen.renderItems = () => {}
    let accepted = false
    const dialogs: string[] = []
    screen.ui = {
        text: (key: string) => key,
        dialog: (_parent: unknown, options: { title: string, message?: string }) => {
            if (options.title === 'Error') throw new Error(options.message)
            dialogs.push(options.title)
            return { result: Promise.resolve(accepted) }
        },
    }
    await screen.buy(item(0))
    assert.equal(stopped, 1, 'opening purchase confirmation hides the shared Dave bubble')
    assert.equal(ProfileStore.getCurrentProfile().coins, 1000)
    assert.equal(ProfileStore.getCurrentProfile().purchases[0], 0)
    accepted = true
    await screen.buy(item(0))
    assert.equal(ProfileStore.getCurrentProfile().coins, 500)
    assert.equal(ProfileStore.getCurrentProfile().purchases[0], 1)
    await screen.buy(item(0))
    assert.equal(dialogs.length, 2, 'sold-out items cannot open another purchase dialog')
    const current = ProfileStore.getCurrentProfile()
    current.coins = 0
    ProfileStore.saveProfile(current)
    await screen.buy(item(1))
    assert.equal(dialogs.at(-1), 'NOT_ENOUGH_MONEY')
    assert.equal(ProfileStore.getCurrentProfile().purchases[1], 0)
    assert.equal(screen.waiting, false)
})

test('store reuses Dave for entry, descriptions, waiting-dialog animation, timeout and page changes', async () => {
    const calls: string[] = [], messages: string[] = []
    const catalog = fixture(), speech = catalog.store.speech(catalog.profile)
    const data = { coins: 100, playerName: 'Alice', pages: [{ items: [] }, { items: [] }], speech }
    const dave = { ready: true, isSpeaking: false, enter() { calls.push('enter') }, say(message: string) { messages.push(message) },
        stopTalking() { calls.push('stop') }, update(dt: number) { calls.push(`update:${dt}`) } }
    const node = () => ({ isValid: true, active: true, position: { x: 0, y: 0, clone() { return { x: 0, y: 0 } } }, setPosition() {} })
    const presentation = { dave: presentationFixture.dave }
    const ui = {
        assets: { presentation, fonts: { pageTitleSmall: { config: {} } } },
        text: (key: string) => key === 'CRAZY_DAVE_2000' ? '{NO_SOUND}{NO_CLICK}Cost {UPGRADE_COST}; {MONEY}; {PLAYER_NAME}' : key,
        image: () => ({ node: node() }),
        label: () => ({ node: node(), renderer: {} }),
        button: () => ({ node: node(), onStateChange() {} }),
    }
    const { StoreScreen } = load('client/screens/StoreScreen', {
        cc: { Component: class {}, Color: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/api/MenuApi': { menuApi: { getStore: async () => data } },
        '@/core/SpriteLoader': { SpriteLoader: { load: async () => ({ originalSize: { width: 100, height: 50 } }) } },
        '@/client/font': { FontMetricsUtil: { getMetrics: () => ({ ascent: 20 }) } },
        '@/client/content/loadClientContent': { loadClientContent: async () => ({ registry: 'registry', loader: 'loader' }) },
        '@/client/characters/CrazyDaveView': { CrazyDaveView: { create: async (_parent: unknown, content: any, assets: unknown, options: any) => {
            assert.equal(assets, ui)
            assert.equal(content.registry, 'registry')
            assert.equal(content.presentation, presentation)
            assert.equal(options.position.x + options.bubble.x, 63)
            assert.equal(options.position.y - options.bubble.y, -10, 'the store bubble retains its original position')
            assert.equal(options.clickToContinue, false)
            return dave
        } } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
        '@/client/sound/LegacySoundSystem': { SoundEffect: {}, SoundLoader: { play() {} } },
        '@/client/input/UIHoverManager': { UIHoverManager: { refreshHoverStates() {} } },
        '@/client/ui/formatMoney': load('client/ui/formatMoney'),
    })
    const screen = new StoreScreen()
    screen.node = node()
    screen.renderItems = () => {}
    await screen.initialize(ui, () => {})
    assert.deepEqual(calls, ['enter'])
    screen.showDescription({ message: 2000, cost: 50 })
    assert.equal(messages[0], '{NO_SOUND}{NO_CLICK}Cost $500; $1,000; Alice', 'control tokens survive variable substitution')
    screen.waiting = true
    screen.update(0.1)
    assert.equal(calls.at(-1), 'update:0.1', 'Dave keeps idling and blinking behind a purchase dialog')
    assert.equal(screen.age, 0)
    screen.waiting = false
    screen.age = 2
    screen.update(1.1)
    assert.equal(calls.at(-1), 'stop', 'description timeout hides the bubble without removing Dave')
    screen.items = { active: true, getComponentsInChildren: () => [] }
    screen.turnPage(1)
    assert.equal(screen.page, 1)
    assert.equal(calls.at(-1), 'stop')
    screen.onDisable()
    assert.equal(calls.filter(call => call === 'stop').length, 3)
})

test('store chatter follows adventure completion without changing coins or inventory', async () => {
    const { profile, ProfileStore, menuApi } = fixture()
    profile.adventureLevel = 45
    ProfileStore.saveProfile(profile)
    const data = await menuApi.getStore()
    assert.equal(ProfileStore.getCurrentProfile().purchases[14], 0)
    assert.equal(ProfileStore.getCurrentProfile().coins, profile.coins)
    assert.equal(data.speech.ambient.messages.find(entry => entry.message === 2018)?.weight, 0)
    const complete = ProfileStore.getCurrentProfile()
    complete.finishedAdventure = 1
    ProfileStore.saveProfile(complete)
    assert.equal((await menuApi.getStore()).speech.ambient.messages.find(entry => entry.message === 2018)?.weight, 20)
})

test('store ambient speech respects hover, voice completion, dialogs and weighted non-repetition', async () => {
    const { menuApi } = fixture()
    const spoken: string[] = []
    let stops = 0
    const { StoreScreen } = load('client/screens/StoreScreen', {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { activeModalRoot: null, isInputBlocked: false } },
        '@/client/ui/formatMoney': load('client/ui/formatMoney'),
    })
    const screen = new StoreScreen()
    screen.node = { isValid: true }
    screen.data = await menuApi.getStore()
    screen.age = screen.data.speech.readyDelay
    screen.ambientTimer = screen.data.speech.ambient.initialDelay
    screen.ui = { text: (key: string) => key }
    screen.dave = { ready: true, isSpeaking: false, say: (text: string) => spoken.push(text), stopTalking() { stops++ } }
    screen.updateSpeech(1)
    assert.equal(spoken.length, 0)
    screen.waiting = true
    screen.updateSpeech(10)
    assert.equal(screen.ambientTimer, 1)
    screen.waiting = false
    screen.hoveredItem = {}
    screen.bubbleTimer = 1
    screen.updateSpeech(10)
    assert.equal(spoken.length, 0, 'hovering an item suppresses idle chatter')
    screen.hoveredItem = null
    screen.dave.isSpeaking = true
    screen.updateSpeech(2)
    assert.equal(stops, 0, 'speech must not be cut off when the bubble timer expires')
    screen.dave.isSpeaking = false
    screen.updateSpeech(2)
    assert.equal(stops, 1)
    screen.updateSpeech(1)
    assert.equal(spoken.length, 1)
    for (let i = 0; i < 8; i++) {
        assert.ok(screen.ambientTimer >= 5 && screen.ambientTimer <= 10)
        screen.updateSpeech(8)
        screen.updateSpeech(10)
    }
    assert.ok(spoken.every(text => ['CRAZY_DAVE_2015', 'CRAZY_DAVE_2016', 'CRAZY_DAVE_2017'].includes(text)))
    assert.ok(spoken.every((text, index) => !index || text !== spoken[index - 1]))
})

test('all localized almanac descriptions retain bitmap text while consuming color and spacing tags', () => {
    class Color { constructor(public r: number, public g: number, public b: number) {} }
    const { FontMetricsUtil } = load('client/font/FontMetrics')
    const { almanacLines } = load('client/screens/AlmanacText', { cc: { Color } })
    const { ALMANAC_PLANTS, ALMANAC_ZOMBIES } = load('server/menu/AlmanacCatalog')
    const strings = JSON.parse(readFileSync('tools/generated/resources/properties/lawnstrings.json', 'utf8'))
    const font = { json: JSON.parse(readFileSync('tools/generated/resources/fonts/briannetod12.json', 'utf8')) }
    const measure = (value: string) => FontMetricsUtil.measureTextWidth(font, value)
    for (const { key } of [...ALMANAC_PLANTS, ...ALMANAC_ZOMBIES]) {
        for (const suffix of ['DESCRIPTION_HEADER', 'DESCRIPTION']) {
            const text = strings[`${key}_${suffix}`] ?? ''
            const lines = almanacLines(text, measure, 250)
            const rendered = lines.flatMap((line: any) => line.runs.map((run: any) => run.text)).join(' ')
            assert.equal(/[{}]/.test(rendered), false, `${key} leaked a formatting tag`)
            assert.equal(rendered.replace(/\s/g, ''), text.replace(/\{[^}]*\}|\s/g, ''), `${key} lost text`)
            for (const line of lines) assert.ok(line.runs.reduce((sum: number, run: any) => sum + measure(run.text.trimEnd()), 0) <= 250, `${key} exceeds its text column`)
        }
    }
})
