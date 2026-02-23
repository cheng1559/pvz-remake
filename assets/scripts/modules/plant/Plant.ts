import { _decorator, error, log } from 'cc'
import { AnimationComponent } from '@/components/AnimationComponent'
import { AnimNode } from '@/core/Animator/AnimNode'

const { ccclass } = _decorator

@ccclass('Plant')
export class Plant extends AnimationComponent {
    body: AnimNode
    head1: AnimNode
    head2: AnimNode
    head3: AnimNode
    face1: AnimNode
    face2: AnimNode
    face3: AnimNode

    init() {
        this.body = this.animator.addAnimNode('body')!
        this.head1 = this.animator.addAnimNode('head1')!
        this.head2 = this.animator.addAnimNode('head2')!
        this.head3 = this.animator.addAnimNode('head3')!
        this.face1 = this.animator.addAnimNode('face1')!
        this.face2 = this.animator.addAnimNode('face2')!
        this.face3 = this.animator.addAnimNode('face3')!
        this.head1.attach({
            node: this.body,
            slot: 'anim_head1',
        })
        this.head2.attach({
            node: this.body,
            slot: 'anim_head2',
        })
        this.head3.attach({
            node: this.body,
            slot: 'anim_head3',
        })
        this.face1.attach({
            node: this.head1,
            slot: 'anim_face1',
        })
        this.face2.attach({
            node: this.head2,
            slot: 'anim_face2',
        })
        this.face3.attach({
            node: this.head3,
            slot: 'anim_face3',
        })
    }

    async shoot() {
        this.head1.play({
            name: 'anim_shooting1',
            speed: 3.75,
            blendTime: 0.2,
            keepLastFrame: true,
        })
        await this.delay(0.25)
        this.head1.play({
            name: 'anim_shooting1',
            speed: 3.75,
            blendTime: 0.2,
            keepLastFrame: true,
        })
        await this.delay(0.25)
        this.head1.play({ name: 'anim_head_idle1', blendTime: 0.2, speed: 1.25, loop: true })
    }

    blink() {
        this.face1.play({
            name: 'anim_blink1',
            keepLastFrame: false,
        })
        this.face2.play({
            name: 'anim_blink2',
            keepLastFrame: false,
        })
        this.face3.play({
            name: 'anim_blink3',
            keepLastFrame: false,
        })
    }

    idle() {
        this.body.play({
            name: 'anim_idle',
            speed: 1.5,
            loop: true,
        })
        this.head1.play({
            name: 'anim_head_idle1',
            speed: 1.25,
            loop: true,
        })
        this.head2.play({
            name: 'anim_head_idle2',
            speed: 1.25,
            loop: true,
        })
        this.head3.play({
            name: 'anim_head_idle3',
            speed: 1.25,
            loop: true,
        })
    }

    onReady() {
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
