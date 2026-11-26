import { TIME_CHANGE_TICKS } from '@/shared/content/gameplay'
import type { WorldSnapshot } from '@/shared/protocol/index'

/** `/time`'s change of time of day as the server counts it (WorldSnapshot.timeChange). */
export type TimeChange = NonNullable<WorldSnapshot['timeChange']>

/**
 * Something of the board that `/time`'s change of time of day blends from the old time's look into the new one's
 * (TimeBlends): the lawn, the shadows, the music, a Mod's covers (LevelView.addTimeBlend). TimeBlends runs the change and
 * tells each what to do, as a reanim blends one clip into another (ReanimPlayer.change): it keeps what was, shows what
 * comes, and goes from one to the other by a weight.
 */
export interface TimeBlend {
    /** A change begins: it keeps what it shows now, the old time's, to blend from. */
    begin(): void
    /** It blends into the time of day `time`, shown with what it keeps; done once it shows (its pictures or tune loaded). */
    show(time: string): Promise<void> | void
    /** The time it blends into shows at `weight`: 0 as the change begins, up to 1 as it ends; what it keeps at the rest. */
    blend(weight: number): void
    /** The change is over: what it kept goes, and it is at the time it last showed. */
    end(): void
}

/** The change of time as it is drawn now: the time of day it blends from, the one it blends into, and its weight (TimeBlend.blend). */
export interface TimeBlending {
    from: string
    to: string
    weight: number
}

/**
 * `/time`'s change of time of day as it is drawn. As a change begins, each blend keeps the look of the time it comes from
 * and shows the time it goes to with it, which comes in by the ticks the lawn has turned. Once the lawn has turned all
 * the way, what they kept goes. The level goes on at the new time halfway (TIME_SWITCH_TICKS), which the blends do not
 * heed: they go by the lawn's turning.
 */
export class TimeBlends {
    private readonly blends: TimeBlend[] = []
    /** The change being drawn: the time it comes from, the one it blends into, and its weight. */
    private going?: { from: string, to: string, weight: number }

    /** `time`, the time of day whose look is drawn: the level's, or the one a change goes on from. */
    constructor(private time: string) {}

    /** The change as it is drawn now, for what draws it in its own place as it syncs (a crater, LevelStage.timeBlend). */
    get blending(): TimeBlending | undefined {
        const going = this.going
        return going && { from: going.from, to: going.to, weight: going.weight }
    }

    /** One more blends with the others; one added while a change goes on joins it as it is. */
    add(blend: TimeBlend): void {
        this.blends.push(blend)
        const going = this.going
        if (!going) return
        blend.begin()
        void blend.show(going.to)
        blend.blend(going.weight)
    }

    /** A frame of the level: at the time of day `time`, with the change `change` going on or none. */
    sync(time: string, change: TimeChange | undefined): void {
        const going = this.going
        // The change drawn is over: turned all the way, or another going on from where it went (between two frames).
        if (going && (!change || going.from !== change.from || going.to !== change.to)) this.end()
        if (change) return this.go(change)
        // At a time no change was drawn to (all its frames came between two of the view's): each shows it at once.
        if (time !== this.time) this.showAtOnce(time)
    }

    private go(change: TimeChange): void {
        if (!this.going) {
            this.going = { from: change.from, to: change.to, weight: 0 }
            for (const blend of this.blends) blend.begin()
            for (const blend of this.blends) void blend.show(change.to)
        }
        this.going.weight = change.ticks / TIME_CHANGE_TICKS
        for (const blend of this.blends) blend.blend(this.going.weight)
    }

    private end(): void {
        this.time = this.going!.to
        this.going = undefined
        for (const blend of this.blends) blend.end()
    }

    private showAtOnce(time: string): void {
        this.time = time
        for (const blend of this.blends) void Promise.resolve(blend.show(time)).then(() => { if (!this.going) blend.end() })
    }
}
