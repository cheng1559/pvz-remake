import { modErrorOwner } from '@/shared/mod/ModHost'
import { LocalGameChannel } from '@/shared/channel/index'
import { MAX_TICKS_PER_UPDATE, TICK_SECONDS } from '@/shared/protocol'
import type {
    ClientPacket,
    JsonValue,
    ServerEvent,
    ServerFramePacket,
    WorldSnapshot,
} from '@/shared/protocol/index'
import { IntegratedGameServer } from './IntegratedGameServer'

export class IntegratedGameHost {
    private acknowledgedSequence = -1
    private accumulatorSeconds = 0
    private started = false
    private stopped = false
    private readonly pendingSaveSequences: number[] = []
    private readonly deferredPackets: ClientPacket[] = []

    constructor(
        private readonly server: IntegratedGameServer,
        private readonly channel: LocalGameChannel,
        private readonly debugEnabled = false,
    ) {}

    get interpolationAlpha(): number {
        return Math.max(0, Math.min(1, this.accumulatorSeconds / TICK_SECONDS))
    }

    update(dtSeconds: number): void {
        if (this.stopped) return
        if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
            this.fatal('invalid-delta-time', 'dtSeconds must be a non-negative finite number')
            return
        }

        try {
            this.processPackets()
            if (!this.started || this.stopped) return
            const boundaryChanged = this.server.processBoundaryCommands(dtSeconds === 0)
            this.flushCommandResults()
            if (boundaryChanged && !this.server.hasPendingCommands()) this.sendFrame(this.server.snapshot())
            if (!this.server.hasPendingCommands()) this.flushSaveRequest()
            // A pause keeps the part of a tick already shown (interpolationAlpha): the picture stands where it is.
            if (this.server.isPaused()) return
            this.advance(dtSeconds)
        } catch (error) {
            this.failed(error)
        }
    }

    /**
     * `/step`: `ticks` fixed ticks now, as a frame that long catches them up (advance), MAX_TICKS_PER_UPDATE at most; the
     * part of a tick already shown stays (interpolationAlpha). None while the game is paused.
     */
    fastForward(ticks: number): void {
        if (!this.started || this.stopped || this.server.isPaused()) return
        try {
            this.run(ticks)
        } catch (error) {
            this.failed(error)
        }
    }

    private failed(error: unknown): void {
        // The client only receives the message; keep the stack in the console.
        console.error('[IntegratedGameHost]', error)
        this.fatal('server-error', (error instanceof Error ? error.message : String(error)) || 'Server error', modErrorOwner(error))
    }

    private processPackets(): void {
        if (this.pendingSaveSequences.length > 0) return
        const packets = [...this.deferredPackets.splice(0), ...this.channel.drainServerPackets()]
        for (let index = 0; index < packets.length; index++) {
            const packet = packets[index]
            if (packet.sequence <= this.acknowledgedSequence) {
                this.reject(packet.sequence, 'sequence-out-of-order')
                continue
            }
            this.acknowledgedSequence = packet.sequence
            const saveBarrier = this.processPacket(packet)
            if (this.stopped) return
            if (saveBarrier) {
                while (packets[index + 1]?.type === 'requestSave') {
                    const next = packets[++index]
                    if (next.sequence <= this.acknowledgedSequence) this.reject(next.sequence, 'sequence-out-of-order')
                    else {
                        this.acknowledgedSequence = next.sequence
                        this.processPacket(next)
                    }
                }
                this.deferredPackets.push(...packets.slice(index + 1))
                return
            }
        }
    }

    private processPacket(packet: ClientPacket): boolean {
        if (packet.type === 'startSession') {
            if (this.started) {
                this.reject(packet.sequence, 'session-already-started')
                return false
            }
            const snapshot = this.server.start(packet)
            this.started = true
            this.channel.sendToClient({
                protocolVersion: 1,
                type: 'sessionStarted',
                acknowledgedSequence: packet.sequence,
                snapshot,
            })
            return false
        }
        if (!this.started) {
            this.reject(packet.sequence, 'session-not-started')
            return false
        }

        switch (packet.type) {
            case 'command': {
                this.server.enqueueCommand(packet.sequence, packet.command)
                return false
            }
            case 'requestSave':
                this.pendingSaveSequences.push(packet.sequence)
                return true
            case 'stopSession':
                this.channel.sendToClient({
                    protocolVersion: 1,
                    type: 'sessionStopped',
                    acknowledgedSequence: packet.sequence,
                })
                this.accumulatorSeconds = 0
                this.stopped = true
                return false
            case 'debugCommand':
                if (this.debugEnabled) this.server.enqueueDebugCommand(packet.sequence, packet.command)
                else this.reject(packet.sequence, 'unsupported-command')
                return false
        }
    }

    private advance(dtSeconds: number): void {
        this.accumulatorSeconds += dtSeconds
        const ticks = Math.floor((this.accumulatorSeconds + 1e-12) / TICK_SECONDS)
        this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds - ticks * TICK_SECONDS)
        this.run(ticks)
    }

    /** `ticks` fixed ticks, until the game pauses; more than MAX_TICKS_PER_UPDATE stop the game instead. */
    private run(ticks: number): void {
        if (ticks > MAX_TICKS_PER_UPDATE) {
            this.fatal('tick-limit-exceeded', `update requires ${ticks} fixed ticks`)
            return
        }
        const events: ServerEvent[] = []
        for (let tick = 0; tick < ticks; tick++) {
            this.server.step()
            this.flushCommandResults()
            events.push(...this.server.drainEvents())
            const paused = this.server.isPaused()
            const saving = this.pendingSaveSequences.length > 0 && !this.server.hasPendingCommands()
            // The client renders once per update from the last two frames. When catching up,
            // skip building earlier snapshots but keep every event and any save point.
            if (tick >= ticks - 2 || paused || saving) this.sendFrame(this.server.snapshot(), events.splice(0))
            if (saving) this.flushSaveRequest(false)
            if (paused) break
        }
    }

    /** The server's world as a save made now holds it, for the frame saved with that save. */
    savedSnapshot(): WorldSnapshot {
        return this.server.savedSnapshot()
    }

    private sendFrame(snapshot: WorldSnapshot, events = this.server.drainEvents()): void {
        const packet: ServerFramePacket = {
            protocolVersion: 1,
            type: 'frame',
            serverTick: snapshot.tick,
            acknowledgedSequence: this.acknowledgedSequence,
            snapshot,
            events,
        }
        this.channel.sendToClient(packet)
    }

    private flushSaveRequest(sendFinalFrame = true): void {
        if (this.pendingSaveSequences.length === 0) return
        if (sendFinalFrame) this.sendFrame(this.server.snapshot())
        const save = this.server.save() as unknown as JsonValue
        for (const sequence of this.pendingSaveSequences.splice(0)) {
            this.channel.sendToClient({
                protocolVersion: 1,
                type: 'saveReady',
                acknowledgedSequence: sequence,
                save,
            })
        }
    }

    private flushCommandResults(): void {
        for (const result of this.server.drainCommandResults()) {
            if (result.rejection) this.reject(result.sequence, result.rejection)
            if (result.debug) this.channel.sendToClient({ protocolVersion: 1, type: 'debugResult', sequence: result.sequence, result: result.debug })
        }
    }

    private reject(sequence: number, code: string): void {
        this.channel.sendToClient({ protocolVersion: 1, type: 'commandRejected', sequence, code })
    }

    private fatal(code: string, message: string, modId?: string): void {
        this.channel.sendToClient({ protocolVersion: 1, type: 'fatalServerError', code, message, ...(modId ? { modId } : {}) })
        this.accumulatorSeconds = 0
        this.stopped = true
    }
}
