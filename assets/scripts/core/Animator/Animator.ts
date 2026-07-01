import {
    _decorator,
    Component,
    Node,
    JsonAsset,
    Sprite,
    Color,
    gfx,
    log,
    Material,
    warn,
    SpriteFrame,
    UITransform,
    UISkew,
    Vec3,
    toRadian,
} from 'cc'
import type { AnimNodeData, TrackFrameData } from './Animator.d'
import { AnimNode } from './AnimNode'
import { SpriteLoader } from '../SpriteLoader'
import { scaleGameDeltaTime } from '@/game/GameDefinitions'

const { ccclass, property } = _decorator
let additiveSpriteMaterial: Material | null = null
const DEFAULT_ADDITIVE_COLOR = new Color(255, 255, 255, 196)

interface FrameMapValue {
    zIndex: number
    frame: TrackFrameData
}

@ccclass('Animator')
export class Animator extends Component {
    public static timeScale = 1

    private _nodeDataMap: Record<string, AnimNodeData> = {}
    private _animNodes: AnimNode[] = []
    private _trackNodes: Map<string, Node> = new Map()
    private _additiveTrackNodes: Map<string, Node> = new Map()
    private _trackSprites: Map<string, Sprite> = new Map()
    private _additiveTrackSprites: Map<string, Sprite> = new Map()
    private _trackSkews: Map<string, UISkew> = new Map()
    private _additiveTrackSkews: Map<string, UISkew> = new Map()
    private _trackZ: Map<string, number> = new Map()
    private _hiddenTracks: Set<string> = new Set()
    private _externalNodes: Set<string> = new Set()
    private _trackColors: Map<string, Color> = new Map()
    private _trackImageOverrides: Map<string, string> = new Map()
    private _enableExtraAdditiveDraw = false
    private _extraAdditiveColor = DEFAULT_ADDITIVE_COLOR.clone()
    private _frameMap: Map<string, FrameMapValue> = new Map()
    private _frameValuePool: Map<string, FrameMapValue> = new Map()
    private _touchedTracks: Set<string> = new Set()
    private _sortedTracks: [string, Node][] = []
    private _trackNameCache: string[] | null = null
    private _sortDirty = true
    private _applyingPose = false

    // ── Initialization ─────────────────────────────────────────

    async parseJson(json: Record<string, AnimNodeData>) {
        this._nodeDataMap = json
        this._animNodes = []
        this._trackNodes.clear()
        this._additiveTrackNodes.clear()
        this._trackSprites.clear()
        this._additiveTrackSprites.clear()
        this._trackSkews.clear()
        this._additiveTrackSkews.clear()
        this._trackZ.clear()
        this._frameMap.clear()
        this._frameValuePool.clear()
        this._touchedTracks.clear()
        this._sortedTracks.length = 0
        this._trackNameCache = null
        this._sortDirty = true

        await this._preloadImages(json)
    }

    // ── Public API ─────────────────────────────────────────────

    public addAnimNode(name: string): AnimNode | null {
        const data = this._nodeDataMap[name]
        if (!data) {
            warn(`[Animator] AnimNode data '${name}' not found`)
            return null
        }
        const node = new AnimNode(data, () => this._applyCurrentPose())
        this._animNodes.push(node)
        return node
    }

    public stopAnimNode(animNode: AnimNode | null) {
        if (!animNode) return

        const trackNames = animNode.computedFrames.map((frame) => frame.trackName)
        animNode.stop()
        for (const trackName of trackNames) {
            const sprite = this._trackSprites.get(trackName)
            if (sprite) sprite.enabled = false

            const additiveSprite = this._additiveTrackSprites.get(trackName)
            if (additiveSprite) additiveSprite.enabled = false
        }
    }

    public hideTrack(name: string) {
        this._hiddenTracks.add(name)
    }

    public showTrack(name: string) {
        this._hiddenTracks.delete(name)
    }

    public hidePrefix(prefix: string) {
        for (const trackName of this._getTrackNames()) {
            if (trackName.startsWith(prefix)) this.hideTrack(trackName)
        }
    }

    public showPrefix(prefix: string) {
        for (const trackName of this._getTrackNames()) {
            if (trackName.startsWith(prefix)) this.showTrack(trackName)
        }
    }

