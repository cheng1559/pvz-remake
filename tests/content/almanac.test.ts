import { readGameplaySource } from '../../tools/mod/content'
import { presentationFixture } from '../client/presentationFixture'
import assert from 'node:assert/strict'
import test from 'node:test'
import { chooserSeeds, parseGameplayDefinitions } from '@/shared/content/gameplay'
import type { AnimationRandom } from '@/shared/content/animation'
import { startOffBoardPlant, stepPlantAnimation } from '@/shared/content/plantAnimation'
import { startOffBoardZombie } from '@/shared/content/zombieAnimation'
import { createAlmanacCatalog } from '@/server/menu/almanacCatalog'
import type { PlayerProfile } from '@/server/menu/profileStore'

const gameplay = parseGameplayDefinitions(readGameplaySource('definitions'))
/** Draws in turn from the values given, the last one from then on. */
const random = (...values: number[]): AnimationRandom => {
    const next = () => values.length > 1 ? values.shift()! : values[0]
    return { nextFloat: next, integer: (min, max) => min + Math.floor(next() * (max - min + 1)) }
}
const shown = (id: string, picture: 'offBoard' | 'packet' = 'offBoard') => {
    const packet = picture === 'packet' ? presentationFixture.plants[id].packet : undefined
    return startOffBoardPlant(gameplay.plants[id].animation!, random(0), { state: packet?.state, at: packet?.time })
}

test('every almanac card and window is a plant or a zombie its view can draw off the board, on its ground', () => {
    // The plant page is the chooser's grid; the zombie windows are the `almanac` table's.
    for (const seed of chooserSeeds(gameplay)) {
        const plant = gameplay.plants[seed], presentation = presentationFixture.plants[seed]
        assert.ok(plant?.animation && presentation, `${seed} has no plant to show`)
        assert.ok(presentationFixture.almanac[seed], `${seed} has no almanac ground`)
        const clips = presentation.clips!
        for (const picture of ['offBoard', 'packet'] as const) {
            const layers = shown(seed, picture).animations!
            assert.ok(Object.keys(plant.animation.layers)[0] in layers, `${seed}: nothing on its first layer`)
            for (const state of Object.values(layers)) assert.ok(state.clip in clips, `${seed}: no pictures for ${state.clip}`)
        }
    }
    assert.deepEqual(chooserSeeds(gameplay).filter(seed => presentationFixture.almanac[seed].ground === 'night'),
        ['pvz:puffshroom', 'pvz:sunshroom', 'pvz:fumeshroom', 'pvz:gravebuster', 'pvz:hypnoshroom'])
    for (const zombie of Object.keys(gameplay.almanac)) {
        const presentation = presentationFixture.zombies[zombie]
        assert.ok(presentation && presentationFixture.almanac[zombie], `${zombie} has no zombie to show`)
        assert.ok(presentation.portrait, `${zombie} has no small picture`)
        const clips = presentation.clips as unknown as Record<string, unknown>
        assert.ok(clips.idle, `${zombie} cannot stand`)
    }
})

test('a plant off the board starts as on it, in the state and with the clips it has there', () => {
    // Plant::PlantInitialize: the head sways with the body; the blink is counted down to as on the board.
    const pea = shown('pvz:peashooter')
    assert.deepEqual(pea.animations, { body: { clip: 'body', time: 0, rate: 15 }, head: { clip: 'idleHead', time: 0, rate: 15 } })
    assert.equal(pea.blinkTicks, 400)
    assert.equal(pea.state, undefined, 'a plant without an ability is in no state')
    // An armed mine at the 12 it is buried at, its light lit only in a packet's picture (its armed state's clips there);
    // a cherry bomb that is not going off; a grown sun-shroom at the small one's pace, small in its packet.
    const mine = shown('pvz:potatomine'), minePacket = shown('pvz:potatomine', 'packet')
    assert.deepEqual([mine.state, mine.animations], ['armed', { body: { clip: 'armed', time: 0, rate: 12 } }])
    assert.deepEqual([minePacket.state, minePacket.animations], ['armed', { body: { clip: 'armed', time: 0, rate: 12 }, light: { clip: 'glow', time: 0, rate: 12 } }])
    assert.deepEqual(shown('pvz:cherrybomb').animations, { body: { clip: 'idle', time: 0, rate: 10 } })
    const shroom = shown('pvz:sunshroom'), shroomPacket = shown('pvz:sunshroom', 'packet')
    assert.deepEqual([shroom.state, shroom.animations], ['big', { body: { clip: 'body', time: 0, rate: 10 } }])
    assert.deepEqual([shroomPacket.state, shroomPacket.animations], ['small', { body: { clip: 'small', time: 0, rate: 10 } }])
    // The grave buster stands at the 10 to 15 its landing goes at on the board, where that fits the ticks it lands in.
    const buster = gameplay.plants['pvz:gravebuster'].animation!
    assert.deepEqual(startOffBoardPlant(buster, random(1)).animations, { body: { clip: 'body', time: 0, rate: 15 } })
    assert.deepEqual(shown('pvz:gravebuster').animations, { body: { clip: 'body', time: 0, rate: 10 } })
    // DrawSeedType poses the sunflower 0.15 of the way to its last frame.
    assert.deepEqual(shown('pvz:sunflower', 'packet').animations, { body: { clip: 'body', time: 24 * 0.15, rate: 10 } })
})

