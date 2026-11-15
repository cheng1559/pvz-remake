import type { PresentationDefinitions } from '@/shared/content/presentation'
import { _decorator, Color, Component, isValid, Node, Sprite } from 'cc'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import type { PlantView } from '@/client/plants/PlantView'
import { plantVisual } from '@/client/plants/definitions'
import { createOffBoardPlant, holdStill } from '@/client/view/offBoard'
import { uiNode } from '@/client/view/uiNode'
import { flattenTranslucent } from '@/client/view/bakeSprite'
import { PLANT_WIDTH } from '@/shared/content/teams'
import { mirrorInPacket, PacketPictureStyle, PLANT_TILT, placePacketPicture } from './packetPicture'

const { ccclass } = _decorator

/**
 * A plant held still, by its view, for seed packets and placement previews. A seed with no plant behind it yet, or a
 * plant its view does not draw off the board, shows nothing.
 */
@ccclass('PlantPreview')
export class PlantPreview extends Component {
    ready: Promise<void> = Promise.resolve()
    private definitions!: PresentationDefinitions
    private plantId?: string
    private placement!: { x: number, y: number, scale: number }
    private packetScale?: number
    private picture!: PacketPictureStyle
    private rendered: Node | null = null
    private rendering: boolean | undefined
    private color = Color.WHITE.clone()
    /** The plant's view, which colors it (PlantView.tinted), and its players. */
    private view?: PlantView
    private readonly players: ReanimPlayer[] = []
    private composite?: Sprite
    private compositeReady?: Promise<void>
    private loaded = false
    /** Facing left, for a plant on the zombies' side; the node's own position before it flipped. */
    private mirrored = false
    private unmirroredX?: number

    initialize(definitions: PresentationDefinitions, plantId: string | undefined, placement: { x: number, y: number, scale: number }, packetScale?: number): void {
        this.definitions = definitions
        this.plantId = plantId
        this.placement = placement
        this.packetScale = packetScale
        this.picture ??= new PacketPictureStyle(this.node, 'right')
        this.refresh()
    }

    setPlant(plantId: string | undefined): void {
        if (this.plantId === plantId) return
        this.plantId = plantId
        this.rendering = undefined
        this.refresh()
    }

    /**
     * A plant on the zombies' side faces left. In a packet the picture turns round about the packet's middle
     * (mirrorInPacket); held or over its cell the preview's node flips across the plant (its placement and 80 width),
     * whichever way the plant is drawn under it.
     */
    setMirrored(mirrored: boolean): void {
        if (this.mirrored === mirrored) return
        this.mirrored = mirrored
        if (this.packetScale !== undefined) {
            mirrorInPacket(this.node, mirrored, this.packetScale)
            return
        }
        const { x, scale } = this.placement
        this.unmirroredX ??= this.node.position.x
        this.node.setScale(mirrored ? -1 : 1, this.node.scale.y, 1)
        this.node.setPosition(this.unmirroredX + (mirrored ? 2 * x + PLANT_WIDTH * scale : 0), this.node.position.y)
    }

    setColor(color: Color): void {
        if (this.color.equals(color)) return
        this.color = color.clone()
        if (this.loaded && this.rendered && !this.composite && (color.a < 255 || this.compositeReady)) {
            this.ready = this.finish(this.rendered)
            void this.ready.catch(error => console.error('[PlantPreview] Failed to composite plant preview', error))
            return
        }
        this.applyColor()
    }

    protected update(): void { this.refresh() }

    private refresh(): void {
        if (this.plantId === undefined) return
        // /tilted is a packet's; the held and grid previews are never tilted.
        if (!this.picture.sync(this.packetScale) && this.rendering !== undefined) return
        const drawn = !!plantVisual(this.definitions, this.plantId)
        if (this.rendering === drawn) {
            if (drawn) this.applyPlacement()
            return
        }
        this.rendering = drawn
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        this.rendered = null
        this.view = undefined
        this.players.length = 0
        this.composite = undefined
        this.compositeReady = undefined
        this.loaded = false
        this.ready = Promise.resolve()
        if (!drawn) return
        const root = uiNode({ name: 'RenderedPlant', parent: this.node, active: false }).node
        this.rendered = root
        this.applyPlacement()
        this.ready = this.load(root, this.plantId).then(() => {
            if (!isValid(root, true) || root !== this.rendered) return
            this.loaded = true
            return this.finish(root)
        })
        void this.ready.catch(error => {
            if (isValid(root, true) && root === this.rendered) console.error('[PlantPreview] Failed to load plant preview', error)
        })
    }

    private async finish(root: Node): Promise<void> {
        // A translucent plant is drawn whole first, once (flattenTranslucent).
        if (!this.composite && !this.compositeReady) {
            this.compositeReady = flattenTranslucent(root, this.players, this.color, () => root === this.rendered)?.then(composite => {
                if (!composite) return
                this.composite = composite
                this.players.length = 0
            })
        }
        if (this.compositeReady) await this.compositeReady
        if (!isValid(root, true) || root !== this.rendered) return
        this.applyColor()
        root.active = true
    }

    private applyPlacement(): void {
        placePacketPicture(this.rendered!, this.placement, this.packetScale, this.picture.tilted, PLANT_TILT)
    }

    private async load(root: Node, plantId: string): Promise<void> {
        // Plant::DrawSeedType: where and how big its packet has the plant, without its shadow, held on its pose.
        const packet = this.definitions.plants[plantId]?.packet
        const pose = uiNode({ name: 'Pose', parent: root, position: { x: packet?.x ?? 0, y: -(packet?.y ?? 0) } }).node
        const plant = await createOffBoardPlant(pose, plantId, { packet: true, draw: { position: { x: 0, y: 0 }, scale: packet?.scale ?? 1, shadow: false } })
        if (!isValid(root, true) || root !== this.rendered) return
        // A plant its view does not draw off the board (it has no animation) shows nothing.
        if (!plant) { pose.destroy(); return }
        // A packet's picture is much smaller than its art.
        holdStill(plant.view.players, this.packetScale !== undefined)
        this.view = plant.view
        this.players.push(...plant.view.players)
    }

    /** The preview's shade over the plant's own colors, as its view draws them. */
    private applyColor(): void {
        const color = this.view?.tinted(this.color) ?? this.color
        if (this.composite) { this.composite.color = color; return }
        for (const player of this.players) player.setColorOverride(color)
    }
}
