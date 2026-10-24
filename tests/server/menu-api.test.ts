import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { MenuApi } from '@/client/api/MenuApi'
import { createLocalMenuTransport } from '@/app/LocalMenuApi'
import { createProfileStore } from '@/server/menu/ProfileStore'
import { createStoreCatalog } from '@/server/menu/StoreCatalog'
import { SFX_VOLUME_SCALE, type MenuStorage } from '@/shared/menu'
import type { GameplayLevels, LevelDefinition } from '@/shared/content/gameplay'

function fixture(getLevel?: () => LevelDefinition | null, canCompleteLevel?: () => boolean) {
    const data = new Map<string, string>()
    const storage: MenuStorage = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { data.set(key, value) },
        removeItem: key => { data.delete(key) },
        key: index => [...data.keys()][index] ?? null,
        get length() { return data.size },
    }
    const profiles = createProfileStore(storage)
    const catalog = createStoreCatalog(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/store.json', 'utf8')))
    const api = new MenuApi(createLocalMenuTransport(storage, getLevel, canCompleteLevel, catalog))
    return { data, storage, profiles, api }
}

test('shop rules, tiers and purchase effects follow JSON after changing the item ID', async () => {
    const definition = JSON.parse(readFileSync('tools/content/pvz-base/gameplay/store.json', 'utf8'))
    const upgrade = definition.pages[0].items[0]
    upgrade.id = 39
    upgrade.prices[0] = 123
    upgrade.messages[0] = 9000
    upgrade.seedSlots[0] = 8
    const { storage, profiles } = fixture()
    const profile = profiles.createProfile('Alice')!
    profile.coins = 10000
    profiles.saveProfile(profile)
    const api = new MenuApi(createLocalMenuTransport(storage, undefined, undefined, createStoreCatalog(definition)))
    const item = (await api.getStore()).pages[0].items.find(item => item.id === 39)!
    assert.equal(item.cost, 123)
    assert.equal(item.message, 9000)
    assert.equal(item.seedSlots, 8)
    const result = await api.purchase(profile.id, 39, 123)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.effect, 'seedSlots')
    assert.equal(result.seedSlots, 8)
    assert.equal(profiles.getCurrentProfile()!.purchases[39], 1)
    assert.equal(result.store.coins, 9877)
})

test('user APIs validate names on the backend, preserve IDs and old saves, and isolate deletion', async () => {
    const { api, data, storage } = fixture()
    assert.equal(await api.getCurrentUser(), null)
    assert.deepEqual(await api.createUser('  '), { ok: false, code: 'emptyName' })
    assert.deepEqual(await api.createUser('invalid!'), { ok: false, code: 'invalidName' })
    assert.deepEqual(await api.createUser('1234567890123'), { ok: false, code: 'invalidName' })
    const alice = await api.createUser('  Alice  ')
    assert.equal(alice.ok, true)
    if (!alice.ok || !alice.user) return assert.fail('Alice must exist')
    const aliceId = alice.user.id
    assert.equal(alice.user.name, 'Alice')
    assert.equal('purchases' in alice.user, false, 'the UI gets a user view, not a writable profile')
    assert.deepEqual(await api.createUser('aLiCe'), { ok: false, code: 'duplicateName' })
    const bob = await api.createUser('Bob')
    if (!bob.ok || !bob.user) return assert.fail('Bob must exist')
    data.set(`pvz-remake:game-save-v2:${aliceId}:adventure`, 'Alice save')
    data.set(`pvz-remake:game-save-v2:${bob.user.id}:adventure:temp`, 'Bob temp')
    data.set(`pvz-remake:saves:${bob.user.id}:adventure`, 'Bob legacy')
    assert.equal((await api.renameUser(bob.user.id, '  Bob   Two ')).ok, true)
    assert.equal((await api.getCurrentUser())?.name, 'Bob Two')
    assert.equal((await api.getCurrentUser())?.id, bob.user.id)
    assert.equal((await api.renameUser(bob.user.id, 'alice')).ok, false)
    assert.equal((await api.deleteUser(bob.user.id)).ok, true)
    assert.equal(data.get(`pvz-remake:game-save-v2:${aliceId}:adventure`), 'Alice save')
    assert.equal([...data.keys()].some(key => key.includes(`:${bob.user!.id}:`)), false)
    const reloaded = new MenuApi(createLocalMenuTransport(storage))
    assert.equal((await reloaded.getCurrentUser())?.id, aliceId)
})

