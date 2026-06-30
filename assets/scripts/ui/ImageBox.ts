import { Node, Rect, Size, Sprite, SpriteFrame, Vec2 } from 'cc'
import { createSpriteNode } from '@/ui/UIFactory'

export function drawImageBox(parent: Node, spriteFrame: SpriteFrame, width: number, height: number, tileName = 'ImageBoxTile') {
    const sourceWidth = spriteFrame.rect.width
    const sourceHeight = spriteFrame.rect.height
    if (sourceWidth <= 0 || sourceHeight <= 0) return

    const cornerWidth = Math.floor(sourceWidth / 3)
    const cornerHeight = Math.floor(sourceHeight / 3)
    const middleWidth = sourceWidth - cornerWidth * 2
    const middleHeight = sourceHeight - cornerHeight * 2
    if (cornerWidth <= 0 || cornerHeight <= 0 || middleWidth <= 0 || middleHeight <= 0) return

    const startX = -width / 2
    const startY = height / 2
    const rightX = width - cornerWidth
    const bottomY = height - cornerHeight
    const middleTargetWidth = Math.max(0, width - cornerWidth * 2)
    const middleTargetHeight = Math.max(0, height - cornerHeight * 2)

    drawImageBoxTile(parent, spriteFrame, 0, 0, cornerWidth, cornerHeight, startX, startY, tileName)
    drawImageBoxTile(parent, spriteFrame, cornerWidth + middleWidth, 0, cornerWidth, cornerHeight, startX + rightX, startY, tileName)
    drawImageBoxTile(parent, spriteFrame, 0, cornerHeight + middleHeight, cornerWidth, cornerHeight, startX, startY - bottomY, tileName)
    drawImageBoxTile(parent, spriteFrame, cornerWidth + middleWidth, cornerHeight + middleHeight, cornerWidth, cornerHeight, startX + rightX, startY - bottomY, tileName)

    for (let x = 0; x < middleTargetWidth; x += middleWidth) {
        const tileWidth = Math.min(middleWidth, middleTargetWidth - x)
        drawImageBoxTile(parent, spriteFrame, cornerWidth, 0, tileWidth, cornerHeight, startX + cornerWidth + x, startY, tileName)
        drawImageBoxTile(parent, spriteFrame, cornerWidth, cornerHeight + middleHeight, tileWidth, cornerHeight, startX + cornerWidth + x, startY - bottomY, tileName)
    }

    for (let y = 0; y < middleTargetHeight; y += middleHeight) {
        const tileHeight = Math.min(middleHeight, middleTargetHeight - y)
        drawImageBoxTile(parent, spriteFrame, 0, cornerHeight, cornerWidth, tileHeight, startX, startY - cornerHeight - y, tileName)
        drawImageBoxTile(parent, spriteFrame, cornerWidth + middleWidth, cornerHeight, cornerWidth, tileHeight, startX + rightX, startY - cornerHeight - y, tileName)
    }

    for (let x = 0; x < middleTargetWidth; x += middleWidth) {
        const tileWidth = Math.min(middleWidth, middleTargetWidth - x)
        for (let y = 0; y < middleTargetHeight; y += middleHeight) {
            const tileHeight = Math.min(middleHeight, middleTargetHeight - y)
            drawImageBoxTile(parent, spriteFrame, cornerWidth, cornerHeight, tileWidth, tileHeight, startX + cornerWidth + x, startY - cornerHeight - y, tileName)
        }
    }
}

function drawImageBoxTile(
    parent: Node,
    source: SpriteFrame,
    sourceX: number,
    sourceY: number,
    width: number,
    height: number,
    x: number,
    y: number,
    tileName: string,
) {
    if (width <= 0 || height <= 0) return

    const sourceRect = source.rect
    const frame = new SpriteFrame()
    frame.reset({
        texture: source.texture,
        rect: new Rect(sourceRect.x + sourceX, sourceRect.y + sourceY, width, height),
        originalSize: new Size(width, height),
        offset: new Vec2(0, 0),
        isRotate: false,
    })

    const node = createSpriteNode({
        name: tileName,
        spriteFrame: frame,
        parent,
        layer: parent.layer,
        x,
        y,
        anchorX: 0,
        anchorY: 1,
        width,
        height,
    })
    const sprite = node.getComponent(Sprite)
    if (sprite) {
        sprite.type = Sprite.Type.SIMPLE
        sprite.sizeMode = Sprite.SizeMode.CUSTOM
    }
}
