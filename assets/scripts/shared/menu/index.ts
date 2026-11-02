export interface MenuStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
    key(index: number): string | null
    readonly length: number
}

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
/** PlayerInfo::AddCoins caps the purse at 99999 coins ($999,990). */
export const MAX_MONEY = 99999
export type StoreItemHighlight = { type: 'none' | 'seedPacket' } | { type: 'additive', opacity: number }
export interface StoreItemView {
    id: number
    cost: number
    affordable: boolean
    state: 'available' | 'hidden' | 'comingSoon' | 'soldOut'
    sprite?: string
    seed?: number
    offset?: readonly [number, number]
    highlight: StoreItemHighlight
    message: number
    seedSlots?: number
    quantity?: number
}
export interface StoreSpeech {
    readyDelay: number
    descriptionDuration: number
    ambient: { initialDelay: number, interval: readonly [number, number], duration: number, messages: { message: number, weight: number }[] }
}
export interface StoreView {
    userId: number
    playerName: string
    coins: number
    pages: { id: number, items: StoreItemView[] }[]
    speech: StoreSpeech
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
export interface AlmanacPlantDefinition {
    id: number, key: string, name: string, cost: number, refreshTime: number, upgrade?: boolean,
    ground: 'day' | 'night' | 'pool' | 'nightpool' | 'roof',
}
export interface AlmanacZombieDefinition { id: number, key: string, iceGround?: boolean }
/** `shown` is AlmanacDialog::ZombieIsShown and `described` ZombieHasDescription for the current player. */
export interface AlmanacZombieView extends AlmanacZombieDefinition { shown: boolean, described: boolean }
/** The plants are only the ones the current player has (LawnApp::HasSeedType); every zombie keeps its window. */
export interface AlmanacView { plants: AlmanacPlantDefinition[], zombies: AlmanacZombieView[] }
export interface AchievementView {
    completed: number
    total: number
    items: { id: number, icon: number, titleKey: string, descriptionKey: string, earned: boolean }[]
}
interface AwardDetails {
    nextLevelId: string | null
    showMainMenu: boolean
    titleKey: string
    /** The award page button opens this page first, and closing it continues to the next level. */
    opens?: { page: 'almanac', buttonKey: string }
}
export type AwardView = AwardDetails & (
    { kind: 'seed'; seed: number; cost: number; name: string; nameKey: string; descriptionKey: string }
    | { kind: 'tool' | 'unlock'; id: string; seed?: never; cost?: never; name?: never; nameKey: string; descriptionKey: string }
    | { kind: 'note'; id: string; seed?: never; cost?: never; name?: never }
)

export interface MenuEndpoints {
    getCurrentUser: { args: Record<string, never>, result: UserView | null }
    listUsers: { args: Record<string, never>, result: UserList }
    createUser: { args: { name: string }, result: UserResult }
    renameUser: { args: { id: number, name: string }, result: UserResult }
    selectUser: { args: { id: number }, result: UserResult }
    deleteUser: { args: { id: number }, result: UserResult }
    getStore: { args: Record<string, never>, result: StoreView }
    purchase: { args: { userId: number, itemId: number, expectedCost: number }, result: PurchaseResult }
    getSettings: { args: Record<string, never>, result: MenuSettings }
    updateSettings: { args: { patch: Partial<Omit<MenuSettings, 'version'>> }, result: MenuSettings }
    getChallenges: { args: { page: ChallengePageId }, result: ChallengeView }
    getAlmanac: { args: Record<string, never>, result: AlmanacView }
    getAchievements: { args: Record<string, never>, result: AchievementView }
    getAdventure: { args: Record<string, never>, result: { levelId: string } }
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
}
export type MenuMethod = keyof MenuEndpoints
export type MenuRequest = { [K in MenuMethod]: { method: K, args: MenuEndpoints[K]['args'] } }[MenuMethod]
export type MenuResponse = MenuEndpoints[MenuMethod]['result']
export type MenuTransport = (request: MenuRequest) => Promise<MenuResponse>
