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
     * How far the seed bank's place has come from the UI area's left edge, where it is chosen into, to the 800 layout's,
     * from 0 to 1, unrounded: the view moves the bank's place by it. The bank's own slide in that place (SEED_BANK_X,
     * CutScene's TimeSeedBankRightStart) is the intro's. An intro without it keeps the bank in its own place (1).
     */
    bankSettled?(): number
    /**
     * Board::DrawBackdrop's sod: the picture the level's sod is (AdventureIntroLayout.sod), once it is all laid; none
     * while it is being laid. An intro without it has no sod of its own.
     */
    laidSod?(): string | undefined
    update(dt: number, stopAtTick?: number): boolean
    sync(): void
    snapshot(): LevelIntroSnapshot
    restore(snapshot: LevelIntroSnapshot): Promise<void>
    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'intro-preview' }> | null
    particleParent(slot: number): Node | null
}
