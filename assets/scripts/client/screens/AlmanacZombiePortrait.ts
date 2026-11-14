import { _decorator, Component, isValid, Node } from 'cc'
import { createOffBoardZombie, offBoardContent } from '@/client/view/offBoard'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

/** The almanac's small picture of a zombie: the original cached one, or the zombie itself held still at the same place. */
@_decorator.ccclass('AlmanacZombiePortrait')
export class AlmanacZombiePortrait extends Component {
    ready: Promise<void> = Promise.resolve()
    private typeId = ''
    private loadCached!: (root: Node) => Promise<void>
    private rendered: Node | null = null
    private hd?: boolean

    initialize(typeId: string, loadCached: (root: Node) => Promise<void>): void {
        this.typeId = typeId
        this.loadCached = loadCached
        this.update()
    }

    protected update(): void {
        // /seedstyle standard keeps the original cached portraits; the other styles draw the zombie.
        const enabled = GameDebugSettings.seedPacketStyle !== 'standard'
        if (this.hd === enabled) return
        this.hd = enabled
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        const root = uiNode({ name: enabled ? 'RenderedZombie' : 'CachedZombie', parent: this.node, active: false }).node
        this.rendered = root
        this.ready = (enabled ? this.load(root) : this.loadCached(root)).then(() => {
            if (isValid(root, true) && root === this.rendered) root.active = true
        })
        void this.ready.catch(error => {
            if (isValid(root, true) && root === this.rendered) console.error('[Almanac] Failed to load zombie portrait', this.typeId, error)
        })
    }

    private async load(root: Node): Promise<void> {
        const portrait = (await offBoardContent()).presentation.zombies[this.typeId]?.portrait
        if (!isValid(root, true)) return
        if (!portrait) throw new Error(`Zombie portrait is not installed: ${this.typeId}`)
        // The existing portrait mask starts two pixels inside the 76x76 frame.
        root.setPosition(portrait.x - 2, 2 - portrait.y)
        root.setScale(portrait.scale, portrait.scale, 1)
        // ReanimatorCache::MakeCachedZombieFrame: the zombie on the first frame of its idle, from its Reanim's origin.
        const zombie = await createOffBoardZombie(uiNode({ name: 'Zombie', parent: root }).node, this.typeId,
            { pose: 'idle', draw: { position: { x: 0, y: 0 }, shadow: false } })
        if (!zombie) { if (isValid(root, true)) throw new Error(`Zombie is not drawn off the board: ${this.typeId}`); return }
        for (const player of zombie.view.players) player.pause()
    }
}
