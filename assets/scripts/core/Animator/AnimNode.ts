import { Mat4, toRadian, warn, error } from 'cc'
import type { AnimNodeData, AnimationData, TrackFrameData, FrameData } from './Animator.d'

export interface ComputedTrackFrame {
    trackName: string
    zIndex: number
    frame: TrackFrameData
}

export class AnimNode {
    public isPlaying: boolean = false

    private _data: AnimNodeData
    private _parentNode: AnimNode | null = null
    private _parentSlot: string | null = null

    // Current animation
    private _currentAnim: AnimationData | null = null
    private _currentAnimName: string | null = null
    private _loop: boolean = false
    private _speed: number = 1
    private _time: number = 0
    private _finished: boolean = false
    private _keepLastFrame: boolean = false
    private _onFinish?: () => void

    // Blend transition (snapshot-based)
    private _blendTrackSnapshot: Record<string, TrackFrameData> = {}
    private _blendSlotSnapshot: Record<string, FrameData> = {}
    private _blendTime: number = 0
    private _blendElapsed: number = 0

    // Computed output
    private _computedFrames: ComputedTrackFrame[] = []

    // Temp matrices
    private _m1 = new Mat4()
    private _m2 = new Mat4()
    private _m3 = new Mat4()

    get computedFrames(): readonly ComputedTrackFrame[] {
        return this._computedFrames
    }

    constructor(data: AnimNodeData) {
        this._data = data
    }

    // ── Public API ─────────────────────────────────────────────

    public play(args: {
        name: string
        loop?: boolean
        speed?: number
        time?: number
        blendTime?: number
        keepLastFrame?: boolean
        onStart?: () => void
        onFinish?: () => void
    }): void {
        const {
            name,
            loop = false,
            speed = 1,
            time = 0,
            blendTime = 0,
            keepLastFrame = false,
            onStart,
            onFinish,
        } = args
        const anim = this._data.animations[name]
        if (!anim) {
            warn(
                `[AnimNode] Animation '${name}' not found. Available: ${Object.keys(this._data.animations).join(', ')}`,
            )
            return
        }

        if (blendTime > 0 && this._currentAnim) {
            // Snapshot current track/slot states
            this._blendTrackSnapshot = {}
            this._blendSlotSnapshot = {}
            for (const trackName in this._data.tracks) {
                const f = this._sampleTrack(trackName, this._time, this._currentAnim)
                if (f) this._blendTrackSnapshot[trackName] = f
            }
            for (const slotName in this._data.slots) {
                const f = this._sampleSlot(slotName, this._time, this._currentAnim)
                if (f) this._blendSlotSnapshot[slotName] = f
            }
            this._blendTime = blendTime
            this._blendElapsed = 0
        } else {
            this._blendTrackSnapshot = {}
            this._blendSlotSnapshot = {}
            this._blendTime = 0
        }

        this._currentAnim = anim
        this._currentAnimName = name
        this._loop = loop
        this._speed = speed
        this._time = time
        this.isPlaying = true
        this._finished = false
        this._keepLastFrame = keepLastFrame
        this._onFinish = onFinish
        onStart?.()
    }

    public attach(args: { node: AnimNode; slot: string }): void {
        if (!(args.slot in args.node._data.slots)) {
            warn(
                `[AnimNode] attach: slot '${args.slot}' not found in parent node. Available: ${Object.keys(args.node._data.slots).join(', ')}`,
            )
        }
        this._parentNode = args.node
        this._parentSlot = args.slot
    }

    public computeTransformMatrix(slot: string): Mat4 {
        const result = new Mat4()
        if (!this._currentAnim) return result

        const slotData = this._data.slots[slot]
        if (!slotData || slotData.frames.length === 0) return result

        // base frame = first frame (bind pose)
        const baseFrame = slotData.frames[0]

        // current frame at current time
        let currentFrame = this._sampleSlot(slot, this._time, this._currentAnim)
        if (!currentFrame) return result

        // blend with snapshot if transitioning
        if (this._blendTime > 0 && this._blendElapsed < this._blendTime) {
            const snapshotFrame = this._blendSlotSnapshot[slot] ?? null
            const t = Math.min(1, this._blendElapsed / this._blendTime)
            currentFrame = this._blendFrameData(snapshotFrame, currentFrame, t) ?? currentFrame
        }

        // delta = current * inverse(base)
        this._frameToMatrix(baseFrame, this._m1)
        Mat4.invert(this._m1, this._m1)
        this._frameToMatrix(currentFrame, this._m2)
        Mat4.multiply(result, this._m2, this._m1)

        // chain parent transform
        if (this._parentNode && this._parentSlot) {
            const parentMat = this._parentNode.computeTransformMatrix(this._parentSlot)
            Mat4.multiply(result, parentMat, result)
        }

        return result
    }

