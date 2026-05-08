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
    toRadian,
} from 'cc'
import type { AnimNodeData, TrackFrameData } from './Animator.d'
import { AnimNode } from './AnimNode'
import { SpriteLoader } from '../SpriteLoader'

const { ccclass, property } = _decorator
let additiveSpriteMaterial: Material | null = null

@ccclass('Animator')
export class Animator extends Component {
    public static timeScale = 1

    private _nodeDataMap: Record<string, AnimNodeData> = {}
    private _animNodes: AnimNode[] = []
    private _trackNodes: Map<string, Node> = new Map()
    private _additiveTrackNodes: Map<string, Node> = new Map()
    private _trackZ: Map<string, number> = new Map()
    private _hiddenTracks: Set<string> = new Set()
    private _externalNodes: Set<string> = new Set()
    private _trackColors: Map<string, Color> = new Map()
    private _trackImageOverrides: Map<string, string> = new Map()
    private _enableExtraAdditiveDraw = false
    private _extraAdditiveColor = new Color(255, 255, 255, 196)

    // ── Initialization ─────────────────────────────────────────

    async parseJson(json: Record<string, AnimNodeData>) {
        this._nodeDataMap = json
        this._animNodes = []
        this._trackNodes.clear()
        this._additiveTrackNodes.clear()
        this._trackZ.clear()

        await this._preloadImages(json)
    }

    // ── Public API ─────────────────────────────────────────────

    public addAnimNode(name: string): AnimNode | null {
        const data = this._nodeDataMap[name]
        if (!data) {
            warn(`[Animator] AnimNode data '${name}' not found`)
            return null
        }
        const node = new AnimNode(data)
        this._animNodes.push(node)
        return node
    }

    public stopAnimNode(animNode: AnimNode | null) {
        if (!animNode) return

        const trackNames = animNode.computedFrames.map((frame) => frame.trackName)
        animNode.stop()
        for (const trackName of trackNames) {
            const sprite = this._trackNodes.get(trackName)?.getComponent(Sprite)
            if (sprite) sprite.enabled = false

            const additiveSprite = this._additiveTrackNodes.get(trackName)?.getComponent(Sprite)
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
        this._trackZ.set(name, zIndex)
        this._externalNodes.add(name)
    }

    public getTrackFrame(trackName: string): TrackFrameData | null {
        for (let i = this._animNodes.length - 1; i >= 0; i--) {
            for (const cf of this._animNodes[i].computedFrames) {
                if (cf.trackName === trackName) return cf.frame
            }
        }
        return null
    }

    public setTrackColor(name: string, color: Color) {
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

    public setExtraAdditiveDraw(enabled: boolean, color: Color = new Color(255, 255, 255, 196)) {
        this._enableExtraAdditiveDraw = enabled
        this._extraAdditiveColor = color.clone()
        if (!enabled) {
            this._additiveTrackNodes.forEach((node) => {
                const sprite = node.getComponent(Sprite)
                if (sprite) sprite.enabled = false
            })
        }
    }

    // ── Update Loop ────────────────────────────────────────────

    protected update(dt: number) {
        const scaledDt = dt * Animator.timeScale

        // 1. Update all AnimNodes (compute frames)
        for (const animNode of this._animNodes) {
            animNode.update(scaledDt)
        }

        // 2. Collect computed frames, later nodes override earlier ones per track
        const frameMap = new Map<string, { zIndex: number; frame: TrackFrameData }>()
        for (const animNode of this._animNodes) {
            for (const cf of animNode.computedFrames) {
                frameMap.set(cf.trackName, { zIndex: cf.zIndex, frame: cf.frame })
            }
        }

        // 3. Apply frames to scene nodes (skip hidden tracks)
        const touched = new Set<string>()
        frameMap.forEach((value, trackName) => {
            touched.add(trackName)
            if (this._hiddenTracks.has(trackName)) return
            const targetNode = this._getOrCreateTrackNode(trackName, value.zIndex)
            this._applyFrameToNode(targetNode, value.frame, trackName)
            if (this._enableExtraAdditiveDraw) {
                const additiveNode = this._getOrCreateAdditiveTrackNode(trackName)
                this._applyFrameToNode(additiveNode, value.frame, undefined, this._extraAdditiveColor)
            }
        })

        // 4. Hide untouched / hidden track nodes
        this._trackNodes.forEach((n, name) => {
            if (this._externalNodes.has(name)) return
            if (!touched.has(name) || this._hiddenTracks.has(name)) {
                const sp = n.getComponent(Sprite)
                if (sp) sp.enabled = false
            }
        })
        this._additiveTrackNodes.forEach((n, name) => {
            if (!this._enableExtraAdditiveDraw || !touched.has(name) || this._hiddenTracks.has(name)) {
                const sp = n.getComponent(Sprite)
                if (sp) sp.enabled = false
            }
        })

        // 5. Sort sibling order by z-index
        const sorted: [string, Node][] = []
        this._trackNodes.forEach((node, name) => sorted.push([name, node]))
        sorted.sort((a, b) => {
            const za = this._trackZ.get(a[0]) ?? 0
            const zb = this._trackZ.get(b[0]) ?? 0
            return za - zb
        })
        let siblingIndex = 0
        for (let i = 0; i < sorted.length; i++) {
            const [trackName, node] = sorted[i]
            node.setSiblingIndex(siblingIndex++)
            const additiveNode = this._additiveTrackNodes.get(trackName)
            const additiveSprite = additiveNode?.getComponent(Sprite)
            if (additiveNode?.isValid && additiveSprite?.enabled) {
                additiveNode.setSiblingIndex(siblingIndex++)
            }
        }
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

            node.addComponent(UISkew)

            this._trackNodes.set(name, node)
        }

        this._trackZ.set(name, z)
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

            node.addComponent(UISkew)

            this._additiveTrackNodes.set(name, node)
        }

        return node
    }

    // ── Frame Rendering ────────────────────────────────────────

    private _applyFrameToNode(node: Node, f: TrackFrameData, trackName?: string, colorOverride?: Color) {
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

        const sprite = node.getComponent(Sprite)
        if (sprite) {
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
        const trackNames = new Set<string>()
        for (const nodeData of Object.values(this._nodeDataMap)) {
            for (const trackName of Object.keys(nodeData.tracks)) {
                trackNames.add(trackName)
            }
        }
        return trackNames
    }
}
