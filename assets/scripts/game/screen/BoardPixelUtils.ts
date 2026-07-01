import { EventMouse, EventTouch, Node, UITransform, Vec3 } from 'cc'
import type { BoardPixelRect } from './GameScreenViewTypes'

export function isPixelInRect(pixel: { x: number, y: number }, rect: BoardPixelRect) {
    return pixel.x >= rect.x &&
        pixel.x <= rect.x + rect.width &&
        pixel.y >= rect.y &&
        pixel.y <= rect.y + rect.height
}

export function getNodeBoardPixelRect(node: Node, width: number, height: number): BoardPixelRect {
    let x = node.position.x
    let y = node.position.y
    let parent = node.parent
    while (parent && parent.name !== 'BoardContent' && parent.name !== 'HUD') {
        x += parent.position.x
        y += parent.position.y
        parent = parent.parent
    }
    return {
        x,
        y: -y,
        width,
        height,
    }
}

export function eventToBoardPixel(root: Node, event: EventMouse | EventTouch) {
    return uiLocationToBoardPixel(root, event.getUILocation())
}

export function uiLocationToBoardPixel(root: Node, ui: { x: number, y: number }) {
    const local = root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0))
    return {
        x: local.x + 400,
        y: 300 - local.y,
    }
}
