import { Vec2, Vec3 } from 'cc'

interface ButtonConfig {
    name: string
    attached?: {
        trackName: string
        offsetX: number
        offsetY: number
        isReplaceTrack: boolean
    }
    absolute?: {
        x: number
        y: number
    }
    normalImage: string
    pressedImage: string
    offsetX?: number
    offsetY?: number
    width?: number
    height?: number
    polygon?: Vec2[]
    pressOffset?: Vec3
    spriteDir?: string
}

export type { ButtonConfig }
