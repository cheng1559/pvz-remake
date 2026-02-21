import {
    _decorator,
    Component,
    Node,
    JsonAsset,
    Sprite,
    Color,
    log,
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

@ccclass('Animator')
export class Animator extends Component {
    private _nodeDataMap: Record<string, AnimNodeData> = {}
    private _animNodes: AnimNode[] = []
    private _trackNodes: Map<string, Node> = new Map()
    private _trackZ: Map<string, number> = new Map()
    private _hiddenTracks: Set<string> = new Set()
    private _externalNodes: Set<string> = new Set()
    private _trackColors: Map<string, Color> = new Map()

    // ── Initialization ─────────────────────────────────────────

    async parseJson(json: Record<string, AnimNodeData>) {
        this._nodeDataMap = json
        this._animNodes = []
        this._trackNodes.clear()
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

    public hideTrack(name: string) {
        this._hiddenTracks.add(name)
    }

    public showTrack(name: string) {
        this._hiddenTracks.delete(name)
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

    /** 获取指定 track 的当前帧数据（不受 hideTrack 影响） */
    public getTrackFrame(trackName: string): TrackFrameData | null {
        for (let i = this._animNodes.length - 1; i >= 0; i--) {
            for (const cf of this._animNodes[i].computedFrames) {
                if (cf.trackName === trackName) return cf.frame
            }
        }
        return null
    }

    /** 设置 track 的叠加颜色（与纹理像素相乘） */
    public setTrackColor(name: string, color: Color) {
        this._trackColors.set(name, color.clone())
    }

    /** 获取 track 的叠加颜色，未设置则返回白色 */
    public getTrackColor(name: string): Color {
        return this._trackColors.get(name) ?? Color.WHITE
    }

    // ── Update Loop ────────────────────────────────────────────

    protected update(dt: number) {
        // 1. Update all AnimNodes (compute frames)
        for (const animNode of this._animNodes) {
            animNode.update(dt)
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
        })

        // 4. Hide untouched / hidden track nodes
        this._trackNodes.forEach((n, name) => {
            if (this._externalNodes.has(name)) return
            if (!touched.has(name) || this._hiddenTracks.has(name)) {
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
        for (let i = 0; i < sorted.length; i++) {
            sorted[i][1].setSiblingIndex(i)
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

    // ── Frame Rendering ────────────────────────────────────────

    private _applyFrameToNode(node: Node, f: TrackFrameData, trackName?: string) {
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

            // 计算最终颜色：trackColor × frameAlpha
            const trackColor = trackName ? this._trackColors.get(trackName) : undefined
            const alphaVal = Math.round(f.alpha * 255)
            if (trackColor) {
                const finalR = Math.round(trackColor.r)
                const finalG = Math.round(trackColor.g)
                const finalB = Math.round(trackColor.b)
                const finalA = Math.round((trackColor.a * f.alpha) / 255)
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

            if (f.image && sprite.spriteFrame?.name !== f.image) {
                const sf = SpriteLoader.get(f.image)
                if (sf) sprite.spriteFrame = sf
            }
        }
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
                    if (frame && frame.image && !seenImages.has(frame.image)) {
                        seenImages.add(frame.image)
                        promises.push(SpriteLoader.load(frame.image))
                    }
                }
            }
        }

        await Promise.all(promises)
    }

    async loadSpriteFrame(name: string) {
        return SpriteLoader.load(name)
    }
}
