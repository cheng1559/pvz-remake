import type { MenuRequest, MenuResponse, MenuStorage, StoreItemView, StoreView, UserResult, UserView } from '@/shared/menu'
import { ALMANAC_PLANTS, ALMANAC_ZOMBIES } from './AlmanacCatalog'
import { ACHIEVEMENT_DEFINITIONS } from './AchievementCatalog'
import { CHALLENGES } from './ChallengeCatalog'
import { createGameSettingsStore } from './GameSettingsStore'
import { createProfileStore, type PlayerProfile } from './ProfileStore'
import { itemCost, itemState, purchaseItem, STORE_PAGES, storePages } from './StoreCatalog'

function userView(profile: PlayerProfile | null): UserView | null {
    return profile && { id: profile.id, name: profile.name, adventureLevel: profile.adventureLevel, finishedAdventure: profile.finishedAdventure }
}

export class MenuService {
    private readonly profiles
    private readonly settings

    constructor(storage: MenuStorage, private readonly now = Date.now) {
        this.profiles = createProfileStore(storage)
        this.settings = createGameSettingsStore(storage)
    }

    handle(request: MenuRequest): MenuResponse {
        switch (request.method) {
            case 'getCurrentUser': return userView(this.profiles.loadCurrentProfile())
            case 'listUsers': return {
                current: userView(this.profiles.loadCurrentProfile()),
                users: this.profiles.loadProfiles().map(({ id, name }) => ({ id, name })),
            }
            case 'createUser': return this.saveName(request.args.name)
            case 'renameUser': return this.saveName(request.args.name, request.args.id)
            case 'selectUser': {
                const user = this.profiles.loadProfileById(request.args.id)
                return user ? { ok: true, user: userView(user) } : { ok: false, code: 'notFound' }
            }
            case 'deleteUser': {
                const user = this.profiles.loadProfiles().find(user => user.id === request.args.id)
                if (!user || !this.profiles.deleteProfile(user.name)) return { ok: false, code: 'notFound' }
                return { ok: true, user: userView(this.profiles.getCurrentProfile()) }
            }
            case 'getStore': return this.store()
            case 'purchase': return this.purchase(request.args)
            case 'getSettings': return this.settings.load()
            case 'updateSettings': return this.settings.update({
                // Accept only public preference fields, never arbitrary storage/version changes.
                ...(request.args.patch.musicVolume !== undefined && { musicVolume: request.args.patch.musicVolume }),
                ...(request.args.patch.sfxVolume !== undefined && { sfxVolume: request.args.patch.sfxVolume }),
                ...(request.args.patch.fullScreen !== undefined && { fullScreen: request.args.patch.fullScreen }),
            })
            case 'getChallenges': {
                const definitions = CHALLENGES[request.args.page]
                if (!definitions) throw new Error('Unknown challenge page')
                const records = this.profiles.getCurrentProfile()?.challengeRecords ?? []
                const items = definitions.map(item => ({
                    key: item.key, icon: item.icon, ...(item.endless !== undefined && { endless: item.endless }),
                    record: records[item.record] ?? 0,
                    completed: !item.endless && (records[item.record] ?? 0) >= (item.required ?? 1),
                }))
                return { items, total: items.filter(item => !item.endless).length, completed: items.filter(item => item.completed).length }
            }
            case 'getAlmanac': return { plants: ALMANAC_PLANTS, zombies: ALMANAC_ZOMBIES }
            case 'getAchievements': {
                const earned = this.profiles.getCurrentProfile()?.earnedAchievements ?? []
                const items = ACHIEVEMENT_DEFINITIONS.map(item => ({ ...item, earned: earned[item.id] === true }))
                return { items, total: items.length, completed: items.filter(item => item.earned).length }
            }
            default: throw new Error('Unknown menu API method')
        }
    }

    private saveName(value: string, id?: number): UserResult {
        if (typeof value !== 'string') return { ok: false, code: 'invalidName' }
        const name = value.replace(/ +/g, ' ').trim()
        if (!name) return { ok: false, code: 'emptyName' }
        if (name.length > 12 || !/^[a-zA-Z0-9 ]+$/.test(name)) return { ok: false, code: 'invalidName' }
        if (id !== undefined) {
            const user = this.profiles.loadProfiles().find(user => user.id === id)
            if (!user) return { ok: false, code: 'notFound' }
            if (!this.profiles.renameProfile(user.name, name)) return { ok: false, code: 'duplicateName' }
            return { ok: true, user: userView(this.profiles.getCurrentProfile()) }
        }
        const user = this.profiles.createProfile(name)
        return user ? { ok: true, user: userView(user) } : { ok: false, code: 'duplicateName' }
    }

    private store(): StoreView {
        const profile = this.profiles.getCurrentProfile()
        if (!profile) throw new Error('Store requires a player profile')
        return {
            userId: profile.id, playerName: profile.name, coins: profile.coins,
            pages: storePages(profile).map(id => ({ id, items: STORE_PAGES[id].map((item): StoreItemView => ({
                id: item.id,
                ...(item.sprite !== undefined && { sprite: item.sprite }),
                ...(item.seed !== undefined && { seed: item.seed }),
                ...(item.offset !== undefined && { offset: item.offset }),
                highlight: item.highlight ?? (item.seed !== undefined ? { type: 'seedPacket' }
                    : item.sprite ? { type: 'additive', opacity: 96 } : { type: 'none' }),
                cost: itemCost(item, profile), affordable: profile.coins >= itemCost(item, profile), state: itemState(item, profile, this.now()),
                message: item.id === 21 ? 2011 + Math.min(3, profile.purchases[21]) : item.message,
                ...(item.id === 21 && { seedSlots: 7 + Math.min(3, profile.purchases[21]) }),
                ...((item.id === 14 || item.id === 15) && { quantity: 5 }),
            })) })),
        }
    }

    private purchase(args: { userId: number, itemId: number, expectedCost: number }) {
        const profile = this.profiles.getCurrentProfile()
        if (!profile || profile.id !== args.userId) return { ok: false as const, code: 'profileChanged' as const }
        const item = STORE_PAGES.flat().find(item => item.id === args.itemId)
        const reject = (code: 'notAvailable' | 'insufficientFunds' | 'priceChanged') => ({ ok: false as const, code, store: this.store() })
        if (!item || !storePages(profile).some(page => STORE_PAGES[page].includes(item)) || itemState(item, profile, this.now()) !== 'available') return reject('notAvailable')
        if (itemCost(item, profile) !== args.expectedCost) return reject('priceChanged')
        if (!purchaseItem(item, profile, this.now())) return reject('insufficientFunds')
        this.profiles.saveProfile(profile)
        return {
            ok: true as const, store: this.store(),
            ...(item.id === 21 && { effect: 'seedSlots' as const, seedSlots: 6 + profile.purchases[21] }),
            ...(item.id === 27 && { effect: 'tree' as const }),
        }
    }
}
