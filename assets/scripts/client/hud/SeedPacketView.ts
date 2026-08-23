import { Color, Mask, Node, Sprite, SpriteFrame } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontRenderer } from '@/client/font'
import {
    SEED_PACKET_HEIGHT,
    SEED_PACKET_WIDTH,
    SeedPacketRenderer,
    type SeedPacketSeedType,
} from '@/client/hud/SeedPacketRenderer'
import { uiNode } from '@/client/view/uiNode'

export interface SeedPacketViewArgs {
    name: string
    parent: Node
    layer: number
    x: number
    y: number
    seedType: SeedPacketSeedType
    costFont: BitmapFontAssets | null
    drawCost?: boolean
    cost: number
    seeds?: SpriteFrame
    packetPlants?: SpriteFrame
    cachedPacketPlants?: SpriteFrame
    seedPacketFlash?: SpriteFrame
}

export class SeedPacketView {
    readonly node: Node
    readonly selectedHighlight: Node
    readonly cooldownClip: Node
    readonly seedType: SeedPacketSeedType
    private readonly cost: number
    private readonly _baseSpriteColors = new WeakMap<Sprite, Color>()

    constructor(args: SeedPacketViewArgs) {
        this.seedType = args.seedType
        this.cost = args.cost
        this.node = SeedPacketRenderer.drawSeedPacket({
            name: args.name,
            x: args.x,
            y: args.y,
            parent: args.parent,
            layer: args.layer,
            seedType: args.seedType,
            cost: args.cost,
            drawCost: args.drawCost,
            seeds: args.seeds ?? null,
            packetPlants: args.packetPlants ?? null,
            cachedPacketPlants: args.cachedPacketPlants ?? null,
            costFont: args.costFont,
        })
        this.selectedHighlight = this._createSelectedHighlight(args)
        this.cooldownClip = this._createCooldownClip(args)
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

        const percentDark = !options.mobile && options.selected
            ? 1
            : options.cooldownTotal > 0 ? options.cooldownRemaining / options.cooldownTotal : 0
        this.syncCooldown(options.gameStarted ? percentDark : 0)
        this.selectedHighlight.active = options.mobile &&
            options.gameStarted &&
            options.selected &&
            (options.conveyor || options.cooldownRemaining <= 0)
    }

    applyColor(color: Color) {
        this._applySpriteColorRecursive(this.node, color, [
            'CooldownClip',
            'SelectedHighlight',
            'ParticleSystem_seedpacketpick',
            'ParticleSystem_seedpacketflash',
        ])
    }

    syncCooldown(percentDark: number) {
        if (percentDark <= 0) {
            this.cooldownClip.active = false
            return
        }

        const height = Math.min(SEED_PACKET_HEIGHT, Math.round(68 * percentDark) + 2)
        uiNode({
            node: this.cooldownClip,
            size: { width: SEED_PACKET_WIDTH, height },
            anchor: { x: 0, y: 1 },
        })
        this.cooldownClip.active = true
    }

    rect() {
        let x = this.node.position.x
        let y = this.node.position.y
        let parent = this.node.parent
        while (parent && parent.name !== 'BoardContent' && parent.name !== 'HUD') {
            x += parent.position.x
            y += parent.position.y
            parent = parent.parent
        }
        return { x, y: -y, width: SEED_PACKET_WIDTH, height: SEED_PACKET_HEIGHT }
    }

    destroy() {
        if (this.node.isValid) this.node.destroy()
    }

    private _createSelectedHighlight(args: SeedPacketViewArgs) {
        const layer = args.layer
        const highlight = uiNode({
            name: 'SelectedHighlight',
            parent: this.node,
            layer,
            active: false,
            anchor: { x: 0, y: 1 },
            size: { width: SEED_PACKET_WIDTH, height: SEED_PACKET_HEIGHT },
            position: { x: 0, y: 0, z: 15 },
        }).node
        const flash = args.seedPacketFlash
        if (flash) {
            uiNode({
                name: 'SeedPacketFlash',
                parent: highlight,
                layer,
                position: { x: 0, y: 0 },
                anchor: { x: 0, y: 1 },
                sprite: { frame: flash, sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
        }
        return highlight
    }

    private _createCooldownClip(args: SeedPacketViewArgs) {
        const layer = args.layer
        const clip = uiNode({
            name: 'CooldownClip',
            parent: this.node,
            layer,
            anchor: { x: 0, y: 1 },
            size: { width: SEED_PACKET_WIDTH, height: 0 },
            position: { x: 0, y: 0, z: 20 },
        }).node
        uiNode({ node: clip, mask: Mask.Type.GRAPHICS_RECT })
        clip.active = false

        const darkPacket = SeedPacketRenderer.drawSeedPacket({
            name: 'CooldownPacket',
            x: 0,
            y: 0,
            parent: clip,
            layer,
            seedType: this.seedType,
            cost: this.cost,
            drawCost: false,
            seeds: args.seeds ?? null,
            packetPlants: args.packetPlants ?? null,
            cachedPacketPlants: args.cachedPacketPlants ?? null,
            costFont: args.costFont,
        })
        this._applySpriteColorRecursive(darkPacket, new Color(64, 64, 64, 255))
        const costNode = this.node.children.find((child) => child.name === 'Cost')
        if (costNode) clip.setSiblingIndex(costNode.getSiblingIndex())
        return clip
    }

    private _applySpriteColorRecursive(node: Node, color: Color, skipName?: string | string[]) {
        if (Array.isArray(skipName) ? skipName.indexOf(node.name) >= 0 : node.name === skipName) return
        if (node.getComponent(FontRenderer)) return

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
