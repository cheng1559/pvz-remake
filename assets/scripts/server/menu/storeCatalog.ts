import type { StoreItemHighlight, StoreSpeech } from '@/shared/menu'
import type { PersistedPottedPlant, PlayerProfile } from './profileStore'

type Purchase = { kind: 'set'; value: number } | { kind: 'count'; amount: number; limit: number }
    | { kind: 'stock'; minimum: number; amount: number; limit: number } | { kind: 'timestamp' | 'plant' }

export interface StoreItem {
    id: number
    cost: number
    sprite?: string
    seed?: number
    offset?: readonly [number, number]
    highlight?: StoreItemHighlight
    message: number
    level?: number
    completed?: boolean
    purchase: Purchase
    requires?: { anyPurchases?: number[]; allPurchases?: number[]; minimumStored?: number; finishedAdventure?: boolean }
    prices?: number[]
    messages?: number[]
    seedSlots?: number[]
    quantity?: number
    effect?: 'seedSlots' | 'tree'
    unlockChallenge?: { index: number; value: number }
}

interface StoreDefinition {
    dialogue: Omit<StoreSpeech, 'ambient'> & {
        ambient: Omit<StoreSpeech['ambient'], 'messages'> & { messages: { message: number, weight: number, completed?: boolean }[] }
    }
    pages: { level?: number; completed?: boolean; items: StoreItem[] }[]
    garden: { columns: number; capacity: number; template: Omit<PersistedPottedPlant, 'x' | 'y'> }
}

const currentDay = (now: number) => Math.floor((now - Date.UTC(2000, 0, 1)) / 86400000)

/** The server's JSON rules determine purchases; no behavior depends on a specific item ID. */
export function createStoreCatalog(value: unknown) {
    validateStore(value)
    const data = value as StoreDefinition
    const STORE_PAGES = data.pages.map(page => page.items)
    const tier = (item: StoreItem, profile: PlayerProfile) => profile.purchases[item.id] ?? 0
    const atTier = (values: number[], index: number) => values[Math.max(0, Math.min(values.length - 1, index))]

    function speech(profile: PlayerProfile): StoreSpeech {
        const { ambient, ...timing } = data.dialogue
        return { ...timing, ambient: { ...ambient, messages: ambient.messages.map(({ message, weight, completed }) => ({
            message, weight: completed && !profile.finishedAdventure ? 0 : weight,
        })) } }
    }

    function storePages(profile: PlayerProfile): number[] {
        return data.pages.flatMap((page, id) => profile.finishedAdventure > 0 ||
            !page.completed && profile.adventureLevel >= (page.level ?? 1) ? [id] : [])
    }

    function itemCost(item: StoreItem, profile: PlayerProfile): number {
        return item.prices ? atTier(item.prices, tier(item, profile)) : item.cost
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
            : rule.kind === 'plant' ? profile.pottedPlants.filter(plant => plant.whichZenGarden === data.garden.template.whichZenGarden).length >= data.garden.capacity || count === currentDay(now)
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
            case 'plant': {
                const { columns, capacity, template } = data.garden
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
            message: item.messages ? atTier(item.messages, count) : item.message,
            ...(item.seedSlots && { seedSlots: atTier(item.seedSlots, count) }),
            ...(item.quantity !== undefined && { quantity: item.quantity }),
        }
    }

    function purchaseEffect(item: StoreItem, profile: PlayerProfile) {
        return item.effect ? { effect: item.effect,
            ...(item.seedSlots && { seedSlots: atTier(item.seedSlots, tier(item, profile) - 1) }),
        } : {}
    }

    return { STORE_PAGES, storePages, itemCost, itemState, purchaseItem, itemDetails, purchaseEffect, speech }
}

export type StoreCatalog = ReturnType<typeof createStoreCatalog>

function validateStore(value: unknown): asserts value is StoreDefinition {
    const data = value as StoreDefinition
    if (!data || !Array.isArray(data.pages) || !data.garden || !Number.isInteger(data.garden.columns) || data.garden.columns <= 0 ||
        !Number.isInteger(data.garden.capacity) || data.garden.capacity <= 0 || !data.garden.template?.whichZenGarden) throw new Error('Invalid store definition')
    const dialogue = data.dialogue
    if (!dialogue || !dialogue.ambient ||
        !Array.isArray(dialogue.ambient.interval) || !Array.isArray(dialogue.ambient.messages) ||
        [dialogue.readyDelay, dialogue.descriptionDuration,
            dialogue.ambient.initialDelay, dialogue.ambient.duration, ...dialogue.ambient.interval].some(value => !Number.isFinite(value) || value <= 0) ||
        dialogue.ambient.interval.length !== 2 || dialogue.ambient.interval[0] > dialogue.ambient.interval[1] ||
        !dialogue.ambient.messages.length || dialogue.ambient.messages.some(entry => !Number.isInteger(entry.message) || entry.weight < 0 || !Number.isFinite(entry.weight))) throw new Error('Invalid store dialogue')
    const ids = new Set<number>()
    for (const page of data.pages) {
        if (!Array.isArray(page.items)) throw new Error('Invalid store page')
        for (const item of page.items) {
            if (!Number.isInteger(item.id) || item.id < 0 || ids.has(item.id) || !Number.isFinite(item.cost) || item.cost < 0 ||
                !Number.isInteger(item.message) || !item.purchase) throw new Error('Invalid or duplicate store item')
            ids.add(item.id)
            for (const values of [item.prices, item.messages, item.seedSlots]) if (values &&
                (!values.length || values.some(value => !Number.isFinite(value) || value < 0))) throw new Error(`Invalid store tiers: ${item.id}`)
            const rule = item.purchase
            if (rule.kind === 'set') { if (!Number.isInteger(rule.value) || rule.value <= 0) throw new Error('Invalid store purchase value') }
            else if (rule.kind === 'count' || rule.kind === 'stock') {
                if (!Number.isInteger(rule.amount) || rule.amount <= 0 || !Number.isInteger(rule.limit) || rule.limit < 0 ||
                    rule.kind === 'stock' && (!Number.isInteger(rule.minimum) || rule.minimum < 0)) throw new Error('Invalid store purchase limits')
            } else if (rule.kind !== 'timestamp' && rule.kind !== 'plant') throw new Error('Unknown store purchase rule')
            if (item.effect === 'seedSlots' && !item.seedSlots) throw new Error('Missing store seed slots')
        }
    }
}