test('shop APIs own prices, availability and charging; copied UI data cannot alter the catalog', async () => {
    const { profiles, api } = fixture()
    const profile = profiles.createProfile('Alice')!
    profile.coins = 2000
    profiles.saveProfile(profile)
    const offer = await api.getStore()
    assert.equal(offer.pages.length, 1)
    const item = offer.pages[0].items.find(item => item.id === 0)!
    assert.deepEqual(item.highlight, { type: 'seedPacket' })
    const slots = offer.pages[0].items.find(item => item.id === 21)!
    assert.equal(slots.seedSlots, 7)
    assert.deepEqual(slots.highlight, { type: 'additive', opacity: 32 })
    assert.deepEqual(offer.pages[0].items.find(item => item.id === 22)!.highlight, { type: 'additive', opacity: 96 })
    item.cost = 0
    offer.coins = 999999
    assert.equal((await api.getStore()).coins, 2000)
    assert.equal((await api.getStore()).pages[0].items.find(item => item.id === 0)!.cost, 500)
    assert.deepEqual((await api.purchase(profile.id, 0, 0)).ok, false)
    assert.equal((await api.purchase(profile.id, 27, 1000)).ok, false, 'a locked shop page cannot be purchased through the API')
    const results = await Promise.all([api.purchase(profile.id, 0, 500), api.purchase(profile.id, 0, 500)])
    assert.equal(results.filter(result => result.ok).length, 1)
    assert.equal((await api.getStore()).coins, 1500)
    assert.equal(profiles.getCurrentProfile()!.purchases[0], 1)
    assert.equal((await api.purchase(profile.id, 21, 75)).ok, true)
    assert.equal((await api.getStore()).pages[0].items.find(item => item.id === 21)!.seedSlots, 8)
    const stale = await api.purchase(profile.id, 21, 75)
    assert.equal(stale.ok, false)
    if (stale.ok === false) assert.equal(stale.code, 'priceChanged')
    const before = (await api.getStore()).coins
    await api.createUser('Bob')
    assert.deepEqual(await api.purchase(profile.id, 1, 500), { ok: false, code: 'profileChanged' })
    const bob = (await api.getCurrentUser())!
    const insufficient = await api.purchase(bob.id, 0, 500)
    assert.equal(insufficient.ok, false)
    if (insufficient.ok === false) assert.equal(insufficient.code, 'insufficientFunds')
    assert.equal((await api.getStore()).coins, 0)
    await api.selectUser(profile.id)
    assert.equal((await api.getStore()).coins, before)
    const completed = profiles.getCurrentProfile()!
    completed.finishedAdventure = 1
    profiles.saveProfile(completed)
    const items = (await api.getStore()).pages.flatMap(page => page.items)
    assert.deepEqual(items.find(item => item.id === 8)!.highlight, { type: 'seedPacket' }, 'Imitater uses packet highlighting despite having a sprite icon')
    assert.deepEqual(items.find(item => item.id === 10)!.highlight, { type: 'none' })
})

test('settings, challenge progress and almanac data are supplied by the backend and survive reconnect', async () => {
    const { api, profiles, storage } = fixture()
    const profile = profiles.createProfile('Alice')!
    profile.challengeRecords[15] = 1
    profiles.saveProfile(profile)
    const settings = await api.updateSettings({ musicVolume: 9, sfxVolume: 9, fullScreen: true })
    assert.equal(settings.musicVolume, 1)
    assert.equal(settings.sfxVolume, SFX_VOLUME_SCALE)
    assert.equal((await new MenuApi(createLocalMenuTransport(storage)).getSettings()).fullScreen, true)
    const challenges = await api.getChallenges('minigames')
    assert.equal(challenges.completed, 1)
    assert.equal(challenges.total, 20)
    assert.equal(challenges.items[0].completed, true)
    const almanac = await api.getAlmanac()
    assert.equal(almanac.plants.length, 49)
    almanac.plants[0].cost = -100
    assert.equal((await api.getAlmanac()).plants[0].cost, 100)
})

test('achievement entries preserve saved flag/icon order and expose only the active user’s unlocks', async () => {
    const { api, profiles } = fixture()
    const empty = await api.getAchievements()
    assert.equal(empty.total, 21)
    assert.equal(empty.completed, 0)
    const profile = profiles.createProfile('Alice')!
    profile.finishedAdventure = 1
    profile.earnedAchievements[4] = true
    profiles.saveProfile(profile)
    const view = await api.getAchievements()
    assert.equal(view.completed, 2)
    assert.equal(view.items[0].titleKey, 'ACHIEVEMENT_HOME_SECURITY_TITLE')
    assert.equal(view.items[1].titleKey, 'ACHIEVEMENT_NOBEL_PEAS_PRIZE_TITLE')
    assert.equal(view.items[4].titleKey, 'ACHIEVEMENT_SPUDOW_TITLE')
    assert.deepEqual(view.items.filter(item => item.earned).map(item => item.id), [0, 4])
    const strings = JSON.parse(readFileSync('tools/generated/resources/properties/lawnstrings.json', 'utf8'))
    for (const [index, item] of view.items.entries()) {
        assert.equal(item.icon, index)
        assert.ok(strings[item.titleKey])
        assert.ok(strings[item.descriptionKey])
    }
    view.items[1].earned = true
    assert.equal((await api.getAchievements()).items[1].earned, false)
    await api.createUser('Bob')
    assert.equal((await api.getAchievements()).completed, 0)
})

