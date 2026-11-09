import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { _decorator, Color, Component, Mask, Node, Sprite } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontRenderer } from '@/client/font'
import {
    SEED_PACKET_HEIGHT,
    SEED_PACKET_WIDTH,
    SeedPacketRenderer,
    type SeedPacketRenderArgs,
    type SeedPacketSeedType,
} from '@/client/hud/SeedPacketRenderer'
import { uiNode } from '@/client/view/uiNode'
import { PlantPreview } from './PlantPreview'
import { ZombiePreview } from './ZombiePreview'
import { PacketGrave } from './PacketGrave'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

export interface SeedPacketViewArgs {
    definitions: PresentationDefinitions
    name: string
    parent: Node
    layer: number
    x: number
    y: number
    seedType?: SeedPacketSeedType
    /** A zombie seed's zombie type, drawn instead of a plant. */
    zombie?: string
    /** A grave seed's packet, which draws a grave. */
    grave?: boolean
    costFont: BitmapFontAssets | null
    drawCost?: boolean
    cost?: number
    loadSprite?: SeedPacketRenderArgs['loadSprite']
    /**
     * Where the packet's picture, cost and selection frame go, above every packet's background, so that a picture
     * standing out of its packet (/seedstyle tilted) shows over its neighbours whichever way it leans. Without it
     * they stay in the packet, and packets to the left must draw last.
     */
    iconLayer?: Node
    /** Where text drawn on the packet goes (a hotkey), above every packet's picture (`labels`). */
    labelLayer?: Node
}

/** Keeps a packet's nodes in other layers on the packet: where it is, its size and whether it shows. */
@_decorator.ccclass('SeedPacketIconFollower')
class SeedPacketIconFollower extends Component {
    private readonly targets: Node[] = []

    follow(target: Node): void {
        this.targets.push(target)
        target.active = this.node.activeInHierarchy
        this.lateUpdate()
    }

    protected lateUpdate(): void {
        for (const target of this.targets) {
            if (!target.isValid) continue
            target.setWorldPosition(this.node.worldPosition)
            target.setWorldRotation(this.node.worldRotation)
            target.setWorldScale(this.node.worldScale)
        }
    }

    protected onEnable(): void {
        for (const target of this.targets) if (target.isValid) target.active = true
        this.lateUpdate()
    }

    protected onDisable(): void { for (const target of this.targets) if (target.isValid) target.active = false }
    protected onDestroy(): void { for (const target of this.targets) if (target.isValid) target.destroy() }
}

/** Parts of a packet that draw over the packets: its picture and cost; the background stays. */
const ICON_PARTS = new Set(['PacketPlant', 'PacketZombie', 'PacketGrave', 'Cost'])
/**
 * How far a tilted picture may stand out of its packet, sideways and above, which the cooldown's shade over the
 * picture covers. With the picture in its own layer the shade holds only the dark copy, so it can reach this far.
 */
const TILTED_OVERHANG = 220

export class SeedPacketView {
    readonly node: Node
    selectedHighlight?: Node
    cooldownClip?: Node
    seedType?: SeedPacketSeedType
    /** The packet's picture, cost and selection frame, above every packet's background (`iconLayer`). */
    private readonly top?: Node
    /**
     * Where text drawn on the packet goes (a hotkey): above every packet's picture with a `labelLayer`, else the
     * packet itself. Changing the seed clears it.
     */
    readonly labels: Node
    /** The cooldown shade's background half, under the packets' pictures, when the picture is in `top`. */
    private cooldownBase?: Node
    private mirrored = false
    private readonly _baseSpriteColors = new WeakMap<Sprite, Color>()

    constructor(private args: SeedPacketViewArgs) {
        this.node = uiNode({ name: args.name, parent: args.parent, layer: args.layer,
            position: { x: args.x, y: args.y }, anchor: { x: 0, y: 1 },
            size: { width: SEED_PACKET_WIDTH, height: SEED_PACKET_HEIGHT } }).node
        if (args.iconLayer) this.top = this.followingNode(args.iconLayer, `${args.name}Icon`)
        this.labels = args.labelLayer ? this.followingNode(args.labelLayer, `${args.name}Labels`) : this.node
        if (args.seedType !== undefined) this.setSeed(args.seedType, args.cost ?? 0, args.zombie, args.grave)
    }

