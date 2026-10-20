import assert from 'node:assert/strict'
import { MenuApi } from '@/client/api/MenuApi'
import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

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
    const store = { ...load('server/menu/StoreCatalog'), ...load('client/ui/formatMoney') }
    const menuApi = new MenuApi(createLocalMenuTransport(storage))
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
    const { profile, item, store: { itemState, purchaseItem, PURCHASE_COUNT_OFFSET } } = fixture()
    const now = Date.UTC(2026, 9, 20)
    profile.finishedAdventure = 1
    profile.coins = 100000
    assert.equal(itemState(item(19), profile), 'comingSoon')
    assert.equal(purchaseItem(item(18), profile), true)
    assert.equal(itemState(item(19), profile), 'available')
    for (let count = 0; count < 4; count++) assert.equal(purchaseItem(item(14), profile), true)
    assert.equal(profile.purchases[14], PURCHASE_COUNT_OFFSET + 20)
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
    screen.bubble = { active: true }
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

test('all localized almanac descriptions retain bitmap text while consuming color and spacing tags', () => {
    class Color { constructor(public r: number, public g: number, public b: number) {} }
    const { FontMetricsUtil } = load('client/font/FontMetrics')
    const { almanacLines } = load('client/screens/AlmanacText', { cc: { Color } })
    const { ALMANAC_PLANTS, ALMANAC_ZOMBIES } = load('server/menu/AlmanacCatalog')
    const strings = JSON.parse(readFileSync('assets/resources/properties/lawnstrings.json', 'utf8'))
    const font = { json: JSON.parse(readFileSync('assets/resources/fonts/briannetod12.json', 'utf8')) }
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
