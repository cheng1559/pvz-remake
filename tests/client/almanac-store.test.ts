import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { MenuApi } from '@/client/api/MenuApi'
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import { readGameplaySource } from '../../tools/mod/content'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { presentationFixture } from './presentationFixture'


function load(path: string, modules: Record<string, unknown> = {}) {
    return loadScript(`assets/scripts/${path}.ts`, (id: string) => modules[id] ?? {}, { console })
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
    const ProfileStore = load('server/menu/profileStore').createProfileStore(storage)
    const catalog = load('server/menu/storeCatalog').createStoreCatalog(parseGameplayDefinitions(readGameplaySource('definitions')))
    const menuApi = new MenuApi(createLocalMenuTransport(storage, undefined, undefined, catalog))
    return { ProfileStore, item: catalog.item, menuApi, profile: ProfileStore.createProfile('Alice') }
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
        assets: { presentation: presentationFixture },
        text: (key: string) => key,
        dialog: (_parent: unknown, options: { title: string, message?: string }) => {
            if (options.title === 'Error') throw new Error(options.message)
            dialogs.push(options.title)
            return { result: Promise.resolve(accepted) }
        },
    }
    await screen.buy(item('pvz:gatlingpea'))
    assert.equal(stopped, 1, 'opening purchase confirmation hides the shared Dave bubble')
    assert.equal(ProfileStore.getCurrentProfile().coins, 1000)
    assert.deepEqual([...ProfileStore.getCurrentProfile().seeds], [])
    accepted = true
    await screen.buy(item('pvz:gatlingpea'))
    assert.equal(ProfileStore.getCurrentProfile().coins, 500)
    assert.deepEqual([...ProfileStore.getCurrentProfile().seeds], ['pvz:gatlingpea'], 'a store plant becomes an owned seed')
    await screen.buy(item('pvz:gatlingpea'))
    assert.equal(dialogs.length, 2, 'sold-out items cannot open another purchase dialog')
    const current = ProfileStore.getCurrentProfile()
    current.coins = 0
    ProfileStore.saveProfile(current)
    await screen.buy(item('pvz:twinsunflower'))
    assert.equal(dialogs.at(-1), 'NOT_ENOUGH_MONEY')
    assert.deepEqual([...ProfileStore.getCurrentProfile().seeds], ['pvz:gatlingpea'])
    assert.equal(screen.waiting, false)
})
