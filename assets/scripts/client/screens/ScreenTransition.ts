import { BlockInputEvents, Node, tween, type Tween } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { startGameTween } from '@/core/GameTween'
import { UIHoverManager } from '@/client/input/UIHoverManager'

type CommitPage = () => void | Promise<void>

/** Locks input only while preparing/committing a page or sliding achievements. */
export class ScreenTransition {
    private readonly cover: Node
    private animation: Tween<{ progress: number }> | null = null
    private completeAnimation: (() => void) | null = null
    private disposed = false

    constructor(parent: Node) {
        const cover = uiNode({
            name: 'ScreenTransition', parent, size: { width: 800, height: 600 },
            active: false,
        })
        cover.node.addComponent(BlockInputEvents)
        this.cover = cover.node
    }

    async run(prepare: () => Promise<CommitPage>): Promise<void> {
        if (this.disposed) return
        this.cover.setSiblingIndex(this.cover.parent!.children.length - 1)
        this.cover.active = true
        UIHoverManager.beginInputBlock()
        try {
            const commit = await prepare()
            if (this.disposed) return
            await commit()
        } finally {
            if (!this.disposed) this.cover.active = false
            UIHoverManager.endInputBlock()
        }
    }

    async slide(previous: Node, next: Node, direction: 'up' | 'down'): Promise<void> {
        const showing = direction === 'up'
        const selector = showing ? previous : next
        const achievements = showing ? next : previous
        await this.animate(0.75, progress => {
            if (!selector.isValid || !achievements.isValid) return
            const curve = (t: number) => t * t * (3 - 2 * t)
            const offset = 600 * curve(curve(progress))
            selector.setPosition(0, showing ? offset : 600 - offset)
            // One pixel of overlap matches the original and avoids a seam between the pages.
            achievements.setPosition(0, showing ? -599 + offset : 1 - offset)
        })
    }

    dispose(): void {
        this.disposed = true
        this.animation?.stop()
        this.completeAnimation?.()
        this.cover.destroy()
    }

    private animate(seconds: number, update: (progress: number) => void): Promise<void> {
        if (this.disposed) return Promise.resolve()
        update(0)
        return new Promise(resolve => {
            const progress = { progress: 0 }
            this.completeAnimation = () => {
                this.animation = null
                this.completeAnimation = null
                resolve()
            }
            this.animation = startGameTween(this.cover, tween(progress).to(seconds, { progress: 1 }, {
                onUpdate: () => update(progress.progress),
            }).call(() => this.completeAnimation?.()))
        })
    }
}
