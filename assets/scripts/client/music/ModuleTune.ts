import { BufferAsset, Game, game, resources, sys } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { MUSIC_STEMS, type ModuleMusic, type MusicStemName } from '@/shared/content/music'
import { NativeModulePlayer, WorkletModulePlayer, type ModulePlayer } from './ModulePlayer'
import {
    parseMusicPlaybackSnapshot,
    type MusicBurstState,
    type MusicDrumsState,
    type MusicPlaybackSnapshot,
    type MusicTuneId,
} from './MusicPlaybackSnapshot'
import { clamp01, normalizeTicks, Tune, type MusicRuntimeContext } from './Tune'

const START_BURST_ZOMBIES = 10
const FINISH_BURST_ZOMBIES = 4
const BURST_START_TICKS = 400
const BURST_ON_MIN_TICKS = 800
const BURST_FINISH_TICKS = 800
const DRUMS_START_QUEUE_TICKS = 100
const DRUMS_FADE_TICKS = 50
const NIGHT_FINISH_TICKS = 1100
const NIGHT_DRUMS_FADE_TICKS = 800
/** Scheme 1 compares the melody's place by 32-row stretches: Music::UpdateMusicBurst's HIWORD / 128 at BASS's position scale 4. */
const DAY_MARK_ROWS = 32

/** The player every module tune plays through, and the instances of each module it has loaded, reused from tune to tune. */
class ModuleMusicHost {
    private player?: Promise<ModulePlayer | null>
    private readonly files = new Map<string, Promise<Uint8Array | undefined>>()
    private readonly free = new Map<string, number[]>()
    /** How many instances of each module there are, in use, free or loading. */
    private readonly loaded = new Map<string, number>()

    ready(): Promise<ModulePlayer | null> {
        return this.player ??= startPlayer().catch(error => {
            console.error('[MusicSystem] The module player did not start', error)
            return null
        })
    }

    /** Tracker module `module`'s file, read once. */
    file(module: string): Promise<Uint8Array | undefined> {
        let file = this.files.get(module)
        if (!file) this.files.set(module, file = modResources.tracker(module))
        return file
    }

    /** An instance of tracker module `module` that no tune is using, loaded if there is none; -1 when it cannot be had. */
    async acquire(player: ModulePlayer, module: string): Promise<number> {
        const free = this.free.get(module)
        if (free?.length) return free.pop()!
        return this.load(player, module)
    }

    /**
     * Loads instances of `module` into the pool until there are `count`, counting those in use: those a tune about to
     * start needs, as the one playing makes way for it.
     */
    async reserve(player: ModulePlayer, module: string, count: number): Promise<void> {
        const loads: Promise<void>[] = []
        // load() counts its instance before it waits for anything.
        while ((this.loaded.get(module) ?? 0) < count) {
            loads.push(this.load(player, module).then(instance => {
                if (instance >= 0) this.release(player, module, instance)
            }))
        }
        await Promise.all(loads)
    }

    release(player: ModulePlayer, module: string, instance: number) {
        player.stop(instance)
        const free = this.free.get(module) ?? []
        if (!free.includes(instance)) free.push(instance)
        this.free.set(module, free)
    }

    private async load(player: ModulePlayer, module: string): Promise<number> {
        this.loaded.set(module, (this.loaded.get(module) ?? 0) + 1)
        const bytes = await this.file(module)
        const instance = bytes ? await player.load(bytes) : -1
        if (!bytes) console.warn(`[MusicSystem] Missing tracker module: ${module}`)
        else if (instance < 0) console.warn(`[MusicSystem] Unreadable tracker module: ${module}`)
        if (instance < 0) this.loaded.set(module, this.loaded.get(module)! - 1)
        return instance
    }
}

const host = new ModuleMusicHost()

async function startPlayer(): Promise<ModulePlayer | null> {
    if (sys.isNative) return NativeModulePlayer.create()
    if (typeof AudioWorkletNode === 'undefined') return null
    const wasm = await new Promise<ArrayBuffer>((resolve, reject) => {
        resources.load('music/pvz_music', BufferAsset, (error, asset) => error ? reject(error) : resolve(asset.buffer().slice(0)))
    })
    return WorkletModulePlayer.create(musicContext(), wasm)
}

/**
 * The web's audio context for module music: the engine's is its own. A page may only start sound after a gesture, so
 * this one resumes on the first, as the engine's does; it is suspended while the game is hidden.
 */
function musicContext(): AudioContext {
    const context = new AudioContext()
    let hidden = false
    const resume = () => {
        if (!hidden && context.state === 'suspended') void context.resume()
    }
    for (const type of ['pointerup', 'touchend', 'mouseup', 'keydown']) window.addEventListener(type, resume, { capture: true })
    game.on(Game.EVENT_HIDE, () => { hidden = true; void context.suspend() })
    game.on(Game.EVENT_SHOW, () => { hidden = false; resume() })
    return context
}

