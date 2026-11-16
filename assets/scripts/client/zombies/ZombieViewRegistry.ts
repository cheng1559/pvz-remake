import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { ZombieView, type ZombieViewContext } from './ZombieView'

/** The views of zombies, by the `view` of their presentation: `zombie` when it names none. A Mod's extends ZombieView. */
export class ZombieViewRegistry extends EntityViewRegistry<ZombieViewContext, ZombieView> {
    constructor() {
        super((presentation, typeId) => presentation.zombies[typeId] && (presentation.zombies[typeId].view ?? 'zombie'), context => context.zombie.typeId)
        this.registerView('zombie', ZombieView)
    }
}