test('award API resolves the loaded level reward and packet cost instead of choosing a plant in the UI', async () => {
    const levels = JSON.parse(readFileSync('tools/content/pvz-base/gameplay/levels.json', 'utf8')) as GameplayLevels
    let level: LevelDefinition | null = levels.levels['pvz:adventure-1-1']
    const { api } = fixture(() => level)
    const award = await api.getAward()
    assert.deepEqual(award, {
        kind: 'seed', titleKey: 'NEW_PLANT',
        nextLevelId: 'pvz:adventure-1-2', showMainMenu: false,
        seed: 1, cost: 50, name: 'Sunflower', nameKey: 'SUNFLOWER', descriptionKey: 'SUNFLOWER_TOOLTIP',
    })
    award.seed = 22
    assert.equal((await api.getAward()).seed, 1, 'the returned view cannot change the reward')
    level = { ...level, award: { kind: 'seed', id: 'pvz:torchwood', packetCost: 175 } }
    assert.deepEqual(await api.getAward(), {
        kind: 'seed', titleKey: 'NEW_PLANT',
        nextLevelId: 'pvz:adventure-1-2', showMainMenu: false,
        seed: 22, cost: 175, name: 'Torchwood', nameKey: 'TORCHWOOD', descriptionKey: 'TORCHWOOD_TOOLTIP',
    })
    level = null
    await assert.rejects(api.getAward(), /loaded level/)
})

test('winning advances the current profile once and exposes the next installed level', async () => {
    const levels = JSON.parse(readFileSync('tools/content/pvz-base/gameplay/levels.json', 'utf8')) as GameplayLevels
    let level = levels.levels['pvz:adventure-1-1']
    let won = false
    const { api, storage } = fixture(() => level, () => won)
    await api.createUser('Alice')
    assert.deepEqual(await api.getAdventure(), { levelId: 'pvz:adventure-1-1' })
    await assert.rejects(api.completeLevel(), /before winning/)
    assert.equal((await api.getCurrentUser())!.adventureLevel, 1)
    won = true
    assert.equal((await api.completeLevel()).nextLevelId, 'pvz:adventure-1-2')
    await api.completeLevel()
    assert.equal((await api.getCurrentUser())!.adventureLevel, 2)
    assert.deepEqual(await new MenuApi(createLocalMenuTransport(storage)).getAdventure(), { levelId: 'pvz:adventure-1-2' })
    level = levels.levels['pvz:adventure-1-2']
    const award = await api.completeLevel()
    assert.equal(award.seed, 2)
    assert.equal(award.nameKey, 'CHERRY_BOMB')
    assert.equal(award.nextLevelId, 'pvz:adventure-1-3')
    assert.equal((await api.getCurrentUser())!.adventureLevel, 3)
    level = levels.levels['pvz:adventure-1-3']
    const nut = await api.completeLevel()
    assert.equal(nut.kind, 'seed')
    assert.equal(nut.seed, 3)
    assert.equal(nut.nextLevelId, 'pvz:adventure-1-4')
    level = levels.levels['pvz:adventure-1-4']
    const shovel = await api.completeLevel()
    assert.deepEqual(shovel, { kind: 'tool', id: 'pvz:shovel', titleKey: 'GOT_SHOVEL', nameKey: 'SHOVEL',
        descriptionKey: 'SHOVEL_DESCRIPTION', nextLevelId: null, showMainMenu: true })
    assert.equal((await api.getCurrentUser())!.adventureLevel, 5)
})

test('menu data and business rules stay behind the API without Cocos or frontend imports', () => {
    for (const directory of ['assets/scripts/server/menu', 'assets/scripts/shared/menu']) {
        for (const file of readdirSync(directory).filter(file => file.endsWith('.ts'))) {
            const source = readFileSync(`${directory}/${file}`, 'utf8')
            assert.doesNotMatch(source, /from ['"](?:cc(?:\/[^'"]*)?|@\/(?:client|app)\/[^'"]*)['"]/, file)
        }
    }
    for (const file of readdirSync('assets/scripts/client/screens').filter(file => file.endsWith('.ts'))) {
        const source = readFileSync(`assets/scripts/client/screens/${file}`, 'utf8')
        assert.doesNotMatch(source, /localStorage|from ['"][^'"]*(?:server\/|persistence\/|StoreCatalog|AlmanacCatalog)/, file)
    }
})
