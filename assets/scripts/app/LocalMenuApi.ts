import { configureMenuApi } from '@/client/api/MenuApi'
import { MenuService, type MenuGameplaySettings } from '@/server/menu/MenuService'
import { jsonRoundTrip } from '@/shared/protocol'
import type { MenuStorage, MenuTransport } from '@/shared/menu'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { AlmanacCatalog } from '@/server/menu/almanacCatalog'
import type { StoreCatalog } from '@/server/menu/storeCatalog'

export function createLocalMenuTransport(storage: MenuStorage, getLevel?: () => LevelDefinition | null, canCompleteLevel?: () => boolean,
    catalog?: StoreCatalog, almanac?: AlmanacCatalog, gameplay?: MenuGameplaySettings): MenuTransport {
    const service = new MenuService(storage, Date.now, getLevel, canCompleteLevel, catalog, almanac, gameplay)
    return async request => jsonRoundTrip(service.handle(jsonRoundTrip(request)))
}

export function connectLocalMenuApi(storage: MenuStorage, getLevel: () => LevelDefinition | null, canCompleteLevel: () => boolean,
    catalogs: Promise<[StoreCatalog, AlmanacCatalog, MenuGameplaySettings]>): void {
    let transport: Promise<MenuTransport> | undefined
    // Settings live in storage alone, so they answer before the catalogs load: the saved volumes apply before the
    // title music starts rather than a moment after it.
    const settings = createLocalMenuTransport(storage)
    configureMenuApi(async request => {
        if (request.method === 'getSettings' || request.method === 'updateSettings') return settings(request)
        transport ??= catalogs.then(([catalog, almanac, gameplay]) =>
            createLocalMenuTransport(storage, getLevel, canCompleteLevel, catalog, almanac, gameplay))
        return (await transport)(request)
    })
}
