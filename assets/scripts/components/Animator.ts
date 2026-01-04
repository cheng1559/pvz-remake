import {
    _decorator,
    Component,
    Node,
    JsonAsset,
    Sprite,
    SpriteFrame,
    resources,
    UITransform,
    Color,
    Mat4,
    toRadian,
    UISkew,
} from 'cc'
import { Animation, AnimState, AnimFrame, IAnimationController } from './AnimatorTypes'
import { AnimationChain } from './AnimationChain'

const { ccclass, property } = _decorator

@ccclass('Animator')
export class Animator extends Component implements IAnimationController {
    @property(JsonAsset)
    jsonAsset: JsonAsset = null!

    @property
    animationName: string = ''

    private _animations: Map<string, Animation> = new Map()
    private _activeStates: AnimState[] = []
    private _nodes: Map<string, Node> = new Map()
    private _loadedSpriteFrames: Map<string, SpriteFrame> = new Map()
    private _isPlaying: boolean = false

    private _tempMat4: Mat4 = new Mat4()

    start() {
        if (this.jsonAsset) {
            this.parseJson(this.jsonAsset.json as Animation[])
            if (this.animationName) {
                this.loop(this.animationName)
            }
        }
    }

    parseJson(json: Animation[]) {
        this._animations.clear()
        for (const anim of json) {
            this._animations.set(anim.name, anim)
        }
    }

    private async prepareAnimation(anim: Animation) {
        const promises: Promise<void>[] = []

        for (const res of anim.resources) {
            if (!this._nodes.has(res.name)) {
                const node = new Node(res.name)
                // Add UITransform for sizing
                const uiTrans = node.addComponent(UITransform)
                uiTrans.setAnchorPoint(0, 1) // Flash default anchor is usually top-left

                // Add Sprite
                const sprite = node.addComponent(Sprite)
                sprite.sizeMode = Sprite.SizeMode.RAW
                sprite.trim = false

                // Add UISkew component explicitly for True Skew support
                if (!node.getComponent(UISkew)) {
                    node.addComponent(UISkew)
                }

                node.parent = this.node
                this._nodes.set(res.name, node)
            }

            for (const frame of res.data) {
                if (frame && frame.image && !this._loadedSpriteFrames.has(frame.image)) {
                    promises.push(this.loadSpriteFrame(frame.image))
                }
            }
        }

        await Promise.all(promises)
    }

    private reparentAnimationNodes(anim: Animation, parent: Node) {
        const sortedResources = anim.resources.slice().sort((a, b) => a.z - b.z)
        for (let i = 0; i < sortedResources.length; i++) {
            const res = sortedResources[i]
            const node = this._nodes.get(res.name)
            if (!node) continue
            if (node === parent) continue
            if (node.parent !== parent) {
                node.parent = parent
            }
            node.setSiblingIndex(i)
        }
    }

