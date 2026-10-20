import type { StoreItemHighlight } from '@/shared/menu'
import type { PlayerProfile } from './ProfileStore'

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
}

// Purchase indices and prices use the original profile format: one coin unit displays as $10.
export const STORE_PAGES: readonly (readonly StoreItem[])[] = [
    [
        { id: 21, cost: 75, sprite: 'store_packetupgrade', offset: [-7, 7], highlight: { type: 'additive', opacity: 32 }, message: 2011 },
        { id: 22, cost: 100, sprite: 'icon_poolcleaner', offset: [1, 7], message: 2026 },
        { id: 24, cost: 20, sprite: 'icon_rake', offset: [-5, 10], message: 2028 },
        { id: 23, cost: 300, sprite: 'icon_roofcleaner', offset: [0, 28], message: 2027, level: 42 },
        { id: 0, cost: 500, seed: 40, message: 2000 },
        { id: 1, cost: 500, seed: 41, message: 2001 },
        { id: 2, cost: 750, seed: 42, message: 2002, level: 35 },
        { id: 3, cost: 1000, seed: 43, message: 2003, level: 35 },
    ],
    [
        { id: 6, cost: 750, seed: 46, message: 2006, level: 41 },
        { id: 5, cost: 300, seed: 45, message: 2005, level: 41 },
        { id: 4, cost: 1000, seed: 44, message: 2004, completed: true },
        { id: 7, cost: 2000, seed: 47, message: 2007, completed: true },
        { id: 8, cost: 3000, sprite: 'imitaterseed', highlight: { type: 'seedPacket' }, message: 2008, completed: true },
        { id: 29, cost: 200, sprite: 'store_firstaidwallnuticon', offset: [-1, 13], message: 2033, completed: true },
    ],
    [
        { id: 10, cost: 250, message: 2010 },
        { id: 11, cost: 250, message: 2010 },
        { id: 12, cost: 250, message: 2010 },
        { id: 13, cost: 1000, sprite: 'wateringcangold', offset: [-14, -4], message: 2019 },
        { id: 14, cost: 75, sprite: 'fertilizer', offset: [-11, -2], message: 2020 },
        { id: 15, cost: 100, sprite: 'bug_spray', offset: [-12, 3], message: 2022 },
        { id: 16, cost: 1500, sprite: 'phonograph', offset: [-12, 3], message: 2021 },
        { id: 17, cost: 100, sprite: 'zen_gardenglove', offset: [-12, 3], message: 2023 },
    ],
    [
        { id: 18, cost: 3000, sprite: 'store_mushroomgardenicon', offset: [-8, 2], message: 2032 },
        { id: 25, cost: 3000, sprite: 'store_aquariumgardenicon', offset: [-8, 2], message: 2029 },
        { id: 19, cost: 20, sprite: 'zen_wheelbarrow', offset: [-12, 3], message: 2024 },
        { id: 20, cost: 300, sprite: 'stinky_turn3', offset: [-24, 14], message: 2025 },
        { id: 27, cost: 1000, sprite: 'store_treeofwisdomicon', offset: [-8, 2], message: 2030 },
        { id: 28, cost: 250, sprite: 'treefood', offset: [-8, -2], message: 2031 },
    ],
]

export const PURCHASE_COUNT_OFFSET = 1000
const isPottedPlant = (item: StoreItem) => item.id >= 10 && item.id <= 12
const currentDay = (now: number) => Math.floor((now - Date.UTC(2000, 0, 1)) / 86400000)

export function storePages(profile: PlayerProfile): number[] {
    return [0, 1, 2, 3].filter(page => profile.finishedAdventure > 0 || page === 0
        || page === 1 && profile.adventureLevel >= 42 || page === 2 && profile.adventureLevel >= 45)
}

export function itemCost(item: StoreItem, profile: PlayerProfile): number {
    return item.id === 21 ? [75, 500, 2000, 8000][Math.min(3, profile.purchases[21] ?? 0)] : item.cost
}

export function itemState(item: StoreItem, profile: PlayerProfile, now = Date.now()): 'available' | 'hidden' | 'comingSoon' | 'soldOut' {
    const count = profile.purchases[item.id] ?? 0
    if (!profile.finishedAdventure && (item.completed || profile.adventureLevel < (item.level ?? 1))) return 'hidden'
    if (isPottedPlant(item) && !profile.finishedAdventure
        || item.id === 19 && !profile.purchases[18] && !profile.purchases[25]
        || item.id === 28 && (!profile.purchases[27] || count < PURCHASE_COUNT_OFFSET)) return 'comingSoon'
    const soldOut = item.id === 21 ? count >= 4
        : item.id === 14 || item.id === 15 ? count > PURCHASE_COUNT_OFFSET + 15
        : item.id === 28 ? count >= PURCHASE_COUNT_OFFSET + 10
        : isPottedPlant(item) ? profile.pottedPlants.filter(plant => plant.whichZenGarden === 'main').length >= 32 || count === currentDay(now)
        : count > 0
    return soldOut ? 'soldOut' : 'available'
}

/** Recheck the latest profile at confirmation time; callers persist only a successful purchase. */
export function purchaseItem(item: StoreItem, profile: PlayerProfile, now = Date.now()): boolean {
    const cost = itemCost(item, profile)
    if (itemState(item, profile, now) !== 'available' || profile.coins < cost) return false
    profile.coins -= cost
    if (item.id === 21) profile.purchases[21]++
    else if (item.id === 24) profile.purchases[24] = 3
    else if (item.id === 14 || item.id === 15 || item.id === 28) {
        profile.purchases[item.id] = Math.max(PURCHASE_COUNT_OFFSET, profile.purchases[item.id]) + (item.id === 28 ? 1 : 5)
    } else if (isPottedPlant(item)) {
        const occupied = new Set(profile.pottedPlants.filter(plant => plant.whichZenGarden === 'main').map(plant => plant.y * 8 + plant.x))
        const spot = Array.from({ length: 32 }, (_, index) => index).find(index => !occupied.has(index))!
        profile.pottedPlants.push({
            seedType: 'marigold', whichZenGarden: 'main', x: spot % 8, y: Math.floor(spot / 8), facing: 'right',
            lastWateredTime: 0, drawVariation: 'normal', plantAge: 'sprout', timesFed: 0,
            feedingsPerGrow: 3, plantNeed: 'none', lastNeedFulfilledTime: 0, lastFertilizedTime: 0, lastChocolateTime: 0,
        })
        profile.numPottedPlants = profile.pottedPlants.length
        profile.purchases[item.id] = currentDay(now)
    } else {
        profile.purchases[item.id] = item.id === 20 ? Math.max(1, Math.floor(now / 1000)) : 1
        if (item.id === 27) profile.challengeRecords[49] = 1
    }
    return true
}
