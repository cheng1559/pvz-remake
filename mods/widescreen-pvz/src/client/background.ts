import type { ClientApi } from './index.js'

/** Keep the artwork centered at 600px high, leaving the black page visible at either side. */
export function coverBackground(api: ClientApi, node: any, frame: any, centerX = 0, centerY = 0): void {
    const { Sprite, UITransform } = api.host.get('cc')
    const transform = node.getComponent(UITransform), z = node.position.z
    node.getComponent(Sprite).spriteFrame = frame
    const height = 600, width = height * frame.originalSize.width / frame.originalSize.height
    transform.setContentSize(width, height)
    node.setPosition(centerX - width / 2, centerY + height / 2, z)
}
