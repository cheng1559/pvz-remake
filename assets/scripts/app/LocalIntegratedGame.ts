import { IntegratedGameClient } from '@/client/game/IntegratedGameClient'
import { IntegratedGameHost } from '@/server/IntegratedGameHost'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { GameplaySystemMods } from '@/server/GameplaySystemMods'
import { LocalGameChannel } from '@/shared/channel/index'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { GameCommand, JsonValue, StartSessionPacket } from '@/shared/protocol/index'
import type { LevelPresentationSnapshot } from '@/client/level/LevelPresentationSnapshot'
import type { DebugCliResult } from '@/shared/debug/DebugCli'

export class LocalIntegratedGame {
    private readonly channel = new LocalGameChannel()
    private readonly host: IntegratedGameHost
    private readonly client = new IntegratedGameClient(this.channel)

    constructor(
        readonly definitions: GameplayDefinitions,
        levels: GameplayLevels,
        systemMods = new GameplaySystemMods(),
        debugEnabled = false,
    ) {
        this.host = new IntegratedGameHost(new IntegratedGameServer(definitions, levels, systemMods), this.channel, debugEnabled)
    }

    start(options: Omit<StartSessionPacket, 'protocolVersion' | 'sequence' | 'type'>): void {
        this.client.start(options)
        this.update(0)
    }

    command(command: GameCommand): void {
        this.client.command(command)
    }

    requestSave(): number {
        return this.client.requestSave()
    }

    debugCommand(command: string): DebugCliResult {
        const sequence = this.client.debugCommand(command)
        this.update(0)
        for (let attempts = 0; this.client.lastDebugResult?.sequence !== sequence && attempts < 1000; attempts++) {
            if (this.client.lastRejection?.sequence === sequence) throw new Error(this.client.lastRejection.code)
            this.update(this.definitions.tickSeconds)
        }
        if (this.client.lastDebugResult?.sequence !== sequence) throw new Error('Server did not return the debug command result')
        return this.client.lastDebugResult.result
    }

    saveAtBoundary(): JsonValue {
        const sequence = this.client.requestSave()
        this.update(0)
        for (let attempts = 0; this.client.lastSaveSequence !== sequence && attempts < 1000; attempts++) {
            this.update(this.definitions.tickSeconds)
        }
        if (this.client.lastSave === undefined || this.client.lastSaveSequence !== sequence) {
            throw new Error('Server did not return a save at the requested boundary')
        }
        return this.client.lastSave
    }

    snapshotPresentation(level: LevelPresentationSnapshot) {
        return this.client.snapshot(level)
    }

    restorePresentation(value: unknown): LevelPresentationSnapshot {
        return this.client.restore(value)
    }

    update(dtSeconds: number): void {
        this.host.update(dtSeconds)
        this.client.update()
    }

    render() {
        return this.client.render(this.host.interpolationAlpha)
    }

    drainEvents() {
        return this.client.drainEvents()
    }

    drainChanges() {
        return this.client.drainChanges()
    }

    get lastRejection() {
        return this.client.lastRejection
    }

    get lastSave() {
        return this.client.lastSave
    }

    get lastSaveSequence() {
        return this.client.lastSaveSequence
    }
}
