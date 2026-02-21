import { _decorator, Component, error, randomRangeInt, randomRange } from 'cc'
import { sp } from 'cc'
const { ccclass, property } = _decorator

type TrackCfg = {
    index: number
    anim: string
    timeScale?: number // 速度
    loop?: boolean // 是否循环
    randomStartMax?: number // 随机起始 trackTime 上限（秒）
}

@ccclass('SelectorScreen_OneSpine')
export class SelectorScreen_OneSpine extends Component {
    @property({ type: sp.Skeleton })
    spine: sp.Skeleton | null = null

    private TRACK = {
        OPEN: 0,
        SIGN: 0,
        GRASS: 10,
        CLOUD1: 1,
        CLOUD2: 2,
        CLOUD4: 3,
        CLOUD5: 4,
        CLOUD6: 5,
        HEAD_IDLE: 20,
        SHOOT: 21,
    }

    private onTrackComplete = new Map<number, (entry: sp.spine.TrackEntry) => void>()

    onLoad() {
        if (!this.spine) return
        this.spine.setCompleteListener((entry) => {
            const cb = this.onTrackComplete.get(entry.trackIndex)
            cb && cb(entry)
        })
    }

    private playTrack(cfg: TrackCfg) {
        if (!this.spine) return null

        const entry = this.spine.setAnimation(cfg.index, cfg.anim, !!cfg.loop)
        if (cfg.timeScale != null) entry.timeScale = cfg.timeScale
        if (cfg.randomStartMax != null && cfg.randomStartMax > 0) {
            entry.trackTime = randomRangeInt(0, Math.floor(cfg.randomStartMax))
        }
        return entry
    }

    private queueTrack(index: number, anim: string, loop: boolean, delay = 0) {
        if (!this.spine) return null
        return this.spine.addAnimation(index, anim, loop, delay)
    }

    playCloudsLoop() {
        if (!this.spine) {
            error('Spine is missing!')
            return
        }

        const clouds: TrackCfg[] = [
            {
                index: this.TRACK.CLOUD1,
                anim: 'anim_cloud1',
                timeScale: 0.03,
                loop: false,
                randomStartMax: 60,
            },
            {
                index: this.TRACK.CLOUD2,
                anim: 'anim_cloud2',
                timeScale: 0.03,
                loop: false,
                randomStartMax: 60,
            },
            {
                index: this.TRACK.CLOUD4,
                anim: 'anim_cloud4',
                timeScale: 0.03,
                loop: false,
                randomStartMax: 60,
            },
            {
                index: this.TRACK.CLOUD5,
                anim: 'anim_cloud5',
                timeScale: 0.03,
                loop: false,
                randomStartMax: 60,
            },
            {
                index: this.TRACK.CLOUD6,
                anim: 'anim_cloud6',
                timeScale: 0.03,
                loop: false,
                randomStartMax: 60,
            },
        ]

        for (const c of clouds) {
            this.playTrack(c)

            this.onTrackComplete.set(c.index, (entry) => {
                if (entry.animation.name !== c.anim) return

                const delay = randomRange(1, 5)
                this.scheduleOnce(() => {
                    const e = this.playTrack({ ...c, randomStartMax: 0 })
                    if (e) e.trackTime = 0
                }, delay)
            })
        }
    }

    playGrassLoop() {
        if (!this.spine) {
            error('Spine is missing!')
            return
        }

        const idx = this.TRACK.GRASS

        const entry = this.playTrack({ index: idx, anim: 'anim_grass', timeScale: 0.5, loop: true })
        if (!entry) return

        this.schedule(() => {
            const current = this.spine?.getCurrent(idx)
            if (current) current.timeScale = randomRange(0.2, 1.2)
        }, 4)
    }

    playOpenAnimation() {
        if (!this.spine) {
            error('Spine is missing!')
            return
        }

        this.playCloudsLoop()

        // this.spine.setMix('anim_open', 'anim_sign', 0.2)

        const idx = this.TRACK.OPEN

        this.playTrack({ index: idx, anim: 'anim_open', loop: false, timeScale: 1 })

        this.onTrackComplete.set(idx, (entry) => {
            const name = entry.animation.name

            if (name === 'anim_open') {
                const signEntry = this.spine!.setAnimation(idx, 'anim_sign', false)
                signEntry.timeScale = 1
                return
            }

            if (name === 'anim_sign') {
                entry.trackTime = entry.animationEnd
                entry.timeScale = 0

                this.playGrassLoop()
            }
        })
    }

    start() {
        this.playOpenAnimation()
    }
}
