import type { GameplayDefinitions, StoreItemDefinition } from '@/shared/content/gameplay'
import type { PlayerProfile } from './profileStore'

/** A store item with its ID, the key of its count in the profile's `purchases`. */
export interface StoreItem extends StoreItemDefinition { id: string }

/** A store page with its ID and its items in place order. */
export interface StorePage { id: string; level?: number; completed?: true; items: StoreItem[] }

const currentDay = (now: number) => Math.floor((now - Date.UTC(2000, 0, 1)) / 86400000)

/**
 * The store from the gameplay definitions' `store` and `storePages` (checked as they were read): the rules determine
 * purchases; no behavior depends on a specific item ID.
 */
export function createStoreCatalog(definitions: Pick<GameplayDefinitions, 'store' | 'storePages' | 'zenGarden'>) {
    const items = Object.entries(definitions.store).map(([id, item]): StoreItem => ({ id, ...item }))
    const pages = Object.entries(definitions.storePages).map(([id, page]): StorePage => ({
        id, ...page, items: items.filter(item => item.page === id).sort((a, b) => a.place - b.place),
    }))
    const garden = definitions.zenGarden
    const tier = (item: StoreItem, profile: PlayerProfile) => profile.purchases[item.id] ?? 0
    const atTier = (values: readonly number[], index: number) => values[Math.max(0, Math.min(values.length - 1, index))]

    function item(id: string): StoreItem | undefined {
        return items.find(item => item.id === id)
    }

    /** StoreScreen::IsPageShown: the pages the player can turn to. */
    function storePages(profile: PlayerProfile): StorePage[] {
        return pages.filter(page => profile.finishedAdventure > 0 || !page.completed && profile.adventureLevel >= (page.level ?? 1))
    }

    function itemCost(item: StoreItem, profile: PlayerProfile): number {
        return item.prices ? atTier(item.prices, tier(item, profile)) : item.cost!
    }

    function itemState(item: StoreItem, profile: PlayerProfile, now = Date.now()): 'available' | 'hidden' | 'comingSoon' | 'soldOut' {
        const count = tier(item, profile), rule = item.purchase, requires = item.requires
        if (!profile.finishedAdventure && (item.completed || profile.adventureLevel < (item.level ?? 1))) return 'hidden'
        if (requires && (requires.finishedAdventure && !profile.finishedAdventure ||
            requires.anyPurchases && !requires.anyPurchases.some(id => profile.purchases[id]) ||
            requires.allPurchases && !requires.allPurchases.every(id => profile.purchases[id]) ||
            count < (requires.minimumStored ?? 0))) return 'comingSoon'
        const soldOut = rule.kind === 'count' ? count >= rule.limit
            : rule.kind === 'stock' ? count > rule.limit
            : rule.kind === 'seed' ? profile.seeds.includes(rule.id)
            : rule.kind === 'plant' ? profile.pottedPlants.filter(plant => plant.whichZenGarden === garden.template.whichZenGarden).length >= garden.capacity || count === currentDay(now)
            : count > 0
        return soldOut ? 'soldOut' : 'available'
    }

    /** Recheck current server state before charging or changing inventory. */
    function purchaseItem(item: StoreItem, profile: PlayerProfile, now = Date.now()): boolean {
        const cost = itemCost(item, profile), rule = item.purchase
        if (itemState(item, profile, now) !== 'available' || profile.coins < cost) return false
        profile.coins -= cost
        const count = tier(item, profile)
        switch (rule.kind) {
            case 'count': profile.purchases[item.id] = count + rule.amount; break
            case 'stock': profile.purchases[item.id] = Math.max(rule.minimum, count) + rule.amount; break
            case 'set': profile.purchases[item.id] = rule.value; break
            case 'timestamp': profile.purchases[item.id] = Math.max(1, Math.floor(now / 1000)); break
            case 'seed': profile.seeds.push(rule.id); break
            case 'plant': {
                const { columns, capacity, template } = garden
                const occupied = new Set(profile.pottedPlants.filter(plant => plant.whichZenGarden === template.whichZenGarden).map(plant => plant.y * columns + plant.x))
                const spot = Array.from({ length: capacity }, (_, index) => index).find(index => !occupied.has(index))!
                profile.pottedPlants.push({ ...template, x: spot % columns, y: Math.floor(spot / columns) })
                profile.numPottedPlants = profile.pottedPlants.length
                profile.purchases[item.id] = currentDay(now)
                break
            }
        }
        if (item.unlockChallenge) profile.challengeRecords[item.unlockChallenge.index] = item.unlockChallenge.value
        return true
    }

    function itemDetails(item: StoreItem, profile: PlayerProfile) {
        const count = tier(item, profile)
        return {
            message: item.messages ? atTier(item.messages, count) : item.message!,
            ...(item.seedSlots && { seedSlots: atTier(item.seedSlots, count) }),
        }
    }

    function purchaseEffect(item: StoreItem, profile: PlayerProfile) {
        return item.effect ? { effect: item.effect,
            ...(item.seedSlots && { seedSlots: atTier(item.seedSlots, tier(item, profile) - 1) }),
        } : {}
    }

    return { items, item, storePages, itemCost, itemState, purchaseItem, itemDetails, purchaseEffect }
}

export type StoreCatalog = ReturnType<typeof createStoreCatalog>
