import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { MenuApi } from '@/client/api/MenuApi'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind,ScriptTarget,transpileModule } from 'typescript'
import { readGameplaySource } from '../../tools/mod/content'


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
