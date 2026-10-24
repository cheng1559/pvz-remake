import { configureMenuApi } from '@/client/api/MenuApi'
import { MenuService } from '@/server/menu/MenuService'
import { jsonRoundTrip } from '@/shared/protocol'
import type { MenuStorage, MenuTransport } from '@/shared/menu'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { StoreCatalog } from '@/server/menu/StoreCatalog'

export function createLocalMenuTransport(storage: MenuStorage, getLevel?: () => LevelDefinition | null, canCompleteLevel?: () => boolean, catalog?: StoreCatalog): MenuTransport {
    const service = new MenuService(storage, Date.now, getLevel, canCompleteLevel, catalog)
    return async request => jsonRoundTrip(service.handle(jsonRoundTrip(request)))
}

export function connectLocalMenuApi(storage: MenuStorage, getLevel: () => LevelDefinition | null, canCompleteLevel: () => boolean, catalog: Promise<StoreCatalog>): void {
    let transport: Promise<MenuTransport> | undefined
    configureMenuApi(async request => {
        transport ??= catalog.then(catalog => createLocalMenuTransport(storage, getLevel, canCompleteLevel, catalog))
        return (await transport)(request)
    })
}
