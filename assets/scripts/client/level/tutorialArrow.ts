import { isValid, type Node } from 'cc'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'

const ARROW = 'pvz:seedpacketpick'

/**
 * The tutorial's bouncing arrow (PARTICLE_SEED_PACKET_PICK) in `layer` at `at`, in the layer's coordinates; gone without
 * `at`. A restore puts the layer's particles back, so the live arrow is found among them rather than kept.
 */
export function syncTutorialArrow(layer: Node, at?: { x: number, y: number }): void {
    const [arrow, ...duplicates] = layer.children.filter(node => node.getComponent(ParticlePlayer)?.id === ARROW && isValid(node, true))
    for (const duplicate of duplicates) duplicate.destroy()
    if (!at) arrow?.destroy()
    else if (arrow) arrow.setPosition(at.x, at.y, 20)
    else ParticlePlayer.spawn({ parent: layer, id: ARROW, x: at.x, y: at.y, z: 20 })
}
