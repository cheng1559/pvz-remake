import type { PresentationDefinitions } from '@/shared/content/presentation'
import { _decorator, Color, Component, isValid, Node, Sprite } from 'cc'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { plantVisual } from '@/client/plants/definitions'
import { createOffBoardPlant } from '@/client/view/offBoard'
import { uiNode } from '@/client/view/uiNode'
import { bakeSprite } from '@/client/view/bakeSprite'
import { KernelBatch } from '@/client/render/KernelBatch'
import { PLANT_WIDTH } from '@/shared/content/teams'
import { mirrorInPacket, PacketPictureStyle, PLANT_TILT, placePacketPicture } from './packetPicture'

const { ccclass } = _decorator
export type PreviewPlantId = string | number

/**
 * A plant held still, by its view, for seed packets and placement previews. A seed type with no plant behind it (a
 * number), or a plant its view does not draw off the board, shows nothing.
 */
@ccclass('PlantPreview')
export class PlantPreview extends Component {
    ready: Promise<void> = Promise.resolve()
    private definitions!: PresentationDefinitions
    private plantId?: PreviewPlantId
    private placement!: { x: number, y: number, scale: number }
    private packetScale?: number
    private picture!: PacketPictureStyle
    private rendered: Node | null = null
    private rendering: boolean | undefined
    private color = Color.WHITE.clone()
    private readonly players: ReanimPlayer[] = []
    private composite?: Sprite
    private compositeReady?: Promise<void>
    private loaded = false
    /** Facing left, for a plant on the zombies' side; the node's own position before it flipped. */
    private mirrored = false
    private unmirroredX?: number

    initialize(definitions: PresentationDefinitions, plantId: PreviewPlantId | undefined, placement: { x: number, y: number, scale: number }, packetScale?: number): void {
        this.definitions = definitions
        this.plantId = plantId
        this.placement = placement
        this.packetScale = packetScale
        this.picture ??= new PacketPictureStyle(this.node, 'right')
        this.refresh()
    }

    setPlant(plantId: PreviewPlantId | undefined): void {
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
        const drawn = typeof this.plantId === 'string' && !!plantVisual(this.definitions, this.plantId)
        if (this.rendering === drawn) {
            if (drawn) this.applyPlacement()
            return
        }
        this.rendering = drawn
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        this.rendered = null
        this.players.length = 0
        this.composite = undefined
        this.compositeReady = undefined
        this.loaded = false
        this.ready = Promise.resolve()
        if (!drawn) return
        const root = uiNode({ name: 'RenderedPlant', parent: this.node, active: false }).node
        this.rendered = root
        this.applyPlacement()
        this.ready = this.load(root, this.plantId as string).then(() => {
            if (!isValid(root, true) || root !== this.rendered) return
            this.loaded = true
            return this.finish(root)
        })
        void this.ready.catch(error => {
            if (isValid(root, true) && root === this.rendered) console.error('[PlantPreview] Failed to load plant preview', error)
        })
    }

    private async finish(root: Node): Promise<void> {
        // A batch draws several images; translucent overlapping images need compositing.
        for (const player of this.players) player.flushPose()
        const images = root.getComponentsInChildren(Sprite).reduce((count, sprite) => count + (sprite instanceof KernelBatch ? sprite.count : 1), 0)
        if (this.color.a < 255 && !this.composite && images > 1) {
            if (!this.compositeReady) {
                root.active = false
                const parts = [...root.children]
                for (const player of this.players) player.setColorOverride(Color.WHITE)
                this.compositeReady = bakeSprite(root).then(composite => {
                    if (!isValid(root, true) || root !== this.rendered) return
                    this.composite = composite
                    for (const part of parts) part.destroy()
                    this.players.length = 0
                })
            }
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
        const players = plant.view.players
        for (const player of players) {
            player.pause()
            // A packet's picture is much smaller than its art.
            if (this.packetScale !== undefined) player.setSupersampled()
        }
        this.players.push(...players)
    }

    private applyColor(): void {
        const tint = typeof this.plantId === 'string' ? plantVisual(this.definitions, this.plantId)?.tint : undefined
        const color = tint
            ? new Color(Math.round(this.color.r * tint[0] / 255), Math.round(this.color.g * tint[1] / 255), Math.round(this.color.b * tint[2] / 255), this.color.a)
            : this.color
        if (this.composite) { this.composite.color = color; return }
        for (const player of this.players) player.setColorOverride(color)
    }
}
