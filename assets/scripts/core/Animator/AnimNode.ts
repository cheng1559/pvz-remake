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
    private _parentTrack: string | null = null
    private _parentBasePoseFrame: number | null = null
    private _parentBasePoseFrameOverride: number | null = null

    // Current animation
    private _currentAnim: AnimationData | null = null
    private _currentAnimName: string | null = null
    private _loop: boolean = false
    private _speed: number = 1
    private _time: number = 0
    private _finished: boolean = false
    private _keepLastFrame: boolean = false
    private _onFinish?: () => void
    private _onPoseDirty?: () => void
    private _frameCountOverride: number | null = null
    private _truncateDisappearingFrames: boolean = true
    private _visibleTracks: Set<string> | null = null
    private _hiddenTrackPrefixes: Set<string> | null = null

    // Blend transition (snapshot-based)
    private _blendTrackSnapshot: Record<string, TrackFrameData> = {}
    private _blendSlotSnapshot: Record<string, FrameData> = {}
    private _blendTime: number = 0
    private _blendElapsed: number = 0

    // Computed output
    private _computedFrames: ComputedTrackFrame[] = []
    private _computedFramePool: ComputedTrackFrame[] = []
    private _trackSampleIndices: Record<string, number> = {}
    private _slotSampleIndices: Record<string, number> = {}

    // Temp matrices
    private _m1 = new Mat4()
    private _m2 = new Mat4()
    private _m3 = new Mat4()

    get computedFrames(): readonly ComputedTrackFrame[] {
        return this._computedFrames
    }

    constructor(data: AnimNodeData, onPoseDirty?: () => void) {
        this._data = data
        this._onPoseDirty = onPoseDirty
    }

    // ── Public API ─────────────────────────────────────────────

    public play(args: {
        name: string
        loop?: boolean
        speed?: number
        time?: number
        blendTime?: number
        keepLastFrame?: boolean
        frameCountOverride?: number
        truncateDisappearingFrames?: boolean
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
            frameCountOverride,
            truncateDisappearingFrames = true,
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
            const previousTrackSnapshot = this._blendTrackSnapshot
            const previousSlotSnapshot = this._blendSlotSnapshot
            const previousBlendTime = this._blendTime
            const previousBlendElapsed = this._blendElapsed

            // Snapshot current track/slot states
            const blendTrackSnapshot: Record<string, TrackFrameData> = {}
            const blendSlotSnapshot: Record<string, FrameData> = {}
            for (const trackName in this._data.tracks) {
                const f = this._sampleCurrentTrackForBlend(
                    trackName,
                    previousTrackSnapshot,
                    previousBlendTime,
                    previousBlendElapsed,
                )
                if (f) blendTrackSnapshot[trackName] = f
            }
            for (const slotName in this._data.slots) {
                const f = this._sampleCurrentSlotForBlend(
                    slotName,
                    previousSlotSnapshot,
                    previousBlendTime,
                    previousBlendElapsed,
                )
                if (f) blendSlotSnapshot[slotName] = f
            }
            this._blendTrackSnapshot = blendTrackSnapshot
            this._blendSlotSnapshot = blendSlotSnapshot
            this._blendTime = blendTime
            this._blendElapsed = 0
        } else {
            this._blendTrackSnapshot = {}
            this._blendSlotSnapshot = {}
            this._blendTime = 0
        }

        this._currentAnim = anim
        this._currentAnimName = name
        this._trackSampleIndices = {}
        this._slotSampleIndices = {}
        this._loop = loop
        this._speed = speed
        this._time = time
        this._parentBasePoseFrame =
            this._parentBasePoseFrameOverride ??
            this._parentNode?.currentAnimationStartFrame ??
            null
        this.isPlaying = true
        this._finished = false
        this._keepLastFrame = keepLastFrame
        this._frameCountOverride = frameCountOverride ?? null
        this._truncateDisappearingFrames = truncateDisappearingFrames
        this._onFinish = onFinish
        onStart?.()
        this._onPoseDirty?.()
    }

    public attach(args: { node: AnimNode; slot: string; basePoseFrame?: number }): void {
        if (!(args.slot in args.node._data.slots)) {
            warn(
                `[AnimNode] attach: slot '${args.slot}' not found in parent node. Available: ${Object.keys(args.node._data.slots).join(', ')}`,
            )
        }
        this._parentNode = args.node
        this._parentSlot = args.slot
        this._parentTrack = null
        this._parentBasePoseFrameOverride = args.basePoseFrame ?? null
        this._parentBasePoseFrame = this._parentBasePoseFrameOverride
    }

    public attachToTrack(args: { node: AnimNode; track: string }): void {
        if (!(args.track in args.node._data.tracks)) {
            const availableTracks = Object.keys(args.node._data.tracks).join(', ')
            const message = `[AnimNode] attachToTrack: track '${args.track}' not found in parent node.`
            warn(`${message} Available: ${availableTracks}`)
        }
        this._parentNode = args.node
        this._parentSlot = null
        this._parentTrack = args.track
        this._parentBasePoseFrameOverride = null
        this._parentBasePoseFrame = null
    }

    public computeTransformMatrix(slot: string, basePoseFrame?: number | null): Mat4 {
        const result = new Mat4()
        if (!this._currentAnim) return result

        const slotData = this._data.slots[slot]
        if (!slotData || slotData.frames.length === 0) return result

        const baseFrame = this._sampleBaseSlotFrame(slot, basePoseFrame ?? this._currentAnim.startFrame)
        if (!baseFrame) return result

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

        this._applyAttachedParentTransform(result)

        return result
    }

    public computeTrackTransformMatrix(track: string, basePoseFrame?: number | null): Mat4 {
        const result = new Mat4()
        if (!this._currentAnim) return result

        const trackData = this._data.tracks[track]
        if (!trackData || trackData.frames.length === 0) return result

        const baseFrame = this._sampleBaseTrackFrame(track, basePoseFrame ?? this._currentAnim.startFrame)
        if (!baseFrame) return result

        let currentFrame = this._sampleTrack(track, this._time, this._currentAnim)
        if (!currentFrame) return result

        if (this._blendTime > 0 && this._blendElapsed < this._blendTime) {
            const snapshotFrame = this._blendTrackSnapshot[track] ?? null
            const t = Math.min(1, this._blendElapsed / this._blendTime)
            currentFrame = this._blendTrackFrames(snapshotFrame, currentFrame, t) ?? currentFrame
        }

        this._frameToMatrix(baseFrame, this._m1)
        Mat4.invert(this._m1, this._m1)
        this._frameToMatrix(currentFrame, this._m2)
        Mat4.multiply(result, this._m2, this._m1)

        this._applyAttachedParentTransform(result)

        return result
    }

    public stop(): void {
        this.isPlaying = false
        this._currentAnim = null
        this._currentAnimName = null
        this._parentBasePoseFrame = null
        this._frameCountOverride = null
        this._truncateDisappearingFrames = true
        this._blendTrackSnapshot = {}
        this._blendSlotSnapshot = {}
        this._finished = false
    }

    public showOnlyTrack(trackName: string): void {
        this._visibleTracks = new Set([trackName])
    }

    public clearTrackFilter(): void {
        this._visibleTracks = null
    }

    public hidePrefix(prefix: string): void {
        if (!this._hiddenTrackPrefixes) this._hiddenTrackPrefixes = new Set()
        this._hiddenTrackPrefixes.add(prefix)
    }

    public get speed(): number {
        return this._speed
    }

    public set speed(value: number) {
        this._speed = value
    }

    public getAnimationFps(name: string): number | null {
        return this._data.animations[name]?.fps ?? null
    }

    public getAnimationDuration(name: string): number | null {
        return this._data.animations[name]?.duration ?? null
    }

    public setFrameCountOverride(frameCount: number | null): void {
        this._frameCountOverride = frameCount == null ? null : Math.max(1, frameCount)
    }

    public hasAnimation(name: string): boolean {
        return name in this._data.animations
    }

    public get currentAnimationStartFrame(): number | null {
        return this._currentAnim?.startFrame ?? null
    }

    public get time(): number {
        return this._time
    }

    public set time(value: number) {
        this._time = value
        this._onPoseDirty?.()
    }

    // ── Update ─────────────────────────────────────────────────

    public update(dt: number): void {
        this._computedFrames.length = 0
        if (!this.isPlaying || !this._currentAnim) return

        let anim = this._currentAnim

        const duration = this._frameCountOverride ?? anim.duration
        const frameSpan = Math.max(0, duration - 1)
        const advanceScale = duration > 0 ? frameSpan / duration : 0

        // advance time
        this._time += dt * anim.fps * this._speed * advanceScale
        if (frameSpan > 0 && this._time >= frameSpan) {
            if (this._loop) {
                this._time %= frameSpan
            } else {
                this._time = frameSpan
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
        } else if (frameSpan <= 0 && !this._loop) {
            if (!this._keepLastFrame) {
                this.isPlaying = false
            }
            if (!this._finished) {
                this._finished = true
                this._onFinish?.()
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
        if (this._parentNode && (this._parentSlot || this._parentTrack)) {
            parentMat = this._getAttachedParentTransform()
        }

        // sample all tracks
        const tracks = this._data.tracks
        for (const trackName in tracks) {
            if (this._visibleTracks && !this._visibleTracks.has(trackName)) continue
            if (this._hiddenTrackPrefixes) {
                let hidden = false
                for (const prefix of this._hiddenTrackPrefixes) {
                    if (trackName.startsWith(prefix)) {
                        hidden = true
                        break
                    }
                }
                if (hidden) continue
            }

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

            const outputIndex = this._computedFrames.length
            let computed = this._computedFramePool[outputIndex]
            if (!computed) {
                computed = this._computedFramePool[outputIndex] = {
                    trackName,
                    zIndex: trackData.zIndex,
                    frame,
                }
            } else {
                computed.trackName = trackName
                computed.zIndex = trackData.zIndex
                computed.frame = frame
            }
            this._computedFrames.push(computed)
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
        return this._sampleTrackFramesAt(track.frames, targetFrame, trackName)
    }

    private _sampleTrackFramesAt(
        frames: TrackFrameData[],
        targetFrame: number,
        cacheKey?: string,
    ): TrackFrameData | null {
        if (frames.length === 0) return null
        if (targetFrame > frames[frames.length - 1].frameIndex) {
            const last = frames[frames.length - 1]
            if (!this._truncateDisappearingFrames && targetFrame < last.frameIndex + 1) {
                return last
            }
            return null
        }

        let leftIdx = cacheKey ? (this._trackSampleIndices[cacheKey] ?? 0) : 0
        if (leftIdx >= frames.length) leftIdx = frames.length - 1
        while (leftIdx + 1 < frames.length && frames[leftIdx + 1].frameIndex <= targetFrame) {
            leftIdx++
        }
        while (leftIdx > 0 && frames[leftIdx].frameIndex > targetFrame) {
            leftIdx--
        }
        if (frames[leftIdx].frameIndex > targetFrame) return null
        if (cacheKey) this._trackSampleIndices[cacheKey] = leftIdx

        const left = frames[leftIdx]
        if (leftIdx + 1 >= frames.length) return left

        const right = frames[leftIdx + 1]
        if (right.frameIndex - left.frameIndex > 1 && targetFrame >= left.frameIndex + 1) {
            return null
        }

        const span = right.frameIndex - left.frameIndex
        if (span <= 0) return left

        const ratio = (targetFrame - left.frameIndex) / span
        return this._lerpTrackFrame(left, right, ratio)
    }

    private _sampleSlot(slot: string, time: number, anim: AnimationData): FrameData | null {
        const slotData = this._data.slots[slot]
        if (!slotData || slotData.frames.length === 0) return null
        const targetFrame = anim.startFrame + time
        return this._sampleFrameDataAt(slotData.frames, targetFrame, slot)
    }

    private _sampleCurrentTrackForBlend(
        trackName: string,
        blendTrackSnapshot: Record<string, TrackFrameData>,
        blendTime: number,
        blendElapsed: number,
    ) {
        if (!this._currentAnim) return null

        let frame = this._sampleTrack(trackName, this._time, this._currentAnim)
        if (blendTime > 0 && blendElapsed < blendTime) {
            const blendRatio = Math.min(1, blendElapsed / blendTime)
            frame = this._blendTrackFrames(blendTrackSnapshot[trackName] ?? null, frame, blendRatio)
        }
        return frame
    }

    private _sampleCurrentSlotForBlend(
        slotName: string,
        blendSlotSnapshot: Record<string, FrameData>,
        blendTime: number,
        blendElapsed: number,
    ) {
        if (!this._currentAnim) return null

        let frame = this._sampleSlot(slotName, this._time, this._currentAnim)
        if (blendTime > 0 && blendElapsed < blendTime) {
            const blendRatio = Math.min(1, blendElapsed / blendTime)
            frame = this._blendFrameData(blendSlotSnapshot[slotName] ?? null, frame, blendRatio)
        }
        return frame
    }

    private _sampleBaseSlotFrame(slot: string, basePoseFrame: number): FrameData | null {
        const slotData = this._data.slots[slot]
        if (!slotData || slotData.frames.length === 0) return null
        return this._sampleFrameDataAt(slotData.frames, basePoseFrame) ?? slotData.frames[0]
    }

    private _sampleBaseTrackFrame(track: string, basePoseFrame: number): TrackFrameData | null {
        const trackData = this._data.tracks[track]
        if (!trackData || trackData.frames.length === 0) return null
        return this._sampleTrackFramesAt(trackData.frames, basePoseFrame) ?? trackData.frames[0]
    }

    private _sampleFrameDataAt(
        frames: FrameData[],
        targetFrame: number,
        cacheKey?: string,
    ): FrameData | null {
        if (frames.length === 0) return null
        if (targetFrame > frames[frames.length - 1].frameIndex) return null

        let leftIdx = cacheKey ? (this._slotSampleIndices[cacheKey] ?? 0) : 0
        if (leftIdx >= frames.length) leftIdx = frames.length - 1
        while (leftIdx + 1 < frames.length && frames[leftIdx + 1].frameIndex <= targetFrame) {
            leftIdx++
        }
        while (leftIdx > 0 && frames[leftIdx].frameIndex > targetFrame) {
            leftIdx--
        }
        if (frames[leftIdx].frameIndex > targetFrame) return null
        if (cacheKey) this._slotSampleIndices[cacheKey] = leftIdx

        const left = frames[leftIdx]
        if (leftIdx + 1 >= frames.length) return left

        const right = frames[leftIdx + 1]
        const span = right.frameIndex - left.frameIndex
        if (span <= 0) return left

        const ratio = (targetFrame - left.frameIndex) / span
        return this._lerpFrameData(left, right, ratio)
    }

    // ── Interpolation ──────────────────────────────────────────

    private _lerpTrackFrame(a: TrackFrameData, b: TrackFrameData, t: number): TrackFrameData {
        return {
            frameIndex: a.frameIndex,
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            sx: a.sx + (b.sx - a.sx) * t,
            sy: a.sy + (b.sy - a.sy) * t,
            kx: a.kx + (b.kx - a.kx) * t,
            ky: a.ky + (b.ky - a.ky) * t,
            alpha: a.alpha + (b.alpha - a.alpha) * t,
            image: a.image,
        }
    }

    private _lerpFrameData(a: FrameData, b: FrameData, t: number): FrameData {
        return {
            frameIndex: a.frameIndex,
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
        if (from && to) return this._blendTrackFrame(from, to, t)
        return to
    }

    private _blendFrameData(
        from: FrameData | null,
        to: FrameData | null,
        t: number,
    ): FrameData | null {
        if (from && to) return this._blendSlotFrame(from, to, t)
        return to
    }

    private _blendTrackFrame(from: TrackFrameData, to: TrackFrameData, t: number): TrackFrameData {
        return {
            frameIndex: to.frameIndex,
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            sx: from.sx + (to.sx - from.sx) * t,
            sy: from.sy + (to.sy - from.sy) * t,
            kx: this._lerpBlendAngle(from.kx, to.kx, t),
            ky: this._lerpBlendAngle(from.ky, to.ky, t),
            alpha: from.alpha + (to.alpha - from.alpha) * t,
            image: to.image,
        }
    }

    private _lerpBlendAngle(from: number, to: number, t: number) {
        let adjustedFrom = from
        while (adjustedFrom > to + 180) adjustedFrom -= 360
        while (adjustedFrom < to - 180) adjustedFrom += 360
        return adjustedFrom + (to - adjustedFrom) * t
    }

    private _blendSlotFrame(from: FrameData, to: FrameData, t: number): FrameData {
        return {
            frameIndex: to.frameIndex,
            x: from.x + (to.x - from.x) * t,
            y: from.y + (to.y - from.y) * t,
            sx: from.sx + (to.sx - from.sx) * t,
            sy: from.sy + (to.sy - from.sy) * t,
            kx: this._lerpBlendAngle(from.kx, to.kx, t),
            ky: this._lerpBlendAngle(from.ky, to.ky, t),
        }
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

    private _getAttachedParentTransform(): Mat4 | null {
        if (!this._parentNode) return null
        if (this._parentSlot) {
            return this._parentNode.computeTransformMatrix(this._parentSlot, this._parentBasePoseFrame)
        }
        if (this._parentTrack) {
            return this._parentNode.computeTrackTransformMatrix(this._parentTrack, this._parentBasePoseFrame)
        }
        return null
    }

    private _applyAttachedParentTransform(matrix: Mat4): void {
        const parentMat = this._getAttachedParentTransform()
        if (parentMat) {
            Mat4.multiply(matrix, parentMat, matrix)
        }
    }
}
