import { Color, Sprite, type SpriteFrame, UITransform } from 'cc'
import { uiNode } from './uiNode'

/**
 * A sprite blending one picture into another (`/time`'s change of time: a shadow, a crater, the house's door): the two
 * drawn in its place, on its node, at its size, anchor and trim, the old one over the new one, at its color's alpha by
 * `weight`. A picture that is see-through (a shadow) draws the new one at `weight` and the old at the rest, so its two
 * lie as dark as one. One that covers what is under it (a crater, a door, `cover`) draws the new one whole under the old
 * one going out, as the lawn's copy does: at half each, two would let half of what is under them through. Its own sprite
 * draws nothing meanwhile; blended itself, it would blend the pictures on it with it, its color's alpha going on to its
 * node's children (Batcher2D.walk).
 */
export class SpriteBlend {
    private pictures?: { from: Sprite, to: Sprite }

    constructor(private readonly sprite: Sprite, private readonly cover = false) {}

    /** `from` blends into `to` at `weight` (0 to 1). */
    show(from: SpriteFrame, to: SpriteFrame, weight: number): void {
        const sprite = this.sprite
        if (!sprite.isValid) return
        // The new one first, under the old one.
        const pictures = this.pictures ??= (() => {
            const under = this.picture(to)
            return { from: this.picture(from), to: under }
        })()
        sprite.enabled = false
        pictures.from.spriteFrame = from
        pictures.to.spriteFrame = to
        const { r, g, b, a } = sprite.color
        pictures.from.color = new Color(r, g, b, Math.round(a * (1 - weight)))
        pictures.to.color = new Color(r, g, b, this.cover ? a : Math.round(a * weight))
    }

    /** Its sprite draws itself again. */
    end(): void {
        const pictures = this.pictures
        if (!pictures) return
        for (const picture of [pictures.from, pictures.to]) if (picture.isValid) picture.node.destroy()
        this.pictures = undefined
        if (this.sprite.isValid) this.sprite.enabled = true
    }

    private picture(frame: SpriteFrame): Sprite {
        const sprite = this.sprite, { anchorX, anchorY, width, height } = sprite.node.getComponent(UITransform)!
        return uiNode({ name: 'BlendPicture', parent: sprite.node, anchor: { x: anchorX, y: anchorY }, size: { width, height },
            sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM, trim: sprite.trim } }).sprite!
    }
}
