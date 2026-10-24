import type { Node } from 'cc'
import type { LevelIntroSnapshot, LevelParticleOwnerSnapshot } from './LevelPresentationSnapshot'

export interface LevelIntro {
    readonly complete: boolean
    readonly elapsedTicks: number
    update(dt: number, stopAtTick?: number): boolean
    sync(): void
    snapshot(): LevelIntroSnapshot
    restore(snapshot: LevelIntroSnapshot): Promise<void>
    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'intro-preview' }> | null
    particleParent(slot: number): Node | null
}
