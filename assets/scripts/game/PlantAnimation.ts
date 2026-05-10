import { _decorator, Component, Node, Vec3 } from 'cc'
import type { Animator } from '@/core/Animator/Animator'
import type { AnimNode } from '@/core/Animator/AnimNode'
import type { PlantType } from './GameTypes'

const { ccclass } = _decorator

export type PlantAnimationType =
    | PlantType
    | 'puffshroom'
    | 'sunshroom'
    | 'fumeshroom'
    | 'gravebuster'
    | 'hypnoshroom'
    | 'scaredyshroom'
    | 'iceshroom'
    | 'doomshroom'

const PLANT_IDLE_ANIM_RATE_MIN = 10
const PLANT_IDLE_ANIM_RATE_MAX = 15
const SHOOTER_IDLE_ANIM_RATE_MIN = 15
const SHOOTER_IDLE_ANIM_RATE_MAX = 20
const POTATO_MINE_IDLE_ANIM_RATE = 12
const POTATO_MINE_ARMED_ANIM_RATE_MIN = 12
const POTATO_MINE_ARMED_ANIM_RATE_MAX = 15
const CHERRYBOMB_EXPLODE_ANIM_RATE_MIN = 10
const CHERRYBOMB_EXPLODE_ANIM_RATE_MAX = 15

const PLANT_IDLE_ANIM_RATES: Partial<Record<PlantAnimationType, readonly [number, number]>> = {
    peashooter: [SHOOTER_IDLE_ANIM_RATE_MIN, SHOOTER_IDLE_ANIM_RATE_MAX],
    snowpea: [SHOOTER_IDLE_ANIM_RATE_MIN, SHOOTER_IDLE_ANIM_RATE_MAX],
    repeater: [SHOOTER_IDLE_ANIM_RATE_MIN, SHOOTER_IDLE_ANIM_RATE_MAX],
    potatomine: [POTATO_MINE_IDLE_ANIM_RATE, POTATO_MINE_IDLE_ANIM_RATE],
}

export interface PlantAnimationView {
    plantType: PlantAnimationType
    body: AnimNode | null
    head: AnimNode | null
    face: AnimNode | null
    face2: AnimNode | null
    glow: AnimNode | null
    idleSpeed: number
}

export interface WirePlantAnimationOptions {
    animated: boolean
    staticAnimTime: number
    includePotatoGlow?: boolean
    potatoInitialState?: 'idle' | 'armed'
    cherryBombInitialState?: 'idle' | 'explode'
    sunShroomInitialState?: 'small' | 'big' | 'sleep' | 'bigsleep'
    shakeNode?: Node | null
    enableCherryShake?: boolean
}

