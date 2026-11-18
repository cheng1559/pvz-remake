import { prepareClips, showClip } from '@/client/reanim/clips'
import { isValid, type Node } from 'cc'
import type { AnimationDefinition } from '@/shared/content/presentation'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'

/** Ordered page scenery uses the same Reanim assets and resource overrides as entities. */
export async function showScreenAnimations(parent: Node, clips: AnimationDefinition): Promise<void> {
    await prepareClips(Object.values(clips))
    if (!isValid(parent, true)) return
    for (const [name, clip] of Object.entries(clips)) {
        const node = uiNode({ name, parent }).node
        showClip(node.addComponent(ReanimPlayer), clip)
        node.setPosition(node.position.x - 400, node.position.y + 300)
    }
}
