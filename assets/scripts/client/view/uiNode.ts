import { Graphics, Layers, Mask, Node, Sprite, SpriteFrame, UIOpacity, UISkew, UITransform } from 'cc'

export interface UiNodeOptions {
    node?: Node
    name?: string
    parent?: Node
    layer?: number
    active?: boolean
    position?: { x?: number, y?: number, z?: number }
    size?: { width: number, height: number }
    anchor?: { x: number, y: number }
    sprite?: {
        frame?: SpriteFrame | null
        sizeMode?: Sprite['sizeMode']
        trim?: boolean
    }
    opacity?: number
    mask?: Mask['type']
    graphics?: boolean
    skew?: { x: number, y: number }
}

export interface UiNodeParts {
    node: Node
    transform: UITransform
    sprite?: Sprite
    opacity?: UIOpacity
    mask?: Mask
    graphics?: Graphics
    skew?: UISkew
}

export function uiNode(options: UiNodeOptions = {}): UiNodeParts {
    const created = options.node == null
    const node = options.node ?? new Node(options.name ?? '')

    if (!created && options.name != null) node.name = options.name
    if (created || options.layer != null) node.layer = options.layer ?? Layers.Enum.UI_2D
    if (created || options.active != null) node.active = options.active ?? true

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform)
    const parts: UiNodeParts = { node, transform }

    if (options.sprite != null) {
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite)
        if ('frame' in options.sprite) sprite.spriteFrame = options.sprite.frame ?? null
        if (options.sprite.sizeMode != null) sprite.sizeMode = options.sprite.sizeMode
        if (options.sprite.trim != null) sprite.trim = options.sprite.trim
        parts.sprite = sprite
    }
    if (options.opacity != null) {
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)
        opacity.opacity = options.opacity
        parts.opacity = opacity
    }
    if (options.mask != null) {
        const mask = node.getComponent(Mask) ?? node.addComponent(Mask)
        mask.type = options.mask
        parts.mask = mask
    }
    if (options.graphics) parts.graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics)
    if (options.skew != null) {
        const skew = node.getComponent(UISkew) ?? node.addComponent(UISkew)
        skew.setSkew(options.skew.x, options.skew.y)
        parts.skew = skew
    }

    if (options.size != null) transform.setContentSize(options.size.width, options.size.height)
    if (options.anchor != null) transform.setAnchorPoint(options.anchor.x, options.anchor.y)
    if (options.position != null) {
        const position = node.position
        node.setPosition(
            options.position.x ?? position.x,
            options.position.y ?? position.y,
            options.position.z ?? position.z,
        )
    }
    if (options.parent != null && node.parent !== options.parent) options.parent.addChild(node)

    return parts
}
