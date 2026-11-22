import { director, Director, game, native, sys } from 'cc'
import { DEBUG } from 'cc/env'
import { menuApi } from '@/client/api/MenuApi'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { IntegratedGameHost } from '@/server/session/IntegratedGameHost'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import type { WorldSnapshot } from '@/shared/protocol/index'
import { LocalIntegratedGame } from './LocalIntegratedGame'
import type { LevelController } from './LevelController'

/**
 * The performance benchmark, for a build launched with it (tools/bench): the web page's query
 * `?benchmark=combat&frames=1200`, a native build's command line `--benchmark=combat --frames=1200 --benchmark-out=<file>`.
 *
 * A run plays the same frames every time: its level with a fixed seed, every frame the same step of time whatever it
 * took, and the client's Math.random seeded by the frame. What differs between runs is how long the work took. All of
 * it is done here, by standing in for a few functions while the run lasts; the game itself knows nothing of it.
 */

const SCENARIOS = {
    /** The stress test's zombies on the lawn, the server standing still: the views, animations and drawing alone. */
    steady: { levelId: 'pvz:stress-test', settleSeconds: 10, logic: false },
    /** The stress test played from the start of play: the server too. */
    combat: { levelId: 'pvz:stress-test', settleSeconds: 0, logic: true },
} as const
type Scenario = keyof typeof SCENARIOS

const SEED = 1
const STEP_SECONDS = 1 / 60
const DEFAULT_FRAMES = 1200
const WARMUP_FRAMES = 120
/** Real seconds the level may take to load and finish its intro. */
const START_TIMEOUT_SECONDS = 120

export interface BenchmarkRequest {
    readonly scenario: Scenario
    readonly frames: number
    /** Native: the file the result is written to. */
    readonly out?: string
}

/**
 * The benchmark the game was launched with, none if not. One asked for wrongly is not run: its error is its result
 * (reportBenchmark), and a native build quits, so what launched it learns why at once.
 */
export function launchBenchmarkRequest(): BenchmarkRequest | null {
    const options = new Map<string, string>()
    if (sys.isNative) {
        for (const argument of native.process?.argv ?? []) {
            const match = /^--([^=]+)=(.*)$/.exec(argument)
            if (match) options.set(match[1], match[2])
        }
    } else new URLSearchParams(globalThis.location?.search ?? '').forEach((value, key) => options.set(key, value))
    const scenario = options.get('benchmark')
    if (scenario === undefined) return null
    const frames = Number(options.get('frames') ?? DEFAULT_FRAMES), out = options.get('benchmark-out') || undefined
    const error = !Object.hasOwn(SCENARIOS, scenario) ? `Unknown benchmark scenario ${scenario}: use ${Object.keys(SCENARIOS).join(' or ')}`
        : !Number.isSafeInteger(frames) || frames < 1 ? 'Benchmark frames must be a whole number above 0' : undefined
    if (error !== undefined) {
        reportBenchmark(out, { error })
        if (sys.isNative) game.end()
        return null
    }
    return { scenario: scenario as Scenario, frames, ...(out ? { out } : {}) }
}

let running = false
/** A benchmark holds the game: it must not pause when its window loses focus. */
export function benchmarkRunning(): boolean {
    return running
}

/**
 * Runs the request and reports it (reportBenchmark), then quits a native build. `start` starts a level anew, as a
 * player would; the run has the clock and the randomness by then. The level stands still on its last measured frame,
 * the same picture on every run, for a tool to capture.
 */
export async function runLaunchedBenchmark(request: BenchmarkRequest, controller: LevelController, start: (levelId: string) => Promise<void>): Promise<void> {
    let outcome: BenchmarkResult | { error: string }
    // A fresh browser or install has no player, without whom no level starts.
    if (!await menuApi.getCurrentUser()) await menuApi.createUser('Benchmark')
    const run = new BenchmarkRun(request, controller)
    try {
        await start(SCENARIOS[request.scenario].levelId)
        outcome = await run.result
        controller.pause(true)
    } catch (error) {
        outcome = { error: error instanceof Error ? error.message : String(error) }
    } finally { run.dispose() }
    reportBenchmark(request.out, outcome)
    if (sys.isNative) game.end()
}

/** Milliseconds over the measured frames. */
interface Stats { mean: number, median: number, p99: number, low1: number }

export interface BenchmarkResult {
    scenario: Scenario
    frames: number
    platform: string
    debug: boolean
    /** Per frame: the whole frame, the updates (with the server's ticks), the server's ticks, the engine's drawing. */
    frame: Stats
    update: Stats
    server: Stats
    draw: Stats
    /** The engine's draw calls, the median frame's. */
    drawCalls: number
    zombies: number
    /** Of the server's last snapshot: runs that played the same game have the same. */
    checksum: string
}

