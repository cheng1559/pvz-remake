import { Node, Sprite, SpriteFrame } from 'cc'
import { uiNode } from '@/client/view/uiNode'

export interface UINodeOptions {
    layer?: number
    parent?: Node
    active?: boolean
    anchorX?: number
    anchorY?: number
    width?: number
    height?: number
    x?: number
    y?: number
    z?: number
}

export function createUINode(name: string, options: UINodeOptions = {}): Node {
    return uiNode({
        name,
        parent: options.parent,
        layer: options.layer,
        active: options.active,
        position: options.x != null || options.y != null || options.z != null
            ? { x: options.x ?? 0, y: options.y ?? 0, z: options.z ?? 0 }
            : undefined,
        size: options.width != null || options.height != null
            ? { width: options.width ?? 0, height: options.height ?? 0 }
            : undefined,
        anchor: { x: options.anchorX ?? 0.5, y: options.anchorY ?? 0.5 },
    }).node
}

export function setUISize(node: Node, width: number, height: number, anchorX = 0.5, anchorY = 0.5) {
    return uiNode({ node, size: { width, height }, anchor: { x: anchorX, y: anchorY } }).transform
}

export function createSpriteNode(args: {
    name?: string
    spriteFrame: SpriteFrame
    parent?: Node
    layer?: number
    x?: number
    y?: number
    z?: number
    anchorX?: number
    anchorY?: number
    width?: number
    height?: number
}): Node {
    return uiNode({
        name: args.name ?? '',
        parent: args.parent,
        layer: args.layer,
        position: { x: args.x ?? 0, y: args.y ?? 0, z: args.z ?? 0 },
        size: args.width != null || args.height != null
            ? { width: args.width ?? 0, height: args.height ?? 0 }
            : undefined,
        anchor: { x: args.anchorX ?? 0, y: args.anchorY ?? 1 },
        sprite: { frame: args.spriteFrame, sizeMode: Sprite.SizeMode.RAW, trim: false },
    }).node
}

export function buildThreeSliceRow(args: {
    name: string
    width: number
    left: SpriteFrame
    middle: SpriteFrame
    right: SpriteFrame
    layer?: number
    anchorX?: number
    anchorY?: number
}): Node {
    const row = createUINode(args.name, { layer: args.layer })
    const leftWidth = args.left.originalSize.width
    const rightWidth = args.right.originalSize.width
    const middleWidth = args.middle.originalSize.width
    const middleHeight = args.middle.originalSize.height
    const anchorX = args.anchorX ?? 0
    const anchorY = args.anchorY ?? 0

    let x = 0
    createSpriteNode({ spriteFrame: args.left, parent: row, layer: args.layer, x, y: 0, anchorX, anchorY })
    x += leftWidth

    const repeatCount = Math.floor((args.width - leftWidth - rightWidth) / middleWidth)
    for (let i = 0; i < repeatCount; i++) {
        createSpriteNode({ spriteFrame: args.middle, parent: row, layer: args.layer, x, y: 0, anchorX, anchorY })
        x += middleWidth
    }

    const remaining = args.width - leftWidth - rightWidth - repeatCount * middleWidth
    if (remaining > 0) {
        createSpriteNode({
            spriteFrame: args.middle,
            parent: row,
            layer: args.layer,
            x,
            y: 0,
            anchorX,
            anchorY,
            width: remaining,
            height: middleHeight,
        })
        x += remaining
    }

    createSpriteNode({ spriteFrame: args.right, parent: row, layer: args.layer, x, y: 0, anchorX, anchorY })
    return row
}

export function buildNineSliceGrid(args: {
    parent: Node
    layer?: number
    startX: number
    startY: number
    repeatX: number
    repeatY: number
    topLeft: SpriteFrame
    topMiddle: SpriteFrame
    topRight: SpriteFrame
    centerLeft: SpriteFrame
    centerMiddle: SpriteFrame
    centerRight: SpriteFrame
    bottomLeft: SpriteFrame
    bottomMiddle: SpriteFrame
    bottomRight: SpriteFrame
}) {
    let x = args.startX
    let y = args.startY

    createSpriteNode({ spriteFrame: args.topLeft, parent: args.parent, layer: args.layer, x, y })
    x += args.topLeft.originalSize.width
    for (let i = 0; i < args.repeatX; i++) {
        createSpriteNode({ spriteFrame: args.topMiddle, parent: args.parent, layer: args.layer, x, y })
        x += args.topMiddle.originalSize.width
    }
    createSpriteNode({ spriteFrame: args.topRight, parent: args.parent, layer: args.layer, x, y })

    y -= args.topLeft.originalSize.height
    for (let i = 0; i < args.repeatY; i++) {
        x = args.startX
        createSpriteNode({ spriteFrame: args.centerLeft, parent: args.parent, layer: args.layer, x, y })
        x += args.centerLeft.originalSize.width
        for (let j = 0; j < args.repeatX; j++) {
            createSpriteNode({ spriteFrame: args.centerMiddle, parent: args.parent, layer: args.layer, x, y })
            x += args.centerMiddle.originalSize.width
        }
        createSpriteNode({ spriteFrame: args.centerRight, parent: args.parent, layer: args.layer, x, y })
        y -= args.centerLeft.originalSize.height
    }

    x = args.startX
    createSpriteNode({ spriteFrame: args.bottomLeft, parent: args.parent, layer: args.layer, x, y })
    x += args.bottomLeft.originalSize.width
    for (let i = 0; i < args.repeatX; i++) {
        createSpriteNode({ spriteFrame: args.bottomMiddle, parent: args.parent, layer: args.layer, x, y })
        x += args.bottomMiddle.originalSize.width
    }
    createSpriteNode({ spriteFrame: args.bottomRight, parent: args.parent, layer: args.layer, x, y })
}