/**
 * A tune played from tracker modules (Music::PlayMusic): each part an instance of its module from its order, with only
 * its channels heard (Music::SetupMusicFileForTune), all in step and looping by the module's own jumps. A tune with a
 * burst scheme runs Music::UpdateMusicBurst on the parts' volumes. Its night drums start their part at the melody's
 * next order to the sample, in the player, where the original jumped them a little early and pulled them back into
 * step by their tempo (Music::MusicResync).
 */
export class ModuleTune extends Tune {
    private mainVolume = 1
    private drumsVolume = 0
    private hihatsVolume = 0
    private burstState: MusicBurstState = 'off'
    private burstCounter = 0
    private drumsState: MusicDrumsState = 'off'
    private drumsCounter = 0
    private queuedMark: number | null = null
    /**
     * Night: the drums' jumps landed (ModulePlayer.jumps) when the player was given one to hold for the melody's next
     * order, or null with none held; until it lands, their volume is the jump's.
     */
    private drumsJumpsBefore: number | null = null

    private constructor(
        tuneId: MusicTuneId,
        private readonly tune: ModuleMusic,
        private readonly player: ModulePlayer,
        private readonly instances: Partial<Record<MusicStemName, number>>,
        share: number,
    ) {
        super(tuneId, share)
    }

    /**
     * Starts the player, reads the tune's modules and, where a module loads without holding up the music playing
     * (ModulePlayer.loadsWhilePlaying), the instances the tune needs. On the web the worklet makes an instance on the
     * audio thread, which would hold up a tune playing meanwhile, so there a tune makes its own as it starts.
     */
    static async preload(tune: ModuleMusic): Promise<void> {
        const player = await host.ready()
        if (!player) return
        const modules = MUSIC_STEMS.flatMap(stem => tune.parts[stem] ? [tune.parts[stem]!.module] : [])
        await Promise.all(modules.map(module => host.file(module)))
        if (!player.loadsWhilePlaying) return
        const counts = new Map<string, number>()
        for (const module of modules) counts.set(module, (counts.get(module) ?? 0) + 1)
        await Promise.all([...counts].map(([module, count]) => host.reserve(player, module, count)))
    }

    /** Its parts' instances, ready to start; null when the player or one of its modules is missing. */
    static async create(tuneId: MusicTuneId, tune: ModuleMusic, share: number): Promise<ModuleTune | null> {
        const player = await host.ready()
        if (!player) return null
        const stems = MUSIC_STEMS.filter(stem => tune.parts[stem])
        const acquired = await Promise.all(stems.map(stem => host.acquire(player, tune.parts[stem]!.module)))
        const instances: Partial<Record<MusicStemName, number>> = {}
        stems.forEach((stem, at) => { if (acquired[at] >= 0) instances[stem] = acquired[at] })
        const created = new ModuleTune(tuneId, tune, player, instances, share)
        if (acquired.every(instance => instance >= 0)) return created
        created.stop()
        return null
    }

    start(snapshot?: MusicPlaybackSnapshot) {
        if (snapshot && !snapshot.parts) throw new TypeError(`music snapshot does not fit the module tune ${this.tuneId}`)
        if (snapshot) this.restoreState(snapshot)
        this.player.setPaused(false)
        for (const [stem, instance] of this.parts()) {
            const part = this.tune.parts[stem]!
            const channels = this.player.channels(instance)
            for (let channel = 0; channel < channels; channel++) {
                const heard = !part.channels || part.channels.some(([first, last]) => channel >= first && channel <= last)
                this.player.setChannelVolume(instance, channel, heard ? 1 : 0)
            }
            const [order, row] = snapshot?.parts?.[stem] ?? [part.order, part.row]
            this.player.setVolume(instance, 0)
            this.player.play(instance, order, row)
        }
        if (this.drumsState === 'on-queued' && this.tune.burstScheme === 'night') this.queueDrumsJump()
        if (snapshot?.paused) this.pause()
        this.applyVolumes()
    }

    capture(pauseRequested: boolean): MusicPlaybackSnapshot {
        const parts: Partial<Record<MusicStemName, [number, number]>> = {}
        for (const [stem, instance] of this.parts()) {
            const { order, row } = this.player.position(instance)
            parts[stem] = [order, row]
        }
        return parseMusicPlaybackSnapshot({
            tuneId: this.tuneId,
            paused: this.paused || pauseRequested,
            fadeOutCounter: this.fadeOutCounter,
            fadeOutDuration: this.fadeOutDuration,
            parts,
            ...this.tune.burstScheme ? {
                burst: {
                    mainVolume: this.mainVolume, drumsVolume: this.drumsVolume, hihatsVolume: this.hihatsVolume,
                    state: this.burstState, counter: this.burstCounter, drumsState: this.drumsState,
                    drumsCounter: this.drumsCounter, queuedMark: this.queuedMark,
                },
            } : {},
        })!
    }

