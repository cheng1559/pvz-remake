import { type Node, Sprite } from 'cc'
import { plantShadow, type StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import { ProjectileView } from './ProjectileView'

/**
 * Where a waiting mower's animation is from its corner. LawnMower::Draw has the cached frame 14 left of it and 19 down,
 * and ReanimatorCache::MakeCachedMowerFrame the animation 10 into that frame: 10 left of where it runs once set off.
 */
const WAITING = { x: -4, y: -19 }

/**
 * A lawn mower, waiting and running (LawnMower::Draw). One set off, a projectile, is its animation, as any animated
 * projectile. One that waits at the house end of its row is the same animation held on its first frame, where the
 * original has its cached frame, on the board's plant shadow.
 */
export class MowerView extends ProjectileView {
    particleAnchors?: Readonly<Record<string, Node>>

    async show(): Promise<void> {
        const { node, stage, content } = this.context, shadow = this.presentation.plantShadow
        if (shadow) {
            const frame = await plantShadow(content, stage)
            if (!node.isValid) return
            this.particleAnchors = { shadow: uiNode({ name: 'MowerShadow', parent: node, position: { x: shadow.x, y: -shadow.y, z: -1 },
                sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node }
        }
        (await this.animate(WAITING))?.pause()
    }

    /** LawnMower::StartMower. */
    static readonly activated: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.Lawnmower) }
}
