import type { ClientApi } from './index.js'

/** Center artwork at its scene height, leaving the page visible beyond its image bounds. */
export function coverBackground(api: ClientApi, node: any, frame: any, centerX = 0, centerY = 0, height = 600): void {
    const { Sprite, UITransform } = api.host.get('cc')
    const transform = node.getComponent(UITransform), z = node.position.z
    node.getComponent(Sprite).spriteFrame = frame
    const width = height * frame.originalSize.width / frame.originalSize.height
    transform.setContentSize(width, height)
    node.setPosition(centerX - width / 2, centerY + height / 2, z)
}