    /** Gives its instances back once: a fade out that ran out stops it, and MusicSystem then stops it again. */
    stop() {
        if (!this.playing) return
        for (const [stem, instance] of this.parts()) host.release(this.player, this.tune.parts[stem]!.module, instance)
        this.playing = false
        this.paused = false
    }

    pause() {
        if (!this.playing || this.paused) return
        this.player.setPaused(true)
        this.paused = true
    }

    resume() {
        if (!this.playing || !this.paused) return
        this.player.setPaused(false)
        this.paused = false
    }

    update(ticks: number, context: MusicRuntimeContext): boolean {
        if (!this.playing) return false
        if (this.paused) return true
        const elapsed = normalizeTicks(ticks)
        if (elapsed > 0) {
            if (!this.updateFadeOut(elapsed)) return false
            this.updateBurst(elapsed, context.zombiesOnScreen)
        }
        this.applyVolumes()
        return true
    }

    applyVolumes() {
        const scale = this.volumeScale()
        for (const [stem, instance] of this.parts()) {
            if (stem === 'drums' && this.drumsJumpsBefore !== null) continue
            const volume = stem === 'main' ? this.mainVolume : stem === 'drums' ? this.drumsVolume : this.hihatsVolume
            this.player.setVolume(instance, clamp01(volume * scale))
        }
    }

    /** Board::UpdateZombieSpawning: the huge wave countdown bursts a night tune with 700 ticks left and a day one with 400. */
    startBurst(countdown: number) {
        if (this.paused || !this.tune.burstScheme) return
        if (countdown !== (this.tune.burstScheme === 'night' ? 700 : 400)) return
        this.beginBurst()
    }

    /**
     * It takes on the burst of the tune `from`, which a change of time of day blends into it: the burst is the level's
     * (its zombies on screen, its huge wave), not the tune's. Its parts keep to their own orders, so drums that were
     * coming in or on come in at a place of its own, and at night (where its drums start their own part) at its next order.
     */
    takeBurst(from: Tune) {
        if (!(from instanceof ModuleTune) || !this.tune.burstScheme || !from.tune.burstScheme) return
        this.burstState = from.burstState
        this.burstCounter = from.burstCounter
        this.drumsCounter = from.drumsCounter
        const drumsIn = from.drumsState !== 'off' && from.drumsState !== 'fading'
        if (this.tune.burstScheme === 'night') {
            if (drumsIn) this.queueDrumsOn()
        } else if (from.drumsState === 'on-queued') this.queueDrumsOn()
        else if (from.drumsState === 'off-queued') {
            this.drumsState = 'on'
            this.queueDrumsOff()
        } else this.drumsState = from.drumsState
    }

    private *parts(): Generator<[MusicStemName, number]> {
        for (const stem of MUSIC_STEMS) {
            const instance = this.instances[stem]
            if (instance !== undefined) yield [stem, instance]
        }
    }

    private restoreState(snapshot: MusicPlaybackSnapshot) {
        this.restoreFade(snapshot)
        const burst = snapshot.burst
        if (!burst) return
        this.mainVolume = burst.mainVolume
        this.drumsVolume = burst.drumsVolume
        this.hihatsVolume = burst.hihatsVolume
        this.burstState = burst.state
        this.burstCounter = burst.counter
        this.drumsState = burst.drumsState
        this.drumsCounter = burst.drumsCounter
        this.queuedMark = burst.queuedMark
    }

    /** Music::UpdateMusicBurst's aOrderMain: by day the melody's 32-row stretch of its pattern, at night its order. */
    private mark(): number {
        const position = this.player.position(this.instances.main!)
        return this.tune.burstScheme === 'night' ? position.order : Math.floor(position.row / DAY_MARK_ROWS)
    }

