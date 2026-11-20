import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { animateCurve } from '@/shared/content/animation'
import { MOWER_INTRO_X } from '@/shared/content/gameplay'
import type { MowerSnapshot } from '@/shared/protocol/index'
import { ProjectileView } from '../projectiles/ProjectileView'

/**
 * Where a waiting mower's animation is from its corner. LawnMower::Draw has the cached frame 14 left of it and 19 down,
 * and ReanimatorCache::MakeCachedMowerFrame the animation 10 into that frame: 10 left of where it runs once set off.
 */
const WAITING = { x: -4, y: -19 }

/**
 * A row's lawn mower waiting at its house end (Mower), as LawnMower::Draw draws it: as the mowing projectile it sets
 * off as (ProjectileView, by that type's presentation), its animation held on its first frame where the original has
 * its cached frame, on the board's plant shadow. The intro brings it on (CutScene::UpdateIntro,
 * LevelIntro.mowerArrival). Set off (LawnMower::StartMower), it is gone, running on as a projectile (MowingProjectileView).
 */
export class MowerView extends ProjectileView {
    /** Its animation is held where it waits, once loaded. */
    private held = false

    sync(mower: MowerSnapshot): void {
        // CutScene::UpdateIntro: CalcPosition from MOWER_INTRO_X to where it waits, shown once on its way.
        const arrival = this.stage.intro.mowerArrival(mower.row)
        super.sync(arrival < 1 ? { ...mower, x: animateCurve(0, 1, arrival, MOWER_INTRO_X, mower.x, 'ease-in-out') } : mower)
        this.context.node.active = arrival > 0
        if (this.shadowNode?.isValid) this.shadowNode.active = arrival > 0
        const animation = this.animation
        if (this.held || !animation?.node.isValid) return
        this.held = true
        animation.node.setPosition(WAITING.x, WAITING.y)
        animation.pause()
    }

    /** LawnMower::StartMower. */
    static readonly activated: StageEvent = () => { void SoundSystem.play(SoundEffect.Lawnmower, { foley: true }) }
}
