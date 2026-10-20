import type { LocalGameChannel } from '@/shared/channel/index'
import type {
    GameCommand,
    JsonValue,
    ServerEvent,
    ServerPacket,
    StartSessionPacket,
    WorldSnapshot,
} from '@/shared/protocol/index'
import { ClientWorld, type ClientWorldChanges } from './ClientWorld'
import {
    parseClientPresentationSnapshot,
    type ClientPresentationSnapshot,
} from './ClientPresentationSnapshot'
import type { LevelPresentationSnapshot } from '@/client/level/LevelPresentationSnapshot'
import type { DebugCliResult } from '@/shared/debug/DebugCli'

export class IntegratedGameClient {
    readonly world = new ClientWorld()
    private sequence = 0
    private highestEventId = 0
    private events: ServerEvent[] = []
    private changes: ClientWorldChanges = { added: [], removed: [] }
    lastRejection?: { sequence: number, code: string }
    lastSave?: JsonValue
    lastSaveSequence?: number
    lastDebugResult?: { sequence: number, result: DebugCliResult }

    constructor(private readonly channel: Pick<LocalGameChannel, 'sendToServer' | 'drainClientPackets'>) {}

    start(options: Omit<StartSessionPacket, 'protocolVersion' | 'sequence' | 'type'>): void {
        this.channel.sendToServer({
            protocolVersion: 1,
            sequence: ++this.sequence,
            type: 'startSession',
            ...options,
        })
    }

    command(command: GameCommand): void {
        this.channel.sendToServer({
            protocolVersion: 1,
            sequence: ++this.sequence,
            type: 'command',
            command,
        })
    }

    requestSave(): number {
        const sequence = ++this.sequence
        this.channel.sendToServer({ protocolVersion: 1, sequence, type: 'requestSave' })
        return sequence
    }

    debugCommand(command: string): number {
        const sequence = ++this.sequence
        this.channel.sendToServer({ protocolVersion: 1, sequence, type: 'debugCommand', command, args: null })
        return sequence
    }

    snapshot(level: LevelPresentationSnapshot): ClientPresentationSnapshot {
        const current = this.world.current
        if (!current) throw new Error('Cannot snapshot client presentation before the session starts')
        return parseClientPresentationSnapshot({
            schemaVersion: 2,
            level,
            transport: {
                sequence: this.sequence,
                highestEventId: this.highestEventId,
                previous: this.world.previous ?? null,
                current,
            },
        })
    }

    restore(value: unknown): LevelPresentationSnapshot {
        const snapshot = parseClientPresentationSnapshot(value)
        this.sequence = snapshot.transport.sequence
        this.highestEventId = snapshot.transport.highestEventId
        this.changes = this.world.restore(snapshot.transport.previous, snapshot.transport.current)
        this.events = []
        this.lastRejection = undefined
        this.lastSave = undefined
        this.lastSaveSequence = undefined
        this.lastDebugResult = undefined
        return snapshot.level
    }

    update(): void {
        for (const packet of this.channel.drainClientPackets()) this.consume(packet)
    }

    render(interpolationAlpha = 0): WorldSnapshot {
        return this.world.render(interpolationAlpha)
    }

    drainEvents(): ServerEvent[] {
        return this.events.splice(0)
    }

    drainChanges(): ClientWorldChanges {
        const result = this.changes
        this.changes = { added: [], removed: [] }
        return result
    }

    private consume(packet: ServerPacket): void {
        switch (packet.type) {
            case 'sessionStarted': {
                const changes = this.world.accept(packet)
                this.changes.added.push(...changes.added)
                this.changes.removed.push(...changes.removed)
                return
            }
            case 'frame': {
                if (this.world.current && packet.snapshot.tick <= this.world.current.tick) return
                for (const event of packet.events) {
                    if (event.eventId <= this.highestEventId) continue
                    if (event.eventId !== this.highestEventId + 1) {
                        throw new Error(`Server event gap: expected ${this.highestEventId + 1}, received ${event.eventId}`)
                    }
                    this.highestEventId = event.eventId
                    this.events.push(event)
                }
                const changes = this.world.accept(packet)
                this.changes.added.push(...changes.added)
                this.changes.removed.push(...changes.removed)
                return
            }
            case 'commandRejected':
                this.lastRejection = { sequence: packet.sequence, code: packet.code }
                return
            case 'debugResult':
                this.lastDebugResult = { sequence: packet.sequence, result: packet.result }
                return
            case 'saveReady':
                this.lastSave = packet.save
                this.lastSaveSequence = packet.acknowledgedSequence
                return
            case 'fatalServerError':
                throw new Error(`${packet.code}: ${packet.message}`)
            case 'sessionStopped': return
        }
    }
}
