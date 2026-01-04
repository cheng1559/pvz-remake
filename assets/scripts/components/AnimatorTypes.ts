import { Mat4 } from 'cc'

export interface AnimFrame {
    x: number
    y: number
    sx: number
    sy: number
    kx: number
    ky: number
    alpha: number
    image: string
}

export interface AnimResource {
    name: string
    z: number
    data: (AnimFrame | null)[]
}

export interface Animation {
    name: string
    parent: string | null
    fps: number
    frames: number
    resources: AnimResource[]
}

export interface AnimState {
    anim: Animation
    time: number
    parentResourceName: string | null
    bindInverseMatrix: Mat4 | null
    loop: boolean
    speed: number
    duration: number
    elapsedTotal: number
    onFinish?: () => void
}

export interface IAnimationController {
    _executeAnim(
        name: string,
        loop: boolean,
        speed: number,
        onFinish?: () => void,
        duration?: number,
    ): Promise<void>
}