    public isTrackHidden(name: string): boolean {
        return this._hiddenTracks.has(name)
    }

    public insertExternalNode(name: string, node: Node, zIndex: number) {
        node.parent = this.node
        this._trackNodes.set(name, node)
        if (this._trackZ.get(name) !== zIndex) {
            this._trackZ.set(name, zIndex)
            this._sortDirty = true
        }
        this._externalNodes.add(name)
        this._sortDirty = true
    }

    public getTrackFrame(trackName: string): TrackFrameData | null {
        for (let i = this._animNodes.length - 1; i >= 0; i--) {
            for (const cf of this._animNodes[i].computedFrames) {
                if (cf.trackName === trackName) return cf.frame
            }
        }
        return null
    }

    /**
     * Returns the transformed center of the track image. This matches the
     * original Reanimation::GetTrackMatrix position semantics.
     */
    public getTrackWorldPosition(trackName: string): Vec3 | null {
        const node = this._trackNodes.get(trackName)
        const spriteFrame = node?.getComponent(Sprite)?.spriteFrame
        const transform = node?.getComponent(UITransform)
        if (!node?.isValid || !spriteFrame || !transform) return null

        const size = spriteFrame.originalSize
        return transform.convertToWorldSpaceAR(new Vec3(size.width * 0.5, -size.height * 0.5, 0))
    }

    public setTrackColor(name: string, color: Color) {
        const current = this._trackColors.get(name)
        if (
            current &&
            current.r === color.r &&
            current.g === color.g &&
            current.b === color.b &&
            current.a === color.a
        ) {
            return
        }
        this._trackColors.set(name, color.clone())
    }

    public getTrackColor(name: string): Color {
        return this._trackColors.get(name) ?? Color.WHITE
    }

    public setTrackImageOverride(name: string, image: string | null) {
        if (image) {
            this._trackImageOverrides.set(name, image)
        } else {
            this._trackImageOverrides.delete(name)
        }
    }

    public setExtraAdditiveDraw(enabled: boolean, color: Color = DEFAULT_ADDITIVE_COLOR) {
        const wasEnabled = this._enableExtraAdditiveDraw
        if (
            wasEnabled === enabled &&
            this._extraAdditiveColor.r === color.r &&
            this._extraAdditiveColor.g === color.g &&
            this._extraAdditiveColor.b === color.b &&
            this._extraAdditiveColor.a === color.a
        ) {
            return
        }
        this._enableExtraAdditiveDraw = enabled
        this._extraAdditiveColor = color.clone()
        if (wasEnabled !== enabled) this._sortDirty = true
        if (!enabled) {
            this._additiveTrackSprites.forEach((sprite) => {
                sprite.enabled = false
            })
        }
    }

    // ── Update Loop ────────────────────────────────────────────

