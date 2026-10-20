import { configureMenuApi } from '@/client/api/MenuApi'
import { MenuService } from '@/server/menu/MenuService'
import { jsonRoundTrip } from '@/shared/protocol'
import type { MenuStorage, MenuTransport } from '@/shared/menu'

export function createLocalMenuTransport(storage: MenuStorage): MenuTransport {
    const service = new MenuService(storage)
    return async request => jsonRoundTrip(service.handle(jsonRoundTrip(request)))
}

export function connectLocalMenuApi(storage: MenuStorage): void {
    configureMenuApi(createLocalMenuTransport(storage))
}
