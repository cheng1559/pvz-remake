import { ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import type { ZombieSnapshot } from '@/shared/protocol/index'
import { boolean } from '@/shared/validate'
import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { type ShownZombie, ZombieView } from './ZombieView'

/**
 * The pole vaulter (ZombieDefinition.vault): it lands from its jump on its walk at once; its events are the sounds of
 * the vault and of its landing. Its own (PoleVaulter.snapshotOwn): `hasPole`.
 */
export class PoleVaulterView extends ZombieView {
    /**
     * Landing uses StartWalkAnim(0), without blending the held pole into the walk. Coming to the house holding its pole,
     * it changes to its walk at once as any winner does (WalkIntoHouse's StartWalkAnim(0)).
     */
    protected bodyBlend(zombie: ShownZombie): number {
        const landing = this.bodyClip === ZOMBIE_CLIPS.jump && (zombie.state === 'walking' || zombie.state === 'eating')
        return landing ? 0 : super.bodyBlend(zombie)
    }

    /** Mowed as it lands from its vault, with no walking snapshot between: its walk stands in for the driver to take. */
    protected mowedOnWalk(zombie: ZombieSnapshot): boolean {
        return this.own(zombie, 'hasPole', boolean) === false && this.bodyClip === ZOMBIE_CLIPS.jump
    }

    /** Zombie::UpdateZombiePolevaulter: the vault, and the step of its landing. */
    static readonly vaulted: StageEvent = (_stage, event) => {
        void SoundSystem.play(event.data.sound === 'polevault' ? SoundEffect.PoleVault : SoundEffect.Grassstep, { foley: true })
    }
}