    setSeed(seedType: SeedPacketSeedType, cost: number, zombie?: string, grave?: boolean): void {
        const args = { ...this.args, seedType, cost, zombie, grave,
            parent: this.node.parent!, x: this.node.position.x, y: this.node.position.y }
        this.args = args
        this.seedType = seedType
        for (const parent of this.parts) {
            for (const child of [...parent.children]) {
                if (child === this.top || child === this.labels) continue
                child.active = false; child.removeFromParent(); child.destroy()
            }
        }
        // Keep the slot node and its button so input capture and mobile bindings stay valid.
        SeedPacketRenderer.drawSeedPacket({ ...args, node: this.node })
        if (this.top) {
            for (const child of [...this.node.children]) if (ICON_PARTS.has(child.name)) child.setParent(this.top, false)
        }
        this.cooldownClip = this._createCooldownClip(args)
        this.selectedHighlight = this._createSelectedHighlight(args)
        if (this.top?.parent === this.node) this.top.setSiblingIndex(this.node.children.length - 1)
        if (this.mirrored) this.setMirrored(true)
    }

    /**
     * A packet of the zombies' side draws its plant facing left, in the packet and in the dark copy the cooldown and
     * the selection show over it; redrawing the seed keeps it.
     */
    setMirrored(mirrored: boolean): void {
        this.mirrored = mirrored
        for (const parent of this.parts) {
            for (const plant of parent.getComponentsInChildren(PlantPreview)) plant.setMirrored(mirrored)
            for (const zombie of parent.getComponentsInChildren(ZombiePreview)) zombie.setMirrored(mirrored)
            for (const grave of parent.getComponentsInChildren(PacketGrave)) grave.setMirrored(mirrored)
        }
    }

    /**
     * Moves the packet's picture to another layer, when the packet moves to another set of packets; none puts it back
     * on the packet, drawn with it whole (a card in flight, in its own order among the others).
     */
    setIconLayer(layer: Node | undefined): void {
        const parent = layer ?? this.node
        if (!this.top?.isValid || this.top.parent === parent) return
        this.top.setParent(parent, true)
        if (!layer) this.top.setSiblingIndex(this.node.children.length - 1)
    }

    /** The packet's plant or zombie picture is drawn; it loads after the packet itself, so a frame later at least. */
    get ready(): Promise<void> {
        const pictures = this.parts.flatMap(part => [...part.getComponentsInChildren(PlantPreview), ...part.getComponentsInChildren(ZombiePreview)])
        return Promise.all(pictures.map(picture => picture.ready.catch(() => {}))).then(() => {})
    }

    /** Draws the packet's picture over the others in its layer; packets raised in turn draw in that order. */
    raiseIcon(): void {
        if (this.top?.isValid && this.top.parent !== this.node) this.top.setSiblingIndex(this.top.parent!.children.length - 1)
    }

    /** The packet's nodes: the packet, its icon node over the packets and its labels node over those (unless on it). */
    private get parts(): Node[] {
        const parts = [this.node]
        for (const part of [this.top, this.labels]) if (part && part !== this.node && part.parent !== this.node) parts.push(part)
        return parts
    }

    /** A node in another layer that keeps to the packet (SeedPacketIconFollower). */
    private followingNode(layer: Node, name: string): Node {
        const node = uiNode({ name, parent: layer, layer: this.args.layer, anchor: { x: 0, y: 1 } }).node
        const follower = this.node.getComponent(SeedPacketIconFollower) ?? this.node.addComponent(SeedPacketIconFollower)
        follower.follow(node)
        return node
    }

    sync(options: {
        gameStarted: boolean
        active: boolean
        selected: boolean
        cooldownRemaining: number
        cooldownTotal: number
        canAfford: boolean
        tutorialColor: Color | null
        mobile: boolean
        conveyor?: boolean
    }) {
        const cooling = options.cooldownRemaining > 0
        const inactiveWithoutCooldown = !options.active && !cooling && !options.selected
        const color = !options.gameStarted ? new Color(128, 128, 128, 255) :
            options.tutorialColor ?? (
                cooling ? new Color(128, 128, 128, 255) :
                    options.canAfford && !inactiveWithoutCooldown ? Color.WHITE : new Color(128, 128, 128, 255)
            )
        this.applyColor(color)

        const percentDark = options.selected
            ? 1
            : options.cooldownTotal > 0 ? options.cooldownRemaining / options.cooldownTotal : 0
        this.syncCooldown(options.gameStarted ? percentDark : 0)
        if (this.selectedHighlight) this.selectedHighlight.active = options.mobile &&
            this.seedType !== 48 &&
            options.gameStarted &&
            options.selected &&
            (options.conveyor || options.cooldownRemaining <= 0)
    }

