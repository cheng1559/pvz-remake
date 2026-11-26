import type { Node } from 'cc'
import type { LevelIntroSnapshot, LevelParticleOwnerSnapshot } from './LevelPresentationSnapshot'

export interface LevelIntro {
    readonly complete: boolean
    readonly elapsedTicks: number
    /** When night graves start to rise; undefined without graves. */
    readonly graveStartTick?: number
    /**
     * CutScene::UpdateIntro brings each row's mower on (TimeLawnMowerStart, TimeLawnMowerDuration): how far that of
     * `row` has come, from 0 before it shows to 1 once it is where it waits. Its view draws it so (MowerView); a
     * complete intro has every one in place.
     */
    mowerArrival(row: number): number
    /**
     * CutScene's TimeSeedBankRightStart: how far the seed bank has slid from its choosing place to its own, from 0 to 1,
     * unrounded: the bank's x is SEED_BANK_X of it, and the view moves the bank's place with it. An intro without it
     * keeps the bank in its own place (1).
     */
    bankSettled?(): number
    update(dt: number, stopAtTick?: number): boolean
    sync(): void
    snapshot(): LevelIntroSnapshot
    restore(snapshot: LevelIntroSnapshot): Promise<void>
    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'intro-preview' }> | null
    particleParent(slot: number): Node | null
}
