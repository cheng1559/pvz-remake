import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { levelSkySun, parseGameplayDefinitions, parseGameplayLevels, TIME_CHANGE_TICKS, TIME_SWITCH_TICKS } from '@/shared/content/gameplay'
import { TICK_SECONDS, type PlantSnapshot } from '@/shared/protocol'
import { PLANT_WAKE_TICKS } from '@/shared/content/plantKinds'
import { readGameplaySource } from '../../tools/mod/content'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const levels = parseGameplayLevels(readGameplaySource('levels'), definitions)
const options = { randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] }

/** A replay of `levelId` in play, `run` ticks on. */
function play(levelId: string, game = new LocalIntegratedGame(definitions, levels, undefined, true)) {
    game.start({ ...options, levelId })
    game.command({ type: 'completeIntro' })
    game.update(0)
    return game
}
const run = (game: LocalIntegratedGame, ticks = 1) => { for (let tick = 0; tick < ticks; tick++) game.update(TICK_SECONDS) }
const plant = (game: LocalIntegratedGame, typeId: string) => game.render().plants.find(each => each.typeId === typeId)
const clips = (shown: PlantSnapshot) => Object.entries(shown.animations!).map(([layer, state]) => [layer, state.clip])
const skySun = (game: LocalIntegratedGame) => (game.saveAtBoundary() as { skySun: { atTick?: number } }).skySun.atTick
/** `/time name`, and the lawn's change to it run through (TIME_CHANGE_TICKS). */
function changeTime(game: LocalIntegratedGame, name: string) {
    assert.ok(game.debugCommand(`/time ${name}`).ok)
    run(game, TIME_CHANGE_TICKS)
}
const yard = definitions.boards['pvz:frontyard']

test('/time turns the lawn a tick at a time to the time named, the level going on at it halfway; none while the lawn turns', () => {
    const game = play('pvz:sandbox-day')
    const shown = (of = game) => [of.render().time, of.render().timeChange]
    assert.equal(game.render().time, undefined, 'a level at its own time names none')
    game.drainEvents()
    assert.ok(game.debugCommand('/time NIGHT').ok, 'named in any case')
    run(game)
    assert.deepEqual(shown(), [undefined, { from: 'day', to: 'night', ticks: 1 }], 'at its own time while the lawn turns')
    // None while the lawn turns: neither back, nor on.
    for (const name of ['day', 'night']) {
        assert.deepEqual(game.debugCommand(`/time ${name}`), { ok: false, failure: 'condition', key: 'DEBUG_TIME_CHANGING' })
    }
    run(game, TIME_SWITCH_TICKS - 2)
    assert.deepEqual(shown(), [undefined, { from: 'day', to: 'night', ticks: TIME_SWITCH_TICKS - 1 }])
    assert.equal(game.drainEvents().some(event => event.type === 'timeChanged'), false)
    run(game)
    assert.deepEqual(shown(), ['night', { from: 'day', to: 'night', ticks: TIME_SWITCH_TICKS }], 'halfway, the level is at the time it turns to')
    assert.deepEqual(game.drainEvents().filter(event => event.type === 'timeChanged').map(event => event.data), [{ time: 'night' }])
    // A save keeps the time and where the lawn is.
    const midway = new LocalIntegratedGame(definitions, levels, undefined, true)
    midway.start({ ...options, levelId: 'pvz:sandbox-day', save: game.saveAtBoundary() })
    run(midway)
    assert.deepEqual(shown(midway), ['night', { from: 'day', to: 'night', ticks: TIME_SWITCH_TICKS + 1 }])
    run(game, TIME_CHANGE_TICKS - TIME_SWITCH_TICKS - 1)
    assert.deepEqual(shown(), ['night', { from: 'day', to: 'night', ticks: TIME_CHANGE_TICKS - 1 }])
    run(game)
    assert.deepEqual(shown(), ['night', undefined], 'turned all the way')
    assert.equal(game.drainEvents().some(event => event.type === 'timeChanged'), false, 'at the time already')
    // A save keeps it.
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, levelId: 'pvz:sandbox-day', save: game.saveAtBoundary() })
    assert.equal(restored.render().time, 'night')
    assert.ok(game.debugCommand('/time night').ok, 'the time it is at')
    run(game)
    assert.equal(game.render().timeChange, undefined, 'turns nothing')
    changeTime(game, 'day')
    assert.deepEqual(shown(), [undefined, undefined])
    // None its board has not: neither a time no board has, nor the night of the yard 1-1 to 1-4 lay their sod over.
    assert.deepEqual(game.debugCommand('/time dusk'), { ok: false, failure: 'condition', key: 'DEBUG_TIME_NOT_ON_BOARD', args: ['dusk'] })
    assert.deepEqual(['1-1', '1-2', '1-3', '1-4', '1-5'].map(level => levels.levels[`pvz:adventure-${level}`].board),
        [...Array(4).fill('pvz:frontyard-unsodded'), 'pvz:frontyard'])
    assert.deepEqual(Object.keys(definitions.boards['pvz:frontyard-unsodded'].times), ['day'], 'by day only: no night lies unsodded')
    // A board's other time.
    const dusky = { ...definitions, boards: { ...definitions.boards, 'pvz:frontyard': { ...yard, times: { ...yard.times, dusk: yard.times.night } } } }
    const other = play('pvz:sandbox-day', new LocalIntegratedGame(dusky, parseGameplayLevels(readGameplaySource('levels'), dusky), undefined, true))
    changeTime(other, 'dusk')
    assert.deepEqual(shown(other), ['dusk', undefined])
    // A save at a time its board has no more does not load.
    const save = other.saveAtBoundary()
    assert.throws(() => new LocalIntegratedGame(definitions, levels, undefined, true).start({ ...options, levelId: 'pvz:sandbox-day', save }),
        /time of day is not on its board: dusk/)
})

