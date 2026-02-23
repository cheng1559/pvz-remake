import { _decorator, Component, JsonAsset, Node, UITransform, error } from 'cc'
import { Animator } from '../core/Animator'
import type { AnimNodeData } from '../core/Animator/Animator.d'

const { ccclass, property } = _decorator

@ccclass('AnimationComponent')
export class AnimationComponent extends Component {
    @property(JsonAsset)
    animation: JsonAsset = null!

    public animator: Animator = null!

    onLoad() {
        this.initAnimator()
    }

    protected onReady() {}

    protected delay(seconds: number): Promise<void> {
        return new Promise((resolve) => this.scheduleOnce(resolve, seconds))
    }

    private async initAnimator() {
        let animatorNode = this.node.getChildByName('Animator')
        if (!animatorNode) {
            animatorNode = new Node('Animator')
            this.node.addChild(animatorNode)
        }

        const uiTransform = this.node.getComponent(UITransform)
        if (uiTransform) {
            const width = uiTransform.width
            const height = uiTransform.height
            animatorNode.setPosition(-width / 2, height / 2, 0)
        }

        this.animator = animatorNode.getComponent(Animator) || animatorNode.addComponent(Animator)

        if (this.animation && this.animation.json) {
            await this.animator.parseJson(this.animation.json as Record<string, AnimNodeData>)
        } else {
            error('[AnimationComponent] Animation JSON asset is missing!')
        }

        this.onReady()
    }
}
