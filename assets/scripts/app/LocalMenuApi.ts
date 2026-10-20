import { configureMenuApi } from '@/client/api/MenuApi'
import { MenuService } from '@/server/menu/MenuService'
import { jsonRoundTrip } from '@/shared/protocol'
import type { MenuStorage, MenuTransport } from '@/shared/menu'
import type { LevelDefinition } from '@/shared/content/gameplay'

export function createLocalMenuTransport(storage: MenuStorage, getLevel?: () => LevelDefinition | null): MenuTransport {
    const service = new MenuService(storage, Date.now, getLevel)
    return async request => jsonRoundTrip(service.handle(jsonRoundTrip(request)))
}

export function connectLocalMenuApi(storage: MenuStorage, getLevel?: () => LevelDefinition | null): void {
    configureMenuApi(createLocalMenuTransport(storage, getLevel))
}