    protected update(dt: number) {
        this._applyingPose = true
        try {
            const scaledDt = scaleGameDeltaTime(dt) * Animator.timeScale

            // 1. Update all AnimNodes (compute frames)
            for (const animNode of this._animNodes) {
                animNode.update(scaledDt)
            }

            // 2. Apply frames to scene nodes (skip hidden tracks)
            const touched = this._touchedTracks
            touched.clear()
            if (this._animNodes.length === 1) {
                for (const cf of this._animNodes[0].computedFrames) {
                    this._applyComputedFrame(cf.trackName, cf.zIndex, cf.frame, touched)
                }
            } else {
                this._frameMap.clear()
                for (const animNode of this._animNodes) {
                    for (const cf of animNode.computedFrames) {
                        let value = this._frameValuePool.get(cf.trackName)
                        if (!value) {
                            value = { zIndex: cf.zIndex, frame: cf.frame }
                            this._frameValuePool.set(cf.trackName, value)
                        } else {
                            value.zIndex = cf.zIndex
                            value.frame = cf.frame
                        }
                        this._frameMap.set(cf.trackName, value)
                    }
                }
                this._frameMap.forEach((value, trackName) => {
                    this._applyComputedFrame(trackName, value.zIndex, value.frame, touched)
                })
            }

            // 3. Hide untouched / hidden track nodes
            this._trackNodes.forEach((n, name) => {
                if (this._externalNodes.has(name)) return
                if (!touched.has(name) || this._hiddenTracks.has(name)) {
                    const sp = this._trackSprites.get(name)
                    if (sp) sp.enabled = false
                }
            })
            this._additiveTrackNodes.forEach((_n, name) => {
                if (!this._enableExtraAdditiveDraw || !touched.has(name) || this._hiddenTracks.has(name)) {
                    const sp = this._additiveTrackSprites.get(name)
                    if (sp) sp.enabled = false
                }
            })

            // 4. Sort sibling order by z-index
            if (this._sortDirty) {
                this._sortedTracks.length = 0
                this._trackNodes.forEach((node, name) => this._sortedTracks.push([name, node]))
                this._sortedTracks.sort((a, b) => {
                    const za = this._trackZ.get(a[0]) ?? 0
                    const zb = this._trackZ.get(b[0]) ?? 0
                    return za - zb
                })
                this._sortDirty = false
            }
            let siblingIndex = 0
            for (let i = 0; i < this._sortedTracks.length; i++) {
                const [trackName, node] = this._sortedTracks[i]
                if (node.getSiblingIndex() !== siblingIndex) node.setSiblingIndex(siblingIndex)
                siblingIndex++
                const additiveNode = this._additiveTrackNodes.get(trackName)
                const additiveSprite = this._additiveTrackSprites.get(trackName)
                if (additiveNode?.isValid && additiveSprite?.enabled) {
                    if (additiveNode.getSiblingIndex() !== siblingIndex) additiveNode.setSiblingIndex(siblingIndex)
                    siblingIndex++
                }
            }
        } finally {
            this._applyingPose = false
        }
    }

    private _applyCurrentPose() {
        if (this._applyingPose) return
        this.update(0)
    }

    // ── Track Node Management ──────────────────────────────────

    private _getOrCreateTrackNode(name: string, z: number): Node {
        let node = this._trackNodes.get(name)
        if (!node) {
            node = new Node(name)
            node.layer = this.node.layer
            node.parent = this.node

            const trans = node.addComponent(UITransform)
            trans.setAnchorPoint(0, 1)

            const sprite = node.addComponent(Sprite)
            sprite.sizeMode = Sprite.SizeMode.RAW
            sprite.trim = false
            sprite.enabled = false

            const skew = node.addComponent(UISkew)

            this._trackNodes.set(name, node)
            this._trackSprites.set(name, sprite)
            this._trackSkews.set(name, skew)
            this._sortDirty = true
        }

        if (this._trackZ.get(name) !== z) {
            this._trackZ.set(name, z)
            this._sortDirty = true
        }
        return node
    }

    private _getOrCreateAdditiveTrackNode(name: string): Node {
        let node = this._additiveTrackNodes.get(name)
        if (!node) {
            node = new Node(`${name}_extra_additive`)
            node.layer = this.node.layer
            node.parent = this.node

            const trans = node.addComponent(UITransform)
            trans.setAnchorPoint(0, 1)

            const sprite = node.addComponent(Sprite)
            sprite.sizeMode = Sprite.SizeMode.RAW
            sprite.trim = false
            sprite.enabled = false
            sprite.customMaterial = Animator._getAdditiveSpriteMaterial()

            const skew = node.addComponent(UISkew)

            this._additiveTrackNodes.set(name, node)
            this._additiveTrackSprites.set(name, sprite)
            this._additiveTrackSkews.set(name, skew)
            this._sortDirty = true
        }

        return node
    }

    // ── Frame Rendering ────────────────────────────────────────

    private _applyComputedFrame(
        trackName: string,
        zIndex: number,
        frame: TrackFrameData,
        touched: Set<string>,
    ) {
        touched.add(trackName)
        if (this._hiddenTracks.has(trackName)) return

        const targetNode = this._getOrCreateTrackNode(trackName, zIndex)
        const sprite = this._trackSprites.get(trackName)
        const skew = this._trackSkews.get(trackName)
        if (sprite && skew) this._applyFrameToNode(targetNode, sprite, skew, frame, trackName)

        if (this._enableExtraAdditiveDraw) {
            const additiveNode = this._getOrCreateAdditiveTrackNode(trackName)
            const additiveSprite = this._additiveTrackSprites.get(trackName)
            const additiveSkew = this._additiveTrackSkews.get(trackName)
            if (additiveSprite && additiveSkew) {
                this._applyFrameToNode(
                    additiveNode,
                    additiveSprite,
                    additiveSkew,
                    frame,
                    trackName,
                    this._extraAdditiveColor,
                )
            }
        }
    }

