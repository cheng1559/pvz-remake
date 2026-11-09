import { _decorator, Color, Component, isValid, Node, type Sprite } from 'cc'
import { type PacketTilt, PacketPictureStyle, placePacketPicture } from './packetPicture'
import { bakeSprite } from '@/client/view/bakeSprite'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { loadDisplayParts, loadEntityDisplayAssets, zombieRestingParts } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { MIRRORED_SHIFT } from '@/client/zombies/zombieParts'

const { ccclass } = _decorator

/**
 * `facingRightOffsetX`: facing right, the zombie is drawn 90 further and flipped as on the lawn, then this much further,
 * in its own units (the zombie's where it is put down, its packet's in a packet). `packetScale`: the zombie is a
 * packet's, which follows /seedstyle `tilted` as PlantPreview does.
 */
interface Placement { x: number, y: number, scale: number, from: 'zombie' | 'reanim', facingRightOffsetX?: number, packetScale?: number }

/** /seedstyle tilted for a zombie, set facing left as it does in its packet (see packetPicture). */
const ZOMBIE_TILT: PacketTilt = { factor: 2, angle: 0, pivot: [18, -10] }

/**
 * A zombie at rest: a zombie seed's packet, and the zombie in hand and over its cell (Plant::DrawSeedType draws the
 * cached zombie for SEED_ZOMBIE_*). `placement` is where the zombie's position goes (`from: 'zombie'`, as the level
 * places it), or its Reanim's origin (`from: 'reanim'`, as ReanimatorCache::MakeCachedZombieFrame poses it).
 */
@ccclass('ZombiePreview')
export class ZombiePreview extends Component {
    ready: Promise<void> = Promise.resolve()
    private typeId?: string
    private placement: Placement = { x: 0, y: 0, scale: 1, from: 'zombie' }
    private mirrored = false
    private color = Color.WHITE.clone()
    private root: Node | null = null
    private players: ReanimPlayer[] = []
    /**
     * A translucent zombie is flattened first, as PlantPreview does, so its own parts hide each other instead of
     * showing through; the flat image then takes the color.
     */
    private composite?: Sprite
    /** The body's place from the zombie's position: its idle clip's offset, as ZombieView places it. */
    private offset: [number, number] = [0, 0]
    /** A packet's /seedstyle, and the clip a tilted one draws through. */
    private picture?: PacketPictureStyle

    /** /seedstyle changed since: a packet takes it up. Read when placed too, as updates may not run yet (a level's intro). */
    protected update(): void {
        if (this.syncStyle()) this.place()
    }

    private syncStyle(): boolean {
        if (this.placement.packetScale === undefined) return false
        this.picture ??= new PacketPictureStyle(this.node, 'left')
        return this.picture.sync(this.placement.packetScale)
    }

    initialize(placement: Placement): this {
        this.placement = placement
        this.place()
        return this
    }

    /** A placement that depends on the zombie, such as a zombie seed's offset facing right. */
    setPlacement(placement: Placement): void {
        const current = this.placement
        if (current.x === placement.x && current.y === placement.y && current.scale === placement.scale &&
            current.from === placement.from && current.facingRightOffsetX === placement.facingRightOffsetX &&
            current.packetScale === placement.packetScale) return
        this.placement = placement
        this.place()
    }

    setZombie(typeId: string | undefined): void {
        if (this.typeId === typeId) return
        this.typeId = typeId
        if (this.root?.isValid) this.root.destroy()
        this.root = null
        this.players = []
        this.composite = undefined
        if (!typeId) return
        const root = uiNode({ name: 'RestingZombie', parent: this.node, active: false }).node
        this.root = root
        this.place()
        this.ready = this.load(root, typeId)
        void this.ready.catch(error => console.error('[ZombiePreview] Failed to load', typeId, error))
    }