    private findParentNodeForAnim(anim: Animation): Node | null {
        if (!anim.parent) return null
        return this._nodes.get(anim.parent) ?? null
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
        if (!frame2) return frame1

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

    public play(name: string, speed: number = 1, onFinish?: () => void) {
        const chain = new AnimationChain(this)
        chain.play(name, speed, onFinish)
        return chain
    }

    public loop(name: string, speed: number = 1, duration: number = 0, onFinish?: () => void) {
        const chain = new AnimationChain(this)
        chain.loop(name, speed, duration, onFinish)
        return chain
    }

    public async _executeAnim(
        name: string,
        loop: boolean,
        speed: number,
        onFinish?: () => void,
        duration: number = 0,
    ) {
        const anim = this._animations.get(name)

        if (!anim) {
            console.warn(`[Reanimator] Animation ${name} not found`)
            if (onFinish) onFinish()
            return
        }

        const existingState = this._activeStates.find((s) => s.anim.name === name)
        if (existingState) {
            existingState.loop = loop
            existingState.speed = speed
            existingState.duration = duration
            existingState.elapsedTotal = 0
            const oldFinish = existingState.onFinish
            existingState.onFinish = () => {
                if (oldFinish) oldFinish()
                if (onFinish) onFinish()
            }
            return
        }

        await this.prepareAnimation(anim)

        const conflictIndex = this._activeStates.findIndex((s) => {
            if (anim.parent === null) return s.anim.parent === null
            return s.anim.parent === anim.parent
        })

        if (conflictIndex !== -1) {
            this._activeStates.splice(conflictIndex, 1)
        }

        const parentNode = this.findParentNodeForAnim(anim)
        const hasActive = this._activeStates.length > 0
        const canAttachAsChild = !!parentNode && hasActive

        let bindInverseMatrix: Mat4 | null = null
        if (canAttachAsChild) {
            const parentState = this._activeStates.find((s) =>
                s.anim.resources.some((r) => r.name === anim.parent),
            )

            if (parentState) {
                const parentRes = parentState.anim.resources.find((r) => r.name === anim.parent)
                const parentFrame0 = parentRes?.data[0]
                if (parentFrame0) {
                    const mat = new Mat4()
                    this.calculateFrameMatrix(parentFrame0, mat)
                    bindInverseMatrix = mat.invert()
                }
            }
        }

        const newState: AnimState = {
            anim,
            time: 0,
            parentResourceName: anim.parent,
            bindInverseMatrix,
            loop,
            speed,
            duration,
            elapsedTotal: 0,
            onFinish,
        }

        this._activeStates.push(newState)
        this._isPlaying = true

        if (canAttachAsChild) {
            this.reparentAnimationNodes(anim, parentNode!)
        } else {
            this.reparentAnimationNodes(anim, this.node)
        }
    }

    async loadSpriteFrame(name: string) {
        if (this._loadedSpriteFrames.has(name)) return
        return new Promise<void>((resolve) => {
            resources.load(`textures/${name}/spriteFrame`, SpriteFrame, (err, spriteFrame) => {
                if (!err) {
                    this._loadedSpriteFrames.set(name, spriteFrame!)
                    resolve()
                    return
                }

                resources.load(`textures/${name}`, SpriteFrame, (err2, spriteFrame2) => {
                    if (!err2) this._loadedSpriteFrames.set(name, spriteFrame2!)
                    resolve()
                })
            })
        })
    }

    update(dt: number) {
        if (!this._isPlaying || this._activeStates.length === 0) return

        const states = this._activeStates
        const nextActiveStates: AnimState[] = []
        const touchedNodes = new Set<Node>()

        for (const state of states) {
            state.time += dt * state.anim.fps * state.speed
            state.elapsedTotal += dt * 1000
            const maxTime = state.anim.frames
            let isFinished = false

            if (state.loop && state.duration > 0 && state.elapsedTotal >= state.duration) {
                isFinished = true
                if (state.onFinish) {
                    state.onFinish()
                }
            } else if (state.time >= maxTime) {
                if (state.loop) {
                    state.time %= maxTime
                } else {
                    state.time = maxTime - 0.0001
                    isFinished = true
                    if (state.onFinish) {
                        state.onFinish()
                    }
                    const otherAnim = this._activeStates.find(
                        (s) => s !== state && s.parentResourceName === state.parentResourceName,
                    )
                    if (otherAnim) {
                        otherAnim.time = 0
                    }
                }
            }

            if (!isFinished) {
                nextActiveStates.push(state)
            }

            const frameIndex = Math.floor(state.time)
            const nextFrameIndex = frameIndex + 1
            const ratio = state.time - frameIndex

            for (const res of state.anim.resources) {
                const node = this._nodes.get(res.name)
                if (!node) continue

                const sprite = node.getComponent(Sprite)
                let uiSkew = node.getComponent(UISkew)
                if (!uiSkew) uiSkew = node.addComponent(UISkew)
                if (!sprite) continue

                const leftFrame = res.data[frameIndex % res.data.length]
                let rightFrame: AnimFrame | null
                if (!state.loop && nextFrameIndex >= res.data.length) {
                    rightFrame = leftFrame
                } else {
                    rightFrame = res.data[nextFrameIndex % res.data.length]
                }

                if (!leftFrame || !rightFrame) {
                    sprite.enabled = false
                    touchedNodes.add(node)
                    continue
                }

                sprite.enabled = true
                touchedNodes.add(node)
                let f = this.interpolateFrameData(leftFrame, rightFrame, ratio)

                if (state.bindInverseMatrix) {
                    if (f === leftFrame) {
                        f = { ...f }
                    }
                    this.calculateFrameMatrix(f, this._tempMat4)
                    Mat4.multiply(this._tempMat4, state.bindInverseMatrix, this._tempMat4)

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

                node.setPosition(f.x, -f.y, 0)
                node.angle = -f.kx
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

                const alphaVal = f.alpha
                if (sprite.color.a !== alphaVal * 255) {
                    sprite.color = new Color(255, 255, 255, alphaVal * 255)
                }

                if (f.image && sprite.spriteFrame?.name !== f.image) {
                    const sf = this._loadedSpriteFrames.get(f.image)
                    if (sf) sprite.spriteFrame = sf
                }
            }
        }
        this._activeStates = nextActiveStates

        for (const node of this._nodes.values()) {
            if (!touchedNodes.has(node)) {
                const sprite = node.getComponent(Sprite)
                if (sprite) sprite.enabled = false
            }
        }
    }
}
