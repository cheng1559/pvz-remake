import type { GameSystem, World } from '@/server/state/World'
import { levelSkySun, TIME_CHANGE_TICKS, TIME_SWITCH_TICKS } from '@/shared/content/gameplay'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { type LevelState, LevelStateResource, RandomResource, SkySunResource } from '../state/resources'
import { plantsInPlay } from './lawn'

/**
 * `/time`: the lawn starts turning from the time of day the level is at to its board's time `id` (LevelState.timeChange),
 * a tick at a time; to the time it is at, it does not turn. None starts while one goes on (the command refuses).
 */
export function startTimeChange(level: LevelState, id: string): void {
    if (level.timeChange || id === level.time) return
    level.timeChange = { from: level.time, to: id, ticks: 0 }
}

/**
 * The lawn turns a tick at a time from the time of day it turns from to the one it turns to (LevelState.timeChange), the
 * client drawing it so (WorldSnapshot.timeChange). Halfway (TIME_SWITCH_TICKS) the level goes on at the time it turns to
 * (changeTime); the lawn turns on until it has turned TIME_CHANGE_TICKS. A pause holds it, and so does a loss.
 */
export function createTimeChangeSystem(): GameSystem {
    return {
        id: 'pvz:time-change',
        run({ world, tick }) {
            const level = world.resources.get(LevelStateResource)
            const change = level.timeChange
            if (!change || level.result === 'lost' || level.paused) return
            if (++change.ticks === TIME_SWITCH_TICKS) changeTime(world, change.to, tick)
            if (change.ticks >= TIME_CHANGE_TICKS) delete level.timeChange
        },
    }
}

/**
 * The level goes on at its board's time of day `id`, all on the lawn staying where it stands. What reads the time reads
 * that one from then on: whether it is night, and the sky sun as the level has it (levelSkySun). Not the original, which
 * keeps a level at one time:
 * - A plant in play that the day sends to sleep falls asleep at once (Plant.setSleeping), ending what it is in the
 *   middle of: a shooter's shot is not fired, a growing sun-shroom is grown. A scaredy-shroom not calm comes up first
 *   and falls asleep as it is up (its keepsAwake). One the night wakes wakes in its own ticks (Plant.startWaking), as
 *   a coffee bean's does once the bean's own are over; a fuse plant lights its fuse as it wakes.
 * - A sky sun that starts falls first as on a level's start (Board::InitLevel), after now; one that stops falls no more.
 * The client hears `timeChanged` and shows the time (WorldSnapshot.time).
 */
export function changeTime(world: World, id: string, tick: number): void {
    const level = world.resources.get(LevelStateResource), time = level.board.times[id]
    if (!time) throw new Error(`${id} is not a time of day of the level's board`)
    const plants = [...plantsInPlay(world)], asleep = plants.map(plant => plant.asleep(world))
    const falling = levelSkySun(level.definition, level.board.times[level.time])
    level.time = id
    const sky = world.resources.get(SkySunResource), random = world.resources.get(RandomResource)
    if (!levelSkySun(level.definition, time)) delete sky.atTick
    else if (!falling) sky.atTick = tick + random.integer(425, 700)
    const events = world.resources.get(EventQueueResource)
    plants.forEach((plant, index) => {
        const now = plant.asleep(world)
        if (now === asleep[index]) return
        if (now) plant.setSleeping(true, random)
        else plant.startWaking()
    })
    emitServerEvent(events, 'timeChanged', { time: id })
}
