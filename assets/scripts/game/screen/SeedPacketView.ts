import { Color, Mask, Node, Sprite } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontRenderer } from '@/core/FontRenderer'
import { SpriteLoader } from '@/core/SpriteLoader'
import { SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { SEED_DEFINITIONS } from '../GameDefinitions'
import { getNodeBoardPixelRect } from './BoardPixelUtils'
import type { SeedType } from '../GameTypes'

export interface SeedPacketViewArgs {
    name: string
    parent: Node
    layer: number
    x: number
    y: number
    seedType: SeedType
    costFont: BitmapFontAssets | null
    drawCost?: boolean
}

export class SeedPacketView {
    readonly node: Node
    readonly selectedHighlight: Node
    readonly cooldownClip: Node
    readonly seedType: SeedType
    private readonly _baseSpriteColors = new WeakMap<Sprite, Color>()

    constructor(args: SeedPacketViewArgs) {
        this.seedType = args.seedType
        this.node = SeedPacketRenderer.drawSeedPacket({
            name: args.name,
            x: args.x,
            y: args.y,
            parent: args.parent,
            layer: args.layer,
            seedType: args.seedType,
            cost: SEED_DEFINITIONS[args.seedType].cost,
            drawCost: args.drawCost,
            seeds: SpriteLoader.get('seeds') ?? null,
            packetPlants: SpriteLoader.get('packet_plants') ?? null,
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached') ?? null,
            costFont: args.costFont,
        })
        this.selectedHighlight = this._createSelectedHighlight(args.layer)
        this.cooldownClip = this._createCooldownClip(args.layer, args.costFont)
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
        setUISize(this.cooldownClip, SEED_PACKET_WIDTH, height, 0, 1)
        this.cooldownClip.active = true
    }

    rect() {
        return getNodeBoardPixelRect(this.node, SEED_PACKET_WIDTH, SEED_PACKET_HEIGHT)
    }

    private _createSelectedHighlight(layer: number) {
        const highlight = createUINode('SelectedHighlight', {
            parent: this.node,
            layer,
            active: false,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH,
            height: SEED_PACKET_HEIGHT,
            x: 0,
            y: 0,
            z: 15,
        })
        const flash = SpriteLoader.get('particles/seedpacketflash')
        if (flash) {
            createSpriteNode({
                name: 'SeedPacketFlash',
                spriteFrame: flash,
                parent: highlight,
                layer,
                x: 0,
                y: 0,
                anchorX: 0,
                anchorY: 1,
            })
        }
        return highlight
    }

    private _createCooldownClip(layer: number, costFont: BitmapFontAssets | null) {
        const clip = createUINode('CooldownClip', {
            parent: this.node,
            layer,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH,
            height: 0,
            x: 0,
            y: 0,
            z: 20,
        })
        clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        clip.active = false

        const darkPacket = SeedPacketRenderer.drawSeedPacket({
            name: 'CooldownPacket',
            x: 0,
            y: 0,
            parent: clip,
            layer,
            seedType: this.seedType,
            cost: SEED_DEFINITIONS[this.seedType].cost,
            drawCost: false,
            seeds: SpriteLoader.get('seeds') ?? null,
            packetPlants: SpriteLoader.get('packet_plants') ?? null,
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached') ?? null,
            costFont,
        })
        this._applySpriteColorRecursive(darkPacket, new Color(64, 64, 64, 255))
        const costNode = this.node.children.find((child) => child.name === 'Cost')
        if (costNode) clip.setSiblingIndex(costNode.getSiblingIndex())
        return clip
    }

    private _applySpriteColorRecursive(node: Node, color: Color, skipName?: string | string[]) {
        if (Array.isArray(skipName) ? skipName.includes(node.name) : node.name === skipName) return
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