    private updateBurst(ticks: number, zombies: number) {
        if (this.tune.burstScheme === 'night') {
            this.updateNightBurst(ticks, zombies)
            return
        }
        if (this.tune.burstScheme !== 'day') return
        this.decrementCounters(ticks)
        switch (this.burstState) {
            case 'off':
                this.mainVolume = 1
                this.hihatsVolume = 0
                if (zombies >= START_BURST_ZOMBIES) this.beginBurst()
                break
            case 'starting':
                this.hihatsVolume = clamp01(1 - this.burstCounter / BURST_START_TICKS)
                if (this.drumsState === 'off' && this.burstCounter <= DRUMS_START_QUEUE_TICKS) this.queueDrumsOn()
                if (this.burstCounter <= 0) {
                    this.burstState = 'on'
                    this.burstCounter = BURST_ON_MIN_TICKS
                    this.hihatsVolume = 1
                }
                break
            case 'on':
                this.hihatsVolume = 1
                if (this.burstCounter <= 0 && zombies < FINISH_BURST_ZOMBIES) {
                    this.burstState = 'finishing'
                    this.burstCounter = BURST_FINISH_TICKS
                    this.queueDrumsOff()
                }
                break
            case 'finishing':
                this.hihatsVolume = clamp01(this.burstCounter / BURST_FINISH_TICKS)
                if (this.burstCounter <= 0 && this.drumsState === 'off') {
                    this.burstState = 'off'
                    this.hihatsVolume = 0
                }
                break
        }
        this.updateDrumsState()
    }

    /** Music::UpdateMusicBurst scheme 2 swaps the melody for the night drums. */
    private updateNightBurst(ticks: number, zombies: number) {
        this.decrementCounters(ticks)
        switch (this.burstState) {
            case 'off':
                this.mainVolume = 1
                if (zombies >= START_BURST_ZOMBIES) this.beginBurst()
                break
            case 'starting':
                if (this.drumsState === 'off') this.queueDrumsOn()
                if (this.drumsState === 'on-queued') this.burstCounter = BURST_START_TICKS
                this.mainVolume = clamp01(this.burstCounter / BURST_START_TICKS)
                if (this.burstCounter === 0) {
                    this.burstState = 'on'
                    this.burstCounter = BURST_ON_MIN_TICKS
                }
                break
            case 'on':
                this.mainVolume = 0
                if (this.burstCounter === 0 && zombies < FINISH_BURST_ZOMBIES) {
                    this.burstState = 'finishing'
                    this.burstCounter = NIGHT_FINISH_TICKS
                    this.drumsState = 'fading'
                    this.drumsCounter = NIGHT_DRUMS_FADE_TICKS
                }
                break
            case 'finishing':
                this.mainVolume = clamp01(1 - this.burstCounter / BURST_START_TICKS)
                if (this.burstCounter === 0 && this.drumsState === 'off') this.burstState = 'off'
                break
        }
        this.updateDrumsState()
    }

    private decrementCounters(ticks: number) {
        if (this.burstCounter > 0) this.burstCounter = Math.max(0, this.burstCounter - ticks)
        if (this.drumsCounter > 0) this.drumsCounter = Math.max(0, this.drumsCounter - ticks)
    }

    private beginBurst() {
        if (this.burstState !== 'off') return
        this.burstState = 'starting'
        this.burstCounter = BURST_START_TICKS
    }

    private queueDrumsOn() {
        this.drumsState = 'on-queued'
        this.queuedMark = this.mark()
        if (this.tune.burstScheme === 'night') this.queueDrumsJump()
    }

    private queueDrumsOff() {
        if (this.drumsState === 'off') return
        this.drumsState = 'off-queued'
        this.queuedMark = this.mark()
    }

    /** At the melody's next order the drums start their part over: the first jump order on an even one, the second on an odd. */
    private queueDrumsJump() {
        this.drumsJumpsBefore = this.player.jumps(this.instances.drums!)
        this.player.queueJump(this.instances.drums!, this.instances.main!, this.tune.drumsJumpOrders!, clamp01(this.volumeScale()))
    }

    /** Whether the melody has left the place a queued drums change waits on: at night, whether the drums' jump landed. */
    private queuedChangeArrived(): boolean {
        if (this.tune.burstScheme !== 'night') return this.mark() !== this.queuedMark
        if (this.player.jumps(this.instances.drums!) === this.drumsJumpsBefore) return false
        this.drumsJumpsBefore = null
        return true
    }

    private updateDrumsState() {
        switch (this.drumsState) {
            case 'off':
                this.drumsVolume = 0
                break
            case 'on-queued':
                this.drumsVolume = 0
                if (this.queuedChangeArrived()) {
                    this.drumsState = 'on'
                    this.drumsVolume = 1
                    this.queuedMark = null
                }
                break
            case 'on':
                this.drumsVolume = 1
                break
            case 'off-queued':
                this.drumsVolume = 1
                if (this.queuedChangeArrived()) {
                    this.drumsState = 'fading'
                    this.drumsCounter = DRUMS_FADE_TICKS
                    this.queuedMark = null
                }
                break
            case 'fading':
                this.drumsVolume = clamp01(this.drumsCounter / (this.tune.burstScheme === 'night' ? NIGHT_DRUMS_FADE_TICKS : DRUMS_FADE_TICKS))
                if (this.drumsCounter <= 0) {
                    this.drumsState = 'off'
                    this.drumsVolume = 0
                }
                break
        }
    }
}
