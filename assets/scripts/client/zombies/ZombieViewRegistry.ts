import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { ZombieView, type ZombieViewContext } from './ZombieView'
import { DancerView } from './DancerView'
import { FlagZombieView } from './FlagZombieView'
import { NewspaperView } from './NewspaperView'
import { PoleVaulterView } from './PoleVaulterView'

/** The views of zombies, by the `view` of their presentation: `zombie` when it names none. A Mod's extends ZombieView. */
export class ZombieViewRegistry extends EntityViewRegistry<ZombieViewContext, ZombieView> {
    constructor() {
        super((presentation, typeId) => presentation.zombies[typeId] && (presentation.zombies[typeId].view ?? 'zombie'), context => context.zombie.typeId)
        // Every zombie is drawn by its animation: one view shows any (`zombie`), and the zombies that do something of
        // their own add to it.
        const views: Record<string, typeof ZombieView> = {
            zombie: ZombieView, flag: FlagZombieView, polevaulter: PoleVaulterView, newspaper: NewspaperView, dancer: DancerView,
        }
        for (const [kind, View] of Object.entries(views)) this.registerView(kind, View)
    }
}
