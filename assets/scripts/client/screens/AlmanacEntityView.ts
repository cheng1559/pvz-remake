import { _decorator, Component, isValid, Mask, Node } from 'cc'
import { createOffBoardPlant, createOffBoardZombie } from '@/client/view/offBoard'
import type { PlantView } from '@/client/plants/PlantView'
import type { ZombieView } from '@/client/zombies/ZombieView'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'

const { ccclass } = _decorator
/** A frame that took long moves an animation on by no more ticks than this. */
const MAX_TICKS = 20

/**
 * The almanac's plant or zombie (AlmanacDialog::SetupPlant and SetupZombie make one that is not on the board): drawn by
 * its own view, as it is off the board. No game entity is made or updated.
 */
@ccclass('AlmanacEntityView')
export class AlmanacEntityView extends Component {
    ready: Promise<void> = Promise.resolve()
    /** Its plant's or zombie's view; a plant's animation goes on (PlantView.advance). */
    private view?: PlantView | ZombieView
    private plant?: PlantView
    private ticks = 0

    /** `typeId`: the plant or zombie. `clip`: a frame it is cut off by. */
    static create(parent: Node, kind: 'plants' | 'zombies', typeId: string, x: number, y: number, clip?: { x: number, y: number, width: number, height: number }): Node {
        const container = clip ? uiNode({
            name: 'AlmanacPortraitClip', parent, position: { x: clip.x, y: -clip.y }, anchor: { x: 0, y: 1 },
            size: clip, mask: Mask.Type.GRAPHICS_RECT,
        }).node : parent
        const root = uiNode({ name: `Almanac-${kind}-${typeId}`, parent: container, position: { x: x - (clip?.x ?? 0), y: -y + (clip?.y ?? 0) } }).node
        const view = root.addComponent(AlmanacEntityView)
        view.ready = view.load(kind, typeId)
        void view.ready.catch(error => {
            if (isValid(root, true)) console.error('[Almanac] Failed to load entity animation', kind, typeId, error)
        })
        return root
    }

    private async load(kind: 'plants' | 'zombies', typeId: string): Promise<void> {
        const body = uiNode({ name: 'Entity', parent: this.node, active: false }).node
        if (kind === 'plants') {
            const [x, y] = (await loadIntegratedGameContent()).presentation.plants[typeId]?.almanacOffset ?? [0, 0]
            if (!isValid(this.node, true)) return
            this.node.setPosition(this.node.position.x + x, this.node.position.y - y)
            this.view = this.plant = await createOffBoardPlant(body, typeId) ?? undefined
            if (!this.plant && isValid(body, true)) throw new Error(`Almanac plant has no animation: ${typeId}`)
        } else {
            this.view = await createOffBoardZombie(body, typeId) ?? undefined
            if (!this.view && isValid(body, true)) throw new Error(`Almanac zombie is not drawn off the board: ${typeId}`)
        }
        if (isValid(body, true)) body.active = true
    }

    protected onDestroy(): void { this.view?.destroy() }

    protected update(dt: number): void {
        if (!this.plant) return
        this.ticks = Math.min(MAX_TICKS, this.ticks + gameClock.delta(dt) * 100)
        const whole = Math.floor(this.ticks)
        this.ticks -= whole
        if (whole) this.plant.advance(whole)
    }
}
