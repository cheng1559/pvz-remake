import type { PresentationDefinitions } from '@/shared/content/presentation'
import { _decorator, Color, Component, Graphics, isValid, Mask, Node, Sprite } from 'cc'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { plantVisual } from '@/client/plants/definitions'
import { loadDisplayParts, loadEntityDisplayAssets, resolveEntityDisplay } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { bakeSprite } from '@/client/view/bakeSprite'
import { KernelBatch } from '@/client/render/KernelBatch'
import { GameDebugSettings, type SeedPacketStyle } from '@/platform/debug/GameDebugSettings'

const { ccclass } = _decorator
export type PreviewPlantId = string | number

/** Static plant rendering shared by seed packets and placement previews. */
@ccclass('PlantPreview')
export class PlantPreview extends Component {
    ready: Promise<void> = Promise.resolve()
    private loadCached!: (root: Node, plantId: PreviewPlantId) => Promise<void>
    private definitions!: PresentationDefinitions
    private plantId?: PreviewPlantId
    private placement!: { x: number, y: number, scale: number }
    private packetScale?: number
    private style?: SeedPacketStyle
    private packetClip?: Mask
    private rendered: Node | null = null
    private rendering: boolean | undefined
    private color = Color.WHITE.clone()
    private readonly players: ReanimPlayer[] = []
    private readonly baseColors = new WeakMap<Sprite, Color>()
    private composite?: Sprite
    private compositeReady?: Promise<void>
    private loaded = false

    static supports(definitions: PresentationDefinitions, plantId: string): boolean {
        return !!plantVisual(definitions, plantId)
    }

    initialize(definitions: PresentationDefinitions, plantId: PreviewPlantId | undefined, loadCached: (root: Node, plantId: PreviewPlantId) => Promise<void>, placement: { x: number, y: number, scale: number }, packetScale?: number): void {
        this.definitions = definitions
        this.plantId = plantId
        this.loadCached = loadCached
        this.placement = placement
        this.packetScale = packetScale
        this.refresh()
    }

    setPlant(plantId: PreviewPlantId | undefined): void {
        if (this.plantId === plantId) return
        this.plantId = plantId
        this.rendering = undefined
        this.style = undefined
        this.refresh()
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
        // Held and grid previews follow /seedstyle too, without the packets' tilt.
        const packetStyle = GameDebugSettings.seedPacketStyle
        const style = this.packetScale !== undefined || packetStyle === 'standard' ? packetStyle : 'rendered'
        if (this.style === style && this.rendering !== undefined) return
        this.style = style
        this.updatePacketClip(style)
        const enabled = style !== 'standard' && (typeof this.plantId === 'number'
            ? this.plantId >= 0 && this.plantId <= 48 : PlantPreview.supports(this.definitions, this.plantId))
        if (this.rendering === enabled) {
            if (enabled) this.applyPlacement(style)
            return
        }
        this.rendering = enabled
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        this.players.length = 0
        this.composite = undefined
        this.compositeReady = undefined
        this.loaded = false
        const root = uiNode({ name: enabled ? 'RenderedPlant' : 'CachedPlant', parent: this.node, active: false }).node
        this.rendered = root
        if (enabled) this.applyPlacement(style)
        this.ready = (enabled ? this.load(root, this.plantId) : this.loadCached(root, this.plantId)).then(() => {
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
                for (const sprite of root.getComponentsInChildren(Sprite)) {
                    const base = this.baseColors.get(sprite)
                    if (base) sprite.color = base.clone()
                }
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

    private updatePacketClip(style: SeedPacketStyle): void {
        if (this.packetScale === undefined || (!this.packetClip && style !== 'tilted')) return
        const mask = this.packetClip ??= this.node.addComponent(Mask)
        mask.type = Mask.Type.GRAPHICS_STENCIL
        mask.enabled = style === 'tilted'
        if (!mask.enabled) return
        const scale = this.packetScale
        const graphics = mask.subComp as Graphics
        graphics.clear()
        // Inner image border: left x=3.5, bottom y=52. Leave the top and right open.
        graphics.rect(3.5 * scale, -52 * scale, 220.5 * scale, 220 * scale)
        graphics.fill()
    }

    private applyPlacement(style: SeedPacketStyle): void {
        const root = this.rendered!
        const { x, y, scale } = this.placement
        const enlarged = style === 'tilted'
        const factor = enlarged ? 1.5 : 1
        root.angle = enlarged ? -12 : 0
        root.setScale(scale * factor, scale * factor, 1)
        if (!enlarged) { root.setPosition(x, y); return }

        // Rotate around the lower centre of the packet so the plant leans to the right.
        const pivotX = 23 * this.packetScale!
        const pivotY = -25 * this.packetScale!
        const radians = root.angle * Math.PI / 180
        const cos = Math.cos(radians), sin = Math.sin(radians)
        root.setPosition(pivotX + ((x - pivotX) * cos - (y - pivotY) * sin) * factor,
            pivotY + ((x - pivotX) * sin + (y - pivotY) * cos) * factor)
    }

    private async load(root: Node, plantId: PreviewPlantId): Promise<void> {
        const id = typeof plantId === 'number' ? plantId : plantVisual(this.definitions, plantId)?.preview
        const { content, catalog } = await loadEntityDisplayAssets()
        if (!isValid(root, true) || root !== this.rendered) return
        const layout = id === undefined ? undefined : catalog.plants[id]
        const plant = typeof plantId === 'string' ? this.definitions.plants[plantId] : undefined
        const definition = plant?.animationTarget && layout
            ? resolveEntityDisplay('plants', id!, { ...layout, animationTarget: plant.animationTarget }, content.animations)
            : layout
        if (!definition) throw new Error(`Plant preview is not installed: ${plantId}`)
        const [x, y] = definition.packetOffset ?? [0, 0]
        const pose = uiNode({ name: 'Pose', parent: root, position: { x, y: -y } }).node
        const scale = definition.packetScale ?? 1
        pose.setScale(scale, scale, 1)
        const parts = definition.parts.filter(part => !part.blink).map(part => ({ ...part, id: part.packetId ?? part.id }))
        const players = await loadDisplayParts(pose, parts, content)
        if (!players || root !== this.rendered) return
        for (const player of players.values()) player.seek(player.lastFrameTimeSeconds * (definition.packetTimeRatio ?? 0))
        for (const part of parts) players.get(part.name)!.setTracksVisible(part.packetVisibleTracks ?? [], true)
        this.players.push(...players.values())
    }

    private applyColor(): void {
        const tint = typeof this.plantId === 'string' ? plantVisual(this.definitions, this.plantId)?.tint : undefined
        const color = tint
            ? new Color(Math.round(this.color.r * tint[0] / 255), Math.round(this.color.g * tint[1] / 255), Math.round(this.color.b * tint[2] / 255), this.color.a)
            : this.color
        if (this.composite) { this.composite.color = color; return }
        for (const player of this.players) player.setColorOverride(color)
        if (this.players.length || !this.rendered) return
        for (const sprite of this.rendered.getComponentsInChildren(Sprite)) {
            let base = this.baseColors.get(sprite)
            if (!base) { base = sprite.color.clone(); this.baseColors.set(sprite, base) }
            sprite.color = new Color(Math.round(base.r * color.r / 255), Math.round(base.g * color.g / 255),
                Math.round(base.b * color.b / 255), Math.round(base.a * color.a / 255))
        }
    }
}