function stats(values: number[]): Stats {
    const sorted = [...values].sort((a, b) => a - b), at = (fraction: number) => sorted[Math.floor(fraction * (sorted.length - 1))]
    // The "1% low": the mean of the slowest hundredth, at least one frame.
    const slowest = sorted.slice(-Math.max(1, Math.ceil(sorted.length / 100)))
    const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length
    return { mean: mean(sorted), median: at(0.5), p99: at(0.99), low1: mean(slowest) }
}

/** A random source in [0, 1) that gives the same numbers for the same seed (mulberry32). */
function seeded(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = Math.imul(state ^ (state >>> 15), state | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

/** FNV-1a of a string, as eight hex digits. */
function checksum(text: string): string {
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
    return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * A run, from its construction until dispose(): it stands in for the engine's delta time, Math.random, the level's
 * seed, and the server's update and snapshot (to time the one and keep the last of the other), and puts them back
 * after. Once the level plays past its intro it settles, warms up and is timed for the requested frames.
 */
class BenchmarkRun {
    readonly result: Promise<BenchmarkResult>
    private resolve!: (result: BenchmarkResult) => void
    private reject!: (error: Error) => void
    private stage: 'starting' | 'settling' | 'warming' | 'measuring' = 'starting'
    private stageFrames = 0
    private readonly startedAt = performance.now()
    private readonly samples = { frame: [] as number[], update: [] as number[], server: [] as number[], draw: [] as number[], drawCalls: [] as number[] }
    private readonly marks = { begin: 0, update: 0, updated: 0, draw: 0, drawn: 0 }
    private serverMs = 0
    private lastSnapshot?: WorldSnapshot
    private levelFrames = 0
    /** What runs between frames, and before the level does (loading, a number of frames that varies from run to run). */
    private readonly between = seeded(SEED)
    private zombies = 0
    private readonly restore: () => void

    constructor(private readonly request: BenchmarkRequest, private readonly controller: LevelController) {
        this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
        // Nothing waits on a run that fails before its caller awaits it.
        this.result.catch(() => {})
        const run = this
        const random = Math.random, speed = gameClock.speed, logic = GameDebugSettings.perfLogicEnabled
        const invincible = GameDebugSettings.plantInvincible
        // Every system, tween and component takes its delta time from the engine's frame: Game._calculateDT, which is
        // engine-internal and has no public counterpart that keeps the game's own loop running.
        const engine = game as unknown as { _calculateDT(useFixedDeltaTime: boolean): number }
        const calculate = engine._calculateDT, ownCalculate = Object.hasOwn(engine, '_calculateDT')
        engine._calculateDT = function (this: typeof engine, useFixedDeltaTime) {
            calculate.call(this, useFixedDeltaTime)
            return STEP_SECONDS
        }
        const start = LocalIntegratedGame.prototype.start, update = IntegratedGameHost.prototype.update
        const snapshot = IntegratedGameServer.prototype.snapshot
        LocalIntegratedGame.prototype.start = function (options) { start.call(this, { ...options, randomSeed: SEED }) }
        IntegratedGameHost.prototype.update = function (dtSeconds) {
            const begin = performance.now()
            try { update.call(this, dtSeconds) } finally { run.serverMs += performance.now() - begin }
        }
        IntegratedGameServer.prototype.snapshot = function () { return run.lastSnapshot = snapshot.call(this) }
        Math.random = this.between
        gameClock.setSpeed(1)
        GameDebugSettings.setPerfToggle('logic', true)
        // The plants are not eaten up, so the zombies go on eating them to the end (the level turns /plantinvincible on
        // as it starts). Set for this run only, not with set, which the device would keep.
        GameDebugSettings.plantInvincible = true
        director.on(Director.EVENT_BEGIN_FRAME, this.onBeginFrame, this)
        director.on(Director.EVENT_BEFORE_UPDATE, () => { this.marks.update = performance.now() }, this)
        director.on(Director.EVENT_AFTER_UPDATE, () => { this.marks.updated = performance.now() }, this)
        director.on(Director.EVENT_BEFORE_DRAW, () => { this.marks.draw = performance.now() }, this)
        director.on(Director.EVENT_AFTER_DRAW, () => { this.marks.drawn = performance.now() }, this)
        director.on(Director.EVENT_END_FRAME, this.onEndFrame, this)
        running = true
        this.restore = () => {
            director.targetOff(this)
            if (ownCalculate) engine._calculateDT = calculate
            else delete (engine as { _calculateDT?: unknown })._calculateDT
            LocalIntegratedGame.prototype.start = start
            IntegratedGameHost.prototype.update = update
            IntegratedGameServer.prototype.snapshot = snapshot
            Math.random = random
            gameClock.setSpeed(speed)
            GameDebugSettings.setPerfToggle('logic', logic)
            GameDebugSettings.plantInvincible = invincible
            running = false
        }
    }

    dispose(): void {
        if (!running) return
        this.restore()
        this.reject(new Error('The benchmark was stopped'))
    }

    private onBeginFrame(): void {
        // A frame of the level draws its randomness from its own number, what happens between frames from a stream of
        // its own: neither shifts the other's numbers, however many frames the loading takes.
        Math.random = this.controller.isRunning() ? seeded(SEED + ++this.levelFrames) : this.between
        this.serverMs = 0
        this.marks.begin = performance.now()
    }

    private onEndFrame(): void {
        const end = performance.now()
        Math.random = this.between
        try { this.advance(end) } catch (error) {
            director.targetOff(this)
            this.reject(error instanceof Error ? error : new Error(String(error)))
        }
    }

    private advance(end: number): void {
        const { controller } = this, scenario = SCENARIOS[this.request.scenario]
        if (this.stage === 'starting') {
            if (controller.isRunning() && !controller.isLevelIntro() && !controller.isPaused()) this.enter('settling')
            else if (end - this.startedAt > START_TIMEOUT_SECONDS * 1000) throw new Error(`${scenario.levelId} did not start playing`)
            return
        }
        if (!controller.isRunning() || controller.isPaused()) throw new Error('The level stopped or paused during the benchmark')
        this.stageFrames++
        if (this.stage === 'settling') {
            if (this.stageFrames < Math.round(scenario.settleSeconds / STEP_SECONDS)) return
            if (!scenario.logic) GameDebugSettings.setPerfToggle('logic', false)
            this.enter('warming')
        } else if (this.stage === 'warming') {
            if (this.stageFrames < WARMUP_FRAMES) return
            this.zombies = controller.countZombiesOnScreenForMusic()
            this.enter('measuring')
        } else {
            const { samples, marks } = this
            samples.frame.push(end - marks.begin)
            samples.update.push(marks.updated - marks.update)
            samples.server.push(this.serverMs)
            samples.draw.push(marks.drawn - marks.draw)
            samples.drawCalls.push(director.root?.device.numDrawCalls ?? 0)
            if (samples.frame.length >= this.request.frames) this.finish()
        }
    }

    private enter(stage: BenchmarkRun['stage']): void {
        this.stage = stage
        this.stageFrames = 0
    }

    private finish(): void {
        director.targetOff(this)
        const { samples } = this
        this.resolve({
            scenario: this.request.scenario,
            frames: this.request.frames,
            platform: sys.isBrowser ? `${sys.os} ${sys.browserType} ${sys.browserVersion}` : `${sys.os} ${sys.osVersion}`,
            debug: DEBUG,
            frame: stats(samples.frame),
            update: stats(samples.update),
            server: stats(samples.server),
            draw: stats(samples.draw),
            drawCalls: stats(samples.drawCalls).median,
            zombies: this.zombies,
            checksum: this.lastSnapshot ? checksum(JSON.stringify(this.lastSnapshot)) : '',
        })
    }
}

/**
 * Puts a result, or a failure as `{ error }`, where it is read: the console and `globalThis.pvzBenchmark` everywhere,
 * natively also a JSON file, `out` (the request's) or benchmark.json in the writable folder.
 */
function reportBenchmark(out: string | undefined, outcome: BenchmarkResult | { error: string }): void {
    if ('error' in outcome) console.error(`[Benchmark] ${outcome.error}`)
    else console.log(`[Benchmark] ${outcome.scenario}: frame ${outcome.frame.mean.toFixed(2)} ms, 1% low ${outcome.frame.low1.toFixed(2)} ms, ` +
        `server ${outcome.server.mean.toFixed(2)} ms, ${outcome.drawCalls} draw calls, checksum ${outcome.checksum}`)
    ;(globalThis as typeof globalThis & { pvzBenchmark?: unknown }).pvzBenchmark = outcome
    if (!sys.isNative) return
    const path = out ?? `${native.fileUtils.getWritablePath().replace(/[\\/]$/, '')}/benchmark.json`
    if (!native.fileUtils.writeStringToFile(JSON.stringify(outcome, null, 4), path)) console.error(`[Benchmark] Could not write ${path}`)
}
