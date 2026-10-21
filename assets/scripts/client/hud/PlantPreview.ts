import { _decorator, Color, Component, isValid, Node, Sprite } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { loadDisplayParts, loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

const { ccclass } = _decorator
export type PreviewPlantId = 'pvz:peashooter' | 'pvz:sunflower' | 'pvz:repeater' | number
let content: ReturnType<typeof loadIntegratedGameContent> | undefined

/** Static plant rendering shared by seed packets and placement previews. */
@ccclass('PlantPreview')
export class PlantPreview extends Component {
    private cached!: Node
    private plantId?: PreviewPlantId
    private placement!: { x: number, y: number, scale: number }
    private rendered: Node | null = null
    private ready = false
    private rendering: boolean | undefined
    private color = Color.WHITE.clone()
    private readonly players: ReanimPlayer[] = []

    static supports(plantId: string): plantId is Exclude<PreviewPlantId, number> {
        return plantId === 'pvz:peashooter' || plantId === 'pvz:sunflower' || plantId === 'pvz:repeater'
    }

    initialize(plantId: PreviewPlantId | undefined, cached: Node, placement: { x: number, y: number, scale: number }): void {
        this.plantId = plantId
        this.cached = cached
        this.placement = placement
        this.refresh()
    }

    setPlant(plantId: PreviewPlantId | undefined): void {
        if (this.plantId === plantId) return
        this.plantId = plantId
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        this.rendered = null
        this.ready = false
        this.players.length = 0
        this.rendering = undefined
        this.refresh()
    }

    setColor(color: Color): void {
        if (this.color.equals(color)) return
        this.color = color.clone()
        for (const sprite of this.cached.getComponentsInChildren(Sprite)) sprite.color = color.clone()
        for (const player of this.players) player.setColorOverride(color)
    }

    protected update(): void { this.refresh() }

    private refresh(): void {
        const enabled = GameDebugSettings.hdSeedPacketsEnabled && this.plantId !== undefined
        if (this.rendering === enabled) return
        this.rendering = enabled
        this.cached.active = !enabled
        if (this.rendered) this.rendered.active = enabled && this.ready
        else if (enabled && this.plantId !== undefined) {
            const root = uiNode({
                name: 'RenderedPlant', parent: this.node, active: false,
                position: { x: this.placement.x, y: this.placement.y },
            }).node
            this.rendered = root
            root.setScale(this.placement.scale, this.placement.scale, 1)
            void this.load(root, this.plantId).catch(error => {
                if (isValid(root, true) && root === this.rendered) console.error('[PlantPreview] Failed to render plant', error)
            })
        }
    }

    private async load(root: Node, plantId: PreviewPlantId): Promise<void> {
        if (typeof plantId === 'number') {
            const { content, catalog } = await loadEntityDisplayAssets()
            if (!isValid(root, true) || root !== this.rendered) return
            const definition = catalog.plants[plantId]
            if (!definition) throw new Error(`Plant display is not installed: ${plantId}`)
            const [x, y] = definition.packetOffset ?? [0, 0]
            const pose = uiNode({ name: 'Pose', parent: root, position: { x, y: -y } }).node
            const scale = definition.packetScale ?? 1
            pose.setScale(scale, scale, 1)
            const parts = definition.parts.filter(part => !part.blink).map(part => ({ ...part, id: part.packetId ?? part.id }))
            const players = await loadDisplayParts(pose, parts, content)
            if (!players || root !== this.rendered) return
            this.showPose(root, [...players.values()])
            return
        }
        const assets = await (content ??= loadIntegratedGameContent().catch(error => {
            content = undefined
            throw error
        }))
        if (!isValid(root, true) || root !== this.rendered) return
        const animation = assets.animations.resolve(plantId)
        const body = uiNode({ name: 'Body', parent: root, position: animation.body }).node.addComponent(ReanimPlayer)
        const head = 'idleHead' in animation
            ? uiNode({ name: 'Head', parent: root, position: animation.idleHead }).node.addComponent(ReanimPlayer)
            : null
        await Promise.all([
            body.load(animation.body.reanimId, assets.registry, assets.loader),
            ...(head && 'idleHead' in animation ? [head.load(animation.idleHead.reanimId, assets.registry, assets.loader)] : []),
        ])
        if (!isValid(root, true) || root !== this.rendered) return
        if (head && 'idleHead' in animation) head.attachToTrack(body, animation.idleHead.attachmentTrackId ?? 'anim_stem')
        // The original Sunflower packet uses the idle pose at 15 percent; shooters use the first frame.
        body.seek(plantId === 'pvz:sunflower' ? body.lastFrameTimeSeconds * 0.15 : 0)
        this.showPose(root, [body, ...(head ? [head] : [])])
    }

    private showPose(root: Node, players: ReanimPlayer[]): void {
        this.players.push(...players)
        for (const player of this.players) player.setColorOverride(this.color)
        this.ready = true
        root.active = GameDebugSettings.hdSeedPacketsEnabled
    }
}
