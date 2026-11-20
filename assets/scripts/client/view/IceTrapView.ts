import { type Node, Sprite } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { uiNode } from '@/client/view/uiNode'
import type { IceTrapPlacement, IceTrapPresentation } from '@/shared/content/presentation'

/**
 * Zombie::DrawIceTrap: the block of ice a frozen plant or zombie stands in, its back (IMAGE_ICETRAP2) behind the
 * entity's picture and its front (IMAGE_ICETRAP) over it, both untinted, shown while its snapshot says it is frozen.
 * The two are in the node that holds the picture, the back just before it and the front last.
 */
export class IceTrapView {
    private constructor(private readonly back: Node, private readonly front: Node, private readonly placement: IceTrapPlacement) {}

    /** The ice around `picture`, a child of `parent`, at `placement` from the entity's corner; hidden until it is frozen. */
    static async create(parent: Node, picture: Node, look: IceTrapPresentation, placement: IceTrapPlacement): Promise<IceTrapView> {
        const [back, front] = await Promise.all([look.back, look.front].map(id => modResources.sprite(id)))
        const part = (name: string, frame: typeof back) => uiNode({
            name, parent, anchor: { x: 0, y: 1 }, active: false, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        const view = new IceTrapView(part('IceTrapBack', back), part('IceTrapFront', front), placement)
        view.back.setSiblingIndex(picture.getSiblingIndex())
        return view
    }

    /**
     * Shown while `frozen`, the front kept over what else came into the node since. `mirrorWidth`: the entity is drawn
     * turned round across that width by its own nodes, not by this one's, so the ice turns with it.
     */
    sync(frozen: boolean, mirrorWidth?: number): void {
        if (!this.back.isValid || !this.front.isValid) return
        this.back.active = this.front.active = frozen
        if (!frozen) return
        const { x, y, scale = 1 } = this.placement, mirrored = mirrorWidth !== undefined
        for (const node of [this.back, this.front]) {
            node.setPosition(mirrored ? mirrorWidth - x : x, -y)
            node.setScale(mirrored ? -scale : scale, scale, 1)
        }
        const last = this.front.parent!.children.length - 1
        if (this.front.getSiblingIndex() !== last) this.front.setSiblingIndex(last)
    }
}