    public stop(): void {
        this.isPlaying = false
        this._currentAnim = null
        this._currentAnimName = null
        this._blendTrackSnapshot = {}
        this._blendSlotSnapshot = {}
        this._finished = false
    }

    public get speed(): number {
        return this._speed
    }

    public set speed(value: number) {
        this._speed = value
    }

    public get time(): number {
        return this._time
    }

    public set time(value: number) {
        this._time = value
    }

    // ── Update ─────────────────────────────────────────────────

    public update(dt: number): void {
        this._computedFrames = []
        if (!this.isPlaying || !this._currentAnim) return

        let anim = this._currentAnim

        // For looping anims, the last frame == first frame, so loop period excludes it
        const maxTime = this._loop && anim.duration > 1 ? anim.duration - 1 : anim.duration

        // advance time
        this._time += dt * anim.fps * this._speed
        if (this._time >= maxTime) {
            if (this._loop) {
                this._time %= maxTime
            } else {
                this._time = maxTime - 0.001
                if (!this._keepLastFrame) {
                    this.isPlaying = false
                }
                if (!this._finished) {
                    this._finished = true
                    this._onFinish?.()
                }

                if (this._currentAnim && this._currentAnim !== anim) {
                    anim = this._currentAnim
                }
            }
        }

        // blend transition
        let blendRatio = 1
        if (this._blendTime > 0) {
            this._blendElapsed += dt
            blendRatio = Math.min(1, this._blendElapsed / this._blendTime)
            if (blendRatio >= 1) {
                this._blendTrackSnapshot = {}
                this._blendSlotSnapshot = {}
                this._blendTime = 0
            }
        }

        // parent transform (computed once per frame)
        let parentMat: Mat4 | null = null
        if (this._parentNode && this._parentSlot) {
            parentMat = this._parentNode.computeTransformMatrix(this._parentSlot)
        }

        // sample all tracks
        const tracks = this._data.tracks
        for (const trackName in tracks) {
            const trackData = tracks[trackName]
            let frame = this._sampleTrack(trackName, this._time, anim)

            if (blendRatio < 1) {
                const snapshotFrame = this._blendTrackSnapshot[trackName] ?? null
                frame = this._blendTrackFrames(snapshotFrame, frame, blendRatio)
            }

            if (!frame) continue

            // apply parent slot transform
            if (parentMat) {
                frame = this._applyParentTransform(frame, parentMat)
            }

            this._computedFrames.push({
                trackName,
                zIndex: trackData.zIndex,
                frame,
            })
        }
    }

    // ── Sampling ───────────────────────────────────────────────

    private _sampleTrack(
        trackName: string,
        time: number,
        anim: AnimationData,
    ): TrackFrameData | null {
        const track = this._data.tracks[trackName]
        if (!track || track.frames.length === 0) return null
        const targetFrame = anim.startFrame + time
        return this._sampleTrackFramesAt(track.frames, targetFrame)
    }

    private _sampleTrackFramesAt(
        frames: TrackFrameData[],
        targetFrame: number,
    ): TrackFrameData | null {
        if (frames.length === 0) return null

        let leftIdx = -1
        for (let i = 0; i < frames.length; i++) {
            if (frames[i].frameIndex <= targetFrame) leftIdx = i
            else break
        }
        if (leftIdx === -1) return null

        const left = frames[leftIdx]
        if (leftIdx + 1 >= frames.length) return { ...left }

        const right = frames[leftIdx + 1]
        const span = right.frameIndex - left.frameIndex
        if (span <= 0) return { ...left }

        const ratio = (targetFrame - left.frameIndex) / span
        return this._lerpTrackFrame(left, right, ratio)
    }

