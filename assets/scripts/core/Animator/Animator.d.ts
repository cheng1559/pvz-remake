import { SpriteFrame } from 'cc'

interface FrameData {
    frameIndex: number
    x: number
    y: number
    sx: number
    sy: number
    kx: number
    ky: number
}

type TrackFrameData = FrameData & {
    alpha: number
    image: string | null
}

interface AnimationData {
    fps: number
    startFrame: number
    endFrame: number
    duration: number
}

interface SlotData {
    frames: FrameData[]
}

interface TrackData {
    frames: TrackFrameData[]
    zIndex: number
}

interface AnimNodeData {
    animations: Record<string, AnimationData>
    slots: Record<string, SlotData>
    tracks: Record<string, TrackData>
}

export type { FrameData, AnimNodeData, AnimationData, SlotData, TrackData, TrackFrameData }
