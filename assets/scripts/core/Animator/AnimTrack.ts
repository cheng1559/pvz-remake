import { Node, Mat4, Sprite, Color, UISkew, toRadian } from 'cc'
import { AnimFrame, AnimNodeInfo, Animation, IAnimator } from './AnimatorTypes'

export class AnimTrack {
    public isPlaying: boolean = false
    public speed: number = 1
    public time: number = 0
    public currentAnim: Animation | null = null

    private _node: Node
    private _info: AnimNodeInfo
    private _animator: IAnimator
    private _loop: boolean = false
    private _finished: boolean = false
    private _bindInverseMatrix: Mat4 | null = null
    private _tempMat4: Mat4 = new Mat4()

    constructor(node: Node, info: AnimNodeInfo, animator: IAnimator) {
        this._node = node
        this._info = info
        this._animator = animator

        if (this._info.transform) {
            const t = this._info.transform
            const mat = new Mat4()
            const fakeFrame = { ...t, alpha: 1, image: null } as AnimFrame
            this.calculateFrameMatrix(fakeFrame, mat)
            this._bindInverseMatrix = mat.invert()

            this.reset()
        }
    }

    public reset() {
        if (this._info.transform) {
            const t = this._info.transform
            const frame: AnimFrame = {
                x: t.x,
                y: t.y,
                sx: t.sx,
                sy: t.sy,
                kx: t.kx,
                ky: t.ky,
                alpha: t.alpha ?? 1,
                image: t.image ?? null,
            }
            this.applyFrameToNode(frame)
        }
    }

    public play(animName: string, loop: boolean = false) {
        if (!this._info.animations) return
        const anim = this._info.animations.find((a) => a.name === animName)
        if (!anim) {
            return
        }

        this.currentAnim = anim
        this._loop = loop
        this.time = 0
        this.isPlaying = true
        this._finished = false
    }

    public stop() {
        this.isPlaying = false
    }

    public update(dt: number) {
        if (!this.isPlaying || !this.currentAnim) return

        const anim = this.currentAnim
        this.time += dt * anim.fps * this.speed
        const maxTime = anim.frames

        if (this.time >= maxTime) {
            if (this._loop) {
                this.time %= maxTime
            } else {
                this.time = maxTime - 0.0001
                this.isPlaying = false
                this._finished = true
            }
        }

        const frameIndex = Math.floor(this.time)
        const nextFrameIndex = frameIndex + 1
        const ratio = this.time - frameIndex

        let nodeTouched = false

        for (const track of anim.tracks) {
            const data = track.data
            const len = data.length
            const leftFrame = data[frameIndex % len]
            let rightFrame: AnimFrame | null = null

            if (!this._loop && nextFrameIndex >= len) {
                rightFrame = leftFrame
            } else {
                rightFrame = data[nextFrameIndex % len]
            }

            const sprite = this._node.getComponent(Sprite)
            if (!sprite) continue

            if (!leftFrame) {
                sprite.enabled = false
                continue
            }

            sprite.enabled = true
            nodeTouched = true

            let f = this.interpolateFrameData(leftFrame, rightFrame, ratio)

            if (this._bindInverseMatrix) {
                this.calculateFrameMatrix(f, this._tempMat4)
                Mat4.multiply(this._tempMat4, this._bindInverseMatrix, this._tempMat4)

                const m = this._tempMat4
                f.x = m.m12
                f.y = -m.m13

                f.sx = Math.sqrt(m.m00 * m.m00 + m.m01 * m.m01)
                f.sy = Math.sqrt(m.m04 * m.m04 + m.m05 * m.m05)
                f.kx = (-Math.atan2(m.m01, m.m00) * 180) / Math.PI
                f.ky = (-Math.atan2(-m.m04, m.m05) * 180) / Math.PI

                const det = m.m00 * m.m05 - m.m01 * m.m04
                if (det < 0) {
                    f.sy = -f.sy
                    f.ky += 180
                }
            }

            this.applyFrameToNode(f)
        }
    }

    private applyFrameToNode(f: AnimFrame) {
        const node = this._node
        node.setPosition(f.x, -f.y, 0)
        node.angle = -f.kx

        let uiSkew = node.getComponent(UISkew)
        if (!uiSkew) uiSkew = node.addComponent(UISkew)

        const skewDiff = f.kx - f.ky
        const skewRad = toRadian(skewDiff)
        const cosVal = Math.cos(skewRad)
        const safeCos = Math.abs(cosVal) < 0.001 ? 0.001 : cosVal

        const scaleX = f.sx
        const scaleY = f.sy * safeCos

        let appliedSkew = skewDiff
        if (Math.abs(scaleX) > 0.0001) {
            const skewTan = Math.tan(skewRad)
            const appliedTan = skewTan * (scaleY / scaleX)
            appliedSkew = (Math.atan(appliedTan) * 180) / Math.PI
        }

        uiSkew.setSkew(-appliedSkew, 0)
        node.setScale(scaleX, scaleY, 1)

        const sprite = node.getComponent(Sprite)!
        const alphaVal = f.alpha
        if (sprite.color.a !== alphaVal * 255) {
            sprite.color = new Color(255, 255, 255, alphaVal * 255)
        }

        if (f.image && sprite.spriteFrame?.name !== f.image) {
            const sf = this._animator.getSpriteFrame(f.image)
            if (sf) sprite.spriteFrame = sf
        }
    }

    private calculateFrameMatrix(frame: AnimFrame, outMat: Mat4) {
        const r_kx = -toRadian(frame.kx)
        const r_ky = -toRadian(frame.ky)
        const sx = frame.sx
        const sy = frame.sy

        const m00 = sx * Math.cos(r_kx)
        const m01 = sx * Math.sin(r_kx)
        const m04 = -sy * Math.sin(r_ky)
        const m05 = sy * Math.cos(r_ky)

        Mat4.identity(outMat)
        outMat.m00 = m00
        outMat.m01 = m01
        outMat.m04 = m04
        outMat.m05 = m05
        outMat.m12 = frame.x
        outMat.m13 = -frame.y
    }

    private interpolateFrameData(
        frame1: AnimFrame,
        frame2: AnimFrame | null,
        ratio: number,
    ): AnimFrame {
        if (!frame2) return { ...frame1 }

        return {
            x: frame1.x + (frame2.x - frame1.x) * ratio,
            y: frame1.y + (frame2.y - frame1.y) * ratio,
            sx: frame1.sx + (frame2.sx - frame1.sx) * ratio,
            sy: frame1.sy + (frame2.sy - frame1.sy) * ratio,
            kx: frame1.kx + (frame2.kx - frame1.kx) * ratio,
            ky: frame1.ky + (frame2.ky - frame1.ky) * ratio,
            alpha: frame1.alpha + (frame2.alpha - frame1.alpha) * ratio,
            image: frame1.image,
        }
    }
}