test("a plant off the board is in a state of its own ability, on its animation's layers and clips", () => {
    const broken = (change: (plants: any) => void) => () => {
        const source = structuredClone(readGameplaySource('definitions')) as any
        change(source.plants)
        parseGameplayDefinitions(source)
    }
    assert.throws(broken(plants => { plants['pvz:sunshroom'].animation.offBoard = { state: 'armed' } }), /offBoard\.state must be a state of the plant's ability/)
    assert.throws(broken(plants => { plants['pvz:peashooter'].animation.offBoard = { state: 'big' } }), /offBoard\.state must be a state of the plant's ability/)
    assert.throws(broken(plants => { plants['pvz:cherrybomb'].animation.offBoard = { layers: { head: 'idle' } } }), /must be one of the animation's layers/)
    assert.throws(broken(plants => { plants['pvz:cherrybomb'].animation.offBoard = { layers: { body: 'missing' } } }), /must be one of the animation's clips/)
    assert.throws(broken(plants => { plants['pvz:cherrybomb'].animation.offBoard = {} }), /must have a state or layers/)
})

test('a plant off the board goes on by the rules of the board: its clip there loops, and a nut blinks one of its three ways', () => {
    const cherry = shown('pvz:cherrybomb'), animation = gameplay.plants['pvz:cherrybomb'].animation!
    for (let tick = 0; tick < 1000; tick++) stepPlantAnimation(animation, cherry, random(0))
    assert.deepEqual([cherry.animations!.body.clip, Math.round(cherry.animations!.body.time)], ['idle', 100], 'its idle goes round')
    const nut = shown('pvz:wallnut'), nutAnimation = gameplay.plants['pvz:wallnut'].animation!
    assert.equal(nut.blinkTicks, 1000)
    // The blink comes round, its ticks are drawn again (0), then the way it blinks: the last of 10 is the third.
    for (let tick = 0; tick < 1000; tick++) stepPlantAnimation(nutAnimation, nut, random(0, 0.95, 0))
    assert.equal(nut.animations!.blink.clip, 'blinkThrice')
})

test('a zombie off the board stands, three times in four its second way when it has one', () => {
    // Zombie::LoadReanim: Rand(4) > 0, then the pace of the clip it took (12 to 24 a second, 12 to 18 the first way),
    // then where in it it starts (0 to 0.99 of its 15 or 29 frames).
    const animation = (id: string) => gameplay.zombies[id].animation, drawn = () => true
    assert.deepEqual(startOffBoardZombie(animation('pvz:normal'), drawn, random(0.5, 1, 0.5)), { body: { clip: 'idle2', time: 15 * 0.495, rate: 24 } })
    assert.deepEqual(startOffBoardZombie(animation('pvz:conehead'), drawn, random(0, 0.5, 0)), { body: { clip: 'idle', time: 0, rate: 15 } })
    assert.equal(startOffBoardZombie(animation('pvz:newspaper'), drawn, random(0.5, 0)).body.clip, 'idle', 'a zombie with one way to stand takes it')
    assert.equal(startOffBoardZombie(animation('pvz:normal'), () => false, random(0.5, 0)).body.clip, 'idle', 'and so does one drawn without the second')
    // What it carries goes on as on the board: the flag zombie stands with its flag waving at 15 a second.
    assert.deepEqual(startOffBoardZombie(animation('pvz:flag'), drawn, random(0.5)).flag, { clip: 'flag', time: 0, rate: 15 })
    // Zombie.reanim has anim_idle2, and so has every zombie drawn on it; the newspaper's and the pole vaulter's have not.
    const second = (id: string) => 'idle2' in (presentationFixture.zombies[id].clips as object)
    assert.deepEqual(['normal', 'flag', 'conehead', 'buckethead', 'screendoor', 'newspaper', 'pole_vaulter'].map(id => second(`pvz:${id}`)),
        [true, true, true, true, true, false, false])
})

test('/cheatseed opens the whole almanac, with each Mod\'s seeds and then the hidden cards on the plant pages after the first', () => {
    const catalog = createAlmanacCatalog(gameplay)
    const fresh = { adventureLevel: 1, finishedAdventure: 0 } as PlayerProfile
    const plain = catalog.view(fresh, ['pvz:peashooter'], gameplay.seeds)
    assert.deepEqual([plain.plants.map(plant => plant.seed), plain.zombies.some(zombie => zombie.described), plain.groupPages],
        [['pvz:peashooter'], false, undefined])
    const { hidden: _hidden, ...zombie } = gameplay.seeds['pvz:normal']
    const seeds = { ...gameplay.seeds, 'test:pea': { ...gameplay.seeds['pvz:peashooter'], id: 'test:pea', position: 3 },
        'test:walker': { ...zombie, id: 'test:walker', position: 0 } }
    const cheating = catalog.view(fresh, ['pvz:peashooter'], seeds, true)
    assert.deepEqual(cheating.plants.map(plant => plant.seed), chooserSeeds(gameplay), 'every plant, owned or not')
    assert.ok(cheating.zombies.every(entry => entry.shown && entry.described), 'every zombie, described')
    const [mod, hidden] = cheating.groupPages!
    assert.deepEqual(mod, [
        { seed: 'test:walker', place: 0, cost: zombie.sunCost, refreshTime: zombie.cooldownTicks },
        { seed: 'test:pea', place: 3, cost: 100, refreshTime: 750 },
    ])
    assert.deepEqual(hidden.map(card => [card.seed, card.place, card.hidden]).slice(0, 4),
        [['pvz:explodenut', 0, true], ['pvz:bowling-wallnut', 1, true], ['pvz:bowling-explodenut', 2, true], ['pvz:normal', 8, true]])
    assert.equal(hidden.at(-1)!.seed, 'pvz:grave')
})
