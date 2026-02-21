import { SpriteFrame } from 'cc'

interface Frame {
    frameIndex: number
    x: number
    y: number
    sx: number
    sy: number
    kx: number
    ky: number
}

type TrackFrame = Frame & {
    alpha: number
    image: string | null
}

interface Animation {
    fps: number
    startFrame: number
    endFrame: number
    duration: number
}

interface Slot {
    frames: Frame[]
}

interface Track {
    frames: TrackFrame[]
    z: number
}

interface AnimNode {
    animations: Record<string, Animation>
    slots: Record<string, Slot>
    tracks: Record<string, Track>
}

// interface IAnimator {
//     getAnimNode(name: string): AnimNode | undefined
//     getTrackNode(name: string, z: number): import('cc').Node
//     getSpriteFrame(name: string): SpriteFrame | undefined
//     play(name: string, loop?: boolean): void
// }

export type { AnimNode, Animation, Slot, Track, TrackFrame }
