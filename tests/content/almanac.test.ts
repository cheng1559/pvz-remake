import { readGameplaySource } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { type AnimationRandom, startOffBoardPlant, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { offBoardZombieAnimation } from '@/shared/content/zombieAnimation'

const gameplay = parseGameplayDefinitions(readGameplaySource('definitions'), readGameplaySource('seed-catalog'))
const almanac = readGameplaySource('almanac') as { plants: Array<{ id: number, key: string, seed: string }>, zombies: Array<{ id: number, key: string, zombie: string }> }
/** Draws in turn from the values given, the last one from then on. */
const random = (...values: number[]): AnimationRandom => {
    const next = () => values.length > 1 ? values.shift()! : values[0]
    return { nextFloat: next, integer: (min, max) => min + Math.floor(next() * (max - min + 1)) }
}
const shown = (id: string, picture: 'offBoard' | 'packet' = 'offBoard') => {
    const presentation = presentationFixture.plants[id]
    return startOffBoardPlant(gameplay.plants[id].animation!, { ...presentation.offBoard, ...(picture === 'packet' ? presentation.packet?.clips : {}) },
        random(0), picture === 'packet' ? presentation.packet?.time : 0)
}

test('every almanac entry is a plant or a zombie its view can draw off the board', () => {
    for (const entry of almanac.plants) {
        const plant = gameplay.plants[entry.seed], presentation = presentationFixture.plants[entry.seed]
        assert.ok(plant?.animation && presentation, `${entry.key} has no plant to show`)
        const clips = presentation.animations ?? presentationFixture.plants[presentation.animationsFrom!].animations!
        for (const picture of ['offBoard', 'packet'] as const) {
            const layers = shown(entry.seed, picture).animations!
            assert.ok(Object.keys(plant.animation.layers)[0] in layers, `${entry.key}: nothing on its first layer`)
            for (const state of Object.values(layers)) assert.ok(state.clip in clips, `${entry.key}: no pictures for ${state.clip}`)
        }
    }
    for (const entry of almanac.zombies) {
        const presentation = presentationFixture.zombies[entry.zombie]
        assert.ok(gameplay.zombies[entry.zombie] && presentation, `${entry.key} has no zombie to show`)
        assert.ok(presentation.portrait, `${entry.key} has no small picture`)
        const clips = (presentation.animations ?? presentationFixture.zombies[presentation.animationsFrom!].animations!) as unknown as Record<string, unknown>
        assert.ok(clips.idle, `${entry.key} cannot stand`)
    }
})

test('a plant off the board starts as on it and shows the clips it has there', () => {
    // Plant::PlantInitialize: the head sways with the body; the blink is counted down to as on the board.
    const pea = shown('pvz:peashooter')
    assert.deepEqual(pea.animations, { body: { clip: 'body', time: 0, rate: 15 }, head: { clip: 'idleHead', time: 0, rate: 15 } })
    assert.equal(pea.blinkTicks, 400)
    // An armed mine at the 12 it is buried at, its light lit only in a packet's picture; a cherry bomb that is not
    // going off; a grown sun-shroom at the small one's pace, small in its packet.
    assert.deepEqual(shown('pvz:potatomine').animations, { body: { clip: 'armed', time: 0, rate: 12 } })
    assert.deepEqual(shown('pvz:potatomine', 'packet').animations, { body: { clip: 'armed', time: 0, rate: 12 }, light: { clip: 'glow', time: 0, rate: 12 } })
    assert.deepEqual(shown('pvz:cherrybomb').animations, { body: { clip: 'idle', time: 0, rate: 10 } })
    assert.deepEqual(shown('pvz:sunshroom').animations, { body: { clip: 'body', time: 0, rate: 10 } })
    assert.deepEqual(shown('pvz:sunshroom', 'packet').animations, { body: { clip: 'small', time: 0, rate: 10 } })
    // The grave buster stands at the 10 to 15 its landing goes at on the board, where that fits the ticks it lands in.
    const buster = gameplay.plants['pvz:gravebuster'].animation!, standing = presentationFixture.plants['pvz:gravebuster'].offBoard
    assert.deepEqual(startOffBoardPlant(buster, standing, random(1)).animations, { body: { clip: 'body', time: 0, rate: 15 } })
    assert.deepEqual(shown('pvz:gravebuster').animations, { body: { clip: 'body', time: 0, rate: 10 } })
    // DrawSeedType poses the sunflower 0.15 of the way to its last frame.
    assert.deepEqual(shown('pvz:sunflower', 'packet').animations, { body: { clip: 'body', time: 24 * 0.15, rate: 10 } })
})

test('a plant off the board goes on by the rules of the board: a clip of the presentation loops, and a nut blinks one of its three ways', () => {
    const cherry = shown('pvz:cherrybomb'), animation = gameplay.plants['pvz:cherrybomb'].animation!
    for (let tick = 0; tick < 1000; tick++) stepPlantAnimation(animation, cherry, random(0))
    assert.deepEqual([cherry.animations!.body.clip, Math.round(cherry.animations!.body.time)], ['idle', 100], 'its idle is not a clip of the animation, and goes round')
    const nut = shown('pvz:wallnut'), nutAnimation = gameplay.plants['pvz:wallnut'].animation!
    assert.equal(nut.blinkTicks, 1000)
    // The blink comes round, its ticks are drawn again (0), then the way it blinks: the last of 10 is the third.
    for (let tick = 0; tick < 1000; tick++) stepPlantAnimation(nutAnimation, nut, random(0, 0.95, 0))
    assert.equal(nut.animations!.blink.clip, 'blinkThrice')
})

test('a zombie off the board stands, three times in four its second way when it has one', () => {
    // Zombie::LoadReanim: Rand(4) > 0, then the pace of the clip it took, then where in it it starts.
    assert.deepEqual(offBoardZombieAnimation(true, random(0.5, 1, 0.5)), { animation: 'anim_idle2', animationTime: 0, animationSpeed: 2, start: 0.495 })
    assert.deepEqual(offBoardZombieAnimation(true, random(0, 0.5, 0)), { animation: 'anim_idle', animationTime: 0, animationSpeed: 1.25, start: 0 })
    assert.equal(offBoardZombieAnimation(false, random(0.5, 0)).animation, 'anim_idle', 'a zombie with one way to stand takes it')
    // Zombie.reanim has anim_idle2, and so has every zombie drawn on it; the newspaper's and the pole vaulter's have not.
    const second = (id: string) => 'idle2' in (presentationFixture.zombies[id].animations as object)
    assert.deepEqual(['normal', 'flag', 'conehead', 'buckethead', 'screendoor', 'newspaper', 'pole_vaulter'].map(id => second(`pvz:${id}`)),
        [true, true, true, true, true, false, false])
})
