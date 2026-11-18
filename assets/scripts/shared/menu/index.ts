export interface MenuStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
    key(index: number): string | null
    readonly length: number
}

/**
 * A player's game saves (GameSaveStore), under `${GAME_SAVE_KEY}:${id}:...`, which deleting its profile removes. The
 * persisted key stays as it is: code names do not depend on the save format version.
 */
export const GAME_SAVE_KEY = 'pvz-remake:game-save-v2'
/** A player's Mod list (ModManager), under `${PLAYER_MODS_PREFIX}${id}:...`, which deleting its profile removes too. */
export const PLAYER_MODS_PREFIX = 'pvz-remake:player-mods:'

export interface UserSummary { id: number, name: string }
/** GameSelector: the locked mode buttons and the menu items the player has reached. */
export interface MainMenuUnlocks { minigames: boolean, puzzle: boolean, survival: boolean, almanac: boolean, store: boolean, garden: boolean }
export interface UserView extends UserSummary {
    adventureLevel: number
    finishedAdventure: number
    unlocks: MainMenuUnlocks
    /** Every mini-game, puzzle and survival trophy; with a finished Adventure, the sunflower trophy turns gold. */
    allTrophies: boolean
}
export interface UserList { current: UserView | null, users: UserSummary[] }
export type UserResult = { ok: true, user: UserView | null } | {
    ok: false, code: 'emptyName' | 'invalidName' | 'duplicateName' | 'notFound',
}
export interface MenuSettings { version: number, musicVolume: number, sfxVolume: number, fullScreen: boolean }
export const SFX_VOLUME_SCALE = 0.65
/**
 * A store item as the player finds it: its ID (its gameplay and presentation `store` entries'), its place on its page,
 * the price and Dave's line for the next one bought. Its look is the presentation's.
 */
export interface StoreItemView {
    id: string
    place: number
    cost: number
    affordable: boolean
    state: 'available' | 'hidden' | 'comingSoon' | 'soldOut'
    /** The seed the item sells, shown as its packet unless the item has a sprite of its own. */
    seed?: string
    message: number
    /** The seed-slot upgrade's slots once bought. */
    seedSlots?: number
    /** How many it sells at a time, written over it (`x5`). */
    quantity?: number
}
/** The pages the player can turn to, by page ID; `finishedAdventure` lets Dave chatter his `completed` lines. */
export interface StoreView {
    userId: number
    playerName: string
    coins: number
    finishedAdventure: boolean
    pages: { id: string, items: StoreItemView[] }[]
}
export type PurchaseResult = {
    ok: true, store: StoreView, effect?: 'seedSlots' | 'tree', seedSlots?: number,
} | {
    ok: false, code: 'profileChanged' | 'notAvailable' | 'insufficientFunds' | 'priceChanged', store?: StoreView,
}
export type ChallengePageId = 'minigames' | 'puzzle' | 'survival'
export interface ChallengeView {
    completed: number
    total: number
    items: { key: string, endless?: boolean, completed: boolean, record: number }[]
}
/**
 * A seed's card on an almanac page: its place there (its `position` in its group, seedGroupPages), its cost and
 * recharge as its definition has them (AlmanacDialog reads gPlantDefs too), and whether it is one of the hidden cards,
 * which have no description. On the first page, the chooser's grid, the seed is the plant's own ID, which names its
 * presentation (`nameKey`, the almanac's ground).
 */
export interface AlmanacCard { seed: string, place: number, cost: number, refreshTime: number, hidden?: true }
/**
 * `place`: its window on the zombies' page; `zombie`: the zombie it shows, named by its presentation's `nameKey`.
 * `shown` is AlmanacDialog::ZombieIsShown and `described` ZombieHasDescription for the current player.
 */
export interface AlmanacZombieView { place: number, zombie: string, shown: boolean, described: boolean }
/**
 * The plants are only the ones the current player has (LawnApp::HasSeedType); every zombie keeps its window. With
 * `/cheatseed` every plant and zombie is there and described, and `groupPages` are the plant pages after the first:
 * each Mod's seeds, then the hidden cards.
 */
