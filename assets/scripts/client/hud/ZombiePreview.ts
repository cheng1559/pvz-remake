import { _decorator, Color, Component, isValid, Node, type Sprite } from 'cc'
import { mirrorInPacket, type PacketTilt, PacketPictureStyle, placePacketPicture } from './packetPicture'
import { flattenTranslucent } from '@/client/view/bakeSprite'
import type { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { createOffBoardZombie, holdStill } from '@/client/view/offBoard'
import type { ZombieView } from '@/client/zombies/ZombieView'
import { uiNode } from '@/client/view/uiNode'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'

const { ccclass } = _decorator

/**
 * `facingRightOffsetX`: facing right, the zombie is drawn 90 further and flipped as on the lawn, then this much further,
 * in its own units (ZombieDefinition's, where it is put down). `packetScale`: the zombie is a packet's, which follows
 * /tilted as PlantPreview does and turns round about the packet's middle (mirrorInPacket).
 */
interface Placement { x: number, y: number, scale: number, from: 'zombie' | 'reanim', facingRightOffsetX?: number, packetScale?: number }

/** /tilted for a zombie, set facing left as it does in its packet (see packetPicture). */
const ZOMBIE_TILT: PacketTilt = { factor: 2, angle: 0, pivot: [18, -10] }

/**
 * A zombie at rest, drawn by its view: a zombie seed's packet, and the zombie in hand and over its cell
 * (Plant::DrawSeedType draws the cached zombie for SEED_ZOMBIE_*). `placement` is where the zombie's position goes
 * (`from: 'zombie'`, as the level places it), or its Reanim's origin (`from: 'reanim'`, as
 * ReanimatorCache::MakeCachedZombieFrame poses it).
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
    /** A translucent zombie drawn whole (flattenTranslucent), as PlantPreview draws a plant. */
    private composite?: Sprite
    /** The zombie's view, off the board. */
    private view?: ZombieView
    /** Whether a packet's picture is tilted, and the clip a tilted one draws through. */
    private picture?: PacketPictureStyle

    /** /tilted changed since: a packet takes it up. Read when placed too, as updates may not run yet (a level's intro). */
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
        // Where its body is drawn from is the view's from the start.
        if (current.from !== placement.from && this.typeId) this.reload()
        else this.place()
    }

    setZombie(typeId: string | undefined): void {
        if (this.typeId === typeId) return
        this.typeId = typeId
        this.view?.destroy()
        if (this.root?.isValid) this.root.destroy()
        this.root = null
        this.players = []
        this.view = undefined
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
        if (this.composite) { this.composite.color = this.color; return }
        const painting = this.root && this.players.length ? this.paint(this.root) : undefined
        if (painting) this.ready = painting
    }

    private reload(): void {
        const typeId = this.typeId
        this.typeId = undefined
        this.setZombie(typeId)
    }

    /**
     * The zombie in its color: its parts at once, or, translucent, drawn whole first (flattenTranslucent), the flat image
     * taking the color and shown once it is there.
     */
    private paint(root: Node): Promise<void> | undefined {
        const flattening = flattenTranslucent(root, this.players, this.color, () => root === this.root)
        if (!flattening) {
            for (const player of this.players) player.setColorOverride(this.color)
            return undefined
        }
        return flattening.then(composite => {
            if (!composite) return
            this.players = []
            this.composite = composite
            composite.color = this.color
            root.active = true
        })
    }

    /**
     * The body is where ZombieView has it: at its clip's offset from the zombie's position, for one facing right 90
     * further and flipped, then `facingRightOffsetX` further; or from the Reanim's origin, as the cache draws it (the
     * clip's offset, the original's GetDrawPos adjustments such as the pole vaulter's, is not there).
     */
    private place(): void {
        this.syncStyle()
        if (!this.root) return
        const { packetScale } = this.placement
        // A packet is drawn facing left and, facing right, turned round whole about the packet's middle, as a plant's
        // and a grave's are, its tilt and clip with it. Over the lawn the body itself flips, as on it.
        const packet = packetScale !== undefined
        const mirrorBody = this.mirrored && !packet
        if (packet) mirrorInPacket(this.node, this.mirrored, packetScale)
        placePacketPicture(this.root, this.placement, packetScale, this.picture?.tilted, ZOMBIE_TILT)
        if (!this.view || this.composite) return
        this.view.turn(mirrorBody)
        this.root.getChildByName('Zombie')?.setPosition(mirrorBody ? this.placement.facingRightOffsetX ?? 0 : 0, 0)
    }

    private async load(root: Node, typeId: string): Promise<void> {
        const packet = (await loadIntegratedGameContent()).presentation.zombies[typeId]?.packet
        if (!isValid(root, true) || root !== this.root) return
        // ReanimatorCache::MakeCachedZombieFrame poses most zombies on anim_idle, the pole vaulter on anim_walk.
        const pose = packet?.clip ?? 'idle'
        const view = await createOffBoardZombie(uiNode({ name: 'Zombie', parent: root }).node, typeId, {
            pose, mirrored: this.mirrored && this.placement.packetScale === undefined,
            draw: { shadow: false, ...(this.placement.from === 'reanim' ? { position: { x: 0, y: 0 } } : {}) },
        })
        if (!view || !isValid(root, true) || root !== this.root) { view?.destroy(); return }
        this.view = view
        this.players = view.players
        // A packet's picture is much smaller than its art.
        holdStill(this.players, this.placement.packetScale !== undefined)
        this.place()
        const painting = this.paint(root)
        if (painting) await painting
        else root.active = true
    }
}
