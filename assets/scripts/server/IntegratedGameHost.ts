import { LocalGameChannel } from '@/shared/channel/index'
import type {
    ClientPacket,
    JsonValue,
    ServerFramePacket,
    WorldSnapshot,
} from '@/shared/protocol/index'
import { IntegratedGameServer } from './IntegratedGameServer'

const TICK_SECONDS = 0.01
const MAX_TICKS_PER_UPDATE = 1000

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
            const boundaryChanged = this.server.processBoundaryCommands()
            this.flushCommandResults()
            if (boundaryChanged && !this.server.hasPendingCommands()) this.sendFrame(this.server.snapshot())
            if (!this.server.hasPendingCommands()) this.flushSaveRequest()
            if (this.server.snapshot().paused) {
                this.accumulatorSeconds = 0
                return
            }
            this.advance(dtSeconds)
        } catch (error) {
            this.fatal('server-error', error instanceof Error ? error.message : String(error))
        }
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
                this.reject(packet.sequence, 'unsupported-command')
                return false
        }
    }

    private advance(dtSeconds: number): void {
        this.accumulatorSeconds += dtSeconds
        const ticks = Math.floor((this.accumulatorSeconds + 1e-12) / TICK_SECONDS)
        if (ticks > MAX_TICKS_PER_UPDATE) {
            this.fatal('tick-limit-exceeded', `update requires ${ticks} fixed ticks`)
            return
        }

        this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds - ticks * TICK_SECONDS)
        for (let tick = 0; tick < ticks; tick++) {
            const snapshot = this.server.tick()
            this.flushCommandResults()
            this.sendFrame(snapshot)
            if (!this.server.hasPendingCommands()) this.flushSaveRequest(false)
            if (snapshot.paused) {
                this.accumulatorSeconds = 0
                break
            }
        }
    }

    private sendFrame(snapshot: WorldSnapshot): void {
        const packet: ServerFramePacket = {
            protocolVersion: 1,
            type: 'frame',
            serverTick: snapshot.tick,
            acknowledgedSequence: this.acknowledgedSequence,
            snapshot,
            events: this.server.drainEvents(),
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
        }
    }

    private reject(sequence: number, code: string): void {
        this.channel.sendToClient({ protocolVersion: 1, type: 'commandRejected', sequence, code })
    }

    private fatal(code: string, message: string): void {
        this.channel.sendToClient({ protocolVersion: 1, type: 'fatalServerError', code, message })
        this.accumulatorSeconds = 0
        this.stopped = true
    }
}