    private _applyFrameToNode(
        node: Node,
        sprite: Sprite,
        uiSkew: UISkew,
        f: TrackFrameData,
        trackName?: string,
        colorOverride?: Color,
    ) {
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

        sprite.enabled = true

        // Combine track color with frame alpha.
        const trackColor = colorOverride ?? (trackName ? this._trackColors.get(trackName) : undefined)
        const alphaVal = Math.round(f.alpha * 255)
        if (trackColor) {
            const finalR = Math.round(trackColor.r)
            const finalG = Math.round(trackColor.g)
            const finalB = Math.round(trackColor.b)
            const finalA = Math.round(trackColor.a * f.alpha)
            const c = sprite.color
            if (c.r !== finalR || c.g !== finalG || c.b !== finalB || c.a !== finalA) {
                sprite.color = new Color(finalR, finalG, finalB, finalA)
            }
        } else {
            if (
                sprite.color.r !== 255 ||
                sprite.color.g !== 255 ||
                sprite.color.b !== 255 ||
                sprite.color.a !== alphaVal
            ) {
                sprite.color = new Color(255, 255, 255, alphaVal)
            }
        }

        const imageName = trackName ? this._trackImageOverrides.get(trackName) ?? f.image : f.image
        const normalizedImageName = Animator._normalizeImageName(imageName)
        if (
            normalizedImageName &&
            sprite.spriteFrame?.name !== normalizedImageName
        ) {
            const sf = SpriteLoader.get(normalizedImageName)
            if (sf) sprite.spriteFrame = sf
        }
    }

    private static _getAdditiveSpriteMaterial() {
        if (additiveSpriteMaterial) return additiveSpriteMaterial

        additiveSpriteMaterial = new Material()
        additiveSpriteMaterial.initialize({
            effectName: 'for2d/builtin-sprite',
            defines: {
                USE_TEXTURE: true,
            },
            states: {
                blendState: {
                    targets: [
                        {
                            blend: true,
                            blendSrc: gfx.BlendFactor.SRC_ALPHA,
                            blendDst: gfx.BlendFactor.ONE,
                            blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                            blendDstAlpha: gfx.BlendFactor.ONE,
                        },
                    ],
                },
            },
        })
        return additiveSpriteMaterial
    }

    // ── Image Preloading ───────────────────────────────────────

    private async _preloadImages(json: Record<string, AnimNodeData>) {
        const seenImages = new Set<string>()
        const promises: Promise<SpriteFrame | null>[] = []

        for (const name in json) {
            const nodeData = json[name]
            const tracks = nodeData.tracks
            for (const trackName in tracks) {
                const track = tracks[trackName]
                for (const frame of track.frames) {
                    const imageName = Animator._normalizeImageName(frame?.image)
                    if (imageName && !seenImages.has(imageName)) {
                        seenImages.add(imageName)
                        promises.push(SpriteLoader.load(imageName))
                    }
                }
            }
        }

        await Promise.all(promises)
    }

    private static _normalizeImageName(imageName: unknown): string | null {
        if (typeof imageName === 'string') return imageName.length > 0 ? imageName : null
        if (imageName instanceof String) {
            const value = imageName.valueOf()
            return value.length > 0 ? value : null
        }
        return null
    }

    async loadSpriteFrame(name: string) {
        return SpriteLoader.load(name)
    }

    private _getTrackNames() {
        if (this._trackNameCache) return this._trackNameCache

        const trackNames = new Set<string>()
        for (const nodeData of Object.values(this._nodeDataMap)) {
            for (const trackName of Object.keys(nodeData.tracks)) {
                trackNames.add(trackName)
            }
        }
        this._trackNameCache = [...trackNames]
        return this._trackNameCache
    }
}
