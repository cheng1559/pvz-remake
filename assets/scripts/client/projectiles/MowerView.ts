import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { easeInOutCurve, lerp } from '@/client/view/GameScreenMath'
import { MOWER_INTRO_X } from '@/shared/content/gameplay'
import type { MowerSnapshot, ProjectileSnapshot } from '@/shared/protocol/index'
import { ProjectileView } from './ProjectileView'

/**
 * Where a waiting mower's animation is from its corner. LawnMower::Draw has the cached frame 14 left of it and 19 down,
 * and ReanimatorCache::MakeCachedMowerFrame the animation 10 into that frame: 10 left of where it runs once set off.
 */
const WAITING = { x: -4, y: -19 }

/**
 * A row's lawn mower from the intro to its end, as LawnMower::Draw draws it: the animation of the mowing projectile it
 * runs as, on the board's plant shadow, as any animated projectile (ProjectileView), synced from its snapshot
 * throughout. Waiting (MowerSnapshot.state `ready`) it is held on its first frame, where the original has its cached
 * frame, and the intro brings it on (CutScene::UpdateIntro, LevelIntro.mowerArrival); set off (LawnMower::StartMower)
 * it plays where it runs. A mowing projectile a shooter fires has no state: it runs from the start.
 */
export class MowerView extends ProjectileView {
    /** Whether its animation plays where it runs, or is held where it waits; undefined before its first frame. */
    private running?: boolean

    sync(mower: ProjectileSnapshot & Partial<Pick<MowerSnapshot, 'state'>>): void {
        const running = mower.state !== 'ready'
        // CutScene::UpdateIntro: CalcPosition from MOWER_INTRO_X to where it waits, shown once on its way.
        const arrival = running ? 1 : this.stage.intro.mowerArrival(mower.row)
        super.sync(arrival < 1 ? { ...mower, x: Math.round(lerp(MOWER_INTRO_X, mower.x, easeInOutCurve(arrival))) } : mower)
        this.context.node.active = arrival > 0
        if (this.shadowNode?.isValid) this.shadowNode.active = arrival > 0
        const animation = this.animation, reanim = this.presentation.reanim
        if (running === this.running || !animation?.node.isValid || !reanim) return
        this.running = running
        animation.node.setPosition(running ? reanim.x : WAITING.x, running ? reanim.y : WAITING.y)
        // Set off, it plays on from the frame it was held on (LawnMower::StartMower's mAnimRate).
        if (running) animation.play({ loop: true, rate: reanim.rate })
        else animation.pause()
    }

    /** LawnMower::StartMower. */
    static readonly activated: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Lawnmower) }
}
