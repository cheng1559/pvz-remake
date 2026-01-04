import { IAnimationController } from './AnimatorTypes'

export class AnimationChain {
    private _owner: IAnimationController
    private _queue: {
        name: string
        type: 'play' | 'loop'
        speed: number
        duration?: number
        keepLastFrame?: boolean
        z: number
        onStart?: () => void
        onFinish?: () => void
    }[] = []
    private _processing: boolean = false

    constructor(owner: IAnimationController) {
        this._owner = owner
    }

    play(
        name: string,
        speed: number = 1,
        keepLastFrame: boolean = false,
        z: number = 0,
        onStart?: () => void,
        onFinish?: () => void,
    ) {
        this._queue.push({ name, type: 'play', speed, keepLastFrame, z, onStart, onFinish })
        this.process()
        return this
    }

    loop(
        name: string,
        speed: number = 1,
        duration: number = 0,
        keepLastFrame: boolean = false,
        z: number = 0,
        onStart?: () => void,
        onFinish?: () => void,
    ) {
        this._queue.push({
            name,
            type: 'loop',
            speed,
            duration,
            keepLastFrame,
            z,
            onStart,
            onFinish,
        })
        this.process()
        return this
    }

    private async process() {
        if (this._processing || this._queue.length === 0) return

        this._processing = true
        const next = this._queue.shift()!

        const isTimedLoop = next.type === 'loop' && (next.duration || 0) > 0
        const waitForFinish = next.type === 'play' || isTimedLoop

        await this._owner._executeAnim(
            next.name,
            next.type === 'loop',
            next.speed,
            next.duration,
            next.keepLastFrame,
            next.z,
            next.onStart,
            () => {
                if (next.onFinish) next.onFinish()
                if (waitForFinish) {
                    this._processing = false
                    this.process()
                }
            },
        )

        if (!waitForFinish) {
            this._processing = false
            this.process()
        }
    }
}
