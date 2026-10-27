import type { ClientApi } from './index.js'
import { extendCloud, extendFlower } from './animations.js'

export async function installMenuAnimation(api: ClientApi): Promise<void> {
    const backgrounds = await Promise.all([
        { track: 'SelectorScreen_BG_Left', file: 'left', x: 133, y: 0, width: 609, height: 680 },
        { track: 'SelectorScreen_BG_Center', file: 'center', x: 0, y: 0, width: 720, height: 350 },
        { track: 'SelectorScreen_BG_Right', file: 'right', x: 0, y: 0, width: 863, height: 560 },
    ].map(async entry => ({ ...entry, frame: await api.assets.sprite(`assets/images/${entry.file}.png`) })))

    const skyFrame = await api.assets.sprite('assets/images/sky.png')
    const engine = api.host.get('cc')
    const { MainMenuScreen } = api.host.get('client/screens/MainMenuScreen')
    api.host.around(MainMenuScreen.prototype, 'initialize', async function (next, ...args) {
        await next(...args)
        if (!this.node.isValid) return
        const node = this.node, background = this.background
        const { Sprite, UITransform, view } = engine
        background.node.getComponent(Sprite).spriteFrame = skyFrame
        const selector = node.getChildByName('Selector')
        const restores: Array<() => void> = []
        for (const name of ['open', 'sign']) {
            const animation = selector.getChildByName(name).getComponent('ReanimPlayer')
            for (const { track, frame, x, y, width, height } of backgrounds) {
                const trackNode = animation.getTrackNode(track)
                const target = trackNode.getComponent(UITransform), sprite = trackNode.getComponent(Sprite)
                const anchor = target.anchorPoint.clone()
                const size = target.contentSize.clone(), sizeMode = sprite.sizeMode
                animation.setTrackSpriteOverride(track, frame)
                // Restore the cropped image origin without moving track-bound buttons.
                sprite.sizeMode = Sprite.SizeMode.CUSTOM
                target.setContentSize(width, height)
                target.setAnchorPoint(x / width, 1 - y / height)
                restores.push(() => {
                    if (!animation.isValid) return
                    animation.setTrackSpriteOverride(track, null)
                    sprite.sizeMode = sizeMode
                    target.setContentSize(size)
                    target.setAnchorPoint(anchor)
                })
            }
        }
        const clouds = selector.children.filter((child: any) => /^cloud\d+$/.test(child.name)).map((child: any) => {
            const player = child.getComponent('ReanimPlayer')
            return { player, source: player.getAnimation() }
        })
        for (const child of selector.children.filter((child: any) => /^flower\d+$/.test(child.name))) {
            if (child.name === 'flower2') continue // The leftmost flower keeps its original resting pose.
            const player = child.getComponent('ReanimPlayer'), source = player.getAnimation()
            player.replaceAnimation(extendFlower(source))
            restores.push(() => { if (player.isValid) player.replaceAnimation(source) })
        }
        const sky = background.node, transform = sky.getComponent(UITransform)
        const size = transform.contentSize.clone(), position = sky.position.clone()
        // Keep the sky in the selector hierarchy so visibility and achievement slides follow naturally.
        const layout = () => {
            const { width, height } = view.getVisibleSize()
            const skyWidth = skyFrame.originalSize.width
            transform.setContentSize(skyWidth, height)
            sky.setPosition(400 - skyWidth / 2, height / 2 - 300, position.z)
            for (const { player, source } of clouds) {
                player.replaceAnimation(extendCloud(source, width, height, id => player.getSpriteFrame(id).originalSize))
            }
        }
        view.on('design-resolution-changed', layout)
        layout()
        node.once(engine.Node.EventType.NODE_DESTROYED, () => {
            view.off('design-resolution-changed', layout)
            for (const restore of restores) restore()
            for (const { player, source } of clouds) if (player.isValid) player.replaceAnimation(source)
            if (sky.isValid) {
                sky.setPosition(position)
                transform.setContentSize(size)
            }
        })
    })
}
