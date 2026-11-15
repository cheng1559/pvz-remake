import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { ZombieView, type ZombieViewContext } from './ZombieView'
import { zombieDefinition } from './definitions'

/** The views of zombies, by the `view` of their presentation: `zombie` when it names none. A Mod's extends ZombieView. */
export class ZombieViewRegistry extends EntityViewRegistry<ZombieViewContext, ZombieView> {
    constructor() {
        super(context => ({
            kind: zombieDefinition(context.content.presentation, context.zombie.typeId).view ?? 'zombie',
            typeId: context.zombie.typeId,
        }))
        this.registerView('zombie', ZombieView)
    }
}
