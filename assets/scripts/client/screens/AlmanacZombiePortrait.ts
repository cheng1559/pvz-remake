import { _decorator, Component, isValid, Node } from 'cc'
import { createOffBoardZombie, holdStill } from '@/client/view/offBoard'
import { uiNode } from '@/client/view/uiNode'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'

/**
 * The almanac's small picture of a zombie: the zombie itself, held still where the original's cached one stands
 * (ReanimatorCache::MakeCachedZombieFrame, at half size).
 */
@_decorator.ccclass('AlmanacZombiePortrait')
export class AlmanacZombiePortrait extends Component {
    ready: Promise<void> = Promise.resolve()

    initialize(typeId: string): void {
        const root = uiNode({ name: 'RenderedZombie', parent: this.node, active: false }).node
        this.ready = this.load(root, typeId).then(() => { if (isValid(root, true)) root.active = true })
        void this.ready.catch(error => { if (isValid(root, true)) console.error('[Almanac] Failed to load zombie portrait', typeId, error) })
    }

    private async load(root: Node, typeId: string): Promise<void> {
        const portrait = (await loadIntegratedGameContent()).presentation.zombies[typeId]?.portrait
        if (!isValid(root, true)) return
        if (!portrait) throw new Error(`Zombie portrait is not installed: ${typeId}`)
        // The existing portrait mask starts two pixels inside the 76x76 frame.
        root.setPosition(portrait.x - 2, 2 - portrait.y)
        root.setScale(portrait.scale, portrait.scale, 1)
        // The zombie on the first frame of its idle, from its Reanim's origin.
        const zombie = await createOffBoardZombie(uiNode({ name: 'Zombie', parent: root }).node, typeId,
            { pose: 'idle', draw: { position: { x: 0, y: 0 }, shadow: false } })
        if (!zombie) { if (isValid(root, true)) throw new Error(`Zombie is not drawn off the board: ${typeId}`); return }
        // The picture is much smaller than its art.
        holdStill(zombie.view.players, true)
    }
}
