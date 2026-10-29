import { isValid, type Node } from 'cc'
import type { ScreenAnimationDefinition } from '@/shared/content/presentation'
import { loadClientContent } from '@/client/content/loadClientContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'

/** Ordered page scenery uses the same Reanim assets and resource overrides as entities. */
export async function showScreenAnimations(parent: Node, layers: readonly ScreenAnimationDefinition[]): Promise<void> {
    const { registry, loader } = await loadClientContent()
    if (!isValid(parent, true)) return
    await Promise.all(layers.map(async layer => {
        const node = uiNode({ name: layer.name, parent, position: { x: layer.x - 400, y: 300 - layer.y }, active: false }).node
        const player = node.addComponent(ReanimPlayer)
        await player.load(layer.reanimId, registry, loader)
        if (!isValid(node, true)) return
        if (layer.visibleTracks) {
            player.setTracksVisible(player.trackIds, false)
            player.setTracksVisible(layer.visibleTracks, true)
        }
        const last = layer.playback === 'last'
        player.play({ loop: !last, hideOnFinish: false, rate: layer.rate,
            timeSeconds: last ? player.lastFrameTimeSeconds : layer.randomPhase ? Math.random() * player.lastFrameTimeSeconds : 0 })
        if (last) player.pause()
        node.active = true
    }))
}
