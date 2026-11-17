import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { readBaseContent, readGameplaySource } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'

const gameplay = parseGameplayDefinitions(readGameplaySource('definitions'))
const reanims: Record<string, string> = readBaseContent().resources.reanim
const duration = (reanimId: string): number =>
    JSON.parse(readFileSync(join('mods/pvz-base', reanims[reanimId]), 'utf8')).durationSeconds

test("a clip's pictures go at their Reanim's own pace: as many of its frames as the animation's clip has", () => {
    const mismatched: string[] = [], checked: string[] = []
    for (const kind of ['plants', 'zombies'] as const) {
        for (const [id, definition] of Object.entries(gameplay[kind])) {
            const clips: Record<string, { frames: number }> = definition.animation?.clips ?? {}
            const pictures = (presentationFixture[kind][id]?.clips ?? {}) as Record<string, { reanimId?: unknown, fps?: number, rateScale?: number }>
            for (const [name, clip] of Object.entries(clips)) {
                const picture = pictures[name]
                const reanimId = picture?.reanimId
                if (typeof reanimId !== 'string' || !reanims[reanimId]) continue
                // The client's frame of a picture (layerPlayback's secondsPerFrame): `rateScale` over its `fps`, 12 without.
                const frames = duration(reanimId) * (picture.fps ?? 12) / (picture.rateScale ?? 1)
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
