export interface MenuStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
    key(index: number): string | null
    readonly length: number
}

export interface UserSummary { id: number, name: string }
export interface UserView extends UserSummary { adventureLevel: number, finishedAdventure: number }
export interface UserList { current: UserView | null, users: UserSummary[] }
export type UserResult = { ok: true, user: UserView | null } | {
    ok: false, code: 'emptyName' | 'invalidName' | 'duplicateName' | 'notFound',
}
export interface MenuSettings { version: number, musicVolume: number, sfxVolume: number, fullScreen: boolean }
export const SFX_VOLUME_SCALE = 0.65
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
export interface StoreView {
    userId: number
    playerName: string
    coins: number
    pages: { id: number, items: StoreItemView[] }[]
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
    items: { key: string, icon: number, endless?: boolean, completed: boolean, record: number }[]
}
export interface AlmanacPlantDefinition {
    id: number, key: string, name: string, cost: number, refreshTime: number, upgrade?: boolean,
}
export interface AlmanacZombieDefinition { id: number, key: string, iceGround?: boolean }
export interface AlmanacView { plants: AlmanacPlantDefinition[], zombies: AlmanacZombieDefinition[] }
export interface AchievementView {
    completed: number
    total: number
    items: { id: number, icon: number, titleKey: string, descriptionKey: string, earned: boolean }[]
}

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
}
export type MenuMethod = keyof MenuEndpoints
export type MenuRequest = { [K in MenuMethod]: { method: K, args: MenuEndpoints[K]['args'] } }[MenuMethod]
export type MenuResponse = MenuEndpoints[MenuMethod]['result']
export type MenuTransport = (request: MenuRequest) => Promise<MenuResponse>