export interface AlmanacView { plants: AlmanacCard[], zombies: AlmanacZombieView[], groupPages?: AlmanacCard[][] }
export interface AchievementEntry { id: string, titleKey: string, descriptionKey: string, icon: { sprite: string, index: number } }
export interface AchievementView {
    completed: number
    total: number
    items: (AchievementEntry & { earned: boolean })[]
}
interface AwardDetails {
    nextLevelId: string | null
    /**
     * AwardScreen lists every earned achievement not shown yet before the award itself; completing the level marks
     * them shown.
     */
    achievements: AchievementEntry[]
    showMainMenu: boolean
    titleKey: string
    /** The award page button opens this page first, and closing it continues to the next level. */
    opens?: { page: 'almanac', buttonKey: string }
}
export type AwardView = AwardDetails & (
    /** `seed`: the awarded seed's ID; the client names it and draws its packet from its plant's presentation. */
    { kind: 'seed'; seed: string; cost: number; nameKey?: never; descriptionKey?: never }
    | { kind: 'tool' | 'unlock'; id: string; seed?: never; cost?: never; nameKey: string; descriptionKey: string }
    | { kind: 'note'; id: string; seed?: never; cost?: never }
)

export interface MenuEndpoints {
    getCurrentUser: { args: Record<string, never>, result: UserView | null }
    listUsers: { args: Record<string, never>, result: UserList }
    createUser: { args: { name: string }, result: UserResult }
    renameUser: { args: { id: number, name: string }, result: UserResult }
    selectUser: { args: { id: number }, result: UserResult }
    deleteUser: { args: { id: number }, result: UserResult }
    getStore: { args: Record<string, never>, result: StoreView }
    purchase: { args: { userId: number, itemId: string, expectedCost: number }, result: PurchaseResult }
    getSettings: { args: Record<string, never>, result: MenuSettings }
    updateSettings: { args: { patch: Partial<Omit<MenuSettings, 'version'>> }, result: MenuSettings }
    getChallenges: { args: { page: ChallengePageId }, result: ChallengeView }
    getAlmanac: { args: { cheatSeeds?: boolean }, result: AlmanacView }
    getAchievements: { args: Record<string, never>, result: AchievementView }
    /**
     * ReportAchievement::GiveAchievement: a level reports what it granted; `shown` when the level announced it.
     * `earned` is false when the player already had it.
     */
    earnAchievement: { args: { id: string, shown: boolean }, result: { earned: boolean } }
    /** Debug: forget one achievement, or every one without an ID. */
    resetAchievements: { args: { id?: string }, result: AchievementView }
    /** The installed mainline level to display and play for the current profile. */
    getAdventure: { args: Record<string, never>, result: { levelId: string, adventureIndex: number } }
    completeLevel: { args: Record<string, never>, result: AwardView }
    getAward: { args: Record<string, never>, result: AwardView }
    /** Coins in original units, seed-slot upgrades bought, and the next upgrade's price (Dave quotes it in 2-2). */
    getPurse: { args: Record<string, never>, result: PurseView }
    /** A running level reports the purse after collecting money or paying Crazy Dave; the store re-reads it. */
    setCoins: { args: { coins: number }, result: PurseView }
    /** Crazy Dave's in-level seed-slot offer: Yes adds the upgrade (the level reports its coins), No counts a refusal. */
    /** Crazy Dave's seed-slot offer: the answer and the level's coins after it, saved together. */
    recordPacketUpgradeOffer: { args: { accepted: boolean; coins: number }, result: PurseView }
}
export interface PurseView {
    coins: number, packetUpgrades: number, packetUpgradeCost: number
    /** The price after one more upgrade, which Dave quotes once the first is bought (CRAZY_DAVE_1510). */
    nextPacketUpgradeCost: number
    declinedPacketUpgrades: number
    /** The seeds the player owns (LawnApp::HasSeedType), for the level's chooser and bank. */
    ownedSeeds: string[]
}
export type MenuMethod = keyof MenuEndpoints
export type MenuRequest = { [K in MenuMethod]: { method: K, args: MenuEndpoints[K]['args'] } }[MenuMethod]
export type MenuResponse = MenuEndpoints[MenuMethod]['result']
export type MenuTransport = (request: MenuRequest) => Promise<MenuResponse>