test('a mushroom wakes in its own 70 ticks as the time turns to night, and falls asleep at once as it turns to day (Plant::SetSleeping)', () => {
    const game = play('pvz:sandbox-day')
    assert.ok(game.debugCommand('/plant puffshroom 3 3').ok)
    run(game)
    const asleep = [['body', 'sleep'], ['sleeping', 'sleeping']]
    assert.deepEqual([plant(game, 'pvz:puffshroom')!.asleep, clips(plant(game, 'pvz:puffshroom')!)], [true, asleep])
    game.drainEvents()
    assert.ok(game.debugCommand('/time night').ok)
    run(game, TIME_SWITCH_TICKS - 1)
    assert.deepEqual([plant(game, 'pvz:puffshroom')!.asleep, plant(game, 'pvz:puffshroom')!.waking], [true, undefined], 'asleep until the lawn has turned halfway')
    run(game)
    assert.equal(plant(game, 'pvz:puffshroom')!.waking, 69, 'the tick the level goes on at night, its waking has begun')
    // Plant::mWakeUpCounter: asleep, its Zs on, until its waking runs out.
    run(game, 68)
    const waking = plant(game, 'pvz:puffshroom')!
    assert.deepEqual([waking.asleep, waking.waking, clips(waking)], [true, 1, asleep])
    assert.equal(game.drainEvents().some(event => event.type === 'plantAwoke'), false)
    run(game)
    const awake = plant(game, 'pvz:puffshroom')!
    assert.deepEqual([awake.asleep, awake.waking, clips(awake)], [undefined, undefined, [['body', 'body']]], 'its own clip, the Zs gone')
    assert.deepEqual(game.drainEvents().filter(event => event.type === 'plantAwoke').map(event => event.data.typeId), ['pvz:puffshroom'])
    assert.ok(game.debugCommand('/time day').ok)
    run(game, TIME_SWITCH_TICKS - 1)
    assert.equal(plant(game, 'pvz:puffshroom')!.asleep, undefined, 'awake until the lawn has turned halfway')
    run(game)
    assert.equal(plant(game, 'pvz:puffshroom')!.asleep, true)
    assert.deepEqual(clips(plant(game, 'pvz:puffshroom')!), [['body', 'sleep'], ['sleeping', 'sleeping']])
    assert.equal(game.drainEvents().some(event => event.type === 'plantAwoke'), false, 'falling asleep is not heard')
})

test('a save keeps a mushroom waking as the lawn turns to night', () => {
    const game = play('pvz:sandbox-day')
    assert.ok(game.debugCommand('/plant puffshroom 3 3').ok)
    run(game)
    assert.ok(game.debugCommand('/time night').ok)
    run(game, TIME_SWITCH_TICKS + 30)
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, levelId: 'pvz:sandbox-day', save: game.saveAtBoundary() })
    const waking = plant(game, 'pvz:puffshroom')!.waking!
    assert.ok(waking > 0 && waking < 70)
    assert.deepEqual([plant(restored, 'pvz:puffshroom')!.asleep, plant(restored, 'pvz:puffshroom')!.waking], [true, waking])
    assert.deepEqual(restored.render().timeChange, game.render().timeChange)
})