    /** A zombie on the plants' side faces right. */
    setMirrored(mirrored: boolean): void {
        if (this.mirrored === mirrored) return
        this.mirrored = mirrored
        // A flattened body keeps the facing it was drawn with.
        if (this.composite) this.reload()
        else this.place()
    }

    /** The translucent zombie over its cell. */
    setColor(color: Color): void {
        if (this.color.equals(color)) return
        this.color = color.clone()
        if (this.composite) this.composite.color = this.color
        else if (this.color.a < 255 && this.players.length && this.root) this.ready = this.flatten(this.root)
        else for (const player of this.players) player.setColorOverride(this.color)
    }

    private reload(): void {
        const typeId = this.typeId
        this.typeId = undefined
        this.setZombie(typeId)
    }

    /** bakeSprite: the opaque pose captured as one image, which replaces the parts. */
    private async flatten(root: Node): Promise<void> {
        root.active = false
        for (const player of this.players) player.setColorOverride(Color.WHITE)
        const composite = await bakeSprite(root)
        if (!composite || !isValid(root, true) || root !== this.root) return
        for (const child of [...root.children]) if (child !== composite.node) child.destroy()
        this.players = []
        this.composite = composite
        composite.color = this.color
        root.active = true
    }

    /**
     * As ZombieView: the body at its clip's offset from the zombie's position, for one facing right 90 further and
     * flipped (MIRRORED_SHIFT), then `facingRightOffsetX` further. From the Reanim's origin, as the cache draws it, the clip's offset
     * (the original's GetDrawPos adjustments, such as the pole vaulter's) is not there. Parts drawn among the body's
     * tracks (the flag, which drawAfterTrack moves under the body) follow the body.
     */
    private place(): void {
        this.syncStyle()
        if (!this.root) return
        const { x, scale, packetScale } = this.placement
        const [offsetX, offsetY] = this.offset
        const [fromX, fromY] = this.placement.from === 'reanim' ? this.offset : [0, 0]
        // A packet is drawn facing left and, facing right, turned around whole as PlantPreview.setMirrored does: about
        // the axis the body flips about on the lawn (90 further and `facingRightOffsetX`), so it stands where that
        // would put it, and its tilt and clip turn with it. Over the lawn the body itself flips, as ZombieView's.
        const packet = packetScale !== undefined
        const mirrorBody = this.mirrored && !packet
        const facingRightShift = MIRRORED_SHIFT + (this.placement.facingRightOffsetX ?? 0)
        if (packet) {
            const axis = x + scale * (offsetX - fromX + facingRightShift / 2)
            this.node.setPosition(this.mirrored ? 2 * axis : 0, this.node.position.y)
            this.node.setScale(this.mirrored ? -1 : 1, 1, 1)
        }
        placePacketPicture(this.root, this.placement, packetScale, this.picture?.style, ZOMBIE_TILT)
        for (const player of this.players) {
            if (player.node.parent !== this.root) continue
            player.node.setPosition(offsetX + (mirrorBody ? facingRightShift : 0) - fromX, offsetY - fromY)
            player.node.setScale(mirrorBody ? -1 : 1, 1, 1)
        }
    }

    private async load(root: Node, typeId: string): Promise<void> {
        // The content loaded once for every display: loading it anew builds every definition again, which a chooser's
        // dozens of zombie packets would each do.
        const { content } = await loadEntityDisplayAssets()
        if (!isValid(root, true) || root !== this.root) return
        // ReanimatorCache::MakeCachedZombieFrame poses most zombies on anim_idle, the pole vaulter on anim_walk.
        const clip = content.presentation.zombies[typeId]?.packet?.clip
        const { parts, offset } = zombieRestingParts(content.animations, typeId, clip)
        const players = await loadDisplayParts(root, parts, content)
        if (!players || !isValid(root, true) || root !== this.root) return
        this.offset = offset
        this.players = [...players.values()]
        this.place()
        if (this.color.a < 255) { await this.flatten(root); return }
        for (const player of this.players) player.setColorOverride(this.color)
        root.active = true
    }
}
