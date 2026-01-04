import { _decorator, Component, JsonAsset, resources, error } from 'cc'
import { Animator } from './components/Animator'

const { ccclass, property } = _decorator

@ccclass('TestSetup')
export class TestSetup extends Component {
    @property(Animator)
    plant: Animator = null!

    start() {
        this.plant.play('anim_open', 1, false, 0).play('anim_sign', 1.5, true, 0, () => {
            this.plant.loop('anim_grass', 0.5, 0, false, 0)
            this.plant.play('anim_cloud1', 0.03, false, 0, () => {})
            this.plant.play('anim_cloud2', 0.03, false, 0, () => {})
            this.plant.play('anim_cloud4', 0.03, false, 0, () => {})
            this.plant.play('anim_cloud5', 0.03, false, 0, () => {})
            this.plant.play('anim_cloud6', 0.03, false, 0, () => {})
        })
        return

        // this.plant.loop('anim_idle')
        // this.plant.loop('anim_head_idle1')
        // this.plant.loop('anim_head_idle2')
        // this.plant.loop('anim_head_idle3')

        // const shoot1 = () => {
        //     this.plant.play('anim_shooting1', 2.0).loop('anim_head_idle1', 1.0, 1000, () => {
        //         shoot1()
        //     })
        // }

        // const shoot2 = () => {
        //     this.plant.play('anim_shooting2', 2.0).loop('anim_head_idle2', 1.0, 1000, () => {
        //         shoot2()
        //     })
        // }

        // const shoot3 = () => {
        //     this.plant.play('anim_shooting3', 2.0).loop('anim_head_idle3', 1.0, 1000, () => {
        //         shoot3()
        //     })
        // }

        // shoot1()
        // shoot2()
        // shoot3()

        // this.plant.play('default', true)
        // this.plant.loop('anim_idle')
        // this.plant.loop('anim_head_idle')
        // this.plant.loop('anim_head_idle1')
        // this.plant.loop('anim_head_idle2')
        // this.plant.loop('anim_head_idle3')
        // this.plant.play('anim_blink1',)
        // this.plant.play('anim_blink2')
        // this.plant.play('anim_blink3')
        // this.plant.play('anim_shooting')
        // setInterval(() => {
        //     this.plant.play('anim_blink1')
        //     this.plant.play('anim_blink2')
        //     this.plant.play('anim_blink3')
        // }, 1000)
        // setInterval(() => {
        //     // this.plant
        //     //     .play('anim_rise')
        //     //     .loop('anim_idlehigh', 1.0, 1000)
        //     //     .play('anim_shootinghigh')
        //     //     .play('anim_lower')
        //     //     .loop('anim_idle', 1.0)
        //     //     .play('anim_shooting')
        //     this.plant.play('anim_shooting1', 2.0).loop('anim_head_idle1')
        //     this.plant.play('anim_shooting2', 2.0).loop('anim_head_idle2')
        //     this.plant.play('anim_shooting3', 2.0).loop('anim_head_idle3')
        // }, 6000)
        // this.plant.play('anim_blink', false)
    }
}
