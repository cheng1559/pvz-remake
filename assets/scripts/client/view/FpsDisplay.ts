import { Color, Director, director, type Node } from 'cc'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from './uiNode'
import { uiAreaEdge } from './ClientViewport'

/** Counts completed draws against real time, independently of the game clock. */
export class FpsDisplay {
    private readonly node: Node
    private readonly label: UILabel
    private startedAt: number | null = null
    private frames = 0

    constructor(parent: Node, ui: UI) {
        this.node = uiNode({ name: 'FpsDisplay', parent, active: false }).node
        // Keep the original corner margin from the UI area's left edge.
        this.label = ui.label(uiAreaEdge(this.node, 'left'), { text: 'FPS: --', font: 'storeItem', color: Color.WHITE,
            x: -392, y: 295, baseline: true })
        this.label.node.name = 'FpsLabel'
        director.on(Director.EVENT_AFTER_DRAW, this.afterDraw, this)
    }

    update(visible: boolean): void {
        if (this.node.active !== visible) {
            this.node.active = visible
            this.reset()
        }
        if (visible && this.node.parent && this.node.getSiblingIndex() !== this.node.parent.children.length - 1) {
            this.node.setSiblingIndex(this.node.parent.children.length - 1)
        }
    }

    reset(): void {
        this.startedAt = null
        this.frames = 0
        this.label.text = 'FPS: --'
    }

    private afterDraw(): void {
        if (!this.node.active) return
        const now = performance.now()
        if (this.startedAt === null) { this.startedAt = now; return }
        this.frames++
        const elapsed = now - this.startedAt
        if (elapsed < 500) return
        this.label.text = `FPS: ${Math.round(this.frames * 1000 / elapsed)}`
        this.startedAt = now
        this.frames = 0
    }

    dispose(): void {
        director.off(Director.EVENT_AFTER_DRAW, this.afterDraw, this)
        this.node.destroy()
    }
}
