import { ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import type { StageEvent } from '@/client/level/LevelStage'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { trueFlag } from '@/shared/validate'
import { type ShownZombie, ZombieView } from './ZombieView'

/**
 * The newspaper zombie (ZombieDefinition.enrage): once its paper is gone it walks and eats on its own clips
 * (`enragedWalk`, `enragedEat`, PHASE_NEWSPAPER_MAD) with its enraged head (`enragedHead`), not while it gasps; its
 * event is the roar it gives.
 */
export class NewspaperView extends ZombieView {
    protected clip(name: string): ClientAnimationClip {
        const enraged = this.latestZombie && this.isEnraged(this.latestZombie), { walk, walk2, eat } = ZOMBIE_CLIPS
        return super.clip(enraged && (name === walk || name === walk2) ? 'enragedWalk' : enraged && name === eat ? 'enragedEat' : name)
    }

    /** Its paper is gone (Newspaper.snapshotOwn's `enraged`). */
    private isEnraged(zombie: ShownZombie): boolean {
        return this.own(zombie, 'enraged', trueFlag) === true
    }

    protected putOnParts(zombie: ShownZombie, player: ReanimPlayer): void {
        const head = this.presentation.enragedHead
        if (head) player.setTrackSpriteOverride(head.track, this.isEnraged(zombie) && zombie.animations[ZOMBIE_BODY_LAYER].clip !== ZOMBIE_CLIPS.gasp ? this.sprites[head.sprite] : null)
    }

    /** Zombie::UpdateZombieNewspaper: one that lost its paper roars when it says so. */
    static readonly enraged: StageEvent = (stage, event) => {
        if (event.data.roar === true) SoundSystem.playSounds(stage.content.presentation.zombies[String(event.data.typeId)]?.enrageSounds)
    }
}
