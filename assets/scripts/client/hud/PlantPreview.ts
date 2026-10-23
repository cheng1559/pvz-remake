import { _decorator, Color, Component, Graphics, isValid, Mask, Node, Sprite } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { loadDisplayParts, loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings, type SeedPacketStyle } from '@/platform/debug/GameDebugSettings'

const { ccclass } = _decorator
export type PreviewPlantId = string | number

/** Static plant rendering shared by seed packets and placement previews. */
@ccclass('PlantPreview')
export class PlantPreview extends Component {
    ready: Promise<void> = Promise.resolve()
    private loadCached!: (root: Node, plantId: PreviewPlantId) => Promise<void>
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

    static supports(plantId: string): plantId is 'pvz:peashooter' | 'pvz:sunflower' | 'pvz:repeater' {
        return plantId === 'pvz:peashooter' || plantId === 'pvz:sunflower' || plantId === 'pvz:repeater'
    }

    initialize(plantId: PreviewPlantId | undefined, loadCached: (root: Node, plantId: PreviewPlantId) => Promise<void>, placement: { x: number, y: number, scale: number }, packetScale?: number): void {
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
        this.applyColor()
    }

    protected update(): void { this.refresh() }

    private refresh(): void {
        if (this.plantId === undefined) return
        const style = this.packetScale !== undefined ? GameDebugSettings.seedPacketStyle
            : GameDebugSettings.hdSeedPacketsEnabled ? 'rendered' : 'standard'
        if (this.style === style && this.rendering !== undefined) return
        this.style = style
        this.updatePacketClip(style)
        const enabled = style !== 'standard' && (typeof this.plantId === 'number'
            ? this.plantId >= 0 && this.plantId <= 48 : PlantPreview.supports(this.plantId))
        if (this.rendering === enabled) {
            if (enabled) this.applyPlacement(style)
            return
        }
        this.rendering = enabled
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        this.players.length = 0
        const root = uiNode({ name: enabled ? 'RenderedPlant' : 'CachedPlant', parent: this.node, active: false }).node
        this.rendered = root
        if (enabled) this.applyPlacement(style)
        this.ready = (enabled ? this.load(root, this.plantId) : this.loadCached(root, this.plantId)).then(() => {
            if (!isValid(root, true) || root !== this.rendered) return
            this.applyColor()
            root.active = true
        })
        void this.ready.catch(error => {
            if (isValid(root, true) && root === this.rendered) console.error('[PlantPreview] Failed to load plant preview', error)
        })
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
            this.players.push(...players.values())
            return
        }
        const { content: assets } = await loadEntityDisplayAssets()
        if (!isValid(root, true) || root !== this.rendered) return
        if (!PlantPreview.supports(plantId)) throw new Error(`Plant preview is not installed: ${plantId}`)
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
        this.players.push(body, ...(head ? [head] : []))
    }

    private applyColor(): void {
        for (const player of this.players) player.setColorOverride(this.color)
        if (this.players.length || !this.rendered) return
        for (const sprite of this.rendered.getComponentsInChildren(Sprite)) {
            let base = this.baseColors.get(sprite)
            if (!base) { base = sprite.color.clone(); this.baseColors.set(sprite, base) }
            sprite.color = new Color(Math.round(base.r * this.color.r / 255), Math.round(base.g * this.color.g / 255),
                Math.round(base.b * this.color.b / 255), Math.round(base.a * this.color.a / 255))
        }
    }
}