    applyColor(color: Color) {
        for (const parent of this.parts) this._applySpriteColorRecursive(parent, color, ['CooldownClip', 'SelectedHighlight'])
    }

    syncCooldown(percentDark: number) {
        if (!this.cooldownClip) return
        if (percentDark <= 0) {
            this.cooldownClip.active = false
            if (this.cooldownBase) this.cooldownBase.active = false
            return
        }

        const height = Math.min(SEED_PACKET_HEIGHT, Math.round(68 * percentDark) + 2)
        // A tilted picture stands out on either side (a plant to the right, a zombie to the left) and above; the shade
        // over it reaches as far, the packet's own background half no further than the packet. Without its own layer
        // the shade holds the dark background too, so it only reaches 25 to the right, as before.
        const tilted = GameDebugSettings.seedPacketStyle === 'tilted'
        const out = tilted && this.top ? TILTED_OVERHANG : 0
        const side = tilted && !this.top ? 25 : out
        const width = SEED_PACKET_WIDTH + out + side
        uiNode({ node: this.cooldownClip, size: { width, height: height + out }, anchor: { x: out / width, y: height / (height + out) } })
        this.cooldownClip.active = true
        if (this.cooldownBase) {
            uiNode({ node: this.cooldownBase, size: { width: SEED_PACKET_WIDTH, height }, anchor: { x: 0, y: 1 } })
            this.cooldownBase.active = true
        }
    }

    destroy() {
        if (this.node.isValid) this.node.destroy()
    }

    private _createSelectedHighlight(args: SeedPacketViewArgs) {
        const highlight = SeedPacketRenderer.drawSelectionFrame(this.top ?? this.node, args.definitions)
        highlight.active = false
        return highlight
    }

    private _createCooldownClip(args: SeedPacketRenderArgs) {
        const layer = args.layer
        const clip = uiNode({
            name: 'CooldownClip',
            parent: this.top ?? this.node,
            layer,
            anchor: { x: 0, y: 1 },
            size: { width: SEED_PACKET_WIDTH, height: 0 },
            position: { x: 0, y: 0, z: 20 },
        }).node
        uiNode({ node: clip, mask: Mask.Type.GRAPHICS_RECT })
        clip.active = false

        const darkPacket = SeedPacketRenderer.drawSeedPacket({
            ...args,
            name: 'CooldownPacket',
            x: 0,
            y: 0,
            parent: clip,
            layer,
            drawCost: false,
        })
        this._applySpriteColorRecursive(darkPacket, new Color(64, 64, 64, 255))
        const costNode = (this.top ?? this.node).children.find((child) => child.name === 'Cost')
        if (costNode) clip.setSiblingIndex(costNode.getSiblingIndex())
        this.cooldownBase = undefined
        if (this.top) {
            // The shade's background half stays under the packets' pictures, with the packet's background.
            const base = uiNode({ name: 'CooldownClip', parent: this.node, layer, anchor: { x: 0, y: 1 },
                size: { width: SEED_PACKET_WIDTH, height: 0 }, position: { x: 0, y: 0, z: 20 } }).node
            uiNode({ node: base, mask: Mask.Type.GRAPHICS_RECT })
            base.active = false
            const holder = uiNode({ name: 'CooldownPacket', parent: base, layer }).node
            holder.setScale(darkPacket.scale)
            darkPacket.getChildByName('Background')?.setParent(holder, false)
            this.cooldownBase = base
        }
        return clip
    }

    private _applySpriteColorRecursive(node: Node, color: Color, skipName?: string | string[]) {
        if (Array.isArray(skipName) ? skipName.indexOf(node.name) >= 0 : node.name === skipName) return
        if (node.getComponent(ParticlePlayer) || node.getComponent(FontRenderer)) return
        const plant = node.getComponent(PlantPreview)
        if (plant) { plant.setColor(color); return }
        const zombie = node.getComponent(ZombiePreview)
        if (zombie) { zombie.setColor(color); return }

        const sprite = node.getComponent(Sprite)
        if (sprite) {
            let base = this._baseSpriteColors.get(sprite)
            if (!base) {
                base = new Color(sprite.color.r, sprite.color.g, sprite.color.b, sprite.color.a)
                this._baseSpriteColors.set(sprite, base)
            }
            sprite.color = new Color(
                Math.round(base.r * color.r / 255),
                Math.round(base.g * color.g / 255),
                Math.round(base.b * color.b / 255),
                Math.round(base.a * color.a / 255),
            )
        }
        for (const child of node.children) {
            this._applySpriteColorRecursive(child, color, skipName)
        }
    }
}
