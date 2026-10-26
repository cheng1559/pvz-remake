import { director, Director } from 'cc'

export function waitForPreloadFrame(): Promise<void> {
    return new Promise(resolve => director.once(Director.EVENT_AFTER_DRAW, () => setTimeout(resolve, 0)))
}

/** Prepare UI and cached animations in frame-sized work slices. */
export async function preloadTasks(tasks: (() => Promise<unknown>)[], onProgress: (progress: number) => void = () => {}): Promise<void> {
    let completed = 0
    let frame = director.getTotalFrames()
    let deadline = Date.now() + 8
    for (const task of tasks) {
        while (true) {
            const currentFrame = director.getTotalFrames()
            if (currentFrame !== frame) { frame = currentFrame; deadline = Date.now() + 8 }
            if (Date.now() < deadline) break
            await waitForPreloadFrame()
        }
        await task()
        onProgress(++completed / tasks.length)
    }
    onProgress(1)
}
