import { _decorator, error, log } from 'cc'
import { AnimationComponent } from '@/components/AnimationComponent'
import { AnimNode } from '@/core/Animator/AnimNode'

const { ccclass } = _decorator

@ccclass('Plant')
export class Plant extends AnimationComponent {
    body: AnimNode
    head: AnimNode
    face: AnimNode

    init() {
        this.body = this.animator.addAnimNode('body')!
        this.head = this.animator.addAnimNode('head')!
        this.face = this.animator.addAnimNode('face')!
        this.head.attach({
            node: this.body,
            slot: 'anim_stem',
        })
        this.face.attach({
            node: this.head,
            slot: 'anim_face',
        })
    }

    async shoot() {
        this.head.play({
            name: 'anim_shooting',
            speed: 35 / 12,
            blendTime: 0.2,
            keepLastFrame: true,
        })
        await this.delay(0.35)
        this.head.play({ name: 'anim_head_idle', blendTime: 0.2, speed: 1.25, loop: true })
    }

    blink() {
        this.face.play({
            name: 'anim_blink',
            keepLastFrame: false,
        })
    }

    idle() {
        this.body.play({
            name: 'anim_idle',
            speed: 1.25,
            loop: true,
        })
        this.head.play({
            name: 'anim_head_idle',
            speed: 1.25,
            loop: true,
        })
    }

    start() {
        this.init()
        this.idle()
        this.schedule(() => {
            this.shoot()
        }, 1.5)
        this.schedule(() => {
            this.blink()
        }, 5)
    }
}
