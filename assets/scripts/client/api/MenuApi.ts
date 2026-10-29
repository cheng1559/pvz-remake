import type { MenuEndpoints, MenuMethod, MenuRequest, MenuSettings, MenuTransport } from '@/shared/menu'

export class MenuApi {
    constructor(private readonly transport: MenuTransport) {}

    private request<K extends MenuMethod>(method: K, args: MenuEndpoints[K]['args']): Promise<MenuEndpoints[K]['result']> {
        return this.transport({ method, args } as MenuRequest) as Promise<MenuEndpoints[K]['result']>
    }

    getCurrentUser() { return this.request('getCurrentUser', {}) }
    listUsers() { return this.request('listUsers', {}) }
    createUser(name: string) { return this.request('createUser', { name }) }
    renameUser(id: number, name: string) { return this.request('renameUser', { id, name }) }
    selectUser(id: number) { return this.request('selectUser', { id }) }
    deleteUser(id: number) { return this.request('deleteUser', { id }) }
    getStore() { return this.request('getStore', {}) }
    purchase(userId: number, itemId: number, expectedCost: number) { return this.request('purchase', { userId, itemId, expectedCost }) }
    getSettings() { return this.request('getSettings', {}) }
    updateSettings(patch: Partial<Omit<MenuSettings, 'version'>>) { return this.request('updateSettings', { patch }) }
    getChallenges(page: MenuEndpoints['getChallenges']['args']['page']) { return this.request('getChallenges', { page }) }
    getAlmanac() { return this.request('getAlmanac', {}) }
    getAchievements() { return this.request('getAchievements', {}) }
    getAdventure() { return this.request('getAdventure', {}) }
    completeLevel() { return this.request('completeLevel', {}) }
    getAward() { return this.request('getAward', {}) }
    getPurse() { return this.request('getPurse', {}) }
    setCoins(coins: number) { return this.request('setCoins', { coins }) }
}

let transport: MenuTransport | undefined
export function configureMenuApi(value: MenuTransport): void { transport = value }
export const menuApi = new MenuApi(request => {
    if (!transport) return Promise.reject(new Error('Menu API is not connected'))
    return transport(request)
})