test('a doom-shroom woken by the night lights its fuse as it wakes, burns its whole fuse, and no day sends it to sleep', () => {
    const game = play('pvz:sandbox-day')
    assert.ok(game.debugCommand('/plant doomshroom 3 3').ok)
    run(game, 50)
    assert.equal(plant(game, 'pvz:doomshroom')!.asleep, true, 'asleep, its fuse waits')
    assert.ok(game.debugCommand('/time night').ok)
    run(game, TIME_SWITCH_TICKS + 68)
    assert.equal(plant(game, 'pvz:doomshroom')!.asleep, true, 'waking')
    run(game)
    assert.deepEqual(clips(plant(game, 'pvz:doomshroom')!), [['body', 'explode']], 'Plant::UpdateDoomShroom: anim_explode once awake')
    assert.ok(game.debugCommand('/time day').ok)
    run(game, TIME_SWITCH_TICKS)
    assert.equal(game.render().time, undefined)
    assert.equal(plant(game, 'pvz:doomshroom')!.asleep, undefined, 'lit, it stays awake at day')
    const restored = new LocalIntegratedGame(definitions, levels, undefined, true)
    restored.start({ ...options, levelId: 'pvz:sandbox-day', save: game.saveAtBoundary() })
    assert.deepEqual([plant(restored, 'pvz:doomshroom')!.asleep, clips(plant(restored, 'pvz:doomshroom')!)], [undefined, [['body', 'explode']]],
        'and so it is restored')
    game.drainEvents()
    run(game, 98 - TIME_SWITCH_TICKS)
    assert.ok(plant(game, 'pvz:doomshroom'), 'its 100 ticks are not out yet')
    assert.ok(game.render().timeChange, 'the lawn still turning')
    run(game)
    assert.equal(plant(game, 'pvz:doomshroom'), undefined)
    assert.equal(game.drainEvents().filter(event => event.type === 'plantExploded').length, 1)
})

test("the sky sun is the time's unless the level names its own or none; /time starts it falling or stops it", () => {
    assert.equal(levelSkySun(levels.levels['pvz:adventure-1-1'], yard.times.day), 'pvz:sun')
    assert.equal(levelSkySun(levels.levels['pvz:adventure-2-1'], yard.times.night), undefined)
    assert.equal(levelSkySun(levels.levels['pvz:adventure-1-5'], yard.times.day), undefined, 'Wall-nut Bowling names none')
    assert.equal(levelSkySun(levels.levels['pvz:adventure-1-5'], yard.times.night), undefined)
    const night = play('pvz:sandbox-night')
    assert.equal(skySun(night), undefined)
    assert.ok(night.debugCommand('/time day').ok)
    run(night, TIME_SWITCH_TICKS)
    const tick = night.render().gameplayTick, first = skySun(night)!
    assert.ok(first >= tick + 425 && first <= tick + 700, 'Board::InitLevel: the first falls 425 to 700 ticks on, from halfway')
    run(night, TIME_CHANGE_TICKS - TIME_SWITCH_TICKS)
    changeTime(night, 'night')
    assert.equal(skySun(night), undefined, 'and none falls at night')
    // A level that names none (as Wall-nut Bowling does) keeps its sky empty at any time.
    const source = readGameplaySource('levels') as { levels: Record<string, Record<string, unknown>> }
    source.levels['pvz:sandbox-day'].skySun = null
    const empty = play('pvz:sandbox-day', new LocalIntegratedGame(definitions, parseGameplayLevels(source, definitions), undefined, true))
    assert.equal(skySun(empty), undefined)
    changeTime(empty, 'night')
    changeTime(empty, 'day')
    assert.equal(skySun(empty), undefined)
})

test('a grown sun-shroom falls asleep big as the time turns to day (anim_bigsleep), a small one small, and both wake as they were', () => {
    const game = play('pvz:sandbox-day')
    assert.ok(game.debugCommand('/plant sunshroom 3 3').ok)
    changeTime(game, 'night')
    // Awake once its waking is over, it grows in its 12000 ticks and the 100 of its growing.
    run(game, PLANT_WAKE_TICKS + 12000 + 100 + 1)
    assert.ok(game.debugCommand('/plant sunshroom 3 5').ok)
    run(game)
    const shrooms = () => game.render().plants.filter(each => each.typeId === 'pvz:sunshroom')
        .map(each => [each.own?.phase, each.asleep ?? false, each.animations!.body.clip]).sort()
    assert.deepEqual(shrooms(), [['big', false, 'body'], ['small', false, 'small']])
    changeTime(game, 'day')
    assert.deepEqual(shrooms(), [['big', true, 'bigsleep'], ['small', true, 'sleep']])
    changeTime(game, 'night')
    run(game, PLANT_WAKE_TICKS)
    assert.deepEqual(shrooms(), [['big', false, 'body'], ['small', false, 'small']])
})
