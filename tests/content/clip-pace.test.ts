import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { readBaseContent, readGameplaySource } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'

const gameplay = parseGameplayDefinitions(readGameplaySource('definitions'))
const reanims: Record<string, string> = readBaseContent().resources.reanim
/** How many frames of its own a Reanim is, at the pace it was made at (Reanim.fps). */
const ownFrames = (reanimId: string): number => {
    const { durationSeconds, fps } = JSON.parse(readFileSync(join('mods/pvz-base', reanims[reanimId]), 'utf8'))
    return durationSeconds * fps
}

test("a clip's pictures go at their Reanim's own pace: as many of its frames as the animation's clip has", () => {
    const mismatched: string[] = [], checked: string[] = []
    for (const kind of ['plants', 'zombies'] as const) {
        for (const [id, definition] of Object.entries(gameplay[kind])) {
            const clips: Record<string, { frames: number }> = definition.animation?.clips ?? {}
            const pictures = (presentationFixture[kind][id]?.clips ?? {}) as Record<string, { reanimId?: unknown, rateScale?: number }>
            for (const [name, clip] of Object.entries(clips)) {
                const picture = pictures[name]
                const reanimId = picture?.reanimId
                if (typeof reanimId !== 'string' || !reanims[reanimId]) continue
                // The client's frames of a picture (layerPlayback): its Reanim's own, over its `rateScale`.
                const frames = ownFrames(reanimId) / (picture.rateScale ?? 1)
                checked.push(`${id} ${name}`)
                // A still (the potato mine's light) is held for the whole clip.
                if (Math.abs(frames - clip.frames) > 0.01 && Math.abs(frames - 1) > 0.01) mismatched.push(`${id} ${name}: ${clip.frames} frames, its pictures ${frames}`)
            }
        }
    }
    assert.deepEqual(mismatched, [])
    // The dancers' Reanims are made at 24 frames a second, the cherry bomb's at 30, most at 12.
    for (const clip of ['pvz:dancer moonwalk', 'pvz:backup_dancer walk', 'pvz:cherrybomb explode', 'pvz:normal walk']) assert.ok(checked.includes(clip), clip)
})
