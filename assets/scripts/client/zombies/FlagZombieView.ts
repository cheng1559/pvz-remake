import { ZOMBIE_FLAG_LAYER } from '@/shared/content/gameplay'
import { type ShownZombie, ZombieView } from './ZombieView'

/**
 * The flag zombie (ZombieDefinition's `flag` kind): while it carries its flag (its `flag` layer) it shows the arm that
 * holds it (`parts.flagArm.holding`), and the free arm once it has let it go (Zombie::ZombieInitialize, DropFlag).
 */
export class FlagZombieView extends ZombieView {
    protected ownParts(zombie: ShownZombie): Array<[readonly string[], boolean]> {
        const arm = this.presentation.parts.flagArm, holding = zombie.animations[ZOMBIE_FLAG_LAYER] !== undefined
        return arm ? [[arm.free, !holding], [arm.holding, holding]] : []
    }
}