    private _sampleSlot(slot: string, time: number, anim: AnimationData): FrameData | null {
        const slotData = this._data.slots[slot]
        if (!slotData || slotData.frames.length === 0) return null
        const targetFrame = anim.startFrame + time
        return this._sampleFrameDataAt(slotData.frames, targetFrame)
    }

    private _sampleFrameDataAt(frames: FrameData[], targetFrame: number): FrameData | null {
        if (frames.length === 0) return null

        let leftIdx = -1
        for (let i = 0; i < frames.length; i++) {
            if (frames[i].frameIndex <= targetFrame) leftIdx = i
            else break
        }
        if (leftIdx === -1) return null

        const left = frames[leftIdx]
        if (leftIdx + 1 >= frames.length) return { ...left }

        const right = frames[leftIdx + 1]
        const span = right.frameIndex - left.frameIndex
        if (span <= 0) return { ...left }

        const ratio = (targetFrame - left.frameIndex) / span
        return this._lerpFrameData(left, right, ratio)
    }

    // ── Interpolation ──────────────────────────────────────────

    private _lerpTrackFrame(a: TrackFrameData, b: TrackFrameData, t: number): TrackFrameData {
        return {
            frameIndex: a.frameIndex + (b.frameIndex - a.frameIndex) * t,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            sx: a.sx + (b.sx - a.sx) * t,
            sy: a.sy + (b.sy - a.sy) * t,
            kx: a.kx + (b.kx - a.kx) * t,
            ky: a.ky + (b.ky - a.ky) * t,
            alpha: a.alpha + (b.alpha - a.alpha) * t,
            // alpha: t < 0.5 ? a.alpha : b.alpha,
            image: t < 0.5 ? a.image : b.image,
        }
    }

    private _lerpFrameData(a: FrameData, b: FrameData, t: number): FrameData {
        return {
            frameIndex: a.frameIndex + (b.frameIndex - a.frameIndex) * t,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            sx: a.sx + (b.sx - a.sx) * t,
            sy: a.sy + (b.sy - a.sy) * t,
            kx: a.kx + (b.kx - a.kx) * t,
            ky: a.ky + (b.ky - a.ky) * t,
        }
    }

    // ── Blending ───────────────────────────────────────────────

    private _blendTrackFrames(
        from: TrackFrameData | null,
        to: TrackFrameData | null,
        t: number,
    ): TrackFrameData | null {
        if (from && to) return this._lerpTrackFrame(from, to, t)
        return to
    }

    private _blendFrameData(
        from: FrameData | null,
        to: FrameData | null,
        t: number,
    ): FrameData | null {
        if (from && to) return this._lerpFrameData(from, to, t)
        return to
    }

    // ── Matrix helpers ─────────────────────────────────────────

    private _frameToMatrix(frame: FrameData, out: Mat4): void {
        const rkx = -toRadian(frame.kx)
        const rky = -toRadian(frame.ky)
        Mat4.identity(out)
        out.m00 = frame.sx * Math.cos(rkx)
        out.m01 = frame.sx * Math.sin(rkx)
        out.m04 = -frame.sy * Math.sin(rky)
        out.m05 = frame.sy * Math.cos(rky)
        out.m12 = frame.x
        out.m13 = -frame.y
    }

    private _matrixToTrackFrame(mat: Mat4, base: TrackFrameData): TrackFrameData {
        let sx = Math.sqrt(mat.m00 * mat.m00 + mat.m01 * mat.m01)
        let sy = Math.sqrt(mat.m04 * mat.m04 + mat.m05 * mat.m05)
        let kx = (-Math.atan2(mat.m01, mat.m00) * 180) / Math.PI
        let ky = (-Math.atan2(-mat.m04, mat.m05) * 180) / Math.PI

        const det = mat.m00 * mat.m05 - mat.m01 * mat.m04
        if (det < 0) {
            sy = -sy
            ky += 180
        }

        return {
            frameIndex: base.frameIndex,
            x: mat.m12,
            y: -mat.m13,
            sx,
            sy,
            kx,
            ky,
            alpha: base.alpha,
            image: base.image,
        }
    }

    private _applyParentTransform(frame: TrackFrameData, parentMat: Mat4): TrackFrameData {
        this._frameToMatrix(frame, this._m3)
        Mat4.multiply(this._m3, parentMat, this._m3)
        return this._matrixToTrackFrame(this._m3, frame)
    }
}
