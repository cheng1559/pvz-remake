import { _decorator, Color, Component, type Graphics, type Node } from 'cc'
import { gameClock } from '@/core/GameClock'
import { uiNode } from '@/client/view/uiNode'

const { ccclass } = _decorator
const FADE_TICKS = 180
const TICKS_PER_SECOND = 100

/** AwardScreen/HelpScreen draw-only fade: belongs to the page and never captures input. */
@ccclass('PageFade')
export class PageFade extends Component {
    private graphics!: Graphics
    private color!: Color
    private remainingTicks = FADE_TICKS

    static create(parent: Node, color: Color): void {
        const { node, graphics } = uiNode({ name: 'PageFade', parent, graphics: true, size: { width: 800, height: 600 } })
        const fade = node.addComponent(PageFade)
        fade.graphics = graphics!
        fade.color = color.clone()
        fade.draw()
    }

    protected update(dt: number): void {
        this.remainingTicks = Math.max(0, this.remainingTicks - gameClock.delta(dt) * TICKS_PER_SECOND)
        this.draw()
        if (this.remainingTicks === 0) this.node.destroy()
    }

    private draw(): void {
        this.color.a = Math.round(255 * this.remainingTicks / FADE_TICKS)
        this.graphics.clear()
        if (this.color.a === 0) return
        this.graphics.fillColor = this.color
        this.graphics.fillRect(-400, -300, 800, 600)
    }
}
