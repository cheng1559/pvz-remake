import type { AwardView, MenuRequest, MenuResponse, MenuStorage, StoreItemView, StoreView, UserResult, UserView } from '@/shared/menu'
import type { LevelDefinition } from '@/shared/content/gameplay'
import { ALMANAC_PLANTS, ALMANAC_ZOMBIES } from './AlmanacCatalog'
import { ACHIEVEMENT_DEFINITIONS } from './AchievementCatalog'
import { CHALLENGES } from './ChallengeCatalog'
import { createGameSettingsStore } from './GameSettingsStore'
import { createProfileStore, type PlayerProfile } from './ProfileStore'
import type { StoreCatalog } from './StoreCatalog'

function userView(profile: PlayerProfile | null): UserView | null {
    return profile && { id: profile.id, name: profile.name, adventureLevel: profile.adventureLevel, finishedAdventure: profile.finishedAdventure }
}

export class MenuService {
    private readonly profiles
    private readonly settings

    constructor(
        storage: MenuStorage,
        private readonly now = Date.now,
        private readonly getLevel: () => LevelDefinition | null = () => null,
        private readonly canCompleteLevel: () => boolean = () => false,
        private readonly catalog?: StoreCatalog,
    ) {
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
            case 'getAdventure': {
                const profile = this.profiles.loadCurrentProfile()
                if (!profile) throw new Error('Adventure requires a player profile')
                const index = profile.adventureLevel - 1
                return { levelId: `pvz:adventure-${Math.floor(index / 10) + 1}-${index % 10 + 1}` }
            }
            case 'completeLevel': {
                if (!this.canCompleteLevel()) throw new Error('Cannot complete a level before winning')
                const award = this.award()
                const profile = this.profiles.loadCurrentProfile()
                if (!profile) throw new Error('Level completion requires a player profile')
                profile.adventureLevel = Math.max(profile.adventureLevel, this.getLevel()!.adventureIndex + 1)
                this.profiles.saveProfile(profile)
                return award
            }
            case 'getAward': return this.award()
            default: throw new Error('Unknown menu API method')
        }
    }

    private award(): AwardView {
        const level = this.getLevel()
        if (!level) throw new Error('Award requires a loaded level')
        if (level.award.kind === 'tool') return {
            kind: 'tool', id: level.award.id, nextLevelId: level.nextLevel ?? null, showMainMenu: level.adventureIndex > 3,
            titleKey: level.award.titleKey, nameKey: level.award.nameKey, descriptionKey: level.award.descriptionKey,
        }
        const plant = ALMANAC_PLANTS.find(plant => `pvz:${plant.key.replace(/_/g, '').toLowerCase()}` === level.award.id)
        if (!plant) throw new Error(`Unknown plant award: ${level.award.id}`)
        return {
            kind: 'seed', titleKey: 'NEW_PLANT',
            nextLevelId: level.nextLevel ?? null, showMainMenu: level.adventureIndex > 3,
            seed: plant.id, cost: level.award.packetCost, name: plant.name,
            nameKey: plant.key, descriptionKey: `${plant.key}_TOOLTIP`,
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
        const { STORE_PAGES, storePages, itemCost, itemState, itemDetails } = this.storeCatalog
        const profile = this.profiles.getCurrentProfile()
        if (!profile) throw new Error('Store requires a player profile')
        return {
            userId: profile.id, playerName: profile.name, coins: profile.coins,
            speech: this.storeCatalog.speech(profile),
            pages: storePages(profile).map(id => ({ id, items: STORE_PAGES[id].map((item): StoreItemView => ({
                id: item.id,
                ...(item.sprite !== undefined && { sprite: item.sprite }),
                ...(item.seed !== undefined && { seed: item.seed }),
                ...(item.offset !== undefined && { offset: item.offset }),
                highlight: item.highlight ?? (item.seed !== undefined ? { type: 'seedPacket' }
                    : item.sprite ? { type: 'additive', opacity: 96 } : { type: 'none' }),
                cost: itemCost(item, profile), affordable: profile.coins >= itemCost(item, profile), state: itemState(item, profile, this.now()),
                ...itemDetails(item, profile),
            })) })),
        }
    }

    private purchase(args: { userId: number, itemId: number, expectedCost: number }) {
        const { STORE_PAGES, storePages, itemState, itemCost, purchaseItem, purchaseEffect } = this.storeCatalog
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
            ...purchaseEffect(item, profile),
        }
    }

    private get storeCatalog(): StoreCatalog {
        if (!this.catalog) throw new Error('Store catalog is not loaded')
        return this.catalog
    }
}