export function wirePlantAnimation(
    animator: Animator,
    view: PlantAnimationView,
    plantType: PlantAnimationType,
    options: WirePlantAnimationOptions,
) {
    const {
        animated,
        staticAnimTime,
        includePotatoGlow = true,
        potatoInitialState = 'idle',
        cherryBombInitialState = animated ? 'explode' : 'idle',
        sunShroomInitialState = 'small',
        shakeNode = null,
        enableCherryShake = true,
    } = options
    view.body = animator.addAnimNode('body')
    view.idleSpeed = getPlantIdleSpeed(view.body, plantType, animated)
    const playTime = animated ? 0 : getStaticAnimTime(view.body, 'anim_idle', staticAnimTime)

    switch (plantType) {
        case 'peashooter':
        case 'snowpea':
        case 'repeater':
            view.head = animator.addAnimNode('head')
            view.face = animator.addAnimNode('face')
            if (view.body && view.head) {
                view.head.attach({ node: view.body, slot: 'anim_stem' })
            }
            if (view.head && view.face) {
                view.face.attach({ node: view.head, slot: 'anim_face' })
            }
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            view.head?.play({ name: 'anim_head_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
        case 'sunflower':
            view.face = animator.addAnimNode('face')
            if (view.body && view.face) {
                view.face.attach({ node: view.body, slot: 'anim_idle' })
            }
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
        case 'puffshroom':
        case 'fumeshroom':
        case 'scaredyshroom':
        case 'iceshroom':
            view.face = animator.addAnimNode('face')
            if (view.body && view.face) {
                view.face.attach({ node: view.body, slot: 'anim_face' })
            }
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
        case 'sunshroom': {
            const initialAnim = getSunShroomInitialAnimation(sunShroomInitialState)
            const initialTime = animated ? 0 : getStaticAnimTime(view.body, initialAnim, staticAnimTime)
            view.idleSpeed = getPlantIdleSpeed(view.body, plantType, animated, initialAnim)
            view.face = animator.addAnimNode('face')
            if (view.body && view.face) {
                view.face.attach({ node: view.body, slot: 'anim_face' })
            }
            view.body?.play({ name: initialAnim, speed: animated ? view.idleSpeed : 0, time: initialTime, loop: true })
            break
        }
        case 'gravebuster':
        case 'hypnoshroom':
        case 'doomshroom':
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
        case 'potatomine':
            view.face = animator.addAnimNode('face')
            if (includePotatoGlow) {
                view.glow = animator.addAnimNode('glow')
            }
            if (view.body && view.face) {
                view.face.attach({ node: view.body, slot: 'anim_face' })
            }
            if (view.body && view.glow) {
                view.glow.showOnlyTrack('anim_glow')
                view.glow.attach({ node: view.body, slot: 'anim_light' })
            }
            if (potatoInitialState === 'armed') {
                playPotatoArmedAnimation(view, { includeGlow: includePotatoGlow })
            } else {
                view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            }
            break
        case 'chomper':
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
        case 'cherrybomb':
            if (animated && enableCherryShake && shakeNode) {
                enablePlantShake(shakeNode)
            }
            if (cherryBombInitialState === 'explode') {
                playCherryBombAnimation(view)
            } else {
                view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            }
            break
        case 'wallnut':
            view.face = animator.addAnimNode('face')
            if (view.body && view.face) {
                view.face.attach({ node: view.body, slot: 'anim_face' })
            }
            view.body?.play({ name: 'anim_idle', speed: animated ? view.idleSpeed : 0, time: playTime, loop: true })
            break
    }
}

export function enablePlantShake(node: Node, amount = 1) {
    const shake = node.getComponent(PlantShake) ?? node.addComponent(PlantShake)
    shake.amount = amount
}

@ccclass('PlantShake')
export class PlantShake extends Component {
    amount = 1
    private _basePosition = new Vec3()

    onEnable() {
        this._basePosition.set(this.node.position)
    }

    update() {
        this.node.setPosition(
            this._basePosition.x + Math.random() * this.amount * 2 - this.amount,
            this._basePosition.y + Math.random() * this.amount * 2 - this.amount,
            this._basePosition.z,
        )
    }
}

export function playCherryBombAnimation(view: PlantAnimationView) {
    const animRate =
        CHERRYBOMB_EXPLODE_ANIM_RATE_MIN +
        Math.random() * (CHERRYBOMB_EXPLODE_ANIM_RATE_MAX - CHERRYBOMB_EXPLODE_ANIM_RATE_MIN)
    view.body?.play({
        name: 'anim_explode',
        speed: getAnimationRateSpeed(view.body, 'anim_explode', animRate),
        keepLastFrame: true,
    })
}

export function playPotatoArmedAnimation(
    view: PlantAnimationView,
    options: { includeGlow?: boolean, blendTime?: number } = {},
) {
    const { includeGlow = true, blendTime = 0.1 } = options
    const animRate =
        POTATO_MINE_ARMED_ANIM_RATE_MIN +
        Math.random() * (POTATO_MINE_ARMED_ANIM_RATE_MAX - POTATO_MINE_ARMED_ANIM_RATE_MIN)
    view.body?.play({
        name: 'anim_armed',
        speed: getAnimationRateSpeed(view.body, 'anim_armed', animRate),
        loop: true,
        blendTime,
    })
    if (!includeGlow) return
    view.glow?.play({
        name: 'anim_glow',
        speed: getAnimationRateSpeed(view.glow, 'anim_glow', Math.max(0, animRate - 2)),
        loop: true,
        frameCountOverride: 10,
        truncateDisappearingFrames: false,
    })
}

export function getAnimationRateSpeed(node: AnimNode | null, animationName: string, animRate: number) {
    if (!node) return 0

    const fps = node.getAnimationFps(animationName) ?? 12
    if (fps <= 0) return 0

    return animRate / fps
}

export function getStaticAnimTime(node: AnimNode | null, animationName: string, normalizedTime: number) {
    if (!node || normalizedTime <= 0) return 0

    const duration = node.getAnimationDuration(animationName)
    if (!duration) return 0

    return Math.max(0, duration - 1) * normalizedTime
}

function getSunShroomInitialAnimation(initialState: NonNullable<WirePlantAnimationOptions['sunShroomInitialState']>) {
    switch (initialState) {
        case 'big':
            return 'anim_bigidle'
        case 'sleep':
            return 'anim_sleep'
        case 'bigsleep':
            return 'anim_bigsleep'
        case 'small':
        default:
            return 'anim_idle'
    }
}

function getPlantIdleSpeed(
    body: AnimNode | null,
    plantType: PlantAnimationType,
    animated: boolean,
    animationName = 'anim_idle',
) {
    if (!animated || !body) return 0

    const [minRate, maxRate] = PLANT_IDLE_ANIM_RATES[plantType] ?? [PLANT_IDLE_ANIM_RATE_MIN, PLANT_IDLE_ANIM_RATE_MAX]
    const animRate = minRate + Math.random() * (maxRate - minRate)
    return getAnimationRateSpeed(body, animationName, animRate)
}
