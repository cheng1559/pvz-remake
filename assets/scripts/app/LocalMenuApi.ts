import { configureMenuApi } from '@/client/api/MenuApi'
import { MenuService } from '@/server/menu/MenuService'
import { jsonRoundTrip } from '@/shared/protocol'
import type { MenuStorage, MenuTransport } from '@/shared/menu'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { AlmanacCatalog } from '@/server/menu/almanacCatalog'
import type { StoreCatalog } from '@/server/menu/storeCatalog'

export function createLocalMenuTransport(storage: MenuStorage, getLevel?: () => LevelDefinition | null, canCompleteLevel?: () => boolean,
    catalog?: StoreCatalog, almanac?: AlmanacCatalog): MenuTransport {
    const service = new MenuService(storage, Date.now, getLevel, canCompleteLevel, catalog, almanac)
    return async request => jsonRoundTrip(service.handle(jsonRoundTrip(request)))
}

export function connectLocalMenuApi(storage: MenuStorage, getLevel: () => LevelDefinition | null, canCompleteLevel: () => boolean,
    catalogs: Promise<[StoreCatalog, AlmanacCatalog]>): void {
    let transport: Promise<MenuTransport> | undefined
    configureMenuApi(async request => {
        transport ??= catalogs.then(([catalog, almanac]) => createLocalMenuTransport(storage, getLevel, canCompleteLevel, catalog, almanac))
        return (await transport)(request)
    })
}
